import { Round } from '../interfaces/round';

const SEASON_WEIGHT = 0.6;
const FORM_WEIGHT = 0.4;
const FORM_ROUNDS = 5;

export interface PlayerForecast {
  name: string;
  predictedNextScore: number;
  predictedNextPossible: number;
  projectedFinalScore: number | null;
  projectedSeasonRounds: number | null;
  remainingRounds: number | null;
  predictionAccuracy: number;
}

type Result = {
  score: number;
  matchesPicked: number;
};

/**
 * A transparent pace forecast, not a claim about the actual coupons.
 * Current-season accuracy carries 60% and the last five played rounds 40%.
 */
export function calculatePlayerForecasts(
  currentRounds: Round[],
  previousRounds: Round[]
): PlayerForecast[] {
  const sortedCurrent = [...currentRounds].sort(
    (a, b) => a.roundNumber - b.roundNumber
  );
  const latestRoundNumber = sortedCurrent.at(-1)?.roundNumber ?? 0;
  const previousSeasonRounds = previousRounds.reduce(
    (highest, round) => Math.max(highest, round.roundNumber),
    0
  );
  const projectedSeasonRounds = previousSeasonRounds
    ? Math.max(previousSeasonRounds, latestRoundNumber)
    : null;

  const names = Array.from(
    new Set(
      sortedCurrent.flatMap((round) =>
        (round.players ?? []).map((player) => player.name)
      )
    )
  ).sort((a, b) => a.localeCompare(b, 'sv'));

  return names.flatMap((name) => {
    const results = resultsForPlayer(sortedCurrent, name);
    if (!results.length) return [];

    const seasonAccuracy = accuracy(results);
    const formAccuracy = accuracy(results.slice(-FORM_ROUNDS));
    const predictionAccuracy =
      seasonAccuracy * SEASON_WEIGHT + formAccuracy * FORM_WEIGHT;
    const predictedNextPossible = results.at(-1)?.matchesPicked ?? 3;
    const predictedNextScore = roundToOneDecimal(
      predictionAccuracy * predictedNextPossible
    );
    const currentScore = results.reduce((sum, result) => sum + result.score, 0);
    const remainingRounds =
      projectedSeasonRounds == null
        ? null
        : Math.max(0, projectedSeasonRounds - latestRoundNumber);
    const projectedFinalScore =
      remainingRounds == null
        ? null
        : Math.round(currentScore + predictedNextScore * remainingRounds);

    return [
      {
        name,
        predictedNextScore,
        predictedNextPossible,
        projectedFinalScore,
        projectedSeasonRounds,
        remainingRounds,
        predictionAccuracy: roundToOneDecimal(predictionAccuracy * 100),
      },
    ];
  });
}

function resultsForPlayer(rounds: Round[], name: string): Result[] {
  return rounds.flatMap((round) => {
    const player = round.players?.find((candidate) => candidate.name === name);
    if (!player) return [];

    return [
      {
        score: Number(player.score) || 0,
        matchesPicked: Number(player.matchesPicked) || 3,
      },
    ];
  });
}

function accuracy(results: Result[]): number {
  const score = results.reduce((sum, result) => sum + result.score, 0);
  const possible = results.reduce(
    (sum, result) => sum + result.matchesPicked,
    0
  );
  return possible ? score / possible : 0;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
