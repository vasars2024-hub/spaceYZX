// How other players (and their Boomerangs and grenades) are drawn between snapshots. The
// client draws them with these functions and the server's lag compensation rewinds them with
// the very same ones, from the same network-rounded data — so a shot is judged against
// exactly what the shooter had on screen.
import type { Vec3 } from '../math/vec3';
import { v3, lerp, sub, len, normalize } from '../math/vec3';
import { qSlerp } from '../math/quat';
import type { GameConfig } from '../config';
import type { PlayerState } from '../sim/state';
import type { BoomerangState } from '../sim/combat-state';
import type { Hitbox } from '../sim/hitbox';
import { hitboxOf } from '../sim/hitbox';
import { createPlayer, newBoomerang } from '../sim/world';
import type { NetBoomerang, NetPlayer } from './protocol';

/** Beyond this jump between two snapshots a player is drawn at the newer spot (a teleport). */
const PLAYER_TELEPORT_M = 6;
/** ...and a Boomerang (a throw, catch or recall). */
const OBJECT_JUMP_M = 8;

/** A player's public state between two snapshots (t = 0..1). */
export const interpNetPlayer = (
  pa: NetPlayer,
  pb: NetPlayer,
  t: number,
): { np: NetPlayer; pos: Vec3; up: Vec3 } => {
  const teleport = len(sub(pa.pos, pb.pos)) > PLAYER_TELEPORT_M;
  const pos = teleport ? pb.pos : lerp(pa.pos, pb.pos, t);
  const up = normalize(lerp(pa.up, pb.up, t), pb.up);
  const np = { ...(t < 0.5 ? pa : pb), view: qSlerp(pa.view, pb.view, t) };
  return { np, pos, up };
};

/** A Boomerang's / grenade's position between two snapshots. */
export const interpObjectPos = (a: Vec3, b: Vec3, t: number): Vec3 =>
  len(sub(a, b)) > OBJECT_JUMP_M ? b : lerp(a, b, t);

/** The hitbox of a player drawn from public state at `pos` / `up`. */
export const netHitbox = (
  id: number,
  np: NetPlayer,
  pos: Vec3,
  up: Vec3,
  config: GameConfig,
): Hitbox => {
  // hitboxOf only reads these fields (cheap: the server does this for every rewind)
  const p = { id, team: np.team, pos, up, crouched: np.crouched, move: np.move };
  return hitboxOf(p as unknown as PlayerState, config);
};

export const netToPlayer = (id: number, np: NetPlayer, config: GameConfig): PlayerState => {
  const p = createPlayer(id, np.team as 0 | 1, v3(), 0, config);
  Object.assign(p, {
    alive: np.alive,
    hp: np.hp,
    pos: np.pos,
    vel: np.vel,
    up: np.up,
    view: np.view,
    move: np.move,
    crouched: np.crouched,
    grounded: np.grounded,
    windup: np.windup,
    windupHeld: np.windupHeld,
    aiming: np.aiming,
    laserWarn: np.laserWarn,
    laserCharges: np.laserCharges,
    weapon: np.weapon as 0 | 1,
    slashTicks: np.slashTicks,
    mag: np.magOn ? v3(0, 1, 0) : null,
    grenadesLeft: np.grenadesLeft,
    kills: np.kills,
    deaths: np.deaths,
    teamKills: np.teamKills,
    frozen: np.frozen,
    dashTicks: np.dashTicks,
    powerup: np.powerup,
    stun: np.stun,
    shield: np.shield,
  });
  return p;
};

export const netToBoomerang = (owner: number, nb: NetBoomerang): BoomerangState => {
  const b = newBoomerang(owner, nb.pos);
  Object.assign(b, {
    phase: nb.phase,
    controller: nb.controller,
    pos: nb.pos,
    vel: nb.vel,
    windup: nb.windup,
    recallLethal: nb.recallLethal,
    bounced: false, // not sent: only the thrower's own flight uses it (exact private state)
    recallFrom: nb.phase >= 4 ? nb.recallFrom : null,
    recallTo: nb.phase >= 4 ? nb.recallTo : null,
    steerLeft: nb.steerLeft,
    throwId: nb.throwId,
    t: nb.t,
    curve: nb.curve / 32 - 1,
    explosive: nb.explosive,
  });
  return b;
};
