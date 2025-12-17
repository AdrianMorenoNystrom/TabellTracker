import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'
export const config = { runtime: 'nodejs' };

const SVENSKA_SPEL_URL =
  'https://api.spela.svenskaspel.se/draw/1/stryktipset/draws/';

function parseNumber(s?: string): number | null {
  if (!s) return null;
  // "6,10" -> 6.10
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(s?: string): number | null {
  if (s == null) return null;
  const n = parseInt(String(s), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: any, res: any) {
  try {
    const supabaseUrl = process.env['SUPABASE_URL'];
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Missing Supabase env vars' });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    const r = await fetch(SVENSKA_SPEL_URL, {
      headers: {
        'user-agent': 'stryktipstabellen-bot/1.0',
        accept: 'application/json',
      },
    });

    const json = await r.json();

    const draw = json?.draws?.[0];
    if (!draw?.drawNumber || !Array.isArray(draw?.drawEvents)) {
      return res.status(500).json({ error: 'Unexpected API shape' });
    }

    const draw_number = Number(draw.drawNumber);

    // 1) Upsert meta
    const metaRow = {
      draw_number,
      product_name: draw.productName ?? null,
      reg_open_time: draw.regOpenTime ?? null,
      reg_close_time: draw.regCloseTime ?? null,
      draw_state: draw.drawState ?? null,
      fetched_at: new Date().toISOString(),
    };

    const metaIns = await sb
      .from('stryktipset_draws')
      .upsert(metaRow, { onConflict: 'draw_number' });

    if (metaIns.error) throw metaIns.error;

    // 2) Upsert events (13 matcher)
    const eventRows = draw.drawEvents.map((e: any) => {
      const participants = e?.match?.participants ?? [];
      const home = participants.find((p: any) => p.type === 'home')?.mediumName
        ?? participants.find((p: any) => p.type === 'home')?.name
        ?? null;
      const away = participants.find((p: any) => p.type === 'away')?.mediumName
        ?? participants.find((p: any) => p.type === 'away')?.name
        ?? null;

      const league = e?.match?.league?.name ?? null;

      // odds ligger både i e.odds och i betMetrics.values[x].odds.odds – vi tar e.odds (enklast)
      const odds_1 = parseNumber(e?.odds?.one);
      const odds_x = parseNumber(e?.odds?.x);
      const odds_2 = parseNumber(e?.odds?.two);

      // distribution finns i e.svenskaFolket.one/x/two eller betMetrics.values[].distribution.distribution
      const dist_1 = parseIntSafe(e?.svenskaFolket?.one);
      const dist_x = parseIntSafe(e?.svenskaFolket?.x);
      const dist_2 = parseIntSafe(e?.svenskaFolket?.two);

      return {
        draw_number,
        event_number: Number(e.eventNumber),
        home_team: home,
        away_team: away,
        league_name: league,
        odds_1,
        odds_x,
        odds_2,
        dist_1,
        dist_x,
        dist_2,
      };
    });

    const evIns = await sb
      .from('stryktipset_draw_events')
      .upsert(eventRows, { onConflict: 'draw_number,event_number' });

    if (evIns.error) throw evIns.error;

    return res.status(200).json({
      ok: true,
      draw_number,
      events: eventRows.length,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
