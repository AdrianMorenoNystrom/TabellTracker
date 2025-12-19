import { Injectable } from '@angular/core';
import { BehaviorSubject, from, map, Observable } from 'rxjs';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase.client';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase: SupabaseClient;

  private ready$ = new BehaviorSubject<boolean>(false);

  private loggedIn$ = new BehaviorSubject<boolean>(false);
  private userId$ = new BehaviorSubject<string | null>(null);
  private displayName$ = new BehaviorSubject<string | null>(null);

  constructor() {
    this.supabase = supabase;

    this.supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;

      this.loggedIn$.next(!!user);
      this.userId$.next(user?.id ?? null);

      if (user) this.loadDisplayNameForUser(user.id);
      else this.displayName$.next(null);

      // ✅ markera att vi nu vet auth-läget
      this.ready$.next(true);
    });

    this.supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;

      this.loggedIn$.next(!!user);
      this.userId$.next(user?.id ?? null);

      if (user) this.loadDisplayNameForUser(user.id);
      else this.displayName$.next(null);
    });
  }

  // --- Ready ---
  isReady$(): Observable<boolean> {
    return this.ready$.asObservable();
  }

  isReadySnapshot(): boolean {
    return this.ready$.value;
  }

  // --- Logged in ---
  isLoggedIn$(): Observable<boolean> {
    return this.loggedIn$.asObservable();
  }

  isLoggedInSnapshot(): boolean {
    return this.loggedIn$.value;
  }

  // --- User id ---
  getUserId$(): Observable<string | null> {
    return this.userId$.asObservable();
  }

  getUserIdSnapshot(): string | null {
    return this.userId$.value;
  }

  // --- Display name ---
  getDisplayName$(): Observable<string | null> {
    return this.displayName$.asObservable();
  }

  getDisplayNameSnapshot(): string | null {
    return this.displayName$.value;
  }

  // --- Auth actions ---
  login(email: string, password: string): Observable<{ token: string }> {
    return from(this.supabase.auth.signInWithPassword({ email, password })).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return { token: data.session?.access_token || '' };
      })
    );
  }

  logout(): Promise<void> {
    return this.supabase.auth.signOut().then(() => {});
  }

  // --- Profile ---
  private loadDisplayNameForUser(uid: string) {
    from(
      this.supabase
        .from('profiles')
        .select('display_name')
        .eq('id', uid)
        .maybeSingle()
    ).subscribe({
      next: ({ data, error }) => {
        if (error) {
          console.error('Failed to load display name', error);
          this.displayName$.next(null);
          return;
        }
        this.displayName$.next(data?.display_name ?? null);
      },
    });
  }
}
