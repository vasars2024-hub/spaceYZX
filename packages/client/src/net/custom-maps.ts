// The Map Maker's connection to the server (the editor imports exactly this): your saved maps,
// the official edits of the built-in maps (admins publish / restore them) and playing a map.
//
//   playMap(target, mode, opts)   test a map: without `private` right here on this PC (free
//                                 roam with target dummies, or a race), with `private` in a new
//                                 online room whose code friends can join (the server checks
//                                 the map and sends it to everyone who joins)
// Saving needs a secured account (the server says so); guests can still build and test.
import type { CustomMapDoc, CustomPlayMode, NetCore } from '@space-yz/shared';
import { customMapHash, roomLevelDef, validateCustomMap } from '@space-yz/shared';
import type { App } from '../app';
import { account } from './account';
import { mapRequest, whenConnected } from './map-link';
import { startFreeRoam } from '../game/free-roam';
import { startRacePractice } from '../game/race-entry';

let app: App | null = null;

/** Called once at start-up (main.ts): playMap starts games through the App. */
export const bindCustomMapsApp = (a: App): void => {
  app = a;
};

const theApp = (): App => {
  if (!app) throw new Error('The game is not ready yet.');
  return app;
};

/** The game connection, once it said hello. */
const connected = async (): Promise<NetCore> => {
  const core = theApp().ensureNet();
  await whenConnected(core);
  return core;
};

/** Your saved maps, newest first (admins: the published official edits too, `official`). */
export const listMyMaps = async (): Promise<
  { id: string; name: string; base: string; updatedAt: number; official?: boolean }[]
> => (await mapRequest(await connected(), { op: 'list' })).list ?? [];

/** One of your saved maps (or 'official:<map>': that map's published edit). */
export const loadMap = async (id: string): Promise<CustomMapDoc> => {
  const r = await mapRequest(await connected(), { op: 'load', id });
  if (!r.doc) throw new Error('No such map.');
  return r.doc;
};

/** The published official edit of a built-in map (null: it plays the original). */
export const loadOfficialEdit = async (mapId: string): Promise<CustomMapDoc | null> =>
  (await mapRequest(await connected(), { op: 'loadOfficial', map: mapId })).doc ?? null;

/** Save a map (a new one, or over your map `id`). Needs a secured account. */
export const saveMap = async (doc: CustomMapDoc, id?: string): Promise<{ id: string }> => {
  const r = await mapRequest(await connected(), { op: 'save', doc, ...(id ? { id } : {}) });
  if (!r.id) throw new Error('The map was not saved.');
  return { id: r.id };
};

export const deleteMap = async (id: string): Promise<void> => {
  await mapRequest(await connected(), { op: 'delete', id });
};

/**
 * Admins: make this edit (a patch doc of `mapId`) the real map everyone plays. New matches play
 * it; matches already running keep their version.
 */
export const publishOfficial = async (mapId: string, doc: CustomMapDoc): Promise<void> => {
  await mapRequest(await connected(), { op: 'publish', map: mapId, doc });
};

/** Admins: put the original map back (the edit stays in the history). */
export const restoreOfficial = async (mapId: string): Promise<void> => {
  await mapRequest(await connected(), { op: 'restore', map: mapId });
};

/** Admins: undo the last publish / restore of a built-in map. */
export const undoOfficial = async (mapId: string): Promise<void> => {
  await mapRequest(await connected(), { op: 'undo', map: mapId });
};

/** Admins: a built-in map's official versions, newest first. */
export const officialHistory = async (mapId: string) =>
  (await mapRequest(await connected(), { op: 'history', map: mapId })).history ?? [];

/** May this account publish official edits? (the host makes admins on the dashboard) */
export const isAdmin = (): boolean => !!account.me?.admin;

const problems = (doc: CustomMapDoc): string | null => {
  const v = validateCustomMap(doc);
  if (v.ok) return null;
  const errs = v.errors;
  return `The map has problems: ${errs.slice(0, 3).join('; ')}`;
};

/**
 * Play a map: a saved one (`id`) or the editor's current doc (`doc`, saved or not).
 * - 'freeRoam': walk and shoot around it (target dummies offline)
 * - 'race': race it (the map needs a start and a finish)
 * `private`: in a new online room (share its code: friends join it); otherwise right here.
 * `onExit`: called when the player quits that game (instead of going to the title screen).
 * Rejects with a readable message when the map can't be played.
 */
export const playMap = async (
  target: { id?: string; doc?: CustomMapDoc },
  mode: CustomPlayMode,
  opts: { private?: boolean; onExit?: () => void } = {},
): Promise<void> => {
  const a = theApp();
  if (opts.private) {
    const core = await connected();
    if (!target.doc && !target.id) throw new Error('No map to play.');
    const err = target.doc ? problems(target.doc) : null;
    if (err) throw new Error(err);
    // (the room's 'roomJoined' starts the game: App.onNetMessage)
    a.afterGame = opts.onExit ?? null;
    try {
      await mapRequest(core, {
        op: 'play',
        mode,
        ...(target.doc ? { doc: target.doc } : { id: target.id }),
      });
    } catch (e) {
      a.afterGame = null;
      throw e;
    }
    return;
  }
  // on this PC: no await before the game starts when the doc is given (a click can lock the
  // pointer)
  const doc = target.doc ?? (target.id ? await loadMap(target.id) : null);
  if (!doc) throw new Error('No map to play.');
  const err = problems(doc);
  if (err) throw new Error(err);
  const mapId = doc.patch ? doc.base : `custom:${target.id ?? 'draft'}`;
  const levelDef = roomLevelDef(mapId, 5, { doc, hash: customMapHash(doc) });
  if (mode === 'race') {
    if (!levelDef.race) throw new Error('To race on this map, give it a start and a finish.');
    a.afterGame = opts.onExit ?? null;
    startRacePractice(a, { track: mapId, levelDef, trackName: doc.name, bots: 0, skill: 'normal' });
    return;
  }
  if (!levelDef.spawns.length) throw new Error('Give the map a spawn point first.');
  a.afterGame = opts.onExit ?? null;
  startFreeRoam(a, { mapId, levelDef });
};
