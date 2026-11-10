import { createHash, randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(derive);
const cookieName = '__Host-team_unit_admin';
export const sessionSeconds = 3600;

export function sessionCookie(token, maxAge = sessionSeconds) {
  return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function tokenDigest(request) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-team_unit_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
  return token && digest(token);
}

function digest(token) {
  return createHash('sha256').update(token).update(verifier()).digest('hex');
}

function verifier() {
  const value = process.env.ADMIN_PASSWORD_VERIFIER || '';
  if (!/^[a-f0-9]{48}:[a-f0-9]{64}$/.test(value)) throw new Error('Admin access is not configured');
  return value;
}

export async function passwordMatches(password) {
  const [salt, hash] = verifier().split(':');
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) return false;
  const actual = await scrypt(password, salt, 32);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

export async function createSession(sql) {
  const token = randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + sessionSeconds * 1000).toISOString();
  await sql.transaction([
    sql`DELETE FROM unit_admin_sessions WHERE expires_at <= now()`,
    sql`INSERT INTO unit_admin_sessions (token_hash, expires_at) VALUES (${digest(token)}, ${expiry})`,
  ]);
  return token;
}
