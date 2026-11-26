import type { AppEnv } from './env';
import { json } from './http';
import { mapLink, orderLines, orderNumber, type OrderRow } from './orders';
import { loadSettings } from './settings';
import { sendSmtpMail } from './smtp';
import { escapeHtml as h, formatKm, money, nowIso, parseEmails, toInternational } from './util';

export interface SendResult {
  sent: boolean;
  error: string;
}

const ok: SendResult = { sent: true, error: '' };
const fail = (error: string): SendResult => ({ sent: false, error: error.length > 500 ? error.slice(0, 500) : error });

type WhatsAppProvider = 'CallMeBot' | 'MetaCloudApi' | 'None';

function whatsAppProvider(env: AppEnv): WhatsAppProvider {
  if (env.CALLMEBOT_API_KEY?.trim()) return 'CallMeBot';
  if (env.WHATSAPP_TOKEN?.trim() && env.WHATSAPP_PHONE_NUMBER_ID?.trim()) return 'MetaCloudApi';
  return 'None';
}

const emailFrom = (env: AppEnv) => (env.EMAIL_FROM || env.EMAIL_USERNAME || '').trim();
const emailConfigured = (env: AppEnv) => !!env.EMAIL_HOST?.trim() && !!emailFrom(env);

// ---------- message content ----------

/** The WhatsApp text for an order (also the plain-text email). */
export function whatsAppMessage(o: OrderRow, shopName: string, currency: string): string {
  const lines = [
    shopName.trim() ? `🛒 *New Order - ${shopName}*` : '🛒 *New Order*',
    `*Order ID:* ${orderNumber(o.id)}`,
    '',
    `*Customer:* ${o.customer_name}`,
    `*Phone:* ${o.customer_phone}`,
    `*Address:* ${o.customer_address}`,
    `*Map:* ${mapLink(o.customer_lat, o.customer_lng)}`,
    '',
    '*Items:*',
    ...orderLines(o).map((i) => `• ${i.name} x ${i.quantity} = ${money(i.lineTotal, currency)}`),
    '',
    `*Item total:* ${money(o.item_total, currency)}`,
    `*Delivery (${formatKm(o.distance_km)} km):* ${o.delivery_charge === 0 ? 'FREE' : money(o.delivery_charge, currency)}`,
    `*Grand total:* ${money(o.grand_total, currency)}`,
  ];
  if (o.notes.trim()) lines.push('', `*Notes:* ${o.notes}`);
  return lines.join('\n');
}

function emailSubject(o: OrderRow, currency: string): string {
  return `New order ${orderNumber(o.id)} – ${money(o.grand_total, currency)} – ${o.customer_name}`;
}

function emailHtml(o: OrderRow, shopName: string, currency: string, timeZone: string): string {
  const km = formatKm(o.distance_km);
  const td = 'padding:6px 8px;border-bottom:1px solid #e2e8f0;';
  const when = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(o.created_at));

  let html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;max-width:600px">';
  html += `<h2 style="margin:0 0 4px">🛒 New order ${h(orderNumber(o.id))}</h2>`;
  html += `<p style="margin:0 0 16px;color:#64748b">${h(shopName)} · ${h(when)}</p>`;
  html += '<h3 style="margin:0 0 6px">Customer</h3><p style="margin:0 0 16px;line-height:1.6">';
  html += `<b>${h(o.customer_name)}</b><br>`;
  html += `📞 <a href="tel:${h(o.customer_phone)}">${h(o.customer_phone)}</a><br>`;
  html += `${h(o.customer_address)}<br>`;
  html += `📍 <a href="${h(mapLink(o.customer_lat, o.customer_lng))}">Open in Google Maps</a> (${km} km)</p>`;
  html += '<table style="border-collapse:collapse;width:100%"><tr style="background:#f1f5f9;text-align:left">';
  html += `<th style="${td}">Item</th><th style="${td}text-align:right">Qty</th><th style="${td}text-align:right">Price</th><th style="${td}text-align:right">Total</th></tr>`;
  for (const i of orderLines(o)) {
    html += `<tr><td style="${td}">${h(i.name)}</td><td style="${td}text-align:right">${i.quantity}</td>`;
    html += `<td style="${td}text-align:right">${money(i.price, currency)}</td><td style="${td}text-align:right">${money(i.lineTotal, currency)}</td></tr>`;
  }
  html += `<tr><td colspan="3" style="${td}text-align:right">Item total</td><td style="${td}text-align:right">${money(o.item_total, currency)}</td></tr>`;
  const delivery = o.delivery_charge === 0 ? 'FREE' : money(o.delivery_charge, currency);
  html += `<tr><td colspan="3" style="${td}text-align:right">Delivery (${km} km)</td><td style="${td}text-align:right">${delivery}</td></tr>`;
  html += `<tr><td colspan="3" style="padding:8px;text-align:right"><b>Grand total</b></td><td style="padding:8px;text-align:right"><b>${money(o.grand_total, currency)}</b></td></tr>`;
  html += '</table>';
  if (o.notes.trim()) html += `<p style="margin:16px 0 0;padding:8px;background:#fffbeb">📝 <b>Notes:</b> ${h(o.notes)}</p>`;
  if (o.whatsapp_link) html += `<p style="margin:16px 0 0"><a href="${h(o.whatsapp_link)}">Open this order in WhatsApp</a></p>`;
  html += '</div>';
  return html;
}

// ---------- senders ----------

async function sendWhatsApp(env: AppEnv, toNumber: string, message: string): Promise<SendResult> {
  const to = toInternational(toNumber, env.DEFAULT_COUNTRY_CODE);
  if (!to) return fail('Shop WhatsApp number is not set (Admin → Settings)');

  try {
    switch (whatsAppProvider(env)) {
      case 'CallMeBot': {
        // Free: https://www.callmebot.com/blog/free-api-whatsapp-messages/ — the key only works for
        // the phone number that registered it (the shop's number).
        const url =
          'https://api.callmebot.com/whatsapp.php' +
          `?phone=${encodeURIComponent('+' + to)}` +
          `&text=${encodeURIComponent(message)}` +
          `&apikey=${encodeURIComponent(env.CALLMEBOT_API_KEY!.trim())}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        const body = await res.text();
        // CallMeBot answers with an HTML page; failures mention "error" or an invalid API key.
        if (res.ok && !/error|invalid/i.test(body)) return ok;
        const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
        return fail(`CallMeBot ${res.status}: ${text}`);
      }
      case 'MetaCloudApi': {
        // NOTE: Meta only delivers free-form text within 24 hours after the recipient last messaged
        // your business number; otherwise an approved template is required.
        const res = await fetch(
          `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID!.trim()}/messages`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN!.trim()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: true, body: message } }),
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (res.ok) return ok;
        return fail(`WhatsApp API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      default:
        return fail('WhatsApp sending is not configured (Cloudflare secrets)');
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

async function sendEmail(env: AppEnv, to: string[], subject: string, html: string, text: string): Promise<SendResult> {
  if (!emailConfigured(env)) return fail('Email (SMTP) is not configured (Cloudflare secrets)');
  if (to.length === 0) return fail('Notification email is not set (Admin → Settings)');
  try {
    await sendSmtpMail({
      host: env.EMAIL_HOST.trim(),
      port: Number(env.EMAIL_PORT) || 465,
      username: env.EMAIL_USERNAME ?? '',
      password: env.EMAIL_PASSWORD ?? '',
      from: emailFrom(env),
      fromName: env.EMAIL_FROM_NAME,
      to,
      subject,
      html,
      text,
    });
    return ok;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** One retry after a short pause (a Worker may keep working ~30 s after answering). */
async function withRetry(send: () => Promise<SendResult>): Promise<SendResult> {
  const first = await send();
  if (first.sent) return first;
  await new Promise((r) => setTimeout(r, 3000));
  return send();
}

// ---------- new order ----------

/** Sends the new-order WhatsApp message and email to the shop and saves the results on the order. */
export async function notifyNewOrder(env: AppEnv, orderId: number): Promise<void> {
  try {
    const waOn = whatsAppProvider(env) !== 'None';
    const mailOn = emailConfigured(env);
    if (!waOn && !mailOn) return;

    const [order, settings] = await Promise.all([
      env.DB.prepare('SELECT * FROM orders WHERE id = ?1').bind(orderId).first<OrderRow>(),
      loadSettings(env),
    ]);
    if (!order) return;
    const currency = env.CURRENCY_SYMBOL;
    const text = whatsAppMessage(order, settings.shopName, currency);

    const [wa, mail] = await Promise.all([
      waOn ? withRetry(() => sendWhatsApp(env, settings.whatsappNumber, text)) : Promise.resolve(null),
      mailOn
        ? withRetry(() =>
            sendEmail(
              env,
              parseEmails(settings.notifyEmail) ?? [],
              emailSubject(order, currency),
              emailHtml(order, settings.shopName, currency, env.TIMEZONE),
              text.replace(/\*/g, ''),
            ),
          )
        : Promise.resolve(null),
    ]);
    if (wa && !wa.sent) console.error(`WhatsApp notification for order ${orderId} failed: ${wa.error}`);
    if (mail && !mail.sent) console.error(`Email notification for order ${orderId} failed: ${mail.error}`);

    // updated_at changes so the admin panel picks up the ✓ sent / ⚠ failed badges.
    await env.DB.prepare(
      `UPDATE orders SET
         whatsapp_sent = COALESCE(?2, whatsapp_sent), whatsapp_error = COALESCE(?3, whatsapp_error),
         email_sent = COALESCE(?4, email_sent), email_error = COALESCE(?5, email_error), updated_at = ?6
       WHERE id = ?1`,
    )
      .bind(orderId, wa ? (wa.sent ? 1 : 0) : null, wa?.error ?? null, mail ? (mail.sent ? 1 : 0) : null, mail?.error ?? null, nowIso())
      .run();
  } catch (err) {
    console.error(`Notifications failed for order ${orderId}`, err);
  }
}

// ---------- admin endpoints ----------

/** GET /api/admin/notifications — which channels are set up and where they send to. */
export async function notificationStatus(env: AppEnv): Promise<Response> {
  const s = await loadSettings(env);
  const provider = whatsAppProvider(env);
  const mailOn = emailConfigured(env);
  return json({
    whatsapp: { configured: provider !== 'None', provider, recipient: s.whatsappNumber },
    email: { configured: mailOn, provider: mailOn ? 'SMTP' : 'None', recipient: s.notifyEmail },
  });
}

/** POST /api/admin/notifications/test — sends a test WhatsApp message and email now. */
export async function sendTestNotification(env: AppEnv): Promise<Response> {
  const s = await loadSettings(env);
  const text = `✅ Test notification from ${s.shopName}. New orders will be sent here automatically.`;
  const html = `<p style="font-family:Arial,sans-serif">${h(text)}</p>`;

  const [whatsapp, email] = await Promise.all([
    whatsAppProvider(env) === 'None' ? null : sendWhatsApp(env, s.whatsappNumber, text),
    !emailConfigured(env) ? null : sendEmail(env, parseEmails(s.notifyEmail) ?? [], `Test notification – ${s.shopName}`, html, text),
  ]);
  return json({ whatsapp, email });
}
