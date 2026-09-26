// Network protocol: JSON control messages + binary input/snapshot messages.
// Snapshots carry quantized, delta-compressed public state for everyone, plus an exact
// "private" copy of the recipient's own player and Boomerang so client prediction replays
// bit-for-bit what the server computes.
import type { Vec3 } from '../math/vec3';
import { v3 } from '../math/vec3';
import type { Quat } from '../math/quat';
import { qNormalize } from '../math/quat';
import { BitWriter, BitReader, CodecError } from './codec/bits';
import { defineSchema, type Schema } from './codec/delta';
import { writePos, readPos, uniformVec3Format, snapVec3 } from './codec/quantize';

const GRENADE_POS = uniformVec3Format(-512, 512, 18);
/** A grenade position as the network rounds it. */
export const snapGrenadePos = (v: Vec3): Vec3 => snapVec3(v, GRENADE_POS);
import type { PlayerInput } from '../sim/input';
import { ALL_BUTTONS, BUTTON_BITS } from '../sim/input';
import type { PlayerState, WorldState } from '../sim/state';
import type { BoomerangState, GrenadeState, PowerupPickup } from '../sim/combat-state';
import type { SimEvent } from '../sim/events';
import { createPlayer, newBoomerang } from '../sim/world';
import { defaultConfig } from '../config';

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

// ------------------------------------------------------------------------------------------
// JSON control messages

export type GameMode = '1v1' | '2v2' | '5v5' | 'practice';
/**
 * What a room plays: a GameMode, or Arena 1v1 ('arena': rotating 1v1 duels in separate pits,
 * rules/arena.ts). Kept apart from GameMode so menus listing the match modes stay unchanged.
 */
export type RoomMode = GameMode | 'arena';
export const ROOM_MODES: readonly RoomMode[] = ['1v1', '2v2', '5v5', 'practice', 'arena'];

export interface RoomPlayerInfo {
  id: number;
  name: string;
  team: 0 | 1;
  ping: number;
  bot: boolean;
  ready: boolean;
}

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; token?: string }
  | {
      t: 'createRoom';
      mode: RoomMode;
      map?: string;
      bots?: number;
      botSkill?: string;
      objective?: 'tower' | 'bomb';
      /** 'cs' = CS mode (AK + Deagle, bomb rules, half-speed movement) */
      loadout?: 'lethal' | 'cs';
    }
  | { t: 'joinRoom'; code: string }
  | { t: 'leaveRoom' }
  | { t: 'startMatch' }
  | { t: 'profile' }
  | { t: 'ping'; c: number }
  | { t: 'spong'; s: number }
  /** Ranked queue: '1v1' / '2v2' / '5v5', or 'arena' (with the kit to play it with). */
  | { t: 'queue'; mode: RoomMode; loadout?: 'lethal' | 'cs' }
  | { t: 'unqueue' }
  | { t: 'report'; player: number; reason: string }
  /** While dead: take over this bot teammate's body (Counter-Strike style). */
  | { t: 'takeover'; target: number }
  /** Text chat: `team` = only your team sees it, otherwise everyone in the room. */
  | { t: 'chat'; text: string; team?: boolean }
  /** Voice signaling (WebRTC offer/answer) for one other human in your room. */
  | { t: 'rtc'; to: number; data: RtcSignal }
  /** Push-to-talk state: talking or not, and on which channel. */
  | { t: 'voice'; on: boolean; all: boolean };

/** Voice signaling payload: SDP offers/answers (ICE candidates included), bye/hi. */
export interface RtcSignal {
  kind: 'offer' | 'answer' | 'bye' | 'hi';
  sdp?: string;
}

/** A chat line as the server delivers it. */
export interface ChatLine {
  /** sender's player id in the room */
  id: number;
  from: string;
  team: 0 | 1;
  text: string;
  /** team chat (only the sender's team got it) */
  teamOnly: boolean;
  /** the sender was dead when they wrote it */
  dead: boolean;
}

export type ServerMsg =
  | { t: 'hello'; game: string; protocol: number }
  | { t: 'welcome'; name: string; account?: unknown; token?: string }
  | {
      t: 'roomJoined';
      code: string;
      mode: RoomMode;
      map: string;
      playerId: number;
      tick: number;
      config: unknown;
      ranked: boolean;
    }
  | { t: 'room'; code: string; players: RoomPlayerInfo[]; hostId: number; state: string }
  | { t: 'match'; data: unknown }
  | { t: 'error'; msg: string }
  | { t: 'pong'; c: number; s?: number }
  | { t: 'sping'; s: number }
  /** A message to show the player (warnings, rating changes…). */
  | { t: 'notice'; msg: string }
  /** The server took you out of your room (match over, kicked for griefing…). */
  | { t: 'roomLeft'; reason: string }
  /** Ranked queue status (mode null = not queued). */
  | { t: 'queue'; mode: RoomMode | null; waitSec: number; searching: number; error?: string }
  /** Your account profile (ratings, ranks, recent matches). */
  | { t: 'profile'; data: unknown }
  /** Ping equalization: extra input delay (ticks) this client should apply. */
  | { t: 'netcfg'; inputDelay: number }
  | { t: 'kicked'; reason: string }
  | ({ t: 'chat' } & ChatLine)
  /** Voice signaling from another human in your room. */
  | { t: 'rtc'; from: number; data: RtcSignal }
  /** Someone started/stopped talking (enemies only ever hear about all-channel talk). */
  | { t: 'voice'; from: number; on: boolean; all: boolean };

export const CHAT_MAX_LEN = 140;
/** Longest SDP a voice offer/answer may carry. */
export const RTC_SDP_MAX = 12000;

/**
 * Clean a chat message: control/formatting characters (incl. bidi overrides) removed,
 * combining-mark pile-ups ("zalgo") trimmed, whitespace collapsed. Null when it's empty,
 * not a string or longer than CHAT_MAX_LEN (the client stops you at that length).
 */
export const sanitizeChat = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || raw.length > CHAT_MAX_LEN * 4) return null;
  const clean = raw
    .replace(/[\t\n\r\v\f]/g, ' ')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/gu, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > 0 && clean.length <= CHAT_MAX_LEN ? clean : null;
};

export const parseJson = <T>(data: unknown, maxLen = 8192): T | null => {
  if (typeof data !== 'string' || data.length > maxLen) return null;
  try {
    const v = JSON.parse(data) as unknown;
    return v && typeof v === 'object' ? (v as T) : null;
  } catch {
    return null;
  }
};

export const sanitizeName = (raw: unknown): string => {
  const s = typeof raw === 'string' ? raw : '';
  const clean = s
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _\-.]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return clean.length >= 2 ? clean : `Pilot${Math.floor(Math.abs(hashStr(s)) % 9000) + 1000}`;
};

const hashStr = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
};

// ------------------------------------------------------------------------------------------
// Inputs (client -> server)

export interface InputPacket {
  ack: number; // latest snapshot seq the client has
  inputs: PlayerInput[];
}

/** Quantize a view quaternion exactly the way it travels (float32), so prediction matches. */
export const netView = (q: Quat): Quat => {
  const n = qNormalize(q);
  return { x: Math.fround(n.x), y: Math.fround(n.y), z: Math.fround(n.z), w: Math.fround(n.w) };
};

export const encodeInput = (p: InputPacket): Uint8Array => {
  const w = new BitWriter(64);
  w.writeBits(MSG_INPUT, 8);
  w.writeVarUint(p.ack);
  w.writeBits(Math.min(8, p.inputs.length), 4);
  for (const i of p.inputs.slice(0, 8)) {
    w.writeVarUint(i.tick);
    w.writeBits(i.buttons & ALL_BUTTONS, BUTTON_BITS);
    w.writeFloat32(i.view.x);
    w.writeFloat32(i.view.y);
    w.writeFloat32(i.view.z);
    w.writeFloat32(i.view.w);
    // view lag in quarter ticks (0..63.75 ticks)
    w.writeBits(Math.max(0, Math.min(255, Math.round((i.viewLag ?? 0) * 4))), 8);
  }
  return w.finish();
};

export const decodeInput = (bytes: Uint8Array): InputPacket => {
  const r = new BitReader(bytes);
  if (r.readBits(8) !== MSG_INPUT) throw new CodecError('invalid', 'not an input message');
  const ack = r.readVarUint();
  const n = r.readBits(4);
  const inputs: PlayerInput[] = [];
  for (let k = 0; k < n; k++) {
    const tick = r.readVarUint();
    const buttons = r.readBits(BUTTON_BITS);
    const x = r.readFloat32();
    const y = r.readFloat32();
    const z = r.readFloat32();
    const wq = r.readFloat32();
    const viewLag = r.readBits(8) / 4;
    const l = Math.hypot(x, y, z, wq);
    if (!Number.isFinite(l) || l < 0.5 || l > 1.5) throw new CodecError('invalid', 'bad view');
    inputs.push({ tick, buttons, view: { x, y, z, w: wq }, viewLag });
  }
  return { ack, inputs };
};

// ------------------------------------------------------------------------------------------
// Exact state codec (generic, by template key order) for the private block

const PLAYER_KEYS = Object.keys(
  createPlayer(0, 0, v3(), 0, defaultConfig()),
) as (keyof PlayerState)[];
const BOOMERANG_KEYS = Object.keys(newBoomerang(0, v3())) as (keyof BoomerangState)[];
const GRENADE_KEYS: (keyof GrenadeState)[] = ['id', 'owner', 'pos', 'vel', 'phase', 't'];

const T_INT = 0,
  T_F64 = 1,
  T_FALSE = 2,
  T_TRUE = 3,
  T_NULL = 4,
  T_VEC = 5,
  T_QUAT = 6,
  T_JSON = 7;

const isVec = (o: unknown): o is Vec3 =>
  !!o &&
  typeof o === 'object' &&
  'x' in o &&
  'y' in o &&
  'z' in o &&
  !('w' in o) &&
  Object.keys(o).length === 3;
const isQuat = (o: unknown): o is Quat =>
  !!o &&
  typeof o === 'object' &&
  'x' in o &&
  'y' in o &&
  'z' in o &&
  'w' in o &&
  Object.keys(o).length === 4;

const writeExactValue = (w: BitWriter, v: unknown): void => {
  if (typeof v === 'number') {
    if (Number.isInteger(v) && Math.abs(v) < 2 ** 31 && !Object.is(v, -0)) {
      w.writeBits(T_INT, 3);
      w.writeVarInt(v);
    } else {
      w.writeBits(T_F64, 3);
      w.writeFloat64(v);
    }
  } else if (typeof v === 'boolean') w.writeBits(v ? T_TRUE : T_FALSE, 3);
  else if (v === null || v === undefined) w.writeBits(T_NULL, 3);
  else if (isVec(v)) {
    w.writeBits(T_VEC, 3);
    w.writeFloat64(v.x);
    w.writeFloat64(v.y);
    w.writeFloat64(v.z);
  } else if (isQuat(v)) {
    w.writeBits(T_QUAT, 3);
    w.writeFloat64(v.x);
    w.writeFloat64(v.y);
    w.writeFloat64(v.z);
    w.writeFloat64(v.w);
  } else {
    w.writeBits(T_JSON, 3);
    w.writeString(JSON.stringify(v), 8192);
  }
};

const readExactValue = (r: BitReader): unknown => {
  const t = r.readBits(3);
  switch (t) {
    case T_INT:
      return r.readVarInt();
    case T_F64:
      return r.readFloat64();
    case T_FALSE:
      return false;
    case T_TRUE:
      return true;
    case T_NULL:
      return null;
    case T_VEC:
      return { x: r.readFloat64(), y: r.readFloat64(), z: r.readFloat64() };
    case T_QUAT:
      return { x: r.readFloat64(), y: r.readFloat64(), z: r.readFloat64(), w: r.readFloat64() };
    case T_JSON:
      return JSON.parse(r.readString(8192));
    default:
      throw new CodecError('invalid', 'bad value tag');
  }
};

export const writeExact = <T extends object>(
  w: BitWriter,
  obj: T,
  keys: readonly (keyof T)[],
): void => {
  for (const k of keys) writeExactValue(w, obj[k]);
};

export const readExact = <T extends object>(r: BitReader, keys: readonly (keyof T)[]): T => {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k as string] = readExactValue(r);
  return out as T;
};

// ------------------------------------------------------------------------------------------
// Public (quantized, delta-compressed) schemas

export const PLAYER_SCHEMA = defineSchema([
  { name: 'team', kind: 'uint', bits: 1 },
  { name: 'alive', kind: 'bool' },
  { name: 'hp', kind: 'uint', bits: 8 },
  { name: 'pos', kind: 'pos', min: -512, max: 512, bits: 18 },
  { name: 'vel', kind: 'vel' },
  { name: 'up', kind: 'unit' },
  { name: 'view', kind: 'quat', bits: 11 },
  { name: 'move', kind: 'uint', bits: 3 },
  { name: 'crouched', kind: 'bool' },
  { name: 'grounded', kind: 'bool' },
  { name: 'windup', kind: 'uint', bits: 9 },
  { name: 'windupHeld', kind: 'uint', bits: 9 },
  { name: 'aiming', kind: 'bool' },
  { name: 'laserWarn', kind: 'uint', bits: 5 },
  { name: 'laserCharges', kind: 'uint', bits: 3 },
  { name: 'weapon', kind: 'uint', bits: 1 },
  { name: 'slashTicks', kind: 'uint', bits: 5 },
  { name: 'magOn', kind: 'bool' },
  { name: 'grenadesLeft', kind: 'uint', bits: 2 },
  { name: 'kills', kind: 'uint', bits: 8 },
  { name: 'deaths', kind: 'uint', bits: 8 },
  { name: 'teamKills', kind: 'uint', bits: 6 },
  { name: 'frozen', kind: 'bool' },
  { name: 'dashTicks', kind: 'uint', bits: 5 },
  // power-ups: held one (0 none, 1 Freeze, 2 Double) and Freeze stun ticks left
  { name: 'powerup', kind: 'uint', bits: 2 },
  { name: 'stun', kind: 'uint', bits: 7 },
  { name: 'shield', kind: 'bool' },
] as const);
export type NetPlayer = ReturnType<typeof PLAYER_SCHEMA.decode>;

export const BOOMERANG_SCHEMA = defineSchema([
  { name: 'phase', kind: 'uint', bits: 3 },
  { name: 'controller', kind: 'uint', bits: 8 },
  { name: 'pos', kind: 'pos', min: -512, max: 512, bits: 18 },
  { name: 'vel', kind: 'vel', min: -256, max: 256, bits: 16 },
  { name: 'windup', kind: 'bool' },
  { name: 'recallLethal', kind: 'bool' },
  { name: 'recallFrom', kind: 'pos', min: -512, max: 512, bits: 18 },
  { name: 'recallTo', kind: 'pos', min: -512, max: 512, bits: 18 },
  { name: 'steerLeft', kind: 'uint', bits: 7 },
  { name: 'throwId', kind: 'uint', bits: 24 },
  { name: 't', kind: 'uint', bits: 10 },
  { name: 'explosive', kind: 'bool' },
  /** Quick Throw tilt, (curve + 1) * 32: drawn as the Boomerang banking */
  { name: 'curve', kind: 'uint', bits: 7 },
] as const);
export type NetBoomerang = ReturnType<typeof BOOMERANG_SCHEMA.decode>;

const clampU = (v: number, bits: number): number =>
  Math.max(0, Math.min(2 ** bits - 1, Math.round(v)));

export const toNetPlayer = (p: PlayerState): NetPlayer => ({
  team: p.team,
  alive: p.alive,
  hp: clampU(p.hp, 8),
  pos: p.pos,
  vel: p.vel,
  up: p.up,
  view: p.view,
  move: p.move,
  crouched: p.crouched,
  grounded: p.grounded,
  windup: clampU(p.windup, 9),
  windupHeld: clampU(p.windupHeld, 9),
  aiming: p.aiming,
  laserWarn: clampU(p.laserWarn, 5),
  laserCharges: clampU(p.laserCharges, 3),
  weapon: clampU(p.weapon, 1),
  slashTicks: clampU(p.slashTicks, 5),
  magOn: !!p.mag,
  grenadesLeft: clampU(p.grenadesLeft, 2),
  kills: clampU(p.kills, 8),
  deaths: clampU(p.deaths, 8),
  teamKills: clampU(p.teamKills, 6),
  frozen: p.frozen,
  dashTicks: clampU(p.dashTicks, 5),
  powerup: clampU(p.powerup, 2),
  stun: clampU(p.stun, 7),
  shield: p.shield,
});

export const toNetBoomerang = (b: BoomerangState): NetBoomerang => ({
  phase: b.phase,
  controller: clampU(b.controller, 8),
  pos: b.pos,
  vel: b.vel,
  windup: b.windup,
  recallLethal: b.recallLethal,
  recallFrom: b.recallFrom ?? v3(),
  recallTo: b.recallTo ?? v3(),
  steerLeft: clampU(b.steerLeft, 7),
  throwId: b.throwId % 2 ** 24,
  t: clampU(b.t, 10),
  explosive: b.explosive,
  curve: clampU((b.curve + 1) * 32, 7),
});

// ------------------------------------------------------------------------------------------
// Snapshots (server -> client)

/** A Double-boomerang twin as everyone sees it (position only: it isn't simulated remotely). */
export interface NetTwin {
  id: number;
  owner: number;
  pos: Vec3;
}

export interface SnapshotData {
  seq: number;
  tick: number;
  ackInput: number; // last input tick the server processed for this client
  lead: number; // how many ticks early this client's latest input arrived (negative = late)
  baseline: number; // seq this delta was encoded against (0 = full)
  players: Map<number, NetPlayer>;
  boomerangs: Map<number, NetBoomerang>; // by owner id
  grenades: GrenadeState[];
  /** Double-boomerang twins in flight (always present when decoded) */
  twins?: NetTwin[];
  /** power-ups waiting to be picked up (always present when decoded) */
  powerups?: PowerupPickup[];
  zones: { index: number; dir: Vec3; until: number }[];
  /** private, exact state for the receiving client (every few snapshots): for prediction */
  own: {
    player: PlayerState;
    boomerang: BoomerangState | null;
    /** your own grenades (flight + fuse), so their flight can be predicted exactly */
    grenades?: GrenadeState[];
    /** your own twins in flight (exact), so they predict like your Boomerang */
    twins?: BoomerangState[];
  } | null;
  events: SimEvent[] | null;
  extra: unknown; // rules / match state (JSON), sent when changed
}

export interface SnapshotBaseline {
  players: Map<number, NetPlayer>;
  boomerangs: Map<number, NetBoomerang>;
}

export const encodeSnapshot = (s: SnapshotData, base: SnapshotBaseline | null): Uint8Array => {
  const w = new BitWriter(512);
  w.writeBits(MSG_SNAPSHOT, 8);
  w.writeVarUint(s.seq);
  w.writeVarUint(s.tick);
  w.writeVarUint(s.ackInput);
  w.writeVarInt(Math.max(-1000, Math.min(1000, Math.round(s.lead))));
  w.writeVarUint(base ? s.baseline : 0);
  const writeMap = <T>(m: Map<number, T>, schema: Schema<T>, bm: Map<number, T> | undefined) => {
    w.writeVarUint(m.size);
    for (const [id, obj] of m) {
      w.writeBits(id, 8);
      const b = bm?.get(id);
      w.writeBool(!!b);
      schema.encode(w, obj, b, true); // server snapshot objects are immutable
    }
  };
  writeMap(s.players, PLAYER_SCHEMA, base?.players);
  writeMap(s.boomerangs, BOOMERANG_SCHEMA, base?.boomerangs);
  w.writeVarUint(s.grenades.length);
  for (const g of s.grenades) {
    w.writeVarUint(g.id);
    w.writeBits(g.owner, 8);
    w.writeBits(g.phase, 2);
    writePos(w, g.pos, GRENADE_POS);
  }
  const twins = s.twins ?? [];
  w.writeVarUint(twins.length);
  for (const t of twins) {
    w.writeVarUint(t.id);
    w.writeBits(t.owner, 8);
    writePos(w, t.pos, GRENADE_POS);
  }
  const pups = s.powerups ?? [];
  w.writeVarUint(pups.length);
  for (const u of pups) {
    w.writeVarUint(u.id);
    w.writeBits(u.kind, 2);
    writePos(w, u.pos, GRENADE_POS);
    w.writeVarUint(u.spawnTick);
  }
  w.writeVarUint(s.zones.length);
  for (const z of s.zones) {
    w.writeVarUint(z.index);
    w.writeFloat32(z.dir.x);
    w.writeFloat32(z.dir.y);
    w.writeFloat32(z.dir.z);
    w.writeVarUint(z.until);
  }
  w.writeBool(!!s.own);
  if (s.own) {
    writeExact(w, s.own.player, PLAYER_KEYS);
    w.writeBool(!!s.own.boomerang);
    if (s.own.boomerang) writeExact(w, s.own.boomerang, BOOMERANG_KEYS);
    const og = s.own.grenades ?? [];
    w.writeVarUint(og.length);
    for (const g of og) writeExact(w, g, GRENADE_KEYS);
    const ot = s.own.twins ?? [];
    w.writeVarUint(ot.length);
    for (const t of ot) writeExact(w, t, BOOMERANG_KEYS);
  }
  w.writeBool(!!s.events && s.events.length > 0);
  if (s.events && s.events.length > 0) w.writeString(JSON.stringify(s.events), 60000);
  w.writeBool(s.extra !== undefined && s.extra !== null);
  if (s.extra !== undefined && s.extra !== null) w.writeString(JSON.stringify(s.extra), 60000);
  return w.finish();
};

/** Decode a snapshot; `baselineOf(seq)` returns the client's decoded snapshot for that seq. */
export const decodeSnapshot = (
  bytes: Uint8Array,
  baselineOf: (seq: number) => SnapshotBaseline | null,
): SnapshotData => {
  const r = new BitReader(bytes);
  if (r.readBits(8) !== MSG_SNAPSHOT) throw new CodecError('invalid', 'not a snapshot');
  const seq = r.readVarUint();
  const tick = r.readVarUint();
  const ackInput = r.readVarUint();
  const lead = r.readVarInt();
  const baselineSeq = r.readVarUint();
  const base = baselineSeq ? baselineOf(baselineSeq) : null;
  if (baselineSeq && !base) throw new CodecError('invalid', `missing baseline ${baselineSeq}`);
  const readMap = <T>(schema: Schema<T>, bm: Map<number, T> | undefined): Map<number, T> => {
    const n = r.readVarUint();
    if (n > 64) throw new CodecError('invalid', 'too many entities');
    const m = new Map<number, T>();
    for (let k = 0; k < n; k++) {
      const id = r.readBits(8);
      const hasBase = r.readBool();
      const b = hasBase ? bm?.get(id) : undefined;
      if (hasBase && !b) throw new CodecError('invalid', 'entity missing from baseline');
      m.set(id, schema.decode(r, b));
    }
    return m;
  };
  const players = readMap(PLAYER_SCHEMA, base?.players);
  const boomerangs = readMap(BOOMERANG_SCHEMA, base?.boomerangs);
  const ng = r.readVarUint();
  if (ng > 64) throw new CodecError('invalid', 'too many grenades');
  const grenades: GrenadeState[] = [];
  for (let k = 0; k < ng; k++) {
    const id = r.readVarUint();
    const owner = r.readBits(8);
    const phase = r.readBits(2) as 0 | 1 | 2;
    const pos = readPos(r, GRENADE_POS);
    grenades.push({ id, owner, pos, vel: v3(), phase, t: 0 });
  }
  const nt = r.readVarUint();
  if (nt > 128) throw new CodecError('invalid', 'too many twins');
  const twins: NetTwin[] = [];
  for (let k = 0; k < nt; k++) {
    const id = r.readVarUint();
    const owner = r.readBits(8);
    twins.push({ id, owner, pos: readPos(r, GRENADE_POS) });
  }
  const np = r.readVarUint();
  if (np > 16) throw new CodecError('invalid', 'too many power-ups');
  const powerups: PowerupPickup[] = [];
  for (let k = 0; k < np; k++) {
    const id = r.readVarUint();
    const kind = r.readBits(2);
    if (kind !== 1 && kind !== 2) throw new CodecError('invalid', 'bad power-up');
    const pos = readPos(r, GRENADE_POS);
    powerups.push({ id, kind, pos, spawnTick: r.readVarUint() });
  }
  const nz = r.readVarUint();
  if (nz > 64) throw new CodecError('invalid', 'too many zones');
  const zones: SnapshotData['zones'] = [];
  for (let k = 0; k < nz; k++) {
    const index = r.readVarUint();
    const dir = { x: r.readFloat32(), y: r.readFloat32(), z: r.readFloat32() };
    const until = r.readVarUint();
    zones.push({ index, dir, until });
  }
  let own: SnapshotData['own'] = null;
  if (r.readBool()) {
    const player = readExact<PlayerState>(r, PLAYER_KEYS);
    const boomerang = r.readBool() ? readExact<BoomerangState>(r, BOOMERANG_KEYS) : null;
    const n = r.readVarUint();
    if (n > 16) throw new CodecError('invalid', 'too many own grenades');
    const grenades: GrenadeState[] = [];
    for (let k = 0; k < n; k++) grenades.push(readExact<GrenadeState>(r, GRENADE_KEYS));
    const n2 = r.readVarUint();
    if (n2 > 32) throw new CodecError('invalid', 'too many own twins');
    const twins: BoomerangState[] = [];
    for (let k = 0; k < n2; k++) twins.push(readExact<BoomerangState>(r, BOOMERANG_KEYS));
    own = { player, boomerang, grenades, twins };
  }
  const events = r.readBool() ? (JSON.parse(r.readString(60000)) as SimEvent[]) : null;
  const extra = r.readBool() ? (JSON.parse(r.readString(60000)) as unknown) : null;
  return {
    seq,
    tick,
    ackInput,
    lead,
    baseline: baselineSeq,
    players,
    boomerangs,
    grenades,
    twins,
    powerups,
    zones,
    own,
    events,
    extra,
  };
};

/** Build the public part of a snapshot from the world. */
export const publicState = (
  world: WorldState,
): { players: Map<number, NetPlayer>; boomerangs: Map<number, NetBoomerang> } => {
  const players = new Map<number, NetPlayer>();
  for (const p of world.players) players.set(p.id, PLAYER_SCHEMA.quantize(toNetPlayer(p)));
  const boomerangs = new Map<number, NetBoomerang>();
  for (const b of world.boomerangs)
    boomerangs.set(b.owner, BOOMERANG_SCHEMA.quantize(toNetBoomerang(b)));
  return { players, boomerangs };
};

export const zoneOverrides = (world: WorldState): SnapshotData['zones'] =>
  world.zones.flatMap((z, index) =>
    z.override ? [{ index, dir: z.override, until: z.until }] : [],
  );
