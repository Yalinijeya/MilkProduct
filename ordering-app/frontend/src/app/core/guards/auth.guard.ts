import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** AuthGuard: only logged-in admins may open /admin/* routes. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.hasValidToken()) return true;

  auth.logout(false);
  return router.createUrlTree(['/admin/login'], { queryParams: { returnUrl: state.url } });
};

/** Sends an already-logged-in admin straight to the dashboard instead of the login page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.hasValidToken() ? inject(Router).createUrlTree(['/admin']) : true;
};
