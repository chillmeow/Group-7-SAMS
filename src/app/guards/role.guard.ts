import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/user.model';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const allowedRoles = (route.data?.['roles'] ?? []) as UserRole[];

  if (!authService.isLoggedIn()) {
    return router.createUrlTree(['/login']);
  }

  if (allowedRoles.length === 0 || authService.hasRole(allowedRoles)) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
