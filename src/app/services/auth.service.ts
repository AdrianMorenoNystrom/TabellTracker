import { Injectable } from '@angular/core';
import { BehaviorSubject, from, map, Observable } from 'rxjs';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase.client';

type ProfileRow = {
  display_name: string | null;
  role: 'user' | 'admin' | null;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase: SupabaseClient;

  private ready$ = new BehaviorSubject<boolean>(false);
  private isAdmin$ = new BehaviorSubject<boolean>(false);
  private loggedIn$ = new BehaviorSubject<boolean>(false);
  private userId$ = new BehaviorSubject<string | null>(null);
  private displayName$ = new BehaviorSubject<string | null>(null);

  constructor() {
    this.supabase = supabase;

    // 1) Initial session
    this.supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      this.applyUser(user).finally(() => this.ready$.next(true));
    });

    // 2) Auth changes
    this.supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      // vi vet auth-läget efter första event också
      this.applyUser(user).finally(() => this.ready$.next(true));
    });
  }

  // --- Public streams ---
  isReady$(): Observable<boolean> {
    return this.ready$.asObservable();
  }
  isReadySnapshot(): boolean {
    return this.ready$.value;
  }

  isUserAdmin$(): Observable<boolean> {
    return this.isAdmin$.asObservable();
  }
  isUserAdminSnapshot(): boolean {
    return this.isAdmin$.value;
  }

  isLoggedIn$(): Observable<boolean> {
    return this.loggedIn$.asObservable();
  }
  isLoggedInSnapshot(): boolean {
    return this.loggedIn$.value;
  }

  getUserId$(): Observable<string | null> {
    return this.userId$.asObservable();
  }
  getUserIdSnapshot(): string | null {
    return this.userId$.value;
  }

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

  // --- Internal: set state from user ---
  private async applyUser(user: { id: string } | null): Promise<void> {
    this.loggedIn$.next(!!user);
    this.userId$.next(user?.id ?? null);

    if (!user) {
      this.displayName$.next(null);
      this.isAdmin$.next(false);
      return;
    }

    // Läs både display_name och role i ett svep
    const { data, error } = await this.supabase
      .from('profiles')
      .select('display_name, role')
      .eq('id', user.id)
      .maybeSingle<ProfileRow>();

    if (error) {
      console.error('Failed to load profile', error);
      this.displayName$.next(null);
      this.isAdmin$.next(false);
      return;
    }

    this.displayName$.next(data?.display_name ?? null);
    this.isAdmin$.next((data?.role ?? 'user') === 'admin');
  }
}
