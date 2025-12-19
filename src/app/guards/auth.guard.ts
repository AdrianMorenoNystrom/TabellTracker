import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { filter, map, switchMap, take, finalize } from 'rxjs/operators';

import { AuthService } from '../services/auth.service';
import { LoginDialogComponent } from '../components/login-dialog/login-dialog.component';

let loginRef: MatDialogRef<LoginDialogComponent> | null = null;

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const dialog = inject(MatDialog);

  return auth.isReady$().pipe(
    filter(Boolean),
    take(1),
    switchMap(() => {
      if (auth.isLoggedInSnapshot()) return [true];

      if (!loginRef) {
        loginRef = dialog.open(LoginDialogComponent, { width: '420px' });
      }

      return loginRef.afterClosed().pipe(
        take(1),
        finalize(() => (loginRef = null)),
        map(() => auth.isLoggedInSnapshot() ? true : router.createUrlTree(['']))
      );
    })
  );
};
