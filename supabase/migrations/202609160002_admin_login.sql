begin;

-- A permanent admin account is independent of the replaceable player-device identity.
alter table public.live_members add column admin_auth_user_id uuid unique references auth.users(id) on delete set null;

create or replace function public.live_player_id() returns bigint
language sql stable security definer set search_path = '' as $$
  select player_id from public.live_members
  where active and (auth_user_id=auth.uid() or (is_admin and admin_auth_user_id=auth.uid()))
$$;
create or replace function public.live_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.live_members where active and is_admin and
    (admin_auth_user_id=auth.uid() or (admin_auth_user_id is null and auth_user_id=auth.uid())))
$$;
create or replace function public.live_identity() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('player_id',m.player_id,'name',p.name,'is_admin',public.live_is_admin())
  from public.live_members m join public.players p on p.id=m.player_id
  where m.player_id=public.live_player_id()
$$;

-- Run from SQL Editor/service role once to connect a verified existing email account.
-- Nobody can promote themselves through the frontend or user-editable profile fields.
create function public.live_set_admin_login(p_player_id bigint,p_auth_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(4971001);
  if not exists(select 1 from auth.users where id=p_auth_user_id and not coalesce(is_anonymous,false)
    and nullif(email,'') is not null) then raise exception 'Välj ett befintligt konto med e-post och lösenord'; end if;
  if exists(select 1 from public.live_members where player_id<>p_player_id
    and (auth_user_id=p_auth_user_id or admin_auth_user_id=p_auth_user_id)) then
    raise exception 'Kontot tillhör redan en annan spelare'; end if;
  update public.live_members set is_admin=true,admin_auth_user_id=p_auth_user_id,
    auth_user_id=case when auth_user_id=p_auth_user_id or auth_user_id=admin_auth_user_id then null else auth_user_id end
    where player_id=p_player_id and active;
  if not found then raise exception 'Spelaren saknas eller är inaktiverad'; end if;
  -- Old admin bootstrap links must not reactivate administrative privileges.
  update public.live_invites set expires_at=clock_timestamp() where player_id=p_player_id and used_at is null;
end $$;
revoke all on function public.live_set_admin_login(bigint,uuid) from public,anon,authenticated;
grant execute on function public.live_set_admin_login(bigint,uuid) to service_role;

create or replace function public.live_redeem_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare invitation public.live_invites;
begin
  if auth.uid() is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception 'Ogiltig eller förbrukad inbjudan' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(4971001);
  select * into invitation from public.live_invites
    where token_hash=sha256(convert_to(p_token,'UTF8')) and used_at is null and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Ogiltig eller förbrukad inbjudan' using errcode='42501'; end if;
  if exists(select 1 from public.live_members where (auth_user_id=auth.uid() or admin_auth_user_id=auth.uid())
    and player_id<>invitation.player_id) then
    raise exception 'Enheten tillhör redan en annan spelare' using errcode='42501'; end if;
  update public.live_members set auth_user_id=auth.uid() where player_id=invitation.player_id and active;
  if not found then raise exception 'Spelaren är inaktiverad' using errcode='42501'; end if;
  update public.live_invites set used_at=clock_timestamp() where id=invitation.id;
  return public.live_identity();
end $$;

commit;
