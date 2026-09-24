// Player input for one simulation tick.
import type { Quat } from '../math/quat';
import { qIdentity } from '../math/quat';

export const Btn = {
  Forward: 1 << 0,
  Back: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Jump: 1 << 4,
  Crouch: 1 << 5,
  Dash: 1 << 6,
  Fire: 1 << 7, // LMB: aim/throw Quick Throw, fire Wind-up, or Laser
  Alt: 1 << 8, // RMB: Wind-up (in hand) or steer (in flight)
  Melee: 1 << 9, // E: slash / deflect
  Grenade: 1 << 10, // Q
  Recall: 1 << 11, // R
  MagBoots: 1 << 12, // F
} as const;

export const ALL_BUTTONS = (1 << 13) - 1;

export interface PlayerInput {
  tick: number;
  buttons: number;
  /** World-space view orientation (camera looks down local -Z). */
  view: Quat;
}

export const emptyInput = (tick = 0): PlayerInput => ({ tick, buttons: 0, view: qIdentity() });

export const has = (buttons: number, b: number): boolean => (buttons & b) !== 0;
