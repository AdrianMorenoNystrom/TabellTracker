import { syncCoupons } from './sync.mjs';
import { SvenskaSpel } from './svenska-spel.mjs';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

// Hash first so both comparisons always process the same number of bytes.
async function equalSecrets(left, right) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([left, right].map(s => crypto.subtle.digest('SHA-256', encoder.encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}

export async function handleSync(request, { createClient, url, serviceKey, cronSecret, sync = syncCoupons }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ error: 'Använd POST' }, 405);
  if (!url || !serviceKey) return json({ error: 'Supabase-funktionen är inte konfigurerad' }, 503);
  const suppliedSecret = request.headers.get('x-cron-secret');
  const isCron = !!cronSecret && !!suppliedSecret && await equalSecrets(suppliedSecret, cronSecret);
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!isCron && !bearer) return json({ error: 'Logga in eller aktivera din enhet' }, 401);
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init = {}) => fetch(input, {
      ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    }) },
  });
  try {
    if (!isCron) {
      const { data, error } = await sb.auth.getUser(bearer);
      if (error || !data.user) return json({ error: 'Inloggningen har gått ut. Logga in igen.' }, 401);
      const member = await sb.from('live_members').select('player_id')
        .or(`auth_user_id.eq.${data.user.id},and(admin_auth_user_id.eq.${data.user.id},is_admin.eq.true)`).eq('active', true).maybeSingle();
      if (member.error || !member.data) return json({ error: 'Aktivt medlemskap krävs' }, 403);
    }
    const result = await sync(sb, { manual: !isCron, provider: new SvenskaSpel({ deadline: Date.now() + 100000 }) });
    return json(result, result.ok ? 200 : 502);
  } catch (error) {
    console.error('Coupon sync failed:', error.message);
    return json({ error: 'Uppdateringen misslyckades. Senast sparade data finns kvar.' }, 502);
  }
}
