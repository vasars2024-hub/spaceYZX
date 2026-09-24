// Static level description (authored by map builder code) — plain data.
import type { Vec3 } from '../math/vec3';
import type { Quat } from '../math/quat';

export type Material =
  | 'hull' // dark metal walls
  | 'floor'
  | 'panel' // lighter wall panels
  | 'crate'
  | 'pillar'
  | 'glass' // visual only
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
  links: number[];
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
}
