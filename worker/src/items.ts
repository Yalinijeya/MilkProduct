import type { AppEnv } from './env';
import { ApiError, json, throwIfErrors } from './http';
import { nowIso, round2 } from './util';

interface ItemRow {
  id: number;
  name: string;
  description: string;
  price: number;
  unit: string;
  image_url: string;
  available: number;
  created_at: string;
  updated_at: string;
}

const toDto = (r: ItemRow) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  price: r.price,
  unit: r.unit,
  imageUrl: r.image_url,
  available: r.available === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** GET /api/items — public, available items only. */
export async function listAvailable(env: AppEnv): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT * FROM items WHERE available = 1 ORDER BY name COLLATE NOCASE').all<ItemRow>();
  return json(results.map(toDto));
}

/** GET /api/admin/items — admin, all items (including hidden). */
export async function listAll(env: AppEnv): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT * FROM items ORDER BY id DESC').all<ItemRow>();
  return json(results.map(toDto));
}

/** POST /api/items — admin, multipart/form-data with optional "photo". */
export async function createItem(request: Request, env: AppEnv): Promise<Response> {
  const form = await readForm(request);
  const values = validate(form, true);
  const imageUrl = await savePhoto(env, form);

  const now = nowIso();
  try {
    const row = await env.DB.prepare(
      `INSERT INTO items (name, description, price, unit, image_url, available, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7) RETURNING *`,
    )
      .bind(values.name!, values.description ?? '', values.price!, values.unit ?? '', imageUrl ?? '', values.available === false ? 0 : 1, now)
      .first<ItemRow>();
    return json(toDto(row!), 201);
  } catch (err) {
    await deletePhoto(env, imageUrl);
    throw err;
  }
}

/** PUT /api/items/{id} — admin, multipart/form-data; only provided fields change. */
export async function updateItem(request: Request, env: AppEnv, id: number): Promise<Response> {
  const form = await readForm(request);
  const values = validate(form, false); // validate before saving any photo

  const existing = await env.DB.prepare('SELECT * FROM items WHERE id = ?1').bind(id).first<ItemRow>();
  if (!existing) throw new ApiError(404, 'Item not found');

  const newImage = await savePhoto(env, form);
  const removePhoto = String(form.get('removePhoto') ?? '').toLowerCase() === 'true';
  const imageUrl = newImage ?? (removePhoto ? '' : existing.image_url);

  try {
    const row = await env.DB.prepare(
      `UPDATE items SET name = ?2, description = ?3, price = ?4, unit = ?5, image_url = ?6, available = ?7, updated_at = ?8
       WHERE id = ?1 RETURNING *`,
    )
      .bind(
        id,
        values.name ?? existing.name,
        values.description ?? existing.description,
        values.price ?? existing.price,
        values.unit ?? existing.unit,
        imageUrl,
        values.available === undefined ? existing.available : values.available ? 1 : 0,
        nowIso(),
      )
      .first<ItemRow>();
    if (!row) throw new ApiError(404, 'Item not found');
    if (existing.image_url !== row.image_url) await deletePhoto(env, existing.image_url);
    return json(toDto(row));
  } catch (err) {
    await deletePhoto(env, newImage);
    throw err;
  }
}

/** DELETE /api/items/{id} — admin; also deletes the photo. */
export async function deleteItem(env: AppEnv, id: number): Promise<Response> {
  const row = await env.DB.prepare('DELETE FROM items WHERE id = ?1 RETURNING image_url').bind(id).first<{ image_url: string }>();
  if (!row) throw new ApiError(404, 'Item not found');
  await deletePhoto(env, row.image_url);
  return json({ message: 'Item deleted', id });
}

// ---------- photos (stored in KV, served at /uploads/<file>) ----------

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** GET /uploads/{file} — public, the photo bytes from KV. */
export async function servePhoto(request: Request, env: AppEnv, fileName: string): Promise<Response> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const type = CONTENT_TYPES[ext];
  if (!type || !/^[A-Za-z0-9._-]+$/.test(fileName)) return new Response('Not found', { status: 404 });

  const data = await env.IMAGES.get(`uploads/${fileName}`, 'arrayBuffer');
  if (!data) return new Response('Not found', { status: 404 });

  const headers = {
    'Content-Type': type,
    // File names are unique (a new photo gets a new name), so browsers may cache them forever.
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  return new Response(request.method === 'HEAD' ? null : data, { headers });
}

async function savePhoto(env: AppEnv, form: FormData): Promise<string | null> {
  const photo = form.get('photo');
  if (photo === null || typeof photo === 'string') return null;

  const maxMb = Number(env.UPLOAD_MAX_MB) || 5;
  if (photo.size === 0) throw new ApiError(400, 'Photo is empty');
  // KV values can be up to 25 MB; the shop limit is smaller.
  if (photo.size > maxMb * 1024 * 1024) throw new ApiError(400, `Image must be under ${maxMb} MB`);

  // Check the real file signature, not just the client-supplied content type.
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const ext = detectImageExtension(bytes);
  if (!ext) throw new ApiError(400, 'Only JPG, PNG, WEBP or GIF images are allowed');

  const fileName = `${Date.now()}-${crypto.randomUUID().replace(/-/g, '')}`.slice(0, 30) + ext;
  await env.IMAGES.put(`uploads/${fileName}`, bytes);
  return `/uploads/${fileName}`;
}

/** Deletes a previously uploaded photo. Never throws. */
async function deletePhoto(env: AppEnv, publicUrl: string | null | undefined): Promise<void> {
  if (!publicUrl || !publicUrl.startsWith('/uploads/')) return;
  try {
    await env.IMAGES.delete(publicUrl.slice(1));
  } catch (err) {
    console.warn('Could not delete photo', publicUrl, err);
  }
}

function detectImageExtension(h: Uint8Array): string | null {
  if (h.length < 12) return null;
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return '.jpg';
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return '.png';
  const ascii = (from: number, to: number) => String.fromCharCode(...h.subarray(from, to));
  if (ascii(0, 4) === 'GIF8') return '.gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return '.webp';
  return null;
}

// ---------- form validation ----------

interface ItemValues {
  name?: string;
  price?: number;
  unit?: string;
  description?: string;
  available?: boolean;
}

async function readForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new ApiError(400, 'Bad request');
  }
}

function validate(form: FormData, isCreate: boolean): ItemValues {
  const errors: Record<string, string> = {};
  const values: ItemValues = {};
  const field = (key: string): string | null => {
    const v = form.get(key);
    return typeof v === 'string' ? v : null;
  };

  const name = field('name');
  if (name !== null || isCreate) {
    const n = (name ?? '').trim();
    if (!n) errors.name = 'Name is required';
    else if (n.length > 120) errors.name = 'Name must be at most 120 characters';
    else values.name = n;
  }

  const priceText = field('price');
  if (priceText !== null && priceText.trim() !== '') {
    const price = Number(priceText);
    if (!Number.isFinite(price) || price < 0 || price > 10_000_000) errors.price = 'Price must be a non-negative number';
    else values.price = round2(price);
  } else if (isCreate) {
    errors.price = 'Price is required';
  }

  const unit = field('unit');
  if (unit !== null) {
    if (unit.trim().length > 30) errors.unit = 'Unit must be at most 30 characters';
    else values.unit = unit.trim();
  }

  const description = field('description');
  if (description !== null) {
    if (description.trim().length > 500) errors.description = 'Description must be at most 500 characters';
    else values.description = description.trim();
  }

  const available = field('available');
  if (available !== null) {
    const a = available.trim().toLowerCase();
    if (a === 'true') values.available = true;
    else if (a === 'false') values.available = false;
    else errors.available = 'Invalid value';
  }

  throwIfErrors(errors);
  return values;
}
