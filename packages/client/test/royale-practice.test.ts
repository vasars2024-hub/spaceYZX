import { describe, expect, it } from 'vitest';
import {
  MAPS,
  ROYALE_DEFAULTS,
  defaultConfig,
  mapDef,
  royaleView,
  royaleZoneAt,
  yawToView,
  type LevelDef,
  type RoyaleView,
} from '@space-yz/shared';
import { createRoyalePractice } from '../src/game/royale-entry';
import {
  flashText,
  placeText,
  royaleFromExtra,
  royaleResultTitle,
  royaleZoneDraw,
  winStars,
  zoneStatusText,
} from '../src/game/royale-feature';
import {
  mapsForMode,
  practiceModes,
  roomCreateArgs,
  roomObjectives,
  initialRoom,
  pickRoomObjective,
  sizesFor,
} from '../src/ui/flow';
import { ROYALE_TEST_MAP, royaleTestDef, royaleTestMapInfo } from '../../shared/test/royale-map';

const idle = () => ({ buttons: 0, view: yawToView(0) });
const withTest = [...MAPS, royaleTestMapInfo()];
const defOf = (id: string): LevelDef => (id === ROYALE_TEST_MAP ? royaleTestDef() : mapDef(id));

describe('offline Royale vs bots', () => {
  it('you and the bots on spread-out spawns, every bot an enemy; the zone and the flashes', () => {
    const s = createRoyalePractice({
      size: 6,
      skill: 'rookie',
      levelDef: royaleTestDef(),
      map: ROYALE_TEST_MAP,
      config: defaultConfig(),
    });
    expect(s.ctx.ffa).toBe(true);
    expect(s.world().players.length).toBe(6);
    expect(s.others().every((p) => p.team === 1)).toBe(true);
    expect(s.royale.phase).toBe('countdown');
    expect(s.world().players.every((p) => p.frozen)).toBe(true);
    for (let i = 0; i < 60 * (ROYALE_DEFAULTS.countdownSec + 1); i++) s.update(1 / 60, idle);
    expect(s.royale.phase).toBe('live');
    const z = s.zone();
    expect(z).not.toBeNull();
    expect(z!.radius).toBe(royaleTestDef().royale!.radius);
    expect(z!.next!.radius).toBeLessThan(z!.radius);
    // the first location flash shows everyone
    const st = s.royale;
    for (let i = 0; i < 60 * 60 && !st.revealed.length; i++) s.update(1 / 60, idle);
    expect(st.revealed.length).toBeGreaterThan(1);
    const alive = s.others().filter((p) => p.alive);
    expect(alive.length).toBeGreaterThan(0);
    expect(alive.every((p) => p.revealed)).toBe(true);
  });
});

describe('Royale HUD lines', () => {
  it('reads the online rules state only in Royale rooms', () => {
    expect(royaleFromExtra({ rules: 'brawl' })).toBeNull();
    expect(royaleFromExtra(null)).toBeNull();
    expect(royaleFromExtra({ rules: 'royale', phase: 'lobby' })?.phase).toBe('lobby');
  });

  it('zone, flash, place and round-win lines', () => {
    const s = createRoyalePractice({
      size: 5,
      skill: 'rookie',
      levelDef: royaleTestDef(),
      map: ROYALE_TEST_MAP,
      config: defaultConfig(),
    });
    const v = royaleView(s.royale, s.world(), ROYALE_TEST_MAP);
    const plan = v.zone!;
    const s0 = plan.stages[0];
    expect(
      zoneStatusText(royaleZoneAt(plan, s0.shrinkStart - 60 * 42), s0.shrinkStart - 60 * 42),
    ).toBe('ZONE CLOSES IN 0:42');
    expect(zoneStatusText(royaleZoneAt(plan, s0.shrinkStart + 1), s0.shrinkStart + 1)).toMatch(
      /^ZONE CLOSING /,
    );
    const end = plan.stages[plan.stages.length - 1].shrinkEnd;
    expect(zoneStatusText(royaleZoneAt(plan, end + 1), end + 1)).toBe('ZONE CLOSED');
    expect(royaleZoneDraw(v, s0.waitStart)?.next?.radius).toBe(s0.radius);
    expect(royaleZoneDraw({ ...v, phase: 'lobby' }, 0)).toBeNull();
    const live: RoyaleView = { ...v, phase: 'live', nextFlash: 600, revealed: [] };
    expect(flashText(live, 0)).toBe('Next location flash in 10 s');
    expect(flashText({ ...live, revealed: [2, 3], flashUntil: 90 }, 10)).toBe('LOCATIONS REVEALED');
    expect(placeText(3, 8)).toBe('#3 of 8');
    expect(winStars(1, 3)).toBe('★☆☆');
    const name = (id: number) => `P${id}`;
    expect(royaleResultTitle({ ...v, phase: 'roundEnd', roundWinner: 1 }, 1, name).text).toBe(
      'YOU WIN THE ROUND',
    );
    expect(
      royaleResultTitle({ ...v, phase: 'roundEnd', round: 2, roundWinner: 3 }, 1, name).text,
    ).toBe('P3 WINS ROUND 2');
    expect(royaleResultTitle({ ...v, phase: 'end', winner: 1 }, 1, name).won).toBe(true);
  });
});

describe('Royale in the menus', () => {
  it('only offered while a map has royale data (5–10 players)', () => {
    expect(practiceModes(true).some((m) => m.id === 'royale')).toBe(true);
    expect(mapsForMode('royale').map((m) => m.id)).toEqual(['shibuya']);
    const withoutRoyale = MAPS.filter((m) => !m.royale);
    expect(practiceModes(true, withoutRoyale).some((m) => m.id === 'royale')).toBe(false);
    expect(roomObjectives(withoutRoyale).some((o) => o.id === 'royale')).toBe(false);
    expect(practiceModes(true, withTest, defOf).some((m) => m.id === 'royale')).toBe(true);
    expect(mapsForMode('royale', withTest, defOf).map((m) => m.id)).toEqual([
      'shibuya',
      ROYALE_TEST_MAP,
    ]);
    expect(sizesFor('royale')).toEqual([5, 6, 8, 10]);
    expect(roomObjectives().some((o) => o.id === 'royale')).toBe(true);
  });

  it('a Royale room: up to 10 players, bots fill it', () => {
    const s = pickRoomObjective(initialRoom(), 'royale');
    expect(s.map).toBe('shibuya');
    const a = roomCreateArgs({ ...s, size: '5v5', bots: true });
    expect(a).toMatchObject({ mode: 'royale', map: 'shibuya', bots: 9 });
    expect(roomCreateArgs({ ...s, size: '1v1', bots: true }).bots).toBe(4);
    expect(roomCreateArgs({ ...s, bots: false }).bots).toBe(0);
  });
});
