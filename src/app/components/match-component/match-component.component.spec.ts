import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { MatchComponentComponent } from './match-component.component';
import { AuthService } from '../../services/auth.service';
import { LiveService } from '../../services/live.service';
import { LiveEvent, LivePick } from '../../interfaces/live';
import { testAuth } from '../../../testing/test-providers';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

describe('Live coupon', () => {
  let fixture: ComponentFixture<MatchComponentComponent>;
  let component: MatchComponentComponent;
  let service: jasmine.SpyObj<LiveService>;
  let member: BehaviorSubject<boolean>;
  let changed: () => void;
  const event = (n: number, player: number | null = null): LiveEvent => ({
    event_number: n, match_id: String(100+n), player_id: player, home_team: 'Home', away_team: 'Away',
    kickoff: null, league: null, cancelled: false, odds: [1.65,4.2,5.5], crowd: [.68,.17,.15],
    odds_retrieved_at: null, crowd_retrieved_at: null,
  });
  const flush = async () => { for(let i=0;i<15;i++) await Promise.resolve(); fixture.detectChanges(); };
  beforeEach(async () => {
    member = new BehaviorSubject(true);
    service = jasmine.createSpyObj('LiveService',['draws','load','subscribe','save','sync','adminPicks','correct']);
    service.draws.and.resolveTo([{ draw_number: 4971, round_number: 1, four_player_id: 1, status: 'open',
      reg_open_time: null, reg_close_time: new Date(Date.now()+86400000).toISOString(),
      retrieved_at: new Date().toISOString(), next_fetch_at: new Date(Date.now()+3600000).toISOString(), last_error: null, round_id: null }]);
    service.load.and.resolveTo({ events: Array.from({length:13},(_,i)=>event(i+1)), picks: [], results: [],
      players: [{id:1,name:'Ompen'},{id:2,name:'Sillen'},{id:3,name:'Adrian'},{id:4,name:'Danne'}] });
    service.subscribe.and.callFake((change,status) => { changed = change; status('SUBSCRIBED'); return () => {}; });
    service.save.and.callFake(async (_draw,e,pick,revision,player) => ({event_number:e.event_number,match_id:e.match_id,pick,revision:revision+1,player_id:pick ? player! : null}));
    await TestBed.configureTestingModule({ imports:[MatchComponentComponent],providers:[provideRouter([]),provideNoopAnimations(),
      { provide: LiveService,useValue:service },{provide:AuthService,useValue:{...testAuth,isLoggedIn$:()=>member.asObservable()}}] }).compileComponents();
    fixture=TestBed.createComponent(MatchComponentComponent); component=fixture.componentInstance;
    spyOn(TestBed.inject(Router),'navigateByUrl').and.resolveTo(true);
    fixture.detectChanges(); await flush();
  });
  afterEach(()=>fixture.destroy());
  it('opens a frozen overview of all saved signs and owners, ignoring replaced matches', async () => {
    const event = component.events[0];
    component.picks.set(1,{event_number:1,match_id:event.match_id,pick:'1X',revision:1,player_id:2});
    component.picks.set(2,{event_number:2,match_id:'replaced',pick:'2',revision:1,player_id:3});
    component.openOverview(); await flush();
    const ref = TestBed.inject(MatDialog).openDialogs[0];
    const snapshot = ref.componentInstance;
    expect(snapshot.data.round).toBe(1);
    expect(snapshot.data.rows.length).toBe(13);
    expect(snapshot.data.rows[0].pick).toBe('1X');
    expect(snapshot.data.rows[0].owner).toBe('Sillen');
    expect(snapshot.data.rows[0].color).toBe(component.playerColor(2));
    expect(snapshot.data.rows[1].pick).toBe('');
    component.picks.get(1)!.pick='2'; component.events[0].home_team='Changed';
    expect(snapshot.data.rows[0].pick).toBe('1X');
    expect(snapshot.data.rows[0].home).toBe('Home');
    expect(document.querySelectorAll('app-coupon-overview .selected').length).toBe(2);
    expect(document.querySelector('app-coupon-overview .incomplete')?.textContent).toContain('12 matcher saknar tips');
    member.next(false); await flush();
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(0);
  });
  it('does not open an overview with unsaved or pending selections', () => {
    component.drafts.set(1,{pick:'1',player:1,match:component.events[0].match_id,revision:0});
    component.openOverview(); expect(TestBed.inject(MatDialog).openDialogs.length).toBe(0);
    component.drafts.clear(); component.pending.set(1,1);
    component.openOverview(); expect(TestBed.inject(MatDialog).openDialogs.length).toBe(0);
  });
  it('identifies the four-match player in the team status', () => {
    expect(fixture.nativeElement.querySelector('.four-badge').parentElement.textContent).toContain('Ompen');
  });
  it('shows the latest saved market fetch in Swedish time beside refresh', () => {
    component.events[0].odds_retrieved_at = '2026-09-17T12:35:00Z';
    component.events[0].crowd_retrieved_at = '2026-09-17T12:35:00Z';
    component.events[1].odds_retrieved_at = '2026-09-17T11:00:00Z';
    fixture.detectChanges();
    const status = fixture.nativeElement.querySelector('.refresh-tools .fetch-status');
    expect(status.textContent).toContain('Odds & Svenska folket');
    expect(status.textContent).toContain('14:35');
    expect(status.querySelectorAll('time').length).toBe(1);
    expect(status.querySelector('time').getAttribute('datetime')).toBe('2026-09-17T12:35:00.000Z');
  });
  it('keeps separate market timestamps when only odds are refreshed', () => {
    component.events[0].odds_retrieved_at = '2026-09-17T12:35:00Z';
    component.events[0].crowd_retrieved_at = '2026-09-17T11:00:00Z';
    expect(component.marketUpdates).toEqual([
      {label:'Odds',at:'2026-09-17T12:35:00.000Z'},
      {label:'Svenska folket',at:'2026-09-17T11:00:00.000Z'},
    ]);
  });
  it('does not invent market fetch times from a page reload or failed refresh', async () => {
    expect(component.marketUpdates[0].at).toBeNull();
    component.events[0].odds_retrieved_at = '2026-09-17T12:35:00Z';
    component.events[0].crowd_retrieved_at = '2026-09-17T12:35:00Z';
    const before = component.marketUpdates;
    service.sync.and.rejectWith(new Error('Offline'));
    await component.refresh();
    expect(component.marketUpdates).toEqual(before);
  });
  it('shows all 13 matches as available, plus real odds and percentages', () => {
    expect(fixture.nativeElement.querySelectorAll('article.match').length).toBe(13);
    expect(fixture.nativeElement.textContent).toContain('68%');
    expect(fixture.nativeElement.textContent).toContain('Sillen');
    expect(fixture.nativeElement.querySelectorAll('.owner').length).toBe(13);
    expect(component.events.every(e=>component.owner(e)===null)).toBeTrue();
    expect([...fixture.nativeElement.querySelectorAll('.owner')].every((owner: any) => owner.textContent.trim() === '')).toBeTrue();
    expect(fixture.nativeElement.querySelectorAll('.tips button').length).toBe(39);
  });
  it('claims any free match, cannot edit another player and never allows three signs', async () => {
    component.events[4].player_id=2;
    component.toggle(component.events[4],'1'); expect(service.save).not.toHaveBeenCalled();
    const e=component.events[12]; component.toggle(e,'1'); component.toggle(e,'X'); component.toggle(e,'2');
    expect(component.pick(e)).toBe('1X'); await flush();
    expect(service.save).toHaveBeenCalledTimes(2); expect(component.pick(e)).toBe('1X');
    expect(component.owner(e)).toBe(1);
  });
  it('serializes rapid changes with the acknowledged revision and optimistic feedback', async () => {
    let resolve!: (pick:LivePick)=>void;
    service.save.and.returnValue(new Promise<LivePick>(r=>resolve=r));
    const e=component.events[0]; component.toggle(e,'1'); component.toggle(e,'X');
    expect(component.pick(e)).toBe('1X'); expect(component.saving).toBeTrue();
    await flush(); expect(service.save).toHaveBeenCalledTimes(1);
    service.save.and.callFake(async (_d,row,pick,revision,player)=>({event_number:row.event_number,match_id:row.match_id,pick,revision:revision+1,player_id:player!}));
    resolve({event_number:1,match_id:e.match_id,pick:'1',revision:1,player_id:1}); await flush();
    expect(service.save.calls.mostRecent().args[3]).toBe(1);
    expect(component.pick(e)).toBe('1X'); expect(component.saving).toBeFalse();
  });
  it('rolls back failed saves and cancels dependent queued changes', async () => {
    service.save.and.rejectWith(new Error('Offline'));
    const e=component.events[0]; component.toggle(e,'1'); component.toggle(e,'X'); await flush();
    expect(component.pick(e)).toBe(''); expect(component.error).toContain('Offline');
    expect(service.save).toHaveBeenCalledTimes(1);
    expect(component.owner(e)).toBeNull();
  });
  it('tracks exact completion for three and four matches', () => {
    for(const [n,p] of [[1,'1X'],[2,'12'],[3,'1'],[4,'2'],[5,'1X'],[6,'X2'],[7,'1']] as const) {
      component.optimistic.set(n,p);
      component.optimisticPlayers.set(n,n<=4?1:2);
    }
    expect(component.status(1).complete).toBeTrue(); expect(component.status(2).complete).toBeTrue();
    component.optimistic.set(4,''); expect(component.status(1).complete).toBeFalse();
  });
  it('locks immediately at deadline without waiting for another response', () => {
    component.now=Date.parse(component.draw!.reg_close_time);
    expect(component.canEdit(component.events[0])).toBeFalse();
    component.toggle(component.events[0],'1'); expect(service.save).not.toHaveBeenCalled();
  });
  it('refreshes other players picks on realtime notification', async () => {
    const snapshot=await service.load(4971);
    snapshot.picks=[{event_number:5,match_id:component.events[4].match_id,pick:'X2',revision:1,player_id:2}];
    service.load.and.resolveTo(snapshot);
    changed(); await new Promise(resolve=>setTimeout(resolve,150)); await flush();
    expect(component.pick(component.events[4])).toBe('X2');
    expect(component.canEdit(component.events[4])).toBeFalse();
  });
  it('does not overwrite a newer revision with an older read', async () => {
    const e=component.events[0]; component.toggle(e,'1'); await flush();
    const snapshot=await service.load(4971);
    snapshot.picks=[{event_number:1,match_id:e.match_id,pick:'',revision:0,player_id:null}];
    service.load.and.resolveTo(snapshot); await component.reload();
    expect(component.pick(e)).toBe('1');
    expect(component.owner(e)).toBe(1);
  });
  it('enforces two spikes and two halves for the four-match player, including pending saves', async () => {
    component.toggle(component.events[12],'1'); component.toggle(component.events[7],'2');
    component.toggle(component.events[0],'1');
    expect(component.drafts.has(1)).toBeTrue();
    expect(component.status(1).singles).toBe(2);
    component.toggle(component.events[0],'X');
    component.toggle(component.events[1],'X'); component.toggle(component.events[1],'2');
    expect(component.status(1).complete).toBeTrue();
    expect(component.disabled(component.events[2],'1')).toBeTrue();
    expect(component.disabled(component.events[12],'X')).toBeTrue();
    expect(component.disabled(component.events[0],'1')).toBeFalse();
    await flush(); expect(service.save).toHaveBeenCalledTimes(4);
  });
  it('enforces one spike and two halves for a three-match player', async () => {
    component.auth.identity={player_id:2,name:'Sillen',is_admin:false};
    component.toggle(component.events[12],'1');
    component.toggle(component.events[4],'1');
    expect(component.drafts.has(5)).toBeTrue();
    expect(component.status(2).singles).toBe(1);
    component.toggle(component.events[4],'X'); component.toggle(component.events[0],'1'); component.toggle(component.events[0],'2');
    expect(component.status(2).complete).toBeTrue();
    expect(component.disabled(component.events[1],'X')).toBeTrue();
    await flush(); expect(service.save).toHaveBeenCalledTimes(3);
  });
  it('releases a match and its quota when the saved tip is removed', async () => {
    const e=component.events[8]; component.toggle(e,'1'); component.toggle(e,'X'); await flush();
    component.toggle(e,'X'); component.toggle(e,'1');
    expect(component.owner(e)).toBeNull(); expect(component.status(1).picked).toBe(0);
    await flush();
    expect(component.owner(e)).toBeNull(); expect(component.pick(e)).toBe('');
    expect(service.save.calls.mostRecent().args[3]).toBe(3);
  });
  it('only saves a half after the second click when the spike quota is full', async () => {
    component.auth.identity={player_id:2,name:'Sillen',is_admin:false};
    component.toggle(component.events[0],'1'); await flush(); service.save.calls.reset();
    const e=component.events[1]; component.toggle(e,'X'); await flush();
    expect(service.save).not.toHaveBeenCalled();
    expect(component.pick(e)).toBe('X'); expect(component.status(2).singles).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Osparat val');
    component.toggle(e,'2'); await flush();
    expect(service.save).toHaveBeenCalledTimes(1);
    expect(service.save.calls.mostRecent().args[2]).toBe('X2');
    expect(component.drafts.size).toBe(0);
  });
  it('can cancel an unfinished half without claiming the match', async () => {
    component.auth.identity={player_id:2,name:'Sillen',is_admin:false};
    component.toggle(component.events[0],'1'); await flush(); service.save.calls.reset();
    const e=component.events[1]; component.toggle(e,'X'); component.toggle(e,'X'); await flush();
    expect(service.save).not.toHaveBeenCalled(); expect(component.owner(e)).toBeNull();
    expect(component.drafts.size).toBe(0);
  });
  it('changes a saved half through a local intermediate sign without saving an excess spike', async () => {
    component.auth.identity={player_id:2,name:'Sillen',is_admin:false};
    component.toggle(component.events[0],'1');
    const e=component.events[1]; component.toggle(e,'1'); component.toggle(e,'X'); await flush();
    service.save.calls.reset();
    component.toggle(e,'1'); await flush();
    expect(service.save).not.toHaveBeenCalled(); expect(component.pick(e)).toBe('X');
    expect(component.picks.get(2)?.pick).toBe('1X');
    component.toggle(e,'2'); await flush();
    expect(service.save.calls.mostRecent().args[2]).toBe('X2');
    expect(component.status(2).singles).toBe(1);
  });
  it('discards a local unfinished choice if another player claims the match', async () => {
    component.auth.identity={player_id:2,name:'Sillen',is_admin:false};
    component.toggle(component.events[0],'1'); await flush();
    const e=component.events[1]; component.toggle(e,'X');
    const snapshot=await service.load(4971);
    snapshot.picks=[{event_number:2,match_id:e.match_id,pick:'1',revision:1,player_id:3}];
    service.load.and.resolveTo(snapshot); await component.reload();
    expect(component.drafts.size).toBe(0); expect(component.owner(e)).toBe(3);
    expect(component.canEdit(e)).toBeFalse(); expect(component.error).toContain('ändrades');
  });
  it('clears private coupon data when membership is revoked', () => {
    member.next(false); expect(component.events).toEqual([]); expect(component.picks.size).toBe(0);
  });
});
