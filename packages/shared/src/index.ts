// Public entry of @space-yz/shared.
export const GAME_NAME = 'Space YZ';
export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 7777;
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

export * from './math/vec3';
export * from './math/quat';
export * from './math/rng';
export * from './net/codec';
