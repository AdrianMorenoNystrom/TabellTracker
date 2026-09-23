import { Component, Injectable, inject, signal } from '@angular/core';
import { of } from 'rxjs';
import { MatchComponentComponent } from '../components/match-component/match-component.component';
import { RoundRecapStoryComponent } from '../components/round-recap-story/round-recap-story.component';
import { LiveService } from '../services/live.service';
import { AuthService } from '../services/auth.service';
import { RoundRecapService } from '../services/round-recap.service';
import { LiveDraw, LiveEvent, LivePick } from '../interfaces/live';
import { Round } from '../interfaces/round';
import { buildRoundRecap, RoundRecap } from '../utils/round-recap';

const players = ['Ompen', 'Sillen', 'Adrian', 'Danne'].map((name, i) => ({id:i+1,name}));
const round: Round = {id:27,roundNumber:27,week:39,seasonId:1,seasonName:'Testsäsong',totalScore:9,
  players:players.map((p,i)=>({...p,score:[4,2,2,1][i],matchesPicked:i===0?4:3,total_matches:i===0?4:3,avg_score_per_round:0}))};

@Injectable()
class PreviewRecap {
  readonly active = signal<RoundRecap | null>(null);
  async reopen() { this.active.set(buildRoundRecap([round],27)); }
  dismiss() { this.active.set(null); }
}

/** Deliberately no Supabase dependency: all reads and writes stay in memory. */
@Injectable()
class PreviewLive {
  private changed = () => {};
  private hasNext = false;
  private nextPicks = new Map<number, LivePick>();
  private readonly stamp = new Date().toISOString();
  private readonly old: LiveDraw = {draw_number:900027,round_number:27,four_player_id:1,status:'settled',round_id:27,
    reg_open_time:null,reg_close_time:new Date(Date.now()-86400000).toISOString(),retrieved_at:this.stamp,next_fetch_at:this.stamp,last_error:null};
  private readonly next: LiveDraw = {...this.old,draw_number:900028,round_number:28,four_player_id:2,status:'open',round_id:null,
    reg_close_time:new Date(Date.now()+2*86400000).toISOString(),next_fetch_at:new Date(Date.now()+3600000).toISOString()};
  async draws() { return structuredClone(this.hasNext ? [this.next,this.old] : [this.old]); }
  async load(draw: number) {
    const isOld = draw === this.old.draw_number;
    const teams = ['Arsenal|Chelsea','Liverpool|Everton','Leeds|Burnley','Fulham|Brentford','Newcastle|Sunderland',
      'Brighton|Bournemouth','Tottenham|West Ham','Aston Villa|Nottingham','Derby|Watford','Norwich|Coventry',
      'Blackburn|Bristol City','Southampton|Swansea','Middlesbrough|Millwall'];
    const signs = ['1X','12','1','1','1X','12','1','1X','12','1','1X','12','1'];
    const outcomes = ['1','1','1','1','1','1','2','1','1','2','1','X','2'];
    const events: LiveEvent[] = teams.map((teams,i)=>({event_number:i+1,match_id:`${draw}-${i+1}`,
      home_team:teams.split('|')[0],away_team:teams.split('|')[1],player_id:isOld?(i<4?1:i<7?2:i<10?3:4):this.nextPicks.get(i+1)?.player_id??null,
      kickoff:(isOld?this.old:this.next).reg_close_time,league:'England',cancelled:false,odds:[1.8,3.5,4.2],crowd:[.55,.25,.2],
      odds_retrieved_at:this.stamp,crowd_retrieved_at:this.stamp}));
    return {events,players,picks:isOld?events.map((e,i)=>({event_number:e.event_number,match_id:e.match_id,player_id:e.player_id!,pick:signs[i],revision:1})):Array.from(this.nextPicks.values()),
      results:isOld?events.map((e,i)=>({event_number:e.event_number,match_id:e.match_id,outcome:outcomes[i],home_score:null,away_score:null})):[]};
  }
  subscribe(change:()=>void,status:(value:string)=>void) { this.changed=change;status('SUBSCRIBED');return ()=>{this.changed=()=>{};}; }
  async sync() { this.changed(); return 'Testdata uppdaterad'; }
  async save(_draw:number,event:LiveEvent,pick:string,revision:number,player:number) {
    const result={event_number:event.event_number,match_id:event.match_id,pick,revision:revision+1,player_id:pick?player:null};
    this.nextPicks.set(event.event_number,result);return result;
  }
  publishNext() { this.hasNext=true;this.changed(); }
  reset() { this.hasNext=false;this.nextPicks.clear(); }
}

const previewAuth = {
  identity:{player_id:3,name:'Adrian',is_admin:false},
  isLoggedIn$:()=>of(true),isLoggedInSnapshot:()=>true,isUserAdminSnapshot:()=>false,refresh:async()=>{},
};

@Component({
  standalone:true,
  imports:[MatchComponentComponent,RoundRecapStoryComponent],
  providers:[PreviewLive,PreviewRecap,{provide:LiveService,useExisting:PreviewLive},
    {provide:RoundRecapService,useExisting:PreviewRecap},{provide:AuthService,useValue:previewAuth}],
  template:`
    <aside aria-label="Utvecklingsverktyg">
      <strong>Förhandsvisning · lokal testdata</strong>
      <p>Inga tips, resultat eller kvittenser sparas i Supabase.</p>
      <button type="button" (click)="reset()">Visa rättad kupong</button>
      <button type="button" (click)="live.publishNext()">Simulera nästa kupong</button>
    </aside>
    @if (visible()) { <app-match-component /> }
    @if (recap.active(); as story) {
      <app-round-recap-story [recap]="story" (dismiss)="recap.dismiss()" />
    }
  `,
  styles:[`aside {padding:16px;background:#fff5dc;font:14px Arial,sans-serif;} aside *{font-family:inherit;}
    button{min-height:44px;padding:8px 12px;margin:4px;border:1px solid #00427a;background:white;color:#00427a;cursor:pointer;}
    button:focus-visible{outline:3px solid #00427a;outline-offset:2px;}`],
})
export class CouponPreviewComponent {
  readonly live=inject(PreviewLive);
  readonly recap=inject(PreviewRecap);
  readonly visible=signal(true);
  reset() {
    this.recap.dismiss();this.live.reset();this.visible.set(false);
    setTimeout(()=>this.visible.set(true),0);
  }
}
