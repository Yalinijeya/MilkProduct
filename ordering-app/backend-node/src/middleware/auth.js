const jwt = require('jsonwebtoken');
const env = require('../config/env');
const HttpError = require('../utils/httpError');

/** Verifies `Authorization: Bearer <token>` and attaches `req.admin`. */
function requireAdmin(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Authentication required'));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (payload.role !== 'admin') throw new Error('Not an admin token');
    req.admin = { id: payload.sub, email: payload.email };
    return next();
  } catch {
    return next(new HttpError(401, 'Invalid or expired token'));
  }
}

module.exports = { requireAdmin };
