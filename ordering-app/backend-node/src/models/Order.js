const mongoose = require('mongoose');

const ORDER_STATUSES = ['new', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'];

const orderItemSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    customer: {
      name: { type: String, required: true, trim: true, maxlength: 100 },
      phone: { type: String, required: true, trim: true, maxlength: 20 },
      address: { type: String, required: true, trim: true, maxlength: 500 },
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 },
    },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    items: { type: [orderItemSchema], validate: (v) => Array.isArray(v) && v.length > 0 },
    itemTotal: { type: Number, required: true, min: 0 },
    distanceKm: { type: Number, required: true, min: 0 },
    deliveryCharge: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: 'new', index: true },
    whatsapp: {
      link: { type: String, default: '' },
      sent: { type: Boolean, default: false },
      error: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

orderSchema.virtual('mapLink').get(function mapLink() {
  return `https://www.google.com/maps?q=${this.customer.lat},${this.customer.lng}`;
});

orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Order', orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
