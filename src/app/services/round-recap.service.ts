import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { combineLatest, filter, startWith } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SUPABASE } from './supabase.client';
import { AuthService } from './auth.service';
import { Round } from '../interfaces/round';
import { buildRoundRecap, RoundRecap } from '../utils/round-recap';

@Injectable({ providedIn: 'root' })
export class RoundRecapService {
  private client = inject(SUPABASE);
  private auth = inject(AuthService);
  private router = inject(Router);
  private destroy = inject(DestroyRef);
  private started = false;
  private identity: string | null = null;
  private generation = 0;
  private checking = false;
  readonly active = signal<RoundRecap | null>(null);
  readonly saving = signal(false);
  readonly error = signal('');

  start() {
    if (this.started) return;
    this.started = true;
    combineLatest([this.auth.isReady$(), this.auth.isLoggedIn$(), this.auth.getUserId$(),
      this.router.events.pipe(filter(event => event instanceof NavigationEnd), startWith(null)),
    ]).pipe(takeUntilDestroyed(this.destroy)).subscribe(([ready, loggedIn, uid]) => {
      const key = ready && loggedIn && this.auth.identity ? `${uid}:${this.auth.identity.player_id}` : null;
      if (key !== this.identity) {
        this.identity = key; this.generation++; this.checking = false; this.checked = null;
        this.active.set(null); this.saving.set(false); this.error.set('');
        if (key && this.allowedRoute()) void this.check();
      } else if (key && !this.checked && this.allowedRoute()) void this.check();
    });
    const foreground = () => {
      if (document.visibilityState === 'visible') void this.check();
    };
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    this.destroy.onDestroy(() => {
      this.generation++;
      window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    });
  }

  private checked: string | null = null;
  private allowedRoute() {
    return this.router.navigated && !/^\/(join|admin\/login)([/?#]|$)/.test(this.router.url);
  }

  async check() {
    if (!this.identity || !this.allowedRoute() || this.active() || this.checking) return;
    const generation = this.generation;
    this.checking = true;
    this.checked = this.identity;
    try {
      const { data, error } = await this.client.rpc('round_recap_pending');
      if (error) throw error;
      if (generation !== this.generation || !this.allowedRoute() || !data) return;
      const payload = data as { round_id: number; rounds: Round[] };
      this.active.set(buildRoundRecap(payload.rounds, payload.round_id));
    } catch {
      // Missing migration/network failure must not lock users out of the app.
      // Retry on the next foreground/open, never acknowledge a failed read.
    } finally { if (generation === this.generation) this.checking = false; }
  }

  async dismiss() {
    const recap = this.active();
    if (!recap || this.saving()) return;
    const generation = this.generation;
    this.saving.set(true); this.error.set('');
    try {
      const { error } = await this.client.rpc('round_recap_acknowledge', { p_round_id: recap.round.id });
      if (error) throw error;
      if (generation === this.generation) this.active.set(null);
    } catch {
      if (generation === this.generation) this.error.set('Kunde inte spara att du sett omgången. Försök stänga igen.');
    } finally { if (generation === this.generation) this.saving.set(false); }
  }
}
