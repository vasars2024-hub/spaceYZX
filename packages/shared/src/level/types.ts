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
  | 'trim'; // emissive strip

export interface BoxDef {
  c: Vec3; // center
  h: Vec3; // half extents
  q?: Quat; // rotation (omit for axis-aligned)
  mat?: Material;
  color?: number; // override base color (0xRRGGBB)
  trim?: number; // emissive edge trim color
  noCollide?: boolean; // decoration only
  noRender?: boolean; // invisible collider
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
  /** Sky duel overtime arena high above the ship (competitive maps; level/sky-arena.ts). */
  skyArena?: SkyArenaDef;
  /** Arena 1v1 maps: the duel pits, top pit first (rules/arena.ts). */
  arenaPits?: ArenaPitDef[];
}
