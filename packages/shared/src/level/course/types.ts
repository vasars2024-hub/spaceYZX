// The course format: race tracks and surf maps written as plain data (pure JSON: numbers,
// strings, arrays) and expanded into a LevelDef by `expandCourse` (./expand.ts). It is the
// format a map editor will save later, so keep it small and stable (bump `format` on changes).
//
// Coordinates: [x, y, z] in metres, y up. Headings are compass degrees: 0 = north (-z),
// 90 = east (+x). Positions of walkable things are FEET positions (the top of the surface).
//
// A course is a ROUTE (in racing order) plus SCENERY. Every route element adds geometry and
// the racing line (what bot racers and the timing tests drive) and says how you leave it for
// the next one (`go`):
//   run      walk / sprint on                 jump     a running jump off the far edge
//   hop      bunny-hop on (jump on landing,   strafe   air-strafe on (drop off, surf transfer,
//            strafe in the air)                        a strafed long jump)
//
// Route elements (`t`):
//   start     {at, heading, size?}                   the start platform, grid and arch
//   stage     {at, heading, size?, cap?, n?}         a walled checkpoint room (walls, roof, glowing
//                                                    doorways): passing through it counts, you
//                                                    respawn in it; `cap` limits entry speed (m/s,
//                                                    surf stage starts)
//   finish    {at, heading, size?}                   the finish room
//   platform  {at, size, heading?, style?}           a floating platform (a landing, a run-up)
//   path      {to, width?, style?}                   a walkway from where you are to `to`
//   jumps     {pads: [{at, size?, heading?}]}        pads to jump (go 'jump') or bunny-hop ('hop')
//   surf      {from, to, height, angle, side, ...}   a surf ramp: its ridge runs from → to (its
//                                                    slope carries you down), faces `height` tall
//                                                    at `angle`° (≥ 50); you ride the `side` face
//                                                    ('left' / 'right' of the way, or an A-frame
//                                                    'both' ridden on `ride`)
//   launch    {at, to, flightSec}                    a launch pad throwing you onto `to`
//   booster   {at, heading, speed, up?, size?, air?} a boost strip (or an air ring): sets your
//                                                    speed along `heading`
//   portal    {at, heading, exit, size?}             a big portal: walk in, come out at `exit`
//                                                    moving the same way (cardinal headings only)
//   window    {at, heading, hole, wall?}             a wall across the way with a hole to thread
//   pillars   {from, to, count, offset, ...}         a weave: pillars alternately beside the line
//   wall      {at, size, heading?}                   a solid block (curve round it, behind it)
//   fuel      {at}                                   a fuel cell (jetpack tracks)
//
// Scenery (`scenery`): island, tree, rock, crystal, lantern, banner, waterfall, ruin, spire,
// cloud, arrow, scatter (many of one kind, placed by a seeded hash) — see SceneryElement.
// Floors (`floors`): deadly cloud seas (kill volumes) drawn as a cloud layer at their top.
//
// Validation (validateCourse): surf faces ≥ 50°, stages in order along the route, the route
// above every floor it crosses, cardinal portals; the clipping check (./overlap.ts) finds boxes
// cutting through each other.

export type P3 = [number, number, number];
export type P2 = [number, number];

/** How you leave a route element for the next one (see the top of this file). */
export type Go = 'run' | 'jump' | 'hop' | 'strafe';

/** Named colours (0xRRGGBB) every element draws with. */
export interface CoursePalette {
  /** walkable tops */
  ground: number;
  /** a second top colour (stripes, alternate pads) */
  ground2: number;
  /** platform bodies and cliffs */
  rock: number;
  rockDark: number;
  /** painted edge lines on walkable tops (the way reads at a glance) */
  edge: number;
  /** surf ramp faces, and their glowing ridge */
  surf: number;
  surfEdge: number;
  /** checkpoint rooms: walls/roof, glow, start and finish zones */
  stage: number;
  stageGlow: number;
  start: number;
  finish: number;
  portal: number;
  /** launch pads and boosters */
  pad: number;
  /** floor arrows */
  arrow: number;
  /** the cloud sea (deadly floor) and its danger tint underneath */
  cloud: number;
  danger: number;
  /** scenery */
  leaf: number;
  leafDark: number;
  trunk: number;
  crystal: number;
  water: number;
  accent: number;
  accent2: number;
}

export interface CourseSky {
  top: number;
  horizon: number;
  ground: number;
  sun?: { dir: P3; color: number; sizeDeg: number };
  sunLight?: number;
  stars?: boolean;
  fog: { near: number; far: number };
  ambient?: number;
}

/** A deadly cloud sea: falling into min..max (25 m deep) kills; clouds drawn at its top (`y`). */
export interface FloorData {
  y: number;
  min: P2;
  max: P2;
}

interface RouteBase {
  /** how you leave it (default: 'run') */
  go?: Go;
  /** leaving it with a jump: hold Space this many ticks in the air after (a jetpack burn) */
  jet?: number;
}

export interface StartEl extends RouteBase {
  t: 'start';
  at: P3;
  heading: number;
  size?: P2;
}
export interface StageEl extends RouteBase {
  t: 'stage';
  at: P3;
  heading: number;
  /** [width, depth] of the room's floor (default [12, 14]) */
  size?: P2;
  /** entry speed cap, m/s (surf stage starts) */
  cap?: number;
}
export interface FinishEl extends RouteBase {
  t: 'finish';
  at: P3;
  heading: number;
  size?: P2;
}
export type PlatformStyle = 'island' | 'slab' | 'plain';
export interface PlatformEl extends RouteBase {
  t: 'platform';
  at: P3;
  size: P2;
  heading?: number;
  style?: PlatformStyle;
}
export interface PathEl extends RouteBase {
  t: 'path';
  to: P3;
  width?: number;
  /** 'beam': a narrow bare beam */
  style?: 'walk' | 'beam';
}
export interface PadData {
  at: P3;
  size?: P2;
  heading?: number;
}
export interface JumpsEl extends RouteBase {
  t: 'jumps';
  pads: PadData[];
}
export interface SurfEl extends RouteBase {
  t: 'surf';
  from: P3;
  to: P3;
  height: number;
  angle: number;
  side: 'left' | 'right' | 'both';
  /** for 'both': which face the line rides (default 'right') */
  ride?: 'left' | 'right';
  /** how far down the face the line runs (0 = ridge, 1 = foot; default 0.3) */
  depth?: number;
}
export interface LaunchEl extends RouteBase {
  t: 'launch';
  at: P3;
  to: P3;
  flightSec: number;
  /** false: it sits on a platform already there (default: its own small platform) */
  base?: boolean;
}
export interface BoosterEl extends RouteBase {
  t: 'booster';
  at: P3;
  heading: number;
  speed: number;
  up?: number;
  size?: P2;
  /** an air ring (in a flight path) rather than a strip on a platform */
  air?: boolean;
}
export interface PortalEl extends RouteBase {
  t: 'portal';
  at: P3;
  heading: number;
  exit: P3;
  /** [width, height] of the opening (default [7, 8]) */
  size?: P2;
}
export interface WindowEl extends RouteBase {
  t: 'window';
  /** bottom centre of the hole */
  at: P3;
  heading: number;
  /** [width, height] of the hole */
  hole: P2;
  /** [width, height] of the whole wall (default hole + 8, hole + 10) */
  wall?: P2;
}
export interface PillarsEl extends RouteBase {
  t: 'pillars';
  from: P3;
  to: P3;
  count: number;
  /** sideways offset of each pillar from the line (alternating sides) */
  offset: number;
  radius?: number;
  height?: number;
}
export interface WallEl extends RouteBase {
  t: 'wall';
  /** bottom centre */
  at: P3;
  /** [width, height, depth] */
  size: P3;
  heading?: number;
}
export interface FuelEl extends RouteBase {
  t: 'fuel';
  at: P3;
}

export type RouteElement =
  | StartEl
  | StageEl
  | FinishEl
  | PlatformEl
  | PathEl
  | JumpsEl
  | SurfEl
  | LaunchEl
  | BoosterEl
  | PortalEl
  | WindowEl
  | PillarsEl
  | WallEl
  | FuelEl;

export type IslandStyle = 'grass' | 'snow' | 'stone' | 'basalt' | 'neon';
export type SceneryElement =
  /** a floating island: `at` = middle of its top */
  | { t: 'island'; at: P3; size: P2; depth: number; style?: IslandStyle; heading?: number }
  | { t: 'tree'; at: P3; height: number; kind?: 'pine' | 'broad' | 'palm' | 'dead' }
  | { t: 'rock'; at: P3; size: number; heading?: number }
  | { t: 'crystal'; at: P3; height: number; color?: number }
  | { t: 'lantern'; at: P3 }
  | { t: 'banner'; at: P3; heading: number; height: number; color?: number }
  /** a waterfall off an edge: `at` = middle of the lip, falling `drop` metres */
  | { t: 'waterfall'; at: P3; heading: number; width: number; drop: number }
  | { t: 'ruin'; at: P3; heading: number; size: P2; height: number }
  /** a landmark tower (a spire of stacked blocks) standing on `at` */
  | { t: 'spire'; at: P3; height: number; width: number; color?: number }
  | { t: 'cloud'; at: P3; size: P2 }
  /** a floating arrow sign pointing along `heading` */
  | { t: 'arrow'; at: P3; heading: number; color?: number }
  /** `count` of one kind scattered over min..max (x, z) at height y..y2, seeded */
  | {
      t: 'scatter';
      kind: 'island' | 'cloud' | 'crystal' | 'spire';
      count: number;
      seed: number;
      min: P3;
      max: P3;
      /** size range [min, max] (island/cloud width, crystal/spire height) */
      size: P2;
      /** keep this far from the route (horizontal metres) */
      clear?: number;
      style?: IslandStyle;
    };

export interface CourseData {
  format: 1;
  name: string;
  kind: 'race' | 'surf';
  /** a good run, seconds */
  parSec: number;
  palette: CoursePalette;
  sky: CourseSky;
  /** the global floor: below this you have fallen */
  killY: number;
  floors: FloorData[];
  /**
   * a cloud sea under every checkpoint section: `below` metres under the section's lowest point,
   * reaching `pad` metres past it sideways (falls end fast wherever you are)
   */
  autoFloors?: { below: number; pad: number };
  route: RouteElement[];
  scenery?: SceneryElement[];
  /** race tracks: the jetpack and SURGE (default on; surf maps never have them) */
  jetpack?: boolean;
  surge?: boolean;
}
