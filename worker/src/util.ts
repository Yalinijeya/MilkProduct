/** Current time as an ISO string. Every timestamp in the database uses this exact format. */
export const nowIso = (): string => new Date().toISOString();

/** Rounds money to 2 decimals (half away from zero, like the old C# backend). */
export function round2(value: number): number {
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
}

/** "Rs. 204.00" */
export const money = (value: number, symbol: string): string => symbol + value.toFixed(2);

/** 2.6900 → "2.69", 3 → "3" (C# format "0.##") */
export const formatKm = (km: number): string => String(round2(km));

export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const digitsOnly = (phone: string | null | undefined): string => (phone ?? '').replace(/[^0-9]/g, '');

/**
 * Converts a phone number to the international digits WhatsApp needs:
 * "077 079 8107" → "94770798107", "+94 77..." → "9477...", "0094 77..." → "9477...".
 */
export function toInternational(phone: string | null | undefined, countryCode: string): string {
  const digits = digitsOnly(phone);
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0') && digits.length > 1) return digitsOnly(countryCode) + digits.slice(1);
  return digits;
}

const EMAIL_RE = /^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$/;

/** Splits "a@x.com, b@y.com" into addresses; null if any address is invalid. */
export function parseEmails(input: string | null | undefined): string[] | null {
  const parts = (input ?? '').split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (parts.some((p) => !EMAIL_RE.test(p))) return null;
  const seen = new Set<string>();
  return parts.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function escapeHtml(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Standard base64 of UTF-8 text or raw bytes. */
export function toBase64(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export const toBase64Url = (data: string | Uint8Array): string =>
  toBase64(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
