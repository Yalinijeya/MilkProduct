/**
 * Shop opening hours — same rules as worker/src/hours.ts (the server has the final say:
 * it refuses orders when the shop is closed). Used here to show the status to customers.
 */
export interface HoursSettings {
  /** "HH:MM" or "" */
  openTime: string;
  /** "HH:MM" or "" */
  closeTime: string;
  acceptingOrders: boolean;
  /** IANA time zone, e.g. "Asia/Colombo" */
  timezone: string;
}

export interface ShopStatus {
  open: boolean;
  message: string;
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(time: string): number | null {
  if (!TIME_RE.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** "07:30" → "7:30 AM", "18:00" → "6:00 PM" */
export function format12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Minutes since midnight in the shop's time zone. */
function minutesNow(timeZone: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return get('hour') * 60 + get('minute');
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

/** True when opening hours are set (otherwise the shop is open 24 hours). */
export function hasHours(s: HoursSettings): boolean {
  const open = toMinutes(s.openTime);
  const close = toMinutes(s.closeTime);
  return open !== null && close !== null && open !== close;
}

export function shopStatus(s: HoursSettings, now = new Date()): ShopStatus {
  if (!s.acceptingOrders) {
    return { open: false, message: 'Sorry, we are not taking orders right now. Please check back later.' };
  }
  if (!hasHours(s)) return { open: true, message: 'Open 24 hours' };

  const open = toMinutes(s.openTime)!;
  const close = toMinutes(s.closeTime)!;
  const n = minutesNow(s.timezone, now);
  // close < open means the shop is open past midnight (e.g. 18:00 → 02:00)
  const isOpen = open < close ? n >= open && n < close : n >= open || n < close;

  return isOpen
    ? { open: true, message: `Open now · closes at ${format12h(s.closeTime)}` }
    : { open: false, message: `Sorry, we are closed now. We open at ${format12h(s.openTime)}.` };
}

/** "7:00 AM – 8:00 PM" or "Open 24 hours" (for the footer). */
export function hoursLabel(s: HoursSettings): string {
  return hasHours(s) ? `${format12h(s.openTime)} – ${format12h(s.closeTime)}` : 'Open 24 hours';
}
