import { Routes } from '@angular/router';
import { HomeComponent } from './components/home-component/home.component';
import { ArticleListComponent } from './components/article-list-component/article-list.component';
import { ArticleDetailComponent } from './components/article-detail-component/article-detail.component';
import { DataComponent } from './components/data-component/data.component';

export const appRoutes: Routes = [
  { path: '', component: HomeComponent },
  {path: 'data',component:DataComponent},
  { path: 'kronikor', component: ArticleListComponent },
  { path: 'kronikor/:id', component: ArticleDetailComponent },
  { path: '**', redirectTo: '' }
];
