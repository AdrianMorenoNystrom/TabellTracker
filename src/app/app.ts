import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatIcon } from '@angular/material/icon';


import { AuthService } from './services/auth.service';
import { environment } from '../environments/environment';
import { RoundRecapService } from './services/round-recap.service';
import { RoundRecapStoryComponent } from './components/round-recap-story/round-recap-story.component';
import { avatarLetter } from './utils/avatar';

import { combineLatest, Observable } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';
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
    MatMenuModule,
    RoundRecapStoryComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  readonly recap = inject(RoundRecapService);
  private destroy = inject(DestroyRef);
  private router = inject(Router);
  protected readonly title = signal('tabelltracker');
  isLoggedIn$!: Observable<boolean>;
  displayLetter$!: Observable<string>;

  constructor(public auth: AuthService) {}

  ngOnInit() {
    this.recap.start();
    this.isLoggedIn$ = this.auth.isLoggedIn$();
    combineLatest([
      this.auth.isReady$(), this.isLoggedIn$,
      this.router.events.pipe(filter(event => event instanceof NavigationEnd), startWith(null)),
    ]).pipe(takeUntilDestroyed(this.destroy)).subscribe(([ready, member]) => {
      // Guards handle the initial route. router.url is still '/' while an invite
      // page loads, so redirecting at that point would discard its token.
      if (!ready || member || !this.router.navigated) return;
      const destination = this.router.getCurrentNavigation()?.extractedUrl.toString() ?? this.router.url;
      const path = destination.split(/[?#]/, 1)[0];
      if (!environment.production && path === '/dev/kupong') return;
      if (path === '/join' || path.startsWith('/join/') || path === '/admin/login') return;
      void this.router.navigateByUrl('/join');
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
