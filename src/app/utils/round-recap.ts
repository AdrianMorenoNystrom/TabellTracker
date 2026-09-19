import { Round } from '../interfaces/round';
import { calculatePlacementHistory, calculatePlacementSummaries, calculateRoundWins, getRoundWinners } from './standings';
import { calculatePlayerPerformance } from './player-performance';

/** A detached presentation model. Never updated while a story is open. */
export function buildRoundRecap(rounds: Round[], roundId: number) {
  const target = rounds.find(round => round.id === roundId);
  if (!target) throw new Error('Omgången saknas');
  const ordered = rounds.filter(round => round.seasonId === target.seasonId)
    .sort((a, b) => a.roundNumber - b.roundNumber || a.week - b.week || a.id - b.id);
  const history = structuredClone(ordered.slice(0, ordered.findIndex(round => round.id === roundId) + 1));
  const round = history.at(-1)!;
  const placements = calculatePlacementHistory(history);
  const after = placements.at(-1)!.standings;
  const before = placements.at(-2)?.standings ?? [];
  const summaries = calculatePlacementSummaries(history);
  const performances = calculatePlayerPerformance(history, []);
  const standings = after.map(entry => ({ ...entry,
    change: summaries.find(player => player.name === entry.name)!.placementChange,
    previousPlacement: summaries.find(player => player.name === entry.name)!.previousPlacement,
  }));
  const leaders = after.filter(player => player.placement === 1).map(player => player.name);
  const oldLeaders = before.filter(player => player.placement === 1).map(player => player.name);
  const newLeaders = leaders.filter(name => !oldLeaders.includes(name));
  const tableHeadline = !before.length ? 'Säsongens första tabell'
    : newLeaders.length ? `${newLeaders.join(' & ')} ${leaders.length > 1 ? 'delar nu ledningen' : 'är ny serieledare'}`
    : standings.every(player => player.change === 0) ? 'Oförändrad tabell'
    : `${leaders.join(' & ')} ${leaders.length > 1 ? 'delar fortsatt ledningen' : 'behåller ledningen'}`;
  const stats = performances.map(player => ({ name: player.name,
    accuracy: player.currentSeasonAccuracy ?? 0, form: player.currentFormAccuracy ?? 0,
    wins: calculateRoundWins(history, player.name).total,
  }));
  const best = (key: 'accuracy' | 'form' | 'wins') => {
    const value = Math.max(...stats.map(player => player[key]));
    return { value, names: stats.filter(player => player[key] === value).map(player => player.name) };
  };
  const average = history.reduce((sum, item) => sum + item.totalScore, 0) / history.length;
  const previousAverage = history.length > 1
    ? history.slice(0, -1).reduce((sum, item) => sum + item.totalScore, 0) / (history.length - 1) : null;
  const firstFull = round.players.find(player => player.score === player.matchesPicked &&
    !history.slice(0, -1).some(item => item.players.some(previous => previous.name === player.name &&
      previous.matchesPicked === player.matchesPicked && previous.score === previous.matchesPicked)));
  return {
    round, winners: getRoundWinners(round),
    players: [...round.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'sv')),
    highlight: firstFull ? `Första ${firstFull.score}/${firstFull.matchesPicked} för ${firstFull.name} den här säsongen` : null,
    standings, tableHeadline, count: history.length, average,
    averageChange: previousAverage == null ? null : average - previousAverage,
    accuracy: best('accuracy'), form: best('form'), wins: best('wins'),
  };
}

export type RoundRecap = ReturnType<typeof buildRoundRecap>;
