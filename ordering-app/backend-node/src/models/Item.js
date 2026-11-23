const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, trim: true, maxlength: 30, default: '' }, // e.g. "1 L", "500 g"
    imageUrl: { type: String, default: '' }, // e.g. /uploads/1700000000-milk.jpg
    available: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Item', itemSchema);
