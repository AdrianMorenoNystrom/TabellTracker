begin;

-- Additive migration: existing players, rounds, round_players and old tips stay intact.
create table public.live_members (
  player_id bigint primary key references public.players(id) on delete restrict,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  is_admin boolean not null default false,
  active boolean not null default true
);
create table public.live_invites (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.live_members(player_id),
  token_hash bytea not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
);
-- This is the EXISTING order from add-round-dialog.component.ts, persisted once.
create table public.live_rotation (
  position smallint not null unique deferrable initially immediate check (position between 1 and 4),
  player_id bigint primary key references public.players(id)
);
insert into public.live_rotation(position, player_id)
select v.position, p.id from (values (1,'Ompen'),(2,'Sillen'),(3,'Adrian'),(4,'Danne')) v(position,name)
join public.players p on p.name = v.name;
insert into public.live_members(player_id) select player_id from public.live_rotation;

-- No event-number allocation exists in the repository. Do not invent one.
-- Populate each phase with the verified existing allocation before opening it.
create table public.live_allocation (
  four_player_id bigint not null references public.live_rotation(player_id),
  event_number smallint not null check (event_number between 1 and 13),
  player_id bigint not null references public.live_members(player_id),
  primary key(four_player_id, event_number)
);
create table public.live_draws (
  draw_number bigint primary key,
  season_id bigint not null references public.seasons(id),
  round_number integer not null,
  round_id bigint unique references public.rounds(id) on delete restrict,
  four_player_id bigint not null references public.live_rotation(player_id),
  reg_open_time timestamptz,
  reg_close_time timestamptz not null,
  draw_state text not null,
  row_price numeric not null check(row_price > 0),
  status text not null check(status in ('draft','open','locked','settled')),
  retrieved_at timestamptz not null,
  next_fetch_at timestamptz not null,
  result_checked_at timestamptz,
  last_error text,
  distribution jsonb,
  unique(season_id, round_number)
);
create table public.live_events (
  draw_number bigint not null references public.live_draws(draw_number),
  event_number smallint not null check(event_number between 1 and 13),
  match_id text not null,
  home_team text not null,
  away_team text not null,
  kickoff timestamptz,
  league text,
  country text,
  sport_event_status text,
  cancelled boolean not null default false,
  player_id bigint references public.live_members(player_id),
  odds jsonb,
  crowd jsonb,
  odds_source_updated_at timestamptz,
  crowd_source_updated_at timestamptz,
  odds_retrieved_at timestamptz,
  crowd_retrieved_at timestamptz,
  primary key(draw_number,event_number)
);
create table public.live_picks (
  draw_number bigint not null,
  event_number smallint not null,
  pick text not null default '' check(pick in ('','1','X','2','1X','12','X2')),
  match_id text not null,
  revision integer not null default 1,
  updated_by uuid,
  entered_by_admin boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(draw_number,event_number),
  foreign key(draw_number,event_number) references public.live_events(draw_number,event_number)
);
create table public.live_pick_audit (
  id bigint generated always as identity primary key,
  draw_number bigint not null,
  event_number smallint not null,
  old_pick text,
  new_pick text not null,
  match_id text not null,
  updated_by uuid,
  entered_by_admin boolean not null,
  recorded_at timestamptz not null default now()
);
create table public.live_observations (
  id bigint generated always as identity primary key,
  draw_number bigint not null references public.live_draws(draw_number),
  kind text not null check(kind in ('draw','result','manual_result')),
  raw jsonb not null,
  normalized jsonb not null,
  retrieved_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  updated_by uuid
);
create index live_observations_draw_idx on public.live_observations(draw_number, retrieved_at);
create table public.live_results (
  draw_number bigint not null,
  event_number smallint not null,
  match_id text not null,
  outcome text not null check(outcome in ('1','X','2')),
  home_score numeric,
  away_score numeric,
  manual boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(draw_number,event_number),
  foreign key(draw_number,event_number) references public.live_events(draw_number,event_number)
);
create table public.live_sync_state (
  id boolean primary key default true check(id),
  lease_until timestamptz not null default '-infinity',
  lease_token uuid,
  last_manual_at timestamptz,
  discovery_at timestamptz,
  last_error text
);
insert into public.live_sync_state(id) values(true);

create function public.live_player_id() returns bigint
language sql stable security definer set search_path = '' as $$
  select player_id from public.live_members where auth_user_id = auth.uid() and active
$$;
create function public.live_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.live_members where auth_user_id = auth.uid() and active and is_admin)
$$;
create function public.live_identity() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('player_id',m.player_id,'name',p.name,'is_admin',m.is_admin)
  from public.live_members m join public.players p on p.id=m.player_id
  where m.auth_user_id=auth.uid() and m.active
$$;

-- Existing trigger uses unqualified names; settlement deliberately uses an empty search_path.
create or replace function public.recompute_round_total() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.rounds r set totalscore=coalesce((select sum(score) from public.round_players rp where rp.round_id=r.id),0)
  where r.id=coalesce(new.round_id,old.round_id);
  return null;
end $$;

create function public.live_configure_rotation(p_players bigint[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.live_is_admin() then raise exception 'Endast admin' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(4971002);
  if array_length(p_players,1) is distinct from 4 or array_position(p_players,null) is not null
    or (select count(distinct p) from unnest(p_players) p)<>4
    or exists(select 1 from unnest(p_players) p left join public.live_rotation r on r.player_id=p where r.player_id is null)
    then raise exception 'Ange de fyra befintliga spelarna en gång var'; end if;
  set constraints public.live_rotation_position_key deferred;
  update public.live_rotation r set position=n from unnest(p_players) with ordinality as x(id,n) where r.player_id=x.id;
  set constraints public.live_rotation_position_key immediate;
end $$;

create function public.live_create_invite(p_player_id bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  perform pg_advisory_xact_lock(4971001);
  if not public.live_is_admin() then raise exception 'Endast admin' using errcode='42501'; end if;
  perform 1 from public.live_members where player_id=p_player_id and active for update;
  if not found then raise exception 'Spelaren saknas'; end if;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update public.live_invites set expires_at=now() where player_id=p_player_id and used_at is null;
  insert into public.live_invites(player_id,token_hash,created_by)
  values(p_player_id,sha256(convert_to(token,'UTF8')),auth.uid());
  return token;
end $$;

-- One-time initialization, callable only with the server's service role.
create function public.live_bootstrap_admin(p_player_id bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  perform pg_advisory_xact_lock(4971001);
  if exists(select 1 from public.live_members where is_admin and active) then raise exception 'En admin finns redan'; end if;
  update public.live_members set is_admin=true where player_id=p_player_id and active;
  if not found then raise exception 'Befintlig ligaspelare saknas'; end if;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  insert into public.live_invites(player_id,token_hash) values(p_player_id,sha256(convert_to(token,'UTF8')));
  return token;
end $$;

create function public.live_redeem_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare invitation public.live_invites;
begin
  if auth.uid() is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception 'Ogiltig eller förbrukad inbjudan' using errcode='42501';
  end if;
  -- Serialize identity changes, including two tokens redeemed by the same user.
  perform pg_advisory_xact_lock(4971001);
  select * into invitation from public.live_invites
  where token_hash=sha256(convert_to(p_token,'UTF8')) and used_at is null and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Ogiltig eller förbrukad inbjudan' using errcode='42501'; end if;
  if exists(select 1 from public.live_members where auth_user_id=auth.uid() and player_id<>invitation.player_id) then
    raise exception 'Enheten tillhör redan en annan spelare' using errcode='42501';
  end if;
  update public.live_members set auth_user_id=auth.uid() where player_id=invitation.player_id and active;
  if not found then raise exception 'Spelaren är inaktiverad' using errcode='42501'; end if;
  update public.live_invites set used_at=clock_timestamp() where id=invitation.id;
  return public.live_identity();
end $$;

create function public.live_status(p_draw_number bigint) returns table(
  player_id bigint, assigned bigint, picked bigint, halves bigint, singles bigint, complete boolean
) language sql stable security invoker set search_path = '' as $$
  select e.player_id, count(*), count(*) filter(where length(p.pick)>0),
    count(*) filter(where length(p.pick)=2), count(*) filter(where length(p.pick)=1),
    count(*) in (3,4) and count(*) filter(where length(p.pick)=2)=2
      and count(*) filter(where length(p.pick)=1)=count(*)-2
  from public.live_events e left join public.live_picks p
    on p.draw_number=e.draw_number and p.event_number=e.event_number and p.match_id=e.match_id
  where e.draw_number=p_draw_number and e.player_id is not null group by e.player_id
$$;

-- Computes totals from scratch and writes to ONE linked historical round.
create function public.live_settle(p_draw_number bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare d public.live_draws; rid bigint; rp record;
begin
  perform pg_advisory_xact_lock(4971002);
  select * into d from public.live_draws where draw_number=p_draw_number for update;
  if not found or d.reg_close_time>clock_timestamp() then return false; end if;
  if (select count(*) from public.live_events e join public.live_results r
      on r.draw_number=e.draw_number and r.event_number=e.event_number and r.match_id=e.match_id
      where e.draw_number=p_draw_number and e.player_id is not null)<>13 then return false; end if;
  if (select count(*) from public.live_status(p_draw_number))<>4
      or exists(select 1 from public.live_status(p_draw_number) where not complete) then return false; end if;
  rid := d.round_id;
  if rid is null then
    -- Never attach by week or overwrite an existing manually entered round.
    if exists(select 1 from public.rounds where season_id=d.season_id and roundnumber=d.round_number) then
      raise exception 'Omgångsnumret finns redan i historiken. Admin måste länka rätt omgång.';
    end if;
    insert into public.rounds(roundnumber,week,season_id)
      values(d.round_number,extract(week from d.reg_close_time at time zone 'Europe/Stockholm'),d.season_id)
      returning id into rid;
    update public.live_draws set round_id=rid where draw_number=p_draw_number;
  end if;
  for rp in
    select e.player_id, count(*)::integer as matches,
      count(*) filter(where position(r.outcome in p.pick)>0)::integer as score
    from public.live_events e join public.live_results r using(draw_number,event_number,match_id)
      join public.live_picks p using(draw_number,event_number,match_id)
    where e.draw_number=p_draw_number group by e.player_id
  loop
    update public.round_players set score=rp.score,matches_picked=rp.matches where round_id=rid and player_id=rp.player_id;
    if not found then insert into public.round_players(round_id,player_id,score,matches_picked)
      values(rid,rp.player_id,rp.score,rp.matches); end if;
  end loop;
  update public.rounds set totalscore=(select sum(score) from public.round_players where round_id=rid) where id=rid;
  update public.live_draws set status='settled' where draw_number=p_draw_number;
  return true;
end $$;

create function public.live_save_pick(p_draw_number bigint,p_event_number integer,p_pick text,p_match_id text,p_revision integer)
returns public.live_picks language plpgsql security definer set search_path = '' as $$
declare d public.live_draws; e public.live_events; previous public.live_picks; saved public.live_picks; admin boolean;
begin
  -- Same lock ordering as settlement/import; all writes for a coupon are serialized.
  perform pg_advisory_xact_lock(4971002);
  select * into d from public.live_draws where draw_number=p_draw_number for update;
  admin := public.live_is_admin();
  if public.live_player_id() is null then raise exception 'Aktivt medlemskap krävs' using errcode='42501'; end if;
  select * into e from public.live_events where draw_number=p_draw_number and event_number=p_event_number;
  if e.player_id is null or e.match_id is distinct from p_match_id then raise exception 'Matchen har ändrats. Ladda om.'; end if;
  if not admin and (e.player_id<>public.live_player_id() or d.status<>'open'
    or d.reg_close_time<=clock_timestamp() or d.reg_open_time>clock_timestamp()) then
    raise exception 'Du får inte ändra detta tips' using errcode='42501'; end if;
  if p_pick is null or p_pick not in ('','1','X','2','1X','12','X2') then raise exception 'Högst två tecken per match'; end if;
  select * into previous from public.live_picks where draw_number=p_draw_number and event_number=p_event_number;
  if coalesce(previous.revision,0) is distinct from p_revision then raise exception 'Tipset har ändrats på en annan enhet. Ladda om.' using errcode='40001'; end if;
  if length(p_pick)=2 and (select count(*) from public.live_picks p join public.live_events ev using(draw_number,event_number)
    where p.draw_number=p_draw_number and ev.player_id=e.player_id and p.event_number<>p_event_number and length(p.pick)=2)>=2 then
    raise exception 'Högst två halvgarderingar per spelare'; end if;
  if d.status='settled' and (p_pick='' or length(p_pick)<>length(previous.pick)) then
    raise exception 'En rättad omgång måste förbli komplett. Byt tecken med samma antal eller använd en samlad adminrättning.';
  end if;
  insert into public.live_picks(draw_number,event_number,pick,match_id,revision,updated_by,entered_by_admin)
    values(p_draw_number,p_event_number,p_pick,p_match_id,coalesce(previous.revision,0)+1,auth.uid(),admin)
  on conflict(draw_number,event_number) do update set pick=excluded.pick,match_id=excluded.match_id,
    revision=excluded.revision,updated_by=excluded.updated_by,entered_by_admin=excluded.entered_by_admin,updated_at=clock_timestamp()
  returning * into saved;
  insert into public.live_pick_audit(draw_number,event_number,old_pick,new_pick,match_id,updated_by,entered_by_admin)
    values(p_draw_number,p_event_number,previous.pick,p_pick,p_match_id,auth.uid(),admin);
  perform public.live_settle(p_draw_number);
  return saved;
end $$;

-- One verified template per existing rotation phase. Cannot change a live allocation.
create function public.live_configure_allocation(p_four_player_id bigint,p_players bigint[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.live_is_admin() then raise exception 'Endast admin' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(4971002);
  if array_length(p_players,1) is distinct from 13 or array_position(p_players,null) is not null
    or (select count(distinct p) from unnest(p_players) p)<>4
    or (select count(*) from unnest(p_players) p where p=p_four_player_id)<>4
    or exists(select p from unnest(p_players) p group by p having count(*)<>case when p=p_four_player_id then 4 else 3 end)
    or exists(select 1 from unnest(p_players) p left join public.live_rotation r on r.player_id=p where r.player_id is null)
    then raise exception 'Fördelningen måste följa snurran: 4 + 3 + 3 + 3 matcher'; end if;
  delete from public.live_allocation where four_player_id=p_four_player_id;
  insert into public.live_allocation(four_player_id,event_number,player_id)
    select p_four_player_id,n,p_players[n] from generate_series(1,13) n;
  -- A coupon waiting for its FIRST allocation can be activated immediately.
  update public.live_events e set player_id=a.player_id
  from public.live_draws d, public.live_allocation a
  where e.draw_number=d.draw_number and d.four_player_id=p_four_player_id and d.status in ('draft','locked')
    and a.four_player_id=p_four_player_id and a.event_number=e.event_number and e.player_id is null;
  update public.live_draws d set status=case when reg_close_time<=clock_timestamp() then 'locked'
      when lower(draw_state)='open' and coalesce(reg_open_time,'-infinity')<=clock_timestamp() then 'open' else 'draft' end
    where d.four_player_id=p_four_player_id and d.status='draft'
      and (select count(*) from public.live_events e where e.draw_number=d.draw_number and e.player_id is not null)=13;
end $$;

-- Change a whole player's already settled row atomically, including which matches are halves.
create function public.live_admin_picks(p_draw_number bigint,p_player_id bigint,p_picks jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare ev jsonb; previous public.live_picks; assigned integer;
begin
  if not public.live_is_admin() then raise exception 'Endast admin' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(4971002);
  select count(*) into assigned from public.live_events where draw_number=p_draw_number and player_id=p_player_id;
  if assigned not in (3,4) or jsonb_array_length(p_picks)<>assigned
    or (select count(distinct x->>'event_number') from jsonb_array_elements(p_picks) x)<>assigned
    or (select count(*) from jsonb_array_elements(p_picks) x where length(x->>'pick')=2)<>2
    or exists(select 1 from jsonb_array_elements(p_picks) x where coalesce(x->>'pick','') not in ('1','X','2','1X','12','X2'))
    then raise exception 'En komplett rad med exakt två halvor krävs'; end if;
  for ev in select * from jsonb_array_elements(p_picks) loop
    if not exists(select 1 from public.live_events where draw_number=p_draw_number and event_number=(ev->>'event_number')::int
      and player_id=p_player_id and match_id=ev->>'match_id') then raise exception 'Fel spelare eller matchidentitet'; end if;
    select * into previous from public.live_picks where draw_number=p_draw_number and event_number=(ev->>'event_number')::int;
    if coalesce(previous.revision,0) is distinct from (ev->>'revision')::int then raise exception 'Tipsen har ändrats. Ladda om.' using errcode='40001'; end if;
    insert into public.live_picks(draw_number,event_number,match_id,pick,revision,updated_by,entered_by_admin)
      values(p_draw_number,(ev->>'event_number')::int,ev->>'match_id',ev->>'pick',coalesce(previous.revision,0)+1,auth.uid(),true)
      on conflict(draw_number,event_number) do update set pick=excluded.pick,revision=excluded.revision,
        updated_by=excluded.updated_by,entered_by_admin=true,updated_at=clock_timestamp();
    insert into public.live_pick_audit(draw_number,event_number,old_pick,new_pick,match_id,updated_by,entered_by_admin)
      values(p_draw_number,(ev->>'event_number')::int,previous.pick,ev->>'pick',ev->>'match_id',auth.uid(),true);
  end loop;
  perform public.live_settle(p_draw_number);
end $$;

-- Called only by the server after strict provider parsing; atomic import + snapshot.
create function public.live_next_round() returns table(season_id bigint,round_number integer,four_player_id bigint,four_player_name text)
language sql stable security invoker set search_path = '' as $$
  with current_season as (select id from public.seasons where is_current),
  existing as (
    select r.roundnumber n,rp.player_id from public.rounds r join public.round_players rp on rp.round_id=r.id
      join current_season s on r.season_id=s.id where rp.matches_picked=4
    union all select d.round_number,d.four_player_id from public.live_draws d join current_season s on d.season_id=s.id
  ), last_player as (select player_id from existing order by n desc limit 1),
  next_number as (
    select coalesce(max(n),0)::integer+1 as n from (
      select r.roundnumber n from public.rounds r join current_season s on s.id=r.season_id
      union all select d.round_number from public.live_draws d join current_season s on s.id=d.season_id
    ) all_rounds
  )
  select s.id,n.n,r.player_id,p.name from current_season s cross join next_number n
    join public.live_rotation r on r.position=coalesce((select position % 4 + 1 from public.live_rotation where player_id=(select player_id from last_player)),1)
    join public.players p on p.id=r.player_id
$$;

create function public.live_import_draw(p_draw jsonb,p_raw jsonb,p_retrieved_at timestamptz,p_next_fetch_at timestamptz)
returns bigint language plpgsql security definer set search_path = '' as $$
declare dn bigint := (p_draw->>'draw_number')::bigint; d public.live_draws; ev jsonb;
  sid bigint; rn integer; four_id bigint; current_match text; ready boolean;
begin
  perform pg_advisory_xact_lock(4971002);
  if jsonb_array_length(p_draw->'events')<>13 or (select count(distinct (x->>'event_number')::int)
    from jsonb_array_elements(p_draw->'events') x where (x->>'event_number')::int between 1 and 13)<>13 then
    raise exception 'Exakt 13 matcher krävs'; end if;
  select * into d from public.live_draws where draw_number=dn for update;
  if not found then
    if (select count(*) from public.live_rotation)<>4 then raise exception 'Befintliga spelare för snurran saknas'; end if;
    select season_id,round_number,four_player_id into strict sid,rn,four_id from public.live_next_round();
    insert into public.live_draws(draw_number,season_id,round_number,four_player_id,reg_open_time,reg_close_time,
      draw_state,row_price,status,retrieved_at,next_fetch_at)
    values(dn,sid,rn,four_id,(p_draw->>'reg_open_time')::timestamptz,(p_draw->>'reg_close_time')::timestamptz,
      p_draw->>'draw_state',(p_draw->>'row_price')::numeric,'draft',p_retrieved_at,p_next_fetch_at);
    select * into d from public.live_draws where draw_number=dn;
  end if;
  insert into public.live_observations(draw_number,kind,raw,normalized,retrieved_at)
    values(dn,'draw',p_raw,p_draw,p_retrieved_at);
  -- Archived identities and pre-close data become immutable once the original deadline passes.
  if d.reg_close_time<=clock_timestamp() or d.status in ('locked','settled') then return dn; end if;
  for ev in select * from jsonb_array_elements(p_draw->'events') loop
    select match_id into current_match from public.live_events where draw_number=dn and event_number=(ev->>'event_number')::int;
    if current_match is not null and current_match<>ev->>'match_id' then
      insert into public.live_pick_audit(draw_number,event_number,old_pick,new_pick,match_id,entered_by_admin)
        select draw_number,event_number,pick,'',match_id,false from public.live_picks
        where draw_number=dn and event_number=(ev->>'event_number')::int;
      -- Old pick is retained in the audit, never applied silently to a replacement match.
      update public.live_picks set pick='',match_id=ev->>'match_id',revision=revision+1,updated_at=clock_timestamp(),updated_by=null,entered_by_admin=false
        where draw_number=dn and event_number=(ev->>'event_number')::int;
    end if;
    insert into public.live_events(draw_number,event_number,match_id,home_team,away_team,kickoff,league,country,
      sport_event_status,cancelled,player_id,odds,crowd,odds_source_updated_at,crowd_source_updated_at,odds_retrieved_at,crowd_retrieved_at)
    values(dn,(ev->>'event_number')::int,ev->>'match_id',ev->>'home_team',ev->>'away_team',(ev->>'kickoff')::timestamptz,
      ev->>'league',ev->>'country',ev->>'sport_event_status',(ev->>'cancelled')::boolean,
      (select player_id from public.live_allocation where four_player_id=d.four_player_id and event_number=(ev->>'event_number')::int),
      nullif(ev->'odds','null'::jsonb),nullif(ev->'crowd','null'::jsonb),(ev->>'odds_source_updated_at')::timestamptz,
      (ev->>'crowd_source_updated_at')::timestamptz,
      case when nullif(ev->'odds','null'::jsonb) is not null then p_retrieved_at end,
      case when nullif(ev->'crowd','null'::jsonb) is not null then p_retrieved_at end)
    on conflict(draw_number,event_number) do update set
      match_id=excluded.match_id,home_team=excluded.home_team,away_team=excluded.away_team,kickoff=excluded.kickoff,
      league=excluded.league,country=excluded.country,sport_event_status=excluded.sport_event_status,cancelled=excluded.cancelled,
      player_id=coalesce(live_events.player_id,excluded.player_id),
      odds=case when live_events.match_id<>excluded.match_id then excluded.odds else coalesce(excluded.odds,live_events.odds) end,
      crowd=case when live_events.match_id<>excluded.match_id then excluded.crowd else coalesce(excluded.crowd,live_events.crowd) end,
      odds_source_updated_at=case when excluded.odds is not null or live_events.match_id<>excluded.match_id then excluded.odds_source_updated_at else live_events.odds_source_updated_at end,
      crowd_source_updated_at=case when excluded.crowd is not null or live_events.match_id<>excluded.match_id then excluded.crowd_source_updated_at else live_events.crowd_source_updated_at end,
      odds_retrieved_at=case when live_events.match_id<>excluded.match_id then excluded.odds_retrieved_at else coalesce(excluded.odds_retrieved_at,live_events.odds_retrieved_at) end,
      crowd_retrieved_at=case when live_events.match_id<>excluded.match_id then excluded.crowd_retrieved_at else coalesce(excluded.crowd_retrieved_at,live_events.crowd_retrieved_at) end;
  end loop;
  ready := (select count(*) from public.live_events where draw_number=dn and player_id is not null)=13;
  update public.live_draws set reg_open_time=(p_draw->>'reg_open_time')::timestamptz,reg_close_time=(p_draw->>'reg_close_time')::timestamptz,
    draw_state=p_draw->>'draw_state',retrieved_at=p_retrieved_at,next_fetch_at=p_next_fetch_at,last_error=null,
    status=case when (p_draw->>'reg_close_time')::timestamptz<=clock_timestamp() then 'locked'
      when ready and lower(p_draw->>'draw_state')='open' and coalesce((p_draw->>'reg_open_time')::timestamptz,'-infinity')<=clock_timestamp() then 'open' else 'draft' end
    where draw_number=dn;
  return dn;
end $$;

create function public.live_import_result(p_draw_number bigint,p_result jsonb,p_raw jsonb,p_retrieved_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare ev jsonb;
begin
  perform pg_advisory_xact_lock(4971002);
  perform 1 from public.live_draws where draw_number=p_draw_number and reg_close_time<=clock_timestamp() for update;
  if not found then raise exception 'Omgången är inte låst'; end if;
  insert into public.live_observations(draw_number,kind,raw,normalized,retrieved_at)
    values(p_draw_number,'result',p_raw,p_result,p_retrieved_at);
  for ev in select * from jsonb_array_elements(p_result->'events') loop
    if ev->>'outcome' in ('1','X','2') and exists(select 1 from public.live_events where draw_number=p_draw_number
      and event_number=(ev->>'event_number')::int and match_id=ev->>'match_id') then
      insert into public.live_results(draw_number,event_number,match_id,outcome,home_score,away_score)
        values(p_draw_number,(ev->>'event_number')::int,ev->>'match_id',ev->>'outcome',(ev->>'home_score')::numeric,(ev->>'away_score')::numeric)
      on conflict(draw_number,event_number) do update set outcome=excluded.outcome,home_score=excluded.home_score,
        away_score=excluded.away_score,updated_at=clock_timestamp() where not live_results.manual;
    end if;
  end loop;
  update public.live_draws set distribution=case when jsonb_array_length(p_result->'distribution')>0 then p_result->'distribution' else distribution end,
    result_checked_at=clock_timestamp(),last_error=null,
    status=case when status='settled' then status else 'locked' end where draw_number=p_draw_number;
  return public.live_settle(p_draw_number);
end $$;

create function public.live_correct_result(p_draw_number bigint,p_event_number integer,p_match_id text,p_outcome text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.live_is_admin() then raise exception 'Endast admin' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(4971002);
  if length(trim(coalesce(p_reason,'')))<5 or p_outcome not in ('1','X','2') or p_outcome is null then raise exception 'Ange tecken och orsak'; end if;
  if not exists(select 1 from public.live_events e join public.live_draws d using(draw_number)
    where e.draw_number=p_draw_number and e.event_number=p_event_number and e.match_id=p_match_id and d.reg_close_time<=clock_timestamp())
    then raise exception 'Fel matchidentitet eller omgången fortfarande öppen'; end if;
  insert into public.live_results(draw_number,event_number,match_id,outcome,manual)
    values(p_draw_number,p_event_number,p_match_id,p_outcome,true)
    on conflict(draw_number,event_number) do update set outcome=excluded.outcome,home_score=null,away_score=null,
      manual=true,updated_at=clock_timestamp();
  insert into public.live_observations(draw_number,kind,raw,normalized,retrieved_at,updated_by)
    values(p_draw_number,'manual_result',jsonb_build_object('reason',p_reason),
      jsonb_build_object('event_number',p_event_number,'match_id',p_match_id,'outcome',p_outcome),clock_timestamp(),auth.uid());
  perform public.live_settle(p_draw_number);
end $$;

create function public.live_claim_sync(p_manual boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare token uuid := gen_random_uuid();
begin
  update public.live_sync_state set lease_until=clock_timestamp()+interval '10 minutes',lease_token=token,
    last_manual_at=case when p_manual then clock_timestamp() else last_manual_at end
  where id and lease_until<clock_timestamp() and (not p_manual or last_manual_at is null or last_manual_at<clock_timestamp()-interval '60 seconds');
  if not found then return null; end if;
  update public.live_draws set status='locked' where status in ('open','draft') and reg_close_time<=clock_timestamp();
  return token;
end $$;

-- Deny legacy SECURITY DEFINER RPCs: otherwise old endpoints can bypass the new RLS.
do $$ declare f record; t record; pol record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' loop
    execute format('revoke execute on function %s from public, anon, authenticated',f.signature);
  end loop;
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security',t.tablename);
    -- Replace permissive legacy policies, including public read and profile self-escalation.
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t.tablename loop
      execute format('drop policy %I on public.%I',pol.policyname,t.tablename);
    end loop;
    execute format('revoke all on public.%I from public, anon, authenticated',t.tablename);
    if t.tablename not in ('live_invites','live_sync_state') then
      execute format('grant select on public.%I to authenticated',t.tablename);
      execute format('create policy league_read on public.%I for select to authenticated using (public.live_player_id() is not null)',t.tablename);
    end if;
    if t.tablename in ('players','rounds','round_players','articles','seasons') then
      execute format('grant insert, update, delete on public.%I to authenticated',t.tablename);
      execute format('create policy league_admin on public.%I for all to authenticated using (public.live_is_admin()) with check (public.live_is_admin())',t.tablename);
    end if;
  end loop;
  -- Legacy views must obey underlying RLS as well.
  for t in select viewname from pg_views where schemaname='public' loop
    execute format('alter view public.%I set (security_invoker=true)',t.viewname);
    execute format('revoke all on public.%I from public, anon',t.viewname);
    execute format('grant select on public.%I to authenticated',t.viewname);
  end loop;
end $$;
grant usage on all sequences in schema public to authenticated;
grant execute on function public.live_player_id(),public.live_is_admin(),public.live_identity(),public.live_status(bigint),
  public.live_create_invite(bigint),public.live_redeem_invite(text),public.live_save_pick(bigint,integer,text,text,integer),
  public.live_configure_allocation(bigint,bigint[]),public.live_configure_rotation(bigint[]),public.live_next_round(),public.live_admin_picks(bigint,bigint,jsonb),
  public.live_correct_result(bigint,integer,text,text,text) to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

do $$ declare t text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['live_draws','live_events','live_picks','live_results','rounds','round_players'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;
commit;
