import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { ApiService } from '../../services/api.service';
import { Round } from '../../interfaces/round';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, registerables } from 'chart.js';
import { forkJoin, of } from 'rxjs';
import { Season } from '../../interfaces/season';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import {
  calculatePlayerPerformance,
  FORM_THRESHOLD_POINTS,
  FORM_WINDOW_SIZE,
  PerformanceStatus,
  PlayerPerformanceComparison,
} from '../../utils/player-performance';
import { calculatePlacementHistory } from '../../utils/standings';
Chart.register(...registerables);
@Component({
  selector: 'app-total-score-data',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    BaseChartDirective,
    MatButtonToggleModule,
    MatButtonModule,
  ],
  templateUrl: './total-score-data.component.html',
  styleUrl: './total-score-data.component.scss'
})
export class TotalScoreDataComponent {
  readonly formWindowSize = FORM_WINDOW_SIZE;
  readonly formThresholdPoints = FORM_THRESHOLD_POINTS;

  loading = true;
  error: string | null = null;
  viewMode: 'total' | 'players' | 'placements' = 'total';
  placementSeasonView: 'current' | 'previous' = 'current';
  currentSeasonName = '';
  previousSeasonName: string | null = null;
  playerPerformance: PlayerPerformanceComparison[] = [];
  selectedPlayerNames: string[] = [];
  latestComparison: {
    roundNumber: number;
    currentScore: number;
    previousScore: number | null;
    difference: number | null;
  } | null = null;

  chartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom' },
      tooltip: {
        callbacks: {
          title: (items) => items[0]?.label ?? '',
          label: (item) => `Totalt rätt: ${item.parsed.y}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1 }
      }
    },
    elements: { point: { radius: 3 }, line: { tension: 0.3 } }
  };

  playerChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  playerChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom' },
      tooltip: {
        callbacks: {
          label: (item) => `${item.dataset.label}: ${item.parsed.y ?? 0}%`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: (value) => `${value}%`,
        },
      },
    },
  };

  placementChartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: [],
  };
  previousPlacementChartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: [],
  };
  placementChartOptions: ChartOptions<'line'> = this.createPlacementChartOptions(4);
  previousPlacementChartOptions: ChartOptions<'line'> =
    this.createPlacementChartOptions(4);

  constructor(private api: ApiService) {}

  private createPlacementChartOptions(startPosition: number): ChartOptions<'line'> {
    return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'bottom' },
      tooltip: {
        callbacks: {
          label: (item) => `${item.dataset.label}: plats ${item.parsed.y}`,
        },
      },
    },
    scales: {
      y: {
        min: 1,
        max: Math.max(2, startPosition),
        reverse: true,
        title: { display: true, text: 'Placering' },
        ticks: {
          stepSize: 1,
          callback: (value) =>
            Number(value) === startPosition ? 'Start' : `#${value}`,
        },
      },
      x: {
        title: { display: true, text: 'Omgång' },
      },
    },
    elements: {
      point: { radius: 4, hoverRadius: 6 },
      line: { tension: 0.2, borderWidth: 2.5 },
    },
    };
  };

  ngOnInit() {
    this.api.getSeasons().subscribe({
      next: (seasons) => this.loadSeasonComparison(seasons),
      error: () => {
        this.error = 'Kunde inte ladda säsongerna.';
        this.loading = false;
      },
    });
  }

  private loadSeasonComparison(seasons: Season[]) {
    const current = seasons.find((season) => season.isCurrent);

    if (!current) {
      this.error = 'Ingen aktuell säsong är konfigurerad.';
      this.loading = false;
      return;
    }

    const previous = seasons
      .filter((season) => season.startYear < current.startYear)
      .sort((a, b) => b.startYear - a.startYear)[0];

    this.currentSeasonName = current.name;
    this.previousSeasonName = previous?.name ?? null;

    forkJoin({
      currentRounds: this.api.getRounds(current.id),
      previousRounds: previous ? this.api.getRounds(previous.id) : of([] as Round[]),
    }).subscribe({
      next: ({ currentRounds, previousRounds }) => {
        this.buildComparison(currentRounds, previousRounds);
        this.buildPlayerPerformance(currentRounds, previousRounds);
        const placementHistory = calculatePlacementHistory(currentRounds);
        const previousPlacementHistory = calculatePlacementHistory(previousRounds);
        const playerCount = new Set(
          placementHistory.flatMap((snapshot) =>
            snapshot.standings.map((standing) => standing.name)
          )
        ).size;
        const previousPlayerCount = new Set(
          previousPlacementHistory.flatMap((snapshot) =>
            snapshot.standings.map((standing) => standing.name)
          )
        ).size;
        const startPosition = Math.max(2, playerCount + 1);
        const previousStartPosition = Math.max(2, previousPlayerCount + 1);
        this.placementChartData = this.buildPlacementHistory(
          placementHistory,
          startPosition
        );
        this.previousPlacementChartData = this.buildPlacementHistory(
          previousPlacementHistory,
          previousStartPosition
        );
        this.placementChartOptions = this.createPlacementChartOptions(startPosition);
        this.previousPlacementChartOptions =
          this.createPlacementChartOptions(previousStartPosition);
        this.loading = false;
      },
      error: () => {
        this.error = 'Kunde inte ladda säsongsjämförelsen.';
        this.loading = false;
      },
    });
  }

  private buildComparison(currentRounds: Round[], previousRounds: Round[]) {
    const current = [...currentRounds].sort((a, b) => a.roundNumber - b.roundNumber);
    const lastCurrentRound = current.at(-1);

    if (!lastCurrentRound) {
      this.chartData = { labels: [], datasets: [] };
      this.latestComparison = null;
      return;
    }

    const previous = [...previousRounds]
      .filter((round) => round.roundNumber <= lastCurrentRound.roundNumber)
      .sort((a, b) => a.roundNumber - b.roundNumber);

    const roundNumbers = Array.from(
      new Set([...current, ...previous].map((round) => round.roundNumber))
    ).sort((a, b) => a - b);

    const currentByRound = new Map(current.map((round) => [round.roundNumber, round.totalScore]));
    const previousByRound = new Map(previous.map((round) => [round.roundNumber, round.totalScore]));

    this.chartData = {
      labels: roundNumbers.map((roundNumber) => `Omg ${roundNumber}`),
      datasets: [
        {
          type: 'line',
          label: this.currentSeasonName,
          data: roundNumbers.map((roundNumber) => currentByRound.get(roundNumber) ?? null),
          borderColor: '#00427A',
          backgroundColor: '#00427A',
          spanGaps: true,
        },
        {
          type: 'line',
          label: this.previousSeasonName ?? 'Föregående säsong',
          data: roundNumbers.map((roundNumber) => previousByRound.get(roundNumber) ?? null),
          borderColor: '#7A8490',
          backgroundColor: '#7A8490',
          borderDash: [6, 4],
          spanGaps: true,
        },
      ],
    };

    const previousScore = previousByRound.get(lastCurrentRound.roundNumber) ?? null;
    this.latestComparison = {
      roundNumber: lastCurrentRound.roundNumber,
      currentScore: lastCurrentRound.totalScore,
      previousScore,
      difference: previousScore == null ? null : lastCurrentRound.totalScore - previousScore,
    };
  }

  setViewMode(mode: 'total' | 'players' | 'placements') {
    this.viewMode = mode;
  }

  setPlacementSeasonView(season: 'current' | 'previous') {
    this.placementSeasonView = season;
  }

  setSelectedPlayers(names: string[]) {
    this.selectedPlayerNames = names;
    this.buildPlayerChart();
  }

  get selectedPlayerPerformance(): PlayerPerformanceComparison[] {
    return this.playerPerformance.filter((player) =>
      this.selectedPlayerNames.includes(player.name)
    );
  }

  selectAllPlayers() {
    this.selectedPlayerNames = this.playerPerformance.map((player) => player.name);
    this.buildPlayerChart();
  }

  clearPlayerSelection() {
    this.selectedPlayerNames = [];
    this.buildPlayerChart();
  }

  statusLabel(status: PerformanceStatus): string {
    switch (status) {
      case 'above':
        return 'Överpresterar';
      case 'behind':
        return 'Ligger efter';
      case 'level':
        return 'I nivå';
      case 'new':
        return 'Saknar jämförelse';
      default:
        return 'Ingen form ännu';
    }
  }

  private buildPlayerPerformance(currentRounds: Round[], previousRounds: Round[]) {
    this.playerPerformance = calculatePlayerPerformance(currentRounds, previousRounds).sort(
      (a, b) => {
        if (a.formDifference == null && b.formDifference != null) return 1;
        if (a.formDifference != null && b.formDifference == null) return -1;
        return (b.formDifference ?? 0) - (a.formDifference ?? 0)
          || (b.currentFormAccuracy ?? 0) - (a.currentFormAccuracy ?? 0)
          || a.name.localeCompare(b.name, 'sv');
      }
    );

    this.selectedPlayerNames = this.playerPerformance.map((player) => player.name);
    this.buildPlayerChart();
  }

  private buildPlayerChart() {
    const selected = this.playerPerformance.filter((player) =>
      this.selectedPlayerNames.includes(player.name)
    );

    this.playerChartData = {
      labels: selected.map((player) => player.name),
      datasets: [
        {
          label: `${this.currentSeasonName}, senaste ${this.formWindowSize}`,
          data: selected.map((player) => player.currentFormAccuracy),
          backgroundColor: '#00427A',
          borderColor: '#00427A',
        },
        {
          label: `${this.previousSeasonName ?? 'Föregående säsong'}, samma tidpunkt`,
          data: selected.map((player) => player.previousFormAccuracy),
          backgroundColor: '#A5AFB9',
          borderColor: '#7A8490',
        },
      ],
    };
  }

  private buildPlacementHistory(
    history: ReturnType<typeof calculatePlacementHistory>,
    startPosition: number
  ): ChartConfiguration<'line'>['data'] {
    const names = Array.from(
      new Set(
        history.flatMap((snapshot) =>
          snapshot.standings.map((standing) => standing.name)
        )
      )
    ).sort((a, b) => a.localeCompare(b, 'sv'));

    return {
      labels: ['Start', ...history.map((snapshot) => `Omg ${snapshot.roundNumber}`)],
      datasets: names.map((name) => {
        const color = this.playerColor(name);
        return {
          label: name,
          data: [
            startPosition,
            ...history.map(
              (snapshot) =>
                snapshot.standings.find((standing) => standing.name === name)
                  ?.placement ?? startPosition
            ),
          ],
          borderColor: color,
          backgroundColor: color,
          pointBackgroundColor: color,
          spanGaps: false,
        };
      }),
    };
  }

  private playerColor(name: string): string {
    let hash = 0;
    for (const character of name) {
      hash = (hash * 31 + character.charCodeAt(0)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 62%, 40%)`;
  }
}
