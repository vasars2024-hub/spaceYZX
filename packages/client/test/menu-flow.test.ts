import { describe, expect, it } from 'vitest';
import {
  BOT_SKILL_NAMES,
  MAPS,
  SURF_MODES,
  mapDef,
  raceMaps,
  surfMaps,
  type LevelDef,
  type MapInfo,
  type QueueCounts,
} from '@space-yz/shared';
import {
  ARENA_ENABLED,
  BOT_SKILL_DESC,
  BRAWL_FFA_ROOM_SIZES,
  QUICK_PLAY_OFFLINE,
  defaultNickname,
  quickPlayMode,
  isBrawlPractice,
  isFreeRoam,
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
  rankedCards,
  rankedQueueName,
  countdown,
  standingText,
  roomBack,
  roomCreateArgs,
  roomMaps,
  MAP_BLURBS,
  mapName,
  raceMapGroups,
  raceMapSections,
  sizesFor,
  stepAfter,
  stepBefore,
  surfModeGroups,
  surfModeTag,
} from '../src/ui/flow';
import { ICONS } from '../src/ui/icons';
import { queueCountText } from '../src/ui/ranked';

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
    expect(ids).toEqual([
      'brawl',
      'brawl-ffa',
      'match',
      'bomb',
      'elim',
      'cs',
      'deathmatch',
      'freeroam',
      'race',
    ]);
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
    const all = MAPS.filter((m) => !m.arena && !m.race).map((m) => m.id);
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

  it('never offers a race track outside races, and races only on race tracks', () => {
    for (const mode of ['match', 'bomb', 'elim', 'cs', 'deathmatch', 'arena'] as const)
      expect(mapsForMode(mode).some((m) => m.race)).toBe(false);
    for (const o of ['tower', 'bomb', 'elim', 'cs', 'elim-cs', 'arena'] as const) {
      const { best, other } = roomMaps(o);
      expect([...best, ...other].some((m) => m.race)).toBe(false);
    }
    const tracks = mapsForMode('race').map((m) => m.id);
    expect(tracks.slice(0, 3)).toEqual(['race-sunspire', 'race-neon', 'race-ember']);
    expect(tracks.sort()).toEqual(
      raceMaps()
        .map((m) => m.id)
        .sort(),
    );
    // (online: the race tracks first, the surf maps apart, Beginner before Intermediate)
    expect(roomMaps('race')).toEqual({
      best: mapsForMode('race').filter((m) => !m.surf),
      other: surfMaps(),
    });
  });

  it('race: a practice mode (time trial or bot racers) and a room objective', () => {
    expect(sizesFor('race')).toEqual([1, 2, 4, 8]);
    expect(hasKitChoice('race')).toBe(false);
    expect(practiceSteps('race')).toEqual(['mode', 'map', 'setup']);
    const p = pickPracticeMode(initialPractice(), 'race');
    expect(p.map).toBe('race-sunspire');
    expect(p.step).toBe('map');
    expect(practiceMapId(pickPracticeMap(p, 'race-neon'))).toBe('race-neon');
    expect(ICONS[modeChoice('race').icon]).toBeTruthy();
    const r = pickRoomObjective(initialRoom(), 'race');
    expect(r.map).toBe('race-sunspire');
    expect(
      roomCreateArgs({ ...pickRoomMap(r, 'race-neon'), size: '5v5', bots: true }),
    ).toMatchObject({ mode: 'race', map: 'race-neon', bots: 7 });
    expect(roomCreateArgs({ ...r, size: '1v1', bots: false })).toMatchObject({
      mode: 'race',
      bots: 0,
    });
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

  it('ranked is four cards: Premier, Premier CS, Duels (1v1 + 2v2, one rating), Race; no Arena', () => {
    const cards = rankedCards();
    expect(cards.map((c) => c.ladder)).toEqual(['premier', 'premier-cs', 'duels', 'race']);
    expect(cards[3].queues).toEqual([{ id: 'race', label: 'Race' }]);
    expect(cards[0].queues.map((q) => q.id)).toEqual(['premier']);
    expect(cards[1].queues.map((q) => q.id)).toEqual(['premier-cs']);
    expect(cards[2].queues.map((q) => [q.id, q.label])).toEqual([
      ['duels-1v1', '1v1'],
      ['duels-2v2', '2v2'],
    ]);
    expect(cards.flatMap((c) => c.queues).some((q) => q.id.includes('arena'))).toBe(false);
    expect(rankedQueueName('premier')).toBe('Premier');
    expect(rankedQueueName('premier-cs')).toBe('Premier CS');
    expect(rankedQueueName('duels-2v2')).toBe('Duels 2v2');
    expect(rankedQueueName('race')).toBe('Race');
  });

  it('queue cards show live numbers, the size that forms, or why they are closed', () => {
    const counts = {
      online: 12,
      ranked: {
        premier: { searching: 8, open: true, threshold: 20, forms: 4 },
        'premier-cs': { searching: 0, open: false, threshold: 35, forms: null },
        'duels-1v1': { searching: 1, open: true, threshold: 0, forms: 1 },
        'duels-2v2': { searching: 3, open: true, threshold: 0, forms: null },
        race: { searching: 0, open: true, threshold: 0, forms: null },
      },
      casual: {},
    } as unknown as QueueCounts;
    expect(queueCountText('premier', counts).text).toBe('8 searching · 4v4 ready');
    expect(queueCountText('premier-cs', counts)).toEqual({
      text: 'Opens at 35 online · now 12',
      open: false,
    });
    expect(queueCountText('premier-cs', counts, 'Hours: Fri–Sun 18:00–23:00').text).toBe(
      'Opens at 35 online · now 12 or Hours: Fri–Sun 18:00–23:00',
    );
    expect(queueCountText('duels-1v1', counts).text).toBe('1 searching');
    expect(
      queueCountText('premier', {
        ...counts,
        ranked: {
          ...counts.ranked,
          premier: { searching: 2, open: true, threshold: 0, forms: null },
        },
      }).text,
    ).toBe('2 searching · 6 needed for 3v3');
  });

  it('ranked texts: countdown and placement', () => {
    expect(countdown(2 * 3600 + 13 * 60 + 5)).toBe('2h 13m');
    expect(countdown(13 * 60 + 5)).toBe('13m 05s');
    expect(countdown(3 * 86400 + 4 * 3600)).toBe('3d 4h');
    expect(countdown(-5)).toBe('0m 00s');
    const placing = {
      rating: null,
      placed: false,
      placement: { done: 2, need: 5, unit: 'wins' as const },
      rank: null,
    };
    expect(standingText(placing)).toBe('Placement 2/5 wins');
    expect(
      standingText({
        ...placing,
        rating: 1240,
        placed: true,
        rank: { label: 'Planet', color: '#4f8dff' },
      }),
    ).toBe('1240 · Planet');
  });
});

describe('menu flow: Brawl and one-click Play', () => {
  it('Brawl practice: TDM team sizes, FFA player counts, maps from the rotation', () => {
    expect(isBrawlPractice('brawl')).toBe(true);
    expect(isBrawlPractice('deathmatch')).toBe(false);
    expect(sizesFor('brawl')).toEqual([2, 3, 4, 5]);
    expect(sizesFor('brawl-ffa')).toEqual([4, 6, 8, 10]);
    for (const mode of ['brawl', 'brawl-ffa'] as const) {
      const maps = mapsForMode(mode).map((m) => m.id);
      expect(maps).toContain('training-bay');
      expect(maps).toContain('split-deck');
      expect(mapsForMode(mode).some((m) => m.arena || m.race)).toBe(false);
      expect(practiceSteps(mode)).toEqual(['mode', 'map', 'setup']);
      expect(ICONS[modeChoice(mode).icon]).toBeTruthy();
    }
    // a size that doesn't fit the mode: its quick-play default
    expect(pickPracticeMode({ ...initialPractice(), size: 1 }, 'brawl').size).toBe(
      QUICK_PLAY_OFFLINE.tdm,
    );
    expect(pickPracticeMode({ ...initialPractice(), size: 1 }, 'brawl-ffa').size).toBe(
      QUICK_PLAY_OFFLINE.ffa,
    );
    const s = pickPracticeMap(pickPracticeMode(initialPractice(), 'brawl-ffa'), 'kestrel');
    expect(practiceMapId(s)).toBe('kestrel');
  });

  it('Brawl rooms online: rotation maps only, bots fill TDM teams / FFA player counts', () => {
    const ids = ROOM_OBJECTIVES.map((o) => o.id);
    expect(ids).toContain('brawl');
    expect(ids).toContain('brawl-ffa');
    const r = pickRoomObjective(initialRoom(), 'brawl');
    const { best, other } = roomMaps('brawl');
    expect(other).toEqual([]);
    expect(best.some((m) => m.id === r.map)).toBe(true);
    expect(roomCreateArgs({ ...r, size: '3v3', bots: true })).toMatchObject({
      mode: 'brawl',
      bots: 5,
      loadout: 'lethal',
    });
    const f = pickRoomObjective(initialRoom(), 'brawl-ffa');
    expect(roomCreateArgs({ ...f, size: '5v5', bots: true })).toMatchObject({
      mode: 'brawl-ffa',
      bots: BRAWL_FFA_ROOM_SIZES['5v5'].players - 1,
    });
    expect(roomCreateArgs({ ...f, bots: false }).bots).toBe(0);
  });

  it('Play: the switch picks the playlist, first-timers get a nickname', () => {
    expect(quickPlayMode('tdm')).toBe('brawl');
    expect(quickPlayMode('ffa')).toBe('brawl-ffa');
    expect(defaultNickname(() => 0)).toBe('Pilot1000');
    expect(defaultNickname(() => 0.9999)).toMatch(/^Pilot\d{4}$/);
    expect(defaultNickname().length).toBeLessThanOrEqual(16);
  });
});

describe('menu flow: free roam', () => {
  it('any map, a kit choice, no opponents to set up', () => {
    expect(mapsForMode('freeroam').map((m) => m.id)).toEqual(MAPS.map((m) => m.id));
    expect(hasKitChoice('freeroam')).toBe(true);
    expect(isFreeRoam('freeroam')).toBe(true);
    expect(isFreeRoam('deathmatch')).toBe(false);
    expect(sizesFor('freeroam')).toEqual([1]);
    expect(practiceSteps('freeroam')).toEqual(['mode', 'map', 'setup']);
    const track = MAPS.find((m) => m.race)?.id ?? 'kestrel';
    const s = pickPracticeMap(pickPracticeMode(initialPractice(), 'freeroam'), track);
    expect(practiceMapId(s)).toBe(track);
    expect(ICONS[modeChoice('freeroam').icon]).toBeTruthy();
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

describe('menu flow: surf maps by mode', () => {
  // made-up race maps (the real surf maps come and go while they are being built)
  const race = (id: string, extra: Partial<MapInfo> = {}): MapInfo => ({
    id,
    name: id,
    build: () => mapDef('training-bay'),
    competitive: false,
    race: true,
    ...extra,
  });
  const maps: MapInfo[] = [
    race('track-a'),
    race('surf-i1', { surf: true, mode: 'intermediate' }),
    race('surf-b1', { surf: true, mode: 'beginner' }),
    race('track-b'),
    race('surf-b2', { surf: true, mode: 'beginner' }),
    race('surf-x', { surf: true }),
    { id: 'combat', name: 'Combat', build: () => mapDef('split-deck'), competitive: true },
  ];

  it('groups the surf maps Beginner, then Intermediate (then any without a mode)', () => {
    const groups = surfModeGroups(maps);
    expect(groups.map((g) => [g.label, g.maps.map((m) => m.id)])).toEqual([
      ['Beginner', ['surf-b1', 'surf-b2']],
      ['Intermediate', ['surf-i1']],
      ['Other', ['surf-x']],
    ]);
    expect(groups.map((g) => g.color)).toEqual([SURF_MODES[0].color, SURF_MODES[1].color, null]);
    // modes without maps are left out (none at all: no groups)
    expect(
      surfModeGroups(maps.filter((m) => m.mode !== 'intermediate')).map((g) => g.label),
    ).toEqual(['Beginner', 'Other']);
    expect(surfModeGroups(maps.filter((m) => !m.surf))).toEqual([]);
  });

  it('race pickers and best-time lists: the race tracks first, then the surf maps by mode', () => {
    expect(raceMapGroups(maps).best.map((m) => m.id)).toEqual(['track-a', 'track-b']);
    expect(raceMapGroups(maps).other.map((m) => m.id)).toEqual([
      'surf-b1',
      'surf-b2',
      'surf-i1',
      'surf-x',
    ]);
    expect(roomMaps('race', maps)).toEqual(raceMapGroups(maps));
    expect(raceMapSections(maps).map((g) => [g.label, g.maps.length])).toEqual([
      [null, 2],
      ['Beginner', 2],
      ['Intermediate', 1],
      ['Other', 1],
    ]);
    // (the real registry works the same, with any number of surf maps)
    expect(
      raceMapSections()
        .flatMap((g) => g.maps)
        .map((m) => m.id)
        .sort(),
    ).toEqual(
      raceMaps()
        .map((m) => m.id)
        .sort(),
    );
  });

  it('a surf map shows its mode as a word with its colour; other maps have no tag', () => {
    expect(surfModeTag(maps[2])).toEqual({ label: 'Beginner', color: '#5dd39e' });
    expect(surfModeTag(maps[1])).toEqual({ label: 'Intermediate', color: '#f2a93b' });
    expect(surfModeTag(maps[0])).toBeNull();
    expect(surfModeTag(maps[5])).toBeNull();
    expect(surfModeTag(undefined)).toBeNull();
    for (const m of surfMaps()) expect(surfModeTag(m)?.label).toBeTruthy();
  });

  it('removed maps are named as removed, never as Training Bay; no blurbs for them', () => {
    expect(mapName('surf-aurora')).toBe('Removed map');
    expect(mapName('surf-cinder')).toBe('Removed map');
    expect(mapName('race-sunspire')).toBe('Sunspire');
    for (const id of ['surf-aurora', 'surf-cinder']) expect(MAP_BLURBS[id]).toBeUndefined();
    expect(MAP_BLURBS['surf-copper-reef']).toMatch(/^Surf, Beginner/);
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
