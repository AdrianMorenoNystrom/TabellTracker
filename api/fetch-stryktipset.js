// api/fetch-stryktipset.js
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    // 1) Supabase (server-side)
    const supabaseUrl = 'https://ywamyalehanpsnvskgfl.supabase.co';
    const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3YW15YWxlaGFucHNudnNrZ2ZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjg3Nzk0OCwiZXhwIjoyMDc4NDUzOTQ4fQ.RKN9sxfwvM9k0x-Z5aDkVHjAC8iWRuX-QmSb6n4ily8'

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Missing Supabase credentials' });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // 2) Hämta från DITT eget API (samma vercel dev/prod)
    const origin = `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers.host}`;
    const url = `${origin}/api/stryktipset-sync`;

    const r = await fetch(url, { headers: { accept: 'application/json' } });

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return res.status(502).json({ error: `Upstream failed ${r.status}`, details: text });
    }

    const json = await r.json();

    // Förväntad shape från din sync:
    // { ok, drawNumber, productName, regCloseTime, rows: [...] }
    if (!json?.drawNumber || !Array.isArray(json?.rows)) {
      return res.status(500).json({ error: 'Unexpected payload shape from /api/stryktipset-sync' });
    }

    const drawNumber = Number(json.drawNumber);

    // 3) Upsert meta -> stryktipset_draws
    const meta = {
      draw_number: drawNumber,
      product_name: json.productName ?? null,
      // finns i tabellen men du kanske inte skickar den från sync just nu:
      reg_open_time: json.regOpenTime ?? null,
      reg_close_time: json.regCloseTime ?? null,
      draw_state: json.drawState ?? null,
      fetched_at: new Date().toISOString(),
    };

    const metaIns = await sb.from('stryktipset_draws').upsert(meta, {
      onConflict: 'draw_number',
    });
    if (metaIns.error) throw metaIns.error;

    // 4) Upsert events -> stryktipset_draw_events
    const eventRows = json.rows.map((row) => ({
      draw_number: drawNumber,
      event_number: Number(row.matchNo), // <-- matchNo i ditt payload blir event_number i DB

      home_team: row.home ?? null,
      away_team: row.away ?? null,
      league_name: row.league ?? null,

      odds_1: row.odds?.['1'] ?? null,
      odds_x: row.odds?.['X'] ?? null,
      odds_2: row.odds?.['2'] ?? null,

      dist_1: row.percent?.['1'] ?? null,
      dist_x: row.percent?.['X'] ?? null,
      dist_2: row.percent?.['2'] ?? null,
    }));

    const evIns = await sb.from('stryktipset_draw_events').upsert(eventRows, {
      onConflict: 'draw_number,event_number',
    });

    if (evIns.error) throw evIns.error;

    return res.status(200).json({
      ok: true,
      drawNumber,
      eventsSaved: eventRows.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
}
