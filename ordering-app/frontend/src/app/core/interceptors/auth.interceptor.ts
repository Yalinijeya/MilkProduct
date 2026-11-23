import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

/**
 * Attaches `Authorization: Bearer <jwt>` to every request sent to our API,
 * and logs the admin out if the API answers 401 (token expired / invalid).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const isApiCall = req.url.startsWith(environment.apiUrl);
  const isLogin = req.url.endsWith('/api/auth/login');

  const authReq = token && isApiCall && !isLogin
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && token && !isLogin) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
