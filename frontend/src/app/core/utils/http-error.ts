import { HttpErrorResponse } from '@angular/common/http';

/** Extracts a human-readable message from an API error. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server. Check your connection.';
    const body = err.error as { message?: string; details?: Record<string, string> } | null;
    if (body?.details && typeof body.details === 'object') {
      const first = Object.values(body.details).find((v) => typeof v === 'string');
      if (first) return `${body.message ?? 'Error'}: ${first}`;
    }
    return body?.message || fallback;
  }
  return fallback;
}
