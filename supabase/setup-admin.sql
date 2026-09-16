-- Kör i Supabase SQL Editor EFTER live-migrationerna i guiden.
-- Ändra endast de två värdena nedan.
do $$
declare
  admin_email text := 'DIN_EPOST_HÄR';
  player_name text := 'Adrian';
  account_id uuid;
  existing_player_id bigint;
begin
  select id into account_id from auth.users where lower(email)=lower(admin_email) and not coalesce(is_anonymous,false);
  if account_id is null then raise exception 'Skapa först ditt konto under Authentication → Users (e-post/lösenord).'; end if;
  select id into existing_player_id from public.players where name=player_name;
  if existing_player_id is null then raise exception 'Spelarnamnet finns inte i players.'; end if;
  perform public.live_set_admin_login(existing_player_id,account_id);
end $$;
