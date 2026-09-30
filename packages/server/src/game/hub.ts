// GameHub: connections <-> rooms. Handles control messages, rate limits and validation.
// Accounts, ranked matchmaking and the host dashboard plug in through HubServices.
import type { WebSocket } from 'ws';
import type {
  ClientMsg,
  GameConfig,
  LadderId,
  LoadoutName,
  MatchObjective,
  RoomCustomMap,
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
  DEFAULT_MATCH_MAP,
  DEFAULT_BRAWL_MAP,
  PUBLIC_BRAWL,
  brawlMaps,
  nextBrawlMap,
  isBrawlMode,
  isFfaMode,
  type BrawlMode,
  RACE_DEFAULTS,
  defaultConfig,
  configForLoadout,
  loadoutName,
  botSkillName,
  CUSTOM_MAP_LIMITS,
} from '@space-yz/shared';
import { Limiter } from '../services/limiter';
import { Conn } from './conn';
import { Room, makeRoomCode, roomTeamSize, type Rules } from './room';
import { Clock } from './clock';
import { relayChat, relayRtc, relayVoice } from './chat';
import { PracticeRules } from './rules/practice';
import { MatchRules, type MatchResult } from './rules/match';
import { ArenaRules, type ArenaResult } from './rules/arena';
import { RaceRules, type RaceRecord } from './rules/race';
import { BrawlRules, type BrawlResult } from './rules/brawl';

export interface HubServices {
  /** Authenticate / create an account from a hello message; returns display name + token. */
  login?(
    conn: Conn,
    name: string,
    token: string | undefined,
  ): { name: string; accountId: number; token: string; account: unknown } | null;
  /** Rules for a room (M5 match rules). Defaults to practice. */
  rulesFor?(room: Room, opts: { bots: number }): Rules;
  /**
   * Ranked queue: queue ids from rating/ladders.ts ('premier', 'duels-1v1'…; several = a
   * multi-search), null = stop searching (ranked and casual).
   */
  queue?(hub: GameHub, conn: Conn, queue: string | string[] | null): void;
  /** Casual matchmaking: the modes and sizes this player ticked (unchecked data). */
  casualQueue?(hub: GameHub, conn: Conn, pick: unknown): void;
  /** Premier / Premier CS map veto: this player bans a map. */
  veto?(conn: Conn, map: string): void;
  /** Premier CS mode vote: this player votes a mode. */
  modeVote?(conn: Conn, mode: string): void;
  /** Parties: create / invite / join / leave / kick… (services/party.ts). */
  party?(hub: GameHub, conn: Conn, op: string, id: number | undefined): void;
  /** Right after a successful hello (the server sends ranked facts: season, opening hours). */
  onHello?(conn: Conn, hub: GameHub): void;
  onDisconnect?(hub: GameHub, conn: Conn): void;
  /** Called for every finished match (M8 records results). */
  onMatchEnd?(room: Room, result: MatchResult): void;
  /** Called for every finished Arena 1v1 match (casual: recorded in the match history). */
  onArenaEnd?(room: Room, result: ArenaResult): void;
  /** Called for every finished Brawl (casual: recorded with each player's stats). */
  onBrawlEnd?(room: Room, result: BrawlResult, rules: BrawlRules): void;
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
  /**
   * Accounts, profiles and friends messages ('account', 'editProfile', 'friend', 'social',
   * 'invite', 'joinFriend': services/account-handler.ts).
   */
  onSocial?(hub: GameHub, conn: Conn, msg: ClientMsg): void;
  /**
   * The Map Maker's messages ('customMap': saved maps, official edits, playing a map;
   * services/custom-map-handler.ts).
   */
  onCustomMap?(hub: GameHub, conn: Conn, msg: Extract<ClientMsg, { t: 'customMap' }>): void;
  /**
   * The official edit of a built-in map, if one is published: new rooms on that map play it
   * (rooms already running keep their version).
   */
  mapOverride?(map: string): RoomCustomMap | null;
  /** Has `to` blocked `from`? (then `from`'s chat and voice never reach `to`) */
  blocked?(to: Conn, from: Conn): boolean;
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
/** Every message but the Map Maker's (which may carry a whole map) stays under this. */
const MAX_JSON = 16384;
/** A Map Maker message carrying a map: the doc plus a little room for the message around it. */
export const MAX_MAP_MESSAGE = CUSTOM_MAP_LIMITS.maxBytes + 4096;

export class GameHub {
  conns = new Set<Conn>();
  rooms = new Map<string, Room>();
  clock = new Clock();
  private pingTimer: NodeJS.Timeout;
  kickedIps = new Map<string, number>();
  /** big messages (a map being saved / played) per address: 20 a minute */
  private bigLimit = new Limiter({
    max: 20,
    windowMs: 60_000,
    lockMs: 60_000,
    maxLockMs: 10 * 60_000,
  });

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
    // 16 KB: voice offers/answers carry an SDP of a few KB. Only a Map Maker message (after the
    // hello) may be bigger: it can carry a whole map (a few of those a minute)
    const big = text.length > MAX_JSON;
    if (big) {
      if (!conn.helloDone || !text.startsWith('{"t":"customMap"')) return conn.strike('size');
      if (this.bigLimit.lockedFor(conn.ip) > 0 || this.bigLimit.hit(conn.ip) > 0) {
        conn.sendJson({ t: 'error', msg: 'Too many maps sent — wait a minute.' });
        return;
      }
    }
    const msg = parseJson<ClientMsg>(text, big ? MAX_MAP_MESSAGE : MAX_JSON);
    if (!msg || typeof msg.t !== 'string') return conn.strike('json');
    if (big && msg.t !== 'customMap') return conn.strike('size');
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
        this.services.onHello?.(conn, this);
        return;
      }
    }
    if (!conn.helloDone) return conn.strike('no hello');
    switch (msg.t) {
      case 'createRoom': {
        const mode: RoomMode = ROOM_MODES.includes(msg.mode) ? msg.mode : 'practice';
        // (arena maps only for the Arena, which picks its own; race tracks only for races;
        // retired maps for nobody)
        const race = mode === 'race';
        const map = MAPS.some(
          (m) => m.id === msg.map && !m.arena && !m.retired && !!m.race === race,
        )
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
      case 'quickPlay': {
        // one-click Play: the fullest public Brawl room with a free slot, or a new one
        const mode: BrawlMode = msg.mode === 'brawl-ffa' ? 'brawl-ffa' : 'brawl';
        this.leaveRoom(conn);
        const room = this.quickPlayRoom(mode);
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
        this.services.onHello?.(conn, this);
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
        this.services.queue?.(
          this,
          conn,
          Array.isArray(msg.modes)
            ? msg.modes.slice(0, 8).map((m) => String(m).slice(0, 32))
            : String(msg.mode),
        );
        return;
      case 'unqueue':
        this.services.queue?.(this, conn, null);
        return;
      case 'casualQueue':
        this.services.casualQueue?.(this, conn, { modes: msg.modes, sizes: msg.sizes });
        return;
      case 'veto':
        if (typeof msg.map === 'string') this.services.veto?.(conn, msg.map.slice(0, 64));
        return;
      case 'modeVote':
        if (typeof msg.mode === 'string') this.services.modeVote?.(conn, msg.mode.slice(0, 16));
        return;
      case 'party':
        this.services.party?.(
          this,
          conn,
          String(msg.op).slice(0, 16),
          typeof msg.id === 'number' && Number.isInteger(msg.id) ? msg.id : undefined,
        );
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
        const blocked = this.services.blocked;
        const skip = blocked ? (to: Conn) => blocked(to, conn) : undefined;
        if (msg.t === 'chat') relayChat(room, conn, msg.text, msg.team, skip);
        else if (msg.t === 'rtc') relayRtc(room, conn, msg.to, msg.data, skip);
        else relayVoice(room, conn, msg.on, msg.all, skip);
        return;
      }
      case 'customMap':
        this.services.onCustomMap?.(this, conn, msg);
        return;
      case 'account':
      case 'editProfile':
      case 'friend':
      case 'social':
      case 'invite':
      case 'joinFriend':
        this.services.onSocial?.(this, conn, msg);
        return;
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
     * 'cs': CS mode (AK + Deagle, bomb rules, 70 % movement speed); never practice or ranked
     * (ranked is always the Boomerang kit)
     */
    loadout?: LoadoutName;
    /** players per team when fewer than the mode's size (Premier 4v4 in a 5v5 room) */
    teamSize?: number;
    /**
     * ranked: the ladder the room counts for. Premier CS rooms play the CS kit and Bomb or
     * Elimination (the vote's result); every other ranked room the Boomerang kit.
     */
    ladder?: LadderId;
    /** a public Brawl room (quick play): bots keep it busy and leave as humans join */
    public?: boolean;
    /**
     * the room plays this custom map (the Map Maker's play: `map` is then its room map id, kept
     * as given). Absent: the map's official edit if one is published, else the plain map.
     */
    custom?: RoomCustomMap;
  }): Room | null {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const arena = opts.mode === 'arena';
    const race = opts.mode === 'race';
    const brawl = isBrawlMode(opts.mode);
    const csRanked = !!opts.ranked && opts.ladder === 'premier-cs';
    const loadout: LoadoutName =
      opts.loadout === 'cs' && (!opts.ranked || csRanked) && opts.mode !== 'practice'
        ? 'cs'
        : 'lethal';
    let code = makeRoomCode();
    while (this.rooms.has(code)) code = makeRoomCode();
    const map = opts.custom
      ? opts.map
      : arena
        ? ARENA_MAP_ID
        : race
          ? getMap(opts.map).race && !getMap(opts.map).retired
            ? opts.map
            : DEFAULT_RACE_MAP
          : brawl && !brawlMaps().some((m) => m.id === opts.map)
            ? DEFAULT_BRAWL_MAP()
            : opts.map;
    const room = new Room({
      code,
      mode: opts.mode,
      map,
      // a custom map, or the official edit of this built-in map (if published)
      custom: opts.custom ?? this.services.mapOverride?.(map) ?? null,
      // (Brawl is casual only; its maps are the rotation's)
      ranked: brawl ? false : opts.ranked,
      ffa: isFfaMode(opts.mode),
      public: brawl && !!opts.public,
      ...(brawl && opts.public ? { maxPlayers: PUBLIC_BRAWL.maxPlayers } : {}),
      config: configForLoadout(opts.config ?? this.services.config?.() ?? defaultConfig(), loadout),
      lagComp: this.services.lagComp ?? true,
      // smaller teams play a smaller map (size walls): the level is built for this team size
      teamSize: roomTeamSize(opts.mode, opts.teamSize),
    });
    if (opts.ranked && !brawl) room.ladder = opts.ladder ?? null;
    const rules: Rules =
      this.services.rulesFor?.(room, { bots: opts.bots ?? 0 }) ??
      (opts.mode === 'practice'
        ? new PracticeRules()
        : opts.mode === 'arena'
          ? new ArenaRules(loadout, { ranked: opts.ranked })
          : opts.mode === 'race'
            ? new RaceRules(room.map, opts.ranked ? { lobbySec: RACE_DEFAULTS.rankedLobbySec } : {})
            : isBrawlMode(opts.mode)
              ? new BrawlRules(opts.mode)
              : new MatchRules(
                  opts.mode,
                  // ranked: Tower (Duels) or Bomb (Premier); Premier CS: Bomb or Elimination
                  opts.ranked
                    ? csRanked
                      ? opts.objective === 'elim'
                        ? 'elim'
                        : 'bomb'
                      : opts.objective === 'bomb'
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
    if (rules instanceof BrawlRules) {
      rules.onGrief = (r, m, action, reason) => {
        const conn = m.conn;
        if (!conn) return;
        this.log(`Room ${r.code}: ${action} ${m.name} — ${reason}`);
        this.services.onGrief?.(conn, action, reason, r);
        if (action === 'warn') conn.sendJson({ t: 'notice', msg: reason });
        else this.removeFromRoom(conn, reason);
      };
      rules.onResult = (r, result) => {
        const top = result.players[0];
        const who =
          result.winner === null
            ? 'draw'
            : r.mode === 'brawl-ffa'
              ? `${top?.name ?? 'nobody'} wins`
              : `team ${result.winner === 0 ? 'cyan' : 'orange'} wins`;
        this.log(`Room ${r.code}: brawl on ${result.map} over — ${who} (${result.reason})`);
        this.services.onBrawlEnd?.(r, result, rules);
      };
      // the next Brawl: every client loads the next map (a new 'roomJoined', same code and id)
      rules.onNextMap = (r) => {
        const next = nextBrawlMap(r.map);
        r.changeMap(next, this.services.mapOverride?.(next) ?? null);
        rules.restart(r);
        for (const m of r.humans) if (m.conn) this.sendRoomJoined(m.conn, r, m.id);
        this.broadcastRoom(r);
        this.log(`Room ${r.code}: next brawl on ${r.map}`);
      };
    }
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
    // public rooms: bots give their slots up as soon as humans come
    if (room.botFill && room.isPublic) room.botFill.shrink = true;
    this.rooms.set(code, room);
    this.clock.add(room);
    this.log(
      `Room ${code} created (${opts.mode}, ${room.map}${room.custom ? ` [${room.custom.kind} ${room.custom.hash}]` : ''}${opts.ranked ? ', ranked' : ''}${loadout === 'cs' ? ', CS mode' : ''})`,
    );
    return room;
  }

  /**
   * Quick play: the public Brawl room of this playlist with the most humans that still has a
   * free slot, or a new one (bots fill it up to PUBLIC_BRAWL.fillTo). Null: the server is full.
   */
  quickPlayRoom(mode: BrawlMode): Room | null {
    const open = [...this.rooms.values()]
      .filter((r) => r.isPublic && r.mode === mode && !r.closed && r.hasRoomForHuman())
      .sort((a, b) => b.humans.length - a.humans.length || a.createdAt - b.createdAt);
    if (open.length) return open[0];
    const count = [...this.rooms.values()].filter((r) => r.isPublic && r.mode === mode).length;
    if (count >= PUBLIC_BRAWL.maxRooms) return null;
    // new rooms start at different points of the rotation
    const maps = brawlMaps();
    const map = maps[count % Math.max(1, maps.length)]?.id ?? DEFAULT_MATCH_MAP();
    return this.createRoom({
      mode,
      map,
      bots: PUBLIC_BRAWL.fillTo - 1,
      botSkill: PUBLIC_BRAWL.botSkill,
      public: true,
    });
  }

  /** Public Brawl rooms at a glance (host dashboard): per playlist, rooms / humans / bots. */
  publicBrawlStatus(): Record<BrawlMode, { rooms: number; humans: number; bots: number }> {
    const out: Record<BrawlMode, { rooms: number; humans: number; bots: number }> = {
      brawl: { rooms: 0, humans: 0, bots: 0 },
      'brawl-ffa': { rooms: 0, humans: 0, bots: 0 },
    };
    for (const r of this.rooms.values()) {
      if (!r.isPublic || !isBrawlMode(r.mode)) continue;
      const o = out[r.mode];
      o.rooms++;
      o.humans += r.humans.length;
      o.bots += r.members.size - r.humans.length;
    }
    return out;
  }

  /** Tell a player which room they are in (on joining, and when a Brawl moves to a new map). */
  private sendRoomJoined(conn: Conn, room: Room, playerId: number): void {
    conn.sendJson({
      t: 'roomJoined',
      code: room.code,
      mode: room.mode,
      map: room.map,
      playerId,
      tick: room.world.tick,
      config: room.ctx.config,
      ranked: room.ranked,
      ...(room.isPublic ? { public: true } : {}),
      // (a smaller team size: the client builds the level with the same size walls)
      ...(room.teamSize < 5 ? { teamSize: room.teamSize } : {}),
      ...(room.ladder ? { ladder: room.ladder } : {}),
      // a custom map / official edit: the doc, which every client builds the same way
      ...(room.custom ? { custom: room.custom } : {}),
    });
  }

  joinRoom(conn: Conn, room: Room, team?: 0 | 1): void {
    this.leaveRoom(conn);
    const m = room.addMember(conn.name, conn, { team, accountId: conn.accountId });
    conn.roomCode = room.code;
    conn.playerId = m.id;
    this.sendRoomJoined(conn, room, m.id);
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
