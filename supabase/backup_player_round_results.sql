-- Read-only säkerhetsexport före säsongsmigrationen.
-- Kör frågan i Supabase SQL Editor och välj sedan "Export CSV".
--
-- En rad motsvarar en spelares resultat i en omgång. ID-kolumnerna gör att
-- players, rounds och round_players kan kopplas ihop igen vid en återställning.

select
  r.id as round_id,
  r.roundnumber as round_number,
  r.week,
  r.totalscore as stored_round_total,
  rp.id as round_player_id,
  p.id as player_id,
  p.name as player_name,
  rp.score,
  rp.matches_picked,
  sum(rp.score) over (partition by r.id) as calculated_round_total,
  sum(rp.score) over (partition by p.id) as player_total_score,
  sum(rp.matches_picked) over (partition by p.id) as player_total_matches,
  count(*) over (partition by p.id) as player_rounds_played
from public.rounds r
join public.round_players rp
  on rp.round_id = r.id
join public.players p
  on p.id = rp.player_id
order by
  r.roundnumber,
  p.name,
  p.id;
