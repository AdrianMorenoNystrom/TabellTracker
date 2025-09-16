import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Player } from '../../interfaces/player';

@Component({
  selector: 'app-add-player-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatTableModule, MatCardModule, MatIconModule],
  templateUrl: './add-player-dialog.html',
  styleUrl: './add-player-dialog.scss'
})
export class AddPlayerDialog {
  players: Player[] = [];
  displayedColumns = ['name', 'score', 'actions'];
  submitting = false;

  form!: FormGroup;
      constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private fb: FormBuilder,
    private api: ApiService,
    private ref: MatDialogRef<AddPlayerDialog>
) {}

  ngOnInit() {
    // Initialize form here to avoid using fb before DI setup
    this.form = this.fb.group({ name: ['', [Validators.required, Validators.minLength(1)]] });
    this.loadPlayers();
  }

  loadPlayers() {
    this.api.getPlayers().subscribe(p => this.players = p ?? []);
  }

  add() {
    if (this.form.invalid) return;
    const name = String(this.form.value.name).trim();
    if (!name) return;
    this.submitting = true;
    this.api.addPlayer({ name, score: 0 }).subscribe({
      next: () => {
        this.form.reset();
        this.submitting = false;
        this.loadPlayers();
      },
      error: () => {
        this.submitting = false;
      }
    });
  }

  close() {
    this.ref.close({ updated: true });
  }
}
