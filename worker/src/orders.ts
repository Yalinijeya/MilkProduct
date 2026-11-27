import type { AppEnv } from './env';
import { shopStatus } from './hours';
import { ApiError, json, readJson } from './http';
import { notifyNewOrder, whatsAppMessage } from './notify';
import { rateLimit } from './ratelimit';
import { loadSettings } from './settings';
import { isFiniteNumber, nowIso, round2, toInternational } from './util';

export const ORDER_STATUSES = ['new', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const MAX_QUANTITY = 100;
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,18}$/;

export interface OrderLine {
  id: number;
  itemId: number;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderRow {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_lat: number;
  customer_lng: number;
  notes: string;
  items: string;
  item_total: number;
  distance_km: number;
  delivery_charge: number;
  grand_total: number;
  status: OrderStatus;
  whatsapp_link: string;
  whatsapp_sent: number;
  whatsapp_error: string;
  email_sent: number;
  email_error: string;
  created_at: string;
  updated_at: string;
}

export const orderNumber = (id: number): string => `ORD-${1000 + id}`;
export const mapLink = (lat: number, lng: number): string => `https://www.google.com/maps?q=${lat},${lng}`;
export const orderLines = (r: OrderRow): OrderLine[] => (JSON.parse(r.items) as OrderLine[]).sort((a, b) => a.id - b.id);

/** The JSON shape the Angular app expects (same as the old C# OrderDto). */
export function orderDto(r: OrderRow) {
  return {
    id: r.id,
    orderNumber: orderNumber(r.id),
    customer: { name: r.customer_name, phone: r.customer_phone, address: r.customer_address, lat: r.customer_lat, lng: r.customer_lng },
    notes: r.notes,
    items: orderLines(r).map((l) => ({ itemId: l.itemId, name: l.name, price: l.price, quantity: l.quantity, lineTotal: l.lineTotal })),
    itemTotal: r.item_total,
    distanceKm: r.distance_km,
    deliveryCharge: r.delivery_charge,
    grandTotal: r.grand_total,
    status: r.status,
    mapLink: mapLink(r.customer_lat, r.customer_lng),
    whatsapp: { link: r.whatsapp_link, sent: r.whatsapp_sent === 1, error: r.whatsapp_error },
    email: { sent: r.email_sent === 1, error: r.email_error },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------- delivery (same rule as frontend/src/app/core/utils/delivery.ts) ----------

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points in km (Haversine formula). */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Free within freeKm; beyond that chargePerKm for every extra km, rounded UP (7.34 km with 5 free → 3 km). */
function deliveryCharge(distanceKm: number, freeKm: number, chargePerKm: number): number {
  if (distanceKm <= freeKm) return 0;
  // Round to 3 decimals first so floating-point noise (1.0000000001) doesn't add a whole km.
  const extraKm = Math.ceil(Math.round((distanceKm - freeKm) * 1000) / 1000);
  return extraKm * chargePerKm;
}

// ---------- handlers ----------

/** POST /api/orders — public. Places an order; totals are always recalculated here. */
export async function placeOrder(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
  // 10 orders per IP per minute (spam protection)
  await rateLimit(env, request, 'orders', 10, 60_000);

  const { customer, notes, quantities } = validateOrder(await readJson(request));

  // Closed (outside opening hours, or orders switched off in Admin → Settings)?
  const settings = await loadSettings(env);
  const status = shopStatus(settings);
  if (!status.open) throw new ApiError(409, status.message);

  // Prices always come from the saved items, never from the client.
  const ids = [...quantities.keys()];
  const { results: items } = await env.DB.prepare(
    `SELECT id, name, price, stock FROM items WHERE available = 1 AND id IN (${ids.map(() => '?').join(',')})`,
  )
    .bind(...ids)
    .all<{ id: number; name: string; price: number; stock: number | null }>();
  const available = new Map(items.map((i) => [i.id, i]));
  const missing = ids.filter((id) => !available.has(id));
  if (missing.length > 0) {
    throw new ApiError(409, 'Some items are no longer available. Please refresh your cart.', { missing: missing.join(',') });
  }

  // Enough stock? (checked again inside the save below, in case someone else buys at the same time)
  const short = ids
    .map((id) => available.get(id)!)
    .filter((i) => i.stock !== null && quantities.get(i.id)! > i.stock)
    .map((i) => (i.stock === 0 ? `${i.name} is out of stock` : `only ${i.stock} ${i.name} left`));
  if (short.length > 0) throw new ApiError(409, 'Not enough stock', { stock: short.join(', ') });

  const lines: OrderLine[] = ids.map((itemId, index) => {
    const item = available.get(itemId)!;
    const quantity = quantities.get(itemId)!;
    return { id: index + 1, itemId, name: item.name, price: item.price, quantity, lineTotal: round2(item.price * quantity) };
  });
  const itemTotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));

  // Delivery charge is always recalculated here so the customer can't change it.
  const distance = haversineKm(settings.shopLat, settings.shopLng, customer.lat, customer.lng);
  const charge = deliveryCharge(distance, settings.freeKm, settings.chargePerKm);
  const now = nowIso();

  // One transaction: take the items out of stock and save the order. If any stock would go below
  // zero, the database CHECK fails and NOTHING is saved.
  const stockUpdates = stockChanges(env, lines, -1);
  const insertOrder = env.DB.prepare(
    `INSERT INTO orders (customer_name, customer_phone, customer_address, customer_lat, customer_lng, notes, items,
       item_total, distance_km, delivery_charge, grand_total, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'new', ?12, ?12) RETURNING *`,
  ).bind(
    customer.name,
    customer.phone,
    customer.address,
    customer.lat,
    customer.lng,
    notes,
    JSON.stringify(lines),
    itemTotal,
    round2(distance),
    charge,
    round2(itemTotal + charge),
    now,
  );

  let results: D1Result[];
  try {
    results = await env.DB.batch([...stockUpdates, insertOrder]);
  } catch (err) {
    if (isStockError(err)) {
      throw new ApiError(409, 'Not enough stock', { stock: 'Some items just sold out. Please refresh the page and check your cart.' });
    }
    throw err;
  }
  const inserted = results[results.length - 1].results[0] as OrderRow | undefined;
  if (!inserted) throw new ApiError(500, 'Could not save the order');

  // The order number comes from the id, so the WhatsApp link is added right after inserting.
  const number = toInternational(settings.whatsappNumber, env.DEFAULT_COUNTRY_CODE);
  const text = whatsAppMessage(inserted, settings.shopName, env.CURRENCY_SYMBOL);
  inserted.whatsapp_link = number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : '';
  await env.DB.prepare('UPDATE orders SET whatsapp_link = ?2 WHERE id = ?1').bind(inserted.id, inserted.whatsapp_link).run();

  // WhatsApp + email to the shop, sent after the customer already has the answer.
  ctx.waitUntil(notifyNewOrder(env, inserted.id));

  const dto = orderDto(inserted);
  return json({ order: dto, whatsappLink: dto.whatsapp.link }, 201);
}

/** GET /api/orders?status=new,confirmed&page=1&limit=20 — admin. */
export async function listOrders(url: URL, env: AppEnv): Promise<Response> {
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get('page'))) || 1);
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(url.searchParams.get('limit'))) || 20));
  const statuses = parseStatuses(url.searchParams.get('status'));

  const where = statuses.length ? `WHERE status IN (${statuses.map(() => '?').join(',')})` : '';
  const [countRes, pageRes] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM orders ${where}`).bind(...statuses),
    env.DB.prepare(`SELECT * FROM orders ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(...statuses, limit, (page - 1) * limit),
  ]);
  const total = (countRes.results[0] as { total: number }).total;
  const data = (pageRes.results as unknown as OrderRow[]).map(orderDto);

  return json({ data, total, page, limit, pages: Math.ceil(total / limit) });
}

/** PATCH /api/orders/{id}/status — admin. Body: { "status": "confirmed" } */
export async function updateOrderStatus(request: Request, env: AppEnv, id: number): Promise<Response> {
  const body = await readJson(request);
  const status = typeof body.status === 'string' ? body.status.trim().toLowerCase() : '';
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
    throw new ApiError(400, 'Status must be one of: new, confirmed, out_for_delivery, delivered, cancelled');
  }
  const current = await env.DB.prepare('SELECT * FROM orders WHERE id = ?1').bind(id).first<OrderRow>();
  if (!current) throw new ApiError(404, 'Order not found');

  // Cancelling puts the items back in stock; un-cancelling takes them out again.
  const wasCancelled = current.status === 'cancelled';
  const willBeCancelled = status === 'cancelled';
  const ts = nowIso();

  // The status only changes if nobody else changed it since we read it (WHERE status = old).
  const updateOrder = env.DB.prepare('UPDATE orders SET status = ?2, updated_at = ?3 WHERE id = ?1 AND status = ?4 RETURNING *').bind(
    id,
    status,
    ts,
    current.status,
  );
  // ...and the stock only moves if that status change really happened (same transaction).
  const stockUpdates =
    wasCancelled === willBeCancelled
      ? []
      : stockChanges(env, orderLines(current), willBeCancelled ? 1 : -1, { orderId: id, status, updatedAt: ts });

  let results: D1Result[];
  try {
    results = await env.DB.batch([updateOrder, ...stockUpdates]);
  } catch (err) {
    if (isStockError(err)) {
      throw new ApiError(409, 'Not enough stock to re-open this cancelled order. Update the stock in Manage items first.');
    }
    throw err;
  }
  const row = results[0].results[0] as OrderRow | undefined;
  if (!row) throw new ApiError(409, 'This order was just changed by someone else. Please refresh.');
  return json(orderDto(row));
}

// ---------- stock ----------

/**
 * Statements that add (direction 1) or remove (direction -1) the order's items from stock.
 * Items whose stock isn't tracked (NULL) or that were deleted are skipped.
 * With `onlyIf`, the change only happens when the order has that status + updated_at (set earlier in the
 * same batch), so stock never moves twice.
 */
function stockChanges(
  env: AppEnv,
  lines: OrderLine[],
  direction: 1 | -1,
  onlyIf?: { orderId: number; status: string; updatedAt: string },
): D1PreparedStatement[] {
  const perItem = new Map<number, number>();
  for (const l of lines) perItem.set(l.itemId, (perItem.get(l.itemId) ?? 0) + l.quantity);

  return [...perItem].map(([itemId, quantity]) =>
    onlyIf
      ? env.DB.prepare(
          `UPDATE items SET stock = stock + ?2 WHERE id = ?1 AND stock IS NOT NULL
             AND EXISTS (SELECT 1 FROM orders WHERE id = ?3 AND status = ?4 AND updated_at = ?5)`,
        ).bind(itemId, direction * quantity, onlyIf.orderId, onlyIf.status, onlyIf.updatedAt)
      : env.DB.prepare('UPDATE items SET stock = stock + ?2 WHERE id = ?1 AND stock IS NOT NULL').bind(itemId, direction * quantity),
  );
}

/** The CHECK (stock >= 0) in the items table failed → not enough stock. */
function isStockError(err: unknown): boolean {
  return /CHECK constraint failed/i.test(String(err instanceof Error ? err.message : err));
}

/** How far back each change check looks again, so an order saved during the previous check isn't missed. */
const CHANGES_OVERLAP_MS = 15_000;

/**
 * GET /api/admin/orders/changes?since=<cursor> — admin. Replaces the old SignalR hub:
 * the admin panel calls this every few seconds and gets orders created/changed after `since`.
 */
export async function orderChanges(url: URL, env: AppEnv): Promise<Response> {
  const cursor = new Date(Date.now() - CHANGES_OVERLAP_MS).toISOString();
  const since = url.searchParams.get('since');
  if (!since || Number.isNaN(Date.parse(since))) return json({ cursor, orders: [] });

  const { results } = await env.DB.prepare('SELECT * FROM orders WHERE updated_at > ?1 ORDER BY updated_at LIMIT 100')
    .bind(new Date(since).toISOString())
    .all<OrderRow>();
  return json({ cursor, orders: results.map(orderDto) });
}

// ---------- helpers ----------

/** "new,out_for_delivery" (or "OutForDelivery") → known statuses; unknown values are ignored. */
function parseStatuses(csv: string | null): OrderStatus[] {
  const wanted = new Set((csv ?? '').split(',').map((s) => s.trim().replace(/_/g, '').toLowerCase()));
  return ORDER_STATUSES.filter((s) => wanted.has(s.replace(/_/g, '')));
}

function validateOrder(body: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const c = (body.customer && typeof body.customer === 'object' ? body.customer : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const name = str(c.name);
  const phone = str(c.phone);
  const address = str(c.address);
  let notes = str(body.notes);
  const lat = c.lat;
  const lng = c.lng;

  if (!name || name.length > 100) errors.name = 'Name is required (max 100 characters)';
  if (!PHONE_RE.test(phone)) errors.phone = 'Valid phone number is required';
  if (!address || address.length > 500) errors.address = 'Address is required (max 500 characters)';
  if (!isFiniteNumber(lat) || lat < -90 || lat > 90) errors.lat = 'Valid latitude is required';
  if (!isFiniteNumber(lng) || lng < -180 || lng > 180) errors.lng = 'Valid longitude is required';
  if (notes.length > 500) notes = notes.slice(0, 500);

  // Merge duplicate lines and validate quantities
  const quantities = new Map<number, number>();
  const lines = Array.isArray(body.items) ? body.items : [];
  for (const line of lines as Array<Record<string, unknown> | null>) {
    const itemId = line?.itemId;
    const quantity = line?.quantity;
    if (
      !Number.isInteger(itemId) || (itemId as number) <= 0 ||
      !Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > MAX_QUANTITY
    ) {
      errors.items = `Each item needs a valid itemId and a quantity between 1 and ${MAX_QUANTITY}`;
      break;
    }
    quantities.set(itemId as number, (quantities.get(itemId as number) ?? 0) + (quantity as number));
  }
  if (quantities.size === 0 && !errors.items) errors.items = 'Cart is empty';
  else if ([...quantities.values()].some((q) => q > MAX_QUANTITY)) errors.items = `Maximum ${MAX_QUANTITY} of each item per order`;

  if (Object.keys(errors).length > 0) throw new ApiError(400, 'Invalid order', errors);

  const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    customer: { name, phone, address, lat: round6(lat as number), lng: round6(lng as number) },
    notes,
    quantities,
  };
}
