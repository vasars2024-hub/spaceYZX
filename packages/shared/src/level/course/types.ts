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
//   stage     {at, heading, size?, cap?, name?}      a walled checkpoint room (walls, roof, glowing
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
// Surf maps (docs/movement-map-design/BUILDING.md) add:
//   curve     {at, heading, legs, height, angle,     a curved surf ramp (./curve.ts): its ridge
//              side, ...}                            follows the legs (straights, arcs, spirals,
//                                                    drops and climbs, all joined smoothly)
//   gate      {at, heading, size, name, bay...}      a fly-through progress gate (C1..C5, splits)
//                                                    or the finish, with its restart bay
//   anchor    {at, heading, size, bay...}            a fly-through recovery anchor (R): no
//                                                    progress, only where a fall brings you back
//   red       {at, size, heading?}                   a red zone block: touch it and you go back
// A portal may turn you (`turn`) and be flown through (`air`); hop pads may be bhop pads
// (`style: 'bhop'`).
//
// Scenery (`scenery`): island, tree, rock, crystal, lantern, banner, waterfall, ruin, spire,
// arch, cloud, arrow, scatter (many of one kind, placed by a seeded hash) — see SceneryElement.
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
  /** bhop pad tops (surf maps; default `pad`) */
  bhop?: number;
  /** red zones (default a hazard red) */
  hazard?: number;
  /** recovery anchors' rings and restart bays (default `stageGlow`) */
  anchor?: number;
  /** scenery */
  leaf: number;
  leafDark: number;
  trunk: number;
  crystal: number;
  water: number;
  accent: number;
  accent2: number;
}

/** A standard-mode difficulty (the map lists and leaderboards group by it). */
export type CourseMode = 'beginner' | 'intermediate';

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
  /**
   * off the racing line (Pen.branch): a salvage ramp that catches weak transfers, a launch
   * back from it, a ramp of an optional faster line (CourseData.forks) — built, no line nodes
   */
  alt?: boolean;
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
  /** the stretch it starts, shown over it */
  name?: string;
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
  /** where it starts (default: where the way is) */
  from?: P3;
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
  /** 'bhop': bhop pads (surf maps): their own bright top and arrows toward the next pad */
  style?: 'bhop';
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
  /**
   * degrees the portal turns you (+ = right): your velocity and view come out turned about the
   * vertical, speed kept (default 0: the same way you went in)
   */
  turn?: number;
  /** a portal you fly through (surf maps): no platform under it, a thick trigger */
  air?: boolean;
  /**
   * keep where you crossed the opening: you come out as far off `exit` (across and up, turned)
   * as you went in off the opening's middle — keep the exit's surroundings clear by half the
   * opening each way (default: always at `exit`)
   */
  offset?: boolean;
  /** vertical speed coming out: 'keep' (default) or 'zero' (level: horizontal speed kept) */
  vertical?: 'keep' | 'zero';
  /** its frame and disc colour (default the palette's portal colour): tells portal pairs apart */
  color?: number;
  /** a short mark (a letter or symbol) shown over it and over its exit */
  glyph?: string;
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

/**
 * One leg of a curved surf ramp's ridge: a straight (`len`) or an arc (`turn` at `radius`,
 * optionally opening or closing to `toRadius`: a spiral), dropping `drop` metres over it
 * (negative: climbing). Heights between legs are joined smoothly (no kinks).
 */
export interface CurveLeg {
  /** a straight, this long (metres, measured flat) */
  len?: number;
  /** an arc: degrees turned (+ = right) */
  turn?: number;
  /** the arc's radius at the ridge (metres) */
  radius?: number;
  /** a spiral: the radius at the leg's end (default `radius`) */
  toRadius?: number;
  /** metres the ridge drops over the leg (negative: it climbs) */
  drop?: number;
  /** A-frames ('both'): the face the racing line rides from this leg on (a spine crossing) */
  ride?: 'left' | 'right';
  /** the racing line's depth on its face over this leg (0 = ridge, 1 = foot) */
  depth?: number;
  /** this leg's red strip (a depth, as CurveEl.red), or `false` for none (default: the curve's) */
  red?: number | false;
}

/**
 * A curved surf ramp (./curve.ts): the ridge starts at `at` heading `heading` and follows the
 * legs; faces `height` tall at `angle` degrees on `side` ('left' / 'right' of the way, or an
 * A-frame 'both' ridden on `ride`). Built from free-form prisms joined exactly (BoxDef.hull).
 */
export interface CurveEl extends RouteBase {
  t: 'curve';
  at: P3;
  heading: number;
  legs: CurveLeg[];
  height: number;
  angle: number;
  side: 'left' | 'right' | 'both';
  ride?: 'left' | 'right';
  /** how far down the face the racing line runs (0 = ridge, 1 = foot; default 0.35) */
  depth?: number;
  /** a red strip on the riding face from this depth down to its foot (a height to hold) */
  red?: number;
  /** the face colour (default: the stage's surf colour) */
  color?: number;
  /** the racing line leaves the ramp this far (metres, flat) before its end (default 0) */
  early?: number;
  /** the racing line boards the ramp this far (metres, flat) after its start (default 0) */
  lead?: number;
}

/**
 * Where a recovery puts you (gates and anchors): standing in a restart bay at `bay` (feet)
 * facing `bayHeading`, with a launch pad a step ahead that throws you onto `to` (feet, on the
 * route) in `flightSec`: the same, tested re-entry every time.
 */
export interface RestartBay {
  bay: P3;
  /** default: toward `to` */
  bayHeading?: number;
  to: P3;
  flightSec: number;
}

/**
 * A fly-through progress gate (surf maps): passing through its opening (`size` [width, height]
 * with its bottom middle at `at`, facing `heading`) counts: gates in order, each a split. A fall
 * after it brings you back to its restart bay. `finish`: the finish gate (no bay).
 */
export interface GateEl extends RouteBase, Partial<RestartBay> {
  t: 'gate';
  at: P3;
  heading: number;
  size: P2;
  name?: string;
  finish?: boolean;
}

/**
 * A recovery anchor (R): a light fly-through ring on the route. Passing it grants no progress;
 * it only moves where a fall in this section brings you back: its restart bay.
 */
export interface AnchorEl extends RouteBase, RestartBay {
  t: 'anchor';
  at: P3;
  heading: number;
  /** [width, height] of the ring (the trigger), bottom middle at `at` (default [10, 10]) */
  size?: P2;
  name?: string;
}

/** A red zone block: bottom middle at `at`, [width, height, depth], turned to `heading`. */
export interface RedEl extends RouteBase {
  t: 'red';
  at: P3;
  size: P3;
  heading?: number;
}

export type RouteElement =
  | CurveEl
  | GateEl
  | AnchorEl
  | RedEl
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
  /**
   * architecture: a plain block (bottom middle at `at`, [width, height, depth]) or an
   * eight-sided column (`round`); scenery never collides unless `solid` — `glass`: a
   * see-through pane (a faint tint, its edges drawn as thin lines) that never collides, even
   * when `solid`; `lowDetail`: one flat quad per face (surfaces never seen up close)
   */
  | {
      t: 'block';
      at: P3;
      size: P3;
      heading?: number;
      color?: number;
      mat?: 'rock' | 'sand' | 'wood' | 'panel' | 'plate' | 'glow' | 'trim' | 'glass';
      round?: boolean;
      solid?: boolean;
      lowDetail?: boolean;
    }
  /**
   * a flat sea or pool surface (its middle at `at`), never collides — or, `shallow`, a canal
   * floor under `depth` m of water (default 1): you land on it (it is ground, not a kill) and
   * wade at `speedMul` × sprint speed (default 0.6) until you jump out
   */
  | {
      t: 'water';
      at: P3;
      size: P2;
      color?: number;
      shallow?: boolean;
      depth?: number;
      speedMul?: number;
    }
  /** a lighthouse standing on `at`: a tapering tower, a glowing lens room, a beam */
  | { t: 'lighthouse'; at: P3; height: number; heading?: number }
  /** a lamp on a post (a warm maintenance light) standing on `at` */
  | { t: 'lamp'; at: P3; color?: number; height?: number }
  /** a monumental arch standing on `at` (two columns, a lintel with a glowing strip) */
  | { t: 'arch'; at: P3; heading: number; width: number; height: number; color?: number }
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
  /** what the checkpoint rooms are built of (default 'rock') */
  roomMat?: 'rock' | 'sand' | 'wood' | 'panel' | 'plate';
  /**
   * surf ramp colours, one per stage (the n-th stage's ramps use the n-th colour, round and
   * round): each stretch of ramps reads as its own (default: the palette's `surf`)
   */
  surfColors?: number[];
  /** race tracks: the jetpack and SURGE (default on; surf maps never have them) */
  jetpack?: boolean;
  surge?: boolean;
  /** surf maps: the standard mode it belongs to (lists and leaderboards group by it) */
  mode?: CourseMode;
  /** surf maps: the movement profile it was fitted to (docs/movement-map-design) */
  profile?: string;
  /** holding Space bunny-hops (RaceDef.holdToBhop; default off: every hop a fresh press) */
  holdToBhop?: boolean;
  /**
   * optional faster (or slower salvage) lines: each a list of feet points to drive from where it
   * leaves the racing line to where it rejoins it — tests drive them (RaceDef.forks)
   */
  forks?: CourseFork[];
}

/** An alternative line through the course (RaceForkDef): its points and how they are ridden. */
export interface CourseFork {
  name: string;
  /** the safe way it replaces, and what it asks */
  safe: string;
  risky: string;
  /**
   * feet points: `surf` on a ramp's face, `air` a point to fly through, `portal` a portal's
   * opening flown through (the next point is where it puts you); else a landing
   */
  line: {
    at: P3;
    surf?: boolean;
    air?: boolean;
    jump?: boolean;
    hop?: boolean;
    portal?: boolean;
  }[];
  /** a slower salvage line (it rejoins later than the racing line would), not a shortcut */
  salvage?: boolean;
}
