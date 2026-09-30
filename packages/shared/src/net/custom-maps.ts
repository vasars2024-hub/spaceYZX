// Player-made maps on the wire (the Map Maker): the 'customMap' messages, and how a room's level
// is built when it plays a custom map or a built-in map with an official edit published. The
// server and every client build the room's LevelDef with roomLevelDef, so they always agree; the
// room tells its clients the doc and its hash in 'roomJoined' (a different hash = a rebuild).
import type { LevelDef } from '../level/types';
import type { CustomMapDoc } from '../level/custom/types';
import { mapDefForSize } from '../level/maps/index';
import { applyCustomPatch, compileCustomMap } from '../level/custom';

/**
 * 'customMap' operations:
 * - list: your saved maps (admins also see the published official edits, id 'official:<map>')
 * - load (id) / loadOfficial (map): one doc
 * - save (doc, id?: overwrite that one) / delete (id): your own maps (a secured account)
 * - publish (map, doc) / restore (map) / undo (map) / history (map): official edits of the
 *   built-in maps (admins only): publish makes the edit the map everyone plays, restore goes
 *   back to the original, undo back to the version before the last publish
 * - play (id or doc, mode): a room that plays the map (free roam / race), code to share
 */
export type CustomMapOp =
  | 'list'
  | 'load'
  | 'loadOfficial'
  | 'save'
  | 'delete'
  | 'publish'
  | 'restore'
  | 'undo'
  | 'history'
  | 'play';

export const CUSTOM_MAP_OPS: readonly CustomMapOp[] = [
  'list',
  'load',
  'loadOfficial',
  'save',
  'delete',
  'publish',
  'restore',
  'undo',
  'history',
  'play',
];

/** What 'play' starts: free roam (practice room) or a race (the map needs start + finish). */
export type CustomPlayMode = 'freeRoam' | 'race';

/** A saved map in your list. */
export interface CustomMapInfo {
  id: string;
  name: string;
  /** the built-in map it was started from ('' = an empty map) */
  base: string;
  updatedAt: number;
  /** the published official edit of `base` (admins; id 'official:<map>') */
  official?: boolean;
}

/** One version in a built-in map's official edit history (newest first). */
export interface OfficialVersion {
  /** version number (grows with every publish / restore / undo) */
  id: number;
  action: 'publish' | 'restore' | 'undo';
  /** '' = the original map */
  hash: string;
  by: string;
  at: number;
  /** the version everyone plays now */
  active: boolean;
}

/** A room's map when it isn't a plain built-in map (sent in 'roomJoined'). */
export interface RoomCustomMap {
  /** 'official': the published edit of the built-in map; 'custom': a player's map */
  kind: 'official' | 'custom';
  doc: CustomMapDoc;
  /** customMapHash(doc): the version (clients rebuild when it differs) */
  hash: string;
  /** the saved map's id (absent: an unsaved map) */
  id?: string;
  name: string;
}

/** Map id of the published official edit in a map list ('official:split-deck'). */
export const OFFICIAL_PREFIX = 'official:';

/** A version tag of a doc (64-bit FNV-1a of its JSON, hex). Same doc, same hash. */
export const customMapHash = (doc: CustomMapDoc): string => {
  const s = JSON.stringify(doc);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
};

const levelCache = new Map<string, LevelDef>();

/**
 * The LevelDef a room plays: the built-in map for its team size, that map with a patch doc
 * applied (an official edit, or a player's edit of it), or a player's whole map compiled.
 * Cached by hash (treat as read-only).
 */
export const roomLevelDef = (
  map: string,
  teamSize: number,
  custom?: { doc: CustomMapDoc; hash: string } | null,
): LevelDef => {
  if (!custom) return mapDefForSize(map, teamSize);
  const key = `${custom.hash}|${map}|${teamSize}`;
  const hit = levelCache.get(key);
  if (hit) return hit;
  const d: LevelDef = custom.doc.patch
    ? applyCustomPatch(mapDefForSize(custom.doc.base || map, teamSize), custom.doc)
    : compileCustomMap(custom.doc);
  if (levelCache.size >= 24) levelCache.delete(levelCache.keys().next().value!);
  levelCache.set(key, d);
  return d;
};
