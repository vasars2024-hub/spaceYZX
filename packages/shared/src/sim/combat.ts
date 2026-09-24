// Combat step (Boomerang, Laser, Grenade, Slash). Implemented in Milestone 3.
import type { SimContext } from './context';
import type { PlayerInput } from './input';
import type { WorldState } from './state';

export const updateCombat = (
  _world: WorldState,
  _ctx: SimContext,
  _inputs: Record<number, PlayerInput>,
): void => {};
