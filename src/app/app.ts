import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatIcon } from '@angular/material/icon';


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
    MatIcon,
    RouterLink,
    RouterLinkActive,
    MatMenuModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private destroy = inject(DestroyRef);
  private router = inject(Router);
  protected readonly title = signal('tabelltracker');
  isLoggedIn$!: Observable<boolean>;
  displayLetter$!: Observable<string>;

  constructor(public auth: AuthService) {}

  ngOnInit() {
    this.isLoggedIn$ = this.auth.isLoggedIn$();
    this.isLoggedIn$.pipe(takeUntilDestroyed(this.destroy)).subscribe(member => {
      if (!member && this.auth.isReadySnapshot() && !this.router.url.startsWith('/join') && !this.router.url.startsWith('/admin/login')) {
        void this.router.navigateByUrl('/join');
      }
    });

    this.displayLetter$ = this.auth.getDisplayName$().pipe(
      map((name) => avatarLetter(name)),
      startWith('?')
    );
  }

  openLogin() {
    void this.router.navigateByUrl('/admin/login');
  }

  logout() {
    this.auth.logout();
  }
}
