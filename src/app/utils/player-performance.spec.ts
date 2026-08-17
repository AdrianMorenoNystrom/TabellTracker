import { Round } from '../interfaces/round';
import { calculatePlayerPerformance } from './player-performance';

describe('calculatePlayerPerformance', () => {
  it('compares a player with the same stage of the previous season', () => {
    const current = [round(1, 'Adrian', 3, 3), round(2, 'Adrian', 3, 3)];
    const previous = [
      round(1, 'Adrian', 2, 3),
      round(2, 'Adrian', 2, 3),
      round(3, 'Adrian', 0, 3),
    ];

    const result = calculatePlayerPerformance(current, previous)[0];

    expect(result.currentSeasonAccuracy).toBe(100);
    expect(result.previousSeasonAccuracy).toBe(66.7);
    expect(result.currentScore).toBe(6);
    expect(result.currentPossible).toBe(6);
    expect(result.previousScore).toBe(4);
    expect(result.previousPossible).toBe(6);
    expect(result.seasonDifference).toBe(33.3);
    expect(result.formDifference).toBe(33.3);
    expect(result.status).toBe('above');
    expect(result.previousRounds).toBe(2);
  });

  it('normalizes form by matches picked', () => {
    const current = [round(1, 'Sillen', 2, 4)];
    const previous = [round(1, 'Sillen', 3, 3)];

    const result = calculatePlayerPerformance(current, previous)[0];

    expect(result.currentFormAccuracy).toBe(50);
    expect(result.previousFormAccuracy).toBe(100);
    expect(result.status).toBe('behind');
  });

  it('marks a player without previous results as new', () => {
    const result = calculatePlayerPerformance(
      [round(1, 'Ny spelare', 2, 3)],
      []
    )[0];

    expect(result.previousFormAccuracy).toBeNull();
    expect(result.formDifference).toBeNull();
    expect(result.status).toBe('new');
  });
});

function round(
  roundNumber: number,
  playerName: string,
  score: number,
  matchesPicked: number
): Round {
  return {
    id: roundNumber,
    roundNumber,
    week: roundNumber,
    totalScore: score,
    players: [
      {
        id: 1,
        name: playerName,
        score,
        total_matches: matchesPicked,
        avg_score_per_round: score,
        matchesPicked,
      },
    ],
  };
}
