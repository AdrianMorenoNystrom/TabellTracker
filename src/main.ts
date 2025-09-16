import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { inject } from '@vercel/analytics';
import { environment } from './environments/environment';

if (environment.production) {
  inject();
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));