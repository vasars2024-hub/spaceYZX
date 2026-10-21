// In-memory "network" between NetCore clients and a GameHub, with a controllable link:
// one-way delay (half the round trip), jitter, and TCP-style loss (a lost packet arrives
// about one round trip late; nothing is ever reordered). Timing comes from the global timer
// functions, so under VirtualTime everything is deterministic.
import type { WebSocket } from 'ws';
import type { SocketLike } from '@space-yz/shared';
import type { GameHub } from '../../packages/server/src/game/hub';

export interface LinkOptions {
  /** round-trip time in ms (split evenly between the two directions) */
  rttMs: number;
  /** random ± variation of each one-way delay, ms */
  jitterMs?: number;
  /** percent of packets that need a retransmit (arrive ~1 RTT late) */
  lossPct?: number;
  seed?: number;
}

/** Small deterministic RNG (mulberry32). */
export const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

class Direction {
  private last = 0;
  constructor(
    private link: LinkOptions,
    private random: () => number,
  ) {}
  /** Delay (ms from now) for the next packet in this direction. */
  delay(): number {
    const { rttMs, jitterMs = 0, lossPct = 0 } = this.link;
    let d = rttMs / 2 + (this.random() - 0.5) * 2 * jitterMs;
    if (this.random() * 100 < lossPct) d += Math.max(40, rttMs);
    const now = performance.now();
    const at = Math.max(now + Math.max(0, d), this.last);
    this.last = at;
    return at - now;
  }
}

type Handler = (...args: unknown[]) => void;

/** Server end, shaped like a `ws` WebSocket as far as GameHub/Conn use it. */
class ServerEnd {
  readonly OPEN = 1;
  readyState = 1;
  private handlers = new Map<string, Handler[]>();
  peer!: ClientEnd;
  constructor(private down: Direction) {}

  on(ev: string, fn: Handler): this {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), fn]);
    return this;
  }

  emit(ev: string, ...args: unknown[]): void {
    for (const fn of this.handlers.get(ev) ?? []) fn(...args);
  }

  send(data: string | Uint8Array): void {
    if (this.readyState !== 1) return;
    const copy: string | ArrayBuffer =
      typeof data === 'string' ? data : new Uint8Array(data).buffer;
    setTimeout(() => this.peer.receive(copy), this.down.delay());
  }

  close(): void {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    setTimeout(() => this.peer.remoteClosed(), this.down.delay());
  }

  terminate(): void {
    this.close();
  }
}

/** Client end: a SocketLike for NetCore. */
class ClientEnd implements SocketLike {
  binaryType = 'arraybuffer';
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  peer!: ServerEnd;
  /** bytes the client sent (for stats) */
  bytesOut = 0;
  constructor(private up: Direction) {}

  send(data: string | ArrayBufferLike | Uint8Array): void {
    if (this.readyState !== 1) return;
    const text = typeof data === 'string';
    const payload = text ? data : Buffer.from(new Uint8Array(data as ArrayBuffer));
    this.bytesOut += text ? data.length : (payload as Buffer).length;
    setTimeout(() => {
      if (this.peer.readyState === 1) this.peer.emit('message', payload, !text);
    }, this.up.delay());
  }

  receive(data: string | ArrayBuffer): void {
    if (this.readyState === 1) this.onmessage?.({ data });
  }

  remoteClosed(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({});
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    setTimeout(() => {
      this.peer.readyState = 3;
      this.peer.emit('close');
    }, this.up.delay());
  }
}

/** Connect a new client socket to the hub through a link. Call from NetCore's createSocket. */
export const connectVirtual = (
  hub: GameHub,
  link: LinkOptions,
  ip: string,
): { socket: SocketLike; setLink: (l: LinkOptions) => void } => {
  const random = rng(link.seed ?? 1);
  const shared: LinkOptions = { ...link };
  const up = new Direction(shared, random);
  const down = new Direction(shared, random);
  const server = new ServerEnd(down);
  const client = new ClientEnd(up);
  server.peer = client;
  client.peer = server;
  // the TCP/WebSocket handshake takes a round trip
  setTimeout(() => {
    hub.accept(server as unknown as WebSocket, ip);
    client.readyState = 1;
    client.onopen?.({});
  }, link.rttMs);
  return {
    socket: client,
    setLink: (l) => Object.assign(shared, l),
  };
};
