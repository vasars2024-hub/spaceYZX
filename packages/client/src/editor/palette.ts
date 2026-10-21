// MAP MAKER — what you can place: the block shapes (with a sensible starting size each), the
// materials, the gameplay objects, and the hotbar (keys 1-0).
import type { CustomBlock, CustomMaterial, CustomShape } from '@space-yz/shared';
import { CUSTOM_MATERIAL_COLORS, isCurveShape } from '@space-yz/shared';
import type { V3 } from './model';
import { fitWave } from './curve-edit';

/** A thing to place: a block of some shape, or a gameplay object. */
export type BrushId =
  | 'platform'
  | 'block'
  | 'wall'
  | 'wedge'
  | 'surf'
  | 'surfSide'
  | 'curveSurf'
  | 'curveRamp'
  | 'quarterPipe'
  | 'curvePlatform'
  | 'cylinder'
  | 'pillar'
  | 'killpaint'
  | 'glass'
  | 'start'
  | 'checkpoint'
  | 'finish'
  | 'spawn'
  | 'portal'
  | 'pad';

export interface BlockBrush {
  id: BrushId;
  label: string;
  desc: string;
  shape: CustomShape;
  size: V3;
  mat?: CustomMaterial;
  curve?: CustomBlock['curve'];
}

export const BLOCK_BRUSHES: BlockBrush[] = [
  {
    id: 'platform',
    label: 'Platform',
    desc: 'A flat floor to stand on',
    shape: 'box',
    size: [4, 0.5, 4],
  },
  { id: 'block', label: 'Block', desc: 'A 1 m cube for building', shape: 'box', size: [1, 1, 1] },
  { id: 'wall', label: 'Wall', desc: 'A tall thin wall', shape: 'box', size: [4, 3, 0.5] },
  { id: 'wedge', label: 'Ramp', desc: 'A ramp you can walk up', shape: 'wedge', size: [4, 2, 6] },
  {
    id: 'surf',
    label: 'Surf ramp',
    desc: 'A steep A-frame to surf on',
    shape: 'surf',
    size: [10, 6, 24],
  },
  {
    id: 'surfSide',
    label: 'One-sided surf',
    desc: 'A surf ramp with one sloped side',
    shape: 'surfSide',
    size: [5, 6, 24],
  },
  {
    id: 'curveSurf',
    label: 'Curved surf',
    desc: 'A surf ramp bent round a corner',
    shape: 'curveSurf',
    size: [10, 5, 1],
    curve: { radius: 24, angle: 90 },
  },
  {
    id: 'curveRamp',
    label: 'Curved ramp',
    desc: 'A ramp that climbs while it turns',
    shape: 'curveRamp',
    size: [4, 0.5, 1],
    curve: { radius: 10, angle: 180, rise: 6 },
  },
  {
    id: 'quarterPipe',
    label: 'Quarter pipe',
    desc: 'Curves up from flat to a wall',
    shape: 'quarterPipe',
    size: [6, 4, 1],
  },
  {
    id: 'curvePlatform',
    label: 'Curved walkway',
    desc: 'A flat path round a corner',
    shape: 'curvePlatform',
    size: [4, 0.5, 1],
    curve: { radius: 12, angle: 90 },
  },
  {
    id: 'cylinder',
    label: 'Round platform',
    desc: 'A round floor',
    shape: 'cylinder',
    size: [4, 0.5, 4],
  },
  { id: 'pillar', label: 'Pillar', desc: 'A round column', shape: 'cylinder', size: [1, 6, 1] },
  {
    id: 'glass',
    label: 'Glass',
    desc: 'See-through, but solid',
    shape: 'box',
    size: [4, 0.25, 4],
    mat: 'glass',
  },
  {
    id: 'killpaint',
    label: 'Kill paint',
    desc: 'Flat red paint: touch it and you die',
    shape: 'killpaint',
    size: [4, 0.1, 4],
    mat: 'killpaint',
  },
];

export interface ObjectBrush {
  id: BrushId;
  label: string;
  desc: string;
}

export const OBJECT_BRUSHES: ObjectBrush[] = [
  { id: 'start', label: 'Start', desc: 'Where a race starts (one per map)' },
  { id: 'checkpoint', label: 'Checkpoint', desc: 'Race gates, passed in order' },
  { id: 'finish', label: 'Finish', desc: 'Where a race ends (one per map)' },
  { id: 'spawn', label: 'Spawn point', desc: 'Where players appear' },
  { id: 'portal', label: 'Portal', desc: 'Place the entry, then the exit' },
  { id: 'pad', label: 'Launch pad', desc: 'Throws players into the air' },
];

export const blockBrush = (id: BrushId): BlockBrush | undefined =>
  BLOCK_BRUSHES.find((b) => b.id === id);
export const isObjectBrush = (id: BrushId): boolean => OBJECT_BRUSHES.some((b) => b.id === id);
export const brushLabel = (id: BrushId): string =>
  (blockBrush(id) ?? OBJECT_BRUSHES.find((b) => b.id === id))?.label ?? id;

/** Materials in the order the palette shows them (kill paint is its own shape). */
export const MATERIALS: { id: CustomMaterial; label: string }[] = [
  { id: 'concrete', label: 'Concrete' },
  { id: 'metal', label: 'Metal' },
  { id: 'wood', label: 'Wood' },
  { id: 'rock', label: 'Rock' },
  { id: 'sand', label: 'Sand' },
  { id: 'grass', label: 'Grass' },
  { id: 'ice', label: 'Ice' },
  { id: 'glass', label: 'Glass' },
  { id: 'neon', label: 'Neon' },
];

export const materialColor = (m: CustomMaterial): number => CUSTOM_MATERIAL_COLORS[m];

/** Colour swatches for the colour picker (plus "material colour"). */
export const SWATCHES = [
  0xf2f4f8, 0x8c9099, 0x3a4660, 0x19e3ff, 0x3dff9a, 0xffd23f, 0xff8a1f, 0xff4a5e, 0xff6ad5,
  0xa46bff, 0x5aa9ff, 0x8a5a3a,
];

/** The hotbar: [key, brush or 'select']. */
export const HOTBAR: { key: string; tool: BrushId | 'select' }[] = [
  { key: '1', tool: 'select' },
  { key: '2', tool: 'platform' },
  { key: '3', tool: 'block' },
  { key: '4', tool: 'wedge' },
  { key: '5', tool: 'surf' },
  { key: '6', tool: 'curveRamp' },
  { key: '7', tool: 'killpaint' },
  { key: '8', tool: 'checkpoint' },
  { key: '9', tool: 'portal' },
  { key: '0', tool: 'pad' },
];

/** A new block for a brush (at `pos`, facing `yaw`), with the palette's material and colour. */
export const makeBlock = (
  brush: BlockBrush,
  pos: V3,
  yaw: number,
  mat: CustomMaterial,
  color: number | null,
  size?: V3,
  curve?: CustomBlock['curve'],
): Omit<CustomBlock, 'id'> => {
  const m: CustomMaterial = brush.shape === 'killpaint' ? 'killpaint' : (brush.mat ?? mat);
  const b: Omit<CustomBlock, 'id'> = {
    shape: brush.shape,
    pos,
    size: [...(size ?? brush.size)] as V3,
    mat: m,
  };
  if (yaw) b.rot = [yaw, 0, 0];
  if (color !== null && m !== 'killpaint' && !brush.mat) b.color = color;
  if (isCurveShape(brush.shape) && (curve ?? brush.curve)) b.curve = { ...(curve ?? brush.curve)! };
  return fitWave(b);
};
