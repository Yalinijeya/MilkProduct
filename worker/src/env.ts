/**
 * Secrets — set with `npx wrangler secret put NAME` (production) or in `.dev.vars` (local).
 * They are optional here so a missing one gives a clear message instead of a crash.
 */
interface Secrets {
  /** At least 32 random characters; signs the admin login tokens. */
  JWT_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  /** Free WhatsApp messages to the shop's own number: https://www.callmebot.com/blog/free-api-whatsapp-messages/ */
  CALLMEBOT_API_KEY?: string;
  /** Official Meta WhatsApp Cloud API (alternative to CallMeBot). */
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  /** SMTP login for new-order emails (Gmail: an App Password). */
  EMAIL_USERNAME?: string;
  EMAIL_PASSWORD?: string;
}

/** Bindings + vars from wrangler.jsonc (generated `Env`) plus the secrets above. */
export type AppEnv = Omit<Env, keyof Secrets> & Secrets;
