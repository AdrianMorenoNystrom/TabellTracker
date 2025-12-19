import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-avatar-chip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './avatar-chip.component.html',
  styleUrl: './avatar-chip.component.scss',
})
export class AvatarChipComponent {
  @Input() displayName: string | null = null;

  get letter(): string {
    if (!this.displayName || this.displayName.trim().length === 0) {
      return '?';
    }
    return this.displayName.trim().charAt(0).toUpperCase();
  }
}
