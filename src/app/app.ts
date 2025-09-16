import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { RoundlistComponent } from "./components/roundlist-component/roundlist-component";
import { TableComponent } from "./components/table-component/table-component";
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { LoginDialogComponent } from './components/login-dialog/login-dialog.component';
import { ApiService } from './services/api.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, MatToolbarModule, MatButtonModule, RoundlistComponent, TableComponent, MatDialogModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('tabelltracker');
  constructor(private dialog: MatDialog, public api: ApiService) {}

  openLogin() {
    const ref = this.dialog.open(LoginDialogComponent, { width: '420px' });
    ref.afterClosed().subscribe();
  }

  logout() {
    this.api.logout();
  }
}
