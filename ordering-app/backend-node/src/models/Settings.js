const mongoose = require('mongoose');
const env = require('../config/env');

// Single-document collection holding shop settings.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'shop', unique: true, immutable: true },
    shopName: { type: String, trim: true, default: '' },
    whatsappNumber: { type: String, trim: true, default: '' }, // digits incl. country code, e.g. 919876543210
    shopAddress: { type: String, trim: true, default: '' },
    shopLat: { type: Number, required: true, min: -90, max: 90 },
    shopLng: { type: Number, required: true, min: -180, max: 180 },
    freeKm: { type: Number, required: true, min: 0, default: 5 },
    chargePerKm: { type: Number, required: true, min: 0, default: 50 },
  },
  { timestamps: true }
);

/** Returns the settings document, creating it from .env defaults if missing. */
settingsSchema.statics.getSingleton = async function getSingleton() {
  let settings = await this.findOne({ key: 'shop' });
  if (!settings) {
    settings = await this.create({ key: 'shop', ...env.defaults });
  }
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);
