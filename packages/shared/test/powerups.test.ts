import { describe, expect, it } from 'vitest';
import {
  Btn,
  Phase,
  Powerup,
  v3,
  len,
  sub,
  dot,
  normalize,
  eyePos,
  step,
  stepPredict,
  createPlayer,
  addPlayer,
  applyDamage,
  spawnPowerup,
  updateRoundPowerups,
  buildLevel,
  createWorld,
  defaultConfig,
  csConfig,
  mapDef,
  createMatch,
  startMatch,
  updateMatch,
  applyBotObjectives,
  createBotMemory,
  BOT_SKILLS,
  hashWorld,
  cloneWorld,
  rngFromSeed,
  rngFloat,
  rngNextU32,
  encodeSnapshot,
  decodeSnapshot,
  PLAYER_SCHEMA,
  toNetPlayer,
  TICK_DT,
  ALL_BUTTONS,
  type BoxDef,
  type MatchState,
  type PlayerInput,
  type PlayerState,
  type Quat,
  type SimContext,
  type SimEvent,
  type WorldState,
  type SnapshotData,
  type RankedMode,
  type LoadoutName,
  type MatchObjective,
} from '../src/index';
import { flatLevel, makeSim, settle, view, planarSpeed, type Sim } from './helpers';

const secs = (s: number) => Math.round(s * 60);

const addOther = (sim: Sim, id: number, team: 0 | 1, feet = v3(0, 0, -15), yaw = 180) =>
  addPlayer(sim.world, createPlayer(id, team, feet, yaw, sim.config));

type Frame = Record<number, { buttons?: number; view?: Quat }>;

const tick = (sim: Sim, frame: Frame = {}, n = 1): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const inputs: Record<number, PlayerInput> = {};
    for (const p of sim.world.players) {
      const f = frame[p.id] ?? {};
      inputs[p.id] = { tick: sim.world.tick + 1, buttons: f.buttons ?? 0, view: f.view ?? p.view };
    }
    step(sim.world, inputs, sim.ctx);
    events.push(...sim.world.events);
  }
  return events;
};

const quickThrow = (sim: Sim, id: number, v?: Quat, releaseView?: Quat): SimEvent[] => {
  const ev = tick(sim, { [id]: { buttons: Btn.Fire, view: v } }, 5);
  ev.push(...tick(sim, { [id]: { buttons: 0, view: releaseView ?? v } }, 1));
  return ev;
};

const give = (p: PlayerState, kind: 1 | 2, charges = 3) => {
  p.powerup = kind;
  p.powerupCharges = charges;
};

// ---------------------------------------------------------------------------------------------

describe('power-ups: spawning in a match', () => {
  const setup = (
    mode: RankedMode = '1v1',
    objective: MatchObjective = 'tower',
    loadout: LoadoutName = 'lethal',
    map = 'kestrel',
  ) => {
    const base = defaultConfig();
    const config = loadout === 'cs' ? csConfig(base) : base;
    const ctx: SimContext = { level: buildLevel(mapDef(map)), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 11);
    const per = mode === '1v1' ? 1 : 2;
    let id = 1;
    for (const team of [0, 1] as const)
      for (let i = 0; i < per; i++) {
        const s = ctx.level.def.spawns.find((sp) => sp.team === team)!;
        addPlayer(world, createPlayer(id++, team, s.pos, s.yawDeg, config));
      }
    const ms = createMatch(mode, objective, loadout);
    startMatch(ms, world, ctx);
    return { ctx, world, ms };
  };
  const run = (ms: MatchState, world: WorldState, ctx: SimContext, n: number): SimEvent[] => {
    const ev: SimEvent[] = [];
    for (let i = 0; i < n; i++) {
      step(world, {}, ctx);
      updateMatch(ms, world, ctx);
      ev.push(...world.events);
    }
    return ev;
  };
  const atPoint = (ctx: SimContext, pos: { x: number; y: number; z: number }) =>
    (ctx.level.def.powerups ?? []).some((pt) => len(sub(pt, pos)) < 1e-6);

  it('Kestrel has central, mirror-symmetric power-up points', () => {
    const pts = mapDef('kestrel').powerups ?? [];
    expect(pts.length).toBeGreaterThanOrEqual(1);
    expect(pts.length).toBeLessThanOrEqual(2);
    for (const p of pts) {
      expect(pts.some((o) => Math.abs(o.x + p.x) < 1e-6 && Math.abs(o.z - p.z) < 1e-6)).toBe(true);
      expect(Math.abs(p.x)).toBeLessThan(10);
    }
  });

  it('one ~10 s into the live round, a second at 45 s, never more than 2, at the map points', () => {
    const { ctx, world, ms } = setup();
    const r = ctx.config.rules;
    run(ms, world, ctx, secs(r.spawnLockSec) + 1);
    expect(ms.phase).toBe('live');
    expect(world.powerups).toHaveLength(0);
    run(ms, world, ctx, secs(r.powerupFirstSec) - 3);
    expect(world.powerups).toHaveLength(0);
    let ev = run(ms, world, ctx, 5);
    expect(world.powerups).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'powerupSpawn')).toHaveLength(1);
    const first = world.powerups[0];
    expect(atPoint(ctx, first.pos)).toBe(true);
    expect([Powerup.Freeze, Powerup.Double]).toContain(first.kind);
    ev = run(ms, world, ctx, secs(r.powerupSecondSec - r.powerupFirstSec));
    expect(world.powerups).toHaveLength(2);
    expect(ev.filter((e) => e.type === 'powerupSpawn')).toHaveLength(1);
    expect(world.powerups.every((u) => atPoint(ctx, u.pos))).toBe(true);
    // two points, two power-ups: different points
    expect(len(sub(world.powerups[0].pos, world.powerups[1].pos))).toBeGreaterThan(1);
    // nothing more this round, even with the points freed up
    world.powerups = [];
    ev = run(ms, world, ctx, secs(10));
    expect(ev.some((e) => e.type === 'powerupSpawn')).toBe(false);
    expect(ms.powerupsSpawned).toBe(2);
  });

  it('bomb objective (lethal kit) gets them too; the round ending clears them', () => {
    const { ctx, world, ms } = setup('2v2', 'bomb', 'lethal', 'split-deck');
    const r = ctx.config.rules;
    run(ms, world, ctx, secs(r.spawnLockSec + r.powerupFirstSec) + 3);
    expect(world.powerups).toHaveLength(1);
    // wipe out one team: the round ends and the power-up is gone
    for (const p of world.players.filter((q) => q.team === 1)) {
      p.shield = false; // (the round-start shield would soak this up)
      applyDamage(world, ctx, 1, p, 1000, 'slash', false, p.pos, p.pos);
    }
    run(ms, world, ctx, 1);
    expect(ms.phase).toBe('roundEnd');
    expect(world.powerups).toHaveLength(0);
    // next round starts from zero again
    run(ms, world, ctx, secs(r.resultsSec) + 2);
    expect(ms.powerupsSpawned).toBe(0);
  });

  it('never in the CS loadout', () => {
    const { ctx, world, ms } = setup('2v2', 'bomb', 'cs', 'split-deck');
    const ev = run(ms, world, ctx, secs(ctx.config.rules.spawnLockSec + 60));
    expect(ms.phase).toBe('live');
    expect(ev.some((e) => e.type === 'powerupSpawn')).toBe(false);
    expect(world.powerups).toHaveLength(0);
  });

  it('with one point, the second waits until the first is picked up', () => {
    const sim = makeSim(flatLevel([], [], { powerups: [v3(20, 1.2, 20)] }));
    const r = sim.config.rules;
    let n = updateRoundPowerups(sim.world, sim.ctx, 0, 0);
    expect(n).toBe(0); // not due yet
    sim.world.tick = secs(r.powerupFirstSec);
    n = updateRoundPowerups(sim.world, sim.ctx, 0, n);
    expect(n).toBe(1);
    sim.world.tick = secs(r.powerupSecondSec) + 5;
    n = updateRoundPowerups(sim.world, sim.ctx, 0, n);
    expect(n).toBe(1); // the only point is taken
    sim.world.powerups = [];
    n = updateRoundPowerups(sim.world, sim.ctx, 0, n);
    expect(n).toBe(2);
    sim.world.powerups = [];
    sim.world.tick += secs(60);
    expect(updateRoundPowerups(sim.world, sim.ctx, 0, n)).toBe(2);
  });

  it('bots head for a nearby power-up when they have nothing urgent to do', () => {
    const { ctx, world, ms } = setup('2v2');
    run(ms, world, ctx, secs(ctx.config.rules.spawnLockSec) + 1);
    // a non-carrier bot of team 0
    const bot = world.players.find((p) => p.team === 0 && ms.controllers[0].carrier !== p.id)!;
    const mem = createBotMemory(bot.id, BOT_SKILLS.normal, 3);
    const u = spawnPowerup(world, v3(bot.pos.x + 8, bot.pos.y, bot.pos.z), Powerup.Freeze);
    applyBotObjectives(ms, world, ctx, [mem]);
    expect(mem.objective && len(sub(mem.objective, u.pos))).toBeLessThan(1e-6);
    // already holding one: back to the normal objective
    give(bot, Powerup.Double);
    applyBotObjectives(ms, world, ctx, [mem]);
    expect(mem.objective === null || len(sub(mem.objective, u.pos)) > 1e-6).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------

describe('power-ups: pick-up', () => {
  it('walking into one picks it up (Freeze ×3); you hold only one at a time', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const u = spawnPowerup(sim.world, v3(0, 1.2, -4), Powerup.Freeze);
    const ev = tick(sim, { 1: { buttons: Btn.Forward } }, 60);
    const pick = ev.find((e) => e.type === 'powerupPickup');
    expect(pick).toMatchObject({ player: 1, id: u.id, kind: Powerup.Freeze });
    expect(sim.p.powerup).toBe(Powerup.Freeze);
    expect(sim.p.powerupCharges).toBe(sim.config.combat.freezeCharges);
    expect(sim.world.powerups).toHaveLength(0);
    // holding one: walk right through another, it stays
    spawnPowerup(sim.world, v3(sim.p.pos.x, 1.2, sim.p.pos.z - 3), Powerup.Double);
    tick(sim, { 1: { buttons: Btn.Forward } }, 60);
    expect(sim.p.powerup).toBe(Powerup.Freeze);
    expect(sim.world.powerups).toHaveLength(1);
  });

  it('pick-up radius ~1.2 m from your body', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const r = sim.config.combat.powerupPickupRadius;
    spawnPowerup(sim.world, v3(r + 0.3, 1.2, 0), Powerup.Double);
    tick(sim, {}, 5);
    expect(sim.p.powerup).toBe(Powerup.None);
    spawnPowerup(sim.world, v3(0, 1.2, r - 0.1), Powerup.Double);
    tick(sim, {}, 1);
    expect(sim.p.powerup).toBe(Powerup.Double);
    expect(sim.p.powerupCharges).toBe(sim.config.combat.doubleCharges);
    // high above your head: out of reach
    const sim2 = makeSim(flatLevel());
    settle(sim2);
    spawnPowerup(sim2.world, v3(0, 1.8 + r + 0.3, 0), Powerup.Double);
    tick(sim2, {}, 3);
    expect(sim2.p.powerup).toBe(Powerup.None);
  });

  it('nobody picks up during the spawn lock, the dead neither, and never with the CS kit', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    spawnPowerup(sim.world, v3(0, 1.2, 0), Powerup.Freeze);
    sim.p.frozen = true;
    tick(sim, {}, 3);
    expect(sim.p.powerup).toBe(Powerup.None);
    sim.p.frozen = false;
    sim.p.alive = false;
    tick(sim, {}, 3);
    expect(sim.p.powerup).toBe(Powerup.None);
    const cs = makeSim(flatLevel());
    cs.ctx.config = csConfig(cs.config);
    settle(cs);
    spawnPowerup(cs.world, v3(0, 1.2, 0), Powerup.Freeze);
    tick(cs, {}, 3);
    expect(cs.p.powerup).toBe(Powerup.None);
  });
});

// ---------------------------------------------------------------------------------------------

describe('power-ups: Freeze', () => {
  const setup = () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const enemy = addOther(sim, 2, 1, v3(0, 0, -6));
    settle(sim);
    give(sim.p, Powerup.Freeze);
    return { sim, enemy };
  };
  const hit = (sim: Sim, victim: PlayerState, dmg = 10, kind: 'laser' | 'slash' = 'laser') =>
    applyDamage(sim.world, sim.ctx, 1, victim, dmg, kind, false, victim.pos, sim.p.pos);

  it('a damaging hit freezes the victim for 1 s: no moving, no acting, still takes damage', () => {
    const { sim, enemy } = setup();
    const full = secs(sim.config.combat.freezeSec);
    hit(sim, enemy);
    expect(enemy.stun).toBe(full);
    expect(sim.p.powerupCharges).toBe(2);
    const x0 = { ...enemy.pos };
    // tries to run, throw a grenade, slash and fire: nothing happens
    const ev = tick(
      sim,
      { 2: { buttons: Btn.Forward | Btn.Grenade | Btn.Melee | Btn.Dash | Btn.Jump } },
      full - 1,
    );
    expect(Math.hypot(enemy.pos.x - x0.x, enemy.pos.z - x0.z)).toBeLessThan(0.01);
    expect(planarSpeed(enemy)).toBeLessThan(0.01);
    expect(ev.some((e) => 'player' in e && e.player === 2 && e.type !== 'land')).toBe(false);
    // ...but takes damage while frozen
    const hp = enemy.hp;
    applyDamage(sim.world, sim.ctx, 3, enemy, 15, 'grenade', false, enemy.pos, enemy.pos);
    expect(enemy.hp).toBe(hp - 15);
    expect(enemy.stun).toBeGreaterThan(0);
    // one more tick and it's over: the held keys work again (a fresh Q press throws)
    tick(sim, { 2: { buttons: Btn.Forward } }, 1);
    expect(enemy.stun).toBe(0);
    tick(sim, { 2: { buttons: Btn.Forward } }, 20);
    expect(len(sub(enemy.pos, x0))).toBeGreaterThan(0.5);
    const g = tick(sim, { 2: { buttons: Btn.Forward | Btn.Grenade } }, 1);
    expect(g.some((e) => e.type === 'grenadeThrow' && e.player === 2)).toBe(true);
  });

  it('frozen in the air: gravity still pulls you down', () => {
    const { sim, enemy } = setup();
    enemy.pos = v3(enemy.pos.x, 4, enemy.pos.z);
    enemy.vel = v3(6, 3, 0);
    hit(sim, enemy);
    const y0 = enemy.pos.y;
    tick(sim, {}, 20);
    expect(enemy.pos.y).toBeLessThan(y0 - 0.5);
    expect(Math.abs(enemy.vel.x)).toBeLessThan(1e-9);
  });

  it('hits during a freeze refresh it, never beyond 1 s; 3 charges, then gone', () => {
    const { sim, enemy } = setup();
    const full = secs(sim.config.combat.freezeSec);
    hit(sim, enemy);
    tick(sim, {}, 30);
    expect(enemy.stun).toBe(full - 30);
    hit(sim, enemy);
    expect(enemy.stun).toBe(full);
    hit(sim, enemy);
    expect(enemy.stun).toBe(full);
    expect(sim.p.powerup).toBe(Powerup.None);
    expect(sim.p.powerupCharges).toBe(0);
    tick(sim, {}, full + 1);
    hit(sim, enemy); // no charges left: no freeze
    expect(enemy.stun).toBe(0);
  });

  it('only enemies who survive the hit, only Boomerang / Laser / slash hits', () => {
    const { sim, enemy } = setup();
    const mate = addOther(sim, 3, 0, v3(3, 0, 0));
    hit(sim, mate);
    expect(mate.stun).toBe(0);
    applyDamage(sim.world, sim.ctx, 1, enemy, 10, 'grenade', false, enemy.pos, sim.p.pos);
    expect(enemy.stun).toBe(0);
    hit(sim, enemy, 1000); // a kill doesn't use a charge
    expect(enemy.alive).toBe(false);
    expect(sim.p.powerupCharges).toBe(3);
  });

  it('a real Laser hit freezes', () => {
    const { sim, enemy } = setup();
    const b = sim.world.boomerangs.find((q) => q.owner === 1)!;
    b.phase = Phase.Dropped;
    b.pos = v3(30, 0.3, 30);
    const eyeY = eyePos(sim.p, sim.config.movement).y;
    const pitch = (Math.atan2(enemy.pos.y + 0.2 - eyeY, 6) * 180) / Math.PI;
    const ev = tick(sim, { 1: { buttons: Btn.Fire, view: view(0, pitch) } }, 1);
    ev.push(...tick(sim, { 1: { view: view(0, pitch) } }, 13));
    expect(ev.some((e) => e.type === 'freeze' && e.victim === 2)).toBe(true);
    expect(enemy.hp).toBe(80);
    expect(enemy.stun).toBeGreaterThan(0);
  });

  it('the spawn lock `frozen` is unchanged: invulnerable, and never stunned', () => {
    const { sim, enemy } = setup();
    enemy.frozen = true;
    hit(sim, enemy, 30);
    expect(enemy.hp).toBe(100);
    expect(enemy.stun).toBe(0);
    expect(sim.p.powerupCharges).toBe(3);
  });
});

// ---------------------------------------------------------------------------------------------

describe('power-ups: Double boomerang', () => {
  const setup = (boxes: BoxDef[] = []) => {
    const sim = makeSim(flatLevel(boxes));
    settle(sim);
    give(sim.p, Powerup.Double);
    return sim;
  };
  const real = (sim: Sim) => sim.world.boomerangs.find((b) => b.owner === 1)!;

  it('a straight Quick Throw adds a twin angled ~12° to the right', () => {
    const sim = setup();
    const ev = quickThrow(sim, 1, view(0));
    expect(ev.some((e) => e.type === 'twinThrow' && e.player === 1)).toBe(true);
    expect(sim.world.twins).toHaveLength(1);
    const t = sim.world.twins[0];
    const b = real(sim);
    expect(b.curve).toBe(0);
    expect(t.curve).toBe(0);
    const ang = (Math.acos(dot(normalize(t.vel), normalize(b.vel))) * 180) / Math.PI;
    expect(ang).toBeGreaterThan(10);
    expect(ang).toBeLessThan(14);
    expect(t.vel.x).toBeGreaterThan(0); // facing -Z, right is +X
    expect(sim.p.powerupCharges).toBe(2);
    expect(t.throwId).toBe(b.throwId);
  });

  it('a flick in flight tilts the real Boomerang, not its twin', () => {
    const sim = setup();
    tick(sim, { 1: { buttons: Btn.Fire, view: view(0) } }, 5);
    tick(sim, { 1: { buttons: 0, view: view(0) } }, 1);
    const b = real(sim);
    const t = sim.world.twins[0];
    // flick left in flight: the real one bends left (-X); the twin keeps its angle to the right
    tick(sim, { 1: { buttons: 0, view: view(15) } }, 1);
    tick(sim, { 1: { buttons: 0, view: view(30) } }, 1);
    expect(b.curve).toBeLessThan(-0.2);
    expect(t.curve).toBe(0);
    tick(sim, { 1: { buttons: 0, view: view(30) } }, 18);
    expect(t.pos.x - b.pos.x).toBeGreaterThan(1);
  });

  it('3 throws make twins, the 4th does not', () => {
    const sim = setup();
    let twins = 0;
    for (let k = 0; k < 4; k++) {
      const ev = quickThrow(sim, 1, view(0));
      twins += ev.filter((e) => e.type === 'twinThrow').length;
      // wait for the catch
      for (let i = 0; i < 240 && real(sim).phase !== Phase.Held; i++) tick(sim);
    }
    expect(twins).toBe(3);
    expect(sim.p.powerup).toBe(Powerup.None);
  });

  it('the twin deals Quick Throw damage; it vanishes at the end of its out-flight', () => {
    // dry run: where is the twin 18 ticks after the throw?
    const dry = setup();
    quickThrow(dry, 1, view(0));
    tick(dry, {}, 17);
    const at = { ...dry.world.twins[0].pos };
    const bAt = { ...real(dry).pos };
    expect(Math.abs(at.x - bAt.x)).toBeGreaterThan(2); // well away from the real one
    // for real, with an enemy standing there (chest at the twin's height)
    const sim = setup();
    const enemy = addOther(sim, 2, 1, v3(at.x, 0, at.z));
    enemy.pos = v3(at.x, at.y - 0.3, at.z);
    enemy.vel = v3();
    // hold the enemy still in the air (no gravity drift): re-pin each tick
    const ev: SimEvent[] = quickThrow(sim, 1, view(0));
    for (let i = 0; i < 40; i++) {
      enemy.pos = v3(at.x, at.y - 0.3, at.z);
      enemy.vel = v3();
      ev.push(...tick(sim));
    }
    const hits = ev.filter((e) => e.type === 'hit' && e.victim === 2);
    expect(hits).toHaveLength(1);
    const h = hits[0] as Extract<SimEvent, { type: 'hit' }>;
    expect(h.attacker).toBe(1);
    expect(['boomerang', 'headshot']).toContain(h.kind);
    expect(h.damage).toBe(
      h.head ? sim.config.combat.quickHeadDamage : sim.config.combat.quickBodyDamage,
    );
    expect(real(sim).hitIds).not.toContain(2);
    // gone at the end of its way out (not caught), while the real one comes back
    const end = ev.find((e) => e.type === 'twinEnd');
    expect(end).toMatchObject({ wall: false });
    expect(sim.world.twins).toHaveLength(0);
    expect(ev.filter((e) => e.type === 'catch')).toHaveLength(0);
  });

  it('bounces off its first wall, vanishes on the second', () => {
    const walls: BoxDef[] = [
      { c: v3(0, 5, -8.5), h: v3(50, 5, 0.5) },
      { c: v3(0, 5, 8.5), h: v3(50, 5, 0.5) },
    ];
    const sim = setup(walls);
    const ev = quickThrow(sim, 1, view(0));
    for (let i = 0; i < 60 && sim.world.twins.length; i++) ev.push(...tick(sim));
    expect(ev.filter((e) => e.type === 'twinBounce')).toHaveLength(1);
    expect(ev.find((e) => e.type === 'twinEnd')).toMatchObject({ wall: true });
    expect(sim.world.twins).toHaveLength(0);
    // it never hit its own thrower on the way past
    expect(ev.some((e) => e.type === 'hit' && e.victim === 1)).toBe(false);
  });

  it('cannot be recalled, steered or caught', () => {
    const a = setup();
    const b = setup();
    quickThrow(a, 1, view(0));
    quickThrow(b, 1, view(0));
    // a steers hard left, then recalls; b does nothing: the twins fly exactly the same
    tick(a, { 1: { buttons: Btn.Alt, view: view(60) } }, 8);
    tick(b, { 1: { view: view(60) } }, 8);
    expect(len(sub(real(a).pos, real(b).pos))).toBeGreaterThan(0.1); // the real one steered
    tick(a, { 1: { buttons: Btn.Recall, view: view(60) } }, 1);
    tick(b, { 1: { view: view(60) } }, 1);
    expect(real(a).phase).toBe(Phase.RecallTelegraph);
    expect(a.world.twins[0].phase).toBe(Phase.Out);
    expect(a.world.twins[0].pos).toEqual(b.world.twins[0].pos);
    // and it is never caught: it just ends
    const ev: SimEvent[] = [];
    for (let i = 0; i < 60 && a.world.twins.length; i++) ev.push(...tick(a));
    expect(ev.find((e) => e.type === 'twinEnd')).toBeTruthy();
  });

  it('friendly fire: a teammate in its path is hit too', () => {
    const dry = setup();
    quickThrow(dry, 1, view(0));
    tick(dry, {}, 17);
    const at = { ...dry.world.twins[0].pos };
    const sim = setup();
    const mate = addOther(sim, 2, 0, v3(at.x, 0, at.z));
    const ev: SimEvent[] = quickThrow(sim, 1, view(0));
    for (let i = 0; i < 25; i++) {
      mate.pos = v3(at.x, at.y - 0.3, at.z);
      mate.vel = v3();
      ev.push(...tick(sim));
    }
    expect(ev.some((e) => e.type === 'hit' && e.victim === 2 && e.attacker === 1)).toBe(true);
  });

  it('prediction flies the twin exactly like the server', () => {
    const sim = setup();
    const pred = cloneWorld(sim.world);
    const inputs: PlayerInput[] = [];
    for (let i = 0; i < 60; i++) {
      const buttons = i < 5 ? Btn.Fire : 0;
      const yaw = i === 5 ? -10 : i > 5 ? -20 : 0;
      inputs.push({ tick: sim.world.tick + 1 + i, buttons, view: view(yaw) });
    }
    for (const inp of inputs) {
      step(sim.world, { 1: inp }, sim.ctx);
      stepPredict(pred, 1, inp, sim.ctx);
      expect(JSON.stringify(pred.twins)).toBe(JSON.stringify(sim.world.twins));
    }
  });
});

// ---------------------------------------------------------------------------------------------

describe('power-ups: determinism and network', () => {
  const scripted = (seed: number, ticks: number): WorldState => {
    const sim = makeSim(flatLevel([{ c: v3(0, 3, -20), h: v3(10, 3, 0.5) }]), v3(0, 0, 0), 0);
    const b = addOther(sim, 2, 1, v3(4, 0, -12));
    addOther(sim, 3, 1, v3(-4, 0, -14));
    give(sim.p, Powerup.Double);
    give(b, Powerup.Freeze);
    spawnPowerup(sim.world, v3(0, 1.2, -6), Powerup.Freeze);
    const rng = rngFromSeed(seed);
    const held: Record<number, number> = {};
    const yaw: Record<number, number> = { 1: 0, 2: 180, 3: 180 };
    for (let t = 0; t < ticks; t++) {
      const inputs: Record<number, PlayerInput> = {};
      for (const id of [1, 2, 3]) {
        yaw[id] += (rngFloat(rng) - 0.5) * 10;
        if (t % 10 === 0) held[id] = rngNextU32(rng) & ALL_BUTTONS & ~Btn.Recall;
        inputs[id] = { tick: sim.world.tick + 1, buttons: held[id], view: view(yaw[id]) };
      }
      step(sim.world, inputs, sim.ctx);
    }
    return sim.world;
  };

  it('same inputs -> same world hash (twins, stuns, pick-ups included)', () => {
    const a = scripted(5, 900);
    const b = scripted(5, 900);
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(hashWorld(scripted(6, 900))).not.toBe(hashWorld(a));
  });

  it('snapshots carry twins, power-ups, stun and the exact own twins', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    give(sim.p, Powerup.Double, 2);
    quickThrow(sim, 1, view(0));
    sim.p.stun = 33;
    const u = spawnPowerup(sim.world, v3(1.5, 1.2, -3.25), Powerup.Freeze);
    const w = sim.world;
    const snap: SnapshotData = {
      seq: 1,
      tick: w.tick,
      ackInput: 0,
      lead: 0,
      baseline: 0,
      players: new Map([[1, PLAYER_SCHEMA.quantize(toNetPlayer(sim.p))]]),
      boomerangs: new Map(),
      grenades: [],
      twins: w.twins,
      powerups: w.powerups,
      zones: [],
      own: { player: sim.p, boomerang: null, twins: w.twins },
      events: null,
      extra: null,
    };
    const d = decodeSnapshot(encodeSnapshot(snap, null), () => null);
    expect(d.twins).toHaveLength(1);
    expect(d.twins![0].id).toBe(w.twins[0].id);
    expect(d.twins![0].owner).toBe(1);
    expect(len(sub(d.twins![0].pos, w.twins[0].pos))).toBeLessThan(0.01);
    expect(d.powerups).toEqual([
      expect.objectContaining({ id: u.id, kind: Powerup.Freeze, spawnTick: u.spawnTick }),
    ]);
    expect(d.own!.twins).toEqual(w.twins);
    expect(d.own!.player.powerup).toBe(Powerup.Double);
    expect(d.own!.player.powerupCharges).toBe(1);
    expect(d.players.get(1)!.stun).toBe(33);
    expect(d.players.get(1)!.powerup).toBe(Powerup.Double);
  });
});
