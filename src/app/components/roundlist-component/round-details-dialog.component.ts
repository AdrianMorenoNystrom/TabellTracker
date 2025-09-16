import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { Round } from '../../interfaces/round';

@Component({
  selector: 'app-round-details-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatListModule, MatDividerModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Omgång {{ data.roundNumber }} • Vecka {{ data.week }}</h2>
    <div mat-dialog-content>
      <p>Antal rätt: <strong>{{ data.totalScore }}</strong></p>
      <mat-divider></mat-divider>
      <div style="margin-top: 8px">
        <h3>Spelare</h3>
        <mat-list>
          <mat-list-item *ngFor="let p of data.players">
            <div style="display:flex; width:100%; justify-content:space-between; align-items:center;">
              <span>{{ p.name }}</span>
              <strong>{{ p.score }}</strong>
            </div>
          </mat-list-item>
        </mat-list>
      </div>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Stäng</button>
    </div>
  `,
})
export class RoundDetailsDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: Round) {}
}
