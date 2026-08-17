import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { Player } from '../../interfaces/player';
import { Round } from '../../interfaces/round';
import { Season } from '../../interfaces/season';
import { ApiService } from '../../services/api.service';
import {
  calculatePlayerForecasts,
  PlayerForecast,
} from '../../utils/player-forecast';
import {
  calculatePlayerPerformance,
  PlayerPerformanceComparison,
} from '../../utils/player-performance';

interface Entry {
  roundNumber: number;
  week: number;
  score: number;
  matchesPicked: number;
  accuracy: number;
  seasonName: string;
}

interface SeasonSummary {
  name: string;
  rounds: number;
  score: number;
  possible: number;
  accuracy: number | null;
  isCurrent: boolean;
}

@Component({
  selector: 'app-player-history-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatTableModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './player-history-dialog.component.html',
  styleUrl: './player-history-dialog.component.scss',
})
export class PlayerHistoryDialogComponent {
  entries: Entry[] = [];
  seasonSummaries: SeasonSummary[] = [];
  displayedColumns = ['round', 'week', 'score'];
  loading = true;
  loadError = false;
  currentSeasonName = '';
  previousSeasonName = '';
  currentScore = 0;
  currentPossible = 0;
  currentAccuracy: number | null = null;
  currentAverage = 0;
  recentFormAccuracy: number | null = null;
  allTimeScore = 0;
  allTimePossible = 0;
  bestEntry: Entry | null = null;
  forecast: PlayerForecast | null = null;
  comparison: PlayerPerformanceComparison | null = null;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { player: Player },
    private api: ApiService
  ) {
    this.load();
  }

  differenceClass(value: number | null | undefined): string {
    if (value == null) return 'difference-empty';
    if (value >= 5) return 'difference-positive';
    if (value <= -5) return 'difference-negative';
    return 'difference-steady';
  }

  private load(): void {
    this.api
      .getSeasons()
      .pipe(
        switchMap((seasons) => {
          if (!seasons.length) return of([]);
          return forkJoin(
            seasons.map((season) =>
              this.api.getRounds(season.id).pipe(
                map((rounds) => ({ season, rounds }))
              )
            )
          );
        })
      )
      .subscribe({
        next: (seasonData) => this.buildProfile(seasonData),
        error: () => {
          this.loadError = true;
          this.loading = false;
        },
      });
  }

  private buildProfile(
    seasonData: Array<{ season: Season; rounds: Round[] }>
  ): void {
    const sortedSeasons = [...seasonData].sort(
      (a, b) => b.season.startYear - a.season.startYear
    );
    const currentData =
      sortedSeasons.find(({ season }) => season.isCurrent) ?? sortedSeasons[0];
    const previousData = sortedSeasons.find(
      ({ season }) =>
        currentData && season.startYear < currentData.season.startYear
    );

    this.currentSeasonName = currentData?.season.name ?? '';
    this.previousSeasonName = previousData?.season.name ?? '';

    const currentRounds = currentData?.rounds ?? [];
    const previousRounds = previousData?.rounds ?? [];
    this.entries = this.entriesFor(currentRounds, this.currentSeasonName).sort(
      (a, b) => b.roundNumber - a.roundNumber || b.week - a.week
    );

    this.seasonSummaries = sortedSeasons
      .map(({ season, rounds }) =>
        this.summaryFor(season, this.entriesFor(rounds, season.name))
      )
      .filter((summary) => summary.rounds > 0);

    this.currentScore = this.entries.reduce((sum, entry) => sum + entry.score, 0);
    this.currentPossible = this.entries.reduce(
      (sum, entry) => sum + entry.matchesPicked,
      0
    );
    this.currentAccuracy = this.accuracy(this.entries);
    this.currentAverage = this.entries.length
      ? this.currentScore / this.entries.length
      : 0;
    this.recentFormAccuracy = this.accuracy(this.entries.slice(0, 5));

    const allEntries = sortedSeasons.flatMap(({ season, rounds }) =>
      this.entriesFor(rounds, season.name)
    );
    this.allTimeScore = allEntries.reduce((sum, entry) => sum + entry.score, 0);
    this.allTimePossible = allEntries.reduce(
      (sum, entry) => sum + entry.matchesPicked,
      0
    );
    this.bestEntry = [...allEntries].sort(
      (a, b) => b.accuracy - a.accuracy || b.score - a.score
    )[0] ?? null;

    this.forecast =
      calculatePlayerForecasts(currentRounds, previousRounds).find(
        (forecast) => forecast.name === this.data.player.name
      ) ?? null;
    this.comparison =
      calculatePlayerPerformance(currentRounds, previousRounds).find(
        (comparison) => comparison.name === this.data.player.name
      ) ?? null;
    this.loading = false;
  }

  private entriesFor(rounds: Round[], seasonName: string): Entry[] {
    return (rounds ?? []).flatMap((round) => {
      const player = round.players?.find(
        (candidate) =>
          candidate.id === this.data.player.id ||
          candidate.name === this.data.player.name
      );
      if (!player) return [];

      const matchesPicked = Number(player.matchesPicked) || 3;
      const score = Number(player.score) || 0;
      return [
        {
          roundNumber: round.roundNumber,
          week: round.week,
          score,
          matchesPicked,
          accuracy: matchesPicked ? (score / matchesPicked) * 100 : 0,
          seasonName,
        },
      ];
    });
  }

  private summaryFor(season: Season, entries: Entry[]): SeasonSummary {
    const score = entries.reduce((sum, entry) => sum + entry.score, 0);
    const possible = entries.reduce(
      (sum, entry) => sum + entry.matchesPicked,
      0
    );
    return {
      name: season.name,
      rounds: entries.length,
      score,
      possible,
      accuracy: possible ? (score / possible) * 100 : null,
      isCurrent: season.isCurrent,
    };
  }

  private accuracy(entries: Entry[]): number | null {
    const possible = entries.reduce(
      (sum, entry) => sum + entry.matchesPicked,
      0
    );
    if (!possible) return null;
    const score = entries.reduce((sum, entry) => sum + entry.score, 0);
    return (score / possible) * 100;
  }
}
