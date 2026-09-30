// The minimap (game/minimap-model.ts, game/minimap-nav.ts): what your route leads to, the
// walking route itself on every map (built-in, Map Maker edits, player-made maps), the map
// sliced at your height, and which enemies it may show.
import { describe, expect, it } from 'vitest';
import {
  MAPS,
  applyCustomPatch,
  buildLevel,
  compileCustomMap,
  len,
  mapDef,
  mapDefForSize,
  sub,
  v3,
  type CustomMapDoc,
  type MatchView,
  type Vec3,
} from '@space-yz/shared';
import {
  enemyShown,
  goalFor,
  siteCenter,
  sliceMap,
  type GoalInput,
} from '../src/game/minimap-model';
import { findRoute } from '../src/game/minimap-nav';

const pathLen = (pts: Vec3[]) => pts.reduce((s, p, i) => (i ? s + len(sub(p, pts[i - 1])) : 0), 0);

describe('minimap routes on every map', () => {
  // every map with teams (and every map added later): from each side's spawns to the things a
  // match sends you to — the bomb sites and the Towers
  const maps = MAPS.filter((m) => (m.competitive || m.brawl) && !m.arena && !m.race);
  it.each(maps.map((m) => m.id))('%s: routes from both spawns to every site and Tower', (id) => {
    const def = mapDef(id);
    const level = buildLevel(def);
    for (const team of [0, 1] as const) {
      const spawn = def.spawns.find((s) => s.team === team) ?? def.spawns[0];
      const goals: Vec3[] = [
        ...(def.bombSites ?? []).map(siteCenter),
        ...def.towers.map((t) => (t.hanging ? v3(t.pos.x, t.pos.y + 1, t.pos.z) : t.pos)),
      ];
      // a Brawl map: to the far side's spawns and the power-ups instead
      if (!goals.length) {
        const far = def.spawns.filter((s) => s.team !== team);
        goals.push(far[0].pos, ...(def.powerups ?? []).slice(0, 2));
      }
      for (const goal of goals) {
        const r = findRoute(level, spawn.pos, goal);
        expect(r, `${id}: team ${team} spawn → ${JSON.stringify(goal)}`).not.toBeNull();
        expect(r!.points[0]).toEqual(spawn.pos);
        expect(r!.points[r!.points.length - 1]).toEqual(goal);
        // a route, not a wander (well under 4× the straight line, or not long anyway)
        const direct = len(sub(goal, spawn.pos));
        // (Antipode: the goal overhead on the other deck is a walk round through the Spindle)
        expect(r!.length).toBeLessThan(Math.max(160, direct * 4));
        expect(r!.length).toBeCloseTo(pathLen(r!.points), 5);
      }
    }
  });

  it('Antipode: the route to the Tower on the ceiling deck crosses over (waypoints know the gravity)', () => {
    const def = mapDef('antipode');
    const level = buildLevel(def);
    const cyan = def.spawns.find((s) => s.team === 0)!;
    const tower = def.towers.find((t) => t.team === 1)!;
    const r = findRoute(level, cyan.pos, v3(tower.pos.x, tower.pos.y + 1, tower.pos.z))!;
    expect(r.kind).toBe('waypoints');
    // from the floor deck up to the ceiling one
    expect(Math.min(...r.points.map((p) => p.y))).toBeLessThan(2);
    expect(Math.max(...r.points.map((p) => p.y))).toBeGreaterThan(20);
  });
});

describe('minimap routes on changed and player-made maps', () => {
  const floor = (id: number, pos: [number, number, number], size: [number, number, number]) => ({
    id,
    shape: 'box' as const,
    pos,
    size,
    mat: 'concrete' as const,
  });
  const doc = (more: Partial<CustomMapDoc>): CustomMapDoc => ({
    v: 1,
    name: 'Route test',
    base: '',
    sky: 'day',
    blocks: [],
    movers: [],
    spawns: [{ pos: [-20, 0, 0], yaw: 0 }],
    portals: [],
    launchPads: [],
    ...more,
  });

  it('a player-made map (no waypoints): a walking grid, round a wall, up a ramp', () => {
    const def = compileCustomMap(
      doc({
        blocks: [
          floor(1, [0, -0.5, 0], [60, 1, 40]),
          // a wall across the middle with a gap at the north end (z < -14)
          floor(2, [0, 2, 4], [1, 4, 32]),
          // a raised platform in the east, a ramp up to it from the west
          floor(3, [20, 1.5, 0], [10, 3, 10]),
          {
            id: 4,
            shape: 'wedge',
            pos: [12, 0, 0],
            size: [4, 3, 6],
            rot: [90, 0, 0],
            mat: 'concrete',
          },
        ],
      }),
    );
    expect(def.waypoints ?? []).toEqual([]);
    const level = buildLevel(def);
    const r = findRoute(level, v3(-20, 0, 0), v3(-8, 0, 0))!;
    expect(r.kind).toBe('grid');
    // from one side of the wall to the other: round its open end
    const past = findRoute(level, v3(-6, 0, 0), v3(6, 0, 0))!;
    expect(past).not.toBeNull();
    expect(Math.min(...past.points.map((p) => p.z))).toBeLessThan(-12);
    expect(past.length).toBeGreaterThan(20);
  });

  it('a Map Maker edit that walls a corridor off: the route goes another way', () => {
    const base = mapDefForSize('split-deck');
    const level0 = buildLevel(base);
    const [a, b] = base.bombSites!;
    const r0 = findRoute(level0, siteCenter(a), siteCenter(b))!;
    expect(r0).not.toBeNull();
    // wall off the middle of the route it took (a big block across it)
    const mid = r0.points[Math.floor(r0.points.length / 2)];
    const edited = applyCustomPatch(
      base,
      doc({
        base: 'split-deck',
        patch: { removed: [] },
        spawns: [],
        blocks: [floor(1, [mid.x, mid.y + 3, mid.z], [14, 6, 14])],
      }),
    );
    const r1 = findRoute(buildLevel(edited), siteCenter(a), siteCenter(b));
    expect(r1).not.toBeNull();
    // nowhere inside the new block
    for (const p of r1!.points.slice(1, -1))
      expect(Math.abs(p.x - mid.x) < 6.5 && Math.abs(p.z - mid.z) < 6.5 && p.y < mid.y + 5).toBe(
        false,
      );
  });
});

describe('minimap: what the route leads to', () => {
  const def = mapDef('split-deck');
  const base = (more: Partial<GoalInput> = {}): GoalInput => ({
    def,
    match: null,
    myTeam: 0,
    localId: 1,
    me: v3(0, 0, 0),
    alive: true,
    players: [],
    powerups: [],
    site: null,
    ...more,
  });
  const match = (more: Partial<MatchView>): MatchView =>
    ({
      phase: 'live',
      objective: 'tower',
      sideSwapped: false,
      carriers: [],
      controllers: [
        { team: 0, carrier: null, droppedAt: null, returnAt: 0 },
        { team: 1, carrier: null, droppedAt: null, returnAt: 0 },
      ],
      overtime: null,
      attackers: null,
      bomb: null,
      ...more,
    }) as MatchView;

  it('Bomb: attackers go for the bomb, then a site (X picks it); defenders defuse a plant', () => {
    const sites = def.bombSites!;
    const bomb = { carrier: null, pos: v3(5, 0, 5), planted: null, plant: null, defuse: null };
    const m = match({ objective: 'bomb', attackers: 0, bomb });
    expect(goalFor(base({ match: m }))!.kind).toBe('bomb');
    const carried = match({ objective: 'bomb', attackers: 0, bomb: { ...bomb, carrier: 1 } });
    expect(goalFor(base({ match: carried, site: 'B' }))!.label).toBe('ATTACK B');
    expect(goalFor(base({ match: carried, site: 'A' }))!.pos).toEqual(siteCenter(sites[0]));
    const planted = match({
      objective: 'bomb',
      attackers: 0,
      bomb: { ...bomb, planted: { site: 'B', explodeAt: 999 } },
    });
    expect(goalFor(base({ match: planted, myTeam: 1 }))!.label).toBe('DEFUSE');
    expect(goalFor(base({ match: planted, myTeam: 0 }))!.label).toBe('GUARD B');
    // defenders hold the site they're routed to
    expect(goalFor(base({ match: carried, myTeam: 1, site: 'A' }))!.label).toBe('DEFEND A');
  });

  it('Tower: carry to the enemy Tower, pick up your Controller, escort, stop their carrier', () => {
    const enemyTower = def.towers.find((t) => t.team === 1)!;
    const mine = (c: Partial<MatchView['controllers'][0]>) => ({
      team: 0 as const,
      carrier: null,
      droppedAt: null,
      returnAt: 0,
      ...c,
    });
    const theirs = { team: 1 as const, carrier: null, droppedAt: null, returnAt: 0 };
    const p = (id: number, team: 0 | 1) => ({
      id,
      team,
      pos: v3(id, 0, 0),
      alive: true,
      carrier: true,
    });
    expect(
      goalFor(base({ match: match({ controllers: [mine({ carrier: 1 }), theirs] }) }))!.pos,
    ).toEqual(enemyTower.pos);
    expect(
      goalFor(base({ match: match({ controllers: [mine({ droppedAt: v3(3, 0, 3) }), theirs] }) }))!
        .kind,
    ).toBe('controller');
    expect(
      goalFor(
        base({ match: match({ controllers: [mine({ carrier: 2 }), theirs] }), players: [p(2, 0)] }),
      )!.label,
    ).toBe('ESCORT');
    expect(
      goalFor(
        base({
          match: match({ controllers: [mine({}), { ...theirs, carrier: 7 }] }),
          players: [p(7, 1)],
        }),
      )!.label,
    ).toBe('STOP CARRIER');
  });

  it('dead: no route; Elimination: the nearest power-up (unless you hold one); races: the next gate', () => {
    expect(goalFor(base({ alive: false, match: match({}) }))).toBeNull();
    const elim = match({ objective: 'elim' });
    expect(goalFor(base({ match: elim }))).toBeNull();
    const pu = [v3(40, 1, 0), v3(8, 1, 0)];
    const pg = goalFor(base({ match: elim, powerups: pu }))!.pos;
    expect([pg.x, pg.z]).toEqual([8, 0]);
    expect(pg.y).toBeCloseTo(0.1, 6);
    expect(goalFor(base({ match: elim, powerups: pu, holding: true }))).toBeNull();
    const race = mapDef('surf-copper-reef');
    const g = goalFor(base({ def: race, raceCp: 1 }))!;
    expect(g.kind).toBe('gate');
    expect(g.pos).toEqual(siteCenter(race.race!.checkpoints[1]));
    const last = goalFor(base({ def: race, raceCp: race.race!.checkpoints.length }))!;
    expect(last.label).toBe('FINISH');
  });
});

describe('minimap: the map sliced at your height', () => {
  it('Afterglow: the monorail deck is your floor only up there; walls stand out at street level', () => {
    const def = mapDef('afterglow');
    const level = buildLevel(def);
    const street = def.spawns.find((s) => s.team === 0)!.pos;
    const down = sliceMap(level, street, 1, 200);
    const up = sliceMap(level, v3(0, 8, 0), 1, 200);
    expect(down.some((s) => s.kind === 'wall')).toBe(true);
    // the monorail deck (top at 8 m) is a floor at your level only when you're up there
    const deck = (sl: typeof down) =>
      sl.filter(
        (s) =>
          s.kind === 'level' && level.boxes[s.box].max.y > 7.5 && level.boxes[s.box].max.y < 8.5,
      );
    expect(deck(down)).toHaveLength(0);
    expect(deck(up).length).toBeGreaterThan(0);
    // up there, the street shows as a floor below
    expect(up.some((s) => s.kind === 'below' && Math.abs(level.boxes[s.box].max.y) < 0.3)).toBe(
      true,
    );
  });

  it('Antipode: standing on the ceiling deck, the ceiling is your floor (sliced upside down)', () => {
    const def = mapDef('antipode');
    const level = buildLevel(def);
    const orange = def.spawns.find((s) => s.team === 1)!.pos;
    const sl = sliceMap(level, v3(orange.x, orange.y + 1.8, orange.z), -1, 200);
    expect(sl.some((s) => s.kind === 'level' && level.boxes[s.box].min.y > 25)).toBe(true);
  });
});

describe('minimap: enemies', () => {
  it('only when in sight or revealed by the rules; never the dead', () => {
    expect(enemyShown({ alive: true, revealed: false }, false)).toBe(false);
    expect(enemyShown({ alive: true, revealed: false }, true)).toBe(true);
    expect(enemyShown({ alive: true, revealed: true }, false)).toBe(true);
    expect(enemyShown({ alive: false, revealed: true }, true)).toBe(false);
  });
});
