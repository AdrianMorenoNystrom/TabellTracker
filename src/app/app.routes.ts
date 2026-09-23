import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './guards/auth.guard';
import { environment } from '../environments/environment';

const coupon = () => import('./components/match-component/match-component.component').then(m => m.MatchComponentComponent);
const join = () => import('./components/join-component/join.component').then(m => m.JoinComponent);

export const appRoutes: Routes = [
  ...(!environment.production ? [{ path: 'dev/kupong', loadComponent: () => import('./dev/coupon-preview.component').then(m => m.CouponPreviewComponent) }] : []),
  { path: '', loadComponent: coupon, canActivate: [authGuard] },
  { path: 'matches', loadComponent: coupon, canActivate: [authGuard] },
  { path: 'tabell', loadComponent: () => import('./components/home-component/home.component').then(m => m.HomeComponent), canActivate: [authGuard] },
  { path: 'join', loadComponent: join },
  { path: 'join/:token', loadComponent: join },
  { path: 'admin/login', loadComponent: () => import('./components/admin-login/admin-login.component').then(m => m.AdminLoginComponent) },
  { path: 'admin', loadComponent: () => import('./components/live-admin/live-admin.component').then(m => m.LiveAdminComponent), canActivate: [adminGuard] },
  { path: 'data', loadComponent: () => import('./components/data-component/data.component').then(m => m.DataComponent), canActivate: [authGuard] },
  { path: 'kronikor/:id', loadComponent: () => import('./components/article-detail-component/article-detail.component').then(m => m.ArticleDetailComponent), canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
