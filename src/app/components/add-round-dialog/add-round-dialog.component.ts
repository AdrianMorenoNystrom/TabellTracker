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
  imports: [
    CommonModule,
    MatDialogModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDivider
  ],
  templateUrl: './add-round-dialog.component.html',
  styleUrl: './add-round-dialog.component.scss',
})
export class AddRoundDialogComponent {
  submitting = false;
  form!: FormGroup;
  today: Date = new Date();
  thisWeek: number = this.getWeekNumber(this.today);

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private fb: FormBuilder,
    private api: ApiService,
    private ref: MatDialogRef<AddRoundDialogComponent>,
    private dialog: MatDialog
  ) {
    // Initiera form
    this.form = this.fb.group({
      roundNumber: [1, [Validators.required, Validators.min(1)]],
      week: [this.thisWeek, [Validators.required, Validators.min(1)]],
      players: this.fb.array([] as any[]),
    });

    // Same stored rotation and reserved round numbers as the live coupon importer.
    this.api.getNextRound().subscribe(next => {
      this.form.patchValue({ roundNumber: next.round_number });
      this.loadPlayers(next.four_player_name);
    });
  }

  get players(): FormArray {
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
        matchesPicked: [3], // default 3 matcher
      })
    );
  }

  /**
   * Laddar befintliga spelare från leaderboarden och sätter
   * matchesPicked = 4 för den som ska lägga 4 matcher enligt rotationen.
   */
  loadPlayers(nextFourName?: string) {
    this.api.getPlayers().subscribe((ps: Player[]) => {
      while (this.players.length) this.players.removeAt(0);

      if (ps && ps.length) {
        ps.forEach(p =>
          this.players.push(
            this.fb.group({
              name: [p.name],
              score: [0],
              matchesPicked: [nextFourName && p.name === nextFourName ? 4 : 3],
            })
          )
        );
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

  /**
   * Valfritt: om du vill kunna klicka för att byta vem som har 4 matcher
   * (används i HTML om du lägger till en knapp "3 matcher"/"4 matcher").
   */
  setFourFor(index: number) {
    this.players.controls.forEach((ctrl, i) => {
      ctrl.get('matchesPicked')?.setValue(i === index ? 4 : 3);
    });
  }

  submit() {
    if (this.form.invalid) return;
    const val = this.form.value;

    const payload: RoundCreate = {
      roundNumber: Number(val.roundNumber),
      week: Number(val.week),
      players: (val.players as any[])
        .filter(p => p && p.name && p.name.toString().trim().length > 0)
        .map(p => ({
          name: String(p.name),
          score: Number(p.score || 0),
          matchesPicked: Number(p.matchesPicked ?? 3)
        })) as PlayerScoreInput[],
    };

    this.submitting = true;
    this.api.addRound(payload).subscribe({
      next: (res) => {
        const totalScore =
          (res as any)?.totalScore ??
          payload.players.reduce((s, p) => s + (p.score || 0), 0);
        const created: Round = {
          id: res.id,
          roundNumber: payload.roundNumber,
          week: payload.week,
          totalScore,
          players: payload.players.map((player) => ({
            id: 0,
            name: player.name,
            score: player.score,
            total_matches: player.matchesPicked ?? 3,
            avg_score_per_round: player.score,
            matchesPicked: player.matchesPicked ?? 3,
          }))
        };
        this.ref.close({ round: created });
      },
      error: () => {
        this.submitting = false;
      },
    });
  }
}
