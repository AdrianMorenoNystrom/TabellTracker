import { Component, Input } from '@angular/core';
import { avatarLetter } from '../../utils/avatar';
import { avatarColor } from '../../utils/avatar-color';

@Component({
  standalone: true,
  selector: 'app-avatar-chip',
  templateUrl: './avatar-chip.component.html',
  styleUrl: './avatar-chip.component.scss',
})
export class AvatarChipComponent {
  @Input() displayName: string | null = null;
  @Input() userId: string | null = null;

  get letter(): string {
    return avatarLetter(this.displayName);
  }

  get bgColor(): string {
    return avatarColor(this.displayName);
  }
}
