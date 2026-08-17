import { Player } from '../interfaces/player';
import { Round } from '../interfaces/round';
import { calculatePlayerForecasts } from './player-forecast';

describe('calculatePlayerForecasts', () => {
  it('combines season pace and the last five rounds', () => {
    const current = [
      round(1, 0),
      round(2, 0),
      round(3, 0),
      round(4, 3),
      round(5, 3),
      round(6, 3),
    ];
    const previous = Array.from({ length: 10 }, (_, index) =>
      round(index + 1, 0)
    );

    const forecast = calculatePlayerForecasts(current, previous)[0];

    // Season: 50%, latest five: 60% => weighted prediction: 54%.
    expect(forecast.predictionAccuracy).toBe(54);
    expect(forecast.predictedNextScore).toBe(1.6);
    expect(forecast.predictedNextPossible).toBe(3);
    expect(forecast.projectedFinalScore).toBe(15);
    expect(forecast.remainingRounds).toBe(4);
  });

  it('does not invent a season-end total without a previous season', () => {
    const forecast = calculatePlayerForecasts([round(1, 2, 4)], [])[0];

    expect(forecast.predictedNextScore).toBe(2);
    expect(forecast.predictedNextPossible).toBe(4);
    expect(forecast.projectedFinalScore).toBeNull();
    expect(forecast.projectedSeasonRounds).toBeNull();
  });
});

function round(roundNumber: number, score: number, matchesPicked = 3): Round {
  const player: Player = {
    id: 1,
    name: 'Kim',
    score,
    total_matches: matchesPicked,
    avg_score_per_round: score,
    matchesPicked,
  };

  return {
    id: roundNumber,
    roundNumber,
    week: roundNumber,
    totalScore: score,
    players: [player],
  };
}
