import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SUPABASE } from './supabase.client';

describe('Invite identity and persisted session', () => {
  let client: { auth: { getSession: jasmine.Spy; onAuthStateChange: jasmine.Spy;
    signInAnonymously: jasmine.Spy; signInWithPassword: jasmine.Spy; signOut: jasmine.Spy }; rpc: jasmine.Spy };
  beforeEach(() => {
    client = { auth: {
      getSession: jasmine.createSpy().and.resolveTo({ data: { session: null }, error: null }),
      onAuthStateChange: jasmine.createSpy().and.returnValue({ data: { subscription: { unsubscribe() {} } } }),
      signInAnonymously: jasmine.createSpy().and.resolveTo({ error: null }),
      signInWithPassword: jasmine.createSpy().and.resolveTo({ error: null }),
      signOut: jasmine.createSpy().and.resolveTo({ error: null }),
    }, rpc: jasmine.createSpy().and.resolveTo({ data: null, error: null }) };
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: client }] });
  });
  it('does not create an anonymous user for an ordinary visit', async () => {
    const auth=TestBed.inject(AuthService); await auth.refresh();
    expect(auth.isLoggedInSnapshot()).toBeFalse(); expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it('restores a saved session without email, password or another invite', async () => {
    client.auth.getSession.and.resolveTo({ data:{session:{user:{id:'saved-user'}}},error:null });
    client.rpc.and.resolveTo({ data:{player_id:2,name:'Sillen',is_admin:false},error:null });
    const auth=TestBed.inject(AuthService); await auth.refresh();
    expect(auth.identity?.player_id).toBe(2); expect(auth.isLoggedInSnapshot()).toBeTrue();
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it('an authenticated anonymous user is not a league member until token redemption', async () => {
    client.auth.getSession.and.resolveTo({ data:{session:{user:{id:'unknown'}}},error:null });
    const auth=TestBed.inject(AuthService); await auth.refresh(); expect(auth.isLoggedInSnapshot()).toBeFalse();
    client.rpc.and.callFake(async (name:string) => ({ data:name==='live_identity'?{player_id:3,name:'Adrian',is_admin:false}:null,error:null }));
    await auth.redeem('a'.repeat(64));
    expect(client.rpc).toHaveBeenCalledWith('live_redeem_invite',{p_token:'a'.repeat(64)});
    expect(auth.identity?.player_id).toBe(3);
  });
  it('clears admin and membership state when the device is replaced', async () => {
    client.auth.getSession.and.resolveTo({ data:{session:{user:{id:'old'}}},error:null });
    client.rpc.and.resolveTo({data:{player_id:1,name:'Ompen',is_admin:true},error:null});
    const auth=TestBed.inject(AuthService); await auth.refresh(); expect(auth.isUserAdminSnapshot()).toBeTrue();
    client.rpc.and.resolveTo({data:null,error:null}); await auth.refresh();
    expect(auth.isUserAdminSnapshot()).toBeFalse(); expect(auth.isLoggedInSnapshot()).toBeFalse();
  });
  it('surfaces invalid invites instead of claiming successful activation', async () => {
    const auth=TestBed.inject(AuthService); await auth.refresh();
    client.rpc.and.resolveTo({ data:null,error:new Error('Ogiltig inbjudan') });
    await expectAsync(auth.redeem('a'.repeat(64))).toBeRejectedWithError('Ogiltig inbjudan');
    expect(client.auth.signInAnonymously).toHaveBeenCalledTimes(1); expect(auth.isLoggedInSnapshot()).toBeFalse();
  });
  it('lets the configured admin sign in again with the same account', async () => {
    client.auth.getSession.and.resolveTo({data:{session:{user:{id:'permanent-admin'}}},error:null});
    client.rpc.and.resolveTo({data:{player_id:1,name:'Ompen',is_admin:true},error:null});
    const auth=TestBed.inject(AuthService);
    await auth.loginAdmin(' admin@example.test ','password');
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({email:'admin@example.test',password:'password'});
    expect(auth.isUserAdminSnapshot()).toBeTrue();
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it('denies a password account without admin membership', async () => {
    client.auth.getSession.and.resolveTo({data:{session:{user:{id:'outsider'}}},error:null});
    const auth=TestBed.inject(AuthService);
    await expectAsync(auth.loginAdmin('outsider@example.test','password')).toBeRejectedWithError(/saknar adminbehörighet/);
    expect(client.auth.signOut).toHaveBeenCalled();
  });
  it('waits for an overlapping auth refresh before deciding admin login succeeded', async () => {
    const auth=TestBed.inject(AuthService); await auth.refresh();
    client.auth.getSession.and.resolveTo({data:{session:{user:{id:'permanent-admin'}}},error:null});
    const requests: ((value: unknown) => void)[] = [];
    client.rpc.and.callFake(() => new Promise(resolve => requests.push(resolve)));
    const login = auth.loginAdmin('admin@example.test','password');
    await Promise.resolve(); await Promise.resolve();
    const authEvent = auth.refresh();
    await Promise.resolve();
    expect(requests.length).toBe(2);
    const identity={data:{player_id:1,name:'Ompen',is_admin:true},error:null};
    requests[0](identity);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(client.auth.signOut).not.toHaveBeenCalled();
    requests[1](identity);
    await Promise.all([login,authEvent]);
    expect(auth.isUserAdminSnapshot()).toBeTrue();
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });
  it('does not grant admin privileges if password authentication fails', async () => {
    client.auth.signInWithPassword.and.resolveTo({error:new Error('Invalid credentials')});
    const auth=TestBed.inject(AuthService);
    await expectAsync(auth.loginAdmin('admin@example.test','wrong')).toBeRejectedWithError(/Kontrollera e-post/);
    expect(auth.isUserAdminSnapshot()).toBeFalse();
  });
});
