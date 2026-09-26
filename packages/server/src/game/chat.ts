// Text chat, push-to-talk state and voice signaling between the humans in a room.
// Voice audio itself goes peer to peer (WebRTC); the server only relays the offers/answers
// and who is talking. Bots never chat.
import type { RtcSignal, ServerMsg } from '@space-yz/shared';
import { sanitizeChat, RTC_SDP_MAX } from '@space-yz/shared';
import type { Conn } from './conn';
import type { Member, Room } from './room';

/** Chat: at most this many messages per window per connection. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 5000;
/** Voice signaling + talk state: token bucket per connection. */
const SIGNAL_BURST = 120;
const SIGNAL_PER_SEC = 20;

interface ConnChat {
  /** send times of recent chat messages (performance.now ms) */
  sent: number[];
  /** told the sender to slow down in this window */
  warned: boolean;
  tokens: number;
  refill: number;
  /** talk state as last announced, and the room it was in */
  voice: { room: string; on: boolean; all: boolean };
}

const perConn = new WeakMap<Conn, ConnChat>();

const stateOf = (conn: Conn): ConnChat => {
  let s = perConn.get(conn);
  if (!s) {
    s = {
      sent: [],
      warned: false,
      tokens: SIGNAL_BURST,
      refill: performance.now(),
      voice: { room: '', on: false, all: false },
    };
    perConn.set(conn, s);
  }
  return s;
};

const allowSignal = (s: ConnChat): boolean => {
  const now = performance.now();
  s.tokens = Math.min(SIGNAL_BURST, s.tokens + ((now - s.refill) / 1000) * SIGNAL_PER_SEC);
  s.refill = now;
  if (s.tokens < 1) return false;
  s.tokens -= 1;
  return true;
};

const memberOf = (room: Room, conn: Conn): Member | null => {
  const m = conn.playerId === null ? undefined : room.members.get(conn.playerId);
  return m && m.conn === conn ? m : null;
};

/** A chat message: team chat reaches the sender's team, all chat everyone in the room. */
export const relayChat = (room: Room, conn: Conn, rawText: unknown, rawTeam: unknown): void => {
  const m = memberOf(room, conn);
  if (!m) return;
  if (typeof rawText !== 'string') return conn.strike('chat');
  const s = stateOf(conn);
  const now = performance.now();
  s.sent = s.sent.filter((t) => now - t < CHAT_WINDOW_MS);
  if (s.sent.length >= CHAT_BURST) {
    if (!s.warned)
      conn.sendJson({
        t: 'notice',
        msg: 'Slow down — chat is limited to 5 messages every 5 seconds.',
      });
    s.warned = true;
    return;
  }
  const text = sanitizeChat(rawText);
  if (text === null) return;
  s.sent.push(now);
  s.warned = false;
  const teamOnly = rawTeam === true;
  const dead = room.world.players.find((p) => p.id === m.id)?.alive === false;
  const msg: ServerMsg = {
    t: 'chat',
    id: m.id,
    from: m.name,
    team: m.team,
    text,
    teamOnly,
    dead,
  };
  for (const r of room.humans) if (!teamOnly || r.team === m.team) r.conn?.sendJson(msg);
};

/** Voice signaling: only to one other human in the same room, and only a known shape. */
export const relayRtc = (room: Room, conn: Conn, to: unknown, raw: unknown): void => {
  const m = memberOf(room, conn);
  if (!m) return;
  if (typeof to !== 'number' || !raw || typeof raw !== 'object') return conn.strike('rtc');
  const d = raw as Partial<RtcSignal>;
  const kind = d.kind;
  if (kind !== 'offer' && kind !== 'answer' && kind !== 'bye' && kind !== 'hi')
    return conn.strike('rtc');
  const hasSdp = kind === 'offer' || kind === 'answer';
  if (hasSdp && (typeof d.sdp !== 'string' || d.sdp.length > RTC_SDP_MAX))
    return conn.strike('rtc');
  if (!allowSignal(stateOf(conn))) return;
  const target = room.members.get(to);
  if (!target?.conn || target.id === m.id) return;
  const data: RtcSignal = hasSdp ? { kind, sdp: d.sdp } : { kind };
  target.conn.sendJson({ t: 'rtc', from: m.id, data });
};

/**
 * Push-to-talk state. Teammates hear about both channels; enemies only ever learn about
 * all-channel talk (team talk stays secret, like the audio itself).
 */
export const relayVoice = (room: Room, conn: Conn, rawOn: unknown, rawAll: unknown): void => {
  const m = memberOf(room, conn);
  if (!m) return;
  const s = stateOf(conn);
  if (!allowSignal(s)) return;
  const on = rawOn === true;
  const all = on && rawAll === true;
  const prev = s.voice.room === room.code ? s.voice : { on: false, all: false };
  s.voice = { room: room.code, on, all };
  const enemyWas = prev.on && prev.all;
  const enemyNow = on && all;
  for (const r of room.humans) {
    if (r.id === m.id || !r.conn) continue;
    if (r.team === m.team) r.conn.sendJson({ t: 'voice', from: m.id, on, all });
    else if (enemyWas !== enemyNow)
      r.conn.sendJson({ t: 'voice', from: m.id, on: enemyNow, all: true });
  }
};
