begin;

-- Stable league membership, not the replaceable auth/device id.
create table public.round_recap_views (
  round_id bigint not null references public.rounds(id) on delete cascade,
  member_id bigint not null references public.live_members(player_id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (round_id, member_id)
);
alter table public.round_recap_views enable row level security;
revoke all on public.round_recap_views from public, anon, authenticated;
grant select on public.round_recap_views to authenticated;
create policy recap_own_read on public.round_recap_views for select to authenticated
  using (member_id = public.live_player_id());
-- Writes go exclusively through the acknowledgement RPC below.

-- A complete manually registered round also counts as final. A linked live
-- coupon must explicitly be settled. Partial manual inserts never qualify.
create function public.recap_completed_rounds() returns setof public.rounds
language sql stable security invoker set search_path = '' as $$
  select r.* from public.rounds r
  where public.live_player_id() is not null
    and not exists (select 1 from public.live_draws d
      where d.round_id = r.id and d.status <> 'settled')
    and exists (select 1 from public.round_players rp where rp.round_id = r.id
      group by rp.round_id having count(*) = 4 and count(distinct rp.player_id) = 4
        and sum(rp.matches_picked) = 13
        and count(*) filter (where rp.matches_picked = 4) = 1
        and bool_and(coalesce(rp.matches_picked in (3,4) and rp.score between 0 and rp.matches_picked, false))
        and sum(rp.score) = r.totalscore)
$$;

-- One SQL snapshot: latest final round + its season history + own receipt.
-- Select latest FIRST, then check seen: old/backfilled rounds cannot resurface.
create function public.round_recap_pending() returns jsonb
language sql stable security invoker set search_path = '' as $$
  with completed as materialized (select * from public.recap_completed_rounds()),
  latest as (
    select r.* from completed r join public.seasons s on s.id = r.season_id
    order by s.start_year desc, s.id desc, r.roundnumber desc, r.week desc, r.id desc limit 1
  )
  select jsonb_build_object('round_id', t.id, 'rounds', (
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'roundNumber', r.roundnumber, 'week', r.week, 'totalScore', r.totalscore,
      'seasonId', r.season_id, 'seasonName', s.name,
      'players', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
        'score', rp.score, 'matchesPicked', rp.matches_picked) order by p.id)
        from public.round_players rp join public.players p on p.id = rp.player_id where rp.round_id = r.id)
    ) order by r.roundnumber, r.week, r.id)
    from completed r join public.seasons s on s.id = r.season_id
    where r.season_id = t.season_id and (r.roundnumber,r.week,r.id) <= (t.roundnumber,t.week,t.id)
  )) from latest t where not exists (
    select 1 from public.round_recap_views v where v.round_id = t.id and v.member_id = public.live_player_id()
  )
$$;

create function public.round_recap_acknowledge(p_round_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare member bigint := public.live_player_id(); target public.rounds; target_year integer;
begin
  if member is null then raise exception 'Aktivt medlemskap krävs' using errcode = '42501'; end if;
  select * into target from public.recap_completed_rounds() where id = p_round_id;
  if not found then raise exception 'Omgången är inte färdigregistrerad'; end if;
  select start_year into target_year from public.seasons where id = target.season_id;
  -- A new round settling during an open recap must remain unseen.
  insert into public.round_recap_views(round_id, member_id)
  select r.id, member from public.recap_completed_rounds() r join public.seasons s on s.id = r.season_id
  where (s.start_year,s.id,r.roundnumber,r.week,r.id)
    <= (target_year,target.season_id,target.roundnumber,target.week,target.id)
  on conflict (round_id, member_id) do nothing;
end $$;

revoke all on function public.recap_completed_rounds(), public.round_recap_pending(),
  public.round_recap_acknowledge(bigint) from public, anon, authenticated;
grant execute on function public.recap_completed_rounds(), public.round_recap_pending(),
  public.round_recap_acknowledge(bigint) to authenticated;
commit;
