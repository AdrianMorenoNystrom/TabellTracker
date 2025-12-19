import { Routes } from '@angular/router';
import { HomeComponent } from './components/home-component/home.component';
import { ArticleDetailComponent } from './components/article-detail-component/article-detail.component';
import { DataComponent } from './components/data-component/data.component';
import { MatchComponentComponent } from './components/match-component/match-component.component';
import { authGuard } from './guards/auth.guard';

export const appRoutes: Routes = [
  { path: '', component: HomeComponent },
  {path: 'data',component:DataComponent},
  { path: 'matches', component: MatchComponentComponent, canActivate: [authGuard] },
  { path: 'kronikor/:id', component: ArticleDetailComponent },
  { path: '**', redirectTo: '' }
];
