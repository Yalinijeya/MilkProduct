import type { AppEnv } from './env';
import { TIME_RE } from './hours';
import { ApiError, json, readJson, throwIfErrors } from './http';
import { isFiniteNumber, nowIso, parseEmails, toInternational } from './util';

export interface Settings {
  shopName: string;
  whatsappNumber: string;
  notifyEmail: string;
  shopAddress: string;
  shopLat: number;
  shopLng: number;
  freeKm: number;
  chargePerKm: number;
  /** "HH:MM" or "" (both empty = open 24 hours) */
  openTime: string;
  closeTime: string;
  /** false = the admin switched online orders off */
  acceptingOrders: boolean;
  /** Time zone of openTime/closeTime (from wrangler.jsonc, read-only) */
  timezone: string;
}

interface SettingsRow {
  shop_name: string;
  whatsapp_number: string;
  notify_email: string;
  shop_address: string;
  shop_lat: number;
  shop_lng: number;
  free_km: number;
  charge_per_km: number;
  open_time: string;
  close_time: string;
  accepting_orders: number;
}

export async function loadSettings(env: AppEnv): Promise<Settings> {
  const r = await env.DB.prepare('SELECT * FROM settings WHERE id = 1').first<SettingsRow>();
  if (!r) throw new ApiError(500, 'Shop settings are missing (run the database migrations)');
  return {
    shopName: r.shop_name,
    whatsappNumber: r.whatsapp_number,
    notifyEmail: r.notify_email,
    shopAddress: r.shop_address,
    shopLat: r.shop_lat,
    shopLng: r.shop_lng,
    freeKm: r.free_km,
    chargePerKm: r.charge_per_km,
    openTime: r.open_time ?? '',
    closeTime: r.close_time ?? '',
    acceptingOrders: r.accepting_orders !== 0,
    timezone: env.TIMEZONE,
  };
}

/** GET /api/settings — public (checkout needs the shop location, delivery rates and opening hours). */
export async function getSettings(env: AppEnv): Promise<Response> {
  return json(await loadSettings(env));
}

/** PUT /api/settings — admin. Any subset of fields. */
export async function updateSettings(request: Request, env: AppEnv): Promise<Response> {
  const req = await readJson(request);
  const s = await loadSettings(env);
  const errors: Record<string, string> = {};

  const text = (key: string): string | undefined => {
    const v = req[key];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'string') {
      errors[key] = 'Invalid value';
      return undefined;
    }
    return v;
  };
  const num = (key: string): number | undefined => {
    const v = req[key];
    if (v === undefined || v === null) return undefined;
    if (!isFiniteNumber(v)) {
      errors[key] = 'Invalid value';
      return undefined;
    }
    return v;
  };

  const shopName = text('shopName');
  if (shopName !== undefined) {
    if (shopName.trim().length > 120) errors.shopName = 'Max 120 characters';
    else s.shopName = shopName.trim();
  }
  const shopAddress = text('shopAddress');
  if (shopAddress !== undefined) {
    if (shopAddress.trim().length > 300) errors.shopAddress = 'Max 300 characters';
    else s.shopAddress = shopAddress.trim();
  }
  const whatsapp = text('whatsappNumber');
  if (whatsapp !== undefined) {
    // Local numbers (0770798107) get the default country code → 94770798107
    const digits = toInternational(whatsapp, env.DEFAULT_COUNTRY_CODE);
    if (digits.length > 0 && (digits.length < 8 || digits.length > 15))
      errors.whatsappNumber = 'Enter a valid number, e.g. 0770798107 or 94770798107';
    else s.whatsappNumber = digits;
  }
  const notifyEmail = text('notifyEmail');
  if (notifyEmail !== undefined) {
    const emails = parseEmails(notifyEmail);
    if (!emails || notifyEmail.length > 300) errors.notifyEmail = 'Enter valid email address(es), separated by commas';
    else s.notifyEmail = emails.join(', ');
  }
  const lat = num('shopLat');
  if (lat !== undefined) {
    if (lat < -90 || lat > 90) errors.shopLat = 'Must be between -90 and 90';
    else s.shopLat = lat;
  }
  const lng = num('shopLng');
  if (lng !== undefined) {
    if (lng < -180 || lng > 180) errors.shopLng = 'Must be between -180 and 180';
    else s.shopLng = lng;
  }
  const freeKm = num('freeKm');
  if (freeKm !== undefined) {
    if (freeKm < 0 || freeKm > 1000) errors.freeKm = 'Must be between 0 and 1000';
    else s.freeKm = freeKm;
  }
  const rate = num('chargePerKm');
  if (rate !== undefined) {
    if (rate < 0 || rate > 100_000) errors.chargePerKm = 'Must be between 0 and 100000';
    else s.chargePerKm = rate;
  }

  for (const key of ['openTime', 'closeTime'] as const) {
    const t = text(key);
    if (t === undefined) continue;
    if (t.trim() !== '' && !TIME_RE.test(t.trim())) errors[key] = 'Use a time like 07:00 or 18:30';
    else s[key] = t.trim();
  }
  if (!errors.openTime && !errors.closeTime && !s.openTime !== !s.closeTime) {
    errors.openTime = 'Set both opening and closing time, or leave both empty (open 24 hours)';
  }
  const accepting = req.acceptingOrders;
  if (accepting !== undefined && accepting !== null) {
    if (typeof accepting !== 'boolean') errors.acceptingOrders = 'Invalid value';
    else s.acceptingOrders = accepting;
  }

  throwIfErrors(errors);

  await env.DB.prepare(
    `UPDATE settings SET shop_name = ?1, whatsapp_number = ?2, notify_email = ?3, shop_address = ?4,
       shop_lat = ?5, shop_lng = ?6, free_km = ?7, charge_per_km = ?8, open_time = ?9, close_time = ?10,
       accepting_orders = ?11, updated_at = ?12 WHERE id = 1`,
  )
    .bind(
      s.shopName,
      s.whatsappNumber,
      s.notifyEmail,
      s.shopAddress,
      s.shopLat,
      s.shopLng,
      s.freeKm,
      s.chargePerKm,
      s.openTime,
      s.closeTime,
      s.acceptingOrders ? 1 : 0,
      nowIso(),
    )
    .run();

  return json(s);
}
