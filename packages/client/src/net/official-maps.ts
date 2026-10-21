// The official edits of the built-in maps on this device, so offline modes (practice, free roam,
// races vs bots, Brawl / Arena practice) play the same edited maps as the online rooms. The
// server lists them after the hello ('officialMaps': map id -> version hash); a version we don't
// have yet is fetched and kept in the browser (offline play keeps working). Online rooms don't
// use this: they send their own doc in 'roomJoined'.
import type { CustomMapDoc, LevelDef, NetCore } from '@space-yz/shared';
import { mapDef, mapDefForSize, roomLevelDef } from '@space-yz/shared';
import { mapRequest } from './map-link';

const KEY = 'spaceyz.officialMaps';

type Cached = Record<string, { hash: string; doc: CustomMapDoc }>;

const load = (): Cached => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Cached) : {};
  } catch {
    return {};
  }
};

const cache: Cached = load();

const save = (): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* full or private mode: kept in memory only */
  }
};

/** Keep the cache in step with the server's list (call once per connection). */
export const attachOfficialMaps = (core: NetCore): void => {
  const sync = async (list: Record<string, string>) => {
    let changed = false;
    for (const map of Object.keys(cache))
      if (!list[map]) {
        delete cache[map];
        changed = true;
      }
    if (changed) save();
    for (const [map, hash] of Object.entries(list)) {
      if (cache[map]?.hash === hash) continue;
      try {
        const r = await mapRequest(core, { op: 'loadOfficial', map });
        // (it may have changed again meanwhile: the next list fixes that)
        if (r.doc && core.officialMaps[map] === hash) {
          cache[map] = { hash, doc: r.doc };
          save();
        }
      } catch {
        /* offline modes play the original until it arrives */
      }
    }
  };
  core.listen((m) => {
    if (m.t === 'officialMaps') void sync(m.data);
  });
};

/** The official edit of a built-in map this device has (null: plays the original). */
export const officialEdit = (mapId: string): { doc: CustomMapDoc; hash: string } | null =>
  cache[mapId] ?? null;

/**
 * A built-in map as offline modes should play it: with its official edit when there is one
 * (`teamSize`: the size-walls version, as mapDefForSize; omitted: the whole map, as mapDef).
 */
export const officialMapDef = (mapId: string, teamSize?: number): LevelDef => {
  const plain = () => (teamSize === undefined ? mapDef(mapId) : mapDefForSize(mapId, teamSize));
  const o = cache[mapId];
  if (!o) return plain();
  try {
    return roomLevelDef(mapId, teamSize ?? 5, o);
  } catch {
    return plain();
  }
};
