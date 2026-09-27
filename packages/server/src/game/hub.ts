// GameHub: connections <-> rooms. Handles control messages, rate limits and validation.
// Accounts, ranked matchmaking and the host dashboard plug in through HubServices.
import type { WebSocket } from 'ws';
import type {
  ClientMsg,
  GameConfig,
  LoadoutName,
  MatchObjective,
  RoomMode,
} from '@space-yz/shared';
import {
  MATCH_OBJECTIVES,
  ROOM_MODES,
  PROTOCOL_VERSION,
  GAME_NAME,
  MSG_INPUT,
  decodeInput,
  parseJson,
  sanitizeName,
  getMap,
  MAPS,
  ARENA_MAP_ID,
  DEFAULT_RACE_MAP,
  RACE_DEFAULTS,
  defaultConfig,
  configForLoadout,
  loadoutName,
  botSkillName,
} from '@space-yz/shared';
import { Conn } from './conn';
import { Room, makeRoomCode, type Rules } from './room';
import { Clock } from './clock';
import { relayChat, relayRtc, relayVoice } from './chat';
import { PracticeRules } from './rules/practice';
import { MatchRules, type MatchResult } from './rules/match';
import { ArenaRules, type ArenaResult } from './rules/arena';
import { RaceRules, type RaceRecord } from './rules/race';

export interface HubServices {
  /** Authenticate / create an account from a hello message; returns display name + token. */
  login?(
    conn: Conn,
    name: string,
    token: string | undefined,
  ): { name: string; accountId: number; token: string; account: unknown } | null;
  /** Rules for a room (M5 match rules). Defaults to practice. */
  rulesFor?(room: Room, opts: { bots: number }): Rules;
  /** Ranked queue: a queue id from rating/ladders.ts ('premier', 'duels-1v1'…), null = leave. */
  queue?(hub: GameHub, conn: Conn, queue: string | null): void;
  /** Premier map veto: this player bans a map. */
  veto?(conn: Conn, map: string): void;
  /** Right after a successful hello (the server sends ranked facts: season, opening hours). */
  onHello?(conn: Conn): void;
  onDisconnect?(hub: GameHub, conn: Conn): void;
  /** Called for every finished match (M8 records results). */
  onMatchEnd?(room: Room, result: MatchResult): void;
  /** Called for every finished Arena 1v1 match (casual: recorded in the match history). */
  onArenaEnd?(room: Room, result: ArenaResult): void;
  /**
   * Called for every finished parkour race (rules/race.ts): stored with personal bests; in
   * ranked rooms it also updates the Race ladder (shared rating/race.ts).
   */
  onRaceEnd?(room: Room, result: RaceRecord): void;
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
/**
 * A client that sent nothing (not even a reply to the 1 s server ping) for this long is gone:
 * drop it, so a vanished player (Wi-Fi died, laptop closed) doesn't hold a room slot forever.
 */
const SILENT_DROP_MS = 30_000;

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
    // 16 KB: voice offers/answers carry an SDP of a few KB
    const msg = parseJson<ClientMsg>(text, 16384);
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
        this.services.onHello?.(conn);
        return;
      }
    }
    if (!conn.helloDone) return conn.strike('no hello');
    switch (msg.t) {
      case 'createRoom': {
        const mode: RoomMode = ROOM_MODES.includes(msg.mode) ? msg.mode : 'practice';
        // (arena maps only for the Arena, which picks its own; race tracks only for races)
        const race = mode === 'race';
        const map = MAPS.some((m) => m.id === msg.map && !m.arena && !!m.race === race)
          ? (msg.map as string)
          : race
            ? DEFAULT_RACE_MAP
            : getMap('').id;
        const bots = Math.max(0, Math.min(9, Math.floor(Number(msg.bots) || 0)));
        const room = this.createRoom({
          mode,
          map,
          bots,
          botSkill: botSkillName(msg.botSkill),
          objective: MATCH_OBJECTIVES.find((o) => o === msg.objective) ?? 'tower',
          loadout: loadoutName(msg.loadout),
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
        if (conn.roomCode === room.code) return; // already in it
        if (room.ranked) return conn.sendJson({ t: 'error', msg: 'That is a ranked match.' });
        // bots don't take a human's place: one leaves when a human joins a bot-filled room
        if (!room.hasRoomForHuman())
          return conn.sendJson({ t: 'error', msg: 'That room is full.' });
        this.joinRoom(conn, room);
        return;
      }
      case 'leaveRoom':
        this.leaveRoom(conn);
        return;
      case 'profile':
        conn.sendJson({ t: 'profile', data: this.services.profile?.(conn) ?? null });
        this.services.onHello?.(conn);
        return;
      case 'startMatch': {
        const room = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
        if (!room || room.hostId !== conn.playerId || room.ranked) return;
        if (
          room.rules instanceof MatchRules ||
          room.rules instanceof ArenaRules ||
          room.rules instanceof RaceRules
        ) {
          const err = room.rules.requestStart(room);
          if (err) conn.sendJson({ t: 'error', msg: err });
        }
        return;
      }
      case 'queue':
      case 'unqueue':
        this.services.queue?.(this, conn, msg.t === 'queue' ? String(msg.mode) : null);
        return;
      case 'veto':
        if (typeof msg.map === 'string') this.services.veto?.(conn, msg.map.slice(0, 64));
        return;
      case 'report': {
        const room = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
        if (room && typeof msg.player === 'number')
          this.services.onReport?.(conn, msg.player, String(msg.reason ?? '').slice(0, 200), room);
        return;
      }
      case 'takeover': {
        // while dead: step into a living bot teammate (the room checks everything else)
        const room = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
        if (room && conn.playerId !== null && typeof msg.target === 'number')
          room.takeOver(conn.playerId, msg.target);
        return;
      }
      case 'chat':
      case 'rtc':
      case 'voice': {
        // text chat, voice signaling and talk state: only between humans in the same room
        const room = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
        if (!room) return;
        if (msg.t === 'chat') relayChat(room, conn, msg.text, msg.team);
        else if (msg.t === 'rtc') relayRtc(room, conn, msg.to, msg.data);
        else relayVoice(room, conn, msg.on, msg.all);
        return;
      }
      default:
        conn.strike('unknown');
    }
  }

  createRoom(opts: {
    /** 'arena': an Arena 1v1 room (always on the Arena map, up to 8 players) */
    mode: RoomMode;
    map: string;
    bots?: number;
    botSkill?: string;
    ranked?: boolean;
    config?: GameConfig;
    objective?: MatchObjective;
    /**
     * 'cs': CS mode (AK + Deagle, bomb rules, half-speed movement); never practice or ranked
     * (ranked is always the Boomerang kit)
     */
    loadout?: LoadoutName;
    /** players per team when fewer than the mode's size (Premier 4v4 in a 5v5 room) */
    teamSize?: number;
  }): Room | null {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const arena = opts.mode === 'arena';
    const race = opts.mode === 'race';
    const loadout: LoadoutName =
      opts.loadout === 'cs' && !opts.ranked && opts.mode !== 'practice' ? 'cs' : 'lethal';
    let code = makeRoomCode();
    while (this.rooms.has(code)) code = makeRoomCode();
    const room = new Room({
      code,
      mode: opts.mode,
      map: arena
        ? ARENA_MAP_ID
        : race
          ? getMap(opts.map).race
            ? opts.map
            : DEFAULT_RACE_MAP
          : opts.map,
      ranked: opts.ranked,
      config: configForLoadout(opts.config ?? this.services.config?.() ?? defaultConfig(), loadout),
      lagComp: this.services.lagComp ?? true,
    });
    const rules: Rules =
      this.services.rulesFor?.(room, { bots: opts.bots ?? 0 }) ??
      (opts.mode === 'practice'
        ? new PracticeRules()
        : opts.mode === 'arena'
          ? new ArenaRules(loadout, { ranked: opts.ranked })
          : opts.mode === 'race'
            ? new RaceRules(room.map, opts.ranked ? { lobbySec: RACE_DEFAULTS.rankedLobbySec } : {})
            : new MatchRules(
                opts.mode,
                // ranked: Tower (Duels) or Bomb (Premier), never Elimination
                opts.ranked
                  ? opts.objective === 'bomb'
                    ? 'bomb'
                    : 'tower'
                  : (opts.objective ?? 'tower'),
                loadout,
              ));
    room.rules = rules;
    if (rules instanceof MatchRules && opts.teamSize && opts.teamSize < rules.ms.rules.teamSize)
      rules.ms.rules.teamSize = Math.max(1, Math.floor(opts.teamSize));
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
    if (rules instanceof ArenaRules) {
      rules.onResult = (r, result) => {
        this.log(
          `Room ${r.code}: arena over — ${result.standings[0]?.name ?? 'nobody'} wins (${result.reason})`,
        );
        this.services.onArenaEnd?.(r, result);
      };
      rules.onFinished = (r) => {
        for (const m of r.humans) if (m.conn) this.removeFromRoom(m.conn, 'Arena over');
        if (this.rooms.has(r.code)) this.closeRoom(r);
      };
    }
    if (rules instanceof RaceRules) {
      rules.onResult = (r, result) => {
        const first = result.standings[0];
        this.log(
          `Room ${r.code}: race ${result.race} on ${result.track} over — ${result.racers[0]?.name ?? 'nobody'}${first?.timeMs ? ` in ${(first.timeMs / 1000).toFixed(2)} s` : ' (DNF)'}`,
        );
        this.services.onRaceEnd?.(r, result);
      };
      rules.onFinished = (r) => {
        for (const m of r.humans) if (m.conn) this.removeFromRoom(m.conn, 'Race over');
        if (this.rooms.has(r.code)) this.closeRoom(r);
      };
    }
    (rules as Rules).setup?.(room);
    room.onChanged = () => this.broadcastRoom(room);
    // bots fill the room (leaving a slot for the creator); humans who join take their slots
    if (opts.bots && !opts.ranked) room.setBotFill(opts.bots, opts.botSkill ?? '');
    this.rooms.set(code, room);
    this.clock.add(room);
    this.log(
      `Room ${code} created (${opts.mode}, ${room.map}${opts.ranked ? ', ranked' : ''}${loadout === 'cs' ? ', CS mode' : ''})`,
    );
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
    for (const c of this.conns) {
      if (s - c.lastHeard > SILENT_DROP_MS) {
        c.ws.terminate();
        this.onClose(c);
        continue;
      }
      c.sendRaw(ping);
    }
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
