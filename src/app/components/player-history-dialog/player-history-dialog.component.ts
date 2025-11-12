import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '../../services/api.service';
import { Player } from '../../interfaces/player';
import { Round } from '../../interfaces/round';

interface Entry { roundNumber: number; week: number; score: number;  matchesPicked: number;
 }

@Component({
  selector: 'app-player-history-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatTableModule, MatButtonModule],
  templateUrl: './player-history-dialog.component.html',
  styleUrl: './player-history-dialog.component.scss'
})
export class PlayerHistoryDialogComponent {
  entries: Entry[] = [];
  displayedColumns = ['round', 'week', 'score'];
  loading = true;

  constructor(@Inject(MAT_DIALOG_DATA) public data: { player: Player }, private api: ApiService) {
    this.load();
  }

private load() {
  this.api.getRounds().subscribe((rounds: Round[]) => {
    const out: Entry[] = [];
    for (const r of rounds || []) {
      const p = r.players?.find(pp => pp.id === this.data.player.id || pp.name === this.data.player.name);
      if (p) {
        out.push({
          roundNumber: r.roundNumber,
          week: r.week,
          score: p.score,
          matchesPicked: p.matchesPicked ?? 3 
        });
      }
    }
    out.sort((a, b) => (b.roundNumber - a.roundNumber) || (b.week - a.week));
    this.entries = out;
    this.loading = false;
  });
}
}

