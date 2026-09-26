// Race tracks (LevelDef.race): what happens to a racer's body every tick, on the server and in
// the client's prediction alike — so falls, gates, fuel cells and the respawn key feel instant
// online. The race itself (countdown, positions, finish times, DNF) is rules/race.ts.
//
//   gates      checkpoints in order, then the finish: passing through the next one counts
//              (raceCp: -1 = not racing, 0..N checkpoints passed, N + 1 = finished)
//   falls      below killY, inside a kill volume or far out of bounds: back to your last
//              checkpoint, frozen there for racePenaltySec (no penalty outside a race)
//   respawn    hold the respawn key (R) for raceRespawnHoldSec: the same as a fall
//   fuel       each fuel cell refills your jetpack once per race (only when it isn't full)
// SURGE (the dash key) and the race jetpack tank live in sim/movement.ts.
import type { Vec3 } from '../math/vec3';
import { v3, madd, distSq, UP } from '../math/vec3';
import { qFromYawPitch } from '../math/quat';
import { pointInAabb } from '../level/level';
import type { RaceDef, RaceGateDef } from '../level/types';
import type { MovementConfig } from '../config/movement';
import type { SimContext } from './context';
import type { PlayerInput } from './input';
import { Btn } from './input';
import type { PlayerState, WorldState } from './state';
import { Move } from './state';

const DEG = Math.PI / 180;

/** The gates in the order they must be passed: every checkpoint, then the finish. */
export const raceGates = (race: RaceDef): RaceGateDef[] => [...race.checkpoints, race.finish];

/** Racing right now (between the start and the finish). */
export const isRacing = (race: RaceDef, p: Pick<PlayerState, 'raceCp'>): boolean =>
  p.raceCp >= 0 && p.raceCp <= race.checkpoints.length;

export const hasFinished = (race: RaceDef, p: Pick<PlayerState, 'raceCp'>): boolean =>
  p.raceCp > race.checkpoints.length;

/** Where a racer with `cp` gates passed comes back: the start, a checkpoint or the finish. */
export const raceRespawnPoint = (race: RaceDef, cp: number): { respawn: Vec3; yawDeg: number } => {
  if (cp <= 0) return race.start;
  if (cp > race.checkpoints.length) return race.finish;
  return race.checkpoints[cp - 1];
};

/** The next gate a racer must pass (null: not racing or finished). */
export const nextGate = (race: RaceDef, p: Pick<PlayerState, 'raceCp'>): RaceGateDef | null =>
  isRacing(race, p) ? raceGates(race)[p.raceCp] : null;

export const gateCenter = (g: Pick<RaceGateDef, 'min' | 'max'>): Vec3 =>
  v3((g.min.x + g.max.x) / 2, (g.min.y + g.max.y) / 2, (g.min.z + g.max.z) / 2);

/**
 * Put a racer at `feet`, standing still and facing `yawDeg`, with a full race tank (a fresh
 * start or a checkpoint respawn). Race progress, surges and fuel cells are left alone.
 */
export const placeRacer = (p: PlayerState, m: MovementConfig, feet: Vec3, yawDeg: number): void => {
  p.pos = madd(feet, UP, m.standHeight / 2 + 0.01);
  p.vel = v3();
  p.up = v3(0, 1, 0);
  p.view = qFromYawPitch(yawDeg * DEG, 0, UP, v3(0, 0, -1));
  p.move = Move.Air;
  p.crouched = false;
  p.grounded = false;
  p.groundNormal = v3(0, 1, 0);
  p.gravity = v3(0, -m.gravity, 0);
  p.coyote = 0;
  p.jumpBuffer = 0;
  p.landGrace = 0;
  p.airTicks = 0;
  p.tapWindow = 0;
  p.railCd = 0;
  p.magT = 0;
  p.magCd = 0;
  p.mag = null;
  p.mantle = null;
  p.rail = null;
  p.lastWallNormal = null;
  p.wallJumpsLeft = m.wallJumpsPerAir;
  p.tapStrafesLeft = m.tapStrafesPerAir;
  p.jetFuel = m.raceJetpackFuelSec;
  p.jetCd = 0;
  p.jetOn = false;
  p.jetHold = -1;
  p.dashTicks = 0;
  p.surgeTicks = 0;
};

/**
 * Back to the last checkpoint (the start, before checkpoint 1): while racing you stand frozen
 * there for the penalty; in the lobby or after the finish it's instant.
 */
export const sendRacerBack = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  reason: 'fall' | 'key',
): void => {
  const race = ctx.level.def.race;
  if (!race) return;
  const m = ctx.config.movement;
  const racing = isRacing(race, p);
  const at = raceRespawnPoint(race, p.raceCp);
  placeRacer(p, m, at.respawn, at.yawDeg);
  p.racePenalty = racing ? Math.max(1, Math.round(m.racePenaltySec / ctx.dt)) : 0;
  if (racing) p.frozen = true;
  world.events.push({
    type: 'raceRespawn',
    player: p.id,
    cp: Math.max(0, p.raceCp),
    reason,
    penalty: racing,
  });
};

/** Before movement: the respawn key (hold it; after one respawn, let go before the next). */
export const updateRaceInput = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  input: PlayerInput,
): void => {
  if (!ctx.level.def.race) return;
  const held = (input.buttons & Btn.Recall) !== 0;
  if (!held) {
    p.raceHold = 0;
    return;
  }
  if (p.frozen || p.racePenalty > 0 || p.raceHold < 0) return;
  const need = Math.max(1, Math.round(ctx.config.movement.raceRespawnHoldSec / ctx.dt));
  if (++p.raceHold >= need) {
    p.raceHold = -1;
    sendRacerBack(world, ctx, p, 'key');
  }
};

/** After movement and devices: the penalty clock, falls, gates and fuel cells. */
export const updateRaceBody = (world: WorldState, ctx: SimContext, p: PlayerState): void => {
  const race = ctx.level.def.race;
  if (!race) return;
  if (p.racePenalty > 0) {
    if (--p.racePenalty === 0) p.frozen = false;
    return;
  }
  const def = ctx.level.def;
  const pos = p.pos;
  const fell =
    pos.y < race.killY ||
    !pointInAabb(
      pos,
      madd(def.boundsMin, v3(1, 1, 1), -20),
      madd(def.boundsMax, v3(1, 1, 1), 20),
    ) ||
    (race.killVolumes ?? []).some((k) => pointInAabb(pos, k.min, k.max));
  if (fell) {
    sendRacerBack(world, ctx, p, 'fall');
    return;
  }
  if (p.frozen) return;
  const n = race.checkpoints.length;
  if (p.raceCp >= 0 && p.raceCp <= n) {
    const g = p.raceCp < n ? race.checkpoints[p.raceCp] : race.finish;
    if (pointInAabb(pos, g.min, g.max)) {
      p.raceCp++;
      world.events.push({ type: 'raceCp', player: p.id, cp: p.raceCp, finish: p.raceCp > n });
    }
  }
  const cells = race.fuelCells;
  const tank = ctx.config.movement.raceJetpackFuelSec;
  if (cells && p.jetFuel < tank - 0.01) {
    const r = ctx.config.movement.raceFuelCellRadius;
    for (let i = 0; i < cells.length && i < 31; i++) {
      if (p.raceFuel & (1 << i) || distSq(pos, cells[i]) > r * r) continue;
      p.raceFuel |= 1 << i;
      p.jetFuel = tank;
      p.jetCd = 0;
      world.events.push({ type: 'raceFuel', player: p.id, cell: i });
      break;
    }
  }
};

/** A fresh race for this racer: start line, all surges, no fuel cells used (rules/race.ts). */
export const resetRacer = (
  p: PlayerState,
  m: MovementConfig,
  feet: Vec3,
  yawDeg: number,
  cp: number,
): void => {
  placeRacer(p, m, feet, yawDeg);
  p.raceCp = cp;
  p.racePenalty = 0;
  p.raceFuel = 0;
  p.raceHold = 0;
  p.surgeLeft = m.raceSurgeCharges;
  p.frozen = false;
  p.alive = true;
  p.hp = Math.max(p.hp, 1);
  p.stun = 0;
  p.speedCap = 0;
};
