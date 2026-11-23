const jwt = require('jsonwebtoken');
const env = require('../config/env');
const Admin = require('../models/Admin');
const HttpError = require('../utils/httpError');

// POST /api/auth/login
async function login(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) throw new HttpError(400, 'Email and password are required');

  const admin = await Admin.findOne({ email }).select('+password');
  if (!admin || !(await admin.comparePassword(password))) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const token = jwt.sign({ sub: admin.id, email: admin.email, role: 'admin' }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

  res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
}

module.exports = { login };
