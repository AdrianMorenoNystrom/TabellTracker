import { Component, EventEmitter, Input, Output } from '@angular/core';
import { LiveDraw } from '../../interfaces/live';

@Component({
  selector: 'app-coupon-settled', standalone: true,
  templateUrl: './coupon-settled.component.html', styleUrl: './coupon-settled.component.scss',
})
export class CouponSettledComponent {
  @Input({ required: true }) draw!: LiveDraw;
  @Input() next: LiveDraw | null = null;
  @Input() loading = false;
  @Output() openRecap = new EventEmitter<void>();
}
