import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSync } from '../supabase/functions/_shared/edge-handler.mjs';

function fixture({ validUser=true, member=true }={}) {
  const calls=[];
  const chain={select:()=>chain,or:value=>{calls.push(['membership',value]);return chain;},eq:()=>chain,
    maybeSingle:async()=>({data:member?{player_id:1}:null,error:null})};
  return {calls, options:{url:'https://example.test',serviceKey:'server-only',cronSecret:'secret-for-scheduler',
    createClient:()=>({auth:{getUser:async token=>{calls.push(['verify',token]);return {data:{user:validUser?{id:'verified-user-id'}:null},error:null};}},from:()=>chain}),
    sync:async (_sb,options)=>{calls.push(['sync',options.manual]);return {ok:true};}}};
}
const request=headers=>new Request('https://example.test/functions/v1/stryktipset-sync',{method:'POST',headers});
test('Edge preflight supports local browser invocation without doing work',async()=>{
  const f=fixture();const result=await handleSync(new Request('https://example.test',{method:'OPTIONS'}),f.options);
  assert.equal(result.status,204);assert.equal(result.headers.get('Access-Control-Allow-Origin'),'*');assert.equal(f.calls.length,0);
});
test('Edge rejects anonymous and forged callers; a publishable key is not an identity',async()=>{
  const f=fixture({validUser:false});
  assert.equal((await handleSync(request({apikey:'public-key'}),f.options)).status,401);
  assert.equal((await handleSync(request({Authorization:'Bearer forged'}),f.options)).status,401);
  assert.ok(!f.calls.some(c=>c[0]==='sync'));
});
test('Edge requires active membership after verifying the JWT with Supabase Auth',async()=>{
  const f=fixture({member:false});
  assert.equal((await handleSync(request({Authorization:'Bearer valid-jwt'}),f.options)).status,403);
  assert.deepEqual(f.calls[0],['verify','valid-jwt']);assert.ok(!f.calls.some(c=>c[0]==='sync'));
});
test('Edge accepts members including permanent admin and uses the manual cooldown',async()=>{
  const f=fixture();const response=await handleSync(request({Authorization:'Bearer valid-jwt'}),f.options);
  assert.equal(response.status,200);assert.deepEqual(f.calls.at(-1),['sync',true]);
  assert.match(f.calls.find(c=>c[0]==='membership')[1],/admin_auth_user_id/);
});
test('Edge scheduler requires the configured secret, not a body or client flag',async()=>{
  const f=fixture();
  assert.equal((await handleSync(request({'x-cron-secret':'wrong'}),f.options)).status,401);
  assert.equal((await handleSync(request({'x-cron-secret':'secret-for-scheduler'}),f.options)).status,200);
  assert.deepEqual(f.calls,[['sync',false]]);
  const noSecret={...f.options,cronSecret:undefined};
  assert.equal((await handleSync(request({'x-cron-secret':'secret-for-scheduler'}),noSecret)).status,401);
});
