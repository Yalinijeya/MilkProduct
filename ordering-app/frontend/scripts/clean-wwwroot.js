// Removes the previous Angular build from backend/wwwroot before `ng build` writes a new one.
// Keeps wwwroot/uploads (item photos uploaded by the admin) untouched.
const fs = require('fs');
const path = require('path');

const wwwroot = path.resolve(__dirname, '../../backend/wwwroot');
fs.mkdirSync(wwwroot, { recursive: true });
for (const entry of fs.readdirSync(wwwroot)) {
  if (entry === 'uploads') continue;
  fs.rmSync(path.join(wwwroot, entry), { recursive: true, force: true });
}
