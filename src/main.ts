import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { inject } from '@vercel/analytics';
import { environment } from './environments/environment';

if (environment.production) {
  // Personal invite tokens must never be sent to analytics.
  inject({ beforeSend: event => new URL(event.url).pathname.startsWith('/join') ? null : event });
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
