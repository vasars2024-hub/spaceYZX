// Static level description (authored by map builder code) — plain data.
import type { Vec3 } from '../math/vec3';
import type { Quat } from '../math/quat';

export type Material =
  | 'hull' // dark metal walls
  | 'floor'
  | 'plate' // plated floor (lanes)
  | 'grate' // open grating (gantries, catwalks)
  | 'panel' // lighter wall panels
  | 'crate'
  | 'pillar'
  | 'glass' // visual only
  | 'skyglass' // see-through glass to space (glass ceilings, hull windows); collides like a wall
  | 'engine'
  | 'teamA'
  | 'teamB'
  | 'trim' // emissive strip
  // natural, untextured surfaces (outdoor maps: flat low-poly colour + baked light)
  | 'rock'
  | 'sand'
  | 'wood'
  | 'paper' // shoji screens (see BoxDef.boomerangPasses)
  | 'leaf' // foliage (blossom canopies, shrubs)
  | 'forcefield' // glowing size-wall barrier (LevelDef.sizeWalls): blocks everything
  // race courses (level/course): the deadly cloud sea and the glow under it
  | 'cloud' // soft, slightly see-through, shaded bright on top: never mistaken for a platform
  | 'glow'; // unlit, full-bright colour (danger glow, signs) that lights nothing around it

export interface BoxDef {
  c: Vec3; // center
  h: Vec3; // half extents
  q?: Quat; // rotation (omit for axis-aligned)
  mat?: Material;
  color?: number; // override base color (0xRRGGBB)
  trim?: number; // emissive edge trim color
  noCollide?: boolean; // decoration only
  noRender?: boolean; // invisible collider
  /**
   * The Boomerang flies straight through it (paper screens); players, bullets, lasers and
   * grenades still collide, and it still blocks line of sight (bots, the server's visibility
   * culling, baked light). Only the Boomerang's flight raycasts skip it (sim/combat.ts).
   */
  boomerangPasses?: boolean;
  /**
   * Sight passes through it (glass blocks of player-made maps): it still collides and stops
   * bullets, but never blocks line of sight (bots, the server's visibility culling, baked light).
   */
  seeThrough?: boolean;
  /**
   * A triangular prism instead of a box (surf ramps): the local top face shrinks to a ridge
   * along local x at local z = prism × h.z (-1..1: 0 = a symmetric A-frame, ±1 = a right-angle
   * wedge). The base (local -y) and the ends (±x) stay as they are. Collision matches
   * (level/collision.ts), and so does the renderer.
   */
  prism?: number;
  /**
   * A surf ramp (race tracks): never ground, however you touch it — no friction, gravity slides
   * you down it, your velocity is clipped along it (air-strafe into it to stay on), and you can't
   * wall-jump or mantle off it (sim/movement.ts). Build it steeper than the walkable slope.
   */
  surf?: boolean;
  /**
   * Render each face as one flat quad instead of ~2.5 m lit tiles (far scenery, clouds): a
   * handful of triangles however big it is.
   */
  lowDetail?: boolean;
}

export interface GravityZoneDef {
  name: string;
  min: Vec3;
  max: Vec3;
  gravity: Vec3; // m/s² vector, zero = zero-G
  priority?: number; // higher wins where zones overlap
}

export interface RailDef {
  points: Vec3[]; // polyline the player hangs from
}

export interface GravityPadDef {
  min: Vec3; // trigger volume
  max: Vec3;
  zone: string; // name of the zone whose gravity flips
  gravity: Vec3; // gravity while flipped
  durationSec: number;
  cooldownSec: number;
}

export interface SpawnDef {
  pos: Vec3; // feet position
  yawDeg: number; // facing, measured around +Y from -Z toward +X... see yawToForward
  team?: 0 | 1;
}

export interface TowerDef {
  team: 0 | 1;
  pos: Vec3; // base center
  radius: number;
  height: number;
}

export interface WaypointDef {
  pos: Vec3;
  links: number[]; // outgoing links (usually both ways; drops into gravity areas are one-way)
  /** optional label (map tools and tests refer to waypoints by name) */
  name?: string;
}

/**
 * A launch pad (sim/devices.ts): step into its volume and you are thrown with `vel` (m/s,
 * world space). Only players; bots never path over one.
 */
export interface LaunchPadDef {
  min: Vec3;
  max: Vec3;
  vel: Vec3;
}

/**
 * One side of a portal (sim/devices.ts): a player whose body centre enters `min..max` comes out
 * at `exit` (body centre) with the same velocity and facing. Portals come in pairs, each side
 * its own entry; an exit must lie outside every portal volume (no ping-pong).
 */
export interface PortalDef {
  name: string;
  min: Vec3;
  max: Vec3;
  exit: Vec3;
  /** frame / glow color */
  color: number;
}

/** A bomb site (Bomb mode): the area where the bomb can be planted. */
export interface BombSiteDef {
  name: 'A' | 'B';
  min: Vec3;
  max: Vec3;
}

/** Open space outside the ship: stars plus a few moons (drawn far away, never collide). */
export interface SkyDef {
  moons: {
    /** direction from the map centre toward the moon */
    dir: Vec3;
    /** apparent radius in degrees */
    sizeDeg: number;
    color: number;
  }[];
}

/** A deadly volume (a gorge, a pit): a living player whose body centre enters it dies. */
export interface KillVolumeDef {
  min: Vec3;
  max: Vec3;
}

/**
 * A volume that slows players (wading through a moat): while the body centre is inside,
 * horizontal speed is capped at `speedMul` × sprint speed (sim/movement.ts).
 */
export interface SlowZoneDef {
  min: Vec3;
  max: Vec3;
  speedMul: number;
}

/**
 * An open-air sky (outdoor maps): a gradient dome drawn behind everything, an optional sun
 * disc, and a coloured key light baked into the level. The fog should use the horizon colour so
 * far terrain melts into the sky.
 */
export interface OutdoorSkyDef {
  /** straight up */
  top: number;
  /** at the horizon */
  horizon: number;
  /** below the horizon */
  ground: number;
  sun?: { dir: Vec3; color: number; sizeDeg: number };
  /** colour of the baked key light (default white) */
  sunLight?: number;
  /** a night sky: stars over the gradient */
  stars?: boolean;
}

/** A light baked into the level's surfaces (plus a glow, and optionally a light shaft). */
export interface LightDef {
  pos: Vec3;
  color: number;
  radius: number; // meters
  intensity: number; // ~0.5 subtle .. 2 strong
  /** draw a soft volumetric cone down to the floor (hall/base ceiling lights) */
  shaft?: boolean;
}

/**
 * The "sky duel" overtime arena: floating platforms far above the ship, open on every side
 * (see level/sky-arena.ts). Its boxes are kept apart from `boxes` (map tools, the mirror
 * check and the ship's renderer only look at the ship) and joined into the collision by
 * `buildLevel`.
 */
export interface SkyArenaDef {
  /** middle of the main platform's top surface */
  center: Vec3;
  /** horizontal half-size of the whole arena (all platforms), metres */
  radius: number;
  boxes: BoxDef[];
  /** where each team starts the duel (feet), facing the other end */
  spawns: SpawnDef[];
}

/**
 * One copy ("pit") of a duel arena (Arena 1v1, rules/arena.ts): a sealed room where two
 * players fight. Maps built for the Arena hold several pits far apart so duels run side by side.
 */
export interface ArenaPitDef {
  /** middle of the pit's floor */
  center: Vec3;
  /** the open volume inside the walls */
  min: Vec3;
  max: Vec3;
  /** [team 0 end (-x), team 1 end (+x)], facing each other */
  spawns: [SpawnDef, SpawnDef];
}

export interface LevelDef {
  name: string;
  boundsMin: Vec3;
  boundsMax: Vec3;
  defaultGravity: Vec3;
  boxes: BoxDef[];
  zones: GravityZoneDef[];
  rails: RailDef[];
  pads: GravityPadDef[];
  spawns: SpawnDef[];
  towers: TowerDef[];
  controllerHomes?: Vec3[]; // per team: where a dropped Controller returns
  waypoints?: WaypointDef[];
  areas?: { name: string; pos: Vec3; yawDeg: number }[]; // dev teleports
  fog?: { color: number; near: number; far: number };
  /** Tint each half of a mirrored map (x < 0 / x > 0) toward its team color (0..1 amount). */
  sideTint?: { neg: number; pos: number; amount: number };
  /** Atmospheric lights (strip lights made of 'trim' boxes add their own automatically). */
  lights?: LightDef[];
  /** Overall ambient light level (default 1); lower = moodier, lights stand out more. */
  ambient?: number;
  /** Bomb mode data: the two plant sites. */
  bombSites?: BombSiteDef[];
  /** Launch pads (sim/devices.ts). */
  launchPads?: LaunchPadDef[];
  /** Portals (sim/devices.ts): each entry teleports one way; pairs are two entries. */
  portals?: PortalDef[];
  /** Power-up spawn points (rules/powerups.ts): where power-ups float during a round. */
  powerups?: Vec3[];
  /** Space outside the ship (visible through 'skyglass'). */
  sky?: SkyDef;
  /** Open-air sky for outdoor maps (render only). */
  outdoor?: OutdoorSkyDef;
  /** Deadly volumes (falling into a gorge): sim/world.ts kills whoever enters one. */
  killVolumes?: KillVolumeDef[];
  /** Volumes that slow players down (a moat): sim/movement.ts. */
  slowZones?: SlowZoneDef[];
  /** Sky duel overtime arena high above the ship (competitive maps; level/sky-arena.ts). */
  skyArena?: SkyArenaDef;
  /** Arena 1v1 maps: the duel pits, top pit first (rules/arena.ts). */
  arenaPits?: ArenaPitDef[];
  /** Race tracks: the course (start, checkpoints, finish, fuel cells...; sim/race.ts). */
  race?: RaceDef;
  /**
   * Smaller teams play a smaller map (level/size-walls.ts): force-field walls that close parts
   * of the map when the match's players per team is at most `maxTeamSize`. Room and client
   * build the level for the room's team size (mapDefForSize).
   */
  sizeWalls?: SizeWallDef[];
  /**
   * Moving blocks (player-made maps, level/custom): boxes that travel between 2-4 points and
   * loop. Where they are is a pure function of the world tick (level/movers.ts), so the server
   * and every client's prediction agree; they collide at that spot (level.ts setLevelTick) and
   * carry whoever stands on them (sim/world.ts). Absent = nothing moves.
   */
  movers?: MoverDef[];
}

/**
 * A moving block (level/movers.ts): its boxes are drawn and collide at their authored place
 * plus the mover's offset for the current tick. At tick 0 it waits `delay` at path[0], travels
 * at `speed` to path[1], waits, ... and after the last point travels back to path[0], forever.
 */
export interface MoverDef {
  /** indices into LevelDef.boxes of the boxes it moves */
  boxes: number[];
  /** 2..4 offsets from the boxes' authored place, in order (path[0] is usually 0,0,0) */
  path: Vec3[];
  /** m/s along the path */
  speed: number;
  /** seconds it waits at each point */
  delay: number;
  /** deadly volumes that ride along (red kill paint on a moving block), at the authored place */
  killVolumes?: KillVolumeDef[];
}

/**
 * One layer of size walls: glowing force-field panels (players, bullets, Boomerangs and sight
 * all stop at them) that exist only when the match has at most `maxTeamSize` players per team.
 * Towers, bomb sites and spawns must stay in the open part; a layer may move them. With several
 * active layers, overrides come from the smallest layer that has them.
 */
export interface SizeWallDef {
  maxTeamSize: number;
  /** the walls (rendered as 'forcefield'; they collide like any wall) */
  boxes: BoxDef[];
  /** replacements while this layer is up (else the map's own) */
  spawns?: SpawnDef[];
  towers?: TowerDef[];
  controllerHomes?: Vec3[];
  bombSites?: BombSiteDef[];
}

/** A race gate (checkpoint or finish): the body centre passing through `min..max` counts. */
export interface RaceGateDef {
  min: Vec3;
  max: Vec3;
  /** where you come back (feet) after a fall or the respawn key, facing `yawDeg` */
  respawn: Vec3;
  yawDeg: number;
  /** the stretch it starts (shown over the gate: "3 · THE GRAND SURF") */
  name?: string;
}

/**
 * One point of a track's racing line: the safe route, in order. Bot racers and the timing test
 * drive along it; it also orders racers between gates.
 */
export interface RaceLineNode {
  /** feet position */
  pos: Vec3;
  /** jump here (a take-off edge, or under a zip-rail's start to grab it) */
  jump?: boolean;
  /** a portal: walk into it; the next node is where you come out */
  portal?: boolean;
  /** risky lines: after this node's jump keep Space held this many ticks (a jetpack burn) */
  jet?: number;
  /** risky lines: SURGE here (just before a long jump) */
  surge?: boolean;
  /** risky lines: switch the gravity boots on here (stick to the wall beside you) */
  mag?: boolean;
  /**
   * bunny-hop from here to the next node: jump again on the first ground tick of every landing
   * and air-strafe (bots/racer.ts)
   */
  hop?: boolean;
  /** air-strafe toward the next node (a drop, a surf transfer, a strafed long jump) */
  strafe?: boolean;
  /** on a surf ramp's face: surf (strafe into the ramp) toward the next node */
  surf?: boolean;
  /** a point in the air to pass through (a window, a ring): not somewhere you land */
  air?: boolean;
  /** gates passed before reaching this node (0 = before checkpoint 1) */
  cp: number;
}

/** A fork in a track: a safe longer path and a risky shortcut (shown in docs and tests). */
export interface RaceForkDef {
  name: string;
  /** checkpoint section it is in (gates passed before it) */
  cp: number;
  safe: string;
  risky: string;
  /**
   * the risky shortcut's line, from the fork to where it rejoins (with the moves it needs:
   * jumps, jetpack burns, surges, gravity boots) — the track tests drive it
   */
  riskyLine: RaceLineNode[];
}

/**
 * A race track (rules/race.ts, sim/race.ts): start grid, numbered checkpoint gates in order,
 * the finish arch, fuel cells that refill the jetpack, and what counts as falling off.
 */
export interface RaceDef {
  /** a good run, seconds (the DNF limit is a multiple of it) */
  parSec: number;
  /** respawn point before checkpoint 1 (feet), facing the course */
  start: { respawn: Vec3; yawDeg: number };
  /** start slots, up to 8 (feet) */
  grid: SpawnDef[];
  checkpoints: RaceGateDef[];
  finish: RaceGateDef;
  /** below this height you fell off: back to your last checkpoint */
  killY: number;
  /** more fall-off volumes (a river, a crevasse) */
  killVolumes?: { min: Vec3; max: Vec3 }[];
  /** fuel cells (body centre): each refills your jetpack once per race */
  fuelCells?: Vec3[];
  line: RaceLineNode[];
  forks?: RaceForkDef[];
  /** a surf map (CS-style surf stages): no jetpack and no SURGE (sim/movement.ts) */
  surf?: boolean;
  /** no jetpack on this track (surf maps, or a track not built around it) */
  noJetpack?: boolean;
  /** no SURGE charges on this track */
  noSurge?: boolean;
}
