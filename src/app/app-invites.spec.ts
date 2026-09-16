import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { JoinComponent } from './components/join-component/join.component';
import { AuthService } from './services/auth.service';
import { SUPABASE } from './services/supabase.client';
import { authGuard } from './guards/auth.guard';

@Component({ standalone: true, template: '<p>Privat kupong</p>' })
class ProtectedPage {}

describe('Invitation on a new device', () => {
  const token = 'a'.repeat(64);
  let router: Router;
  let auth: AuthService;
  let releaseJoin: (component: typeof JoinComponent) => void;
  let joinLoading: Promise<void>;
  let member: boolean;
  let session: { user: { id: string } } | null;
  let authChanged: () => void;
  let client: { auth: Record<string, jasmine.Spy>; rpc: jasmine.Spy };

  beforeEach(async () => {
    member = false; session = null; authChanged = () => {};
    client = {
      auth: {
        getSession: jasmine.createSpy().and.callFake(async () => ({ data: { session }, error: null })),
        onAuthStateChange: jasmine.createSpy().and.callFake(callback => {
          authChanged = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        }),
        signInAnonymously: jasmine.createSpy().and.callFake(async () => {
          session = { user: { id: 'new-device' } }; authChanged();
          return { data: { session }, error: null };
        }),
        signOut: jasmine.createSpy().and.callFake(async () => {
          session = null; member = false; authChanged(); return { error: null };
        }),
      },
      rpc: jasmine.createSpy().and.callFake(async (name: string) => {
        if (name === 'live_redeem_invite') member = true;
        return { data: name === 'live_identity' && member ? { player_id: 2, name: 'Sillen', is_admin: false } : null, error: null };
      }),
    };
    let markLoading!: () => void;
    joinLoading = new Promise(resolve => markLoading = resolve);
    const lazyJoin = new Promise<typeof JoinComponent>(resolve => releaseJoin = resolve);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideNoopAnimations(), { provide: SUPABASE, useValue: client },
        provideRouter([
          { path: '', pathMatch: 'full', component: ProtectedPage, canActivate: [authGuard] },
          { path: 'join', component: JoinComponent },
          { path: 'join/:token', loadComponent: () => { markLoading(); return lazyJoin; } },
          { path: 'admin/login', component: ProtectedPage },
        ])],
    }).compileComponents();
    router = TestBed.inject(Router); auth = TestBed.inject(AuthService);
    await auth.refresh();
  });

  it('keeps the invite URL during startup and activates without a pre-existing login', async () => {
    const fixture = TestBed.createComponent(App);
    const navigation = router.navigateByUrl('/join/' + token);
    await joinLoading;
    fixture.detectChanges();
    releaseJoin(JoinComponent);
    expect(await navigation).toBeTrue();
    await fixture.whenStable(); fixture.detectChanges();
    expect(router.url).toBe('/join/' + token);
    const button = fixture.nativeElement.querySelector('.join button') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    if (!button) return;
    button.click(); await fixture.whenStable(); fixture.detectChanges();
    expect(client.auth['signInAnonymously']).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith('live_redeem_invite', { p_token: token });
    expect(auth.isLoggedInSnapshot()).toBeTrue();
    expect(router.url).toBe('/');
  });

  it('still redirects a revoked member away from a private page', async () => {
    member = true; session = { user: { id: 'existing-device' } }; await auth.refresh();
    const fixture = TestBed.createComponent(App); fixture.detectChanges();
    await router.navigateByUrl('/');
    member = false; await auth.refresh();
    await fixture.whenStable();
    expect(router.url).toBe('/join');
  });
});
