// The Map Maker on the server: saved maps (limits, validation, owners), admins publishing /
// restoring / undoing official edits of the built-in maps (history), new rooms playing the
// official edit, and rooms playing a player's map sending its doc to everyone who joins.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ClientMsg, CustomMapDoc, ServerMsg, SocketLike } from '@space-yz/shared';
import {
  CUSTOM_MAP_LIMITS,
  NetCore,
  baseBoxesForEditor,
  boxFingerprint,
  customMapHash,
} from '@space-yz/shared';
import { createServices, type Services } from '../src/services';
import { startGameServer, type GameServer } from '../src/app';
import { NEED_ACCOUNT } from '../src/services/custom-map-handler';
import { CustomMapStore } from '../src/services/custom-maps';

const CHEAP = { logN: 10, r: 8, p: 1 };

const wholeMap = (name = 'Test Map'): CustomMapDoc => ({
  v: 1,
  name,
  base: '',
  sky: 'day',
  blocks: [{ id: 1, shape: 'box', pos: [0, -0.5, 0], size: [40, 1, 40], mat: 'concrete' }],
  movers: [],
  spawns: [{ pos: [0, 0, 0], yaw: 0 }],
  portals: [],
  launchPads: [],
});

const MAP = 'kestrel';
/** An edit of a built-in map: one of its boxes removed, one block added. */
const edit = (name = 'Kestrel edit', which = 5): CustomMapDoc => ({
  ...wholeMap(name),
  base: MAP,
  spawns: [],
  patch: { removed: [baseBoxesForEditor(MAP)[which].fingerprint] },
  blocks: [{ id: 1, shape: 'box', pos: [0, 40, 0], size: [2, 2, 2], mat: 'metal' }],
});

describe('custom maps (store)', () => {
  let s: Services;
  let clock = 1_700_000_000_000;
  beforeAll(() => {
    s = createServices({ dbFile: ':memory:', log: () => {}, now: () => clock, scrypt: CHEAP });
  });
  afterAll(() => s.close());

  it('save, list, overwrite, delete; only the owner; at most the limit', () => {
    const a = s.accounts.login('Alpha').account.id;
    const b = s.accounts.login('Bravo').account.id;
    const r = s.maps.save(a, wholeMap('One'));
    expect(r.ok).toBe(true);
    const id = r.ok ? r.id : '';
    clock += 1000;
    expect(s.maps.save(a, wholeMap('One v2'), id)).toEqual({ ok: true, id });
    expect(s.maps.list(a)).toEqual([{ id, name: 'One v2', base: '', updatedAt: clock }]);
    expect(s.maps.get(id)?.doc.name).toBe('One v2');
    expect(s.maps.save(b, wholeMap('Theirs'), id)).toMatchObject({ ok: false });
    expect(s.maps.delete(b, id)).toBe(false);
    expect(s.maps.delete(a, id)).toBe(true);
    expect(s.maps.list(a)).toEqual([]);
    for (let i = 0; i < CUSTOM_MAP_LIMITS.maps; i++)
      expect(s.maps.save(a, wholeMap()).ok).toBe(true);
    expect(s.maps.save(a, wholeMap()).ok).toBe(false);
  });

  it('official edits: publish, restore, undo walk the history', () => {
    const by = { id: null, name: 'host' };
    expect(s.maps.override(MAP)).toBeNull();
    expect(s.maps.undo(MAP, by)).toBe(false);
    const h1 = s.maps.publish(MAP, edit('v1'), by);
    const h2 = s.maps.publish(MAP, edit('v2', 6), by);
    expect(s.maps.override(MAP)?.hash).toBe(h2);
    expect(s.maps.overrides()).toEqual({ [MAP]: h2 });
    expect(s.maps.restore(MAP, by)).toBe(true);
    expect(s.maps.override(MAP)).toBeNull();
    expect(s.maps.restore(MAP, by)).toBe(false);
    expect(s.maps.undo(MAP, by)).toBe(true); // undo the restore: v2 again
    expect(s.maps.override(MAP)?.hash).toBe(h2);
    expect(s.maps.undo(MAP, by)).toBe(true); // undo v2: v1
    expect(s.maps.override(MAP)?.hash).toBe(h1);
    expect(s.maps.undo(MAP, by)).toBe(true); // undo v1: the original
    expect(s.maps.override(MAP)).toBeNull();
    const hist = s.maps.history(MAP);
    expect(hist.map((v) => v.action)).toEqual([
      'undo',
      'undo',
      'undo',
      'restore',
      'publish',
      'publish',
    ]);
    expect(hist[0].active).toBe(true);
    // the versions survive a restart (loaded from the database)
    s.maps.publish(MAP, edit('v3'), by);
    const again = new CustomMapStore(s.db);
    expect(again.override(MAP)?.doc.name).toBe('v3');
    s.maps.restore(MAP, by);
  });
});

// ------------------------------------------------------------------------------------------
// Over the network

interface Client {
  core: NetCore;
  got: ServerMsg[];
}

describe('custom maps online', () => {
  let s: Services;
  let server: GameServer;
  let clients: Client[] = [];

  beforeAll(async () => {
    s = createServices({ dbFile: ':memory:', log: () => {}, scrypt: CHEAP });
    server = await startGameServer({
      port: 0,
      host: '127.0.0.1',
      assets: null,
      log: () => {},
      services: s.hub,
      api: s.api,
    });
    s.queue.start(server.hub);
  });
  afterEach(() => {
    for (const c of clients) c.core.close();
    clients = [];
  });
  afterAll(async () => {
    await server.close();
    s.close();
  });

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn: () => boolean, ms = 5000) => {
    const t0 = Date.now();
    while (!fn()) {
      if (Date.now() - t0 > ms) throw new Error('timeout');
      await wait(20);
    }
  };
  const connect = async (name: string): Promise<Client> => {
    const got: ServerMsg[] = [];
    const core = new NetCore({
      url: `ws://127.0.0.1:${server.port}/ws`,
      name,
      now: () => performance.now(),
      createSocket: (u) => new WebSocket(u) as unknown as SocketLike,
    });
    core.listen((m) => got.push(m));
    core.connect();
    const c = { core, got };
    clients.push(c);
    await until(() => got.some((m) => m.t === 'me') && got.some((m) => m.t === 'officialMaps'));
    return c;
  };
  const idOf = (c: Client) => {
    const m = c.got.find((x) => x.t === 'me');
    return m?.t === 'me' ? m.data.id : -1;
  };
  let req = 1;
  /** One Map Maker request and its answer. */
  const ask = async (c: Client, msg: Omit<Extract<ClientMsg, { t: 'customMap' }>, 't' | 'req'>) => {
    const r = req++;
    c.core.sendJson({ t: 'customMap', req: r, ...msg });
    let res: Extract<ServerMsg, { t: 'customMapResult' }> | undefined;
    await until(() => {
      res = c.got.find(
        (m): m is Extract<ServerMsg, { t: 'customMapResult' }> =>
          m.t === 'customMapResult' && m.req === r,
      );
      return !!res;
    });
    return res!;
  };
  const secure = async (c: Client, username: string) => {
    const r = await s.accounts.register(idOf(c), username, `${username}-pass-1`, '127.0.0.9');
    expect(r.ok).toBe(true);
  };

  it('guests may not save; secured accounts save, list, load, delete; bad maps refused', async () => {
    const c = await connect('Guesty');
    expect(await ask(c, { op: 'save', doc: wholeMap() })).toMatchObject({
      ok: false,
      error: NEED_ACCOUNT,
    });
    await secure(c, 'Mapper');
    const saved = await ask(c, { op: 'save', doc: wholeMap('Mine') });
    expect(saved.ok).toBe(true);
    const id = saved.id!;
    const list = await ask(c, { op: 'list' });
    expect(list.list?.map((m) => m.name)).toEqual(['Mine']);
    expect((await ask(c, { op: 'load', id })).doc?.name).toBe('Mine');
    const bad = await ask(c, { op: 'save', doc: { ...wholeMap(), v: 99 } });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/problems/);
    // someone else can't load or delete it
    const other = await connect('Other');
    expect((await ask(other, { op: 'load', id })).ok).toBe(false);
    expect((await ask(other, { op: 'delete', id })).ok).toBe(false);
    expect((await ask(c, { op: 'delete', id })).ok).toBe(true);
    expect((await ask(c, { op: 'list' })).list).toEqual([]);
  });

  it('a big map travels (more than the usual 16 KB message)', async () => {
    const c = await connect('Builder');
    await secure(c, 'Builder');
    const doc = wholeMap('Big');
    doc.blocks = Array.from({ length: 800 }, (_, i) => ({
      id: i + 1,
      shape: 'box' as const,
      pos: [(i % 40) * 3 - 60, 0, Math.floor(i / 40) * 3 - 30] as [number, number, number],
      size: [2, 1, 2] as [number, number, number],
      mat: 'concrete' as const,
    }));
    expect(JSON.stringify(doc).length).toBeGreaterThan(16384);
    const r = await ask(c, { op: 'save', doc });
    expect(r.ok).toBe(true);
    expect((await ask(c, { op: 'load', id: r.id })).doc?.blocks.length).toBe(800);
  });

  it('only admins publish; new rooms play the official edit; restore / undo / history', async () => {
    const a = await connect('Owner');
    await secure(a, 'Mapkeeper');
    const p = await connect('Player');
    expect(await ask(a, { op: 'publish', map: MAP, doc: edit() })).toMatchObject({
      ok: false,
      error: 'Only admins can change the official maps.',
    });
    expect(s.accounts.setAdmin(idOf(p), true).ok).toBe(false); // a guest can't be one
    expect(s.accounts.setAdmin(idOf(a), true)).toEqual({ ok: true });
    expect(s.accounts.me(idOf(a))?.admin).toBe(true);
    // a whole map can't replace a built-in one
    expect((await ask(a, { op: 'publish', map: MAP, doc: wholeMap() })).ok).toBe(false);
    // a room already running keeps its version
    p.core.createRoom('practice', MAP);
    await until(() => p.core.state === 'room' && !!p.core.level);
    const old = server.hub.rooms.get(p.core.code)!;
    expect(old.custom).toBeNull();
    const doc = edit();
    expect(await ask(a, { op: 'publish', map: MAP, doc })).toMatchObject({ ok: true });
    const hash = customMapHash(doc);
    await until(() => p.core.officialMaps[MAP] === hash);
    expect(old.custom).toBeNull();
    p.core.leaveRoom();
    // new rooms (any mode) build the edited map, and tell their clients
    p.got.length = 0;
    p.core.createRoom('2v2', MAP, 1);
    await until(() => p.core.state === 'room' && !!p.core.level);
    const room = server.hub.rooms.get(p.core.code)!;
    expect(room.custom).toMatchObject({ kind: 'official', hash });
    expect(p.core.custom?.hash).toBe(hash);
    const removed = doc.patch!.removed[0];
    expect(room.level.def.boxes.some((b) => boxFingerprint(b) === removed)).toBe(false);
    expect(p.core.level!.def.boxes.length).toBe(room.level.def.boxes.length);
    // the bot keeps running on the edited map
    for (let i = 0; i < 120; i++) room.tick();
    p.core.leaveRoom();
    // everyone can load it; admins see it in their list
    expect((await ask(p, { op: 'loadOfficial', map: MAP })).doc?.name).toBe(doc.name);
    const list = await ask(a, { op: 'list' });
    expect(list.list).toContainEqual(
      expect.objectContaining({ id: `official:${MAP}`, official: true }),
    );
    // restore: new rooms play the original again; undo brings the edit back
    expect((await ask(p, { op: 'restore', map: MAP })).ok).toBe(false);
    expect((await ask(a, { op: 'restore', map: MAP })).ok).toBe(true);
    await until(() => !p.core.officialMaps[MAP]);
    expect(server.hub.createRoom({ mode: 'practice', map: MAP })!.custom).toBeNull();
    expect((await ask(a, { op: 'undo', map: MAP })).ok).toBe(true);
    expect(server.hub.createRoom({ mode: 'practice', map: MAP })!.custom?.hash).toBe(hash);
    const hist = await ask(a, { op: 'history', map: MAP });
    expect(hist.history?.map((v) => v.action)).toEqual(['undo', 'restore', 'publish']);
    // (clean up for the other tests)
    await ask(a, { op: 'restore', map: MAP });
    for (const r of [...server.hub.rooms.values()]) server.hub.closeRoom(r);
  });

  it('play: an unsaved map in a room; a friend joining by code gets the same map', async () => {
    const host = await connect('Host');
    const race = await ask(host, { op: 'play', mode: 'race', doc: wholeMap() });
    expect(race).toMatchObject({ ok: false });
    expect(race.error).toMatch(/start and a finish/);
    const doc = wholeMap('Play me');
    expect((await ask(host, { op: 'play', mode: 'freeRoam', doc })).ok).toBe(true);
    await until(() => host.core.state === 'room' && !!host.core.level);
    expect(host.core.mode).toBe('practice');
    expect(host.core.custom).toMatchObject({ kind: 'custom', name: 'Play me' });
    const friend = await connect('Friend');
    friend.core.joinRoom(host.core.code);
    await until(() => friend.core.state === 'room' && !!friend.core.level);
    expect(friend.core.custom?.hash).toBe(customMapHash(host.core.custom!.doc));
    expect(friend.core.level!.def.boxes).toEqual(host.core.level!.def.boxes);
    // a race map (start + finish) plays as a race room
    const gate = {
      pos: [0, 1, 0] as [number, number, number],
      size: [4, 3, 1] as [number, number, number],
      yaw: 0,
    };
    const track: CustomMapDoc = {
      ...wholeMap('Track'),
      race: { start: gate, checkpoints: [], finish: { ...gate, pos: [0, 1, 15] } },
    };
    expect((await ask(host, { op: 'play', mode: 'race', doc: track })).ok).toBe(true);
    await until(() => host.core.mode === 'race' && !!host.core.level);
    expect(host.core.level!.def.race).toBeTruthy();
  });
});
