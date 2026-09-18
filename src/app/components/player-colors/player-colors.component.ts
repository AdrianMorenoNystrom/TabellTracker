import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { avatarColor, resetAvatarColors, setAvatarColor } from '../../utils/avatar-color';

@Component({
  standalone: true,
  selector: 'app-player-colors',
  imports: [MatDialogModule],
  templateUrl: './player-colors.component.html',
  styleUrl: './player-colors.component.scss',
})
export class PlayerColorsComponent {
  readonly players = inject<{ id: number; name: string }[]>(MAT_DIALOG_DATA);
  readonly color = avatarColor;
  error = '';

  choose(name: string, event: Event) {
    const input = event.target as HTMLInputElement;
    this.error = setAvatarColor(name, input.value) ? '' : 'Färgen kunde inte sparas i webbläsaren.';
    input.value = avatarColor(name);
  }

  reset() {
    this.error = resetAvatarColors(this.players.map(player => player.name))
      ? '' : 'Färgerna kunde inte återställas i webbläsaren.';
  }
}
