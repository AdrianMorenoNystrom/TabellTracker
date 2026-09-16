import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { handleSync } from '../_shared/edge-handler.mjs';

Deno.serve((request: Request) => handleSync(request, {
  createClient,
  url: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  cronSecret: Deno.env.get('CRON_SECRET'),
}));
