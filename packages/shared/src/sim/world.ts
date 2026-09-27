// World creation and the fixed-tick step function shared by client and server.
import type { Vec3 } from '../math/vec3';
import { v3, madd, clone, UP } from '../math/vec3';
import { qFromYawPitch } from '../math/quat';
import { rngFromSeed } from '../math/rng';
import { pointInAabb } from '../level/level';
import { inSkyZone } from '../level/sky-arena';
import type { Level } from '../level/level';
import type { GameConfig } from '../config';
import type { SimContext } from './context';
import type { PlayerInput } from './input';
import type { PlayerState, WorldState } from './state';
import { Move } from './state';
import { Phase } from './combat-state';
import type { BoomerangState } from './combat-state';
import { updateMovement } from './movement';
import { updateGravityPads } from './gravity';
import { updateDevices } from './devices';
import { applyDamage, updateCombat } from './combat';
import { updatePowerupPickups } from './powerups';
import { updateRaceBody, updateRaceInput } from './race';

export const DEG = Math.PI / 180;

/** Yaw (degrees, 0 = facing -Z, 90 = facing -X) to a view quaternion in normal gravity. */
export const yawToView = (yawDeg: number, pitchDeg = 0) =>
  qFromYawPitch(yawDeg * DEG, pitchDeg * DEG, UP, v3(0, 0, -1));

export const createWorld = (level: Level, seed = 1): WorldState => ({
  tick: 0,
  rng: rngFromSeed(seed),
  players: [],
  boomerangs: [],
  grenades: [],
  twins: [],
  powerups: [],
  zones: level.zones.map(() => ({ override: null, until: 0 })),
  padReadyAt: level.def.pads.map(() => 0),
  events: [],
  nextId: 1,
});

export const newBoomerang = (owner: number, pos: Vec3): BoomerangState => ({
  id: owner,
  owner,
  controller: owner,
  phase: Phase.Held,
  pos: clone(pos),
  vel: v3(),
  t: 0,
  outTicks: 0,
  curve: 0,
  curveAxis: v3(0, 1, 0),
  tiltRef: v3(0, 0, -1),
  windup: false,
  steerLeft: 0,
  hitIds: [],
  throwId: 0,
  recallFrom: null,
  recallTo: null,
  recallLethal: false,
  explosive: false,
  stuck: null,
  bounced: false,
});

/** A fresh player standing with feet at `feet`, facing yawDeg. */
export const createPlayer = (
  id: number,
  team: 0 | 1,
  feet: Vec3,
  yawDeg: number,
  config: GameConfig,
): PlayerState => {
  const m = config.movement;
  const c = config.combat;
  return {
    id,
    team,
    alive: true,
    hp: c.maxHp,
    pos: madd(feet, UP, m.standHeight / 2 + 0.01),
    vel: v3(),
    up: v3(0, 1, 0),
    view: yawToView(yawDeg),
    move: Move.Air,
    crouched: false,
    grounded: false,
    groundNormal: v3(0, 1, 0),
    gravity: v3(0, -m.gravity, 0),
    coyote: 0,
    jumpBuffer: 0,
    landGrace: 0,
    slideBoostCd: 0,
    airTicks: 0,
    tapWindow: 0,
    climbLeft: 0,
    railCd: 0,
    thrusterRecharge: 0,
    magT: 0,
    magCd: 0,
    jetFuel: m.jetpackFuelSec,
    jetCd: 0,
    jetOn: false,
    jetHold: -1,
    dashCd: 0,
    dashTicks: 0,
    wallJumpsLeft: m.wallJumpsPerAir,
    tapStrafesLeft: m.tapStrafesPerAir,
    thrusterCharges: m.thrusterCharges,
    lastWallNormal: null,
    mantle: null,
    rail: null,
    mag: null,
    prevButtons: 0,
    frozen: false,
    speedCap: 0,
    aiming: false,
    aimTicks: 0,
    blastCount: 0,
    flick: 0,
    windup: 0,
    windupHeld: 0,
    weapon: 0,
    laserCharges: c.laserCharges,
    laserReserve: c.laserReserve,
    laserReload: 0,
    laserCd: 0,
    laserWarn: 0,
    slashCd: 0,
    slashTicks: 0,
    slashHit: false,
    grenadesLeft: c.grenadesPerRound,
    akMag: c.akMag,
    akReserve: c.akReserve,
    deagleMag: c.deagleMag,
    deagleReserve: c.deagleReserve,
    gunCd: 0,
    gunReload: 0,
    gunSpray: 0,
    gunPenalty: c.akStandMrad,
    gunLastShot: -1000,
    gunShots: 0,
    powerup: 0,
    powerupCharges: 0,
    stun: 0,
    shield: false,
    padFlight: false,
    lastHurtTick: -1000,
    lastAttacker: -1,
    kills: 0,
    deaths: 0,
    teamKills: 0,
    damageDealt: 0,
    surgeLeft: m.raceSurgeCharges,
    surgeTicks: 0,
    raceCp: -1,
    racePenalty: 0,
    raceFuel: 0,
    raceHold: 0,
  };
};

/** Add a player (and their Boomerang) to the world. */
export const addPlayer = (world: WorldState, player: PlayerState): PlayerState => {
  world.players.push(player);
  world.boomerangs.push(newBoomerang(player.id, player.pos));
  return player;
};

export const removePlayer = (world: WorldState, id: number): void => {
  world.players = world.players.filter((p) => p.id !== id);
  world.boomerangs = world.boomerangs.filter((b) => b.owner !== id);
  world.twins = world.twins.filter((b) => b.owner !== id);
  for (const b of world.boomerangs) if (b.controller === id) b.controller = b.owner;
};

/** Reset a player to a spawn point with full health and kit. */
export const respawnPlayer = (
  world: WorldState,
  p: PlayerState,
  feet: Vec3,
  yawDeg: number,
  config: GameConfig,
): void => {
  const fresh = createPlayer(p.id, p.team, feet, yawDeg, config);
  const keep = {
    kills: p.kills,
    deaths: p.deaths,
    teamKills: p.teamKills,
    damageDealt: p.damageDealt,
  };
  Object.assign(p, fresh, keep);
  const b = world.boomerangs.find((bb) => bb.owner === p.id);
  if (b) Object.assign(b, newBoomerang(p.id, p.pos));
};

export const playerById = (world: WorldState, id: number): PlayerState | undefined =>
  world.players.find((p) => p.id === id);

/**
 * Damage for landing at `impact` m/s (speed into the ground): none from `fallSafeHeight` or
 * lower, then growing linearly with the impact speed to a certain kill at `fallLethalHeight`.
 */
export const fallDamage = (impact: number, ctx: SimContext): number => {
  const g = ctx.config.movement.gravity;
  const c = ctx.config.combat;
  const safe = Math.sqrt(2 * g * c.fallSafeHeight);
  const lethal = Math.sqrt(2 * g * c.fallLethalHeight);
  if (!(impact > safe)) return 0;
  if (impact >= lethal) return 9999;
  return Math.round((c.maxHp * (impact - safe)) / (lethal - safe));
};

/**
 * Advance the world by one tick. `inputs` maps player id -> input for this tick; missing
 * inputs mean "no buttons, same view".
 */
export const step = (
  world: WorldState,
  inputs: Record<number, PlayerInput>,
  ctx: SimContext,
): void => {
  world.events = [];
  world.tick++;
  updateGravityPads(ctx, world);
  const prevButtons: Record<number, number> = {};
  for (const p of world.players) prevButtons[p.id] = p.prevButtons;
  for (const p of world.players) {
    const input = inputs[p.id] ?? { tick: world.tick, buttons: 0, view: p.view };
    if (!p.alive) {
      p.prevButtons = input.buttons;
      p.view = input.view;
      continue;
    }
    // race tracks: the respawn key, then (after moving) falls, gates and fuel cells
    const race = !!ctx.level.def.race;
    const eventsBefore = world.events.length;
    if (race) updateRaceInput(world, ctx, p, input);
    updateMovement(world, ctx, p, input);
    updateDevices(world, ctx, p);
    if (race) updateRaceBody(world, ctx, p);
    // a hard landing hurts (races have no damage; a launch pad's landing never does)
    const tickEvents = world.events.slice(eventsBefore);
    const landed = tickEvents.find((e) => e.type === 'land' && e.player === p.id);
    if (landed && landed.type === 'land') {
      const dmg = race || p.padFlight ? 0 : fallDamage(landed.speed, ctx);
      // the pad flight is over, unless a pad threw you again this same tick
      if (!tickEvents.some((e) => e.type === 'launch' && e.player === p.id)) p.padFlight = false;
      if (dmg > 0)
        applyDamage(world, ctx, p.id, p, dmg, 'world', false, clone(p.pos), clone(p.pos));
    }
    if (!p.alive) continue;
    // fell into a deadly volume (a gorge): gone, like falling off the sky duel arena
    const kills = ctx.level.def.killVolumes;
    if (kills)
      for (const k of kills)
        if (pointInAabb(p.pos, k.min, k.max)) {
          applyDamage(world, ctx, p.id, p, 9999, 'world', false, clone(p.pos), clone(p.pos));
          break;
        }
    if (!p.alive) continue;
    // left the map (e.g. walked off the outside of the hull with gravity boots): dead (races
    // handle their own falls; at the sky duel arena the match rules end you)
    const d = ctx.level.def;
    if (
      !race &&
      !pointInAabb(
        p.pos,
        madd(d.boundsMin, v3(1, 1, 1), -20),
        madd(d.boundsMax, v3(1, 1, 1), 20),
      ) &&
      !inSkyZone(d, p.pos)
    )
      applyDamage(world, ctx, p.id, p, 9999, 'world', false, clone(p.pos), clone(p.pos));
  }
  // races: no weapons, no damage, no power-ups
  if (ctx.level.def.race) return;
  updateCombat(world, ctx, inputs, prevButtons);
  updatePowerupPickups(world, ctx);
};

/**
 * Client-side prediction step: advances only the local player (movement + their own
 * Boomerang/grenades). Other entities stay as the server last described them.
 */
export const stepPredict = (
  world: WorldState,
  localId: number,
  input: PlayerInput,
  ctx: SimContext,
): void => {
  world.events = [];
  world.tick = input.tick;
  const p = world.players.find((pp) => pp.id === localId);
  if (!p) return;
  const prev = { [localId]: p.prevButtons };
  const race = !!ctx.level.def.race;
  if (p.alive) {
    if (race) updateRaceInput(world, ctx, p, input);
    updateMovement(world, ctx, p, input);
    updateDevices(world, ctx, p);
    if (race) updateRaceBody(world, ctx, p);
  } else {
    p.prevButtons = input.buttons;
    p.view = input.view;
  }
  if (race) return;
  updateCombat(world, { ...ctx, noDamage: true }, { [localId]: input }, prev, { only: localId });
  updatePowerupPickups(world, ctx, localId);
};
