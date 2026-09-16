const BASE = 'https://api.spela.svenskaspel.se/draw/1/stryktipset';

export function number(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\s*\d+(?:[.,]\d+)?\s*$/.test(value)) return null;
  const result = Number(String(value).replace(',', '.'));
  return Number.isFinite(result) ? result : null;
}

export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).getUTCFullYear() >= 2000
    ? new Date(time).toISOString() : null;
}

function triple(value, valid) {
  const values = ['one', 'x', 'two'].map(key => number(value?.[key]));
  return values.every(n => n !== null && valid(n)) ? values : null;
}

export function odds(value) { return triple(value, n => n > 1 && n <= 10000); }
export function crowd(value) {
  const values = triple(value, n => n >= 0 && n <= 100);
  if (!values) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum >= 99 && sum <= 101 ? values.map(n => n / sum) : null;
}

export function parseDraw(draw) {
  if (draw?.productId !== 1 || draw?.productName?.toLowerCase() !== 'stryktipset'
      || !Number.isSafeInteger(draw.drawNumber) || draw.drawNumber <= 0
      || !timestamp(draw.regCloseTime) || !(number(draw.rowPrice) > 0)
      || typeof draw.drawState !== 'string' || !draw.drawState.trim()) throw new Error('Ogiltig kupong');
  const events = draw.drawEvents;
  if (!Array.isArray(events) || events.length !== 13 || new Set(events.map(e => e.eventNumber)).size !== 13
      || events.some(e => !Number.isInteger(e.eventNumber) || e.eventNumber < 1 || e.eventNumber > 13)) {
    throw new Error('Kupongen måste ha exakt 13 unika kupongplatser');
  }
  return {
    draw_number: draw.drawNumber, reg_open_time: timestamp(draw.regOpenTime),
    reg_close_time: timestamp(draw.regCloseTime), draw_state: draw.drawState,
    row_price: number(draw.rowPrice),
    events: events.map(e => {
      const match = e.match;
      const home = match?.participants?.filter(p => p.type === 'home');
      const away = match?.participants?.filter(p => p.type === 'away');
      if (!Number.isSafeInteger(match?.matchId) || match.matchId <= 0 || home?.length !== 1 || away?.length !== 1
          || !home[0].name?.trim() || !away[0].name?.trim()) throw new Error('Ogiltig matchidentitet');
      return {
        event_number: e.eventNumber, match_id: String(match.matchId),
        home_team: home[0].name, away_team: away[0].name, kickoff: timestamp(match.matchStart),
        league: match.league?.name ?? null, country: match.league?.country?.isoCode ?? null,
        sport_event_status: match.sportEventStatus ?? null, cancelled: e.cancelled === true,
        odds: odds(e.odds), crowd: crowd(e.svenskaFolket),
        crowd_source_updated_at: timestamp(e.svenskaFolket?.date),
        odds_source_updated_at: timestamp(e.odds?.date), odds_source: 'svenska_spel_odds',
      };
    }).sort((a, b) => a.event_number - b.event_number),
  };
}

export function selectDraw(payload, now = Date.now()) {
  const valid = (Array.isArray(payload?.draws) ? payload.draws : []).flatMap(raw => {
    try { return [{ raw, parsed: parseDraw(raw) }]; } catch { return []; }
  }).filter(d => Date.parse(d.parsed.reg_close_time) > now
    && ['open', 'notopened', 'notopen', 'upcoming', 'planned'].includes(d.parsed.draw_state.toLowerCase()))
    .sort((a, b) => Date.parse(a.parsed.reg_close_time) - Date.parse(b.parsed.reg_close_time));
  const opened = valid.filter(d => d.parsed.draw_state.toLowerCase() === 'open'
    && (!d.parsed.reg_open_time || Date.parse(d.parsed.reg_open_time) <= now));
  return opened[0] ?? valid[0] ?? null;
}

export function collectionInterval(close, now = Date.now()) {
  const remaining = Date.parse(close) - now;
  return (remaining > 48 * 3600000 ? 360 : remaining > 24 * 3600000 ? 120
    : remaining > 6 * 3600000 ? 60 : remaining > 30 * 60000 ? 30 : 5) * 60000;
}

export function parseResult(payload, drawNumber) {
  const result = payload?.result;
  if (!result || !Array.isArray(result.events)) throw new Error('Resultat saknas');
  if (result.drawNumber != null && Number(result.drawNumber) !== drawNumber) throw new Error('Fel resultatomgång');
  const seen = new Set();
  return {
    events: result.events.flatMap(e => {
      if (!Number.isInteger(e.eventNumber) || e.eventNumber < 1 || e.eventNumber > 13 || seen.has(e.eventNumber)) {
        throw new Error('Ogiltiga resultatplatser');
      }
      seen.add(e.eventNumber);
      if (!['1', 'X', '2'].includes(e.outcome) || !Number.isSafeInteger(e.matchId) || e.matchId <= 0) return [];
      return [{ event_number: e.eventNumber, match_id: String(e.matchId), outcome: e.outcome,
        home_score: number(e.outcomeScore?.home), away_score: number(e.outcomeScore?.away) }];
    }),
    distribution: (Array.isArray(result.distribution) ? result.distribution : []).map(d => ({
      name: String(d.name ?? ''), winners: number(d.winners), amount: number(d.amount),
    })),
  };
}

// One provider instance serializes all requests, including retry attempts.
export class SvenskaSpel {
  constructor({ fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), clock = Date.now, deadline = Infinity } = {}) {
    this.fetcher = fetcher; this.sleep = sleep; this.clock = clock; this.deadline = deadline; this.lastRequest = -Infinity; this.queue = Promise.resolve();
  }
  get(path) {
    const task = this.queue.then(() => this.request(path));
    this.queue = task.catch(() => {});
    return task;
  }
  async request(path) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.sleep(Math.max(0, 1000 - (this.clock() - this.lastRequest)));
      const remaining = this.deadline - this.clock();
      if (remaining <= 0) throw new Error('Uppdateringens tidsgräns nåddes. Fortsätter vid nästa körning.');
      this.lastRequest = this.clock();
      let response;
      let payload;
      try {
        response = await this.fetcher(`${BASE}${path}`, {
          headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(Math.min(20000, remaining)),
        });
        if (response.ok) payload = await response.json();
      } catch (error) {
        if (attempt === 2) throw error;
        await this.sleep(1000 * (attempt + 1));
        continue;
      }
      if (response.ok) return { raw: payload, retrieved_at: new Date(this.clock()).toISOString() };
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
        throw new Error(`Svenska Spel HTTP ${response.status}`);
      }
      const retry = number(response.headers.get('retry-after'));
      await this.sleep(Math.min(10000, Math.max(1000 * (attempt + 1), (retry ?? 0) * 1000)));
    }
    throw new Error('Svenska Spel kunde inte nås');
  }
}
