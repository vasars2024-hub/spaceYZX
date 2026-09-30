// Drives every room at a fixed 60 Hz. Catches up after timer hiccups (Windows timers can be
// ~15 ms coarse), but never runs more than a few ticks at once; if far behind, it resyncs.
import { TICK_DT } from '@space-yz/shared';

export interface Tickable {
  tick(): void;
  closed: boolean;
}

export class Clock {
  private items = new Set<Tickable>();
  private start = performance.now();
  private done = 0;
  private timer: NodeJS.Timeout | null = null;
  /** ms spent inside ticks during the last second (for the host dashboard) */
  busyMs = 0;
  private busyAcc = 0;
  private busyWindowStart = performance.now();

  add(t: Tickable): void {
    this.items.add(t);
    if (!this.timer) this.loop();
  }

  remove(t: Tickable): void {
    this.items.delete(t);
  }

  get count(): number {
    return this.items.size;
  }

  private loop = (): void => {
    const now = performance.now();
    const due = Math.floor((now - this.start) / (TICK_DT * 1000));
    let n = due - this.done;
    if (n > 6) {
      // too far behind (machine asleep / heavy stall): skip ahead
      this.done = due - 1;
      n = 1;
    }
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      for (const it of this.items) {
        if (it.closed) {
          this.items.delete(it);
          continue;
        }
        try {
          it.tick();
        } catch (err) {
          console.error('room tick failed:', err);
        }
      }
      this.done++;
    }
    this.busyAcc += performance.now() - t0;
    if (now - this.busyWindowStart >= 1000) {
      this.busyMs = this.busyAcc;
      this.busyAcc = 0;
      this.busyWindowStart = now;
    }
    if (this.items.size === 0) {
      this.timer = null;
      return;
    }
    const next = this.start + (this.done + 1) * TICK_DT * 1000;
    this.timer = setTimeout(this.loop, Math.max(0, next - performance.now() - 1));
  };

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.items.clear();
  }
}
