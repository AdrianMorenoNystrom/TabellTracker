import { Injectable, inject, DestroyRef } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SUPABASE } from './supabase.client';

export interface LeagueIdentity { player_id: number; name: string; is_admin: boolean; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SUPABASE);
  private ready = new BehaviorSubject(false);
  private admin = new BehaviorSubject(false);
  private member = new BehaviorSubject(false);
  private uid = new BehaviorSubject<string | null>(null);
  private name = new BehaviorSubject<string | null>(null);
  identity: LeagueIdentity | null = null;
  private generation = 0;
  private latestRefresh: Promise<void> | null = null;

  constructor() {
    const destroy = inject(DestroyRef);
    void this.refresh();
    // Do not await other Supabase calls within the auth callback (auth lock).
    const { data } = this.supabase.auth.onAuthStateChange(() => { setTimeout(() => void this.refresh(), 0); });
    destroy.onDestroy(() => { this.generation++; data.subscription.unsubscribe(); });
    if (typeof window !== 'undefined') {
      const interval = window.setInterval(() => void this.refresh(), 30000);
      const focus = () => void this.refresh();
      window.addEventListener('focus', focus);
      destroy.onDestroy(() => { clearInterval(interval); window.removeEventListener('focus', focus); });
    }
  }
  isReady$(): Observable<boolean> { return this.ready.asObservable(); }
  isReadySnapshot() { return this.ready.value; }
  isUserAdmin$() { return this.admin.asObservable(); }
  isUserAdminSnapshot() { return this.admin.value; }
  isLoggedIn$() { return this.member.asObservable(); }
  isLoggedInSnapshot() { return this.member.value; }
  getUserId$() { return this.uid.asObservable(); }
  getUserIdSnapshot() { return this.uid.value; }
  getDisplayName$() { return this.name.asObservable(); }
  getDisplayNameSnapshot() { return this.name.value; }

  async refresh(): Promise<void> {
    let pending = this.readIdentity(++this.generation);
    this.latestRefresh = pending;
    await pending;
    // A sign-in event can start another refresh while login awaits this one.
    // Wait for that newer identity before deciding whether login succeeded.
    while (this.latestRefresh !== pending) {
      pending = this.latestRefresh!;
      await pending;
    }
  }

  private async readIdentity(generation: number): Promise<void> {
    try {
      const { data: session, error: sessionError } = await this.supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const user = session.session?.user;
      const result = user ? await this.supabase.rpc('live_identity') : { data: null, error: null };
      if (result.error) throw result.error;
      if (generation !== this.generation) return;
      this.identity = result.data as LeagueIdentity | null;
      this.uid.next(user?.id ?? null);
      this.name.next(this.identity?.name ?? null);
      this.admin.next(this.identity?.is_admin ?? false);
      this.member.next(!!this.identity);
    } catch {
      if (generation !== this.generation) return;
      this.identity = null;
      this.admin.next(false);
      this.name.next(null);
      this.member.next(false);
    } finally { if (generation === this.generation) this.ready.next(true); }
  }

  async redeem(token: string): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    if (!data.session) {
      const { error } = await this.supabase.auth.signInAnonymously();
      if (error) throw error;
    }
    const { error } = await this.supabase.rpc('live_redeem_invite', { p_token: token });
    if (error) throw error;
    await this.refresh();
    if (!this.identity) throw new Error('Kunde inte läsa medlemskapet. Försök ladda om sidan.');
  }
  async loginAdmin(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error('Kunde inte logga in. Kontrollera e-post och lösenord.');
    await this.refresh();
    if (!this.isUserAdminSnapshot()) {
      await this.logout();
      throw new Error('Kontot saknar adminbehörighet i den här ligan. Koppla kontot till din spelare i Supabase först.');
    }
  }
  async logout(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
    await this.refresh();
  }
}
