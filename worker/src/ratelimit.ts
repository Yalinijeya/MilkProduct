import type { AppEnv } from './env';
import { ApiError } from './http';

/**
 * Allows `limit` requests per client IP per `windowMs` for the given action, counted in D1.
 * Throws 429 when the limit is exceeded.
 */
export async function rateLimit(env: AppEnv, request: Request, action: string, limit: number, windowMs: number): Promise<void> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const now = Date.now();

  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT (key) DO UPDATE SET
       count    = CASE WHEN reset_at <= ?3 THEN 1 ELSE count + 1 END,
       reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at END
     RETURNING count`,
  )
    .bind(`${action}:${ip}`, now + windowMs, now)
    .first<{ count: number }>();

  // Now and then, remove old counters so the table stays small.
  if (Math.random() < 0.05) {
    await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?1').bind(now - 86_400_000).run();
  }

  if ((row?.count ?? 0) > limit) throw new ApiError(429, 'Too many requests, please try again later');
}
