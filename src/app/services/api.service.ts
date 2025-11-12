import { Injectable } from '@angular/core';
import { Observable, from, map, BehaviorSubject, switchMap, of } from 'rxjs';
import { Player } from '../interfaces/player';
import { Round, RoundCreate } from '../interfaces/round';
import { environment } from '../../environments/environment';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Article } from '../interfaces/article';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private supabase: SupabaseClient;
  private loggedIn$ = new BehaviorSubject<boolean>(false);
  private players$ = new BehaviorSubject<Player[]>([]);
  private rounds$ = new BehaviorSubject<Round[]>([]);
  private playersRealtimeInit = false;
  private roundsRealtimeInit = false;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    // Initialize auth state
    this.supabase.auth.getSession().then(({ data }) => this.loggedIn$.next(!!data.session));
    this.supabase.auth.onAuthStateChange((_event, session) => this.loggedIn$.next(!!session));
  }

  // Players
getPlayers(): Observable<Player[]> {
  return from(
    this.supabase
      .from('player_stats')
      .select('id, name, score, total_matches, rounds_played, avg_score_per_round')
      .order('score', { ascending: false })
  ).pipe(
    map(({ data, error }) => {
      if (error) throw error;
      // Supabase datan matchar Player-interfacet direkt
      return (data || []) as Player[];
    })
  );
}

  // Realtime: live stream of leaderboard (players with totals)
  watchPlayers(): Observable<Player[]> {
    if (!this.playersRealtimeInit) {
      this.playersRealtimeInit = true;
      // Initial load
      this.getPlayers().subscribe((list) => this.players$.next(list));
      // Listen to both players and round_players because totals depend on scores
      const ch = this.supabase
        .channel('realtime-players')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
          this.getPlayers().subscribe((list) => this.players$.next(list));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'round_players' }, () => {
          this.getPlayers().subscribe((list) => this.players$.next(list));
        });
      ch.subscribe();
    }
    return this.players$.asObservable();
  }

  addPlayer(player: { name: string; score?: number }): Observable<{ ok: boolean }>{
    return from(
      this.supabase.from('players').upsert({ name: player.name }, { onConflict: 'name' })
    ).pipe(map(({ error }) => { if (error) throw error; return { ok: true }; }));
  }
  deletePlayer(id: number): Observable<{ ok: boolean; deleted: number }>{
    return from(this.supabase.from('players').delete().eq('id', id))
      .pipe(map(({ error, count }) => { if (error) throw error; return { ok: true, deleted: 1 }; }));
  }

  // Rounds
  getRounds(): Observable<Round[]> {
    return from(
      this.supabase
        .from('rounds')
        .select(`
          id, roundnumber, week, totalscore,
          round_players (
            score,
            player:players ( id, name )
          )
        `)
        .order('id', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r: any) => ({
          id: r.id,
          roundNumber: r.roundnumber,
          week: r.week,
          totalScore: r.totalscore,
          players: (r.round_players || []).map((rp: any) => ({ id: rp.player?.id, name: rp.player?.name, score: rp.score }))
        })) as Round[];
      })
    );
  }

  // Realtime: live stream of rounds with nested players
  watchRounds(): Observable<Round[]> {
    if (!this.roundsRealtimeInit) {
      this.roundsRealtimeInit = true;
      // Initial load
      this.getRounds().subscribe((list) => this.rounds$.next(list));
      // Listen to both rounds and round_players because nested content depends on scores
      const ch = this.supabase
        .channel('realtime-rounds')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, () => {
          this.getRounds().subscribe((list) => this.rounds$.next(list));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'round_players' }, () => {
          this.getRounds().subscribe((list) => this.rounds$.next(list));
        });
      ch.subscribe();
    }
    return this.rounds$.asObservable();
  }

  addRound(round: RoundCreate): Observable<{ ok: boolean; id: number; totalScore: number }>{
    return from(this.addRoundSupabase(round));
  }

  // legacy method removed (was HTTP delete by roundNumber/week)

  deleteRoundById(id: number): Observable<{ ok: boolean; deleted: number }>{
    return from(this.supabase.from('rounds').delete().eq('id', id))
      .pipe(map(({ error }) => { if (error) throw error; return { ok: true, deleted: 1 }; }));
  }

  // Auth helpers
  login(email: string, password: string): Observable<{ token: string }>{
    return from(this.supabase.auth.signInWithPassword({ email, password })).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return { token: data.session?.access_token || '' };
      })
    );
  }

  logout() {
    this.supabase.auth.signOut();
  }

  isLoggedIn(): boolean {
    return this.loggedIn$.value;
  }

  // Helpers
  private async addRoundSupabase(round: RoundCreate): Promise<{ ok: boolean; id: number; totalScore: number }>{
    // Upsert players by name
    const uniqueNames = Array.from(new Set(round.players.map(p => p.name)));
    const upsertRes = await this.supabase
      .from('players')
      .upsert(uniqueNames.map(n => ({ name: n })), { onConflict: 'name' })
      .select('id,name');
    if (upsertRes.error) throw upsertRes.error;
    const nameToId = new Map((upsertRes.data || []).map((p: any) => [p.name, p.id]));

    // Create round
    const roundRes = await this.supabase
      .from('rounds')
      .insert({ roundnumber: round.roundNumber, week: round.week })
      .select('id')
      .single();
    if (roundRes.error) throw roundRes.error;
    const roundId = roundRes.data.id as number;

    // Insert scores
    const rpPayload = round.players.map(p => ({
      round_id: roundId,
      player_id: nameToId.get(p.name),
      score: p.score || 0,
    }));
    const rpRes = await this.supabase.from('round_players').insert(rpPayload);
    if (rpRes.error) throw rpRes.error;

    // Fetch recomputed total
    const totRes = await this.supabase.from('rounds').select('totalscore').eq('id', roundId).single();
    const totalScore = (totRes.data?.totalscore as number | undefined) ?? round.players.reduce((s, p) => s + (p.score || 0), 0);
    return { ok: true, id: roundId, totalScore };
  }


  getArticles() {
  return from(
    this.supabase
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false })
  ).pipe(
    map(({ data, error }) => {
      if (error) throw error;
      return (data || []) as Article[];
    })
  );
}

getArticleById(id: number) {
  return from(
    this.supabase
      .from('articles')
      .select('*')
      .eq('id', id)
      .single()
  ).pipe(
    map(({ data, error }) => {
      if (error) throw error;
      return data as Article;
    })
  );
}

addArticle(input: { title: string; content: string }) {
  return from(
    this.supabase
      .from('articles')
      .insert(input)
      .select('id')
      .single()
  ).pipe(
    map(({ data, error }) => {
      if (error) throw error;
      return data?.id as number;
    })
  );
}

deleteArticle(id: number) {
  return from(
    this.supabase
      .from('articles')
      .delete()
      .eq('id', id)
  ).pipe(
    map(({ error }) => {
      if (error) throw error;
      return { ok: true };
    })
  );
}
}
