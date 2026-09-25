// Per-map analysis setup: named regions (for grouping numbers), chokepoints and lanes.
// Coordinates are read from the map code (packages/shared/src/level/maps/). When the map
// changes, update the rectangles here so the report keeps grouping samples sensibly.
import { v3, type LevelDef, type Vec3 } from '@space-yz/shared';

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

const CONFIGS: Record<string, () => MapAnalysisConfig> = { kestrel };

/** Analysis setup for a map id (hand-made when available, otherwise the generic fallback). */
export const mapConfig = (id: string, def: LevelDef): MapAnalysisConfig =>
  CONFIGS[id] ? CONFIGS[id]() : genericConfig(id, def);
