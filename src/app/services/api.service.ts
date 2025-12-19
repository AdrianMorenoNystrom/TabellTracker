import { Injectable } from '@angular/core';
import { Observable, from, map, BehaviorSubject } from 'rxjs';
import {  SupabaseClient } from '@supabase/supabase-js';
import { Player } from '../interfaces/player';
import { Round, RoundCreate } from '../interfaces/round';
import { Article } from '../interfaces/article';
import { supabase } from './supabase.client';
@Injectable({ providedIn: 'root' })
export class ApiService {
    private supabase: SupabaseClient;
  private players$ = new BehaviorSubject<Player[]>([]);
  private rounds$ = new BehaviorSubject<Round[]>([]);
  private playersRealtimeInit = false;
  private roundsRealtimeInit = false;

  constructor() {
        this.supabase = supabase;
  }

  // --------------------
  // PLAYERS
  // --------------------

  getPlayers(): Observable<Player[]> {
    return from(
      this.supabase
        .from('player_stats')
        .select('id, name, score, total_matches, rounds_played, avg_score_per_round')
        .order('score', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as Player[];
      })
    );
  }

  watchPlayers(): Observable<Player[]> {
    if (!this.playersRealtimeInit) {
      this.playersRealtimeInit = true;

      this.getPlayers().subscribe(list => this.players$.next(list));

      this.supabase
        .channel('realtime-players')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
          this.getPlayers().subscribe(list => this.players$.next(list));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'round_players' }, () => {
          this.getPlayers().subscribe(list => this.players$.next(list));
        })
        .subscribe();
    }

    return this.players$.asObservable();
  }

  addPlayer(player: { name: string; score: number }): Observable<{ ok: boolean }> {
    return from(
      this.supabase
        .from('players')
        .upsert({ name: player.name }, { onConflict: 'name' })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return { ok: true };
      })
    );
  }

  deletePlayer(id: number): Observable<{ ok: boolean }> {
    return from(
      this.supabase.from('players').delete().eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return { ok: true };
      })
    );
  }

  // --------------------
  // ROUNDS
  // --------------------

  getRounds(): Observable<Round[]> {
    return from(
      this.supabase
        .from('rounds')
        .select(`
          id, roundnumber, week, totalscore,
          round_players (
            score,
            matches_picked,
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
          players: (r.round_players || []).map((rp: any) => ({
            id: rp.player?.id,
            name: rp.player?.name,
            score: rp.score,
            matchesPicked: rp.matches_picked,
          })),
        })) as Round[];
      })
    );
  }

  watchRounds(): Observable<Round[]> {
    if (!this.roundsRealtimeInit) {
      this.roundsRealtimeInit = true;

      this.getRounds().subscribe(list => this.rounds$.next(list));

      this.supabase
        .channel('realtime-rounds')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, () => {
          this.getRounds().subscribe(list => this.rounds$.next(list));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'round_players' }, () => {
          this.getRounds().subscribe(list => this.rounds$.next(list));
        })
        .subscribe();
    }

    return this.rounds$.asObservable();
  }

  addRound(round: RoundCreate): Observable<{ ok: boolean; id: number; totalScore: number }> {
    return from(this.addRoundSupabase(round));
  }

  deleteRoundById(id: number): Observable<{ ok: boolean }> {
    return from(
      this.supabase.from('rounds').delete().eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return { ok: true };
      })
    );
  }

  // --------------------
  // ARTICLES
  // --------------------

  getArticles(): Observable<Article[]> {
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

  getArticleById(id: number): Observable<Article> {
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

  addArticle(input: { title: string; content: string }): Observable<number> {
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

  deleteArticle(id: number): Observable<{ ok: boolean }> {
    return from(
      this.supabase.from('articles').delete().eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return { ok: true };
      })
    );
  }

  // --------------------
  // INTERNAL HELPERS
  // --------------------

  private async addRoundSupabase(
    round: RoundCreate
  ): Promise<{ ok: boolean; id: number; totalScore: number }> {
    const uniqueNames = Array.from(new Set(round.players.map(p => p.name)));

    const upsertRes = await this.supabase
      .from('players')
      .upsert(uniqueNames.map(name => ({ name })), { onConflict: 'name' })
      .select('id,name');

    if (upsertRes.error) throw upsertRes.error;

    const nameToId = new Map(
      (upsertRes.data || []).map((p: any) => [p.name, p.id])
    );

    const roundRes = await this.supabase
      .from('rounds')
      .insert({ roundnumber: round.roundNumber, week: round.week })
      .select('id')
      .single();

    if (roundRes.error) throw roundRes.error;

    const roundId = roundRes.data.id;

    const rpPayload = round.players.map(p => ({
      round_id: roundId,
      player_id: nameToId.get(p.name),
      score: p.score || 0,
      matches_picked: p.matchesPicked ?? 3,
    }));

    const rpRes = await this.supabase.from('round_players').insert(rpPayload);
    if (rpRes.error) throw rpRes.error;

    const totRes = await this.supabase
      .from('rounds')
      .select('totalscore')
      .eq('id', roundId)
      .single();

    const totalScore =
      totRes.data?.totalscore ??
      round.players.reduce((sum, p) => sum + (p.score || 0), 0);

    return { ok: true, id: roundId, totalScore };
  }
}
