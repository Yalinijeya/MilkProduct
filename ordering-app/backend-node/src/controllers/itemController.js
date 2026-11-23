const Item = require('../models/Item');
const HttpError = require('../utils/httpError');
const { removeUploadedFile } = require('../middleware/upload');

/** Parses multipart/JSON body fields into a clean item payload. */
function parseItemBody(body, { partial }) {
  const data = {};

  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.description !== undefined) data.description = String(body.description).trim();
  if (body.unit !== undefined) data.unit = String(body.unit).trim();
  if (body.price !== undefined && body.price !== '') data.price = Number(body.price);
  if (body.available !== undefined) data.available = body.available === true || body.available === 'true';

  if (!partial) {
    if (!data.name) throw new HttpError(400, 'Name is required');
    if (data.price === undefined) throw new HttpError(400, 'Price is required');
  }
  if (data.name !== undefined && !data.name) throw new HttpError(400, 'Name cannot be empty');
  if (data.price !== undefined && (!Number.isFinite(data.price) || data.price < 0)) {
    throw new HttpError(400, 'Price must be a non-negative number');
  }
  return data;
}

// GET /api/items  (public: available items only)
async function listAvailable(_req, res) {
  const items = await Item.find({ available: true }).sort({ name: 1 });
  res.json(items);
}

// GET /api/admin/items  (admin: all items)
async function listAll(_req, res) {
  const items = await Item.find().sort({ createdAt: -1 });
  res.json(items);
}

// POST /api/items  (admin, multipart with optional "photo")
async function createItem(req, res) {
  try {
    const data = parseItemBody(req.body || {}, { partial: false });
    if (req.file) data.imageUrl = `/uploads/${req.file.filename}`;
    const item = await Item.create(data);
    res.status(201).json(item);
  } catch (err) {
    if (req.file) removeUploadedFile(`/uploads/${req.file.filename}`);
    throw err;
  }
}

// PUT /api/items/:id  (admin, multipart with optional "photo")
async function updateItem(req, res) {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) throw new HttpError(404, 'Item not found');

    const data = parseItemBody(req.body || {}, { partial: true });
    const oldImage = item.imageUrl;

    if (req.file) data.imageUrl = `/uploads/${req.file.filename}`;
    else if (req.body?.removePhoto === 'true') data.imageUrl = '';

    item.set(data);
    await item.save();

    if (data.imageUrl !== undefined && oldImage && oldImage !== item.imageUrl) {
      removeUploadedFile(oldImage);
    }
    res.json(item);
  } catch (err) {
    if (req.file) removeUploadedFile(`/uploads/${req.file.filename}`);
    throw err;
  }
}

// DELETE /api/items/:id  (admin)
async function deleteItem(req, res) {
  const item = await Item.findByIdAndDelete(req.params.id);
  if (!item) throw new HttpError(404, 'Item not found');
  removeUploadedFile(item.imageUrl);
  res.json({ message: 'Item deleted', id: item.id });
}

module.exports = { listAvailable, listAll, createItem, updateItem, deleteItem };
