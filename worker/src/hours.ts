/**
 * Shop opening hours: a weekly timetable + holiday dates.
 *
 * The SAME file is copied to frontend/src/app/core/utils/shop-hours.ts — keep them identical.
 * The website uses it to show "Open now / Closed" to customers; the Worker uses it to
 * refuse orders when the shop is closed (the server has the final say).
 */

/** Hours for one day of the week. */
export interface DayHours {
  /** true = closed all day (weekly holiday, e.g. every Sunday) */
  closed: boolean;
  /** "HH:MM" or "" (open and close both empty = open 24 hours that day) */
  open: string;
  /** "HH:MM" or "". Earlier than `open` = open past midnight (e.g. 18:00 → 02:00) */
  close: string;
}

export interface HoursSettings {
  /** 7 entries: index 0 = Sunday, 1 = Monday … 6 = Saturday */
  weeklyHours: DayHours[];
  /** One-off closed days, "YYYY-MM-DD" in the shop's time zone (e.g. "2026-12-25") */
  holidays: string[];
  /** false = online orders switched off by the admin */
  acceptingOrders: boolean;
  /** IANA time zone, e.g. "Asia/Colombo" */
  timezone: string;
}

export interface ShopStatus {
  open: boolean;
  message: string;
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Display order: Monday first. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const OPEN_ALL_DAY: DayHours = { closed: false, open: '', close: '' };

/** Every day open 24 hours. */
export function allDayWeek(): DayHours[] {
  return Array.from({ length: 7 }, () => ({ ...OPEN_ALL_DAY }));
}

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

function minutesTo12h(min: number): string {
  min = ((min % 1440) + 1440) % 1440;
  return format12h(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
}

/** "2026-12-25" → "Fri 25 Dec" */
export function formatDate(key: string): string {
  const d = keyToUtc(key);
  return `${SHORT_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** True when the day is open all day (no times set). */
export function isAllDay(d: DayHours): boolean {
  return !d.closed && (toMinutes(d.open) === null || toMinutes(d.close) === null || d.open === d.close);
}

/** Validation message for one day, or '' when fine. */
export function dayError(d: DayHours): string {
  if (d.open && !TIME_RE.test(d.open)) return 'Use a time like 07:00';
  if (d.close && !TIME_RE.test(d.close)) return 'Use a time like 18:30';
  if (!d.closed && !d.open !== !d.close) return 'Set both opening and closing time, or leave both empty (open 24 hours)';
  return '';
}

// ---------- dates in the shop's time zone ----------

interface LocalNow {
  /** "YYYY-MM-DD" */
  date: string;
  /** minutes since midnight */
  minutes: number;
}

function localNow(timeZone: string, now: Date): LocalNow {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      minutes: Number(get('hour')) * 60 + Number(get('minute')),
    };
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
}

/** Today's date in the shop's time zone, "YYYY-MM-DD". */
export function todayKey(timeZone: string, now = new Date()): string {
  return localNow(timeZone, now).date;
}

function keyToUtc(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "2026-12-31" + 1 → "2027-01-01" */
export function addDays(key: string, days: number): string {
  const d = keyToUtc(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True for a real calendar date like "2026-02-28" (not "2026-02-30"). */
export function isValidDate(key: string): boolean {
  return DATE_RE.test(key) && keyToUtc(key).toISOString().slice(0, 10) === key;
}

function weekday(key: string): number {
  return keyToUtc(key).getUTCDay();
}

// ---------- open / closed ----------

/** The opening period that STARTS on this date, in minutes from that day's midnight (end may be > 1440). */
function shiftOn(s: HoursSettings, key: string): { start: number; end: number } | null {
  if (s.holidays.includes(key)) return null;
  const d = s.weeklyHours[weekday(key)] ?? OPEN_ALL_DAY;
  if (d.closed) return null;
  if (isAllDay(d)) return { start: 0, end: 1440 };
  const open = toMinutes(d.open)!;
  const close = toMinutes(d.close)!;
  return { start: open, end: close > open ? close : close + 1440 };
}

/** True when every day is open 24 hours and there are no holidays coming up. */
export function isAlwaysOpen(s: HoursSettings): boolean {
  return s.weeklyHours.every(isAllDay);
}

export function shopStatus(s: HoursSettings, now = new Date()): ShopStatus {
  if (!s.acceptingOrders) {
    return { open: false, message: 'Sorry, we are not taking orders right now. Please check back later.' };
  }
  const { date: today, minutes: n } = localNow(s.timezone, now);
  const yesterday = addDays(today, -1);

  // Open now? Either today's hours, or last night's hours that run past midnight.
  const t = shiftOn(s, today);
  const y = shiftOn(s, yesterday);
  let closesAt: number | null = null;
  if (t && n >= t.start && n < t.end) closesAt = t.end;
  else if (y && n < y.end - 1440) closesAt = y.end - 1440;

  if (closesAt !== null) {
    if (isAlwaysOpen(s) && !s.holidays.some((h) => h >= today)) return { open: true, message: 'Open 24 hours' };
    // Open all day today and tomorrow starts at midnight too → just say "open today"
    if (closesAt >= 1440) {
      const next = shiftOn(s, addDays(today, 1));
      if (closesAt === 1440 && next?.start === 0) return { open: true, message: 'Open now' };
      if (closesAt === 1440) return { open: true, message: 'Open now · closes at midnight' };
    }
    return { open: true, message: `Open now · closes at ${minutesTo12h(closesAt)}` };
  }

  // Closed: why, and when do we open next?
  let reason = 'Sorry, we are closed now.';
  if (s.holidays.includes(today)) reason = 'Sorry, we are closed today (holiday).';
  else if (s.weeklyHours[weekday(today)]?.closed) reason = `Sorry, we are closed on ${DAY_NAMES[weekday(today)]}s.`;

  for (let d = 0; d <= 60; d++) {
    const key = addDays(today, d);
    const shift = shiftOn(s, key);
    if (!shift || (d === 0 && shift.start <= n)) continue;
    const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : d < 7 ? `on ${DAY_NAMES[weekday(key)]}` : `on ${formatDate(key)}`;
    const at = shift.start === 0 ? '' : ` at ${minutesTo12h(shift.start)}`;
    return { open: false, message: `${reason} We open ${when}${at}.` };
  }
  return { open: false, message: reason };
}

// ---------- text for the website ----------

function dayLabel(d: DayHours): string {
  if (d.closed) return 'Closed';
  if (isAllDay(d)) return 'Open 24 hours';
  return `${format12h(d.open)} – ${format12h(d.close)}`;
}

/**
 * The weekly timetable grouped for display, Monday first:
 * [{ days: "Mon – Sat", hours: "7:00 AM – 8:00 PM" }, { days: "Sun", hours: "Closed" }]
 */
export function weeklySummary(s: HoursSettings): { days: string; hours: string }[] {
  const rows: { from: number; to: number; hours: string }[] = [];
  for (const day of WEEK_ORDER) {
    const hours = dayLabel(s.weeklyHours[day] ?? OPEN_ALL_DAY);
    const last = rows[rows.length - 1];
    if (last && last.hours === hours) last.to = day;
    else rows.push({ from: day, to: day, hours });
  }
  if (rows.length === 1) return [{ days: 'Every day', hours: rows[0].hours }];
  return rows.map((r) => ({
    days: r.from === r.to ? SHORT_DAYS[r.from] : `${SHORT_DAYS[r.from]} – ${SHORT_DAYS[r.to]}`,
    hours: r.hours,
  }));
}

/** Holidays from today on, sorted ("YYYY-MM-DD"). */
export function upcomingHolidays(s: HoursSettings, now = new Date(), withinDays = 365): string[] {
  const today = todayKey(s.timezone, now);
  const last = addDays(today, withinDays);
  return s.holidays.filter((h) => h >= today && h <= last).sort();
}
