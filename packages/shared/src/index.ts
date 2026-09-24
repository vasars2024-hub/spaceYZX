// Public entry of @space-yz/shared.
export const GAME_NAME = 'Space YZ';
export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 7777;
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

export * from './math/vec3';
export * from './math/quat';
export * from './math/rng';
export * from './rating';

export * from './config';
export * from './level/types';
export * from './level/level';
export * from './level/collision';
export * from './level/builder';
export * from './level/maps/test-ship';

export * from './sim/input';
export * from './sim/state';
export * from './sim/combat-state';
export * from './sim/events';
export * from './sim/context';
export * from './sim/gravity';
export * from './sim/movement';
export * from './sim/world';
export * from './sim/hash';
