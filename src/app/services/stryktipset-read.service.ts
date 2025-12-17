// src/app/services/stryktipset-read.service.ts
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { from, map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { switchMap } from 'rxjs/operators'; 

@Injectable({ providedIn: 'root' })
export class StryktipsetReadService {
  private sb: SupabaseClient;

  constructor() {
    this.sb = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
  }

getLatest(): Observable<{ draw: any; events: any[] }> {
  return from(
    this.sb
      .from('stryktipset_draws')
      .select('*')
      .order('draw_number', { ascending: false })
      .limit(1)
      .maybeSingle()
  ).pipe(
    switchMap(({ data: draw, error }) => {
      if (error) throw error;
      if (!draw) throw new Error('No draw found');

      return from(
        this.sb
          .from('stryktipset_draw_events')
          .select('*')
          .eq('draw_number', draw.draw_number)
          .order('event_number', { ascending: true })
      ).pipe(
        map(({ data: events, error: evErr }) => {
          if (evErr) throw evErr;
          return { draw, events: events ?? [] };
        })
      );
    })
  );
}

  async getLatestAsync() {
    const { data: draw, error } = await this.sb
      .from('stryktipset_draws')
      .select('*')
      .order('draw_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!draw) throw new Error('No draw found');

    const { data: events, error: evErr } = await this.sb
      .from('stryktipset_draw_events')
      .select('*')
      .eq('draw_number', draw.draw_number)
      .order('event_number', { ascending: true });

    if (evErr) throw evErr;

    return { draw, events: events ?? [] };
  }
}
