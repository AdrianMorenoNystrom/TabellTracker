import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Match, MyPick, Pick, TipStatus } from '../interfaces/tips';

@Injectable({ providedIn: 'root' })
export class TipsMockService {
  private picks: MyPick[] = [
    { matchNo: 1, pick: '1X' }, // exempel: halvgardering
    { matchNo: 3, pick: 'X' },
  ];

  getCurrentRoundMeta(): Observable<{ roundNumber: number; maxPicks: 3 | 4 }> {
    return of({ roundNumber: 14, maxPicks: 3 });
  }

  getMatches(): Observable<Match[]> {
    return of([
      { matchNo: 1, home: 'Arsenal', away: 'Spurs' },
      { matchNo: 2, home: 'Leeds', away: 'Hull' },
      { matchNo: 3, home: 'Roma', away: 'Lazio' },
      { matchNo: 4, home: 'Milan', away: 'Atalanta' },
      { matchNo: 5, home: 'Valencia', away: 'Betis' },
      { matchNo: 6, home: 'Porto', away: 'Braga' },
      { matchNo: 7, home: 'Ajax', away: 'PSV' },
      { matchNo: 8, home: 'Celtic', away: 'Rangers' },
      { matchNo: 9, home: 'Basel', away: 'Young Boys' },
      { matchNo: 10, home: 'Fenerbahce', away: 'Besiktas' },
      { matchNo: 11, home: 'PAOK', away: 'AEK' },
      { matchNo: 12, home: 'AIK', away: 'Djurgården' },
      { matchNo: 13, home: 'MFF', away: 'IFK Göteborg' },
    ]);
  }

  getMyPicks(): Observable<MyPick[]> {
    return of(this.picks.slice());
  }

  getStatus(): Observable<TipStatus[]> {
    return of([
      { name: 'Sillen', submitted: true },
      { name: 'Adrian', submitted: false },
      { name: 'Ompen', submitted: false },
      { name: 'Danne', submitted: true },
    ]);
  }

  savePick(matchNo: number, pick: Pick): Observable<{ ok: true }> {
    const i = this.picks.findIndex(p => p.matchNo === matchNo);
    if (i >= 0) this.picks[i] = { matchNo, pick };
    else this.picks.push({ matchNo, pick });
    return of({ ok: true });
  }

  clearPick(matchNo: number): Observable<{ ok: true }> {
    this.picks = this.picks.filter(p => p.matchNo !== matchNo);
    return of({ ok: true });
  }
}
