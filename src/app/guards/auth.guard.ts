import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { map, take, finalize } from 'rxjs/operators';

import { AuthService } from '../services/auth.service';
import { LoginDialogComponent } from '../components/login-dialog/login-dialog.component';

// Enkel "singleton" så vi inte öppnar flera dialogs samtidigt
let loginRef: MatDialogRef<LoginDialogComponent> | null = null;

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const dialog = inject(MatDialog);

  // Redan inloggad? släpp igenom direkt
  if (auth.isLoggedInSnapshot()) return true;

  // Om en login-dialog redan är öppen: återanvänd den
  if (!loginRef) {
    loginRef = dialog.open(LoginDialogComponent, { width: '420px' });
  }

  // Vänta tills dialogen stängs (success eller cancel)
  return loginRef.afterClosed().pipe(
    take(1),
    finalize(() => {
      loginRef = null;
    }),
    map(() => {
      // Om user hann logga in -> true, annars redirect
      return auth.isLoggedInSnapshot() ? true : router.createUrlTree(['']);
    })
  );
};
