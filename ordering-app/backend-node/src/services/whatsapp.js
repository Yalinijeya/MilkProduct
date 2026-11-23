const env = require('../config/env');

const money = (n) => `₹${Number(n).toFixed(2)}`;

/** Builds the plain-text order summary sent to the shop's WhatsApp. */
function buildOrderMessage(order, shopName) {
  const lines = [
    `🛒 *New Order${shopName ? ` - ${shopName}` : ''}*`,
    `*Order ID:* ${order.orderNumber}`,
    '',
    `*Customer:* ${order.customer.name}`,
    `*Phone:* ${order.customer.phone}`,
    `*Address:* ${order.customer.address}`,
    `*Map:* https://www.google.com/maps?q=${order.customer.lat},${order.customer.lng}`,
    '',
    '*Items:*',
    ...order.items.map((i) => `• ${i.name} x ${i.quantity} = ${money(i.lineTotal)}`),
    '',
    `*Item total:* ${money(order.itemTotal)}`,
    `*Delivery (${order.distanceKm} km):* ${order.deliveryCharge === 0 ? 'FREE' : money(order.deliveryCharge)}`,
    `*Grand total:* ${money(order.grandTotal)}`,
  ];
  if (order.notes) lines.push('', `*Notes:* ${order.notes}`);
  return lines.join('\n');
}

const digitsOnly = (phone) => String(phone || '').replace(/\D/g, '');

/** wa.me Click-to-Chat link with a pre-filled message (works without any API setup). */
function buildClickToChatLink(whatsappNumber, message) {
  const number = digitsOnly(whatsappNumber);
  if (!number) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * Sends the message via WhatsApp Cloud API (Meta Graph API).
 * NOTE: free-form text messages are only delivered inside a 24-hour customer-service
 * window. Outside that window Meta requires an approved *template* message — see README.
 */
async function sendViaCloudApi(toNumber, message) {
  const { token, phoneNumberId, apiVersion } = env.whatsapp;
  if (!token || !phoneNumberId) return { sent: false, error: 'Cloud API not configured' };

  const to = digitsOnly(toNumber);
  if (!to) return { sent: false, error: 'Shop WhatsApp number not set' };

  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: true, body: message },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text();
      return { sent: false, error: `WhatsApp API ${res.status}: ${body.slice(0, 300)}` };
    }
    return { sent: true, error: '' };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

module.exports = { buildOrderMessage, buildClickToChatLink, sendViaCloudApi };
