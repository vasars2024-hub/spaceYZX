// Per-map analysis setup: named regions (for grouping numbers), chokepoints and lanes.
// Coordinates are read from the map code (packages/shared/src/level/maps/). When the map
// changes, update the rectangles here so the report keeps grouping samples sensibly.
import { v3, SPLIT_DECK, type LevelDef, type Vec3 } from '@space-yz/shared';
import type { RouteSpec, TimingRules } from './timing';

export type Team = 0 | 1;

export interface RegionDef {
  name: string;
  /** team whose half this is (null = shared middle) */
  side: Team | null;
  /** 'base' regions are excluded from lane metrics (open ground) */
  lane: string;
  min: Vec3;
  max: Vec3;
}

export interface ChokepointDef {
  name: string;
  /** label on the plans */
  short?: string;
  /** the team that defends it (whose half it is on) */
  side: Team;
  lane: string;
  /** centre of the opening, about chest height above its floor */
  pos: Vec3;
  /** axis along which the opening extends */
  across: 'x' | 'z';
  halfWidth: number;
  /** last choke before the objective (a base door) */
  final?: boolean;
}

export interface LaneDef {
  name: string;
  /** x/z of the waypoint at the lane's centre (the "mid" of that lane) */
  centre: { x: number; z: number };
  /** x/z of other waypoints in the lane's middle, closed while the other lanes are timed */
  alsoBlock?: { x: number; z: number }[];
}

export interface MapAnalysisConfig {
  id: string;
  teamNames: [string, string];
  /** regions are tested in order; the first one that contains a point wins */
  regions: RegionDef[];
  /** region name of each team's base (spawn safety counts only samples outside it) */
  baseRegion: [string, string];
  chokepoints: ChokepointDef[];
  lanes: LaneDef[];
  /** display names for the regions' lane keys (e.g. main → "main hall") */
  laneLabels?: Record<string, string>;
  /** the map is mirror-symmetric across x = 0 (lists then show one of each mirror pair) */
  mirrorX?: boolean;
  /** named routes timed by a sprinting walker (asymmetric maps: see timing.ts) */
  routes?: RouteSpec[];
  /** which balance checks the routes get (default 'asymmetric'; see timing.ts) */
  timingRules?: TimingRules;
}

const ALL_Y = 1e9;

const kestrel = (): MapAnalysisConfig => {
  const regions: RegionDef[] = [];
  const chokepoints: ChokepointDef[] = [];
  const rect = (
    name: string,
    side: Team | null,
    lane: string,
    xa: number,
    xb: number,
    za: number,
    zb: number,
    y0 = -ALL_Y,
    y1 = ALL_Y,
  ) =>
    regions.push({
      name,
      side,
      lane,
      min: v3(Math.min(xa, xb), y0, Math.min(za, zb)),
      max: v3(Math.max(xa, xb), y1, Math.max(za, zb)),
    });
  const sides = [
    { s: -1, T: 'A', side: 0 as Team },
    { s: 1, T: 'B', side: 1 as Team },
  ];
  // (coordinates from packages/shared/src/level/maps/kestrel.ts, the KESTREL table)
  // hangars: x ∈ [76, 98] (the door thresholds at |x| ∈ [75, 76] belong to the lanes)
  for (const { s, T, side } of sides) rect(`${T} hangar`, side, 'base', s * 76, s * 99, -35, 35);
  // the shared middle of each lane
  rect('reactor (mid)', null, 'main', -21, 21, -19, 19);
  rect('cargo shaft (zero-G, mid)', null, 'north', -26, 26, 19, 57);
  rect('engine corridor ceiling (mid)', null, 'south', -16, 16, -41, -27);
  for (const { s, T, side } of sides) {
    const X = (x: number) => s * x;
    // main lane
    rect(`${T} airlock`, side, 'main', X(68), X(76), -6, 6);
    rect(`${T} atrium shelf`, side, 'main', X(47), X(56), 6, 17, 5);
    rect(`${T} atrium`, side, 'main', X(46), X(68), -17, 17);
    rect(`${T} gallery`, side, 'main', X(21), X(46), 4, 17, 5);
    rect(`${T} trench`, side, 'main', X(21), X(46), -13, 17);
    // shortcuts between the lanes
    rect(`${T} north connector`, side, 'connector', X(27.5), X(34.5), 16, 31.9);
    rect(`${T} south connector`, side, 'connector', X(29.5), X(36.5), -28, -12.9);
    rect(`${T} crouch vent`, side, 'connector', X(49.5), X(58.5), -20, -17);
    // north lane
    rect(`${T} cargo bay`, side, 'north', X(50.5), X(76), 19, 43);
    rect(`${T} conveyor`, side, 'north', X(26), X(50.5), 31.9, 41);
    // south lane
    rect(`${T} turbine hall`, side, 'south', X(48.5), X(76), -45, -19);
    rect(`${T} engine wall`, side, 'south', X(16), X(48.5), -41, -27);
  }

  for (const { s, T, side } of sides) {
    const X = (x: number) => s * x;
    const c = (
      name: string,
      short: string,
      lane: string,
      pos: Vec3,
      across: 'x' | 'z',
      halfWidth: number,
      final = false,
    ) =>
      chokepoints.push({
        name: `${T} ${name}`,
        short: `${T} ${short}`,
        side,
        lane,
        pos,
        across,
        halfWidth,
        final,
      });
    // the three hangar doors (the last chokes before the Tower)
    c('hangar door (main)', 'door M', 'main', v3(X(75.5), 1, 0), 'z', 5, true);
    c('hangar door (north)', 'door N', 'north', v3(X(75.5), 1, 26), 'z', 4, true);
    c('hangar door (south)', 'door S', 'south', v3(X(75.5), 1, -26), 'z', 4, true);
    // main lane
    c('airlock (atrium side)', 'airlock', 'main', v3(X(68.5), 1, 0), 'z', 5);
    c('trench mouth', 'trench', 'main', v3(X(46.5), 1, -8), 'z', 4);
    c('gallery mouth', 'gallery', 'main', v3(X(46.5), 7, 12), 'z', 4);
    c('reactor door (floor)', 'reactor', 'main', v3(X(20.5), 1, -1), 'z', 5);
    c('reactor door (balcony)', 'balcony', 'main', v3(X(20.5), 7, 13), 'z', 3);
    // north lane
    c('dock door (cargo bay → conveyor)', 'dock', 'north', v3(X(50.5), 4, 36), 'z', 4);
    c('shaft door', 'shaft', 'north', v3(X(26.5), 4, 36), 'z', 4);
    // south lane
    c('engine corridor mouth', 'engine', 'south', v3(X(48.5), 1, -34), 'z', 6);
    // shortcuts
    c('north connector, gallery end', 'N-conn gal', 'connector', v3(X(31), 7, 16.5), 'x', 3);
    c('north connector, conveyor end', 'N-conn cv', 'connector', v3(X(31), 4, 31.5), 'x', 3);
    c('south connector, trench end', 'S-conn tr', 'connector', v3(X(33), 1, -12.5), 'x', 3);
    c('south connector, engine end', 'S-conn eng', 'connector', v3(X(33), 1, -27.5), 'x', 3);
    c('crouch vent (atrium end)', 'vent', 'connector', v3(X(51.5), 0.6, -16.5), 'x', 1.5);
  }

  return {
    id: 'kestrel',
    teamNames: ['A (cyan)', 'B (orange)'],
    regions,
    baseRegion: ['A hangar', 'B hangar'],
    chokepoints,
    // the waypoint at each lane's middle (the reactor floor south of the core, the middle of
    // the zero-G shaft, the engine corridor ceiling)
    lanes: [
      {
        name: 'main (atrium, trench, reactor)',
        centre: { x: 0, z: -9 },
        // the reactor floor north of the core, and the balcony window into the shaft
        alsoBlock: [
          { x: 0, z: 9 },
          { x: 0, z: 16 },
        ],
      },
      { name: 'north (cargo bay, conveyor, zero-G shaft)', centre: { x: 0, z: 31 } },
      { name: 'south (turbine hall, engine corridor)', centre: { x: 0, z: -38.5 } },
    ],
    laneLabels: {
      main: 'main lane',
      north: 'north lane',
      south: 'south lane',
      connector: 'shortcuts',
      base: 'hangars',
    },
    mirrorX: true,
  };
};

// Split Deck: asymmetric (Cyan north, Orange south), three levels. Coordinates from
// packages/shared/src/level/maps/split-deck.ts (the SPLIT_DECK table and the room list).
const splitDeck = (): MapAnalysisConfig => {
  const S = SPLIT_DECK;
  const regions: RegionDef[] = [];
  const rect = (
    name: string,
    side: Team | null,
    lane: string,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0 = -ALL_Y,
    y1 = ALL_Y,
  ) => regions.push({ name, side, lane, min: v3(x0, y0, z0), max: v3(x1, y1, z1) });
  const C = S.connector;
  const MC = S.mid;
  const DR = S.deckRun;
  const BC = S.basement;
  rect('Cyan spawn', 0, 'base', 47.5, 72.5, 3, 16.5);
  rect('Orange spawn', 1, 'base', 41.5, 78.5, 81.5, 97);
  rect('A deck (A site)', 0, 'A', 76.5, 111, 13, 40.5, 4);
  rect('Cyan A ramp', 0, 'A', 72.5, 96, 7, 14);
  rect('Cyan B ramp', 0, 'B', 29, 47.5, 7, 13.5);
  rect('connector', 0, 'mid', C.x0 - 1, C.x1 + 1, 16.5, 36);
  rect('gantry (connector: A deck to atrium)', null, 'connector', 76.5, 85, 40.5, 62.5, 0.5);
  rect('pit (under the atrium)', null, 'mid', 43, 77, 39, 63, -ALL_Y, -0.5);
  rect('atrium', null, 'mid', 43, 85, 35, 63);
  rect('deck run', 1, 'A', DR.x0 - 1, DR.x1 + 1, 40.5, 77.5);
  rect('east lane', 1, 'A', 78.5, DR.x1 + 1, 77.5, 87);
  rect('mid corridor', 1, 'mid', MC.x0 - 1, MC.x1 + 1, 62.5, 81.5);
  rect('stairs', 1, 'B', 34, 45, 52.5, 72);
  rect('stairwell', null, 'B', 34, 45, 41.5, 52.5);
  rect('passage (connector: basement to stairwell)', null, 'connector', BC.x1, 35, 43, 51);
  rect('basement corridor', 1, 'B', BC.x0 - 1, BC.x1 + 1, 41.5, 77.5);
  rect('west lane', 1, 'B', BC.x0 - 2, 41.5, 77.5, 87);
  rect('B hold (B site)', 0, 'B', 9, 44, 13, 41.5);

  const chokepoints: ChokepointDef[] = [];
  const c = (
    name: string,
    short: string,
    side: Team,
    lane: string,
    pos: Vec3,
    across: 'x' | 'z',
    halfWidth: number,
    final = false,
  ) => chokepoints.push({ name, short, side, lane, pos, across, halfWidth, final });
  // Cyan's base doors, then the doors into its sites
  c('Cyan spawn door (B ramp)', 'C door B', 0, 'B', v3(47.5, 1, 11), 'z', 2, true);
  // (probes next to ramps sit a bit higher so the opening scan doesn't dip into the ramp)
  c('Cyan spawn door (A ramp)', 'C door A', 0, 'A', v3(72.5, 2.5, 11), 'z', 2, true);
  c(
    'Cyan spawn door (connector)',
    'C door M',
    0,
    'mid',
    v3((C.x0 + C.x1) / 2, 1, 16.5),
    'x',
    3,
    true,
  );
  c('connector gate (atrium)', 'conn gate', 0, 'mid', v3(C.x0 + 5, 1, 35.5), 'x', 3);
  c('A deck door (Cyan ramp)', 'A north', 0, 'A', v3(90.5, 7, 13.5), 'x', 3.5);
  c('A deck door (deck run)', 'A south', 0, 'A', v3((DR.x0 + DR.x1) / 2, 7, 40.5), 'x', 5);
  c('A deck door (gantry)', 'A gantry', 0, 'A', v3(80.5, 7, 40.5), 'x', 3.5);
  c('B hold door (Cyan ramp)', 'B north', 0, 'B', v3(33, -4, 13.5), 'x', 3);
  c('B hold door (stairwell)', 'B stairs', 0, 'B', v3(39, -4, 41.5), 'x', 3);
  c(
    'B hold door (basement corridor)',
    'B west',
    0,
    'B',
    v3((BC.x0 + BC.x1) / 2, -4, 41.5),
    'x',
    3.5,
  );
  // Orange's base doors and the gates
  c('Orange spawn door (west lane)', 'O door W', 1, 'B', v3(41.5, 1, 84), 'z', 2, true);
  c('Orange spawn door (mid)', 'O door M', 1, 'mid', v3(MC.x0 + 5.5, 1, 81.5), 'x', 3, true);
  c('Orange spawn door (east lane)', 'O door E', 1, 'A', v3(78.5, 1, 84), 'z', 2, true);
  c('mid gate (atrium)', 'mid gate', 1, 'mid', v3(MC.x0 + 4, 1, 62.5), 'x', 3);
  c('east gate (deck run)', 'east gate', 1, 'A', v3((DR.x0 + DR.x1) / 2, 3, 77.5), 'x', 4);
  c('west gate (basement)', 'west gate', 1, 'B', v3((BC.x0 + BC.x1) / 2, 1, 77.5), 'x', 3.5);
  c('stairs gate', 'stairs', 1, 'B', v3(39, 1, 65), 'x', 3);

  // routes timed by the walker: each team's ways to the enemy Tower, the bomb sites, the centre
  const routes: RouteSpec[] = [];
  const r = (
    mode: RouteSpec['mode'],
    team: Team,
    to: string,
    name: string,
    via: string[],
    anyOf?: string[],
  ) => routes.push({ mode, team, to, name, via, ...(anyOf ? { anyOf } : {}) });
  const rims = ['rimN', 'rimE', 'rimS', 'rimW'];
  r('contact', 0, 'power-up', 'connector, atrium (hole rim)', [], rims);
  r('contact', 1, 'power-up', 'mid corridor, atrium (hole rim)', [], rims);
  r('tower', 0, 'Orange Tower', 'mid: connector, atrium, mid corridor', ['cnGate', 'oTower']);
  r('tower', 0, 'Orange Tower', 'A side: A deck, deck run, east lane', ['aNDoor', 'dr1', 'oTower']);
  r('tower', 0, 'Orange Tower', 'B side: hold, basement corridor, west lane', [
    'bNDoor',
    'bc2',
    'oTower',
  ]);
  r('tower', 0, 'Orange Tower', 'B side: hold, stairs, mid corridor', [
    'bNDoor',
    'stRamp',
    'oTower',
  ]);
  r('tower', 1, 'Cyan Tower', 'mid: mid corridor, atrium, connector', ['cnGate', 'cTower']);
  r('tower', 1, 'Cyan Tower', 'A side: east lane, deck run, A deck', ['dr1', 'aNDoor', 'cTower']);
  r('tower', 1, 'Cyan Tower', 'B side: west lane, basement corridor, hold', [
    'bc2',
    'bNDoor',
    'cTower',
  ]);
  r('tower', 1, 'Cyan Tower', 'B side: mid corridor, stairs, hold', ['stRamp', 'bNDoor', 'cTower']);
  r('bomb', 0, 'A site', 'east ramp', ['aC']);
  r('bomb', 0, 'B site', 'west ramp', ['bC']);
  r('bomb', 1, 'A site', 'east lane, deck run', ['dr1', 'aC']);
  r('bomb', 1, 'A site', 'mid, atrium, gantry', ['gTop', 'aC']);
  r('bomb', 1, 'B site', 'west lane, basement corridor', ['bc2', 'bC']);
  r('bomb', 1, 'B site', 'mid, stairs, stairwell', ['stRamp', 'bC']);
  r('bomb', 1, 'B site', 'mid, atrium, drop through the hole, pit', ['rimS', 'pitC', 'bC']);

  return {
    id: 'split-deck',
    teamNames: ['Cyan (defends in Bomb mode)', 'Orange (attacks in Bomb mode)'],
    regions,
    baseRegion: ['Cyan spawn', 'Orange spawn'],
    chokepoints,
    // each lane's middle = Cyan's door into it (every route through that side passes it)
    lanes: [
      { name: 'A side (A deck, deck run)', centre: { x: 90.5, z: 13.5 } },
      { name: 'mid (connector, atrium, mid corridor)', centre: { x: (C.x0 + C.x1) / 2, z: 16.5 } },
      { name: 'B side (B hold, basement, stairs)', centre: { x: 33, z: 13.5 } },
    ],
    laneLabels: {
      A: 'A side',
      mid: 'mid',
      B: 'B side',
      connector: 'connectors',
      base: 'spawns',
    },
    routes,
  };
};

// Orbital Ring: mirrored north ↔ south across z = 60 (Cyan north, Orange south), laid out on
// the owner's 120 × 120 m plan. Coordinates from packages/shared/src/level/maps/orbital-ring.ts
// (the ORBITAL_RING table, the room list and the waypoint names). Its routes are checked against
// the plan's target times ('targets' rules in timing.ts) instead of Split Deck's asymmetric rules.
const orbitalRing = (): MapAnalysisConfig => {
  const regions: RegionDef[] = [];
  const rect = (
    name: string,
    side: Team | null,
    lane: string,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0 = -ALL_Y,
    y1 = ALL_Y,
  ) => regions.push({ name, side, lane, min: v3(x0, y0, z0), max: v3(x1, y1, z1) });
  const halves = [
    { T: 'north', side: 0 as Team, z: (z: number) => z },
    { T: 'south', side: 1 as Team, z: (z: number) => 120 - z },
  ];
  const zr = (f: (z: number) => number, a: number, b: number): [number, number] => [
    Math.min(f(a), f(b)),
    Math.max(f(a), f(b)),
  ];
  rect('Cyan spawn', 0, 'base', 46, 74, 4, 18);
  rect('Orange spawn', 1, 'base', 46, 74, 102, 116);
  rect('reactor pit', null, 'core', 50, 70, 50, 70, -ALL_Y, -5);
  rect('balconies', null, 'core', 46, 74, 54, 66, 5);
  rect('reactor core', null, 'core', 46, 74, 46, 74, -1.5);
  for (const { T, side, z } of halves) {
    rect(`${T} spoke`, side, 'mid', 57, 63, ...zr(z, 18, 32.5));
    rect(`ring (${T})`, side, 'ring', 32.5, 87.5, ...zr(z, 32.5, 60), -1.5);
    rect(`basement ring (${T})`, side, 'basement', 21.5, 98.5, ...zr(z, 21.5, 60), -ALL_Y, -1.5);
    rect(`${T}-east outer corridor`, side, 'outer', 74, 111, ...zr(z, 7, 41));
    rect(`${T}-west outer corridor`, side, 'outer', 9, 46, ...zr(z, 7, 41));
    rect(`${T} stairwells`, side, 'basement', 32.5, 87.5, ...zr(z, 26.5, 32.5));
  }
  rect('east spoke', null, 'A', 87.5, 98, 44, 76);
  rect('west spoke', null, 'B', 22, 32.5, 44, 76);
  rect('A site', null, 'A', 98, 118, 42, 78);
  rect('B site', null, 'B', 2, 22, 42, 78);

  const chokepoints: ChokepointDef[] = [];
  for (const { T, side, z } of halves) {
    const team = side === 0 ? 'Cyan' : 'Orange';
    const c = (
      name: string,
      short: string,
      lane: string,
      pos: Vec3,
      across: 'x' | 'z',
      halfWidth: number,
      final = false,
    ) => chokepoints.push({ name, short, side, lane, pos, across, halfWidth, final });
    c(
      `${team} spawn door (spoke)`,
      `${T[0].toUpperCase()} door`,
      'mid',
      v3(60, 1, z(18.5)),
      'x',
      1.5,
      true,
    );
    c(
      `${team} spawn door (east)`,
      `${T[0].toUpperCase()} door E`,
      'outer',
      v3(74.5, 1, z(11)),
      'z',
      1.5,
      true,
    );
    c(
      `${team} spawn door (west)`,
      `${T[0].toUpperCase()} door W`,
      'outer',
      v3(45.5, 1, z(11)),
      'z',
      1.5,
      true,
    );
    c(`${T} spoke gate`, `${T} gate`, 'mid', v3(60, 1, z(32)), 'x', 2);
    for (const [e, x, gx] of [
      ['east', 91, 107],
      ['west', 29, 13],
    ] as const) {
      c(`${T}-${e} corridor gate`, `${T[0]}${e[0]} gate`, 'outer', v3(x, 1, z(11)), 'z', 1.5);
      c(`${T}-${e} site gate`, `${T[0]}${e[0]} gate 2`, 'outer', v3(gx, 1, z(28)), 'x', 1.5);
    }
  }

  // each team's routes to the enemy Tower, both sites and the core, timed by the walker;
  // `targetSec` are the owner's plan (sprint 9 m/s)
  const routes: RouteSpec[] = [];
  const r = (
    mode: RouteSpec['mode'],
    team: Team,
    to: string,
    name: string,
    via: string[],
    targetSec?: number,
    anyOf?: string[],
  ) =>
    routes.push({
      mode,
      team,
      to,
      name,
      via,
      ...(targetSec !== undefined ? { targetSec } : {}),
      ...(anyOf ? { anyOf } : {}),
    });
  for (const team of [0, 1] as const) {
    const [me, them] = team === 0 ? ['N', 'S'] : ['S', 'N'];
    const enemy = team === 0 ? 'Orange Tower' : 'Cyan Tower';
    r('contact', team, 'core', 'spoke, core (hole rim)', [], 5, [
      `cRim1${me}`,
      `cRimD${me}E`,
      `cRimD${me}W`,
    ]);
    r('tower', team, enemy, 'spokes, across the core', [`c1${me}`, `c1${them}`, `tower${them}`]);
    r('tower', team, enemy, 'spokes, round the ring', [
      `ringD${me}E`,
      `ringD${them}E`,
      `tower${them}`,
    ]);
    r('tower', team, enemy, 'stairs, basement ring', [
      `baseSt${me}E`,
      `baseSt${them}E`,
      `tower${them}`,
    ]);
    r('tower', team, enemy, 'outer corridors through A', [
      `sideDoor${me}E`,
      'aCE',
      `sideDoor${them}E`,
      `tower${them}`,
    ]);
    for (const [site, s, dest] of [
      ['A site', 'E', 'aCE'],
      ['B site', 'W', 'aCW'],
    ] as const) {
      r('bomb', team, site, 'spoke, across the core', [`gate${me}`, `siteGate${s}`, dest], 8);
      r('bomb', team, site, 'spoke, round the ring', [`ringD${me}${s}`, `siteGate${s}`, dest]);
      r('bomb', team, site, 'outer corridor', [`sideDoor${me}${s}`, dest], 11);
    }
  }

  return {
    id: 'orbital-ring',
    teamNames: ['Cyan (north)', 'Orange (south)'],
    regions,
    baseRegion: ['Cyan spawn', 'Orange spawn'],
    chokepoints,
    lanes: [],
    laneLabels: {
      mid: 'spokes',
      core: 'reactor core',
      ring: 'ring',
      basement: 'basement ring',
      outer: 'outer corridors',
      A: 'A side',
      B: 'B side',
      base: 'spawns',
    },
    routes,
    timingRules: 'targets',
  };
};

// Canyon Relay: outdoor, mirrored north ↔ south across z = 50 (Cyan north, Orange south) and
// built the same east ↔ west. Coordinates from packages/shared/src/level/maps/canyon-relay.ts (the
// file's header plan and the waypoint names). Each half: an adobe pueblo (streets y 0) with the
// Tower's station yard and two camps (the spawn groups), a mine under it (y -5) and a rail tunnel
// under the gorge (y -8.5). Its routes are checked against target times ('targets' rules in
// timing.ts); they start at the team's spawn centroid (the station yard).
const canyonRelay = (): MapAnalysisConfig => {
  const regions: RegionDef[] = [];
  const rect = (
    name: string,
    side: Team | null,
    lane: string,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0 = -ALL_Y,
    y1 = ALL_Y,
  ) =>
    regions.push({
      name,
      side,
      lane,
      min: v3(Math.min(x0, x1), y0, Math.min(z0, z1)),
      max: v3(Math.max(x0, x1), y1, Math.max(z0, z1)),
    });
  const halves = [
    { T: 'north', side: 0 as Team, z: (z: number) => z, base: 'Cyan spawns' },
    { T: 'south', side: 1 as Team, z: (z: number) => 100 - z, base: 'Orange spawns' },
  ];
  const sides = [
    { E: 'east', X: (x: number) => x },
    { E: 'west', X: (x: number) => 120 - x },
  ];
  // the middle line: the rail tunnel, the relay rock, the bridges, the basins
  rect('rail tunnel', null, 'mine', 58, 62, 31, 69, -ALL_Y, -1);
  rect('relay rock', null, 'mid', 55, 65, 44, 56);
  rect('east bridge', null, 'mid', 83, 87, 42, 58);
  rect('west bridge', null, 'mid', 33, 37, 42, 58);
  rect('A basin', null, 'A', 98, 116, 37, 63);
  rect('B basin', null, 'B', 4, 22, 37, 63);
  for (const { T, side, z, base } of halves) {
    const Z = (a: number, c: number): [number, number] => [z(a), z(c)];
    rect(base, side, 'base', 54, 66, ...Z(2, 13));
    rect(`${T} mine hall`, side, 'mine', 50, 70, ...Z(16, 32), -ALL_Y, -1);
    for (const { E, X } of sides) {
      rect(base, side, 'base', X(83), X(98), ...Z(2, 12.5));
      rect(`${T}-${E} mine gallery`, side, 'mine', X(70), X(101), ...Z(16, 42), -ALL_Y, -1);
      rect(`${T}-${E} slot canyon`, side, E, X(101), X(116), ...Z(2, 37));
      rect(`${T}-${E} tower alley`, side, 'mid', X(66), X(71), ...Z(2, 16));
      rect(`${T}-${E} storehouse`, side, E, X(71), X(83), ...Z(2, 15));
      rect(`${T}-${E} cantina`, side, E, X(71), X(84), ...Z(15, 25));
      rect(`${T}-${E} market and mine house`, side, E, X(84), X(98), ...Z(13.5, 25));
      rect(`${T}-${E} rim street`, side, E, X(71), X(89), ...Z(25, 30));
      rect(`${T}-${E} lookout`, side, 'mid', X(70), X(81), ...Z(30, 42));
      rect(`${T}-${E} gatehouse`, side, E, X(81), X(89), ...Z(30, 42));
    }
    rect(`${T} plaza`, side, 'mid', 49, 71, ...Z(16, 28));
    rect(`${T} relay house and terrace`, side, 'mid', 50, 70, ...Z(28, 42));
  }

  const chokepoints: ChokepointDef[] = [];
  for (const { T, side, z } of halves) {
    const t = T[0].toUpperCase();
    const c = (
      name: string,
      short: string,
      lane: string,
      pos: Vec3,
      across: 'x' | 'z',
      halfWidth: number,
      final = false,
    ) => chokepoints.push({ name, short, side, lane, pos, across, halfWidth, final });
    c(`${T} rail stair`, `${t} rail`, 'mine', v3(60, -4, z(33)), 'x', 2);
    for (const { E, X } of sides) {
      const e = E[0];
      c(`${T}-${E} yard door`, `${t}${e} yard`, 'mid', v3(X(66.5), 1, z(11)), 'z', 1.5, true);
      c(`${T}-${E} canyon gate`, `${t}${e} gate`, E, v3(X(99.5), 1, z(7)), 'z', 2);
      c(`${T}-${E} canyon overhang`, `${t}${e} arch`, E, v3(X(110), -2, z(35)), 'x', 4);
      c(`${T}-${E} cave mouth`, `${t}${e} cave`, E, v3(X(99.5), -4, z(39)), 'z', 2);
      c(`${T}-${E} bridge mouth`, `${t}${e} bridge`, 'mid', v3(X(85), 1, z(41.5)), 'x', 2);
      c(`${T}-${E} lookout door`, `${t}${e} lookout`, 'mid', v3(X(70.5), 1, z(38.5)), 'z', 1.5);
    }
  }

  // each team's routes to the enemy Tower, both sites and the first meeting points, timed by
  // the walker from the team's spawn centroid (the station yard); `targetSec` is the plan
  // (sprint 9 m/s)
  const routes: RouteSpec[] = [];
  const r = (
    mode: RouteSpec['mode'],
    team: Team,
    to: string,
    name: string,
    via: string[],
    targetSec?: number,
    anyOf?: string[],
  ) =>
    routes.push({
      mode,
      team,
      to,
      name,
      via,
      ...(targetSec !== undefined ? { targetSec } : {}),
      ...(anyOf ? { anyOf } : {}),
    });
  const T = CANYON_RELAY_TARGETS;
  for (const team of [0, 1] as const) {
    const [me, them] = team === 0 ? ['N', 'S'] : ['S', 'N'];
    const enemy = team === 0 ? 'Orange Tower' : 'Cyan Tower';
    r('contact', team, 'terrace edge', 'relay house, terrace (gorge edge)', [], T.edge, [
      `edge${me}`,
    ]);
    r('contact', team, 'bridge', 'lookout, gatehouse, bridge (middle)', [], T.bridge, [
      'bridgeMidE',
      'bridgeMidW',
    ]);
    r('contact', team, 'rail tunnel', 'plaza stair, mine hall, rail tunnel (middle)', [], T.tunnel, [
      'tunnel',
    ]);
    r('tower', team, enemy, 'rock bridge', ['bridgeMidE', `tower${them}`]);
    r('tower', team, enemy, 'rail tunnel', ['tunnel', `tower${them}`]);
    for (const [site, s, dest] of [
      ['A site', 'E', 'siteE'],
      ['B site', 'W', 'siteW'],
    ] as const) {
      r('bomb', team, site, 'mine gallery, cave mouth', [`cave${me}${s}`, dest], T.cave);
      r('bomb', team, site, 'camp, slot canyon', [`cOut${me}${s}`, dest], T.canyon);
    }
  }

  return {
    id: 'canyon-relay',
    teamNames: ['Cyan (north)', 'Orange (south)'],
    regions,
    baseRegion: ['Cyan spawns', 'Orange spawns'],
    chokepoints,
    lanes: [],
    laneLabels: {
      mid: 'plaza, terrace, lookout, bridges and the relay rock',
      mine: 'mine hall, galleries and the rail tunnel',
      east: 'east streets and slot canyon',
      west: 'west streets and slot canyon',
      A: 'A basin',
      B: 'B basin',
      base: 'station yards and camps',
    },
    routes,
    timingRules: 'targets',
  };
};

/**
 * Canyon Relay's target times (s) from the station yard, sprinting (its timing test checks them,
 * ±20 %): sight contact across the gorge from the terrace ~5 s, the bridge and the rail tunnel
 * ~6.5 s, a site through the mine ~10.5 s, down the slot canyon ~12 s.
 */
const CANYON_RELAY_TARGETS = { edge: 5, bridge: 6.5, tunnel: 6.5, cave: 10.5, canyon: 12 };

/**
 * Fallback for maps without a hand-made setup: a base box around each team's spawns and the
 * two halves of the map (x < 0 / x > 0). No chokepoints or lanes.
 */
export const genericConfig = (id: string, def: LevelDef): MapAnalysisConfig => {
  const regions: RegionDef[] = [];
  const baseRegion: [string, string] = ['A base', 'B base'];
  for (const team of [0, 1] as const) {
    const sp = def.spawns.filter((s) => s.team === team);
    if (sp.length === 0) continue;
    const xs = sp.map((s) => s.pos.x);
    const zs = sp.map((s) => s.pos.z);
    regions.push({
      name: baseRegion[team],
      side: team,
      lane: 'base',
      min: v3(Math.min(...xs) - 4, -ALL_Y, Math.min(...zs) - 4),
      max: v3(Math.max(...xs) + 4, ALL_Y, Math.max(...zs) + 4),
    });
  }
  const b0 = def.boundsMin;
  const b1 = def.boundsMax;
  regions.push({
    name: 'A half',
    side: 0,
    lane: 'main',
    min: v3(b0.x, -ALL_Y, b0.z),
    max: v3(0, ALL_Y, b1.z),
  });
  regions.push({
    name: 'B half',
    side: 1,
    lane: 'main',
    min: v3(0, -ALL_Y, b0.z),
    max: v3(b1.x, ALL_Y, b1.z),
  });
  return {
    id,
    teamNames: ['A (cyan)', 'B (orange)'],
    regions,
    baseRegion,
    chokepoints: [],
    lanes: [],
    laneLabels: { main: 'rest of the map', base: 'bases' },
  };
};

const CONFIGS: Record<string, () => MapAnalysisConfig> = {
  kestrel,
  'split-deck': splitDeck,
  'orbital-ring': orbitalRing,
  'canyon-relay': canyonRelay,
};

/** Analysis setup for a map id (hand-made when available, otherwise the generic fallback). */
export const mapConfig = (id: string, def: LevelDef): MapAnalysisConfig =>
  CONFIGS[id] ? CONFIGS[id]() : genericConfig(id, def);
