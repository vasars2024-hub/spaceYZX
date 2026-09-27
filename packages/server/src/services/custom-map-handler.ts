// The WebSocket side of the Map Maker (protocol 'customMap', answered with 'customMapResult').
// - Your maps: list / load / save / delete. Saving needs a secured account (username +
//   password); guests can build and test maps but not keep them. At most CUSTOM_MAP_LIMITS.maps
//   each, validated (validateCustomMap) and size-checked here, saves rate-limited.
// - Official edits of the built-in maps (the owner editing the real maps): only admins
//   (players.admin, granted on the host dashboard) may publish, restore the original or undo;
//   everyone is told the new versions ('officialMaps') and new rooms play them.
// - Play: a new room (free roam = a practice room, or a race if the map has a start and a
//   finish) playing a saved or unsaved map; its code is shared like any room's.
import type {
  ClientMsg,
  CustomMapDoc,
  CustomMapOp,
  RoomCustomMap,
  ServerMsg,
} from '@space-yz/shared';
import {
  CUSTOM_MAP_LIMITS,
  CUSTOM_MAP_OPS,
  MAPS,
  OFFICIAL_PREFIX,
  buildLevel,
  customMapHash,
  roomLevelDef,
  validateCustomMap,
} from '@space-yz/shared';
import type { GameHub } from '../game/hub';
import type { Conn } from '../game/conn';
import type { Accounts } from './accounts';
import type { CustomMapStore } from './custom-maps';
import type { RankedQueue } from './queue';
import { Limiter, waitText } from './limiter';

type CustomMapMsg = Extract<ClientMsg, { t: 'customMap' }>;
type ResultFields = Omit<Extract<ServerMsg, { t: 'customMapResult' }>, 't' | 'op' | 'req' | 'ok'>;

export const NEED_ACCOUNT =
  'Saving maps needs an account: secure yours with a username and password (Profile → Account). You can still test your map without saving it.';

const isBuiltIn = (map: unknown): map is string =>
  typeof map === 'string' && MAPS.some((m) => m.id === map);

/** Check a doc from a client: size, then the shared validator. */
export const checkDoc = (
  raw: unknown,
): { ok: true; doc: CustomMapDoc } | { ok: false; error: string } => {
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(raw ?? null), 'utf8');
  } catch {
    return { ok: false, error: 'That is not a map.' };
  }
  if (bytes > CUSTOM_MAP_LIMITS.maxBytes)
    return {
      ok: false,
      error: `The map is too big (${(bytes / 1e6).toFixed(1)} MB; at most ${CUSTOM_MAP_LIMITS.maxBytes / 1e6} MB).`,
    };
  const v = validateCustomMap(raw);
  if (!v.ok) {
    const errs = v.errors;
    return {
      ok: false,
      error: `The map has problems: ${errs.slice(0, 3).join('; ')}${errs.length > 3 ? ` (and ${errs.length - 3} more)` : ''}`,
    };
  }
  if (v.doc.base && !isBuiltIn(v.doc.base))
    return { ok: false, error: `Unknown base map "${String(v.doc.base).slice(0, 40)}".` };
  if (v.doc.patch && !v.doc.base) return { ok: false, error: 'An edit needs its base map.' };
  return { ok: true, doc: v.doc };
};

export const customMapHandler = (d: {
  accounts: Accounts;
  store: CustomMapStore;
  queue: RankedQueue;
  log: (msg: string) => void;
  now?: () => number;
}) => {
  const { accounts, store, queue, log } = d;
  const now = d.now ?? Date.now;
  /** saves / deletes / publishes per account: 30 per 10 minutes */
  const saveLimit = new Limiter(
    { max: 30, windowMs: 10 * 60_000, lockMs: 5 * 60_000, maxLockMs: 60 * 60_000 },
    now,
  );
  /** rooms started per connection's address: 12 a minute */
  const playLimit = new Limiter(
    { max: 12, windowMs: 60_000, lockMs: 60_000, maxLockMs: 10 * 60_000 },
    now,
  );

  const limited = (lim: Limiter, key: string): string | null => {
    const wait = lim.lockedFor(key) || lim.hit(key);
    return wait > 0 ? `Slow down: ${waitText(wait)}` : null;
  };

  /** Tell everyone connected which built-in maps have an official edit now. */
  const broadcastOfficial = (hub: GameHub): void => {
    const msg = { t: 'officialMaps' as const, data: store.overrides() };
    for (const c of hub.conns) if (c.helloDone) c.sendJson(msg);
  };

  const roomCustom = (
    doc: CustomMapDoc,
    kind: RoomCustomMap['kind'],
    id?: string,
  ): RoomCustomMap => ({
    kind,
    doc,
    hash: customMapHash(doc),
    ...(id ? { id } : {}),
    name: doc.name,
  });

  const handle = (hub: GameHub, conn: Conn, msg: CustomMapMsg): void => {
    const op = msg.op;
    if (!CUSTOM_MAP_OPS.includes(op)) return conn.strike('customMap');
    const req = typeof msg.req === 'number' && Number.isInteger(msg.req) ? msg.req : undefined;
    const reply = (ok: boolean, extra: ResultFields = {}) =>
      conn.sendJson({
        t: 'customMapResult',
        op,
        ...(req !== undefined ? { req } : {}),
        ok,
        ...extra,
      });
    const fail = (error: string) => reply(false, { error });
    const me = conn.accountId;
    const id = typeof msg.id === 'string' ? msg.id.slice(0, 64) : undefined;
    const map = typeof msg.map === 'string' ? msg.map.slice(0, 64) : undefined;
    const admin = () => accounts.isAdmin(me);
    const secured = () => me !== null && !!accounts.byId(me)?.secured;
    const by = () => ({ id: me, name: conn.name });

    switch (op as CustomMapOp) {
      case 'list':
        if (me === null) return reply(true, { list: [] });
        return reply(true, {
          list: [...(admin() ? store.officialList() : []), ...store.list(me)],
        });
      case 'load': {
        if (id?.startsWith(OFFICIAL_PREFIX)) {
          const o = store.override(id.slice(OFFICIAL_PREFIX.length));
          return o ? reply(true, { doc: o.doc }) : fail('That map has no official edit.');
        }
        const m = id ? store.get(id) : null;
        if (!m || m.owner !== me) return fail('No such map of yours.');
        return reply(true, { doc: m.doc });
      }
      case 'loadOfficial':
        if (!isBuiltIn(map)) return fail('Unknown map.');
        return reply(true, { doc: store.override(map)?.doc ?? null });
      case 'save': {
        if (!secured()) return fail(NEED_ACCOUNT);
        const wait = limited(saveLimit, `a${me}`);
        if (wait) return fail(wait);
        const c = checkDoc(msg.doc);
        if (!c.ok) return fail(c.error);
        const r = store.save(me!, c.doc, id);
        if (!r.ok) return fail(r.error);
        log(`Map saved: "${c.doc.name}" (${r.id}) by ${conn.name} (#${me})`);
        return reply(true, { id: r.id });
      }
      case 'delete':
        if (me === null || !id) return fail('No such map of yours.');
        return store.delete(me, id) ? reply(true) : fail('No such map of yours.');
      case 'publish':
      case 'restore':
      case 'undo':
      case 'history': {
        if (!admin()) return fail('Only admins can change the official maps.');
        if (!isBuiltIn(map)) return fail('Unknown map.');
        if (op === 'history') return reply(true, { history: store.history(map) });
        const wait = limited(saveLimit, `a${me}`);
        if (wait) return fail(wait);
        if (op === 'publish') {
          const c = checkDoc(msg.doc);
          if (!c.ok) return fail(c.error);
          if (!c.doc.patch || c.doc.base !== map)
            return fail(`Only an edit of this map can be published to it (start from ${map}).`);
          // it must build (the same way every room will)
          try {
            buildLevel(roomLevelDef(map, 5, { doc: c.doc, hash: customMapHash(c.doc) }));
          } catch (err) {
            return fail(`The map could not be built: ${String((err as Error).message ?? err)}`);
          }
          const hash = store.publish(map, c.doc, by());
          log(`Official map edit published: ${map} (${hash}) by ${conn.name} (#${me})`);
        } else if (op === 'restore') {
          if (!store.restore(map, by())) return fail('That map is already the original.');
          log(`Official map restored to the original: ${map} by ${conn.name} (#${me})`);
        } else {
          if (!store.undo(map, by())) return fail('Nothing to undo.');
          log(`Official map edit undone: ${map} by ${conn.name} (#${me})`);
        }
        broadcastOfficial(hub);
        return reply(true);
      }
      case 'play': {
        const mode = msg.mode === 'race' ? 'race' : 'freeRoam';
        const wait = limited(playLimit, conn.ip);
        if (wait) return fail(wait);
        let custom: RoomCustomMap;
        if (id?.startsWith(OFFICIAL_PREFIX)) {
          const m = id.slice(OFFICIAL_PREFIX.length);
          const o = store.override(m);
          if (!o) return fail('That map has no official edit.');
          custom = { kind: 'official', doc: o.doc, hash: o.hash, name: o.doc.name };
        } else if (id) {
          const m = store.get(id);
          if (!m || m.owner !== me) return fail('No such map of yours.');
          custom = roomCustom(m.doc, 'custom', id);
        } else {
          const c = checkDoc(msg.doc);
          if (!c.ok) return fail(c.error);
          custom = roomCustom(c.doc, 'custom');
        }
        // (an edit of a built-in map plays on that map's id: its name shows everywhere)
        const roomMap = custom.doc.patch ? custom.doc.base : `custom:${custom.id ?? 'draft'}`;
        try {
          const def = roomLevelDef(roomMap, 5, custom);
          if (mode === 'race' && !def.race)
            return fail('To race on this map, give it a start and a finish.');
          if (!def.spawns.length && !def.race) return fail('Give the map a spawn point first.');
        } catch (err) {
          return fail(`The map could not be built: ${String((err as Error).message ?? err)}`);
        }
        queue.remove(conn);
        hub.leaveRoom(conn);
        const room = hub.createRoom({
          mode: mode === 'race' ? 'race' : 'practice',
          map: roomMap,
          custom,
        });
        if (!room) return fail('The server is full right now.');
        reply(true);
        hub.joinRoom(conn, room);
        return;
      }
    }
  };

  return { handle, broadcastOfficial };
};
