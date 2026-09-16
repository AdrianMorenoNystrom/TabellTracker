import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncCoupons } from '../supabase/functions/_shared/sync.mjs';
import { draw } from './fixtures/draw.mjs';

function database(draws = [], state = {}) {
  const calls = [];
  return { calls, rpc: async (name, args) => {
    calls.push({ name, args }); return { data: name === 'live_claim_sync' ? 'lease' : true, error: null };
  }, from: table => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, single: () => chain,
      update: value => { calls.push({ table, value }); return chain; },
      then: resolve => Promise.resolve({ data: table === 'live_draws' ? draws : state, error: null }).then(resolve) };
    return chain;
  } };
}
const now = Date.parse('2026-09-16T12:00:00Z');
test('scheduler waits until snapshot due, manual refresh forces a fetch', async () => {
  const sb=database([{draw_number:4971,reg_close_time:draw().regCloseTime,next_fetch_at:new Date(now+3600000).toISOString()}],{discovery_at:new Date(now).toISOString()});
  let requests=0;
  const provider={get:async path=>{requests++;assert.equal(path,'/draws');return {raw:{draws:[draw()]},retrieved_at:new Date(now).toISOString()};}};
  await syncCoupons(sb,{now:()=>now,provider}); assert.equal(requests,0);
  await syncCoupons(sb,{manual:true,now:()=>now,provider}); assert.equal(requests,1);
  const imported=sb.calls.find(c=>c.name==='live_import_draw');
  assert.equal(imported.args.p_draw.events.length,13);
  assert.equal(imported.args.p_next_fetch_at,new Date(now+6*3600000).toISOString());
});
test('result polling continues for a locked coupon when a new coupon opens', async () => {
  const sb=database([{draw_number:4970,reg_close_time:'2026-09-15T12:00:00Z',status:'locked',result_checked_at:null}]);
  const paths=[];
  const provider={get:async path=>{paths.push(path);return {raw:path==='/draws'?{draws:[draw()]}:{result:{events:[],distribution:[]}},retrieved_at:new Date(now).toISOString()};}};
  const result=await syncCoupons(sb,{now:()=>now,provider});
  assert.equal(result.ok,true); assert.deepEqual(paths,['/draws','/draws/4970/result']);
  assert.ok(sb.calls.some(c=>c.name==='live_import_result' && c.args.p_draw_number===4970));
});
test('provider failure preserves saved data and releases lease with error state', async () => {
  const sb=database();
  const result=await syncCoupons(sb,{now:()=>now,provider:{get:async()=>{throw new Error('Svenska Spel HTTP 503');}}});
  assert.equal(result.ok,false); assert.ok(!sb.calls.some(c=>c.name==='live_import_draw'));
  assert.equal(sb.calls.at(-1).value.lease_token,null); assert.match(sb.calls.at(-1).value.last_error,/503/);
});
test('concurrent/cooldown rejection makes no upstream request', async () => {
  let called=false;
  const sb={rpc:async()=>({data:null,error:null})};
  const result=await syncCoupons(sb,{provider:{get:async()=>{called=true;}}});
  assert.equal(result.skipped,true); assert.equal(called,false);
});
