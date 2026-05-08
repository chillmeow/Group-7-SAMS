import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const currentUser = authService.getCurrentUser();

  if (
    currentUser &&
    currentUser.id &&
    currentUser.email &&
    currentUser.role &&
    String(currentUser.status || 'active').toLowerCase() === 'active'
  ) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};
