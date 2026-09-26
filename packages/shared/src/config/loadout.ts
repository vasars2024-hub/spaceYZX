// Match loadouts: what kit players get. 'lethal' is the normal game (Boomerang, Laser, Gravity
// Grenade); 'cs' is the Counter-Strike style mode (AK-47 + Desert Eagle + knife slash, bomb
// rules, everything moving at half speed).
//
// The sim reads the loadout from the config (`combat.loadout`), so the client's prediction and
// the server always agree: a CS room/session simply runs with `csConfig(base)`.
import type { GameConfig } from './index';

export type LoadoutName = 'lethal' | 'cs';
export const LOADOUT_NAMES: readonly LoadoutName[] = ['lethal', 'cs'];

export interface LoadoutDef {
  boomerang: boolean; // throws, wind-ups, recalls (the Boomerang stays in hand for the slash)
  laser: boolean;
  grenade: boolean;
  guns: boolean; // key 1 = AK-47, key 2 = Desert Eagle, R = reload
  /** power-ups in the middle of the map (Freeze, Double boomerang: rules/powerups.ts) */
  powerups: boolean;
  /** client: players are drawn dim (no glowing rim), hard to spot like in CS */
  dimPlayers: boolean;
}

export const LOADOUTS: Record<LoadoutName, LoadoutDef> = {
  lethal: {
    boomerang: true,
    laser: true,
    grenade: true,
    guns: false,
    powerups: true,
    dimPlayers: false,
  },
  cs: {
    boomerang: false,
    laser: false,
    grenade: false,
    guns: true,
    powerups: false,
    dimPlayers: true,
  },
};

/** `combat.loadout` values. */
export const LOADOUT_ID: Record<LoadoutName, number> = { lethal: 0, cs: 1 };

/** A loadout name from untrusted input (menus, network), default 'lethal'. */
export const loadoutName = (v: unknown): LoadoutName => (v === 'cs' ? 'cs' : 'lethal');

/** The loadout a config runs with. */
export const configLoadout = (config: GameConfig): LoadoutName =>
  config.combat.loadout === LOADOUT_ID.cs ? 'cs' : 'lethal';

export const loadoutOf = (config: GameConfig): LoadoutDef => LOADOUTS[configLoadout(config)];

/** CS mode: movement runs at this fraction of normal speed. */
export const CS_MOVE_SCALE = 0.7; // was 0.5 (half speed); +40 % after a playtest

/**
 * Movement numbers CS mode scales by CS_MOVE_SCALE: every horizontal speed (and the speed
 * thresholds that go with them, so slides/tap-strafes still trigger at the same relative pace).
 * Deliberately NOT scaled: gravity, jump height, wall-jump/rail-jump up kick, the jetpack's
 * lift and rise speed, climbing, gravity-shift pull and the total speed cap (it also limits
 * falling) — so jumps, mantles and the jetpack still reach the same ledges; only the pace
 * across the map (and the length of jumps) halves. Accelerations here are Quake-style
 * multipliers of the wish speed, so they scale with it by themselves.
 */
export const CS_SCALED_MOVEMENT: readonly (keyof GameConfig['movement'])[] = [
  'sprintSpeed',
  'runSpeed',
  'crouchSpeed',
  'stopSpeed',
  'airSoftCap',
  'tapStrafeMinSpeed',
  'slideStartSpeed',
  'slideEndSpeed',
  'slideBoost',
  'slideBoostMaxSpeed',
  'slideDecel',
  'slideSteerCap',
  'slideMaxSpeed',
  'vaultMinExitSpeed',
  'wallJumpOut',
  'railSpeed',
  'pushOffSpeed',
  'thrusterImpulse',
  'maxFloatSpeed',
  'floatDriftAccel',
  'jetpackDirSpeed',
  'dashSpeed',
];

/** A copy of `base` set up for CS mode (idempotent: a CS config comes back unchanged). */
export const csConfig = (base: GameConfig): GameConfig => {
  const out: GameConfig = {
    movement: { ...base.movement },
    combat: { ...base.combat },
    rules: { ...base.rules },
  };
  if (base.combat.loadout === LOADOUT_ID.cs) return out;
  for (const k of CS_SCALED_MOVEMENT) out.movement[k] = base.movement[k] * CS_MOVE_SCALE;
  out.combat.windupWalkSpeed = base.combat.windupWalkSpeed * CS_MOVE_SCALE;
  out.combat.loadout = LOADOUT_ID.cs;
  return out;
};

/** The config a match with this loadout runs with. */
export const configForLoadout = (base: GameConfig, loadout: LoadoutName): GameConfig =>
  loadout === 'cs' ? csConfig(base) : base;
