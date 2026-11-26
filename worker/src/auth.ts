import type { AppEnv } from './env';
import { ApiError, json, readJson } from './http';
import { rateLimit } from './ratelimit';
import { fromBase64Url, toBase64Url } from './util';

const ISSUER = 'OrderingApi';
const AUDIENCE = 'OrderingApp';
const ADMIN_ID = 1;

interface TokenPayload {
  sub: string;
  name: string;
  role: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

function jwtSecret(env: AppEnv): string {
  const secret = env.JWT_SECRET ?? '';
  if (new TextEncoder().encode(secret).length < 32) {
    console.error('JWT_SECRET is missing or shorter than 32 characters');
    throw new ApiError(500, 'Server is not configured (JWT_SECRET)');
  }
  return secret;
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function createToken(env: AppEnv, username: string): Promise<{ token: string; expiresAt: string }> {
  const hours = Number(env.JWT_EXPIRES_HOURS) || 12;
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + hours * 3600;
  const payload: TokenPayload = { sub: String(ADMIN_ID), name: username, role: 'Admin', iss: ISSUER, aud: AUDIENCE, iat, exp };

  const unsigned = `${toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${toBase64Url(JSON.stringify(payload))}`;
  const key = await hmacKey(jwtSecret(env));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned)));
  return { token: `${unsigned}.${toBase64Url(signature)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Throws 401 unless the request carries a valid admin token. */
export async function requireAdmin(request: Request, env: AppEnv): Promise<TokenPayload> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const parts = token.split('.');
  if (parts.length !== 3) throw new ApiError(401, 'Authentication required');

  try {
    const key = await hmacKey(jwtSecret(env));
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) throw new Error('bad signature');

    const header = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0]))) as { alg?: string };
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1]))) as TokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'HS256' || payload.iss !== ISSUER || payload.aud !== AUDIENCE) throw new Error('bad claims');
    if (typeof payload.exp !== 'number' || payload.exp + 60 < now) throw new Error('expired');
    if (payload.role !== 'Admin') throw new ApiError(403, 'Forbidden');
    return payload;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, 'Authentication required');
  }
}

/** Compares two strings in constant time (hashing first makes the lengths equal). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

/** POST /api/auth/login — { username, password } → { token, expiresAt, admin } */
export async function login(request: Request, env: AppEnv): Promise<Response> {
  // 10 login attempts per IP per 15 minutes
  await rateLimit(env, request, 'login', 10, 15 * 60_000);

  const body = await readJson(request);
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) throw new ApiError(400, 'Username and password are required');

  const adminUser = (env.ADMIN_USERNAME ?? '').trim();
  const adminPass = env.ADMIN_PASSWORD ?? '';
  if (!adminUser || !adminPass) {
    console.error('ADMIN_USERNAME / ADMIN_PASSWORD secrets are not set');
    throw new ApiError(500, 'Server is not configured (ADMIN_USERNAME / ADMIN_PASSWORD)');
  }

  const userOk = await safeEqual(username.toLowerCase(), adminUser.toLowerCase());
  const passOk = await safeEqual(password, adminPass);
  if (!userOk || !passOk) throw new ApiError(401, 'Invalid username or password');

  const { token, expiresAt } = await createToken(env, adminUser);
  return json({ token, expiresAt, admin: { id: ADMIN_ID, username: adminUser } });
}
