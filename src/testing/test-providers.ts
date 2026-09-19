import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { ApiService } from '../app/services/api.service';
import { AuthService } from '../app/services/auth.service';
import { RoundRecapService } from '../app/services/round-recap.service';

// Shared isolated fixtures for the pre-existing component smoke tests.
// Tests must never query the deployed Supabase project.
export const testAuth = {
  identity: { player_id: 1, name: 'Ompen', is_admin: false },
  isReady$: () => of(true), isReadySnapshot: () => true,
  isLoggedIn$: () => of(true), isLoggedInSnapshot: () => true,
  isUserAdmin$: () => of(false), isUserAdminSnapshot: () => false,
  getUserId$: () => of('test-user'), getUserIdSnapshot: () => 'test-user',
  getDisplayName$: () => of('Ompen'), getDisplayNameSnapshot: () => 'Ompen',
  refresh: async () => {}, logout: async () => {},
};
export function testProviders() {
  return [provideRouter([]), provideNoopAnimations(),
    { provide: RoundRecapService, useValue: { start() {}, active: () => null } },
    { provide: AuthService, useValue: testAuth },
    { provide: ApiService, useValue: {
      getPlayers: () => of([]), watchPlayers: () => of([]),
      getRounds: () => of([]), watchRounds: () => of([]),
      getSeasons: () => of([]), getArticles: () => of([]),
    } },
    { provide: MAT_DIALOG_DATA, useValue: { matches: [], myPicks: {}, picksByMatch: {}, myUserId: '' } },
    { provide: MatDialogRef, useValue: { close: () => {} } },
  ];
}
