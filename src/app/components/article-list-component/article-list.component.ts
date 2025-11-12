import { Component, OnInit } from '@angular/core';
import { NgIf, NgFor, DatePipe, SlicePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { ApiService } from '../../services/api.service';
import { Article } from '../../interfaces/article';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AddArticleDialogComponent } from '../add-article-dialog/add-article-dialog.component';
@Component({
  selector: 'app-articles-list',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    DatePipe,
    SlicePipe
  ],
  templateUrl: './article-list.component.html',
  styleUrl: './article-list.component.scss'
})
export class ArticleListComponent implements OnInit {

  articles: Article[] = [];
  loading = true;
  error?: string;

  constructor(
    public api: ApiService,
    private router: Router,
      private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadArticles();
  }

  private loadArticles(): void {
    this.loading = true;
    this.api.getArticles().subscribe({
      next: (list) => {
        this.articles = list;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load articles', err);
        this.error = 'Kunde inte ladda krönikorna.';
        this.loading = false;
      }
    });
  }

  openArticle(article: Article): void {
    // Anpassa route efter hur du satt upp den
    this.router.navigate(['/kronikor', article.id]);
  }

newArticle(): void {
  const ref = this.dialog.open(AddArticleDialogComponent, {
    width: '700px'
  });

  ref.afterClosed().subscribe(result => {
    if (result?.created) {
      // ladda om listan
      this.loadArticles();

      // valfritt: gå direkt till detaljsidan
      if (result.id) {
        this.router.navigate(['/kronikor', result.id]);
      }
    }
  });
}

deleteArticle(article: Article, event: MouseEvent): void {
  // så vi inte triggar openArticle(a)
  event.stopPropagation();

  const sure = confirm(`Radera krönikan "${article.title}"?`);
  if (!sure) return;

  this.api.deleteArticle(article.id).subscribe({
    next: () => {
      this.articles = this.articles.filter(a => a.id !== article.id);
    },
    error: (err) => {
      console.error('Failed to delete article', err);
    }
  });
}
}
