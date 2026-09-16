-- Valfritt under utveckling. Kör i SQL Editor för automatisk import/rättning.
-- Skapa först två hemligheter i Supabase Vault:
--   live_project_url  = projektets URL, t.ex. https://abc.supabase.co
--   live_cron_secret  = samma slumpmässiga värde som Edge Functions-secret CRON_SECRET
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='live_project_url')
    or not exists(select 1 from vault.decrypted_secrets where name='live_cron_secret') then
    raise exception 'Lägg först in live_project_url och live_cron_secret i Supabase Vault.';
  end if;
end $$;

-- Ett namngivet jobb uppdateras vid omkörning; inget dubbelt schema skapas.
select cron.schedule('stryktipset-sync','*/5 * * * *', $job$
  select net.http_post(
    url := rtrim((select decrypted_secret from vault.decrypted_secrets where name='live_project_url'),'/') || '/functions/v1/stryktipset-sync',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='live_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 130000
  );
$job$);
