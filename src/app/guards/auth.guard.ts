import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isReady$().pipe(filter(Boolean), take(1),
    map(() => auth.isLoggedInSnapshot() ? true : router.createUrlTree(['/join'])));
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isReady$().pipe(filter(Boolean), take(1),
    map(() => auth.isUserAdminSnapshot() ? true : router.createUrlTree(['/admin/login'])));
};
