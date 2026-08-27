const COOKIE_NAME = 'staff_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export { COOKIE_NAME, SESSION_TTL_MS };

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToHex(signature);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(digest);
}

export async function passwordMatches(given: string, expected: string): Promise<boolean> {
  if (!expected) {
    return false;
  }
  const [givenHash, expectedHash] = await Promise.all([sha256Hex(given), sha256Hex(expected)]);
  return timingSafeEqualHex(givenHash, expectedHash);
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
  const expiresAt = String(now + SESSION_TTL_MS);
  const payload = `v1.${expiresAt}`;
  const signature = await hmacHex(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now()
): Promise<boolean> {
  if (!token || !secret) {
    return false;
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return false;
  }
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return false;
  }
  const payload = `v1.${parts[1]}`;
  const expected = await hmacHex(secret, payload);
  return timingSafeEqualHex(parts[2], expected);
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
