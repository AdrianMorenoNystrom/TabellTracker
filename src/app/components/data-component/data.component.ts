import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../services/api.service';
import { Player } from '../../interfaces/player';
import { Round } from '../../interfaces/round';
import { TotalScoreDataComponent } from "../total-score-data/total-score-data.component";
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';

interface PlayerStatsCard {
  player: Player;
  last5Avg: number;
  fullPotsTotal: number;
  fullPots3: number;
  fullPots4: number;
  isFormKing: boolean;
  isFullPotKing: boolean;
}

interface FourPickerInfo {
  roundNumber: number;
  week: number;
  playerName: string;
  score: number;
  matchesPicked: number;
  totalScore: number;
}

@Component({
  selector: 'app-data',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatListModule, MatDividerModule, TotalScoreDataComponent,MatProgressSpinnerModule],
  templateUrl: './data.component.html',
  styleUrl: './data.component.scss'
})
export class DataComponent {
  loading = true;

  players: Player[] = [];
  rounds: Round[] = [];

  playerStats: PlayerStatsCard[] = [];
  lastFourPicker: FourPickerInfo | null = null;

  constructor(private api: ApiService) {}

  ngOnInit() {
    // Hämta spelare först, sedan rundor
    this.api.getPlayers().subscribe(players => {
      this.players = players ?? [];

      this.api.getRounds().subscribe(rounds => {
        this.rounds = rounds ?? [];
        this.computeStats();
        this.loading = false;
      });
    });
  }

  private computeStats() {
    this.computePlayerCards();
    this.computeLastFourPicker();
  }

  private computePlayerCards() {
    const cards: PlayerStatsCard[] = [];

    for (const p of this.players) {
      const name = p.name;

      const entries = this.rounds
        .map(r => {
          const rp = r.players?.find(pp => pp.name === name);
          if (!rp) return null;
          const matches = (rp as any).matchesPicked ?? 3;
          return {
            roundNumber: r.roundNumber,
            score: rp.score ?? 0,
            matchesPicked: matches
          };
        })
        .filter(
          (x): x is { roundNumber: number; score: number; matchesPicked: number } =>
            !!x
        )
        .sort((a, b) => b.roundNumber - a.roundNumber);

      const last5 = entries.slice(0, 5);
      const last5Avg =
        last5.length > 0
          ? last5.reduce((sum, e) => sum + e.score, 0) / last5.length
          : 0;

      let fullTotal = 0;
      let full3 = 0;
      let full4 = 0;
      for (const e of entries) {
        if (e.score === e.matchesPicked) {
          fullTotal++;
          if (e.matchesPicked === 3) full3++;
          if (e.matchesPicked === 4) full4++;
        }
      }

      cards.push({
        player: p,
        last5Avg,
        fullPotsTotal: fullTotal,
        fullPots3: full3,
        fullPots4: full4,
        isFormKing: false,    
        isFullPotKing: false, 
      });
    }

    if (cards.length) {
      const maxForm = Math.max(...cards.map(c => c.last5Avg));
      const maxFull = Math.max(...cards.map(c => c.fullPotsTotal));

      cards.forEach(c => {
        if (c.last5Avg === maxForm && maxForm > 0) c.isFormKing = true;
        if (c.fullPotsTotal === maxFull && maxFull > 0) c.isFullPotKing = true;
      });
    }

    this.playerStats = cards.sort((a, b) => b.last5Avg - a.last5Avg);
  }

  private computeLastFourPicker() {
    const events: FourPickerInfo[] = [];

    for (const r of this.rounds) {
      for (const p of r.players || []) {
        const matches = (p as any).matchesPicked ?? 3;
        if (matches === 4) {
          events.push({
            roundNumber: r.roundNumber,
            week: r.week,
            playerName: p.name,
            score: p.score,
            matchesPicked: matches,
            totalScore: r.totalScore,
          });
        }
      }
    }

    if (!events.length) {
      this.lastFourPicker = null;
      return;
    }

    events.sort((a, b) => a.roundNumber - b.roundNumber);
    this.lastFourPicker = events[events.length - 1];
  }
}
