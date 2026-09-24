// GameHub: connections <-> rooms. Handles control messages, rate limits and validation.
// Accounts, ranked matchmaking and the host dashboard plug in through HubServices.
import type { WebSocket } from 'ws';
import type { ClientMsg, GameMode, GameConfig } from '@space-yz/shared';
import {
  PROTOCOL_VERSION,
  GAME_NAME,
  MSG_INPUT,
  decodeInput,
  parseJson,
  sanitizeName,
  getMap,
  MAPS,
  defaultConfig,
} from '@space-yz/shared';
import { Conn } from './conn';
import { Room, makeRoomCode, type Rules } from './room';
import { Clock } from './clock';
import { PracticeRules } from './rules/practice';
import { MatchRules, type MatchResult } from './rules/match';

export interface HubServices {
  /** Authenticate / create an account from a hello message; returns display name + token. */
  login?(
    conn: Conn,
    name: string,
    token: string | undefined,
  ): { name: string; accountId: number; token: string; account: unknown } | null;
  /** Rules for a room (M5 match rules). Defaults to practice. */
  rulesFor?(room: Room, opts: { bots: number }): Rules;
  /** Ranked queue (M8). */
  queue?(hub: GameHub, conn: Conn, mode: GameMode | null): void;
  onDisconnect?(hub: GameHub, conn: Conn): void;
  /** Called for every finished match (M8 records results). */
  onMatchEnd?(room: Room, result: MatchResult): void;
  /** Anti-grief: a warning was given / a player was kicked (ranked bans live here). */
  onGrief?(conn: Conn, action: 'warn' | 'kick', reason: string, room: Room): void;
  /** The player's profile (ratings, ranks) for the client. */
  profile?(conn: Conn): unknown;
  /** A player reported another player. */
  onReport?(conn: Conn, player: number, reason: string, room: Room): void;
  /** lag compensation (default on) */
  lagComp?: boolean;
  /** ping equalization: low-ping players get up to this much input delay (ms, 0 = off) */
  equalizeMaxMs?: number;
  config?: () => GameConfig;
  log?: (msg: string) => void;
}

const MAX_CONNS_PER_IP = 12;
const MAX_ROOMS = 200;

export class GameHub {
  conns = new Set<Conn>();
  rooms = new Map<string, Room>();
  clock = new Clock();
  private pingTimer: NodeJS.Timeout;
  kickedIps = new Map<string, number>();

  constructor(public services: HubServices = {}) {
    this.pingTimer = setInterval(() => this.pingAll(), 1000);
  }

  private log(msg: string): void {
    (this.services.log ?? console.log)(msg);
  }

  accept(ws: WebSocket, ip: string): void {
    const sameIp = [...this.conns].filter((c) => c.ip === ip).length;
    const bannedUntil = this.kickedIps.get(ip) ?? 0;
    if (sameIp >= MAX_CONNS_PER_IP || Date.now() < bannedUntil) {
      ws.close(1013, 'Too many connections');
      return;
    }
    const conn = new Conn(ws, ip);
    this.conns.add(conn);
    conn.sendJson({ t: 'hello', game: GAME_NAME, protocol: PROTOCOL_VERSION });
    ws.on('message', (data, isBinary) => {
      if (!conn.allowMessage()) return;
      try {
        if (isBinary) this.onBinary(conn, data as Buffer);
        else this.onJson(conn, String(data));
      } catch (err) {
        conn.strike(String(err).slice(0, 60));
      }
    });
    ws.on('close', () => this.onClose(conn));
    ws.on('error', () => this.onClose(conn));
  }

  private onBinary(conn: Conn, data: Buffer): void {
    if (data.length < 1 || data.length > 1024) return conn.strike('size');
    if (data[0] !== MSG_INPUT) return conn.strike('type');
    const room = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
    if (!room || conn.playerId === null) return;
    const pkt = decodeInput(new Uint8Array(data.buffer, data.byteOffset, data.length));
    room.receiveInputs(conn.playerId, pkt.ack, pkt.inputs);
  }

  private onJson(conn: Conn, text: string): void {
    const msg = parseJson<ClientMsg>(text);
    if (!msg || typeof msg.t !== 'string') return conn.strike('json');
    switch (msg.t) {
      case 'ping':
        if (typeof msg.c === 'number')
          conn.sendJson({ t: 'pong', c: msg.c, s: Math.round(performance.now()) });
        return;
      case 'spong':
        if (typeof msg.s === 'number') conn.onPong(msg.s);
        return;
      case 'hello': {
        if (msg.v !== PROTOCOL_VERSION) {
          conn.sendJson({ t: 'error', msg: 'Your game is out of date — please refresh the page.' });
          return;
        }
        const name = sanitizeName(msg.name);
        const login = this.services.login?.(
          conn,
          name,
          typeof msg.token === 'string' ? msg.token : undefined,
        );
        conn.name = login?.name ?? name;
        conn.accountId = login?.accountId ?? null;
        conn.helloDone = true;
        conn.sendJson({
          t: 'welcome',
          name: conn.name,
          account: login?.account,
          token: login?.token,
        });
        return;
      }
    }
    if (!conn.helloDone) return conn.strike('no hello');
    switch (msg.t) {
      case 'createRoom': {
        const mode: GameMode = ['1v1', '2v2', '5v5', 'practice'].includes(msg.mode)
          ? msg.mode
          : 'practice';
        const map = MAPS.some((m) => m.id === msg.map) ? (msg.map as string) : getMap('').id;
        const bots = Math.max(0, Math.min(9, Math.floor(Number(msg.bots) || 0)));
        const room = this.createRoom({
          mode,
          map,
          bots,
          botSkill: typeof msg.botSkill === 'string' ? msg.botSkill : 'normal',
        });
        if (!room) return conn.sendJson({ t: 'error', msg: 'The server is full right now.' });
        this.joinRoom(conn, room);
        return;
      }
      case 'joinRoom': {
        const code = String(msg.code ?? '')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 6);
        const room = this.rooms.get(code);
        if (!room) return conn.sendJson({ t: 'error', msg: `No room with code ${code}.` });
        if (room.humans.length >= room.maxPlayers)
          return conn.sendJson({ t: 'error', msg: 'That room is full.' });
        if (room.ranked) return conn.sendJson({ t: 'error', msg: 'That is a ranked match.' });
        this.joinRoom(conn, room);
        return;
      }
      case 'leaveRoom':
        this.leaveRoom(conn);
        return;
      case 'profile':
        conn.sendJson({ t: 'profile', data: this.services.profile?.(conn) ?? null });
        return;
      case 'startMatch': {
        const room = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
        if (!room || room.hostId !== conn.playerId || room.ranked) return;
        if (room.rules instanceof MatchRules) {
          const err = room.rules.requestStart(room);
          if (err) conn.sendJson({ t: 'error', msg: err });
        }
        return;
      }
      case 'queue':
      case 'unqueue':
        this.services.queue?.(this, conn, msg.t === 'queue' ? msg.mode : null);
        return;
      case 'report': {
        const room = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
        if (room && typeof msg.player === 'number')
          this.services.onReport?.(conn, msg.player, String(msg.reason ?? '').slice(0, 200), room);
        return;
      }
      case 'chat':
        return; // no chat yet
      default:
        conn.strike('unknown');
    }
  }

  createRoom(opts: {
    mode: GameMode;
    map: string;
    bots?: number;
    botSkill?: string;
    ranked?: boolean;
    config?: GameConfig;
  }): Room | null {
    if (this.rooms.size >= MAX_ROOMS) return null;
    let code = makeRoomCode();
    while (this.rooms.has(code)) code = makeRoomCode();
    const room = new Room({
      code,
      mode: opts.mode,
      map: opts.map,
      ranked: opts.ranked,
      config: opts.config ?? this.services.config?.() ?? defaultConfig(),
      lagComp: this.services.lagComp ?? true,
    });
    const rules: Rules =
      this.services.rulesFor?.(room, { bots: opts.bots ?? 0 }) ??
      (opts.mode === 'practice' ? new PracticeRules() : new MatchRules(opts.mode));
    room.rules = rules;
    if (rules instanceof MatchRules) {
      rules.onGrief = (r, m, action, reason) => {
        const conn = m.conn;
        if (!conn) return;
        this.log(`Room ${r.code}: ${action} ${m.name} — ${reason}`);
        this.services.onGrief?.(conn, action, reason, r);
        if (action === 'warn') conn.sendJson({ t: 'notice', msg: reason });
        else this.removeFromRoom(conn, reason);
      };
      rules.onFinished = (r) => {
        for (const m of r.humans) if (m.conn) this.removeFromRoom(m.conn, 'Match over');
        if (this.rooms.has(r.code)) this.closeRoom(r);
      };
    }
    if (rules instanceof MatchRules)
      rules.onResult = (r, result) => {
        this.log(
          `Room ${r.code}: match over — ${result.winner === null ? 'draw' : `team ${result.winner === 0 ? 'cyan' : 'orange'} wins`} ${result.scores[0]}-${result.scores[1]} (${result.reason})`,
        );
        this.services.onMatchEnd?.(r, result);
      };
    (rules as Rules).setup?.(room);
    room.onChanged = () => this.broadcastRoom(room);
    for (let i = 0; i < (opts.bots ?? 0); i++)
      room.addMember(`Bot ${i + 1}`, null, { botSkill: opts.botSkill });
    this.rooms.set(code, room);
    this.clock.add(room);
    this.log(`Room ${code} created (${opts.mode}, ${opts.map}${opts.ranked ? ', ranked' : ''})`);
    return room;
  }

  joinRoom(conn: Conn, room: Room, team?: 0 | 1): void {
    this.leaveRoom(conn);
    const m = room.addMember(conn.name, conn, { team, accountId: conn.accountId });
    conn.roomCode = room.code;
    conn.playerId = m.id;
    conn.sendJson({
      t: 'roomJoined',
      code: room.code,
      mode: room.mode,
      map: room.map,
      playerId: m.id,
      tick: room.world.tick,
      config: room.ctx.config,
      ranked: room.ranked,
    });
    this.broadcastRoom(room);
  }

  /** Take a player out of their room from the server side and tell them why. */
  removeFromRoom(conn: Conn, reason: string): void {
    if (!conn.roomCode) return;
    this.leaveRoom(conn);
    conn.sendJson({ t: 'roomLeft', reason });
  }

  leaveRoom(conn: Conn): void {
    if (!conn.roomCode) return;
    const room = this.rooms.get(conn.roomCode);
    if (room && conn.playerId !== null) room.removeMember(conn.playerId);
    conn.roomCode = null;
    conn.playerId = null;
    if (room && room.humans.length === 0) this.closeRoom(room);
  }

  closeRoom(room: Room): void {
    room.close();
    this.clock.remove(room);
    this.rooms.delete(room.code);
    for (const m of room.humans) {
      if (m.conn) {
        m.conn.roomCode = null;
        m.conn.playerId = null;
      }
    }
    this.log(`Room ${room.code} closed`);
  }

  broadcastRoom(room: Room): void {
    const msg = {
      t: 'room' as const,
      code: room.code,
      players: room.info(),
      hostId: room.hostId,
      state: room.rules?.name ?? 'practice',
    };
    for (const m of room.humans) m.conn?.sendJson(msg);
  }

  private onClose(conn: Conn): void {
    if (!this.conns.has(conn)) return;
    conn.closed = true;
    this.leaveRoom(conn);
    this.services.onDisconnect?.(this, conn);
    this.conns.delete(conn);
  }

  private pingAll(): void {
    const s = Math.round(performance.now());
    const ping = JSON.stringify({ t: 'sping', s });
    for (const c of this.conns) c.sendRaw(ping);
    for (const room of this.rooms.values()) {
      if (!room.humans.length) continue;
      this.broadcastRoom(room);
      this.equalize(room);
    }
  }

  /**
   * Ping equalization: players with a much lower ping than the slowest human in the room get
   * a small input delay (capped, default 30 ms) so fights feel fairer. Changes need 3 agreeing
   * evaluations in a row so the delay doesn't flap.
   */
  equalize(room: Room): void {
    const maxMs = this.services.equalizeMaxMs ?? 30;
    const humans = room.humans.filter((m) => m.conn && m.conn.rttMs > 0);
    const worst = Math.min(200, Math.max(0, ...humans.map((m) => m.conn!.rttMs)));
    const tickMs = 1000 / 60;
    for (const m of humans) {
      const extraMs = humans.length < 2 ? 0 : Math.min(maxMs, (worst - m.conn!.rttMs) / 2);
      const want = Math.max(0, Math.floor(extraMs / tickMs));
      if (want === m.equalizeTicks) {
        m.equalizeVotes = 0;
        continue;
      }
      if (++m.equalizeVotes < 3) continue;
      m.equalizeVotes = 0;
      m.equalizeTicks = want;
      m.conn!.sendJson({ t: 'netcfg', inputDelay: want });
    }
  }

  kick(conn: Conn, reason: string, banMinutes = 0): void {
    if (banMinutes > 0) this.kickedIps.set(conn.ip, Date.now() + banMinutes * 60000);
    conn.kick(reason);
  }

  close(): void {
    clearInterval(this.pingTimer);
    this.clock.stop();
    for (const c of this.conns) c.ws.terminate();
    this.conns.clear();
    this.rooms.clear();
  }
}
