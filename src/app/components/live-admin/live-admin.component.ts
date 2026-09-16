import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LiveService } from '../../services/live.service';
import { LivePlayer } from '../../interfaces/live';
import { avatarColor } from '../../utils/avatar-color';

@Component({
  standalone: true, selector: 'app-live-admin', imports: [RouterLink],
  template: `<main><h1>Administrera ligan</h1>
    @if (!auth.isUserAdminSnapshot()) { <p>Endast ligans admin kan ändra inställningarna.</p> }
    @else {
      @if (error) { <p class="error" role="alert">{{ error }}</p> }
      <p aria-live="polite">{{ message }}</p>
      <section><h2>Kupongen</h2><button [disabled]="busy" (click)="refreshCoupon()">Hämta kupong och resultat</button> <a routerLink="/">Visa kupongen</a></section>
      <section><h2>Personliga inbjudningar</h2><p>En länk kan användas en gång och gäller i sju dagar. Aktivering på en ny enhet ersätter spelarens tidigare enhet.</p>
        @for (player of players; track player.id) { <button [disabled]="busy" (click)="invite(player.id)">{{ player.name }} · skapa inbjudan</button> }
        @if (inviteUrl) { <label>Personlig länk <input readonly [value]="inviteUrl" (click)="$any($event.target).select()"></label><button (click)="copy()">Kopiera länken</button> }
      </section>
      <section><h2>Ordning för fyraläggaren</h2>
        <ol class="rotation" aria-label="Spelarordning">
          @for (id of order; track id; let i = $index) {
            <li [style.--player-color]="playerColor(id)">
              <span class="position" aria-hidden="true">{{ i + 1 }}</span>
              <strong>{{ playerName(id) }}</strong>
              <div class="move-buttons">
                <button type="button" [disabled]="busy || i === 0" (click)="movePlayer(i,-1)"
                  [attr.aria-label]="'Flytta upp ' + playerName(id)" title="Flytta upp">↑</button>
                <button type="button" [disabled]="busy || i === order.length - 1" (click)="movePlayer(i,1)"
                  [attr.aria-label]="'Flytta ned ' + playerName(id)" title="Flytta ned">↓</button>
              </div>
            </li>
          }
        </ol>
        <p class="rotation-note">Snurran fortsätter efter senaste fyraläggaren. Ändringar gäller kommande kuponger.</p>
        <div class="rotation-actions">
          <button [disabled]="busy || !orderChanged" (click)="saveOrder()">Spara ordningen</button>
          @if (orderChanged) { <button class="secondary" [disabled]="busy" (click)="resetOrder()">Återställ</button> }
        </div>
        <span class="rotation-status" role="status">{{ orderChanged ? 'Osparade ändringar' : '' }}</span>
      </section>
    }
  </main>`,
  styles: [`main{max-width:650px;margin:24px auto;padding:16px;color:#18253e}section{border:1px solid #dce2ec;border-radius:12px;padding:20px;margin:20px 0}h2{font-size:1.2rem}p{line-height:1.5}label{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:10px 0}input{font:inherit;padding:10px;border:1px solid #acb8ce;border-radius:6px;min-width:160px;max-width:75%;flex:1}button{font:inherit;min-height:44px;margin:4px;padding:8px 12px;background:#263b70;border:0;border-radius:7px;color:white;cursor:pointer}button:disabled{opacity:.45;cursor:default}.error{color:#9b2525}
    .rotation{list-style:none;padding:0;margin:20px 0;display:grid;gap:8px}
    .rotation li{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #dce2ec;border-left:4px solid var(--player-color);border-radius:9px;background:#f8f9fc}
    .position{color:#69788e;font-size:.85rem;min-width:16px}
    .rotation strong{flex:1;min-width:0;overflow-wrap:anywhere}
    .move-buttons{display:flex;gap:4px}
    .move-buttons button{margin:0;min-width:44px;background:white;border:1px solid #c5cfdf;color:#263b70;font-size:1.2rem}
    .rotation-note,.rotation-status{font-size:.85rem;color:#61708a}
    .rotation-actions{display:flex;flex-wrap:wrap;gap:8px}
    .rotation-actions button{margin:0}
    .secondary{background:white;color:#263b70;border:1px solid #c5cfdf}
    .rotation-status{display:block;min-height:20px;margin-top:10px}
    button:focus-visible{outline:3px solid #b57600;outline-offset:3px}
    @media(max-width:400px){section{padding:14px}.rotation li{gap:8px;padding:8px}}
  `],
})
export class LiveAdminComponent implements OnInit {
  readonly auth = inject(AuthService);
  private service = inject(LiveService);
  players: LivePlayer[] = [];
  order: number[] = [];
  private savedOrder: number[] = [];
  inviteUrl = ''; message = ''; error = ''; busy = false;
  async ngOnInit() {
    if (!this.auth.isUserAdminSnapshot()) return;
    await this.run(async () => {
      const [players, rotation] = await Promise.all([this.service.players(), this.service.rotation()]);
      this.players = players.filter(p => rotation.some(r => r.player_id === p.id));
      this.order = rotation.map(r => r.player_id);
      this.savedOrder = [...this.order];
    });
  }
  async run(action: () => Promise<void>) {
    this.error = ''; this.message = ''; this.busy = true;
    try { await action(); } catch (error) { this.error = (error as Error).message; }
    finally { this.busy = false; }
  }
  invite(id: number) { return this.run(async () => { this.inviteUrl = ''; this.inviteUrl = await this.service.invite(id); }); }
  refreshCoupon() { return this.run(async () => { this.message = await this.service.sync(); }); }
  copy() { return this.run(async () => { await navigator.clipboard.writeText(this.inviteUrl); this.message = 'Länken kopierad'; }); }
  playerName(id: number) { return this.players.find(p => p.id === id)?.name ?? ''; }
  playerColor(id: number) { return avatarColor(this.playerName(id)); }
  get orderChanged() { return this.order.some((id,i) => id !== this.savedOrder[i]); }
  movePlayer(index: number, direction: number) {
    const next = index + direction;
    if (this.busy || index < 0 || index >= this.order.length || next < 0 || next >= this.order.length) return;
    const order = [...this.order];
    [order[index], order[next]] = [order[next], order[index]];
    this.order = order; this.message = ''; this.error = '';
  }
  resetOrder() { if (!this.busy) { this.order = [...this.savedOrder]; this.error = ''; this.message = ''; } }
  saveOrder() {
    if (this.busy || !this.orderChanged) return;
    return this.run(async () => {
      await this.service.setRotation(this.order);
      this.savedOrder = [...this.order]; this.message = 'Ordningen sparad';
    });
  }
}
