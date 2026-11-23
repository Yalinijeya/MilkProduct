import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginResponse } from '../models/models';

const TOKEN_KEY = 'admin_token';

/** Decodes the JWT payload (no verification — the server does that) to read `exp`. */
function tokenExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _token = signal<string | null>(this.readStoredToken());
  readonly token = this._token.asReadonly();
  readonly isLoggedIn = computed(() => {
    const t = this._token();
    return !!t && tokenExpiry(t) > Date.now();
  });

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/api/auth/login`, { username, password })
      .pipe(tap((res) => this.setToken(res.token)));
  }

  logout(redirect = true): void {
    this.setToken(null);
    if (redirect) this.router.navigate(['/admin/login']);
  }

  /** True if a stored token exists and has not expired (re-checks the clock). */
  hasValidToken(): boolean {
    const t = this._token();
    return !!t && tokenExpiry(t) > Date.now();
  }

  private setToken(token: string | null): void {
    this._token.set(token);
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable — token stays in memory only */
    }
  }

  private readStoredToken(): string | null {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      return t && tokenExpiry(t) > Date.now() ? t : null;
    } catch {
      return null;
    }
  }
}
