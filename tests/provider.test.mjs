import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draw } from './fixtures/draw.mjs';
import { parseDraw, selectDraw, odds, crowd, timestamp, parseResult, collectionInterval, SvenskaSpel } from '../supabase/functions/_shared/svenska-spel.mjs';
const now = Date.parse('2026-09-16T12:00:00Z');

test('coupon selection prefers earliest open draw, independent of array order', () => {
  const first = draw();
  const later = draw({ drawNumber: 4972, regCloseTime: '2026-09-20T15:59:00+02:00' });
  const future = draw({ drawNumber: 4973, regOpenTime: '2026-09-17T12:00:00Z', regCloseTime: '2026-09-18T12:00:00Z' });
  assert.equal(selectDraw({ draws: [later, future, first] }, now).parsed.draw_number, 4971);
  assert.equal(selectDraw({ draws: [future] }, now).parsed.draw_number, 4973);
  assert.equal(selectDraw({ draws: [draw({ productId: 2 }), draw({ drawState: 'Closed' }), draw({ regCloseTime: '2026-09-15T12:00:00Z' })] }, now), null);
  assert.equal(selectDraw({}, now), null);
});
test('exactly 13 unique events, valid product, row price and typed participants', () => {
  const parsed = parseDraw(draw());
  assert.equal(parsed.events.length, 13); assert.equal(parsed.events[0].home_team, 'Home 0');
  assert.equal(parsed.events[0].away_team, 'Away 0');
  for (const changes of [{ drawEvents: draw().drawEvents.slice(1) }, { rowPrice: '' }, { productName: 'Europatipset' }, { regCloseTime: '0001-01-01T00:00:00Z' }]) {
    assert.throws(() => parseDraw(draw(changes)));
  }
  const duplicate = draw(); duplicate.drawEvents[12].eventNumber = 1;
  assert.throws(() => parseDraw(duplicate));
  const noHome = draw(); noHome.drawEvents[0].match.participants[1].type = 'away';
  assert.throws(() => parseDraw(noHome));
});
test('odds decimal comma, invalid or incomplete triples remain null', () => {
  assert.deepEqual(odds({ one: '1,65', x: '4.20', two: 5.5 }), [1.65,4.2,5.5]);
  for (const value of [null, '', 'Infinity', NaN, 1, 10001, '2abc', true, -2]) {
    assert.equal(odds({ one: value, x: 3, two: 4 }), null);
  }
});
test('crowd accepts 99–101 and normalizes; never invents zero', () => {
  for (const n of [32,33,34]) {
    const values = crowd({ one: 33, x: 34, two: n });
    assert.ok(values); assert.ok(Math.abs(values.reduce((a,b) => a+b,0) - 1) < 1e-12);
  }
  assert.deepEqual(crowd({ one: 0, x: 50, two: 50 }), [0,.5,.5]);
  for (const triple of [{ one: '', x: 50, two: 50 }, { one: 101, x: 0, two: 0 }, { one: 30, x: 30, two: 30 }, {}]) assert.equal(crowd(triple), null);
});
test('source timestamps are distinct and timezone-aware', () => {
  const parsed = parseDraw(draw());
  assert.equal(parsed.events[0].odds_source_updated_at, null);
  assert.equal(parsed.events[0].crowd_source_updated_at, '2026-09-16T16:27:46.202Z');
  assert.equal(timestamp('0001-01-01T00:00:00Z'), null);
  assert.equal(timestamp('2026-09-16T12:00:00'), null);
});
test('results require official outcomes and retain match identity and nullable payout', () => {
  const result = parseResult({ result: { events: [{ eventNumber: 1, matchId: 100, outcome: 'X', outcomeScore: { home: 0, away: 0 } },
    { eventNumber: 2, matchId: 101, outcome: null }], distribution: [{ name: '13', winners: '2', amount: null }] } }, 4971);
  assert.equal(result.events.length, 1); assert.equal(result.events[0].match_id, '100');
  assert.equal(result.events[0].home_score, 0); assert.equal(result.distribution[0].amount, null);
  assert.throws(() => parseResult({ result: { drawNumber: 1, events: [] } }, 4971));
});
test('collection intervals use remaining time, including boundaries', () => {
  for (const [minutes, expected] of [[3000,360],[2880,120],[1440,60],[360,30],[30,5],[1,5]])
    assert.equal(collectionInterval(new Date(now+minutes*60000).toISOString(),now),expected*60000);
});
test('provider serializes requests, retries only transient failures and sends JSON header', async () => {
  let clock = 0, calls = [];
  const provider = new SvenskaSpel({ clock: () => clock, sleep: async ms => { clock += ms; },
    fetcher: async (url, options) => {
      calls.push(clock); assert.equal(options.headers.Accept, 'application/json'); assert.ok(options.signal);
      return new Response(JSON.stringify({ draws: [] }), { status: calls.length < 3 ? 503 : 200 });
    } });
  await Promise.all([provider.get('/draws'), provider.get('/draws')]);
  assert.equal(calls.length,4); assert.ok(calls.slice(1).every((t,i) => t-calls[i]>=1000));
  let attempts=0;
  const denied = new SvenskaSpel({ sleep: async () => {}, fetcher: async () => { attempts++; return new Response('', { status: 403 }); } });
  await assert.rejects(denied.get('/draws')); assert.equal(attempts,1);
  attempts=0;
  const limited = new SvenskaSpel({ sleep: async () => {}, fetcher: async () => { attempts++; return new Response('', { status: 429 }); } });
  await assert.rejects(limited.get('/draws')); assert.equal(attempts,3);
});
