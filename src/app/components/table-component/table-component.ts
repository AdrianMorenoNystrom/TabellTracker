import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from '@angular/material/button';
import { AddPlayerDialog } from '../add-player-dialog/add-player-dialog';
import { ApiService } from '../../services/api.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Player } from '../../interfaces/player';
import { MatIconModule } from '@angular/material/icon';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { PlayerHistoryDialogComponent } from '../player-history-dialog/player-history-dialog.component';
import { DecimalPipe, NgIf, NgFor, AsyncPipe, NgClass } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { combineLatest, of, switchMap } from 'rxjs';
import { Round } from '../../interfaces/round';
import {
  calculatePlayerPerformance,
  PlayerPerformanceComparison,
} from '../../utils/player-performance';
import {
  calculatePlacementSummaries,
  PlayerPlacementSummary,
} from '../../utils/standings';

@Component({
  selector: 'app-table-component',
  imports: [MatCardModule,MatButtonModule,MatIconModule, MatTableModule, MatSortModule, MatFormFieldModule, MatInputModule, MatDialogModule,NgIf,DecimalPipe,NgFor,AsyncPipe,NgClass],
  templateUrl: './table-component.html',
  styleUrl: './table-component.scss'
})
export class TableComponent implements AfterViewInit {
    constructor(public api: ApiService, private dialog: MatDialog,public auth: AuthService) {}
  players = new MatTableDataSource<Player>([]);
displayedColumns = ['name', 'score', 'placement', 'seasonForm', 'actions'];
  @ViewChild(MatSort) sort!: MatSort;
topScore: number | null = null;
topMatches: number | null = null;
currentSeasonName = '';
previousSeasonName = '';
private seasonPerformanceByPlayer = new Map<string, PlayerPerformanceComparison>();
private placementByPlayer = new Map<string, PlayerPlacementSummary>();

  ngOnInit() {
  this.api.getSeasons().pipe(
    switchMap((seasons) => {
      const current = seasons.find((season) => season.isCurrent);
      const previous = seasons
        .filter((season) => current && season.startYear < current.startYear)
        .sort((a, b) => b.startYear - a.startYear)[0];

      this.currentSeasonName = current?.name ?? '';
      this.previousSeasonName = previous?.name ?? '';

      if (!current) {
        return of({ currentRounds: [] as Round[], previousRounds: [] as Round[] });
      }

      return combineLatest({
        currentRounds: this.api.watchRounds(),
        previousRounds: previous ? this.api.getRounds(previous.id) : of([] as Round[]),
      });
    })
  ).subscribe(({ currentRounds, previousRounds }) => {
    const performance = calculatePlayerPerformance(currentRounds, previousRounds);
    this.seasonPerformanceByPlayer = new Map(
      performance.map((player) => [player.name, player])
    );
    const placements = calculatePlacementSummaries(currentRounds);
    this.placementByPlayer = new Map(
      placements.map((placement) => [placement.name, placement])
    );
    this.players.data = this.withPlayerInsights(this.players.data);
  });

  this.api.watchPlayers().subscribe(p => {
    const arr = (p ?? []).slice().sort((a, b) => {
      // 1) mest poäng vinner
      if (b.score !== a.score) return b.score - a.score;
      // 2) vid lika poäng – färre matcher vinner
      const aMatches = a.total_matches ?? 0;
      const bMatches = b.total_matches ?? 0;
      return aMatches - bMatches;
    });

    this.players.data = this.withPlayerInsights(arr);

    if (arr.length) {
      this.topScore = arr[0].score;
      this.topMatches = arr[0].total_matches ?? 0;
    } else {
      this.topScore = null;
      this.topMatches = null;
    }
  });
}

ngAfterViewInit(): void {
  this.players.sortingDataAccessor = (item: Player, property: string): any => {
    switch (property) {
      case 'score':
        return Number(item.score) || 0;
      case 'placement':
        return item.currentPlacement ?? Number.POSITIVE_INFINITY;
      case 'seasonForm':
        return item.seasonFormDifference ?? Number.NEGATIVE_INFINITY;
      default:
        return (item as any)[property];
    }
  };

  this.players.sort = this.sort;
}

  loadPlayers() {
    this.api.getPlayers().subscribe(p => {
      const arr = (p ?? []).slice().sort((a, b) => b.score - a.score);
      this.players.data = this.withPlayerInsights(arr);
    });
  }

  seasonFormClass(value: number | null | undefined): string {
    if (value == null) return 'form-empty';
    if (value >= 5) return 'form-positive';
    if (value <= -5) return 'form-negative';
    if (Math.abs(value) <= 3) return 'form-steady';
    return 'form-transition';
  }

  private withPlayerInsights(players: Player[]): Player[] {
    return players.map((player) => {
      const performance = this.seasonPerformanceByPlayer.get(player.name);
      const placement = this.placementByPlayer.get(player.name);
      return {
        ...player,
        seasonFormDifference: performance?.seasonDifference ?? null,
        seasonCurrentAccuracy: performance?.currentSeasonAccuracy ?? null,
        seasonPreviousAccuracy: performance?.previousSeasonAccuracy ?? null,
        seasonCurrentScore: performance?.currentScore ?? 0,
        seasonCurrentPossible: performance?.currentPossible ?? 0,
        seasonPreviousScore: performance?.previousScore ?? 0,
        seasonPreviousPossible: performance?.previousPossible ?? 0,
        currentPlacement: placement?.currentPlacement ?? null,
        previousPlacement: placement?.previousPlacement ?? null,
        placementChange: placement?.placementChange ?? null,
        bestPlacement: placement?.bestPlacement ?? null,
      };
    });
  }

  
  delete(p: Player) {
    if (!p?.id) return;
    const sure = confirm(`Delete player "${p.name}"? This will remove their scores from all rounds.`);
    if (!sure) return;
    this.api.deletePlayer(p.id).subscribe(() => this.loadPlayers());
  }

  openAddPlayerDialog() {
    const ref = this.dialog.open(AddPlayerDialog, {
      width: '600px',
      data: {}
    });
    ref.afterClosed().subscribe(r => { if (r?.updated) this.loadPlayers(); });
  }

  applyFilter(value: string) {
    this.players.filter = (value || '').trim().toLowerCase();
  }

  openHistory(p: Player) {
    this.dialog.open(PlayerHistoryDialogComponent, {
      width: '760px',
      maxWidth: '96vw',
      maxHeight: '92vh',
      panelClass: 'player-profile-dialog',
      data: { player: p }
    });
  }
}
