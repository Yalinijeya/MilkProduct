const http = require('http');
const env = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');
const { initSocket } = require('./services/socket');
const Admin = require('./models/Admin');
const Settings = require('./models/Settings');

/** Creates the first admin from .env if no admin exists yet. */
async function ensureAdmin() {
  if (await Admin.exists({})) return;
  if (!env.adminEmail || !env.adminPassword) {
    console.warn('No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env and restart.');
    return;
  }
  await Admin.create({ email: env.adminEmail, password: env.adminPassword });
  console.log(`Created initial admin: ${env.adminEmail}`);
}

async function start() {
  await connectDB();
  await ensureAdmin();
  await Settings.getSingleton();

  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
