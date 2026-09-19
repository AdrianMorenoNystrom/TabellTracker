import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { SUPABASE } from './supabase.client';
import { RoundRecapService } from './round-recap.service';
import { Round } from '../interfaces/round';

const round: Round = {id:27,roundNumber:27,week:27,seasonId:1,totalScore:9,
  players:['Ompen','Adrian','Sillen','Danne'].map((name,i)=>({id:i+1,name,score:i===0?3:2,matchesPicked:i===0?4:3,total_matches:3,avg_score_per_round:2}))};

describe('RoundRecapService', () => {
  let service: RoundRecapService;
  let rpc: jasmine.Spy;
  let loggedIn: BehaviorSubject<boolean>;
  beforeEach(() => {
    loggedIn = new BehaviorSubject(true);
    rpc = jasmine.createSpy().and.resolveTo({data:{round_id:27,rounds:[round]},error:null});
    TestBed.configureTestingModule({providers:[
      {provide:SUPABASE,useValue:{rpc}},
      {provide:Router,useValue:{navigated:true,url:'/',events:new Subject()}},
      {provide:AuthService,useValue:{identity:{player_id:1},isReady$:()=>new BehaviorSubject(true),
        isLoggedIn$:()=>loggedIn,getUserId$:()=>new BehaviorSubject('auth-device')}},
    ]});
    service = TestBed.inject(RoundRecapService);
  });
  const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
  it('opens an unseen completed round without acknowledging it', async () => {
    service.start(); await tick();
    expect(service.active()?.round.id).toBe(27);
    expect(rpc.calls.allArgs()).toEqual([['round_recap_pending']]);
    TestBed.resetTestingModule();
    expect(rpc.calls.count()).toBe(1); // page destruction never marks seen
  });
  it('shows nothing for no completed/unseen round', async () => {
    rpc.and.resolveTo({data:null,error:null}); service.start(); await tick();
    expect(service.active()).toBeNull();
  });
  it('explicit dismissal acknowledges only the displayed round, once', async () => {
    service.start(); await tick();
    rpc.and.resolveTo({data:null,error:null});
    await Promise.all([service.dismiss(),service.dismiss()]);
    expect(rpc.calls.allArgs()).toEqual([['round_recap_pending'],['round_recap_acknowledge',{p_round_id:27}]]);
    expect(service.active()).toBeNull();
  });
  it('keeps recap open on write failure and lets the user retry', async () => {
    service.start(); await tick();
    rpc.and.resolveTo({error:{message:'offline'}}); await service.dismiss();
    expect(service.active()).not.toBeNull(); expect(service.error()).toContain('Försök stänga igen');
    rpc.and.resolveTo({error:null}); await service.dismiss(); expect(service.active()).toBeNull();
  });
  it('ignores delayed fetch after revocation and never marks it seen', async () => {
    let resolve!: (data: unknown) => void;
    rpc.and.returnValue(new Promise(done => resolve = done)); service.start();
    loggedIn.next(false); resolve({data:{round_id:27,rounds:[round]},error:null}); await tick();
    expect(service.active()).toBeNull(); expect(rpc.calls.count()).toBe(1);
  });
  it('does not refetch or mutate an already open recap on foreground', async () => {
    service.start(); await tick(); await service.check();
    expect(rpc.calls.count()).toBe(1);
  });
  it('read failure leaves the app usable and retries on the next open', async () => {
    rpc.and.resolveTo({error:{message:'offline'}}); service.start(); await tick();
    expect(service.active()).toBeNull();
    rpc.and.resolveTo({data:{round_id:27,rounds:[round]},error:null}); await service.check();
    expect(service.active()).not.toBeNull();
  });
});
