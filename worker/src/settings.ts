import type { AppEnv } from './env';
import { DAY_NAMES, type DayHours, addDays, allDayWeek, dayError, isValidDate, todayKey } from './hours';
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
  /** 7 days, index 0 = Sunday … 6 = Saturday */
  weeklyHours: DayHours[];
  /** Closed dates, "YYYY-MM-DD" */
  holidays: string[];
  /** false = the admin switched online orders off */
  acceptingOrders: boolean;
  /** Time zone of the opening hours (from wrangler.jsonc, read-only) */
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
  weekly_hours: string;
  holidays: string;
}

/** Reads the saved timetable. Until it is first saved, the old single open/close time applies to every day. */
function parseWeek(r: SettingsRow): DayHours[] {
  try {
    const week = JSON.parse(r.weekly_hours || 'null');
    if (Array.isArray(week) && week.length === 7) {
      return week.map((d) => ({ closed: d?.closed === true, open: String(d?.open ?? ''), close: String(d?.close ?? '') }));
    }
  } catch {
    /* fall through */
  }
  const old: DayHours = { closed: false, open: r.open_time ?? '', close: r.close_time ?? '' };
  return dayError(old) ? allDayWeek() : Array.from({ length: 7 }, () => ({ ...old }));
}

function parseHolidays(raw: string): string[] {
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter((d): d is string => typeof d === 'string' && isValidDate(d)) : [];
  } catch {
    return [];
  }
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
    weeklyHours: parseWeek(r),
    holidays: parseHolidays(r.holidays),
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

  // Opening hours for each day of the week (index 0 = Sunday)
  const week = req.weeklyHours;
  if (week !== undefined && week !== null) {
    if (!Array.isArray(week) || week.length !== 7) {
      errors.weeklyHours = 'Send 7 days (Sunday first)';
    } else {
      const days: DayHours[] = [];
      const problems: string[] = [];
      week.forEach((d: unknown, i: number) => {
        const v = (d ?? {}) as Record<string, unknown>;
        const open = v.open ?? '';
        const close = v.close ?? '';
        if (typeof v.closed !== 'boolean' || typeof open !== 'string' || typeof close !== 'string') {
          problems.push(`${DAY_NAMES[i]}: invalid value`);
          return;
        }
        const day: DayHours = { closed: v.closed, open: open.trim(), close: close.trim() };
        const err = dayError(day);
        if (err) problems.push(`${DAY_NAMES[i]}: ${err}`);
        days.push(day);
      });
      if (problems.length) errors.weeklyHours = problems.join('; ');
      else s.weeklyHours = days;
    }
  }

  // Holiday dates (closed all day)
  const holidays = req.holidays;
  if (holidays !== undefined && holidays !== null) {
    if (!Array.isArray(holidays) || holidays.some((d) => typeof d !== 'string' || !isValidDate(d))) {
      errors.holidays = 'Use dates like 2026-12-25';
    } else {
      // Keep from yesterday on (older dates are no longer needed), no duplicates, sorted.
      const from = addDays(todayKey(env.TIMEZONE), -1);
      const list = [...new Set(holidays as string[])].filter((d) => d >= from).sort();
      if (list.length > 100) errors.holidays = 'At most 100 holiday dates';
      else s.holidays = list;
    }
  }

  const accepting = req.acceptingOrders;
  if (accepting !== undefined && accepting !== null) {
    if (typeof accepting !== 'boolean') errors.acceptingOrders = 'Invalid value';
    else s.acceptingOrders = accepting;
  }

  throwIfErrors(errors);

  await env.DB.prepare(
    `UPDATE settings SET shop_name = ?1, whatsapp_number = ?2, notify_email = ?3, shop_address = ?4,
       shop_lat = ?5, shop_lng = ?6, free_km = ?7, charge_per_km = ?8, weekly_hours = ?9, holidays = ?10,
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
      JSON.stringify(s.weeklyHours),
      JSON.stringify(s.holidays),
      s.acceptingOrders ? 1 : 0,
      nowIso(),
    )
    .run();

  return json(s);
}
