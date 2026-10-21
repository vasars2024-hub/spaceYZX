// Melee remodel: the normal slash (same damage, longer reach) and the teleport slash (hold E
// for 1 s, let go: a 4 m dash that kills every enemy on the line). sim/melee.ts
import { describe, expect, it } from 'vitest';
import {
  Btn,
  v3,
  step,
  stepPredict,
  createPlayer,
  addPlayer,
  buildLevel,
  createWorld,
  defaultConfig,
  csConfig,
  hashWorld,
  cloneWorld,
  TICK_DT,
  COMBAT_DEFAULTS,
  botThink,
  createBotMemory,
  BOT_SKILLS,
  type GameConfig,
  type PlayerState,
  type PlayerInput,
  type SimEvent,
  type Quat,
  type BoxDef,
  type SimContext,
} from '../src/index';
import { flatLevel, view, type Sim } from './helpers';

const sim0 = (boxes: BoxDef[] = [], config: GameConfig = defaultConfig()): Sim => {
  const ctx: SimContext = { level: buildLevel(flatLevel(boxes)), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 1);
  const p = addPlayer(world, createPlayer(1, 0, v3(0, 0, 0), 0, config));
  return { ctx, world, p, config };
};

const addOther = (sim: Sim, id: number, team: 0 | 1, feet: ReturnType<typeof v3>) =>
  addPlayer(sim.world, createPlayer(id, team, feet, 180, sim.config));

/** Step n ticks; player 1 holds `buttons` and looks along `v`, everyone else idles. */
const tick = (sim: Sim, buttons: number, n = 1, v: Quat = view(0)): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const inputs: Record<number, PlayerInput> = {};
    for (const p of sim.world.players)
      inputs[p.id] = {
        tick: sim.world.tick + 1,
        buttons: p.id === 1 ? buttons : 0,
        view: p.id === 1 ? v : p.view,
      };
    step(sim.world, inputs, sim.ctx);
    events.push(...sim.world.events);
  }
  return events;
};

const settle = (sim: Sim): void => void tick(sim, 0, 30);

/** Hold E for `heldTicks` ticks (the press included), then let go for one tick. */
const holdE = (sim: Sim, heldTicks: number, v: Quat = view(0)): SimEvent[] => [
  ...tick(sim, Btn.Melee, heldTicks, v),
  ...tick(sim, 0, 1, v),
];

const FULL = Math.round(COMBAT_DEFAULTS.teleportChargeSec / TICK_DT);
const fired = (ev: SimEvent[]) => ev.some((e) => e.type === 'teleportSlash');

describe('normal slash (tap E)', () => {
  it('still deals 34, with about 20-25 % more reach than before (2.2 m)', () => {
    expect(COMBAT_DEFAULTS.slashDamage).toBe(34);
    const ratio = COMBAT_DEFAULTS.slashRange / 2.2;
    expect(ratio).toBeGreaterThanOrEqual(1.2);
    expect(ratio).toBeLessThanOrEqual(1.25);
    // 2.8 m away: out of the old reach (2.2 + body), inside the new one
    const sim = sim0();
    const enemy = addOther(sim, 2, 1, v3(0, 0, -2.8));
    settle(sim);
    const ev = tick(sim, Btn.Melee, 1);
    expect(ev.some((e) => e.type === 'hit' && e.victim === 2 && e.damage === 34)).toBe(true);
    expect(enemy.hp).toBe(66);
    // a tap never teleports
    tick(sim, 0, 1);
    expect(fired(ev)).toBe(false);
    expect(sim.p.meleeCharge).toBe(0);
  });

  it('does not reach 3.4 m', () => {
    const sim = sim0();
    const enemy = addOther(sim, 2, 1, v3(0, 0, -3.4));
    settle(sim);
    tick(sim, Btn.Melee, 1);
    expect(enemy.hp).toBe(100);
  });
});

describe('teleport slash (hold E 1 s, let go)', () => {
  it('needs a full second of charge', () => {
    const sim = sim0();
    settle(sim);
    expect(fired(holdE(sim, FULL - 1))).toBe(false);
    expect(FULL).toBe(60);
    const ev = holdE(sim, FULL);
    expect(ev.some((e) => e.type === 'meleeReady')).toBe(true);
    expect(fired(ev)).toBe(true);
  });

  it('slows you to 60 % while charging, and the charge is in the public state', () => {
    const sim = sim0();
    settle(sim);
    tick(sim, Btn.Melee | Btn.Forward, 40);
    const speed = Math.hypot(sim.p.vel.x, sim.p.vel.z);
    expect(speed).toBeLessThanOrEqual(sim.config.movement.sprintSpeed * 0.6 + 1e-6);
    expect(speed).toBeGreaterThan(sim.config.movement.sprintSpeed * 0.5);
    expect(sim.p.meleeCharge).toBe(40);
    tick(sim, Btn.Forward, 30); // let go early: full speed again
    expect(sim.p.speedCap).toBe(0);
    expect(Math.hypot(sim.p.vel.x, sim.p.vel.z)).toBeGreaterThan(
      sim.config.movement.sprintSpeed * 0.9,
    );
  });

  it('dashes teleportDistance (4.8 m) along the floor (also when looking down) and kills enemies on the line', () => {
    const sim = sim0();
    const onLine = addOther(sim, 2, 1, v3(0.4, 0, -3.5));
    const D = COMBAT_DEFAULTS.teleportDistance;
    const end = addOther(sim, 3, 1, v3(-0.3, 0, -(D + 0.6))); // just past the end, within reach
    const beside = addOther(sim, 4, 1, v3(1.4, 0, -2.5));
    const behind = addOther(sim, 5, 1, v3(0, 0, 3));
    const far = addOther(sim, 6, 1, v3(0, 0, -(D + 2)));
    settle(sim);
    const ev = holdE(sim, FULL, view(0, -35));
    const dash = ev.find((e) => e.type === 'teleportSlash');
    if (dash?.type !== 'teleportSlash') throw new Error('no teleport slash');
    expect(dash.from.z - dash.to.z).toBeCloseTo(COMBAT_DEFAULTS.teleportDistance, 2);
    expect(dash.to).toEqual(sim.p.pos);
    expect(Math.abs(sim.p.pos.x)).toBeLessThan(1e-6);
    expect(Math.abs(dash.to.y - dash.from.y)).toBeLessThan(0.1); // along the floor, not into it
    expect(onLine.alive).toBe(false);
    expect(end.alive).toBe(false);
    expect(beside.alive).toBe(true);
    expect(behind.alive).toBe(true);
    expect(far.alive).toBe(true);
    const kills = ev.filter((e) => e.type === 'kill');
    expect(kills.map((k) => (k.type === 'kill' ? k.kind : ''))).toEqual([
      'teleportSlash',
      'teleportSlash',
    ]);
  });

  it('stops at a wall and never kills through it', () => {
    // a thin wall 2 m ahead (z = -2 .. -2.2), an enemy right behind it
    const wall: BoxDef = { c: v3(0, 2, -2.1), h: v3(4, 2, 0.1) };
    const sim = sim0([wall]);
    const enemy = addOther(sim, 2, 1, v3(0, 0, -2.8));
    settle(sim);
    holdE(sim, FULL);
    const r = sim.config.movement.radius;
    expect(sim.p.pos.z).toBeGreaterThanOrEqual(-2 + r - 1e-6);
    expect(sim.p.pos.z).toBeLessThan(-2 + r + 0.15);
    expect(enemy.alive).toBe(true);
    expect(enemy.hp).toBe(100);
  });

  it('walks up a ramp instead of stopping at it', () => {
    // a 20° ramp rising ahead
    const ang = (20 * Math.PI) / 180;
    const ramp: BoxDef = {
      c: v3(0, -0.5, -4),
      h: v3(2, 0.5, 3),
      q: { x: Math.sin(-ang / 2), y: 0, z: 0, w: Math.cos(ang / 2) },
    };
    const sim = sim0([ramp]);
    settle(sim);
    const z0 = sim.p.pos.z;
    holdE(sim, FULL);
    expect(z0 - sim.p.pos.z).toBeGreaterThan(3.5);
  });

  it('spares teammates and is soaked by a round-start shield', () => {
    const sim = sim0();
    const mate = addOther(sim, 2, 0, v3(0, 0, -2));
    const shielded = addOther(sim, 3, 1, v3(0, 0, -3.6));
    shielded.shield = true;
    settle(sim);
    holdE(sim, FULL);
    expect(mate.alive).toBe(true);
    expect(mate.hp).toBe(66); // only the tap slash at the press (friendly fire is on for it)
    expect(shielded.alive).toBe(true);
    expect(shielded.shield).toBe(false);
  });

  it('has a 7 s cooldown, and holding too long lets the charge fade', () => {
    const sim = sim0();
    settle(sim);
    expect(fired(holdE(sim, FULL))).toBe(true);
    tick(sim, 0, 60);
    const ev = holdE(sim, FULL + 10); // 2 s after firing: nothing
    expect(fired(ev)).toBe(false);
    tick(sim, 0, Math.round(COMBAT_DEFAULTS.teleportCooldownSec / TICK_DT) - 60 - FULL - 11);
    expect(sim.p.teleportCd).toBe(0);
    expect(fired(holdE(sim, FULL))).toBe(true);
    // held for too long: fades without firing (and without a cooldown)
    tick(sim, 0, Math.round(COMBAT_DEFAULTS.teleportCooldownSec / TICK_DT) + 1);
    const hold = Math.round(COMBAT_DEFAULTS.teleportHoldSec / TICK_DT);
    const ev2 = holdE(sim, FULL + hold + 5);
    expect(fired(ev2)).toBe(false);
    expect(ev2.some((e) => e.type === 'meleeCancel')).toBe(true);
    expect(sim.p.teleportCd).toBe(0);
  });

  it('is deterministic and predicted the same way on the client', () => {
    const run = () => {
      const sim = sim0([{ c: v3(1, 1, -3), h: v3(0.3, 1, 0.3) }]);
      addOther(sim, 2, 1, v3(0, 0, -3));
      settle(sim);
      holdE(sim, FULL, view(10, 5));
      return hashWorld(sim.world);
    };
    expect(run()).toBe(run());

    const sim = sim0();
    settle(sim);
    const client = cloneWorld(sim.world);
    const inputs = (b: number): PlayerInput => ({
      tick: sim.world.tick + 1,
      buttons: b,
      view: view(30),
    });
    for (let i = 0; i <= FULL; i++) {
      const input = inputs(i < FULL ? Btn.Melee : 0);
      step(sim.world, { 1: input }, sim.ctx);
      stepPredict(client, 1, input, sim.ctx);
    }
    expect(sim.world.events.some((e) => e.type === 'teleportSlash')).toBe(true);
    const cp = client.players.find((q) => q.id === 1) as PlayerState;
    expect(cp.pos).toEqual(sim.p.pos);
  });

  it('is not in CS modes: their knife keeps its old reach and E never charges', () => {
    const sim = sim0([], csConfig(defaultConfig()));
    const enemy = addOther(sim, 2, 1, v3(0, 0, -2.8));
    settle(sim);
    const z0 = sim.p.pos.z;
    const ev = holdE(sim, FULL + 20);
    expect(fired(ev)).toBe(false);
    expect(ev.some((e) => e.type === 'meleeCharge' || e.type === 'meleeReady')).toBe(false);
    expect(sim.p.meleeCharge).toBe(0);
    expect(sim.p.pos.z).toBeGreaterThan(z0 - 1.5); // just the slash lunge
    expect(sim.config.combat.slashRange).toBe(2.2);
    expect(enemy.hp).toBe(100); // 2.8 m: out of the CS knife's reach
    // and close up the knife still cuts for 34
    const sim2 = sim0([], csConfig(defaultConfig()));
    const near = addOther(sim2, 2, 1, v3(0, 0, -1.8));
    settle(sim2);
    tick(sim2, Btn.Melee, 1);
    expect(near.hp).toBe(66);
  });
});

describe('bots and the teleport slash', () => {
  it('a good bot uses it on a close enemy now and then', () => {
    const sim = sim0();
    sim.ctx.noDamage = true; // nobody dies: we only watch what the bot does
    addOther(sim, 2, 1, v3(0, 0, -6));
    const mem = createBotMemory(1, BOT_SKILLS.hard, 3);
    let dashes = 0;
    for (let i = 0; i < 60 * 30 && dashes === 0; i++) {
      const input = botThink(sim.world, sim.ctx, sim.p, mem);
      step(sim.world, { 1: input }, sim.ctx);
      dashes += sim.world.events.filter((e) => e.type === 'teleportSlash' && e.player === 1).length;
    }
    expect(dashes).toBeGreaterThan(0);
  });
});

describe('teleport slash: owner tweaks (any direction, own weapon, 3 s cooldown)', () => {
  /** Charge fully with `keys` held, then let go of E (keys still held); position before / after. */
  const dashWith = (sim: Sim, keys: number, v: Quat) => {
    tick(sim, Btn.Melee | keys, FULL, v);
    const before = { ...sim.world.players[0].pos };
    const ev = tick(sim, keys, 1, v);
    return { ev, before, after: sim.world.players[0].pos };
  };

  it('has a 3 s cooldown', () => {
    expect(COMBAT_DEFAULTS.teleportCooldownSec).toBe(3);
  });

  it('works whatever the Boomerang is doing (the sword is its own weapon)', () => {
    const sim = sim0();
    settle(sim);
    for (const b of sim.world.boomerangs) if (b.owner === 1) b.phase = 3; // dropped: not in hand
    expect(fired(holdE(sim, FULL))).toBe(true);
  });

  it('goes the way the movement keys point: A dashes left', () => {
    const sim = sim0();
    settle(sim);
    const { ev, before, after } = dashWith(sim, Btn.Left, view(0));
    expect(fired(ev)).toBe(true);
    // view(0) looks along -z, so left is -x
    expect(before.x - after.x).toBeGreaterThan(3);
    expect(Math.abs(after.z - before.z)).toBeLessThan(1);
  });

  it('goes up when you look up (no keys held)', () => {
    const sim = sim0();
    settle(sim);
    const { ev, before, after } = dashWith(sim, 0, view(0, 60));
    expect(fired(ev)).toBe(true);
    expect(after.y - before.y).toBeGreaterThan(2.5);
  });
});
