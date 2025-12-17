import { Component } from '@angular/core';
import { CommonModule, NgFor } from '@angular/common';
import { combineLatest } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';

import { TipsMockService } from '../../services/tips-mock.service';
import { Match, TipStatus, MyPick, Pick } from '../../interfaces/tips';
import { TipsDataService } from '../../services/tips-data.service';
import { MatDividerModule } from '@angular/material/divider';
type Outcome = '1' | 'X' | '2';

@Component({
  standalone: true,
  selector: 'app-match-component.component',
  imports: [CommonModule, MatCardModule, MatChipsModule, MatButtonModule,NgFor,MatDividerModule],
  templateUrl: './match-component.component.html',
  styleUrl: './match-component.component.scss'
})
export class MatchComponentComponent {
  loading = true;

  roundNumber = 0;
  maxPicks: 3 | 4 = 3;
  thisWeek: number = this.getWeekNumber(new Date());
  matches: Match[] = [];
  status: TipStatus[] = [];

  // matchNo -> set av val, t.ex {'1','X'} för 1X
  myPicks = new Map<number, Set<Outcome>>();

  constructor(private tips: TipsMockService,  private data: TipsDataService,) {}

ngOnInit() {
  combineLatest([
    this.data.getMeta(),      // <-- REAL (Supabase)
    this.data.getMatches(),   // <-- REAL (Supabase)
    this.tips.getMyPicks(),   // <-- mock tills vidare
    this.tips.getStatus(),    // <-- mock tills vidare
  ]).subscribe(([meta, matches, picks, status]) => {
    this.roundNumber = meta.roundNumber;
    this.maxPicks = meta.maxPicks;

    this.matches = matches ?? [];
    this.status = status ?? [];

    this.myPicks = new Map<number, Set<Outcome>>();
    (picks ?? []).forEach((p: MyPick) => {
      const set = this.parsePick(p.pick);
      if (set.size > 0) this.myPicks.set(p.matchNo, set);
    });

    this.loading = false;
  });
}

  // ---- Counters / rules ----

  get pickedMatchesCount(): number {
    return [...this.myPicks.values()].filter(s => s.size > 0).length;
  }

  get halfCount(): number {
    return [...this.myPicks.values()].filter(s => s.size === 2).length;
  }

  get spikCount(): number {
    return [...this.myPicks.values()].filter(s => s.size === 1).length;
  }

  get minSpikRequired(): number {
    return this.maxPicks === 4 ? 2 : 1;
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

  return this.pickedMatchesCount === this.maxPicks
    && this.halfCount === mustHaveHalfs
    && this.spikCount === mustHaveSpikes
    && this.totalSelectedOutcomes === this.requiredOutcomes;
}

  // ---- UI helpers ----

  isActive(matchNo: number, o: Outcome): boolean {
    return this.myPicks.get(matchNo)?.has(o) ?? false;
  }

  isDisabled(matchNo: number, o: Outcome): boolean {
    const set = this.myPicks.get(matchNo) ?? new Set<Outcome>();
    const isSelected = set.has(o);

    // Avmarkera ska alltid gå
    if (isSelected) return false;

    // Per match: max 2 tecken
    if (set.size >= 2) return true;

    // Om matchen är tom och vi redan valt max antal matcher
    if (set.size === 0 && this.pickedMatchesCount >= this.maxPicks) return true;

    // Om detta klick skulle göra matchen till halvgardering och vi redan har 2 halvgarderingar
    // (dvs set.size === 1 och man lägger till ett till val)
    const wouldBecomeHalf = set.size === 1;
    if (wouldBecomeHalf && this.halfCount >= 2) return true;

    return false;
  }

  // ---- Main toggle logic ----

  toggleOutcome(matchNo: number, o: Outcome) {
    const prev = this.myPicks.get(matchNo);
    const set = new Set<Outcome>(prev ? [...prev] : []);
    const hadAnyBefore = set.size > 0;
    const wasHalfBefore = set.size === 2;

    // Toggle
    if (set.has(o)) set.delete(o);
    else set.add(o);

    // Per match: max 2
    if (set.size > 2) return;

    const isNowEmpty = set.size === 0;
    const isNowHalf = set.size === 2;

    // Om man försöker börja på en NY match men redan har max matcher valda
    if (!hadAnyBefore && !isNowEmpty && this.pickedMatchesCount >= this.maxPicks) return;

    // Global: max 2 halvgarderingar (räkna hypotetiskt)
    let nextHalfCount = this.halfCount;
    if (wasHalfBefore && !isNowHalf) nextHalfCount--;
    if (!wasHalfBefore && isNowHalf) nextHalfCount++;
    if (nextHalfCount > 2) return;

    // Commit state
    if (isNowEmpty) this.myPicks.delete(matchNo);
    else this.myPicks.set(matchNo, set);

    // Persist
    if (isNowEmpty) {
      this.tips.clearPick(matchNo).subscribe();
    } else {
      const pick = this.serializePick(set);
      this.tips.savePick(matchNo, pick).subscribe();
    }
  }

  // ---- Serialization helpers (Pick) ----

  private serializePick(set: Set<Outcome>): Pick {
    const order: Outcome[] = ['1', 'X', '2'];
    const s = order.filter(x => set.has(x)).join('');
    // s blir alltid '', '1','X','2','1X','12','X2' pga reglerna
    return s as Pick;
  }

  private parsePick(pick: Pick): Set<Outcome> {
    const set = new Set<Outcome>();
    for (const ch of pick) {
      if (ch === '1' || ch === 'X' || ch === '2') set.add(ch);
    }
    // säkerställ max 2
    if (set.size > 2) {
      const order: Outcome[] = ['1','X','2'];
      const trimmed = order.filter(x => set.has(x)).slice(0,2);
      return new Set(trimmed);
    }
    return set;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }
}
