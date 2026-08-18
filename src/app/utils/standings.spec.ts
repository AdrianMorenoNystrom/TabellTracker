import { Player } from '../interfaces/player';
import { Round } from '../interfaces/round';
import {
  calculatePlacementHistory,
  calculatePlacementSummaries,
  calculateRoundWins,
  getRoundWinners,
} from './standings';

describe('standings', () => {
  const rounds = [
    round(1, [['Anna', 3], ['Bo', 2], ['Cleo', 1]]),
    round(2, [['Anna', 0], ['Bo', 3], ['Cleo', 2]]),
  ];

  it('calculates cumulative placement and movement', () => {
    const history = calculatePlacementHistory(rounds);
    const summaries = calculatePlacementSummaries(rounds);
    const bo = summaries.find((player) => player.name === 'Bo');

    expect(history[0].standings.find((player) => player.name === 'Bo')?.placement).toBe(2);
    expect(bo?.currentPlacement).toBe(1);
    expect(bo?.previousPlacement).toBe(2);
    expect(bo?.placementChange).toBe(1);
    expect(bo?.bestPlacement).toBe(1);
  });

  it('finds solo and shared round wins', () => {
    const sharedRound = round(3, [['Anna', 3], ['Bo', 3]]);

    expect(getRoundWinners(rounds[0])).toEqual(['Anna']);
    expect(getRoundWinners(sharedRound)).toEqual(['Anna', 'Bo']);
    expect(calculateRoundWins([...rounds, sharedRound], 'Anna')).toEqual({
      total: 2,
      solo: 1,
      shared: 1,
    });
  });
});

function round(
  roundNumber: number,
  results: Array<[string, number]>
): Round {
  return {
    id: roundNumber,
    roundNumber,
    week: roundNumber,
    totalScore: results.reduce((sum, [, score]) => sum + score, 0),
    players: results.map(([name, score], index): Player => ({
      id: index + 1,
      name,
      score,
      total_matches: 3,
      avg_score_per_round: score,
      matchesPicked: 3,
    })),
  };
}
