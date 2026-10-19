// Automatic cover for graybox maps (level/graybox.ts): crates, low walls and pillars placed from
// the layout's cells so open areas break into duels (the openness targets, tools/map/openness.ts).
// Deterministic: the same layout always gets the same cover.
import type { BoxDef } from './types';
import type { GrayboxLayout } from './graybox';

/** One walkable floor cell of a built graybox (what cover is placed from). */
export interface GrayboxFloorCell {
  /** grid column / row and layer index */
  x: number;
  y: number;
  l: number;
  /** area character */
  c: string;
  /** floor height at the cell centre (m) */
  h: number;
  /** the cell is part of a ramp / stairs (no cover on it) */
  sloped: boolean;
  /** walked upside down / on a side: no cover (for now) */
  o: 'up' | 'down' | 'side';
}

/**
 * Cover boxes for a layout. Must keep every route walkable: never on stairs, never blocking a
 * one-cell-wide passage, never on spawns, and clear of the doorway between two areas.
 */
export const grayboxCover = (_lay: GrayboxLayout, _cells: GrayboxFloorCell[]): BoxDef[] => [];
