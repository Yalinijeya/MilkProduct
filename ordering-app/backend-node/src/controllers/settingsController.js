const Settings = require('../models/Settings');
const HttpError = require('../utils/httpError');

const PUBLIC_FIELDS = ['shopName', 'whatsappNumber', 'shopAddress', 'shopLat', 'shopLng', 'freeKm', 'chargePerKm'];

const toDto = (s) => Object.fromEntries(PUBLIC_FIELDS.map((f) => [f, s[f]]));

// GET /api/settings  (public — the checkout page needs shop location & delivery rates)
async function getSettings(_req, res) {
  const settings = await Settings.getSingleton();
  res.json(toDto(settings));
}

// PUT /api/settings  (admin)
async function updateSettings(req, res) {
  const body = req.body || {};
  const update = {};

  for (const f of ['shopName', 'shopAddress']) {
    if (body[f] !== undefined) update[f] = String(body[f]).trim();
  }
  if (body.whatsappNumber !== undefined) {
    const digits = String(body.whatsappNumber).replace(/\D/g, '');
    if (digits && (digits.length < 8 || digits.length > 15)) {
      throw new HttpError(400, 'WhatsApp number must include country code, 8–15 digits (e.g. 919876543210)');
    }
    update.whatsappNumber = digits;
  }

  const numeric = {
    shopLat: [-90, 90],
    shopLng: [-180, 180],
    freeKm: [0, 1000],
    chargePerKm: [0, 100000],
  };
  for (const [f, [min, max]] of Object.entries(numeric)) {
    if (body[f] === undefined) continue;
    const n = Number(body[f]);
    if (body[f] === '' || body[f] === null || !Number.isFinite(n) || n < min || n > max) {
      throw new HttpError(400, `${f} must be a number between ${min} and ${max}`);
    }
    update[f] = n;
  }

  const settings = await Settings.getSingleton();
  settings.set(update);
  await settings.save();
  res.json(toDto(settings));
}

module.exports = { getSettings, updateSettings };
