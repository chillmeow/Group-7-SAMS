import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { provideAnimations } from '@angular/platform-browser/animations';

bootstrapApplication(App, {
  providers: [
    provideAnimations(), // ✅ REQUIRED
  ],
});

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
