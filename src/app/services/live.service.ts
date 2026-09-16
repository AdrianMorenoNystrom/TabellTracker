import { Injectable, inject } from '@angular/core';
import { SUPABASE } from './supabase.client';
import { LiveDraw, LiveEvent, LivePick, LivePlayer, LiveResult } from '../interfaces/live';

function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

@Injectable({ providedIn: 'root' })
export class LiveService {
  private supabase = inject(SUPABASE);
  async draws(): Promise<LiveDraw[]> {
    return checked(await this.supabase.from('live_draws').select('*').order('reg_close_time', { ascending: false })) ?? [];
  }
  async load(drawNumber: number) {
    const results = await Promise.all([
      this.supabase.from('live_events').select('*').eq('draw_number', drawNumber).order('event_number'),
      this.supabase.from('live_picks').select('*,owner:live_events(player_id)').eq('draw_number', drawNumber),
      this.supabase.from('live_results').select('*').eq('draw_number', drawNumber),
      this.supabase.from('players').select('id,name').order('name'),
    ]);
    const picks = (checked(results[1]) ?? []).map(p => ({ ...p, player_id: p.owner?.player_id ?? null })) as LivePick[];
    return { events: checked(results[0]) as LiveEvent[], picks,
      results: checked(results[2]) as LiveResult[], players: checked(results[3]) as LivePlayer[] };
  }
  async save(draw: number, event: LiveEvent, pick: string, revision: number, player: number | null = null): Promise<LivePick> {
    return checked(await this.supabase.rpc('live_save_pick', { p_draw_number: draw, p_event_number: event.event_number,
      p_pick: pick, p_match_id: event.match_id, p_revision: revision, p_player_id: player }));
  }
  subscribe(onChange: () => void, onStatus: (status: string) => void): () => void {
    const channel = this.supabase.channel(`live-coupon-${crypto.randomUUID()}`);
    for (const table of ['live_draws', 'live_events', 'live_picks', 'live_results']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
    }
    channel.subscribe(onStatus);
    return () => { void this.supabase.removeChannel(channel); };
  }
  async sync(): Promise<string> {
    const { data: session, error } = await this.supabase.auth.getSession();
    if (error) throw error;
    if (!session.session) throw new Error('Enheten behöver aktiveras');
    const { data, error: functionError } = await this.supabase.functions.invoke('stryktipset-sync', { body: {} });
    if (functionError) {
      let message = 'Kunde inte uppdatera. Kontrollera att Edge Function stryktipset-sync är driftsatt i samma Supabase-projekt.';
      if (functionError.context instanceof Response) {
        const body = await functionError.context.json().catch(() => null);
        message = body?.error ?? body?.errors?.[0] ?? message;
      }
      throw new Error(message);
    }
    if (!data?.ok) throw new Error(data?.error ?? 'Kunde inte uppdatera kupongen.');
    return data.message ?? 'Kupongen uppdaterad';
  }
  async invite(player: number): Promise<string> {
    const token = checked(await this.supabase.rpc('live_create_invite', { p_player_id: player }));
    return `${location.origin}/join/${token}`;
  }
  async rotation(): Promise<{ position: number; player_id: number }[]> {
    return checked(await this.supabase.from('live_rotation').select('*').order('position')) ?? [];
  }
  async players(): Promise<LivePlayer[]> {
    return checked(await this.supabase.from('players').select('id,name').order('name')) ?? [];
  }
  async setRotation(players: number[]) {
    checked(await this.supabase.rpc('live_configure_rotation', { p_players: players }));
  }
  async adminPicks(draw: number, player: number, picks: Omit<LivePick, 'player_id'>[]) {
    checked(await this.supabase.rpc('live_admin_picks', { p_draw_number: draw, p_player_id: player, p_picks: picks }));
  }
  async correct(draw: number, event: LiveEvent, outcome: string, reason: string): Promise<void> {
    checked(await this.supabase.rpc('live_correct_result', { p_draw_number: draw, p_event_number: event.event_number,
      p_match_id: event.match_id, p_outcome: outcome, p_reason: reason }));
  }
}
