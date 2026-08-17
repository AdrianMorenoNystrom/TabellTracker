import { Round } from '../interfaces/round';

export const FORM_WINDOW_SIZE = 5;
export const FORM_THRESHOLD_POINTS = 5;

export type PerformanceStatus = 'above' | 'level' | 'behind' | 'new' | 'no-data';

export interface PlayerPerformanceComparison {
  name: string;
  currentRounds: number;
  previousRounds: number;
  currentScore: number;
  currentPossible: number;
  previousScore: number;
  previousPossible: number;
  currentSeasonAccuracy: number | null;
  previousSeasonAccuracy: number | null;
  seasonDifference: number | null;
  currentFormAccuracy: number | null;
  previousFormAccuracy: number | null;
  formDifference: number | null;
  status: PerformanceStatus;
}

type PlayerRoundResult = {
  roundNumber: number;
  score: number;
  matchesPicked: number;
};

export function calculatePlayerPerformance(
  currentRounds: Round[],
  previousRounds: Round[]
): PlayerPerformanceComparison[] {
  const current = [...currentRounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const lastCurrentRound = current.at(-1)?.roundNumber ?? 0;
  const previousAtSameStage = previousRounds.filter(
    (round) => round.roundNumber <= lastCurrentRound
  );

  const playerNames = Array.from(
    new Set(
      [...current, ...previousRounds].flatMap((round) =>
        (round.players ?? []).map((player) => player.name)
      )
    )
  ).sort((a, b) => a.localeCompare(b, 'sv'));

  return playerNames.map((name) => {
    const currentResults = resultsForPlayer(current, name);
    const previousResults = resultsForPlayer(previousAtSameStage, name);
    const currentFormResults = currentResults.slice(-FORM_WINDOW_SIZE);
    const previousFormResults = currentFormResults.length
      ? previousResults.slice(-currentFormResults.length)
      : [];

    const currentTotals = totals(currentResults);
    const previousTotals = totals(previousResults);
    const currentSeasonAccuracy = accuracy(currentTotals);
    const previousSeasonAccuracy = accuracy(previousTotals);
    const seasonDifference =
      currentSeasonAccuracy == null || previousSeasonAccuracy == null
        ? null
        : roundToOneDecimal(currentSeasonAccuracy - previousSeasonAccuracy);
    const currentFormAccuracy = accuracy(totals(currentFormResults));
    const previousFormAccuracy = accuracy(totals(previousFormResults));
    const formDifference =
      currentFormAccuracy == null || previousFormAccuracy == null
        ? null
        : roundToOneDecimal(currentFormAccuracy - previousFormAccuracy);

    return {
      name,
      currentRounds: currentResults.length,
      previousRounds: previousResults.length,
      currentScore: currentTotals.score,
      currentPossible: currentTotals.possible,
      previousScore: previousTotals.score,
      previousPossible: previousTotals.possible,
      currentSeasonAccuracy,
      previousSeasonAccuracy,
      seasonDifference,
      currentFormAccuracy,
      previousFormAccuracy,
      formDifference,
      status: getStatus(currentResults.length, previousResults.length, formDifference),
    };
  });
}

function resultsForPlayer(rounds: Round[], name: string): PlayerRoundResult[] {
  return rounds
    .map((round) => {
      const result = round.players?.find((player) => player.name === name);
      if (!result) return null;

      return {
        roundNumber: round.roundNumber,
        score: Number(result.score) || 0,
        matchesPicked: Number(result.matchesPicked) || 3,
      };
    })
    .filter((result): result is PlayerRoundResult => result !== null)
    .sort((a, b) => a.roundNumber - b.roundNumber);
}

function totals(results: PlayerRoundResult[]): { score: number; possible: number } {
  return {
    score: results.reduce((sum, result) => sum + result.score, 0),
    possible: results.reduce((sum, result) => sum + result.matchesPicked, 0),
  };
}

function accuracy(result: { score: number; possible: number }): number | null {
  if (result.possible === 0) return null;
  return roundToOneDecimal((result.score / result.possible) * 100);
}

function getStatus(
  currentRounds: number,
  previousRounds: number,
  difference: number | null
): PerformanceStatus {
  if (currentRounds === 0) return 'no-data';
  if (previousRounds === 0 || difference == null) return 'new';
  if (difference >= FORM_THRESHOLD_POINTS) return 'above';
  if (difference <= -FORM_THRESHOLD_POINTS) return 'behind';
  return 'level';
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
