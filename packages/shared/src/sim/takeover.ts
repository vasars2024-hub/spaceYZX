// Taking over a bot teammate after you die (Counter-Strike style): the dead human steps into
// the bot's body and the bot is left with the human's dead one. Deterministic: the server and
// offline practice apply it the same way, between ticks.
import type { PlayerState, WorldState } from './state';
import type { BoomerangState } from './combat-state';

/**
 * Fields that belong to the person, not the body: identity and match stats. `prevButtons` too:
 * it holds what the human's keys did last tick, so keys still held from spectating (the E
 * that asked for the takeover) aren't read as fresh presses by the new body.
 */
const PERSON_KEYS = new Set<keyof PlayerState>([
  'id',
  'team',
  'kills',
  'deaths',
  'teamKills',
  'damageDealt',
  'prevButtons',
]);

/** Boomerang fields that stay put: whose Boomerang it is. */
const BOOMERANG_KEEP = new Set<keyof BoomerangState>(['id', 'owner']);

const swapFields = <T extends object>(a: T, b: T, keep: Set<keyof T>): void => {
  for (const k of Object.keys(a) as (keyof T)[]) {
    if (keep.has(k)) continue;
    const t = a[k];
    a[k] = b[k];
    b[k] = t;
  }
};

/** Can this (dead) human take over that bot right now? Rules may add their own conditions. */
export const canTakeOver = (world: WorldState, humanId: number, botId: number): boolean => {
  if (humanId === botId) return false;
  const h = world.players.find((p) => p.id === humanId);
  const b = world.players.find((p) => p.id === botId);
  return !!h && !!b && !h.alive && b.alive && h.team === b.team;
};

/**
 * Swap bodies: the human gets the bot's player state and Boomerang (position, health, kit,
 * timers…), the bot gets the human's dead state. Kills/deaths stay with each id. Returns
 * false (and changes nothing) if the takeover isn't allowed.
 */
export const takeOverBot = (world: WorldState, humanId: number, botId: number): boolean => {
  if (!canTakeOver(world, humanId, botId)) return false;
  const h = world.players.find((p) => p.id === humanId)!;
  const b = world.players.find((p) => p.id === botId)!;
  swapFields(h, b, PERSON_KEYS);
  const hb = world.boomerangs.find((x) => x.owner === humanId);
  const bb = world.boomerangs.find((x) => x.owner === botId);
  if (hb && bb) swapFields(hb, bb, BOOMERANG_KEEP);
  // whatever the bot threw or deflected is the human's to steer and score with now. (What the
  // human threw before dying stays theirs: credit, and it can't hit its own thrower.)
  for (const x of world.boomerangs) if (x.controller === botId) x.controller = humanId;
  world.events.push({ type: 'takeover', player: humanId, bot: botId });
  return true;
};
