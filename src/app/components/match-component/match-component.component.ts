// import { Component, DestroyRef, inject } from '@angular/core';
// import { CommonModule, NgFor } from '@angular/common';
// import { combineLatest, filter, switchMap, take } from 'rxjs';
// import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

// import { MatCardModule } from '@angular/material/card';
// import { MatChipsModule } from '@angular/material/chips';
// import { MatButtonModule } from '@angular/material/button';
// import { MatDividerModule } from '@angular/material/divider';
// import {MatSnackBar} from '@angular/material/snack-bar';

// import { Match, TipStatus, Pick } from '../../interfaces/tips';
// import { TipsDataService } from '../../services/tips-data.service';
// import { PicksService } from '../../services/pick.service'; // <-- kontrollera filnamn/import
// import { AuthService } from '../../services/auth.service';

// type Outcome = '1' | 'X' | '2';

// @Component({
//   standalone: true,
//   selector: 'app-match-component.component',
//   imports: [
//     CommonModule,
//     MatCardModule,
//     MatChipsModule,
//     MatButtonModule,
//     NgFor,
//     MatDividerModule,
//   ],
//   templateUrl: './match-component.component.html',
//   styleUrl: './match-component.component.scss',
// })
// export class MatchComponentComponent {
//   private destroyRef = inject(DestroyRef);

//   loading = true;

//   roundNumber = 0;
//   maxPicks: 3 | 4 = 3;
//   thisWeek: number = this.getWeekNumber(new Date());

//   matches: Match[] = [];
//   status: TipStatus[] = [];

//   saving = false;
//   saveError: string | null = null;

//   drawNumber: number | null = null;
//   userId: string | null = null;

//   // matchNo -> set av val, t.ex {'1','X'} för 1X
//   myPicks = new Map<number, Set<Outcome>>();

//   constructor(
//     private data: TipsDataService,
//     private picks: PicksService,
//     private auth: AuthService,
//     private snackBar: MatSnackBar,
//   ) {}

//   ngOnInit() {
//     this.loading = true;

//     combineLatest([
//       this.data.getMeta(),
//       this.data.getMatches(),
//       this.data.latest$.pipe(
//         // status finns inte i DB än, så kör tom lista just nu
//         // (eller byt till din status-stream när du har den)
//         switchMap(() => [ [] as TipStatus[] ])
//       ),
//       this.auth.getUserId$(),
//     ])
//       .pipe(
//         filter(([meta, _m, _s, uid]) => !!meta && !!uid),
//         switchMap(([meta, matches, status, uid]) => {
//           this.roundNumber = meta.roundNumber;
//           this.maxPicks = meta.maxPicks;

//           this.drawNumber = meta.drawNumber;
//           this.userId = uid!;

//           this.matches = matches ?? [];
//           this.status = status ?? [];

//           return this.picks.getMyPicks(this.drawNumber!, this.userId!);
//         }),
//         takeUntilDestroyed(this.destroyRef)
//       )
//       .subscribe({
//         next: (rows) => {
//           this.myPicks = new Map<number, Set<Outcome>>();
//           rows.forEach((r) => {
//             const set = this.parsePick(r.pick);
//             if (set.size > 0) this.myPicks.set(r.event_number, set);
//           });

//           this.loading = false;
//         },
//         error: (err) => {
//           console.error(err);
//           this.saveError = err?.message ?? 'Kunde inte ladda picks';
//           this.loading = false;
//         },
//       });
//   }

//   lockInRow() {
//     if (!this.drawNumber || !this.userId) return;
//     if (!this.canSubmit()) return;

//     this.saving = true;
//     this.saveError = null;

//     const payload = [...this.myPicks.entries()]
//       .filter(([_, set]) => set.size > 0)
//       .map(([matchNo, set]) => ({
//         event_number: matchNo,
//         pick: this.serializePick(set),
//       }));

//     this.picks.lockInPicks(this.drawNumber, this.userId, payload as any)
//       .pipe(take(1))
//       .subscribe({
//         next: () => {
//           this.snackBar.open('Raden sparad!', 'Stäng', {verticalPosition: 'top', duration: 3000 });
//           this.saving = false;
//         },
//         error: (err) => {
//           console.error(err);
//           this.saving = false;
//           this.saveError = err?.message ?? 'Kunde inte spara raden';
//         },
//       });
//   }

//   // ---- Counters / rules ----

//   get pickedMatchesCount(): number {
//     return [...this.myPicks.values()].filter((s) => s.size > 0).length;
//   }

//   get halfCount(): number {
//     return [...this.myPicks.values()].filter((s) => s.size === 2).length;
//   }

//   get spikCount(): number {
//     return [...this.myPicks.values()].filter((s) => s.size === 1).length;
//   }

//   get totalSelectedOutcomes(): number {
//     let sum = 0;
//     for (const set of this.myPicks.values()) sum += set.size;
//     return sum;
//   }

//   get requiredOutcomes(): number {
//     return this.maxPicks === 4 ? 6 : 5;
//   }

//   canSubmit(): boolean {
//     const mustHaveHalfs = 2;
//     const mustHaveSpikes = this.maxPicks - mustHaveHalfs;

//     return (
//       this.pickedMatchesCount === this.maxPicks &&
//       this.halfCount === mustHaveHalfs &&
//       this.spikCount === mustHaveSpikes &&
//       this.totalSelectedOutcomes === this.requiredOutcomes
//     );
//   }

//   // ---- UI helpers ----

//   isActive(matchNo: number, o: Outcome): boolean {
//     return this.myPicks.get(matchNo)?.has(o) ?? false;
//   }

//   isDisabled(matchNo: number, o: Outcome): boolean {
//     const set = this.myPicks.get(matchNo) ?? new Set<Outcome>();
//     const isSelected = set.has(o);

//     // Avmarkera ska alltid gå
//     if (isSelected) return false;

//     // Per match: max 2 tecken
//     if (set.size >= 2) return true;

//     // Om matchen är tom och vi redan valt max antal matcher
//     if (set.size === 0 && this.pickedMatchesCount >= this.maxPicks) return true;

//     // Om detta klick skulle göra matchen till halvgardering och vi redan har 2 halvgarderingar
//     const wouldBecomeHalf = set.size === 1;
//     if (wouldBecomeHalf && this.halfCount >= 2) return true;

//     return false;
//   }

//   // ---- Main toggle logic ----

//   toggleOutcome(matchNo: number, o: Outcome) {
//     const prev = this.myPicks.get(matchNo);
//     const set = new Set<Outcome>(prev ? [...prev] : []);
//     const hadAnyBefore = set.size > 0;
//     const wasHalfBefore = set.size === 2;

//     // Toggle
//     if (set.has(o)) set.delete(o);
//     else set.add(o);

//     // Per match: max 2
//     if (set.size > 2) return;

//     const isNowEmpty = set.size === 0;
//     const isNowHalf = set.size === 2;

//     // Om man försöker börja på en NY match men redan har max matcher valda
//     if (!hadAnyBefore && !isNowEmpty && this.pickedMatchesCount >= this.maxPicks) return;

//     // Global: max 2 halvgarderingar (räkna hypotetiskt)
//     let nextHalfCount = this.halfCount;
//     if (wasHalfBefore && !isNowHalf) nextHalfCount--;
//     if (!wasHalfBefore && isNowHalf) nextHalfCount++;
//     if (nextHalfCount > 2) return;

//     // Commit state
//     if (isNowEmpty) this.myPicks.delete(matchNo);
//     else this.myPicks.set(matchNo, set);

//     // ⚠️ Inget spar här längre — sparas via "Lås in rad"
//   }

//   // ---- Serialization helpers (Pick) ----

//   private serializePick(set: Set<Outcome>): Pick {
//     const order: Outcome[] = ['1', 'X', '2'];
//     const s = order.filter((x) => set.has(x)).join('');
//     return s as Pick;
//   }

//   private parsePick(pick: Pick): Set<Outcome> {
//     const set = new Set<Outcome>();
//     for (const ch of pick) {
//       if (ch === '1' || ch === 'X' || ch === '2') set.add(ch);
//     }
//     if (set.size > 2) {
//       const order: Outcome[] = ['1', 'X', '2'];
//       const trimmed = order.filter((x) => set.has(x)).slice(0, 2);
//       return new Set(trimmed);
//     }
//     return set;
//   }

//   private getWeekNumber(date: Date): number {
//     const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
//     const dayNum = d.getUTCDay() || 7;
//     d.setUTCDate(d.getUTCDate() + 4 - dayNum);
//     const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
//     return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
//   }
// }
















// import { Component, DestroyRef, inject } from '@angular/core';
// import { CommonModule, NgFor } from '@angular/common';
// import { combineLatest, filter, map, of, switchMap, take } from 'rxjs';
// import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

// import { MatCardModule } from '@angular/material/card';
// import { MatChipsModule } from '@angular/material/chips';
// import { MatButtonModule } from '@angular/material/button';
// import { MatDividerModule } from '@angular/material/divider';
// import { MatSnackBar } from '@angular/material/snack-bar';

// import { Match, TipStatus, Pick } from '../../interfaces/tips';
// import { TipsDataService } from '../../services/tips-data.service';
// import { PicksService } from '../../services/pick.service';
// import { AuthService } from '../../services/auth.service';
// import { AvatarChipComponent } from '../avatar-chip-component/avatar-chip.component';

// type Outcome = '1' | 'X' | '2';

// type PickBadge = {
//   userId: string;
//   name: string | null;
//   pick: Pick;
// };

// @Component({
//   standalone: true,
//   selector: 'app-match-component.component',
//   imports: [
//     CommonModule,
//     MatCardModule,
//     MatChipsModule,
//     MatButtonModule,
//     NgFor,
//     MatDividerModule,
//     AvatarChipComponent
//   ],
//   templateUrl: './match-component.component.html',
//   styleUrl: './match-component.component.scss',
// })
// export class MatchComponentComponent {
//   private destroyRef = inject(DestroyRef);

//   loading = true;

//   roundNumber = 0;
//   maxPicks: 3 | 4 = 3;
//   thisWeek: number = this.getWeekNumber(new Date());

//   matches: Match[] = [];
//   status: TipStatus[] = [];

//   saving = false;
//   saveError: string | null = null;

//   drawNumber: number | null = null;
//   userId: string | null = null;

//   // mina val (event_number -> Set<'1'|'X'|'2'>)
//   myPicks = new Map<number, Set<Outcome>>();

//   // allas val per match (event_number -> [{name, pick}...])
//   picksByMatch = new Map<number, PickBadge[]>();

//   constructor(
//     private data: TipsDataService,
//     private picks: PicksService,
//     private auth: AuthService,
//     private snackBar: MatSnackBar
//   ) {}

//   ngOnInit() {
//     this.loading = true;

//     // status finns inte i DB än: kör tom lista
//     const status$ = of([] as TipStatus[]);

//     combineLatest([
//       this.data.getMeta(),
//       this.data.getMatches(),
//       status$,
//       this.auth.getUserId$(),
//     ])
//       .pipe(
//         filter(([meta, _m, _s, uid]) => !!meta && !!uid),
//         switchMap(([meta, matches, status, uid]) => {
//           this.roundNumber = meta.roundNumber;
//           this.maxPicks = meta.maxPicks;

//           this.drawNumber = meta.drawNumber;
//           this.userId = uid!;

//           this.matches = matches ?? [];
//           this.status = status ?? [];

//           // Ladda både: mina picks + allas picks
//           return combineLatest([
//             this.picks.getMyPicks(this.drawNumber!, this.userId!),
//             this.picks.getAllPicksForDraw(this.drawNumber!), // <-- NY
//           ]);
//         }),
//         takeUntilDestroyed(this.destroyRef)
//       )
//       .subscribe({
//         next: ([myRows, allRows]) => {
//           // Mina picks
//           this.myPicks = new Map<number, Set<Outcome>>();
//           myRows.forEach((r) => {
//             const set = this.parsePick(r.pick);
//             if (set.size > 0) this.myPicks.set(r.event_number, set);
//           });

//           // Allas picks per match
//           this.picksByMatch = new Map<number, PickBadge[]>();
//           allRows.forEach((r: any) => {
//             const list = this.picksByMatch.get(r.event_number) ?? [];
//             list.push({
//               userId: r.user_id,
//               name: r.display_name ?? null,
//               pick: r.pick as Pick,
//             });
//             this.picksByMatch.set(r.event_number, list);
//           });

//           this.loading = false;
//         },
//         error: (err) => {
//           console.error(err);
//           this.saveError = err?.message ?? 'Kunde inte ladda data';
//           this.loading = false;
//         },
//       });
//   }

//   lockInRow() {
//     if (!this.drawNumber || !this.userId) return;
//     if (!this.canSubmit()) return;

//     this.saving = true;
//     this.saveError = null;

//     const payload = [...this.myPicks.entries()]
//       .filter(([_, set]) => set.size > 0)
//       .map(([matchNo, set]) => ({
//         event_number: matchNo,
//         pick: this.serializePick(set),
//       }));

//     this.picks
//       .lockInPicks(this.drawNumber, this.userId, payload as any)
//       .pipe(take(1))
//       .subscribe({
//         next: () => {
//           this.snackBar.open('Raden sparad!', 'Stäng', {
//             verticalPosition: 'top',
//             duration: 3000,
//           });
//           this.saving = false;

//           // Efter save: refetcha allas picks så du direkt ser avatars uppdateras
//           this.picks
//             .getAllPicksForDraw(this.drawNumber!)
//             .pipe(take(1))
//             .subscribe({
//               next: (allRows) => {
//                 this.picksByMatch = new Map<number, PickBadge[]>();
//                 allRows.forEach((r: any) => {
//                   const list = this.picksByMatch.get(r.event_number) ?? [];
//                   list.push({
//                     userId: r.user_id,
//                     name: r.display_name ?? null,
//                     pick: r.pick as Pick,
//                   });
//                   this.picksByMatch.set(r.event_number, list);
//                 });
//               },
//               error: (e) => console.error('Refetch picks failed', e),
//             });
//         },
//         error: (err) => {
//           console.error(err);
//           this.saving = false;
//           this.saveError = err?.message ?? 'Kunde inte spara raden';
//         },
//       });
//   }

//   // ---- Counters / rules ----

//   get pickedMatchesCount(): number {
//     return [...this.myPicks.values()].filter((s) => s.size > 0).length;
//   }

//   get halfCount(): number {
//     return [...this.myPicks.values()].filter((s) => s.size === 2).length;
//   }

//   get spikCount(): number {
//     return [...this.myPicks.values()].filter((s) => s.size === 1).length;
//   }

//   get totalSelectedOutcomes(): number {
//     let sum = 0;
//     for (const set of this.myPicks.values()) sum += set.size;
//     return sum;
//   }

//   get requiredOutcomes(): number {
//     return this.maxPicks === 4 ? 6 : 5;
//   }

//   canSubmit(): boolean {
//     const mustHaveHalfs = 2;
//     const mustHaveSpikes = this.maxPicks - mustHaveHalfs;

//     return (
//       this.pickedMatchesCount === this.maxPicks &&
//       this.halfCount === mustHaveHalfs &&
//       this.spikCount === mustHaveSpikes &&
//       this.totalSelectedOutcomes === this.requiredOutcomes
//     );
//   }

//   // ---- UI helpers ----

//   isActive(matchNo: number, o: Outcome): boolean {
//     return this.myPicks.get(matchNo)?.has(o) ?? false;
//   }

//   isDisabled(matchNo: number, o: Outcome): boolean {
//     const set = this.myPicks.get(matchNo) ?? new Set<Outcome>();
//     const isSelected = set.has(o);

//     if (isSelected) return false;
//     if (set.size >= 2) return true;
//     if (set.size === 0 && this.pickedMatchesCount >= this.maxPicks) return true;

//     const wouldBecomeHalf = set.size === 1;
//     if (wouldBecomeHalf && this.halfCount >= 2) return true;

//     return false;
//   }

//   // ---- Main toggle logic ----

//   toggleOutcome(matchNo: number, o: Outcome) {
//     const prev = this.myPicks.get(matchNo);
//     const set = new Set<Outcome>(prev ? [...prev] : []);
//     const hadAnyBefore = set.size > 0;
//     const wasHalfBefore = set.size === 2;

//     if (set.has(o)) set.delete(o);
//     else set.add(o);

//     if (set.size > 2) return;

//     const isNowEmpty = set.size === 0;
//     const isNowHalf = set.size === 2;

//     if (!hadAnyBefore && !isNowEmpty && this.pickedMatchesCount >= this.maxPicks) return;

//     let nextHalfCount = this.halfCount;
//     if (wasHalfBefore && !isNowHalf) nextHalfCount--;
//     if (!wasHalfBefore && isNowHalf) nextHalfCount++;
//     if (nextHalfCount > 2) return;

//     if (isNowEmpty) this.myPicks.delete(matchNo);
//     else this.myPicks.set(matchNo, set);

//     // sparas via "Lås in rad"
//   }

//   // ---- Serialization helpers (Pick) ----

//   private serializePick(set: Set<Outcome>): Pick {
//     const order: Outcome[] = ['1', 'X', '2'];
//     const s = order.filter((x) => set.has(x)).join('');
//     return s as Pick;
//   }

//   private parsePick(pick: Pick): Set<Outcome> {
//     const set = new Set<Outcome>();
//     for (const ch of pick) {
//       if (ch === '1' || ch === 'X' || ch === '2') set.add(ch);
//     }
//     if (set.size > 2) {
//       const order: Outcome[] = ['1', 'X', '2'];
//       const trimmed = order.filter((x) => set.has(x)).slice(0, 2);
//       return new Set(trimmed);
//     }
//     return set;
//   }

//   private getWeekNumber(date: Date): number {
//     const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
//     const dayNum = d.getUTCDay() || 7;
//     d.setUTCDate(d.getUTCDate() + 4 - dayNum);
//     const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
//     return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
//   }
// }



import { Component, DestroyRef, inject } from '@angular/core';
import { CommonModule, NgFor } from '@angular/common';
import { combineLatest, filter, of, switchMap, take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Match, TipStatus, Pick } from '../../interfaces/tips';
import { TipsDataService } from '../../services/tips-data.service';
import { PicksService } from '../../services/pick.service';
import { AuthService } from '../../services/auth.service';
import { AvatarChipComponent } from '../avatar-chip-component/avatar-chip.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { SnapshotDialogComponent,SnapshotDialogData } from '../snapshot-dialog-component/snapshot-dialog.component';

type Outcome = '1' | 'X' | '2';

type PickBadge = {
  userId: string;
  name: string | null;
  pick: Pick;
};

@Component({
  standalone: true,
  selector: 'app-match-component.component',
  imports: [
    CommonModule,
    MatCardModule,
    MatChipsModule,
    MatButtonModule,
    NgFor,
    MatDividerModule,
    AvatarChipComponent,
    MatProgressSpinnerModule,
    SnapshotDialogComponent,
  ],
  templateUrl: './match-component.component.html',
  styleUrl: './match-component.component.scss',
})
export class MatchComponentComponent {
  private destroyRef = inject(DestroyRef);

  loading = true;

  roundNumber = 0;
  maxPicks: 3 | 4 = 3;
  thisWeek: number = this.getWeekNumber(new Date());

  matches: Match[] = [];
  status: TipStatus[] = [];

  saving = false;
  saveError: string | null = null;

  drawNumber: number | null = null;
  userId: string | null = null;

  // mina val (event_number -> Set<'1'|'X'|'2'>)
  myPicks = new Map<number, Set<Outcome>>();

  // allas val per match (event_number -> [{name, pick}...])
  picksByMatch = new Map<number, PickBadge[]>();

  constructor(
    private data: TipsDataService,
    private picks: PicksService,
    private auth: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnInit() {
    this.loading = true;

    const status$ = of([] as TipStatus[]);

    combineLatest([
      this.data.getMeta(),
      this.data.getMatches(),
      status$,
      this.auth.getUserId$(),
    ])
      .pipe(
        filter(([meta, _m, _s, uid]) => !!meta && !!uid),
        switchMap(([meta, matches, status, uid]) => {
          this.roundNumber = meta.roundNumber;
          this.maxPicks = meta.maxPicks;

          this.drawNumber = meta.drawNumber;
          this.userId = uid!;

          this.matches = matches ?? [];
          this.status = status ?? [];

          return combineLatest([
            this.picks.getMyPicks(this.drawNumber!, this.userId!),
            this.picks.getAllPicksForDraw(this.drawNumber!),
          ]);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ([myRows, allRows]) => {
          // Mina picks
          this.myPicks = new Map<number, Set<Outcome>>();
          myRows.forEach((r) => {
            const set = this.parsePick(r.pick);
            if (set.size > 0) this.myPicks.set(r.event_number, set);
          });

          // Allas picks per match
          this.picksByMatch = new Map<number, PickBadge[]>();
          allRows.forEach((r: any) => {
            const list = this.picksByMatch.get(r.event_number) ?? [];
            list.push({
              userId: r.user_id,
              name: r.display_name ?? null,
              pick: r.pick as Pick,
            });
            this.picksByMatch.set(r.event_number, list);
          });

          this.loading = false;
        },
        error: (err) => {
          console.error(err);
          this.saveError = err?.message ?? 'Kunde inte ladda data';
          this.loading = false;
        },
      });
  }


  openSnapshot() {
  const myPicksObj: Record<number, Pick> = {};
  this.myPicks.forEach((set, matchNo) => {
    myPicksObj[matchNo] = this.serializePick(set);
  });

  const picksByMatchObj: Record<number, any[]> = {};
  this.picksByMatch.forEach((list, matchNo) => {
    picksByMatchObj[matchNo] = list;
  });

  const payload: SnapshotDialogData = {
    matches: this.matches,
    myPicks: myPicksObj,
    picksByMatch: picksByMatchObj,
  };

  this.dialog.open(SnapshotDialogComponent, {
    data: payload,
    maxWidth: '100vw',
  });
}
  // -------------------------
  // NEW: “taken pick” helpers
  // -------------------------

  /** returnerar true om matchen är tagen av någon annan (inte du) */
  isTakenByOthers(matchNo: number): boolean {
    if (!this.userId) return false;
    const list = this.picksByMatch.get(matchNo) ?? [];
    return list.some((p) => p.userId !== this.userId);
  }

  /** hämtar pick-stringen (ex "1X") som “andra” låst in på matchen */
  getTakenPick(matchNo: number): Pick | null {
    if (!this.userId) return null;
    const list = this.picksByMatch.get(matchNo) ?? [];
    const other = list.find((p) => p.userId !== this.userId);
    return (other?.pick as Pick) ?? null;
  }

  /** om matchen är tagen: är outcome en del av deras pick? (ex 1 i "1X") */
  isTakenOutcome(matchNo: number, o: Outcome): boolean {
    const pick = this.getTakenPick(matchNo);
    if (!pick) return false;
    return pick.includes(o);
  }

  /** om matchen är tagen: ska outcome vara disabled? (t.ex 2 i "1X") */
  isOutcomeLocked(matchNo: number, o: Outcome): boolean {
    if (!this.isTakenByOthers(matchNo)) return false;
    return !this.isTakenOutcome(matchNo, o);
  }

  // -------------------------
  // Save
  // -------------------------

  lockInRow() {
    if (!this.drawNumber || !this.userId) return;
    if (!this.canSubmit()) return;

    this.saving = true;
    this.saveError = null;

    const payload = [...this.myPicks.entries()]
      .filter(([_, set]) => set.size > 0)
      .map(([matchNo, set]) => ({
        event_number: matchNo,
        pick: this.serializePick(set),
      }));

    this.picks
      .lockInPicks(this.drawNumber, this.userId, payload as any)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.snackBar.open('Raden sparad!', 'Stäng', {
            verticalPosition: 'top',
            duration: 3000,
          });
          this.saving = false;

          this.picks
            .getAllPicksForDraw(this.drawNumber!)
            .pipe(take(1))
            .subscribe({
              next: (allRows) => {
                this.picksByMatch = new Map<number, PickBadge[]>();
                allRows.forEach((r: any) => {
                  const list = this.picksByMatch.get(r.event_number) ?? [];
                  list.push({
                    userId: r.user_id,
                    name: r.display_name ?? null,
                    pick: r.pick as Pick,
                  });
                  this.picksByMatch.set(r.event_number, list);
                });
              },
              error: (e) => console.error('Refetch picks failed', e),
            });
        },
        error: (err) => {
          console.error(err);
          this.saving = false;
          this.saveError = err?.message ?? 'Kunde inte spara raden';
        },
      });
  }

  // ---- Counters / rules ----

  get pickedMatchesCount(): number {
    return [...this.myPicks.values()].filter((s) => s.size > 0).length;
  }

  get halfCount(): number {
    return [...this.myPicks.values()].filter((s) => s.size === 2).length;
  }

  get spikCount(): number {
    return [...this.myPicks.values()].filter((s) => s.size === 1).length;
  }

  get totalSelectedOutcomes(): number {
    let sum = 0;
    for (const set of this.myPicks.values()) sum += set.size;
    return sum;
  }

  get requiredOutcomes(): number {
    return this.maxPicks === 4 ? 6 : 5;
  }

  canSubmit(): boolean {
    const mustHaveHalfs = 2;
    const mustHaveSpikes = this.maxPicks - mustHaveHalfs;

    return (
      this.pickedMatchesCount === this.maxPicks &&
      this.halfCount === mustHaveHalfs &&
      this.spikCount === mustHaveSpikes &&
      this.totalSelectedOutcomes === this.requiredOutcomes
    );
  }

  // ---- UI helpers ----

  isActive(matchNo: number, o: Outcome): boolean {
    return this.myPicks.get(matchNo)?.has(o) ?? false;
  }

  isDisabled(matchNo: number, o: Outcome): boolean {
    // 1) Om matchen är tagen av annan: lås enligt deras pick (bara visa deras val, resten disabled)
    if (this.isTakenByOthers(matchNo)) {
      // om du vill blocka ALL interaktion på tagen match:
      // return true;  // <-- gör alla knappar disabled
      // men du ville: visa deras val och låsa resten:
      return this.isOutcomeLocked(matchNo, o);
    }

    // 2) Dina vanliga regler
    const set = this.myPicks.get(matchNo) ?? new Set<Outcome>();
    const isSelected = set.has(o);

    if (isSelected) return false;
    if (set.size >= 2) return true;
    if (set.size === 0 && this.pickedMatchesCount >= this.maxPicks) return true;

    const wouldBecomeHalf = set.size === 1;
    if (wouldBecomeHalf && this.halfCount >= 2) return true;

    return false;
  }

  toggleOutcome(matchNo: number, o: Outcome) {
    // Om matchen är tagen av annan: blocka helt (du ska inte kunna ändra)
    if (this.isTakenByOthers(matchNo)) return;

    const prev = this.myPicks.get(matchNo);
    const set = new Set<Outcome>(prev ? [...prev] : []);
    const hadAnyBefore = set.size > 0;
    const wasHalfBefore = set.size === 2;

    if (set.has(o)) set.delete(o);
    else set.add(o);

    if (set.size > 2) return;

    const isNowEmpty = set.size === 0;
    const isNowHalf = set.size === 2;

    if (!hadAnyBefore && !isNowEmpty && this.pickedMatchesCount >= this.maxPicks) return;

    let nextHalfCount = this.halfCount;
    if (wasHalfBefore && !isNowHalf) nextHalfCount--;
    if (!wasHalfBefore && isNowHalf) nextHalfCount++;
    if (nextHalfCount > 2) return;

    if (isNowEmpty) this.myPicks.delete(matchNo);
    else this.myPicks.set(matchNo, set);
  }

  // ---- Serialization helpers (Pick) ----

  private serializePick(set: Set<Outcome>): Pick {
    const order: Outcome[] = ['1', 'X', '2'];
    const s = order.filter((x) => set.has(x)).join('');
    return s as Pick;
  }

  private parsePick(pick: Pick): Set<Outcome> {
    const set = new Set<Outcome>();
    for (const ch of pick) {
      if (ch === '1' || ch === 'X' || ch === '2') set.add(ch);
    }
    if (set.size > 2) {
      const order: Outcome[] = ['1', 'X', '2'];
      const trimmed = order.filter((x) => set.has(x)).slice(0, 2);
      return new Set(trimmed);
    }
    return set;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}


