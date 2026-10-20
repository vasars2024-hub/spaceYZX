// Bots and the teleport slash (sim/melee.ts): now and then, when an enemy is close, a bot holds
// E to charge it (it keeps looking at the target, so the dash goes at them) and lets go once
// it's charged and the target is within dash reach. Better bots try it more often (the same
// "melee skill" as their deflects); the easiest bots never do.
import type { Vec3 } from '../math/vec3';
import { sub, len } from '../math/vec3';
import type { RngState } from '../math/rng';
import { rngFloat } from '../math/rng';
import type { SimContext } from '../sim/context';
import { Btn } from '../sim/input';
import type { PlayerState } from '../sim/state';
import type { BoomerangState } from '../sim/combat-state';
import { Phase } from '../sim/combat-state';
import { loadoutOf } from '../config/loadout';

/** Per-tick chance to start charging, as a share of the bot's deflect chance. */
const START_SHARE = 0.3;
/** Start charging when the target is this close (m): it closes in while the charge fills. */
const START_RANGE = 7;
/** ... but not when they are already in plain slash reach. */
const MIN_RANGE = 1.2;

export interface BotTeleportMemory {
  /** ticks the bot has been charging (0 = not) */
  teleport?: number;
}

/**
 * The bot's buttons with the teleport slash folded in. `target` = the enemy it is fighting
 * (seen, engaged), or null. Returns the buttons unchanged when the match has no teleport slash.
 */
export const teleportSlashButtons = (
  ctx: SimContext,
  self: PlayerState,
  mem: BotTeleportMemory,
  deflectChance: number,
  rng: RngState,
  buttons: number,
  myB: BoomerangState | undefined,
  target: { pos: Vec3 } | null,
): number => {
  const c = ctx.config.combat;
  if (!loadoutOf(ctx.config).teleportSlash) return buttons;
  const held = myB?.phase === Phase.Held;
  const dist = target ? len(sub(target.pos, self.pos)) : Infinity;
  const charging = mem.teleport ?? 0;
  if (charging > 0) {
    const full = Math.round(c.teleportChargeSec / ctx.dt);
    // the charge faded or broke off (the sim reset it): stop holding
    if (!held || (charging > 2 && self.meleeCharge === 0)) {
      mem.teleport = 0;
      return buttons & ~Btn.Melee;
    }
    mem.teleport = charging + 1;
    const ready = self.meleeCharge >= full;
    // let go (= fire) once charged with the target in reach; otherwise keep holding (it fades)
    if (ready && target && dist <= c.teleportDistance + 0.4) {
      mem.teleport = 0;
      return buttons & ~(Btn.Melee | Btn.Fire | Btn.Alt);
    }
    // close in on them while it charges (the bot looks at its target, so Forward = toward them)
    const move = target ? Btn.Forward : 0;
    const off = Btn.Fire | Btn.Alt | (target ? Btn.Back | Btn.Left | Btn.Right : 0);
    return (buttons | Btn.Melee | move) & ~off;
  }
  if (
    held &&
    target &&
    self.teleportCd === 0 &&
    self.windup === 0 &&
    !(self.prevButtons & Btn.Melee) &&
    !(buttons & (Btn.Fire | Btn.Alt)) &&
    dist > MIN_RANGE &&
    dist < START_RANGE &&
    rngFloat(rng) < deflectChance * START_SHARE
  ) {
    mem.teleport = 1;
    return buttons | Btn.Melee;
  }
  return buttons;
};
