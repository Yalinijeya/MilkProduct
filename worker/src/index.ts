/**
 * Cloudflare Worker = the shop's backend (replaces the old C# ASP.NET Core API).
 *
 *  /api/*       → handled below (data in D1, photos in KV)
 *  /uploads/*   → product photos from KV
 *  everything else → the Angular app (static assets, configured in wrangler.jsonc)
 */
import { login, requireAdmin } from './auth';
import type { AppEnv } from './env';
import { ApiError, errorResponse, json } from './http';
import { createItem, deleteItem, listAll, listAvailable, servePhoto, updateItem } from './items';
import { notificationStatus, sendTestNotification } from './notify';
import { listOrders, orderChanges, placeOrder, updateOrderStatus } from './orders';
import { getSettings, updateSettings } from './settings';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path.startsWith('/uploads/') && (request.method === 'GET' || request.method === 'HEAD')) {
      return servePhoto(request, env, decodeURIComponent(path.slice('/uploads/'.length)));
    }
    if (path === '/api' || path.startsWith('/api/')) {
      try {
        return await handleApi(request, env, ctx, url, path);
      } catch (err) {
        return errorResponse(err);
      }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<AppEnv>;

async function handleApi(request: Request, env: AppEnv, ctx: ExecutionContext, url: URL, path: string): Promise<Response> {
  const method = request.method;
  const admin = () => requireAdmin(request, env);
  let m: RegExpMatchArray | null;

  // ---------- public ----------
  if (path === '/api/health' && method === 'GET') return json({ status: 'ok' });
  if (path === '/api/auth/login' && method === 'POST') return login(request, env);
  if (path === '/api/items' && method === 'GET') return listAvailable(env);
  if (path === '/api/settings' && method === 'GET') return getSettings(env);
  if (path === '/api/orders' && method === 'POST') return placeOrder(request, env, ctx);

  // ---------- admin ----------
  if (path === '/api/items' && method === 'POST') return admin().then(() => createItem(request, env));
  if ((m = path.match(/^\/api\/items\/(\d+)$/))) {
    const id = Number(m[1]);
    if (method === 'PUT') return admin().then(() => updateItem(request, env, id));
    if (method === 'DELETE') return admin().then(() => deleteItem(env, id));
  }
  if (path === '/api/admin/items' && method === 'GET') return admin().then(() => listAll(env));

  if (path === '/api/orders' && method === 'GET') return admin().then(() => listOrders(url, env));
  if ((m = path.match(/^\/api\/orders\/(\d+)\/status$/)) && method === 'PATCH') {
    const id = Number(m[1]);
    return admin().then(() => updateOrderStatus(request, env, id));
  }
  if (path === '/api/admin/orders/changes' && method === 'GET') return admin().then(() => orderChanges(url, env));

  if (path === '/api/settings' && method === 'PUT') return admin().then(() => updateSettings(request, env));
  if (path === '/api/admin/notifications' && method === 'GET') return admin().then(() => notificationStatus(env));
  if (path === '/api/admin/notifications/test' && method === 'POST') return admin().then(() => sendTestNotification(env));

  throw new ApiError(404, 'Not found');
}
