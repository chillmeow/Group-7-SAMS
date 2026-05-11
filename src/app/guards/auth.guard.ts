import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (): boolean | UrlTree => {
  const platformId = inject(PLATFORM_ID);
  const authService = inject(AuthService);
  const router = inject(Router);

  /*
   * IMPORTANT:
   * This project has SSR/client rendering setup.
   * During page refresh, Angular may run this guard before browser localStorage is available.
   * If we block the route on the server, it redirects to login even though the browser session exists.
   */
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const currentUser = authService.getCurrentUser();

  if (!currentUser) {
    return router.createUrlTree(['/login']);
  }

  const userId = String(currentUser.id || '').trim();
  const userRole = String(currentUser.role || '')
    .trim()
    .toLowerCase();
  const userStatus = String(currentUser.status || 'active')
    .trim()
    .toLowerCase();

  if (userId && userRole && userStatus === 'active') {
    return true;
  }

  authService.clearSession();
  return router.createUrlTree(['/login']);
};
