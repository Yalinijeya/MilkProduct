const HttpError = require('../utils/httpError');

/**
 * Tiny in-memory fixed-window rate limiter (per IP).
 * Good enough for a single-instance shop app; use Redis-backed limiting if you scale out.
 */
function rateLimit({ windowMs, max }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new HttpError(429, 'Too many requests, please try again later'));
    }
    return next();
  };
}

module.exports = { rateLimit };
