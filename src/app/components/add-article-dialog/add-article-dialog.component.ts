import { Component, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-add-article-dialog',
  standalone: true,
  imports: [
    NgIf,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './add-article-dialog.component.html',
  styleUrl: './add-article-dialog.component.scss'
})
export class AddArticleDialogComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private dialogRef = inject(MatDialogRef<AddArticleDialogComponent>);

  loading = false;

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    content: ['', [Validators.required, Validators.minLength(10)]],
  });

  save() {
    if (this.form.invalid || this.loading) return;
    this.loading = true;

    const { title, content } = this.form.value;
    this.api.addArticle({ title: title!, content: content! }).subscribe({
      next: (id) => {
        this.loading = false;
        this.dialogRef.close({ created: true, id });
      },
      error: (err) => {
        console.error('Failed to save article', err);
        this.loading = false;
      }
    });
  }

  cancel() {
    this.dialogRef.close();
  }
}
