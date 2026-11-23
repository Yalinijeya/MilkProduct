require('dotenv').config({ quiet: true });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPublicUrl: process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  mongoUri: required('MONGODB_URI'),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',

  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,

  defaults: {
    shopName: process.env.SHOP_NAME || 'My Shop',
    whatsappNumber: process.env.SHOP_WHATSAPP || '',
    shopLat: Number(process.env.SHOP_LAT) || 0,
    shopLng: Number(process.env.SHOP_LNG) || 0,
    shopAddress: process.env.SHOP_ADDRESS || '',
    freeKm: process.env.FREE_KM !== undefined ? Number(process.env.FREE_KM) : 5,
    chargePerKm: process.env.CHARGE_PER_KM !== undefined ? Number(process.env.CHARGE_PER_KM) : 50,
  },

  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 5,

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
  },
};

module.exports = env;
