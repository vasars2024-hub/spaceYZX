// A virtual clock for deterministic network checks. While installed it replaces
// performance.now, Date.now and the timer functions, and advance() runs the due timers in
// time order — so a real server (GameHub, rooms, clock) and real clients (NetCore) can play
// for minutes in a fraction of a second, with exactly repeatable latency.

interface Timer {
  id: number;
  at: number;
  every: number | null;
  fn: (...args: unknown[]) => void;
  args: unknown[];
}

/** What the fake setTimeout returns: enough of Node's Timeout for our code (unref etc.). */
class FakeHandle {
  constructor(readonly id: number) {}
  unref(): this {
    return this;
  }
  ref(): this {
    return this;
  }
  hasRef(): boolean {
    return true;
  }
  refresh(): this {
    return this;
  }
  [Symbol.toPrimitive](): number {
    return this.id;
  }
}

const EPOCH = 1_750_000_000_000;

export class VirtualTime {
  /** virtual milliseconds since install */
  now = 0;
  private timers = new Map<number, Timer>();
  private nextId = 1;
  private restore: (() => void) | null = null;

  install(): this {
    if (this.restore) return this;
    const g = globalThis as unknown as Record<string, unknown>;
    const perf = globalThis.performance;
    const saved = {
      perfNow: perf.now,
      dateNow: Date.now,
      setTimeout: g.setTimeout,
      clearTimeout: g.clearTimeout,
      setInterval: g.setInterval,
      clearInterval: g.clearInterval,
    };
    perf.now = () => this.now;
    Date.now = () => EPOCH + Math.floor(this.now);
    g.setTimeout = (fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) =>
      this.add(fn, ms ?? 0, null, args);
    g.setInterval = (fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) =>
      this.add(fn, ms ?? 1, Math.max(1, ms ?? 1), args);
    g.clearTimeout = g.clearInterval = (h: unknown) => {
      if (h instanceof FakeHandle) this.timers.delete(h.id);
    };
    this.restore = () => {
      perf.now = saved.perfNow;
      Date.now = saved.dateNow;
      g.setTimeout = saved.setTimeout;
      g.clearTimeout = saved.clearTimeout;
      g.setInterval = saved.setInterval;
      g.clearInterval = saved.clearInterval;
    };
    return this;
  }

  uninstall(): void {
    this.restore?.();
    this.restore = null;
    this.timers.clear();
  }

  private add(
    fn: (...a: unknown[]) => void,
    ms: number,
    every: number | null,
    args: unknown[],
  ): FakeHandle {
    const id = this.nextId++;
    // like Node: delays under 1 ms become 1 ms (so re-arming loops still move time forward)
    this.timers.set(id, { id, at: this.now + Math.max(1, ms), every, fn, args });
    return new FakeHandle(id);
  }

  /** Run everything due in the next `ms` virtual milliseconds, in time order. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      let next: Timer | null = null;
      for (const t of this.timers.values())
        if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && t.id < next.id)))
          next = t;
      if (!next) break;
      this.now = Math.max(this.now, next.at);
      if (next.every !== null) next.at += next.every;
      else this.timers.delete(next.id);
      next.fn(...next.args);
    }
    this.now = target;
  }

  get pending(): number {
    return this.timers.size;
  }
}
