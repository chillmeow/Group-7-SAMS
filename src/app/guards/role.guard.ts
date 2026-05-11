import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route): boolean | UrlTree => {
  const platformId = inject(PLATFORM_ID);
  const authService = inject(AuthService);
  const router = inject(Router);

  /*
   * IMPORTANT:
   * Let the server/client-rendering pass first.
   * The browser will enforce the real role check once localStorage is available.
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

  if (!userId || !userRole || userStatus !== 'active') {
    authService.clearSession();
    return router.createUrlTree(['/login']);
  }

  const allowedRoles = route.data?.['roles'] as string[] | undefined;

  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }

  const normalizedAllowedRoles = allowedRoles.map((role) => String(role).trim().toLowerCase());

  if (normalizedAllowedRoles.includes(userRole)) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
