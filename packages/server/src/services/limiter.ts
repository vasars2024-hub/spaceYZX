// Attempt limits (in memory: they reset when the server restarts, which is fine for one VPS).
// Used for logins / recovery (per address and per username, whether or not it exists), sign-ups
// and friend requests. After `max` attempts in `windowMs` a key is locked for `lockMs`, and each
// further lockout in a row doubles that (up to `maxLockMs`).

export interface LimitRule {
  max: number;
  windowMs: number;
  lockMs: number;
  maxLockMs: number;
}

/** Logins: 5 tries per 5 minutes, then 5, 10, 20… minutes (at most an hour). */
export const LOGIN_LIMIT: LimitRule = {
  max: 5,
  windowMs: 5 * 60_000,
  lockMs: 5 * 60_000,
  maxLockMs: 60 * 60_000,
};

interface Entry {
  hits: number;
  windowStart: number;
  lockedUntil: number;
  lockouts: number;
  last: number;
}

export class Limiter {
  private map = new Map<string, Entry>();

  constructor(
    private rule: LimitRule,
    private now: () => number = Date.now,
  ) {}

  /** Milliseconds this key is still locked for (0 = go ahead). */
  lockedFor(key: string): number {
    const e = this.map.get(key);
    return e ? Math.max(0, e.lockedUntil - this.now()) : 0;
  }

  /** Count one attempt (a failed login, a request sent). Returns the lock time now (0 = none). */
  hit(key: string): number {
    const t = this.now();
    let e = this.map.get(key);
    if (!e)
      this.map.set(key, (e = { hits: 0, windowStart: t, lockedUntil: 0, lockouts: 0, last: t }));
    // a quiet hour forgives earlier lockouts
    if (t - e.last > 60 * 60_000) e.lockouts = 0;
    e.last = t;
    if (t - e.windowStart > this.rule.windowMs) {
      e.hits = 0;
      e.windowStart = t;
    }
    e.hits++;
    if (e.hits >= this.rule.max) {
      e.lockedUntil =
        t + Math.min(this.rule.maxLockMs, this.rule.lockMs * 2 ** Math.min(10, e.lockouts));
      e.lockouts++;
      e.hits = 0;
      e.windowStart = t;
    }
    this.prune(t);
    return Math.max(0, e.lockedUntil - t);
  }

  /** Forget a key's failures (a successful login). Lockout history stays. */
  clear(key: string): void {
    const e = this.map.get(key);
    if (e) e.hits = 0;
  }

  private prune(t: number): void {
    if (this.map.size < 5000) return;
    for (const [k, e] of this.map)
      if (e.lockedUntil < t && t - e.last > this.rule.windowMs * 2) this.map.delete(k);
  }
}

/** "Try again in 3 minutes." */
export const waitText = (ms: number): string => {
  const min = Math.ceil(ms / 60_000);
  return min <= 1 ? 'Try again in a minute.' : `Try again in ${min} minutes.`;
};
