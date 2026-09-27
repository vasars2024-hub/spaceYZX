// The base colour of every level material (the renderer's and the Map Maker's, one table).
import type { Material } from './types';

export const MATERIAL_COLORS: Record<Material, number> = {
  hull: 0x3a4660,
  floor: 0x4b5670,
  plate: 0x4e586c,
  grate: 0x5a6478,
  panel: 0x5d6b88,
  crate: 0x7c6242,
  pillar: 0x4d5a78,
  engine: 0x4f3c50,
  teamA: 0x2a8296,
  teamB: 0x96602a,
  glass: 0xffffff,
  skyglass: 0x9fd0ff,
  trim: 0xffffff,
  rock: 0xb5653b,
  sand: 0xd8b27a,
  wood: 0x6b4a34,
  paper: 0xede3d1,
  leaf: 0xf4b8c8,
  // size walls (level/size-walls.ts): a glowing cyan force field
  forcefield: 0x38e8ff,
  cloud: 0xf2f4f8,
  glow: 0xff5a2a,
};
