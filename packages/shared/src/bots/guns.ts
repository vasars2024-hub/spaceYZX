// Bot gunplay for CS mode (AK-47 + Desert Eagle): aim with recoil control, stop (counter-strafe)
// before shooting, tap / burst at range and spray up close, reload, switch to the Deagle when the
// AK is dry. Difficulty scales aim error, head shots, how reliably they stop and how well they
// pull against the spray pattern. Deterministic: randomness comes from the bot's own rng.
import type { Vec3 } from '../math/vec3';
import { add, sub, scale, len, madd, normalize, projectOnPlane, cross, v3 } from '../math/vec3';
import type { RngState } from '../math/rng';
import { rngFloat } from '../math/rng';
import type { SimContext } from '../sim/context';
import { Btn } from '../sim/input';
import type { PlayerState } from '../sim/state';
import { currentGun, gunAmmo, gunDef, patternAt } from '../sim/guns';

const DEG = Math.PI / 180;
const MOVE_KEYS = Btn.Forward | Btn.Back | Btn.Left | Btn.Right;

export interface BotGunSkill {
  aimDeg: number; // aim error (like aimErrorDeg, for hitscan guns)
  headChance: number; // share of engagements aimed at the head
  counterStrafe: number; // chance to stop before a burst (0 = shoots on the run)
  sprayControl: number; // 0..1: how much of the spray pattern it pulls against
  burst: number; // shots per burst at mid range (up close it sprays)
}

/** Gun skill per bot difficulty (see BOT_SKILLS for the rest). */
export const BOT_GUN_SKILLS: Record<string, BotGunSkill> = {
  rookie: { aimDeg: 4.5, headChance: 0.05, counterStrafe: 0, sprayControl: 0, burst: 6 },
  casual: { aimDeg: 3.2, headChance: 0.1, counterStrafe: 0.3, sprayControl: 0.2, burst: 5 },
  easy: { aimDeg: 2.2, headChance: 0.15, counterStrafe: 0.6, sprayControl: 0.45, burst: 4 },
  normal: { aimDeg: 1.3, headChance: 0.25, counterStrafe: 0.9, sprayControl: 0.7, burst: 3 },
  hard: { aimDeg: 0.7, headChance: 0.4, counterStrafe: 1, sprayControl: 0.9, burst: 3 },
};

export const botGunSkill = (name: string): BotGunSkill =>
  BOT_GUN_SKILLS[name] ?? BOT_GUN_SKILLS.normal;

/** Per-bot gun memory (kept on the BotMemory). */
export interface BotGunMemory {
  burst: number; // shots left in the current burst
  stop: boolean; // counter-strafing for this burst
  head: boolean; // aiming at the head this engagement
}

export const newBotGunMemory = (): BotGunMemory => ({ burst: 0, stop: false, head: false });

/** Close range: spray instead of bursting. */
const SPRAY_RANGE = 10;
/** Far: single taps. */
const TAP_RANGE = 28;

/**
 * Where to point the view: the target's head or chest plus the bot's aim error, pulled down /
 * sideways against the next shot's spray offset (as much as the bot's spray control allows).
 */
export const gunAimDir = (
  ctx: SimContext,
  self: PlayerState,
  eye: Vec3,
  aimAt: Vec3,
  targetVel: Vec3,
  aimErr: Vec3,
  skill: BotGunSkill,
  leadAccuracy: number,
): Vec3 => {
  const lead = madd(aimAt, targetVel, ctx.dt * 2 * leadAccuracy);
  const dir = normalize(sub(add(lead, aimErr), eye), v3(0, 0, -1));
  if (self.gunSpray <= 0 || skill.sprayControl <= 0) return dir;
  const [pp, py] = patternAt(gunDef(ctx.config.combat, currentGun(self)).pattern, self.gunSpray);
  const right = normalize(cross(dir, self.up), v3(1, 0, 0));
  const upv = cross(right, dir);
  const k = skill.sprayControl;
  return normalize(
    add(dir, add(scale(right, Math.tan(-py * k * DEG)), scale(upv, Math.tan(-pp * k * DEG)))),
    dir,
  );
};

/**
 * Gun buttons for this tick (`buttons` already holds the bot's movement). `fighting` = an
 * engaged, visible target at `dist`; `aimErrRad` = how far the view is from where it wants to aim.
 */
export const gunBotButtons = (
  ctx: SimContext,
  self: PlayerState,
  gm: BotGunMemory,
  skill: BotGunSkill,
  rng: RngState,
  buttons: number,
  fighting: boolean,
  dist: number,
  aimErrRad: number,
  moveKeysFor: (dir: Vec3) => number,
): number => {
  const c = ctx.config.combat;
  const gun = currentGun(self);
  const g = gunDef(c, gun);
  const ammo = gunAmmo(self, gun);
  const other = gunAmmo(self, gun === 'ak' ? 'deagle' : 'ak');
  let b = buttons & ~(Btn.Fire | Btn.Alt | Btn.Grenade | Btn.Recall | Btn.Melee);
  const swap = gun === 'ak' ? Btn.Slot2 : Btn.Slot1;
  // dry: switch guns (a reload would take longer than the draw)
  if (self.gunReload === 0 && ammo.mag === 0 && (ammo.reserve === 0 || fighting)) {
    if (other.mag > 0) return b | swap;
  }
  if (!fighting) {
    gm.burst = 0;
    // between fights: back to the AK, and top the magazine up
    if (gun === 'deagle' && self.akMag + self.akReserve > 0) return b | Btn.Slot1;
    if (self.gunReload === 0 && ammo.mag < g.mag * 0.6 && ammo.reserve > 0) b |= Btn.Recall;
    return b;
  }
  if (self.gunReload > 0) return b; // keep moving while reloading
  if (ammo.mag === 0) return ammo.reserve > 0 ? b | Btn.Recall : b;

  // start a burst once the spray has settled (up close: right away)
  const settled = dist < SPRAY_RANGE ? true : self.gunSpray < (dist > TAP_RANGE ? 0.3 : 0.8);
  if (gm.burst <= 0 && settled) {
    gm.burst = !g.auto
      ? 1
      : dist < SPRAY_RANGE
        ? 10
        : dist > TAP_RANGE
          ? 1
          : Math.max(1, skill.burst);
    gm.stop = rngFloat(rng) < skill.counterStrafe;
  }
  if (gm.burst <= 0) return b;

  // counter-strafe: tap the opposite keys until (almost) stopped, then stand still
  const max = ctx.config.movement.sprintSpeed;
  const planar = projectOnPlane(self.vel, self.up);
  const speed = len(planar);
  if (gm.stop && self.grounded) {
    b &= ~(MOVE_KEYS | Btn.Jump | Btn.Dash | Btn.Crouch);
    if (speed > max * 0.2) b |= moveKeysFor(scale(planar, -1));
  }
  const still = !gm.stop || speed <= max * c.gunAccurateSpeedFrac;
  // on target: within the target's size (a chest ~0.35 m) or a small floor
  const tol = Math.max(0.6 * DEG, Math.atan(0.35 / Math.max(1, dist)));
  const ready = self.gunCd <= 1 && (g.auto || !(self.prevButtons & Btn.Fire));
  if (still && aimErrRad < tol && ready) {
    b |= Btn.Fire;
    gm.burst--;
  } else if (g.auto && self.prevButtons & Btn.Fire && self.gunCd > 1 && still && aimErrRad < tol)
    b |= Btn.Fire; // keep the trigger down between AK rounds
  return b;
};
