import { Component, Inject } from '@angular/core';
import { CommonModule, NgIf } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ApiService } from '../../services/api.service';
import { Round } from '../../interfaces/round';
import { Player } from '../../interfaces/player';
import { AddRoundDialogComponent } from '../add-round-dialog/add-round-dialog.component';
import { RoundDetailsDialogComponent } from './round-details-dialog.component';
import { MatIconModule } from '@angular/material/icon';
import { MatFormField, MatLabel, MatSelect, MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-roundlist-component',
  imports: [CommonModule, MatCardModule, MatButtonModule, MatDialogModule, MatIconModule, NgIf, MatSelect, MatFormField, MatLabel, MatSelectModule],
  templateUrl: './roundlist-component.html',
  styleUrl: './roundlist-component.scss'
})
export class RoundlistComponent {
  rounds: Round[] = [];
  sortMode: 'recent' | 'oldest' | 'score_desc' | 'score_asc' = 'recent';

  constructor(public api: ApiService, private dialog: MatDialog) {}

  ngOnInit() {
    this.api.watchRounds().subscribe((data) => {
      this.rounds = data ?? [];
      this.applySort();
    });
  }

onSortChange(mode: string): void {
  if (mode === 'recent') {
    this.setSortRecent();
  } else if (mode === 'oldest') {
    this.setSortOldest();
  } else if (mode === 'score_desc') {
    this.setSortScoreDesc();
  } else if (mode === 'score_asc') {
    this.setSortScoreAsc();
  }
}

  loadRounds() {
    this.api.getRounds().subscribe((data) => {
      this.rounds = data ?? [];
      this.applySort();
    });
  }

  openAddRoundDialog() {
    const ref = this.dialog.open(AddRoundDialogComponent, {
      width: '600px',
      data: {}
    });

    ref.afterClosed().subscribe((result: { round?: Round } | undefined) => {
      if (result?.round) {
        this.rounds = [result.round, ...this.rounds];
        this.applySort();
      }
    });
  }

  openDetails(round: Round) {
    this.dialog.open(RoundDetailsDialogComponent, {
      width: '480px',
      data: round
    });
  }

  deleteRound(roundId:number) {
    if (!roundId) return;
    this.api.deleteRoundById(roundId).subscribe({
      next: () => {
        this.rounds = this.rounds.filter(r => r.id !== roundId);
        this.applySort();
      },
      error: (err) => {
        console.error('Failed to delete round', err);
      }
    });
  }

  setSortRecent() {
    this.sortMode = 'recent';
    this.applySort();
  }
  
  setSortOldest() {
    this.sortMode = 'oldest';
    this.applySort();
  }

  setSortScoreDesc() {
    this.sortMode = 'score_desc';
    this.applySort();
  }

  setSortScoreAsc() {
    this.sortMode = 'score_asc';
    this.applySort();
  }

  private applySort() {
    if (this.sortMode === 'recent') {
      this.rounds = [...this.rounds].sort((a, b) => b.roundNumber - a.roundNumber);
      return;
    }
  if (this.sortMode === 'oldest') {
    this.rounds = [...this.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
    return;
  }
    if (this.sortMode === 'score_desc') {
      this.rounds = [...this.rounds].sort((a, b) => (b.totalScore - a.totalScore) || (b.id - a.id));
      return;
    }
    this.rounds = [...this.rounds].sort((a, b) => (a.totalScore - b.totalScore) || (b.id - a.id));
  }
}
