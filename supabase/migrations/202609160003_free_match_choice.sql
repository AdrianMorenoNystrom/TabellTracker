begin;
select pg_advisory_xact_lock(4971002);

-- Rotation defines only 3/4 match quotas. Players claim any available match.
-- Retain historical picks and template rows, but retire the template RPC.
drop function public.live_configure_allocation(bigint,bigint[]);
update public.live_events e set player_id=null
from public.live_draws d
where d.draw_number=e.draw_number and d.status not in ('locked','settled') and d.reg_close_time>clock_timestamp()
  and not exists(select 1 from public.live_picks p where p.draw_number=e.draw_number
    and p.event_number=e.event_number and p.match_id=e.match_id and p.pick<>'');

update public.live_draws d set status='open'
where status='draft' and reg_close_time>clock_timestamp()
  and coalesce(reg_open_time,'-infinity')<=clock_timestamp() and lower(draw_state)='open'
  and (select count(*) from public.live_events e where e.draw_number=d.draw_number)=13;

create or replace function public.live_status(p_draw_number bigint) returns table(
  player_id bigint, assigned bigint, picked bigint, halves bigint, singles bigint, complete boolean
) language sql stable security invoker set search_path = '' as $$
  select m.player_id, q.quota, count(*) filter(where length(p.pick)>0),
    count(*) filter(where length(p.pick)=2), count(*) filter(where length(p.pick)=1),
    count(*) filter(where length(p.pick)=2)=2 and count(*) filter(where length(p.pick)=1)=q.quota-2
  from public.live_draws d cross join public.live_members m
    cross join lateral (select (case when m.player_id=d.four_player_id then 4 else 3 end)::bigint as quota) q
    left join public.live_events e on e.draw_number=d.draw_number and e.player_id=m.player_id
    left join public.live_picks p on p.draw_number=e.draw_number and p.event_number=e.event_number and p.match_id=e.match_id
  where d.draw_number=p_draw_number
  group by m.player_id,q.quota
$$;

-- JSON includes the saved owner and revision in the same atomic response.
drop function public.live_save_pick(bigint,integer,text,text,integer);
create function public.live_save_pick(p_draw_number bigint,p_event_number integer,p_pick text,p_match_id text,
  p_revision integer,p_player_id bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.live_draws; e public.live_events; previous public.live_picks; saved public.live_picks;
  admin boolean; actor bigint; target bigint; quota integer; picked integer; halves integer; singles integer;
begin
  -- Claims, releases, quotas, imports and settlement share one transaction lock.
  perform pg_advisory_xact_lock(4971002);
  actor := public.live_player_id();
  admin := public.live_is_admin();
  if actor is null then raise exception 'Aktivt medlemskap krävs' using errcode='42501'; end if;
  select * into d from public.live_draws where draw_number=p_draw_number for update;
  if not found then raise exception 'Kupongen saknas'; end if;
  select * into e from public.live_events where draw_number=p_draw_number and event_number=p_event_number;
  if not found or e.match_id is distinct from p_match_id then raise exception 'Matchen har ändrats. Ladda om.'; end if;
  if not admin and (d.status<>'open' or d.reg_close_time<=clock_timestamp()
    or d.reg_open_time>clock_timestamp()) then
    raise exception 'Du får inte ändra detta tips efter spelstopp eller före öppning' using errcode='42501'; end if;
  if not admin and ((e.player_id is not null and e.player_id<>actor)
    or (p_player_id is not null and p_player_id<>actor)) then
    raise exception 'Matchen är redan tagen av en annan spelare' using errcode='42501'; end if;
  if e.player_id is not null and p_player_id is not null and e.player_id<>p_player_id then
    raise exception 'Matchen är redan tagen av en annan spelare'; end if;
  target := coalesce(e.player_id,p_player_id,actor);
  if not exists(select 1 from public.live_members where player_id=target and active) then
    raise exception 'Spelaren saknas eller är inaktiverad'; end if;
  quota := case when target=d.four_player_id then 4 else 3 end;
  if p_pick is null or p_pick not in ('','1','X','2','1X','12','X2') then raise exception 'Högst två tecken per match'; end if;
  select * into previous from public.live_picks where draw_number=p_draw_number and event_number=p_event_number;
  if coalesce(previous.revision,0) is distinct from p_revision then
    raise exception 'Tipset har ändrats på en annan enhet. Ladda om.' using errcode='40001'; end if;
  select count(*) filter(where p.pick<>''),count(*) filter(where length(p.pick)=2),count(*) filter(where length(p.pick)=1)
    into picked,halves,singles
    from public.live_events ev join public.live_picks p using(draw_number,event_number,match_id)
    where ev.draw_number=p_draw_number and ev.player_id=target and ev.event_number<>p_event_number;
  if p_pick<>'' and picked>=quota then raise exception 'Du har redan valt dina % matcher',quota; end if;
  if length(p_pick)=2 and halves>=2 then raise exception 'Högst två halvgarderingar per spelare'; end if;
  if length(p_pick)=1 and singles>=quota-2 then raise exception 'Högst % spikar för spelaren denna omgång',quota-2; end if;
  if d.status='settled' and (p_pick='' or length(p_pick)<>length(previous.pick)) then
    raise exception 'En rättad omgång måste förbli komplett. Använd en samlad adminrättning.'; end if;
  update public.live_events set player_id=case when p_pick='' then null else target end
    where draw_number=p_draw_number and event_number=p_event_number;
  insert into public.live_picks(draw_number,event_number,pick,match_id,revision,updated_by,entered_by_admin)
    values(p_draw_number,p_event_number,p_pick,p_match_id,coalesce(previous.revision,0)+1,auth.uid(),admin)
  on conflict(draw_number,event_number) do update set pick=excluded.pick,match_id=excluded.match_id,
    revision=excluded.revision,updated_by=excluded.updated_by,entered_by_admin=excluded.entered_by_admin,updated_at=clock_timestamp()
  returning * into saved;
  insert into public.live_pick_audit(draw_number,event_number,old_pick,new_pick,match_id,updated_by,entered_by_admin)
    values(p_draw_number,p_event_number,previous.pick,p_pick,p_match_id,auth.uid(),admin);
  perform public.live_settle(p_draw_number);
  return to_jsonb(saved)||jsonb_build_object('player_id',case when p_pick='' then null else target end);
end $$;
revoke all on function public.live_save_pick(bigint,integer,text,text,integer,bigint) from public,anon;
grant execute on function public.live_save_pick(bigint,integer,text,text,integer,bigint) to authenticated;

create or replace function public.live_admin_picks(p_draw_number bigint,p_player_id bigint,p_picks jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare ev jsonb; previous public.live_picks; assigned integer;
begin
  if not public.live_is_admin() then raise exception 'Endast admin' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(4971002);
  select case when four_player_id=p_player_id then 4 else 3 end into assigned
    from public.live_draws where draw_number=p_draw_number;
  if assigned is null or not exists(select 1 from public.live_members where player_id=p_player_id and active) then
    raise exception 'Spelaren eller kupongen saknas'; end if;
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

create or replace function public.live_import_draw(p_draw jsonb,p_raw jsonb,p_retrieved_at timestamptz,p_next_fetch_at timestamptz)
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
      null,
      nullif(ev->'odds','null'::jsonb),nullif(ev->'crowd','null'::jsonb),(ev->>'odds_source_updated_at')::timestamptz,
      (ev->>'crowd_source_updated_at')::timestamptz,
      case when nullif(ev->'odds','null'::jsonb) is not null then p_retrieved_at end,
      case when nullif(ev->'crowd','null'::jsonb) is not null then p_retrieved_at end)
    on conflict(draw_number,event_number) do update set
      match_id=excluded.match_id,home_team=excluded.home_team,away_team=excluded.away_team,kickoff=excluded.kickoff,
      league=excluded.league,country=excluded.country,sport_event_status=excluded.sport_event_status,cancelled=excluded.cancelled,
      player_id=case when live_events.match_id<>excluded.match_id then null else live_events.player_id end,
      odds=case when live_events.match_id<>excluded.match_id then excluded.odds else coalesce(excluded.odds,live_events.odds) end,
      crowd=case when live_events.match_id<>excluded.match_id then excluded.crowd else coalesce(excluded.crowd,live_events.crowd) end,
      odds_source_updated_at=case when excluded.odds is not null or live_events.match_id<>excluded.match_id then excluded.odds_source_updated_at else live_events.odds_source_updated_at end,
      crowd_source_updated_at=case when excluded.crowd is not null or live_events.match_id<>excluded.match_id then excluded.crowd_source_updated_at else live_events.crowd_source_updated_at end,
      odds_retrieved_at=case when live_events.match_id<>excluded.match_id then excluded.odds_retrieved_at else coalesce(excluded.odds_retrieved_at,live_events.odds_retrieved_at) end,
      crowd_retrieved_at=case when live_events.match_id<>excluded.match_id then excluded.crowd_retrieved_at else coalesce(excluded.crowd_retrieved_at,live_events.crowd_retrieved_at) end;
  end loop;
  ready := (select count(*) from public.live_events where draw_number=dn)=13;
  update public.live_draws set reg_open_time=(p_draw->>'reg_open_time')::timestamptz,reg_close_time=(p_draw->>'reg_close_time')::timestamptz,
    draw_state=p_draw->>'draw_state',retrieved_at=p_retrieved_at,next_fetch_at=p_next_fetch_at,last_error=null,
    status=case when (p_draw->>'reg_close_time')::timestamptz<=clock_timestamp() then 'locked'
      when ready and lower(p_draw->>'draw_state')='open' and coalesce((p_draw->>'reg_open_time')::timestamptz,'-infinity')<=clock_timestamp() then 'open' else 'draft' end
    where draw_number=dn;
  return dn;
end $$;

commit;
