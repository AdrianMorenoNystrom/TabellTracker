import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface CouponOverviewData {
  round: number;
  capturedAt: string;
  closesAt: string;
  players: { name: string; color: string }[];
  rows: { number: number; home: string; away: string; pick: string; owner: string; color: string }[];
}

@Component({
  standalone: true,
  selector: 'app-coupon-overview',
  imports: [MatDialogModule],
  templateUrl: './coupon-overview.component.html',
  styleUrl: './coupon-overview.component.scss',
})
export class CouponOverviewComponent {
  readonly data = inject<CouponOverviewData>(MAT_DIALOG_DATA);
  readonly signs = ['1', 'X', '2'];
  readonly picked = this.data.rows.filter(row => row.pick).length;
}
