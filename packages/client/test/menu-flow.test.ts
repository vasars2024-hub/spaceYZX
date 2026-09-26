import { describe, expect, it } from 'vitest';
import { BOT_SKILL_NAMES, MAPS, mapDef, type LevelDef, type MapInfo } from '@space-yz/shared';
import {
  ARENA_ENABLED,
  BOT_SKILL_DESC,
  ROOM_OBJECTIVES,
  ROOM_SIZES,
  hasKitChoice,
  initialPractice,
  initialRoom,
  mapTags,
  mapsForMode,
  modeChoice,
  pickPracticeMap,
  pickPracticeMode,
  pickRoomMap,
  pickRoomObjective,
  practiceBack,
  practiceMapId,
  practiceModes,
  practiceSteps,
  rankedQueues,
  roomBack,
  roomCreateArgs,
  roomMaps,
  sizesFor,
  stepAfter,
  stepBefore,
} from '../src/ui/flow';
import { ICONS } from '../src/ui/icons';

describe('menu flow: steps', () => {
  it('moves forward and back through a list of steps', () => {
    const steps = ['a', 'b', 'c'];
    expect(stepAfter(steps, 'a')).toBe('b');
    expect(stepAfter(steps, 'c')).toBe('c');
    expect(stepBefore(steps, 'c')).toBe('b');
    expect(stepBefore(steps, 'a')).toBeNull();
  });
});

describe('menu flow: practice wizard', () => {
  it('goes mode → map → setup, and back one step at a time until it leaves', () => {
    let s = initialPractice();
    expect(s.step).toBe('mode');
    s = pickPracticeMode(s, 'match');
    expect(s.step).toBe('map');
    s = pickPracticeMap(s, 'kestrel');
    expect(s).toMatchObject({ step: 'setup', map: 'kestrel' });
    s = practiceBack(s)!;
    expect(s.step).toBe('map');
    s = practiceBack(s)!;
    expect(s.step).toBe('mode');
    expect(practiceBack(s)).toBeNull(); // back from the first step leaves the menu
  });

  it('free fight skips the map step and always plays the Training Bay', () => {
    const s = pickPracticeMode({ ...initialPractice(), map: 'kestrel' }, 'deathmatch');
    expect(practiceSteps('deathmatch')).toEqual(['mode', 'setup']);
    expect(s.step).toBe('setup');
    expect(practiceMapId(s)).toBe('training-bay');
    expect(practiceBack(s)?.step).toBe('mode');
  });

  it('only offers maps that have what the mode needs', () => {
    for (const m of mapsForMode('match')) {
      expect(getInfo(m.id).competitive).toBe(true);
      expect(mapDef(m.id).towers.length).toBeGreaterThan(0);
    }
    for (const mode of ['bomb', 'cs'] as const) {
      const maps = mapsForMode(mode);
      expect(maps.length).toBeGreaterThan(0);
      for (const m of maps) expect(mapDef(m.id).bombSites?.length ?? 0).toBeGreaterThan(0);
    }
    expect(mapsForMode('deathmatch').map((m) => m.id)).toEqual(['training-bay']);
    expect(mapsForMode('match').some((m) => m.id === 'training-bay')).toBe(false);
    // Elimination needs nothing from a map: every competitive map
    expect(mapsForMode('elim').map((m) => m.id)).toEqual(
      MAPS.filter((m) => m.competitive && !m.arena).map((m) => m.id),
    );
    for (const id of ['split-deck', 'kestrel', 'orbital-ring'])
      expect(mapsForMode('elim').some((m) => m.id === id)).toBe(true);
  });

  it('keeps a valid map when switching mode, else picks the first valid one', () => {
    const fake = fakeMaps();
    const defOf = (id: string) => fake.defs[id];
    let s = pickPracticeMode(initialPractice(), 'match', fake.maps, defOf);
    s = { ...pickPracticeMap(s, 'towers-and-sites'), step: 'mode' };
    expect(pickPracticeMode(s, 'bomb', fake.maps, defOf).map).toBe('towers-and-sites');
    s = { ...s, map: 'towers-only' };
    expect(pickPracticeMode(s, 'bomb', fake.maps, defOf).map).toBe('towers-and-sites');
    expect(mapsForMode('bomb', fake.maps, defOf).map((m) => m.id)).toEqual(['towers-and-sites']);
    expect(mapsForMode('match', fake.maps, defOf).map((m) => m.id)).toEqual([
      'towers-only',
      'towers-and-sites',
    ]);
  });

  it('lists the five modes (Arena only behind its flag) with icons', () => {
    const ids = practiceModes(false).map((m) => m.id);
    expect(ids).toEqual(['match', 'bomb', 'elim', 'cs', 'deathmatch']);
    expect(modeChoice('elim').desc).toMatch(/Last team standing wins the round/);
    expect(practiceModes(true).map((m) => m.id)).toContain('arena');
    expect(practiceModes().some((m) => m.id === 'arena')).toBe(ARENA_ENABLED);
    for (const m of practiceModes(true)) expect(ICONS[m.icon]).toBeTruthy();
  });

  it('offers 3v3, and a kit choice for Elimination and the Arena', () => {
    expect(sizesFor('elim')).toContain(3);
    expect(sizesFor('match')).toEqual([1, 2, 3, 5]);
    expect(hasKitChoice('elim')).toBe(true);
    expect(hasKitChoice('arena')).toBe(true);
    expect(hasKitChoice('match')).toBe(false);
    expect(hasKitChoice('bomb')).toBe(false);
  });

  it('has a description for every bot difficulty', () => {
    for (const b of BOT_SKILL_NAMES) expect(BOT_SKILL_DESC[b].length).toBeGreaterThan(10);
  });
});

describe('menu flow: online room wizard', () => {
  it('goes objective → map → room and back', () => {
    let s = pickRoomObjective(initialRoom(), 'bomb');
    expect(s.step).toBe('map');
    expect(mapDef(s.map).bombSites?.length ?? 0).toBeGreaterThan(0);
    s = pickRoomMap(s, s.map);
    expect(s.step).toBe('room');
    expect(roomBack(s)?.step).toBe('map');
    expect(roomBack(roomBack(s)!)?.step).toBe('objective');
    expect(roomBack(roomBack(roomBack(s)!)!)).toBeNull();
  });

  it('still offers every non-Arena map online (objective maps first)', () => {
    const { best, other } = roomMaps('tower');
    const all = MAPS.filter((m) => !m.arena).map((m) => m.id);
    expect([...best, ...other].map((m) => m.id).sort()).toEqual(all.sort());
    expect(best.every((m) => m.competitive)).toBe(true);
  });

  it('never offers an Arena map outside the Arena', () => {
    for (const mode of ['match', 'bomb', 'elim', 'cs', 'deathmatch'] as const)
      expect(mapsForMode(mode).some((m) => m.arena)).toBe(false);
    expect(mapsForMode('arena').every((m) => m.arena)).toBe(true);
    for (const o of ['tower', 'bomb', 'elim', 'cs', 'elim-cs'] as const) {
      const { best, other } = roomMaps(o);
      expect([...best, ...other].some((m) => m.arena)).toBe(false);
    }
  });

  it('turns the choices into createRoom arguments (CS = bomb rules + CS loadout)', () => {
    const s = { ...initialRoom(), objective: 'cs' as const, size: '2v2' as const, bots: true };
    expect(roomCreateArgs(s)).toMatchObject({
      mode: '2v2',
      bots: 3,
      objective: 'bomb',
      loadout: 'cs',
    });
    expect(roomCreateArgs({ ...s, objective: 'tower', bots: false })).toMatchObject({
      bots: 0,
      objective: 'tower',
      loadout: 'lethal',
    });
  });

  it('offers Elimination (both kits) next to Tower / Bomb, and 3v3 rooms', () => {
    const ids = ROOM_OBJECTIVES.map((o) => o.id);
    expect(ids.slice(0, 3)).toEqual(['tower', 'bomb', 'elim']);
    expect(ids).toContain('elim-cs');
    for (const o of ROOM_OBJECTIVES) expect(ICONS[o.icon]).toBeTruthy();
    expect(ROOM_OBJECTIVES.find((o) => o.id === 'elim')!.desc).toBe(
      'Last team standing wins the round.',
    );
    expect(ROOM_SIZES).toEqual(['1v1', '2v2', '3v3', '5v5']);
    const s = { ...initialRoom(), objective: 'elim' as const, size: '3v3' as const, bots: true };
    expect(roomCreateArgs(s)).toMatchObject({
      mode: '3v3',
      bots: 5,
      objective: 'elim',
      loadout: 'lethal',
    });
    expect(roomCreateArgs({ ...s, objective: 'elim-cs' })).toMatchObject({
      objective: 'elim',
      loadout: 'cs',
    });
    // Elimination suggests every competitive map (it needs no Towers or sites)
    const best = roomMaps('elim').best.map((m) => m.id);
    for (const id of ['split-deck', 'kestrel', 'orbital-ring']) expect(best).toContain(id);
    expect(pickRoomObjective(initialRoom(), 'elim-cs').step).toBe('map');
    // (Arena rooms: the 3v3 card means six players in all)
    expect(
      roomCreateArgs({ ...initialRoom(), objective: 'arena', size: '3v3', bots: true }),
    ).toMatchObject({ mode: 'arena', bots: 5 });
  });

  it('ranked has the three queues, plus Arena only behind its flag', () => {
    expect(rankedQueues(false).map((q) => q.mode)).toEqual(['1v1', '2v2', '5v5']);
    // Arena: one queue per kit, both on the 'arena' ladder
    expect(rankedQueues(true).length).toBe(5);
    expect(
      rankedQueues(true)
        .filter((q) => q.mode === 'arena')
        .map((q) => q.loadout),
    ).toEqual(['lethal', 'cs']);
  });
});

describe('menu flow: map tags', () => {
  it('names what a map has', () => {
    const tags = mapTags(mapDef('split-deck'));
    expect(tags).toContain('Towers');
    expect(tags.some((t) => t.startsWith('Bomb sites'))).toBe(true);
    expect(mapTags(mapDef('training-bay'))).toEqual([]);
    const orbital = mapTags(mapDef('orbital-ring'));
    for (const t of ['Towers', 'Portals', 'Launch pads']) expect(orbital).toContain(t);
  });
});

const getInfo = (id: string): MapInfo => MAPS.find((m) => m.id === id)!;

/** Two made-up competitive maps: one with Towers only, one with Towers and bomb sites. */
const fakeMaps = () => {
  const base = mapDef('split-deck');
  const towersOnly: LevelDef = { ...base, bombSites: [] };
  const both: LevelDef = base;
  const defs: Record<string, LevelDef> = {
    'towers-only': towersOnly,
    'towers-and-sites': both,
    bay: mapDef('training-bay'),
  };
  const maps: MapInfo[] = [
    { id: 'bay', name: 'Bay', build: () => defs.bay, competitive: false },
    { id: 'towers-only', name: 'T', build: () => towersOnly, competitive: true },
    { id: 'towers-and-sites', name: 'TS', build: () => both, competitive: true },
  ];
  return { maps, defs };
};
