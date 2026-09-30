// Taking over a bot teammate after dying: body swap, Boomerangs, Controller, invalid cases.
import { describe, expect, it } from 'vitest';
import {
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  step,
  mapDef,
  createMatch,
  startMatch,
  updateMatch,
  takeOverBot,
  takeOverInMatch,
  canTakeOver,
  Phase,
  Btn,
  v3,
  TICK_DT,
  type SimContext,
  type WorldState,
  type PlayerInput,
} from '../src/index';

/** Kestrel with 2 v 2: players 1 (the "human") and 2 (a bot) on team 0, 3 and 4 on team 1. */
const setup = () => {
  const config = defaultConfig();
  const ctx: SimContext = { level: buildLevel(mapDef('kestrel')), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 11);
  let id = 1;
  for (const team of [0, 1] as const)
    for (let i = 0; i < 2; i++) {
      const s = ctx.level.def.spawns.filter((sp) => sp.team === team)[i];
      addPlayer(world, createPlayer(id++, team, s.pos, s.yawDeg, config));
    }
  return { ctx, world };
};

const P = (world: WorldState, id: number) => world.players.find((p) => p.id === id)!;
const B = (world: WorldState, owner: number) => world.boomerangs.find((b) => b.owner === owner)!;

const killPlayer = (world: WorldState, id: number) => {
  const p = P(world, id);
  p.alive = false;
  p.hp = 0;
  p.deaths++;
};

describe('takeOverBot', () => {
  it('gives the dead human the bot body and the bot the dead state; stats stay per id', () => {
    const { world } = setup();
    const h = P(world, 1);
    const b = P(world, 2);
    killPlayer(world, 1);
    h.pos = v3(1, 2, 3);
    h.kills = 5;
    h.damageDealt = 300;
    h.prevButtons = Btn.Melee;
    h.grenadesLeft = 0;
    b.pos = v3(10, 20, 30);
    b.hp = 42;
    b.kills = 1;
    b.teamKills = 1;
    b.laserCharges = 1;
    b.jetFuel = 0.25;
    b.lastAttacker = 3;
    b.prevButtons = Btn.Fire;
    const bView = { ...b.view };

    expect(takeOverBot(world, 1, 2)).toBe(true);
    const h2 = P(world, 1);
    const b2 = P(world, 2);
    // the body
    expect(h2.alive).toBe(true);
    expect(h2.hp).toBe(42);
    expect(h2.pos).toEqual(v3(10, 20, 30));
    expect(h2.view).toEqual(bView);
    expect(h2.laserCharges).toBe(1);
    expect(h2.jetFuel).toBe(0.25);
    expect(h2.lastAttacker).toBe(3);
    expect(h2.grenadesLeft).toBe(defaultConfig().combat.grenadesPerRound);
    expect(b2.alive).toBe(false);
    expect(b2.hp).toBe(0);
    expect(b2.pos).toEqual(v3(1, 2, 3));
    expect(b2.grenadesLeft).toBe(0);
    // the person
    expect([h2.id, h2.team, h2.kills, h2.deaths, h2.damageDealt]).toEqual([1, 0, 5, 1, 300]);
    expect([b2.id, b2.team, b2.kills, b2.teamKills, b2.deaths]).toEqual([2, 0, 1, 1, 0]);
    // held keys stay with the person (no fresh presses from the swap)
    expect(h2.prevButtons).toBe(Btn.Melee);
    expect(b2.prevButtons).toBe(Btn.Fire);
    expect(world.events).toContainEqual({ type: 'takeover', player: 1, bot: 2 });
  });

  it("swaps Boomerangs and hands the bot's throws and deflects to the human", () => {
    const { world } = setup();
    killPlayer(world, 1);
    const hb = B(world, 1);
    hb.phase = Phase.Dropped;
    hb.pos = v3(1, 1, 1);
    const bb = B(world, 2);
    bb.phase = Phase.Out;
    bb.pos = v3(5, 5, 5);
    bb.vel = v3(0, 0, -30);
    bb.throwId = 77;
    bb.steerLeft = 9;
    // an enemy Boomerang the bot deflected: the credit is the bot's
    const eb = B(world, 3);
    eb.phase = Phase.Deflected;
    eb.controller = 2;

    expect(takeOverBot(world, 1, 2)).toBe(true);
    const mine = B(world, 1);
    expect(mine).toMatchObject({ id: 1, owner: 1, controller: 1, phase: Phase.Out });
    expect(mine.pos).toEqual(v3(5, 5, 5));
    expect(mine.vel).toEqual(v3(0, 0, -30));
    expect(mine.throwId).toBe(77);
    expect(mine.steerLeft).toBe(9);
    const bots = B(world, 2);
    expect(bots).toMatchObject({ id: 2, owner: 2, phase: Phase.Dropped });
    expect(bots.pos).toEqual(v3(1, 1, 1));
    expect(B(world, 3).controller).toBe(1);
  });

  it('refuses (and changes nothing) unless a dead player takes a living teammate', () => {
    const { world } = setup();
    const same = (fn: () => boolean) => {
      const before = JSON.stringify(world);
      expect(fn()).toBe(false);
      expect(JSON.stringify(world)).toBe(before);
    };
    same(() => takeOverBot(world, 1, 2)); // the human is alive
    killPlayer(world, 1);
    same(() => takeOverBot(world, 1, 3)); // an enemy
    same(() => takeOverBot(world, 1, 99)); // nobody
    same(() => takeOverBot(world, 99, 2));
    same(() => takeOverBot(world, 1, 1));
    killPlayer(world, 2);
    same(() => takeOverBot(world, 1, 2)); // the bot is dead too
    expect(canTakeOver(world, 1, 2)).toBe(false);
  });

  it("the E that asked for the takeover doesn't slash with the new body", () => {
    const { world, ctx } = setup();
    killPlayer(world, 1);
    const input = (buttons: number): Record<number, PlayerInput> => ({
      1: { tick: world.tick + 1, buttons, view: P(world, 1).view },
    });
    const slashes = () => world.events.filter((e) => e.type === 'slash' && e.player === 1);
    step(world, input(Btn.Melee), ctx); // dead, holding E
    expect(takeOverBot(world, 1, 2)).toBe(true);
    step(world, input(Btn.Melee), ctx); // still held
    expect(slashes()).toHaveLength(0);
    step(world, input(0), ctx);
    step(world, input(Btn.Melee), ctx); // a real press
    expect(slashes()).toHaveLength(1);
  });
});

describe('takeOverInMatch', () => {
  const live = () => {
    const s = setup();
    const ms = createMatch('2v2');
    startMatch(ms, s.world, s.ctx);
    return { ...s, ms };
  };
  const toLive = (w: ReturnType<typeof live>) => {
    for (let i = 0; i < 60 * 30 && w.ms.phase !== 'live'; i++) {
      step(w.world, {}, w.ctx);
      updateMatch(w.ms, w.world, w.ctx);
    }
    expect(w.ms.phase).toBe('live');
  };

  it('only while the round is live', () => {
    const w = live();
    killPlayer(w.world, 1);
    expect(w.ms.phase).toBe('spawnLock');
    expect(takeOverInMatch(w.ms, w.world, 1, 2)).toBe(false);
    toLive(w);
    expect(takeOverInMatch(w.ms, w.world, 1, 2)).toBe(true);
    expect(P(w.world, 1).alive).toBe(true);
  });

  it("the human carries the bot's Controller, or finishes its pickup", () => {
    const w = live();
    toLive(w);
    const c = w.ms.controllers[0];
    c.carrier = 2;
    killPlayer(w.world, 1);
    w.ms.revealed = [2, 3];
    expect(takeOverInMatch(w.ms, w.world, 1, 2)).toBe(true);
    expect(c.carrier).toBe(1);
    expect(w.ms.revealed).toEqual([1, 3]);
    // the round goes on with the human as carrier (no drop: nobody died)
    step(w.world, {}, w.ctx);
    updateMatch(w.ms, w.world, w.ctx);
    expect(c.carrier).toBe(1);
    expect(w.world.events.some((e) => e.type === 'controllerDrop')).toBe(false);

    // a bot standing on a dropped Controller: the pickup carries on for the human
    const w2 = live();
    toLive(w2);
    const c2 = w2.ms.controllers[0];
    c2.carrier = null;
    c2.droppedAt = v3();
    c2.pickup = { player: 2, ticks: 10 };
    killPlayer(w2.world, 1);
    expect(takeOverInMatch(w2.ms, w2.world, 1, 2)).toBe(true);
    expect(c2.pickup).toEqual({ player: 1, ticks: 10 });
  });
});
