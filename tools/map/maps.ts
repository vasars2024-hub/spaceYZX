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
  // bases: x ∈ [72, 96] (the doorway thresholds at |x| ∈ [71, 72] belong to the lanes)
  for (const { s, T, side } of sides) rect(`${T} base`, side, 'base', s * 72, s * 97, -43, 43);
  // zero-G cargo shaft (whole volume, every height)
  rect('shaft (zero-G)', null, 'north', -24, 24, 17, 55);
  for (const { s, T, side } of sides) {
    const X = (x: number) => s * x;
    rect(`${T} north corridor`, side, 'north', X(24), X(72), 25.5, 35);
    rect(`${T} north connector`, side, 'connector', X(28), X(34), 12, 25.5);
    rect(`${T} south connector`, side, 'connector', X(22), X(28), -28, -12);
    // balcony slabs (y 6.6) and the ramps up to them, along both long hall walls
    for (const [za, zb] of [
      [8.4, 12.5],
      [-12.5, -8.4],
    ]) {
      rect(`${T} balconies`, side, 'main', X(25.5), X(52.5), za, zb, 5);
      rect(`${T} ramps`, side, 'main', X(51.5), X(64.5), za, zb, 0.2);
    }
  }
  // engine corridor: ceiling section in the middle, wall-walk sections, normal-gravity ends
  rect('engine mid (ceiling)', null, 'south', -16, 16, -41, -27.9);
  for (const { s, T, side } of sides) {
    rect(`${T} engine wall`, side, 'south', s * 16, s * 48, -41, -27.9);
    rect(`${T} engine floor`, side, 'south', s * 48, s * 72, -41, -27.9);
  }
  rect('hall mid', null, 'main', -12, 12, -13, 13);
  for (const { s, T, side } of sides) rect(`${T} hall`, side, 'main', s * 12, s * 72, -13, 13);

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
    c('base door (main)', 'door M', 'main', v3(X(68), 1, 0), 'z', 8, true);
    c('base door (north)', 'door N', 'north', v3(X(68), 1, 30), 'z', 4, true);
    c('base door (south)', 'door S', 'south', v3(X(68), 1, -34), 'z', 6, true);
    c('shaft door', 'shaft', 'north', v3(X(24.5), 1, 30), 'z', 4);
    c('north connector, hall mouth', 'N-conn hall', 'connector', v3(X(31), 1, 12.5), 'x', 3);
    c('north connector, corridor mouth', 'N-conn corr', 'connector', v3(X(31), 1, 25.5), 'x', 3);
    c('south connector, hall mouth', 'S-conn hall', 'connector', v3(X(25), 1, -12.5), 'x', 3);
    c('south connector, corridor mouth', 'S-conn corr', 'connector', v3(X(25), 1, -27.5), 'x', 3);
  }

  return {
    id: 'kestrel',
    teamNames: ['A (cyan)', 'B (orange)'],
    regions,
    baseRegion: ['A base', 'B base'],
    chokepoints,
    lanes: [
      { name: 'main hall', centre: { x: 0, z: 0 } },
      { name: 'north (zero-G shaft)', centre: { x: 0, z: 30 } },
      { name: 'south (engine corridor)', centre: { x: 0, z: -34 } },
    ],
    laneLabels: {
      main: 'main hall',
      north: 'north (zero-G shaft)',
      south: 'south (engine corridor)',
      connector: 'side connectors',
      base: 'bases',
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
