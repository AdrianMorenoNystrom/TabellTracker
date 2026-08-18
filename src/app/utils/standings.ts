import { Round } from '../interfaces/round';

export interface StandingEntry {
  name: string;
  score: number;
  matchesPicked: number;
  placement: number;
}

export interface PlacementSnapshot {
  roundNumber: number;
  week: number;
  standings: StandingEntry[];
}

export interface PlayerPlacementSummary {
  name: string;
  currentPlacement: number;
  previousPlacement: number | null;
  placementChange: number | null;
  bestPlacement: number;
}

export interface RoundWinSummary {
  total: number;
  solo: number;
  shared: number;
}

export function calculatePlacementHistory(rounds: Round[]): PlacementSnapshot[] {
  const totals = new Map<string, { score: number; matchesPicked: number }>();

  return [...rounds]
    .sort(
      (a, b) =>
        a.roundNumber - b.roundNumber || a.week - b.week || a.id - b.id
    )
    .map((round) => {
      for (const player of round.players ?? []) {
        const current = totals.get(player.name) ?? { score: 0, matchesPicked: 0 };
        current.score += Number(player.score) || 0;
        current.matchesPicked += Number(player.matchesPicked) || 3;
        totals.set(player.name, current);
      }

      const sorted = Array.from(totals, ([name, total]) => ({ name, ...total })).sort(
        (a, b) =>
          b.score - a.score ||
          a.matchesPicked - b.matchesPicked ||
          a.name.localeCompare(b.name, 'sv')
      );

      const standings: StandingEntry[] = [];
      sorted.forEach((entry, index) => {
        const previous = standings[index - 1];
        const sharesPreviousPlacement =
          previous &&
          previous.score === entry.score &&
          previous.matchesPicked === entry.matchesPicked;
        standings.push({
          ...entry,
          placement: sharesPreviousPlacement ? previous.placement : index + 1,
        });
      });

      return {
        roundNumber: round.roundNumber,
        week: round.week,
        standings,
      };
    });
}

export function calculatePlacementSummaries(
  rounds: Round[]
): PlayerPlacementSummary[] {
  const history = calculatePlacementHistory(rounds);
  const latest = history.at(-1);
  const previous = history.at(-2);
  if (!latest) return [];

  return latest.standings.map((standing) => {
    const previousPlacement =
      previous?.standings.find((entry) => entry.name === standing.name)?.placement ??
      null;
    const bestPlacement = Math.min(
      ...history.flatMap((snapshot) => {
        const entry = snapshot.standings.find(
          (candidate) => candidate.name === standing.name
        );
        return entry ? [entry.placement] : [];
      })
    );

    return {
      name: standing.name,
      currentPlacement: standing.placement,
      previousPlacement,
      placementChange:
        previousPlacement == null
          ? null
          : previousPlacement - standing.placement,
      bestPlacement,
    };
  });
}

export function getRoundWinners(round: Round): string[] {
  const players = round.players ?? [];
  if (!players.length) return [];
  const winningScore = Math.max(...players.map((player) => Number(player.score) || 0));
  return players
    .filter((player) => (Number(player.score) || 0) === winningScore)
    .map((player) => player.name)
    .sort((a, b) => a.localeCompare(b, 'sv'));
}

export function calculateRoundWins(
  rounds: Round[],
  playerName: string
): RoundWinSummary {
  return rounds.reduce<RoundWinSummary>(
    (summary, round) => {
      const winners = getRoundWinners(round);
      if (!winners.includes(playerName)) return summary;
      summary.total++;
      if (winners.length === 1) summary.solo++;
      else summary.shared++;
      return summary;
    },
    { total: 0, solo: 0, shared: 0 }
  );
}
