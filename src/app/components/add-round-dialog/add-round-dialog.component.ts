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

/** 
 * Rotation för vem som lägger 4 matcher.
 * Utgår från din beskrivning: Ompen → Sillen → Adrian → Danne → repeat
 */
const FOUR_ROTATION = ['Ompen', 'Sillen', 'Adrian', 'Danne'] as const;
type FourName = (typeof FOUR_ROTATION)[number];

/**
 * Räknar ut vem som ska lägga 4 matcher härnäst,
 * baserat på historiken i rounds (där matchesPicked = 4).
 */
function getNextFourName(rounds: Round[]): string | null {
  const events: { roundNumber: number; playerName: string }[] = [];

  for (const r of rounds || []) {
    for (const p of r.players || []) {
      // matchesPicked kommer från ApiService.getRounds()
      if ((p as any).matchesPicked === 4) {
        events.push({ roundNumber: r.roundNumber, playerName: p.name });
      }
    }
  }

  // Ingen historik? börja med första i rotationen
  if (!events.length) {
    return FOUR_ROTATION[0];
  }

  // Ta senaste omgången med 4 matcher
  events.sort((a, b) => a.roundNumber - b.roundNumber);
  const last = events[events.length - 1];

  const idx = FOUR_ROTATION.indexOf(last.playerName as FourName);
  if (idx === -1) {
    // Om namnet inte finns i rotationen (t.ex. nytt namn) – börja om
    return FOUR_ROTATION[0];
  }

  const nextIndex = (idx + 1) % FOUR_ROTATION.length;
  return FOUR_ROTATION[nextIndex];
}

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

    // Hämta rundor -> sätt nästa roundNumber + räkna ut nästa 4-läggare -> ladda spelare med default 3/4 matcher
    this.api.getRounds().subscribe(rounds => {
      const lastRound = rounds.reduce(
        (max, round) => (round.roundNumber > max ? round.roundNumber : max),
        0
      );

      this.form.patchValue({
        roundNumber: lastRound + 1
      });

      const nextFourName = getNextFourName(rounds);
      this.loadPlayers(nextFourName || undefined);
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
          players: []
        };
        this.ref.close({ round: created });
      },
      error: () => {
        this.submitting = false;
      },
    });
  }
}
