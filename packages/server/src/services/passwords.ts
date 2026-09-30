// Password hashing (scrypt from node:crypto: no native modules) and recovery codes.
// A stored hash reads `scrypt$<log2 N>$<r>$<p>$<salt>$<hash>` (base64url), so the cost can be
// raised later without breaking old hashes. Hashing runs on libuv's thread pool (async), never
// on the game loop. Passwords and codes are never logged or stored in plain text.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export interface ScryptCost {
  /** log2 of N (CPU/memory cost) */
  logN: number;
  r: number;
  p: number;
}

/**
 * N = 2^15, r = 8, p = 1: about 32 MB and ~50–100 ms per hash on a small VPS — slow for an
 * attacker, fine for a login. (Tests use a cheaper cost.)
 */
export const DEFAULT_COST: ScryptCost = { logN: 15, r: 8, p: 1 };
const KEY_LEN = 32;
const SALT_LEN = 16;

const derive = (password: string, salt: Buffer, c: ScryptCost): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const N = 2 ** c.logN;
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LEN,
      { N, r: c.r, p: c.p, maxmem: 256 * N * c.r + 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });

/** Hash a password with a fresh random salt. */
export const hashPassword = async (
  password: string,
  cost: ScryptCost = DEFAULT_COST,
): Promise<string> => {
  const salt = randomBytes(SALT_LEN);
  const key = await derive(password, salt, cost);
  return [
    'scrypt',
    cost.logN,
    cost.r,
    cost.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
};

/** Check a password against a stored hash (constant-time compare). False for a bad hash. */
export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [logN, r, p] = parts.slice(1, 4).map(Number);
  if (![logN, r, p].every((n) => Number.isInteger(n) && n > 0) || logN > 20 || r > 32 || p > 4)
    return false;
  const salt = Buffer.from(parts[4], 'base64url');
  const want = Buffer.from(parts[5], 'base64url');
  if (want.length !== KEY_LEN) return false;
  const got = await derive(password, salt, { logN, r, p });
  return timingSafeEqual(got, want);
};

/**
 * A hash to check against when the username doesn't exist, so a failed login takes as long
 * either way (made once per cost, lazily).
 */
const dummies = new Map<string, Promise<string>>();
export const dummyHash = (cost: ScryptCost = DEFAULT_COST): Promise<string> => {
  const k = `${cost.logN}/${cost.r}/${cost.p}`;
  let d = dummies.get(k);
  if (!d) dummies.set(k, (d = hashPassword(randomBytes(12).toString('hex'), cost)));
  return d;
};

// ------------------------------------------------------------------------------------------
// Recovery codes: 20 random characters (~100 bits) in 4 groups, shown once. They have enough
// entropy that a plain SHA-256 is a safe way to store them.

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const newRecoveryCode = (): string => {
  const bytes = randomBytes(20);
  let s = '';
  for (let i = 0; i < 20; i++) {
    if (i && i % 5 === 0) s += '-';
    s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return s;
};

/** Normalise what the player typed (case, spaces, dashes) before hashing. */
export const normalizeRecoveryCode = (code: string): string =>
  code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 40);

export const hashRecoveryCode = (code: string): string =>
  createHash('sha256')
    .update(`recovery:${normalizeRecoveryCode(code)}`, 'utf8')
    .digest('hex');

/** Constant-time comparison of two hex digests. */
export const sameHash = (a: string, b: string): boolean => {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
};
