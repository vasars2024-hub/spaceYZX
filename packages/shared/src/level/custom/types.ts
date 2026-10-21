// A player-made map (the in-game Map Maker): plain JSON, saved to the player's account, sent to
// everyone in a room that plays it and compiled into a LevelDef on the server and every client
// alike (level/custom/compile.ts). This file is the contract between the sim, the server and the
// editor: change it only with a version bump (CUSTOM_MAP_VERSION) and a migration in compile.
//
// Units are metres, +y is up. Rotations are in degrees, applied yaw (around +y) then pitch
// (around the block's own x) then roll (around its own z). Yaw uses the course headings
// convention: 0 faces -z (north), 90 faces +x (east).

/** Bump when the shape of a CustomMapDoc changes (compile migrates older docs). */
export const CUSTOM_MAP_VERSION = 1;

/** Limits the server enforces (and the editor shows): a map stays small enough to send. */
export const CUSTOM_MAP_LIMITS = {
  /** blocks, after curves are counted as the pieces they expand into */
  maxPieces: 6000,
  /** the JSON as sent (bytes) */
  maxBytes: 1_500_000,
  /** every coordinate stays inside ±this (the network range is ±500) */
  maxCoord: 480,
  movers: 64,
  /** points per mover path (the owner asked for 2, 3 or 4) */
  moverPoints: [2, 4] as const,
  /** m/s */
  moverSpeed: [0.5, 30] as const,
  /** seconds a mover waits at each point */
  moverDelay: [0, 30] as const,
  checkpoints: 40,
  portals: 40,
  maps: 30, // saved maps per account
  nameLength: 40,
};

/** What a block is made of (how it looks and behaves). */
export type CustomMaterial =
  | 'concrete' // plain grey building block
  | 'metal'
  | 'wood'
  | 'rock'
  | 'sand'
  | 'grass'
  | 'ice' // looks icy (plays like any floor)
  | 'glass' // see-through, and solid: you stand on it, bullets and Boomerangs stop at it
  | 'neon' // glowing, full-bright colour
  | 'killpaint'; // flat red paint: touch it and you die (race: back to the last checkpoint)

/**
 * The block shapes. Every shape is one piece except the curves, which expand into several
 * straight pieces along an arc (compile.ts; each piece counts toward maxPieces).
 */
export type CustomShape =
  | 'box' // any block: platforms, walls, pillars, stairs steps
  | 'wedge' // a walkable ramp (right-angle wedge rising along +z of the block)
  | 'surf' // a surf ramp: A-frame prism (surf physics, like the race maps)
  | 'surfSide' // a one-sided surf ramp (right-angle prism, steep face to the right)
  | 'curveSurf' // a surf ramp bent along an arc (turning left or right)
  | 'curveRamp' // a walkable ramp that climbs while it turns (a spiral / helix section)
  | 'quarterPipe' // curves up from flat to vertical (skate-park style)
  | 'curvePlatform' // a flat walkway along an arc
  | 'cylinder' // a round pillar or round platform (built from boxes)
  | 'killpaint'; // a thin flat red slab (always material 'killpaint')

export interface CustomBlock {
  /** unique inside the map (the editor gives ids; movers refer to them) */
  id: number;
  shape: CustomShape;
  /** centre of the block's bounding box (for curves: the arc's centre, at floor height) */
  pos: [number, number, number];
  /**
   * size [width x, height y, depth z] in metres (min 0.1). For curves: x = width of the track,
   * y = thickness (or the ramp height for curveSurf/quarterPipe), z unused.
   */
  size: [number, number, number];
  /** [yaw, pitch, roll] in degrees (omit = 0,0,0) */
  rot?: [number, number, number];
  mat: CustomMaterial;
  /** 0xRRGGBB (omit: the material's colour) */
  color?: number;
  /** curves only */
  curve?: {
    /** radius of the arc's centre line (m) */
    radius: number;
    /** how far round it turns (degrees, 10..360; negative = turns left) */
    angle: number;
    /**
     * height gained over the whole curve (m; negative = it drops). curveRamp: the climb of the
     * helix. The other curves may rise or drop too (a surf ramp dropping as it turns).
     */
    rise?: number;
    /** straight pieces it is built from (4..48; more = smoother) */
    segments?: number;
    /**
     * the curve's type (default 'arc'):
     *  - 'arc': one steady turn of `angle` at `radius`
     *  - 'sCurve': turns `angle`/2 one way, then `angle`/2 back the other way (same radius)
     *  - 'spiral': the radius changes steadily from `radius` to `endRadius` (tightening or
     *    widening turn)
     *  - 'wave': runs along the arc and bends up and down: `waves` full humps of `amplitude`
     */
    kind?: 'arc' | 'sCurve' | 'spiral' | 'wave';
    /** spiral: the radius at the end (m, 2..200) */
    endRadius?: number;
    /** wave: height of each hump (m; negative = dips first), -12..12 */
    amplitude?: number;
    /** wave: how many humps along the curve (0.5..6) */
    waves?: number;
    /**
     * curveSurf / surf faces: steepness of the surf faces in degrees (46..80, default 55; must
     * stay steeper than the walkable slope so it surfs)
     */
    steepness?: number;
    /** curveRamp / curvePlatform: bank the track (degrees, -45..45: tilt toward the inside) */
    bank?: number;
  };
  /** a solid block you can see but not touch (decoration) */
  noCollide?: boolean;
}

/** A block that moves between 2-4 points in order, then back to point 1, forever. */
export interface CustomMover {
  /** the block that moves (its pos is point 1 when the map starts) */
  block: number;
  /** 2..4 positions of the block's centre, in order; after the last it goes back to the first */
  points: [number, number, number][];
  /** metres per second between points */
  speed: number;
  /** seconds it waits at each point before moving on */
  delay: number;
}

/** A player spawn (feet position, facing). */
export interface CustomSpawn {
  pos: [number, number, number];
  yaw: number;
  /** team 0/1 for team modes; omit = anyone */
  team?: 0 | 1;
}

/** A race gate: pass through the box; respawn in it after a fall. */
export interface CustomGate {
  /** centre of the gate volume */
  pos: [number, number, number];
  /** [width, height, depth] of the volume */
  size: [number, number, number];
  /** facing after a respawn here */
  yaw: number;
  name?: string;
}

/** A portal: walk into `from`, come out at `to` with your speed and facing kept. */
export interface CustomPortal {
  from: { pos: [number, number, number]; size: [number, number, number] };
  to: [number, number, number];
  /** both ways (a second portal from `to` back to `from`) */
  twoWay?: boolean;
  color?: number;
}

/** A launch pad: step on it and get thrown with `vel` (m/s). */
export interface CustomLaunchPad {
  pos: [number, number, number];
  size: [number, number, number];
  vel: [number, number, number];
}

export type CustomSky = 'day' | 'sunset' | 'night' | 'space' | 'aurora';

/**
 * A box of a built-in map, named by what it is rather than its index (so an edit survives the
 * map's code gaining or losing other boxes): its centre and half extents rounded to 1 cm, as
 * "x,y,z|hx,hy,hz" (boxFingerprint in compile.ts). Several identical boxes share one.
 */
export type BoxFingerprint = string;

export interface CustomMapDoc {
  v: typeof CUSTOM_MAP_VERSION;
  name: string;
  /** the built-in map it was started from ('' = an empty map) */
  base: string;
  /**
   * An edit of a built-in map (the owner editing the real maps): the map is `base` built from
   * its code (towers, bomb sites, zones, rails, size walls... all kept), minus `removed` boxes,
   * plus this doc's blocks, movers, portals and launch pads; spawns and race replace the base's
   * only when given (non-empty). Without `patch` the doc is a whole map of its own.
   */
  patch?: {
    /** boxes of the base map deleted (or replaced by a block of this doc) */
    removed: BoxFingerprint[];
    /** base portals / launch pads deleted (their index in the base LevelDef) */
    removedPortals?: number[];
    removedLaunchPads?: number[];
  };
  sky: CustomSky;
  blocks: CustomBlock[];
  movers: CustomMover[];
  spawns: CustomSpawn[];
  /**
   * A race: set start, checkpoints (in order) and finish to make the map a race; without a
   * start and a finish it plays as free roam (practice with dummies) and team modes.
   */
  race?: {
    start: CustomGate;
    checkpoints: CustomGate[];
    finish: CustomGate;
    /** falling below this height sends you back (default: 30 m under the lowest block) */
    killY?: number;
    /** surf-style map (no jetpack, no SURGE) */
    surf?: boolean;
  };
  portals: CustomPortal[];
  launchPads: CustomLaunchPad[];
}
