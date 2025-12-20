import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Match, Pick } from '../../interfaces/tips';
import { MatDivider } from "@angular/material/divider";

type Outcome = '1' | 'X' | '2';
type PickBadge = { userId: string; name: string | null; pick: Pick };

export type SnapshotDialogData = {
  matches: Match[];
  myPicks: Record<number, Pick>; // event_number -> '1X' etc
  picksByMatch: Record<number, PickBadge[]>; // event_number -> list
};

@Component({
  standalone: true,
  selector: 'app-snapshot-dialog',
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatDivider],
  templateUrl: './snapshot-dialog.component.html',
  styleUrl: './snapshot-dialog.component.scss',
})
export class SnapshotDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: SnapshotDialogData) {}

  private includesPick(pick: Pick | undefined, o: Outcome): boolean {
    if (!pick) return false;
    return pick.includes(o);
  }

  isMine(eventNo: number, o: Outcome): boolean {
    return this.includesPick(this.data.myPicks[eventNo], o);
  }

  // “tagen av någon annan” för just det utfallet
  isTakenByOther(eventNo: number, o: Outcome): boolean {
    const all = this.data.picksByMatch[eventNo] ?? [];
    const minePick = this.data.myPicks[eventNo];
    // om du själv har pick på matchen vill du inte markera "other"
    if (minePick) return false;

    return all.some(p => p.pick.includes(o));
  }

  // helt låst om någon annan har 1X eller X2 etc -> alla tre ska bli inaktiva (om du inte själv valt)
  isLockedMatch(eventNo: number): boolean {
    const minePick = this.data.myPicks[eventNo];
    if (minePick) return false;
    const all = this.data.picksByMatch[eventNo] ?? [];
    return all.length > 0;
  }
}
