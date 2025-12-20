import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Match, Pick } from '../../interfaces/tips';
import { MatDivider } from "@angular/material/divider";
import { avatarColor } from '../../utils/avatar-color'; 

type Outcome = '1' | 'X' | '2';
type PickBadge = { userId: string; name: string | null; pick: Pick };

export type SnapshotDialogData = {
  matches: Match[];
  myPicks: Record<number, Pick>; // event_number -> '1X' etc
  picksByMatch: Record<number, PickBadge[]>; // event_number -> list
  myUserId: string;
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
  const all = (this.data.picksByMatch[eventNo] ?? [])
    .filter(p => p.userId !== this.data.myUserId);

  const minePick = this.data.myPicks[eventNo];
  if (minePick) return false;

  return all.some(p => p.pick.includes(o));
}

private rgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

private getOtherOwner(eventNo: number) {
  const minePick = this.data.myPicks[eventNo];
  if (minePick) return null;

    const all = (this.data.picksByMatch[eventNo] ?? [])
    .filter(p => p.userId !== this.data.myUserId);
  return all.length ? all[0] : null; // uniq_draw_event => max 1
}

otherBg(eventNo: number, o: Outcome): string | null {
  if (this.isMine(eventNo, o)) return null;

  const owner = this.getOtherOwner(eventNo);
  if (!owner) return null;

  if (!owner.pick.includes(o)) return null;

  const base = avatarColor(owner.name);
  return this.rgba(base, 0.5);
}

otherBorder(eventNo: number, o: Outcome): string | null {
  if (this.isMine(eventNo, o)) return null;

  const owner = this.getOtherOwner(eventNo);
  if (!owner) return null;

  // ✅ Border bara på de valda utfallen
  if (!owner.pick.includes(o)) return null;

  return this.rgba(avatarColor(owner.name), 0.15);
}

  // helt låst om någon annan har 1X eller X2 etc -> alla tre ska bli inaktiva (om du inte själv valt)
  isLockedMatch(eventNo: number): boolean {
    const minePick = this.data.myPicks[eventNo];
    if (minePick) return false;
    const all = this.data.picksByMatch[eventNo] ?? [];
    return all.length > 0;
  }
}
