import { Injectable } from '@angular/core';
import { from, map, Observable, switchMap, timer } from 'rxjs';
import { supabase } from './supabase.client';
import { Pick } from '../interfaces/tips';

export type PickRow = { event_number: number; pick: Pick };

export type DrawPickRow = {
  event_number: number;
  user_id: string;
  pick: Pick;
  display_name: string | null;
};

@Injectable({ providedIn: 'root' })
export class PicksService {
  getMyPicks(drawNumber: number, userId: string): Observable<PickRow[]> {
    return from(
      supabase
        .from('stryktipset_picks')
        .select('event_number,pick')
        .eq('draw_number', drawNumber)
        .eq('user_id', userId)
        .order('event_number', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as PickRow[];
      })
    );
  }

  getAllPicksForDraw(drawNumber: number): Observable<DrawPickRow[]> {
    return from(
      supabase
        .from('stryktipset_picks')
        .select('event_number,user_id,pick, profiles:profiles(display_name)')
        .eq('draw_number', drawNumber)
        .order('event_number', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;

        return (data ?? []).map((r: any) => ({
          event_number: Number(r.event_number),
          user_id: String(r.user_id),
          pick: r.pick as Pick,
          display_name: r.profiles?.display_name ?? null,
        })) as DrawPickRow[];
      })
    );
  }


  getAllPicksForDrawGrouped(drawNumber: number): Observable<Map<number, DrawPickRow[]>> {
    return this.getAllPicksForDraw(drawNumber).pipe(
      map((rows) => {
        const m = new Map<number, DrawPickRow[]>();
        for (const r of rows) {
          const key = r.event_number;
          if (!m.has(key)) m.set(key, []);
          m.get(key)!.push(r);
        }
        return m;
      })
    );
  }


lockInPicks(drawNumber: number, userId: string, picks: PickRow[]): Observable<void> {
  const payload = picks.map(p => ({
    event_number: Number(p.event_number),
    pick: p.pick,
  }));

  return from(
    supabase.rpc('lock_in_picks_block_match', {
      p_draw_number: drawNumber,
      p_user_id: userId,
      p_picks: payload,
    })
  ).pipe(
    map(({ error }) => {
      if (error) throw error;
    })
  );
}

  saveMany(drawNumber: number, userId: string, picks: { event_number: number; pick: string }[]) {
    const rows = picks.map((p) => ({
      draw_number: drawNumber,
      event_number: p.event_number,
      user_id: userId,
      pick: p.pick,
      updated_at: new Date().toISOString(),
    }));

    return from(
      supabase.from('stryktipset_picks').upsert(rows, {
        onConflict: 'draw_number,event_number,user_id',
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  deletePick(drawNumber: number, eventNumber: number, userId: string): Observable<void> {
    return from(
      supabase
        .from('stryktipset_picks')
        .delete()
        .eq('draw_number', drawNumber)
        .eq('event_number', eventNumber)
        .eq('user_id', userId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }
}
