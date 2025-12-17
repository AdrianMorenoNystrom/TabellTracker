// src/app/services/tips-data.service.ts
import { Injectable } from '@angular/core';
import { map, Observable, shareReplay } from 'rxjs';
import { StryktipsetReadService } from './stryktipset-read.service';
import { Match } from '../interfaces/tips';

@Injectable({ providedIn: 'root' })
export class TipsDataService {
  private _latest$?: Observable<any>;

  constructor(private read: StryktipsetReadService) {}

  get latest$(): Observable<any> {
    if (!this._latest$) {
      this._latest$ = this.read.getLatest().pipe(shareReplay(1));
    }
    return this._latest$;
  }

  getMeta(): Observable<{ roundNumber: number; maxPicks: 3 | 4 }> {
    return this.latest$.pipe(
      map(({ draw }) => ({
        roundNumber: Number(draw.draw_number), // eller drawNumber om du vill
        maxPicks: 3 as const, // kan du senare läsa från “current player” i DB
      }))
    );
  }

  getMatches(): Observable<Match[]> {
    return this.latest$.pipe(
      map(({ events }) =>
        (events ?? []).map((e: any) => ({
          matchNo: Number(e.event_number),
          home: e.home_team,
          away: e.away_team,

          // om du vill visa i UI senare:
          league: e.league_name,
          odds: { '1': Number(e.odds_1), 'X': Number(e.odds_x), '2': Number(e.odds_2) },
          percent: { '1': Number(e.dist_1), 'X': Number(e.dist_x), '2': Number(e.dist_2) },
        }))
      )
    );
  }
}
