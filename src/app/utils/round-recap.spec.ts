import { Round } from '../interfaces/round';
import { buildRoundRecap } from './round-recap';

export function recapRound(n: number, scores = [4, 2, 2, 1], quotas = [4, 3, 3, 3]): Round {
  return { id: n, roundNumber: n, week: n, seasonId: 1, seasonName: '2026/27',
    totalScore: scores.reduce((a, b) => a + b, 0),
    players: ['Ompen', 'Adrian', 'Sillen', 'Danne'].map((name, i) => ({
      id: i + 1, name, score: scores[i], matchesPicked: quotas[i], total_matches: quotas[i], avg_score_per_round: scores[i],
    })),
  };
}

describe('Round recap: historical domain model', () => {
  it('uses the actual team total, individual results, winner and first 4/4', () => {
    const recap = buildRoundRecap([recapRound(27)], 27);
    expect(recap.round.totalScore).toBe(9);
    expect(recap.players.map(player => [player.score, player.matchesPicked])).toEqual([[4,4],[2,3],[2,3],[1,3]]);
    expect(recap.winners).toEqual(['Ompen']);
    expect(recap.highlight).toBe('Första 4/4 för Ompen den här säsongen');
    expect(recap.average).toBe(9);
    expect(recap.accuracy).toEqual({ value: 100, names: ['Ompen'] });
    expect(recap.form).toEqual(recap.accuracy);
  });
  it('handles shared winners, 3/3 and shared table places with fewer picks winning ties', () => {
    const recap = buildRoundRecap([recapRound(27, [3,3,3,0])], 27);
    expect(recap.winners).toEqual(['Adrian', 'Ompen', 'Sillen']);
    expect(recap.highlight).toContain('3/3 för Adrian');
    expect(recap.standings.map(player => [player.name, player.placement])).toEqual([
      ['Adrian',1],['Sillen',1],['Ompen',3],['Danne',4],
    ]);
    expect(recap.wins).toEqual({ value: 1, names: ['Adrian','Ompen','Sillen'] });
  });
  it('computes before/after placements, up, down, unchanged and a new leader', () => {
    const recap = buildRoundRecap([recapRound(26,[1,3,2,0]), recapRound(27,[4,0,0,0])],27);
    expect(recap.tableHeadline).toBe('Ompen är ny serieledare');
    expect(recap.standings.map(player => [player.name, player.previousPlacement, player.change])).toEqual([
      ['Ompen',3,2],['Adrian',1,-1],['Sillen',2,-1],['Danne',4,0],
    ]);
  });
  it('handles unchanged standings and a newly shared lead without claiming a solo lead', () => {
    expect(buildRoundRecap([recapRound(26),recapRound(27)],27).tableHeadline).toBe('Oförändrad tabell');
    const recap = buildRoundRecap([recapRound(26,[0,3,2,0]),recapRound(27,[0,0,1,0])],27);
    expect(recap.tableHeadline).toBe('Sillen delar nu ledningen');
    expect(recap.standings.filter(player => player.placement === 1).length).toBe(2);
  });
  it('round 28 and another season cannot affect ANY of round 27 recap; copies its inputs', () => {
    const historical = [recapRound(26,[1,2,3,0]),recapRound(27)];
    const expected = buildRoundRecap(historical,27);
    const input = [...historical,recapRound(28,[0,0,0,3]),{...recapRound(100),seasonId:2}];
    const actual = buildRoundRecap(input,27);
    expect(actual).toEqual(expected);
    input[1].players[0].score = 0;
    expect(actual).toEqual(expected);
  });
  it('uses five latest registered results weighted by actual 3/4 quotas, and all rounds for accuracy', () => {
    const rounds = [recapRound(21,[4,0,0,0]), ...[23,24,25,26,27].map(n => recapRound(n,[1,0,0,0]))];
    const recap = buildRoundRecap(rounds,27);
    expect(recap.form).toEqual({ value: 25, names: ['Ompen'] });
    expect(recap.accuracy).toEqual({ value: 37.5, names: ['Ompen'] });
    expect(recap.wins.value).toBe(6);
    expect(recap.average).toBe(1.5);
    expect(recap.averageChange).toBeCloseTo(-0.1);
    expect(recap.highlight).toBeNull();
  });
  it('weights form by actual match quotas when the four-match player rotates', () => {
    const recap = buildRoundRecap([recapRound(26,[4,0,0,0]),recapRound(27,[1,0,0,0],[3,4,3,3])],27);
    expect(recap.form).toEqual({value:71.4,names:['Ompen']}); // 5/7, not mean(100%,33.3%)
  });
});
