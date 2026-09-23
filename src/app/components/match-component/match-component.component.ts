import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { LiveService } from '../../services/live.service';
import { RoundRecapService } from '../../services/round-recap.service';
import { LiveDraw, LiveEvent, LivePick, LivePlayer, LiveResult } from '../../interfaces/live';
import { avatarColor } from '../../utils/avatar-color';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { CouponOverviewComponent, CouponOverviewData } from '../coupon-overview/coupon-overview.component';
import { PlayerColorsComponent } from '../player-colors/player-colors.component';
import { CouponSettledComponent } from '../coupon-settled/coupon-settled.component';

@Component({
  standalone: true, selector: 'app-match-component',
  imports: [CommonModule, FormsModule, CouponSettledComponent],
  templateUrl: './match-component.component.html',
  styleUrl: './match-component.component.scss',
})
export class MatchComponentComponent implements OnInit {
  readonly auth = inject(AuthService);
  private service = inject(LiveService);
  private recap = inject(RoundRecapService);
  recapLoading = false;
  private destroy = inject(DestroyRef);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private overview?: MatDialogRef<CouponOverviewComponent>;
  private colorsDialog?: MatDialogRef<PlayerColorsComponent>;
  readonly signs = ['1', 'X', '2'];
  draws: LiveDraw[] = [];
  draw: LiveDraw | null = null;
  selected: number | null = null;
  events: LiveEvent[] = [];
  players: LivePlayer[] = [];
  picks = new Map<number, LivePick>();
  results = new Map<number, LiveResult>();
  optimistic = new Map<number, string>();
  optimisticPlayers = new Map<number, number | null>();
  drafts = new Map<number, { pick: string; player: number; match: string; revision: number }>();
  pending = new Map<number, number>();
  loading = true;
  error = '';
  notice = '';
  connection = 'Ansluter…';
  now = Date.now();
  refreshing = false;
  refreshAfter = 0;
  adminMode = false;
  adminPlayer: number | null = null;
  correctingPlayer: number | null = null;
  correction: Record<number, string> = {};
  correctionRevisions: Record<number, number> = {};
  correctingResult: number | null = null;
  resultSign = '1';
  resultReason = '';
  private queue = Promise.resolve();
  private saveEpoch = 0;
  private loadGeneration = 0;
  private disposed = false;
  private followLatest = true;
  private reloadTimer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    void this.reload();
    const unsubscribe = this.service.subscribe(() => this.scheduleReload(), status => {
      this.connection = status === 'SUBSCRIBED' ? 'Live' : 'Återansluter · uppdateras automatiskt';
      if (status === 'SUBSCRIBED') this.scheduleReload();
    });
    const clock = setInterval(() => {
      this.now = Date.now();
      if (this.locked && this.drafts.size && !(this.adminMode && this.auth.isUserAdminSnapshot())) {
        this.drafts.clear(); this.error = 'Spelstopp. Ofärdiga teckenval sparades inte. Dina tidigare sparade tips visas.';
      }
    }, 1000);
    const fallback = setInterval(() => void this.reload(), 15000);
    const focus = () => { void this.auth.refresh(); void this.reload(); };
    const unload = (event: BeforeUnloadEvent) => { if (this.saving || this.drafts.size) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('focus', focus);
    window.addEventListener('beforeunload', unload);
    this.auth.isLoggedIn$().pipe(takeUntilDestroyed(this.destroy)).subscribe(member => {
      if (!member) {
        this.overview?.close();
        this.colorsDialog?.close();
        this.events = []; this.picks.clear(); this.results.clear(); this.optimistic.clear(); this.optimisticPlayers.clear(); this.drafts.clear();
        this.saveEpoch++; this.loadGeneration++;
        void this.router.navigateByUrl('/join');
      }
    });
    this.destroy.onDestroy(() => {
      this.overview?.close();
      this.colorsDialog?.close();
      this.disposed = true; this.loadGeneration++;
      unsubscribe(); clearInterval(clock); clearInterval(fallback); clearTimeout(this.reloadTimer);
      window.removeEventListener('focus', focus); window.removeEventListener('beforeunload', unload);
    });
  }
  scheduleReload() {
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => void this.reload(), 120);
  }
  async reload() {
    const generation = ++this.loadGeneration;
    try {
      const draws = await this.service.draws();
      if (this.disposed || generation !== this.loadGeneration || !this.auth.isLoggedInSnapshot()) return;
      this.draws = draws;
      if (this.selected === null) {
        const future = draws.filter(d => Date.parse(d.reg_close_time) > Date.now())
          .sort((a,b) => Date.parse(a.reg_close_time) - Date.parse(b.reg_close_time));
        this.selected = (future.find(d => d.status === 'open') ?? future[0] ?? draws[0])?.draw_number ?? null;
      }
      this.draw = draws.find(d => d.draw_number === this.selected) ?? null;
      const next = this.nextDraw;
      if (this.followLatest && next?.status === 'open' && Date.parse(next.reg_close_time) > Date.now()
        && !this.saving && !this.drafts.size && this.correctingPlayer === null && this.correctingResult === null) {
        this.clearSelection();
        this.selected = next.draw_number; this.draw = next;
        this.notice = `Omgång ${next.round_number} är öppen`;
      }
      if (!this.draw) { this.events = []; return; }
      const data = await this.service.load(this.draw.draw_number);
      if (this.disposed || generation !== this.loadGeneration || !this.auth.isLoggedInSnapshot()) return;
      this.events = data.events; this.players = data.players;
      // Do not let an in-flight read overwrite revisions acknowledged by the write queue.
      for (const pick of data.picks) {
        if (!this.pending.has(pick.event_number) && pick.revision >= (this.picks.get(pick.event_number)?.revision ?? 0)) {
          this.picks.set(pick.event_number, pick);
        }
      }
      for (const [number, draft] of this.drafts) {
        const event = this.events.find(e => e.event_number === number);
        if (event?.match_id !== draft.match || (!this.pending.has(number) && (this.picks.get(number)?.revision ?? 0) > draft.revision)) {
          this.drafts.delete(number);
          this.error = 'Matchen eller tipset ändrades medan du valde tecken. Senast sparade tips visas.';
        }
      }
      this.results = new Map(data.results.map(r => [r.event_number, r]));
    } catch (error) { this.error = (error as Error).message || 'Kunde inte läsa kupongen.'; }
    finally { if (generation === this.loadGeneration) this.loading = false; }
  }
  async selectDraw() {
    // Explicit historical selection should remain inspectable while the live view advances.
    this.followLatest = false;
    this.clearSelection();
    await this.reload();
  }
  private clearSelection() {
    this.picks.clear(); this.optimistic.clear(); this.optimisticPlayers.clear(); this.drafts.clear(); this.results.clear(); this.events = [];
    this.correctingPlayer = null; this.correctingResult = null; this.error = '';
  }
  get locked() { return !!this.draw && (this.now >= Date.parse(this.draw.reg_close_time) || ['locked','settled'].includes(this.draw.status)); }
  get settled() { return this.draw?.status === 'settled'; }
  get nextDraw() {
    if (!this.draw || !this.settled) return null;
    const newer = this.draws.filter(d => Date.parse(d.reg_close_time) > Date.parse(this.draw!.reg_close_time));
    return newer.filter(d => d.status === 'open' && Date.parse(d.reg_close_time) > this.now)
      .sort((a,b) => Date.parse(a.reg_close_time) - Date.parse(b.reg_close_time))[0]
      ?? newer.sort((a,b) => Date.parse(b.reg_close_time) - Date.parse(a.reg_close_time))[0] ?? null;
  }
  async openRecap() {
    if (!this.draw?.round_id || !this.settled || this.recapLoading) return;
    this.recapLoading = true; this.error = '';
    try { await this.recap.reopen(this.draw.round_id); }
    catch { if (!this.disposed) this.error = 'Kunde inte hämta omgångens recap. Försök igen.'; }
    finally { this.recapLoading = false; }
  }
  get saving() { return this.pending.size > 0; }
  get stale() { return !!this.draw && (!!this.draw.last_error || (!this.locked && this.now > Date.parse(this.draw.next_fetch_at) + 300000)); }
  savedSelection(event: LiveEvent) { return this.optimistic.get(event.event_number) ?? (this.picks.get(event.event_number)?.match_id === event.match_id ? this.picks.get(event.event_number)?.pick : '') ?? ''; }
  pick(event: LiveEvent) { return this.drafts.get(event.event_number)?.pick ?? this.savedSelection(event); }
  owner(event: LiveEvent): number | null {
    if (this.drafts.has(event.event_number)) return this.drafts.get(event.event_number)!.player;
    if (this.optimisticPlayers.has(event.event_number)) return this.optimisticPlayers.get(event.event_number)!;
    const saved = this.picks.get(event.event_number);
    return saved?.match_id === event.match_id ? saved.player_id : event.player_id;
  }
  target(event: LiveEvent) {
    return this.owner(event) ?? (this.adminMode && this.auth.isUserAdminSnapshot() ? this.adminPlayer : null) ?? this.auth.identity?.player_id ?? null;
  }
  name(id: number | null) { return this.players.find(p => p.id === id)?.name ?? 'Ledig'; }
  playerColor(id: number | null) { return avatarColor(this.players.find(p => p.id === id)?.name ?? null); }
  status(player: number) {
    const events = this.events.filter(e => this.owner(e) === player);
    const picks = events.map(e => this.savedSelection(e));
    const halves = picks.filter(p => p.length === 2).length;
    const singles = picks.filter(p => p.length === 1).length;
    const assigned = this.draw?.four_player_id === player ? 4 : 3;
    return { assigned, picked: picks.filter(Boolean).length, halves, singles,
      selected: events.filter(e => this.pick(e)).length,
      complete: halves === 2 && singles === assigned - 2 && !events.some(e => this.drafts.has(e.event_number)) };
  }
  canEdit(event: LiveEvent) {
    if (!this.draw || !this.auth.identity) return false;
    if (this.auth.isUserAdminSnapshot() && this.adminMode) return this.draw.status !== 'settled';
    return (this.owner(event) === null || this.owner(event) === this.auth.identity.player_id) && !this.locked && this.draw.status === 'open';
  }
  rowState(player: number) {
    const s = this.status(player);
    const pending = this.events.some(e => this.owner(e) === player && this.pending.has(e.event_number));
    return pending ? 'Sparar…' : s.complete ? 'Rad klar ✓' : s.selected > 0 ? 'Påbörjad' : 'Inte lagd';
  }
  toggled(pick: string, sign: string) {
    return sign === '' ? '' : this.signs.filter(s => s === sign ? !pick.includes(s) : pick.includes(s)).join('');
  }
  disabled(event: LiveEvent, sign: string) {
    if (!this.canEdit(event) || !['', ...this.signs].includes(sign)) return true;
    const next = this.toggled(this.pick(event), sign);
    if (!next) return false;
    if (next.length > 2) return true;
    const s = this.status(this.target(event)!);
    const previous = this.savedSelection(event);
    if (!this.pick(event) && s.selected >= s.assigned) return true;
    const halfFull = s.halves - Number(previous.length === 2) >= 2;
    const singleFull = s.singles - Number(previous.length === 1) >= s.assigned - 2;
    return next.length === 2 ? halfFull : singleFull && halfFull;
  }
  toggle(event: LiveEvent, sign: string) {
    if (this.disabled(event, sign) || !this.draw) return;
    const next = this.toggled(this.pick(event), sign);
    const player = this.target(event);
    const s = this.status(player!);
    // Keep the first click local if it must become a half; never save an excess spike.
    if (next.length === 1 && s.singles - Number(this.savedSelection(event).length === 1) >= s.assigned - 2) {
      this.drafts.set(event.event_number, { pick: next, player: player!, match: event.match_id,
        revision: this.picks.get(event.event_number)?.revision ?? 0 });
      this.error = ''; this.notice = '';
      return;
    }
    const wasDraft = this.drafts.delete(event.event_number);
    if (wasDraft && !next && !this.savedSelection(event) && !this.pending.has(event.event_number)) return;
    const drawNumber = this.draw.draw_number;
    const epoch = this.saveEpoch;
    this.error = ''; this.notice = '';
    this.optimistic.set(event.event_number, next);
    this.optimisticPlayers.set(event.event_number, next ? player : null);
    this.pending.set(event.event_number, (this.pending.get(event.event_number) ?? 0) + 1);
    this.queue = this.queue.then(async () => {
      if (epoch !== this.saveEpoch) return;
      const saved = await this.service.save(drawNumber, event, next, this.picks.get(event.event_number)?.revision ?? 0, player);
      this.picks.set(event.event_number, saved);
      const draft = this.drafts.get(event.event_number);
      if (draft) draft.revision = saved.revision;
    }).catch(error => {
      this.saveEpoch++;
      this.drafts.clear();
      this.error = 'Tipset sparades inte: ' + ((error as Error).message || 'Kontrollera anslutningen och försök igen.');
    }).finally(() => {
      const remaining = (this.pending.get(event.event_number) ?? 1) - 1;
      if (remaining > 0) this.pending.set(event.event_number, remaining);
      else { this.pending.delete(event.event_number); this.optimistic.delete(event.event_number); this.optimisticPlayers.delete(event.event_number); }
      if (!this.saving) { this.notice = this.error ? '' : 'Sparat'; this.scheduleReload(); }
    });
  }
  async refresh() {
    if (this.refreshing || this.now < this.refreshAfter) return;
    this.refreshing = true; this.error = ''; this.refreshAfter = Date.now() + 60000;
    try { this.notice = await this.service.sync(); await this.reload(); }
    catch (error) { this.error = (error as Error).message; }
    finally { this.refreshing = false; }
  }
  openOverview() {
    if (this.loading || !this.draw || this.events.length !== 13 || this.saving || this.drafts.size || this.overview) return;
    const data: CouponOverviewData = {
      round: this.draw.round_number,
      capturedAt: this.time(new Date().toISOString()),
      closesAt: this.time(this.draw.reg_close_time),
      players: this.players.map(player => ({ name: player.name, color: this.playerColor(player.id) })),
      rows: [...this.events].sort((a, b) => a.event_number - b.event_number).map(event => {
        const saved = this.picks.get(event.event_number);
        const pick = saved?.match_id === event.match_id ? saved.pick : '';
        const owner = saved?.match_id === event.match_id ? saved.player_id : event.player_id;
        return { number: event.event_number, home: event.home_team, away: event.away_team, pick,
          owner: this.name(owner), color: owner === null ? 'transparent' : this.playerColor(owner) };
      }),
    };
    this.overview = this.dialog.open(CouponOverviewComponent, {
      data, width: '560px', maxWidth: '100vw', maxHeight: '100dvh',
      panelClass: 'coupon-overview-dialog', ariaLabelledBy: 'coupon-overview-title',
      autoFocus: 'button', restoreFocus: true,
    });
    this.overview.afterClosed().pipe(takeUntilDestroyed(this.destroy)).subscribe(() => { this.overview = undefined; });
  }
  openColors() {
    if (!this.players.length || this.colorsDialog) return;
    this.colorsDialog = this.dialog.open(PlayerColorsComponent, {
      data: this.players.map(player => ({ ...player })),
      width: '400px', maxWidth: 'calc(100vw - 16px)', maxHeight: '100dvh',
      panelClass: 'player-colors-dialog', ariaLabelledBy: 'player-colors-title',
      autoFocus: 'button', restoreFocus: true,
    });
    this.colorsDialog.afterClosed().pipe(takeUntilDestroyed(this.destroy)).subscribe(() => { this.colorsDialog = undefined; });
  }
  get marketUpdates() {
    const latest = (field: 'odds' | 'crowd') => {
      const timestamps = this.events
        .filter(event => event[field] !== null)
        .map(event => Date.parse(event[`${field}_retrieved_at`] ?? ''))
        .filter(Number.isFinite);
      return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
    };
    const odds = latest('odds');
    const crowd = latest('crowd');
    return odds === crowd
      ? [{ label: 'Odds & Svenska folket', at: odds }]
      : [{ label: 'Odds', at: odds }, { label: 'Svenska folket', at: crowd }];
  }
  time(value: string | null) {
    return value ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Tid saknas';
  }
  outcome(event: LiveEvent) {
    const result = this.results.get(event.event_number);
    return result?.match_id === event.match_id ? result : undefined;
  }
  correct(event: LiveEvent) {
    const result = this.outcome(event);
    return result ? this.pick(event).includes(result.outcome) : null;
  }
  beginCorrection(player: number) {
    this.correctingPlayer = player; this.correction = {}; this.correctionRevisions = {};
    for (const event of this.events.filter(e => this.owner(e) === player)) {
      this.correction[event.event_number] = this.pick(event);
      this.correctionRevisions[event.event_number] = this.picks.get(event.event_number)?.revision ?? 0;
    }
  }
  toggleCorrection(number: number, sign: string) {
    const next = this.toggled(this.correction[number] ?? '', sign);
    if (next.length <= 2) this.correction[number] = next;
  }
  async saveCorrection() {
    if (!this.draw || !this.correctingPlayer) return;
    try {
      await this.service.adminPicks(this.draw.draw_number, this.correctingPlayer,
        this.events.filter(e => this.owner(e) === this.correctingPlayer).map(e => ({
          event_number: e.event_number, match_id: e.match_id, pick: this.correction[e.event_number],
          revision: this.correctionRevisions[e.event_number],
        })));
      this.correctingPlayer = null; this.notice = 'Korrigeringen sparad och rättningen uppdaterad'; await this.reload();
    } catch (error) { this.error = (error as Error).message; }
  }
  async saveResult() {
    const event = this.events.find(e => e.event_number === this.correctingResult);
    if (!event || !this.draw) return;
    try {
      await this.service.correct(this.draw.draw_number, event, this.resultSign, this.resultReason);
      this.correctingResult = null; this.resultReason = ''; await this.reload();
    } catch (error) { this.error = (error as Error).message; }
  }
}


