// One client connection: rate limiting, message helpers, RTT tracking.
import type { WebSocket } from 'ws';
import type { ServerMsg } from '@space-yz/shared';

let nextConnId = 1;

export class Conn {
  readonly id = nextConnId++;
  name = '';
  ip: string;
  accountId: number | null = null;
  helloDone = false;
  roomCode: string | null = null;
  playerId: number | null = null;
  rttMs = 0;
  jitterMs = 0;
  private tokens = 240;
  private lastRefill = performance.now();
  private strikes = 0;
  closed = false;
  /** when the client last sent anything (performance.now ms): silent connections are dropped */
  lastHeard = performance.now();
  /** Server-side network simulator (dev): extra one-way delay applied to outgoing messages. */
  simDelayMs = 0;
  simJitterMs = 0;

  constructor(
    readonly ws: WebSocket,
    ip: string,
  ) {
    this.ip = ip;
  }

  /** Token bucket: ~240 messages/s sustained (60 inputs + control), burst 240. */
  allowMessage(): boolean {
    const now = performance.now();
    this.lastHeard = now;
    this.tokens = Math.min(240, this.tokens + ((now - this.lastRefill) / 1000) * 240);
    this.lastRefill = now;
    if (this.tokens < 1) {
      if (++this.strikes > 200) this.kick('Too many messages');
      return false;
    }
    this.tokens -= 1;
    return true;
  }

  /** Invalid data from the client: a few are tolerated, then the client is kicked. */
  strike(reason: string): void {
    this.strikes += 10;
    if (this.strikes > 200) this.kick(`Invalid data (${reason})`);
  }

  sendJson(msg: ServerMsg): void {
    this.sendRaw(JSON.stringify(msg));
  }

  sendBinary(bytes: Uint8Array): void {
    this.sendRaw(bytes);
  }

  sendRaw(data: string | Uint8Array): void {
    if (this.closed || this.ws.readyState !== this.ws.OPEN) return;
    if (this.simDelayMs > 0 || this.simJitterMs > 0) {
      const d = Math.max(0, this.simDelayMs + (Math.random() - 0.5) * 2 * this.simJitterMs);
      setTimeout(() => {
        if (!this.closed && this.ws.readyState === this.ws.OPEN) this.ws.send(data);
      }, d);
      return;
    }
    this.ws.send(data);
  }

  /** Update RTT estimate from a server-initiated ping echo. */
  onPong(sentAt: number): void {
    const rtt = performance.now() - sentAt;
    if (rtt < 0 || rtt > 10000) return;
    if (this.rttMs === 0) this.rttMs = rtt;
    const diff = Math.abs(rtt - this.rttMs);
    this.jitterMs = this.jitterMs * 0.8 + diff * 0.2;
    this.rttMs = this.rttMs * 0.8 + rtt * 0.2;
  }

  kick(reason: string): void {
    if (this.closed) return;
    this.sendJson({ t: 'kicked', reason });
    this.closed = true;
    setTimeout(() => this.ws.close(4000, reason.slice(0, 100)), 50);
  }
}
