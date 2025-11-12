import { Component, OnInit } from '@angular/core';
import { DatePipe, NgIf } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';

import { ApiService } from '../../services/api.service';
import { Article } from '../../interfaces/article';

@Component({
  selector: 'app-article-detail',
  standalone: true,
  imports: [NgIf, MatCardModule, MatButtonModule,DatePipe],
  templateUrl: './article-detail.component.html',
  styleUrl: './article-detail.component.scss'
})
export class ArticleDetailComponent implements OnInit {

  article?: Article;
  loading = true;
  error?: string;

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;

    if (!id || isNaN(id)) {
      this.error = 'Ogiltigt artikel-id.';
      this.loading = false;
      return;
    }

    this.api.getArticleById(id).subscribe({
      next: (a) => {
        this.article = a;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load article', err);
        this.error = 'Kunde inte ladda artikeln.';
        this.loading = false;
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/kronikor']);
  }
}
