/**
 * Seeds the admin account, default settings and a few sample items.
 * Usage: npm run seed            (keeps existing data, only adds what's missing)
 *        npm run seed -- --reset (resets the admin password from .env)
 */
const mongoose = require('mongoose');
const env = require('./config/env');
const connectDB = require('./config/db');
const Admin = require('./models/Admin');
const Item = require('./models/Item');
const Settings = require('./models/Settings');

const SAMPLE_ITEMS = [
  { name: 'Full Cream Milk', unit: '1 L', price: 68, description: 'Fresh farm full cream milk' },
  { name: 'Toned Milk', unit: '500 ml', price: 28, description: 'Everyday toned milk' },
  { name: 'Curd', unit: '500 g', price: 45, description: 'Thick homemade-style curd' },
  { name: 'Paneer', unit: '200 g', price: 95, description: 'Soft fresh paneer' },
  { name: 'Ghee', unit: '500 ml', price: 340, description: 'Pure cow ghee' },
];

async function seed() {
  await connectDB();
  const reset = process.argv.includes('--reset');

  if (!env.adminEmail || !env.adminPassword) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
  const admin = await Admin.findOne({ email: env.adminEmail.toLowerCase() });
  if (!admin) {
    await Admin.create({ email: env.adminEmail, password: env.adminPassword });
    console.log(`✔ Admin created: ${env.adminEmail}`);
  } else if (reset) {
    admin.password = env.adminPassword;
    await admin.save();
    console.log(`✔ Admin password reset: ${env.adminEmail}`);
  } else {
    console.log(`• Admin already exists: ${env.adminEmail}`);
  }

  await Settings.getSingleton();
  console.log('✔ Settings ready');

  if ((await Item.countDocuments()) === 0) {
    await Item.insertMany(SAMPLE_ITEMS);
    console.log(`✔ Inserted ${SAMPLE_ITEMS.length} sample items`);
  } else {
    console.log('• Items already exist, skipping samples');
  }
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
