import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ReactiveFormsModule, FormArray, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { Round, RoundCreate, PlayerScoreInput } from '../../interfaces/round';
import { MatIconModule } from '@angular/material/icon';
import { MatDivider } from '@angular/material/divider';
import { Player } from '../../interfaces/player';
import { MatDialog } from '@angular/material/dialog';
import { AddPlayerDialog } from '../add-player-dialog/add-player-dialog';
@Component({
  selector: 'app-add-round-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule,MatIconModule,MatDivider],
  templateUrl: './add-round-dialog.component.html',
  styleUrl: './add-round-dialog.component.scss',
})
export class AddRoundDialogComponent {
    constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private fb: FormBuilder,
    private api: ApiService,
    private ref: MatDialogRef<AddRoundDialogComponent>,
    private dialog: MatDialog
) {
    // Initialize form with placeholder values
    this.form = this.fb.group({
        roundNumber: [1, [Validators.required, Validators.min(1)]],
        week: [this.thisWeek, [Validators.required, Validators.min(1)]],
        players: this.fb.array([] as any[]),
    });

    // Fetch the last round and update the roundNumber
    this.api.getRounds().subscribe(rounds => {
        const lastRound = rounds.reduce((max, round) => 
            round.roundNumber > max ? round.roundNumber : max, 0);
        this.form.patchValue({
            roundNumber: lastRound + 1
        });
    });

    this.loadPlayers();
}

  submitting = false;
  form!: FormGroup;
today: Date = new Date();
thisWeek: number = this.getWeekNumber(this.today); 
  get players() {
    return this.form.get('players') as FormArray;
  }

getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

  addPlayer() {
    this.players.push(
      this.fb.group({
        name: [''],
        score: [null],
      })
    );
  }

  loadPlayers() {
    this.api.getPlayers().subscribe((ps: Player[]) => {
      while (this.players.length) this.players.removeAt(0);
      if (ps && ps.length) {
        ps.forEach(p => this.players.push(this.fb.group({ name: [p.name], score: [0] })));
      } else {
        this.addPlayer();
      }
    });
  }

  removePlayer(i: number) {
    this.players.removeAt(i);
  }

  close() {
    this.ref.close();
  }

  submit() {
    if (this.form.invalid) return;
    const val = this.form.value;
    const payload: RoundCreate = {
      roundNumber: Number(val.roundNumber),
      week: Number(val.week),
      players: (val.players as any[])
        .filter(p => p && p.name && p.name.toString().trim().length > 0)
        .map(p => ({ name: String(p.name), score: Number(p.score || 0) })) as PlayerScoreInput[],
    };

    this.submitting = true;
    this.api.addRound(payload).subscribe({
      next: (res) => {
        const totalScore = (res as any)?.totalScore ?? payload.players.reduce((s, p) => s + (p.score || 0), 0);
        const created: Round = { id: res.id, roundNumber: payload.roundNumber, week: payload.week, totalScore, players: [] };
        this.ref.close({ round: created });
      },
      error: () => {
        this.submitting = false;
      },
    });
  }
}
