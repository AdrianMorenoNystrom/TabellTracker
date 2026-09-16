import { SvenskaSpel, selectDraw, parseDraw, parseResult, collectionInterval } from './svenska-spel.mjs';
const checked = ({ data, error }) => { if (error) throw error; return data; };

export async function syncCoupons(sb, { manual = false, provider = new SvenskaSpel(), now = Date.now } = {}) {
  const lease = checked(await sb.rpc('live_claim_sync', { p_manual: manual }));
  if (!lease) return { ok: true, skipped: true, message: 'En uppdatering pågår eller gjordes nyss.' };
  const failures = [];
  let current = null;
  try {
    const state = checked(await sb.from('live_sync_state').select('*').eq('id', true).single());
    const draws = checked(await sb.from('live_draws').select('*').order('reg_close_time'));
    const upcoming = draws.filter(d => Date.parse(d.reg_close_time) > now());
    const discoveryDue = manual || (upcoming.length === 0 && (!state.discovery_at || now() - Date.parse(state.discovery_at) >= 3600000));
    if (discoveryDue || upcoming.some(d => Date.parse(d.next_fetch_at) <= now())) {
      try {
        const response = await provider.get('/draws');
        const selected = selectDraw(response.raw, now());
        if (selected) {
          current = selected.parsed.draw_number;
          const existing = upcoming.find(d => d.draw_number === current);
          if (manual || !existing || Date.parse(existing.next_fetch_at) <= now()) {
            checked(await sb.rpc('live_import_draw', {
              p_draw: selected.parsed, p_raw: response.raw, p_retrieved_at: response.retrieved_at,
              p_next_fetch_at: new Date(now() + collectionInterval(selected.parsed.reg_close_time, now())).toISOString(),
            }));
          }
        }
        checked(await sb.from('live_sync_state').update({ discovery_at: response.retrieved_at }).eq('id', true));
      } catch (error) { failures.push(error.message); }
    }
    for (const draw of upcoming.filter(d => d.draw_number !== current && (manual || Date.parse(d.next_fetch_at) <= now()))) {
      if (now() >= provider.deadline) break;
      try {
        const response = await provider.get(`/draws/${draw.draw_number}`);
        const parsed = parseDraw(response.raw.draw ?? response.raw.draws?.find(d => d.drawNumber === draw.draw_number));
        if (parsed.draw_number !== draw.draw_number) throw new Error('Fel kupong från Svenska Spel');
        checked(await sb.rpc('live_import_draw', { p_draw: parsed, p_raw: response.raw,
          p_retrieved_at: response.retrieved_at,
          p_next_fetch_at: new Date(now() + collectionInterval(parsed.reg_close_time, now())).toISOString() }));
      } catch (error) {
        failures.push(error.message);
        checked(await sb.from('live_draws').update({ last_error: error.message }).eq('draw_number', draw.draw_number));
      }
    }
    const pending = draws.filter(d => Date.parse(d.reg_close_time) <= now()
      && (d.status !== 'settled' || now() - Date.parse(d.reg_close_time) < 7 * 86400000)
      && (manual || !d.result_checked_at || now() - Date.parse(d.result_checked_at) >= (d.status === 'settled' ? 3600000 : 300000)))
      .sort((a, b) => Date.parse(a.result_checked_at ?? '1970-01-01') - Date.parse(b.result_checked_at ?? '1970-01-01'));
    for (const draw of pending.slice(0, 3)) {
      if (now() >= provider.deadline) break;
      try {
        const response = await provider.get(`/draws/${draw.draw_number}/result`);
        checked(await sb.rpc('live_import_result', { p_draw_number: draw.draw_number,
          p_result: parseResult(response.raw, draw.draw_number), p_raw: response.raw, p_retrieved_at: response.retrieved_at }));
      } catch (error) {
        failures.push(error.message);
        checked(await sb.from('live_draws').update({ last_error: error.message, result_checked_at: new Date(now()).toISOString() })
          .eq('draw_number', draw.draw_number));
      }
    }
    return { ok: failures.length === 0, drawNumber: current, errors: failures };
  } finally {
    checked(await sb.from('live_sync_state').update({ lease_until: new Date(0).toISOString(), lease_token: null,
      last_error: failures.length ? failures.join('; ') : null }).eq('id', true).eq('lease_token', lease));
  }
}
