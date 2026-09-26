// Per-map analysis setup: named regions (for grouping numbers), chokepoints and lanes.
// Coordinates are read from the map code (packages/shared/src/level/maps/). When the map
// changes, update the rectangles here so the report keeps grouping samples sensibly.
import { v3, SPLIT_DECK, type LevelDef, type Vec3 } from '@space-yz/shared';
import type { RouteSpec } from './timing';

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

const CONFIGS: Record<string, () => MapAnalysisConfig> = { kestrel, 'split-deck': splitDeck };

/** Analysis setup for a map id (hand-made when available, otherwise the generic fallback). */
export const mapConfig = (id: string, def: LevelDef): MapAnalysisConfig =>
  CONFIGS[id] ? CONFIGS[id]() : genericConfig(id, def);
