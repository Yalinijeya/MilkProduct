const mongoose = require('mongoose');
const Order = require('../models/Order');
const { ORDER_STATUSES } = require('../models/Order');
const Item = require('../models/Item');
const Settings = require('../models/Settings');
const Counter = require('../models/Counter');
const HttpError = require('../utils/httpError');
const { quoteDelivery } = require('../utils/delivery');
const { emitToAdmins } = require('../services/socket');
const { buildOrderMessage, buildClickToChatLink, sendViaCloudApi } = require('../services/whatsapp');

const round2 = (n) => Math.round(n * 100) / 100;
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,18}$/;

function validateOrderInput(body) {
  const customer = body?.customer || {};
  const name = String(customer.name || '').trim();
  const phone = String(customer.phone || '').trim();
  const address = String(customer.address || '').trim();
  const lat = Number(customer.lat);
  const lng = Number(customer.lng);
  const notes = String(body?.notes || '').trim().slice(0, 500);

  const errors = {};
  if (!name) errors.name = 'Name is required';
  if (!PHONE_RE.test(phone)) errors.phone = 'Valid phone number is required';
  if (!address) errors.address = 'Address is required';
  if (customer.lat === undefined || customer.lat === null || customer.lat === '' ||
      !Number.isFinite(lat) || lat < -90 || lat > 90) errors.lat = 'Valid latitude is required';
  if (customer.lng === undefined || customer.lng === null || customer.lng === '' ||
      !Number.isFinite(lng) || lng < -180 || lng > 180) errors.lng = 'Valid longitude is required';

  // Merge duplicate lines and validate quantities
  const quantities = new Map();
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  for (const line of rawItems) {
    const id = String(line?.itemId || '');
    const qty = Number(line?.quantity);
    if (!mongoose.isValidObjectId(id) || !Number.isInteger(qty) || qty < 1 || qty > 100) {
      errors.items = 'Each item needs a valid itemId and a quantity between 1 and 100';
      break;
    }
    quantities.set(id, (quantities.get(id) || 0) + qty);
  }
  if (quantities.size === 0 && !errors.items) errors.items = 'Cart is empty';

  if (Object.keys(errors).length) throw new HttpError(400, 'Invalid order', errors);

  const round6 = (n) => Math.round(n * 1e6) / 1e6;
  return { customer: { name, phone, address, lat: round6(lat), lng: round6(lng) }, notes, quantities };
}

// POST /api/orders  (public)
async function createOrder(req, res) {
  const { customer, notes, quantities } = validateOrderInput(req.body);

  // Prices come from the DB, never from the client.
  const dbItems = await Item.find({ _id: { $in: [...quantities.keys()] }, available: true });
  const byId = new Map(dbItems.map((i) => [i.id, i]));
  const missing = [...quantities.keys()].filter((id) => !byId.has(id));
  if (missing.length) {
    throw new HttpError(409, 'Some items are no longer available. Please refresh your cart.', { missing });
  }

  const items = [...quantities.entries()].map(([id, quantity]) => {
    const item = byId.get(id);
    return { item: item._id, name: item.name, price: item.price, quantity, lineTotal: round2(item.price * quantity) };
  });
  const itemTotal = round2(items.reduce((sum, l) => sum + l.lineTotal, 0));

  // Delivery charge is always recalculated here so the client can't tamper with it.
  const settings = await Settings.getSingleton();
  const { distanceKm, deliveryCharge } = quoteDelivery(settings, customer.lat, customer.lng);

  const seq = await Counter.next('order');
  const order = new Order({
    orderNumber: `ORD-${String(1000 + seq)}`,
    customer,
    notes,
    items,
    itemTotal,
    distanceKm,
    deliveryCharge,
    grandTotal: round2(itemTotal + deliveryCharge),
  });

  const message = buildOrderMessage(order, settings.shopName);
  order.whatsapp.link = buildClickToChatLink(settings.whatsappNumber, message);
  await order.save();

  // 1) Real-time notification for the admin panel
  emitToAdmins('order:new', order.toJSON());

  // 2) WhatsApp Cloud API (fire-and-forget; the response doesn't wait on Meta)
  sendViaCloudApi(settings.whatsappNumber, message).then(({ sent, error }) => {
    if (error && error !== 'Cloud API not configured') console.warn('[whatsapp]', error);
    return Order.updateOne({ _id: order._id }, { $set: { 'whatsapp.sent': sent, 'whatsapp.error': error } });
  }).catch((err) => console.error('[whatsapp] update failed', err));

  res.status(201).json({
    order: order.toJSON(),
    whatsappLink: order.whatsapp.link, // Click-to-Chat fallback for the customer
  });
}

// GET /api/orders?status=new&page=1&limit=20  (admin)
async function listOrders(req, res) {
  const filter = {};
  if (req.query.status) {
    const statuses = String(req.query.status).split(',').filter((s) => ORDER_STATUSES.includes(s));
    if (statuses.length) filter.status = { $in: statuses };
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);

  res.json({ data: orders, total, page, limit, pages: Math.ceil(total / limit) });
}

// PATCH /api/orders/:id/status  (admin)
async function updateOrderStatus(req, res) {
  const status = String(req.body?.status || '');
  if (!ORDER_STATUSES.includes(status)) {
    throw new HttpError(400, `Status must be one of: ${ORDER_STATUSES.join(', ')}`);
  }
  const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true });
  if (!order) throw new HttpError(404, 'Order not found');

  emitToAdmins('order:updated', order.toJSON());
  res.json(order);
}

module.exports = { createOrder, listOrders, updateOrderStatus, ORDER_STATUSES };
