import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatIcon } from '@angular/material/icon';

import { RoundlistComponent } from './components/roundlist-component/roundlist-component';
import { TableComponent } from './components/table-component/table-component';
import { LoginDialogComponent } from './components/login-dialog/login-dialog.component';

import { AuthService } from './services/auth.service';
import { avatarLetter } from './utils/avatar';

import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import {MatMenuModule} from '@angular/material/menu';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    RoundlistComponent,
    TableComponent,
    MatDialogModule,
    MatIcon,
    RouterLink,
    RouterLinkActive,
    MatMenuModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = signal('tabelltracker');
  isLoggedIn$!: Observable<boolean>;
  displayLetter$!: Observable<string>;

  constructor(private dialog: MatDialog, public auth: AuthService) {}

  ngOnInit() {
    this.isLoggedIn$ = this.auth.isLoggedIn$();

    this.displayLetter$ = this.auth.getDisplayName$().pipe(
      map((name) => avatarLetter(name)),
      startWith('?')
    );
  }

  openLogin() {
    this.dialog.open(LoginDialogComponent, { width: '420px' });
  }

  logout() {
    this.auth.logout();
  }
}
