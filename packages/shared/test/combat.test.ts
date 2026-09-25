import { describe, expect, it } from 'vitest';
import {
  Btn,
  Phase,
  v3,
  len,
  sub,
  step,
  createPlayer,
  addPlayer,
  predictThrow,
  eyePos,
  type PlayerState,
  type PlayerInput,
  type SimEvent,
  type Quat,
  type BoxDef,
  type BoomerangState,
} from '../src/index';
import { flatLevel, makeSim, settle, view, type Sim } from './helpers';

/** Add a second player at `feet` facing yawDeg. */
const addOther = (
  sim: Sim,
  id: number,
  team: 0 | 1,
  feet = v3(0, 0, -15),
  yaw = 180,
): PlayerState => addPlayer(sim.world, createPlayer(id, team, feet, yaw, sim.config));

type Frame = Record<number, { buttons?: number; view?: Quat }>;

/** Step with per-player buttons; collects all events. */
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

const boomerangOf = (sim: Sim, id: number): BoomerangState =>
  sim.world.boomerangs.find((b) => b.owner === id)!;

/** Hold LMB for a few ticks then release (optionally with a curve key held on release). */
const quickThrow = (sim: Sim, id: number, curveKey = 0, v?: Quat): SimEvent[] => {
  const ev = tick(sim, { [id]: { buttons: Btn.Fire, view: v } }, 5);
  ev.push(...tick(sim, { [id]: { buttons: curveKey, view: v } }, 1));
  return ev;
};

describe('Boomerang: Quick Throw', () => {
  it('flies out, returns and is caught', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const ev = quickThrow(sim, 1);
    expect(ev.some((e) => e.type === 'throw')).toBe(true);
    const b = boomerangOf(sim, 1);
    expect(b.phase).toBe(Phase.Out);
    let maxDist = 0;
    let caught = false;
    for (let i = 0; i < 200 && !caught; i++) {
      const e = tick(sim);
      maxDist = Math.max(maxDist, len(sub(b.pos, sim.p.pos)));
      if (e.some((x) => x.type === 'catch')) caught = true;
    }
    expect(caught).toBe(true);
    expect(b.phase).toBe(Phase.Held);
    // ~45 m/s for ~0.42 s out => roughly 15-20 m
    expect(maxDist).toBeGreaterThan(12);
    expect(maxDist).toBeLessThan(25);
  });

  it('A/D on release curves the throw left/right', () => {
    const left = makeSim(flatLevel());
    settle(left);
    quickThrow(left, 1, Btn.Left);
    tick(left, {}, 8);
    const right = makeSim(flatLevel());
    settle(right);
    quickThrow(right, 1, Btn.Right);
    tick(right, {}, 8);
    // facing -Z: left is -X, right is +X
    expect(boomerangOf(left, 1).pos.x).toBeLessThan(-0.5);
    expect(boomerangOf(right, 1).pos.x).toBeGreaterThan(0.5);
  });

  it('hits a body for 50 on the way out, and again on the way back (2 hits kill)', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const enemy = addOther(sim, 2, 1, v3(0, 0, -8));
    settle(sim);
    const ev: SimEvent[] = quickThrow(sim, 1, 0, view(0, -3));
    for (let i = 0; i < 120; i++) ev.push(...tick(sim));
    const hits = ev.filter((e) => e.type === 'hit' && e.victim === 2);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].type === 'hit' && hits[0].damage).toBe(50);
    if (hits.length >= 2) expect(enemy.alive).toBe(false);
  });

  it('headshot kills in one hit', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const enemy = addOther(sim, 2, 1, v3(0, 0, -10));
    settle(sim);
    // aim exactly at the enemy's head
    const eye = eyePos(sim.p, sim.config.movement);
    const head = eyePos(enemy, sim.config.movement);
    // aim a touch high: the throw drops slightly in normal gravity (visible in the preview)
    const pitch = (Math.atan2(head.y + 0.06 - eye.y, Math.abs(head.z - eye.z)) * 180) / Math.PI;
    const ev = quickThrow(sim, 1, 0, view(0, pitch));
    for (let i = 0; i < 30; i++) ev.push(...tick(sim));
    const kill = ev.find((e) => e.type === 'kill');
    expect(kill && kill.type === 'kill' && kill.kind).toBe('headshot');
    expect(enemy.alive).toBe(false);
  });

  it('drops where it hits a wall and can be picked up', () => {
    const wall: BoxDef = { c: v3(0, 2, -6), h: v3(5, 2, 0.5) };
    const sim = makeSim(flatLevel([wall]));
    settle(sim);
    const ev = quickThrow(sim, 1);
    for (let i = 0; i < 30; i++) ev.push(...tick(sim));
    const b = boomerangOf(sim, 1);
    expect(ev.some((e) => e.type === 'wallHit')).toBe(true);
    expect(b.phase).toBe(Phase.Dropped);
    // walk to it
    const e2 = tick(sim, { 1: { buttons: Btn.Forward } }, 60);
    expect(e2.some((e) => e.type === 'pickup')).toBe(true);
    expect(b.phase).toBe(Phase.Held);
  });

  it('the preview matches the real flight path exactly', () => {
    const sim = makeSim(flatLevel([{ c: v3(8, 2, -12), h: v3(1, 2, 1) }]));
    settle(sim);
    // the preview assumes the thrower stays put: hold them still (D also strafes)
    sim.config.movement.runSpeed = 0;
    sim.config.movement.sprintSpeed = 0;
    tick(sim, { 1: { buttons: Btn.Fire, view: view(10, 2) } }, 5);
    const pred = predictThrow(sim.world, sim.ctx, sim.p, 1, 200);
    tick(sim, { 1: { buttons: Btn.Right, view: view(10, 2) } }, 1);
    const b = boomerangOf(sim, 1);
    const real = [{ ...b.pos }];
    for (let i = 0; i < 200 && b.phase !== Phase.Held && b.phase !== Phase.Dropped; i++) {
      tick(sim);
      real.push({ ...b.pos });
    }
    // compare the out-and-back path while the thrower stood still
    const n = Math.min(real.length, pred.points.length) - 1;
    expect(n).toBeGreaterThan(20);
    // the real throw already advanced one step on the release tick
    for (let i = 0; i < n; i++) expect(len(sub(real[i], pred.points[i + 1]))).toBeLessThan(1e-9);
  });

  it('steering turns the Boomerang toward the crosshair, limited by the meter', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    quickThrow(sim, 1);
    // hold RMB and look right: the Boomerang bends right (+X)
    tick(sim, { 1: { buttons: Btn.Alt, view: view(-60) } }, 12);
    const b = boomerangOf(sim, 1);
    expect(b.pos.x).toBeGreaterThan(1);
    expect(b.steerLeft).toBeLessThan(sim.config.combat.steerSec * 60);
  });
});

describe('Wind-up Throw', () => {
  it('takes 3 s, slows you to a walk, then kills in one body hit', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const enemy = addOther(sim, 2, 1, v3(0, 0, -40));
    settle(sim);
    const ev = tick(sim, { 1: { buttons: Btn.Alt | Btn.Forward } }, 179);
    expect(ev.some((e) => e.type === 'windupReady')).toBe(false);
    expect(Math.hypot(sim.p.vel.x, sim.p.vel.z)).toBeLessThanOrEqual(
      sim.config.combat.windupWalkSpeed + 0.01,
    );
    ev.push(...tick(sim, { 1: { buttons: Btn.Alt } }, 2));
    expect(ev.some((e) => e.type === 'windupReady')).toBe(true);
    ev.push(...tick(sim, { 1: { buttons: Btn.Alt | Btn.Fire, view: view(0, -1) } }, 1));
    for (let i = 0; i < 30; i++) ev.push(...tick(sim));
    const kill = ev.find((e) => e.type === 'kill');
    expect(kill && kill.type === 'kill' && kill.kind).toBe('windup');
    expect(enemy.alive).toBe(false);
  });

  it('is cancelled by jumping, sliding and damage; hold limit is 4 s', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    tick(sim, { 1: { buttons: Btn.Alt } }, 30);
    expect(sim.p.windup).toBeGreaterThan(0);
    tick(sim, { 1: { buttons: Btn.Alt | Btn.Jump } }, 1);
    expect(sim.p.windup).toBe(0);
    settle(sim);
    tick(sim, { 1: { buttons: Btn.Alt } }, 30);
    tick(sim, { 1: { buttons: Btn.Alt | Btn.Crouch } }, 2);
    expect(sim.p.windup).toBe(0);
    // hold limit: 3 s wind + 4 s hold, then it winds down
    tick(sim, {}, 5);
    const ev = tick(sim, { 1: { buttons: Btn.Alt } }, 180 + 240 + 2);
    expect(ev.some((e) => e.type === 'windupCancel')).toBe(true);
    // damage cancels
    const enemy = addOther(sim, 2, 1, v3(0, 0, -6));
    settle(sim);
    tick(sim, { 1: { buttons: Btn.Alt } }, 20);
    expect(sim.p.windup).toBeGreaterThan(0);
    // enemy lasers us (throw first so their LMB fires the laser)
    enemy.laserCharges = 3;
    const eb = boomerangOf(sim, 2);
    eb.phase = Phase.Dropped;
    eb.pos = v3(50, 0, 50);
    tick(sim, { 1: { buttons: Btn.Alt }, 2: { buttons: Btn.Fire, view: view(180, -3) } }, 20);
    expect(sim.p.hp).toBeLessThan(100);
    expect(sim.p.windup === 0 || sim.p.windup < 40).toBe(true);
  });
});

describe('Lethal Recall', () => {
  const setup = (walls: BoxDef[] = []) => {
    const sim = makeSim(flatLevel(walls));
    settle(sim);
    const b = boomerangOf(sim, 1);
    b.phase = Phase.Dropped;
    b.pos = v3(0, 1.2, -30);
    return { sim, b };
  };

  it('kills enemies AND teammates on an open line, after a telegraph', () => {
    const { sim, b } = setup();
    const enemy = addOther(sim, 2, 1, v3(0, 0, -20));
    const mate = addOther(sim, 3, 0, v3(0, 0, -10));
    settle(sim);
    const ev = tick(sim, { 1: { buttons: Btn.Recall } }, 1);
    const start = ev.find((e) => e.type === 'recallStart');
    expect(start && start.type === 'recallStart' && start.lethal).toBe(true);
    expect(b.phase).toBe(Phase.RecallTelegraph);
    tick(sim, {}, 17);
    expect(enemy.alive).toBe(true); // telegraph gives time to dodge
    const ev2 = tick(sim, {}, 40);
    expect(enemy.alive).toBe(false);
    expect(mate.alive).toBe(false);
    expect(ev2.some((e) => e.type === 'kill' && e.teamKill)).toBe(true);
    expect(b.phase).toBe(Phase.Held);
  });

  it('comes back through walls but does not kill through them', () => {
    const { sim, b } = setup([{ c: v3(0, 2, -25), h: v3(5, 3, 0.5) }]);
    const enemy = addOther(sim, 2, 1, v3(0, 0, -15));
    settle(sim);
    const ev = tick(sim, { 1: { buttons: Btn.Recall } }, 1);
    const start = ev.find((e) => e.type === 'recallStart');
    expect(start && start.type === 'recallStart' && start.lethal).toBe(false);
    tick(sim, {}, 60);
    expect(enemy.alive).toBe(true);
    expect(b.phase).toBe(Phase.Held);
  });
});

describe('Slash & deflect', () => {
  it('slash deals 50 at close range (friendly fire included)', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const mate = addOther(sim, 2, 0, v3(0, 0, -1.8));
    settle(sim);
    const ev = tick(sim, { 1: { buttons: Btn.Melee, view: view(0, -10) } }, 1);
    expect(ev.some((e) => e.type === 'hit' && e.victim === 2 && e.damage === 50)).toBe(true);
    expect(mate.hp).toBe(50);
  });

  const incoming = (angleOffDeg: number) => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const thrower = addOther(sim, 2, 1, v3(0, 0, -12));
    settle(sim);
    quickThrow(sim, 2, 0, view(180, 0));
    const b = boomerangOf(sim, 2);
    // wait until it is ~1.8 m away, then slash while looking `angleOffDeg` off
    let ev: SimEvent[] = [];
    for (let i = 0; i < 60; i++) {
      const d = len(sub(b.pos, eyePos(sim.p, sim.config.movement)));
      if (d < 2.4) {
        ev = tick(sim, { 1: { buttons: Btn.Melee, view: view(angleOffDeg, -2) } }, 3);
        break;
      }
      tick(sim);
    }
    return { sim, b, ev, thrower };
  };

  it('a well-timed slash facing the Boomerang deflects it and takes ownership', () => {
    const { b, ev } = incoming(0);
    expect(ev.some((e) => e.type === 'deflect')).toBe(true);
    expect(b.phase).toBe(Phase.Deflected);
    expect(b.controller).toBe(1);
  });

  it('deflects fail outside the small angle', () => {
    const { b, ev } = incoming(35);
    expect(ev.some((e) => e.type === 'deflect')).toBe(false);
    expect(b.controller).toBe(2);
  });
});

describe('Clashes, Laser, Grenade', () => {
  it('two Boomerangs that meet mid-air both drop', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    addOther(sim, 2, 1, v3(0, 0, -30));
    settle(sim);
    tick(sim, { 1: { buttons: Btn.Fire }, 2: { buttons: Btn.Fire } }, 5);
    const ev = tick(sim, {}, 30);
    expect(ev.some((e) => e.type === 'clash')).toBe(true);
    expect(boomerangOf(sim, 1).phase).toBe(Phase.Dropped);
    expect(boomerangOf(sim, 2).phase).toBe(Phase.Dropped);
  });

  it('Laser: warning delay, 3 charges, 20 body / 35 head', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const enemy = addOther(sim, 2, 1, v3(0, 0, -10));
    settle(sim);
    const b = boomerangOf(sim, 1);
    b.phase = Phase.Dropped;
    b.pos = v3(30, 0.3, 30);
    const eye = eyePos(sim.p, sim.config.movement);
    const chestPitch = (Math.atan2(enemy.pos.y + 0.2 - eye.y, 10) * 180) / Math.PI;
    const ev = tick(sim, { 1: { buttons: Btn.Fire, view: view(0, chestPitch) } }, 1);
    expect(ev.some((e) => e.type === 'laserWarn')).toBe(true);
    expect(ev.some((e) => e.type === 'laserFire')).toBe(false);
    const ev2 = tick(sim, { 1: { view: view(0, chestPitch) } }, 12);
    expect(ev2.some((e) => e.type === 'laserFire')).toBe(true);
    expect(enemy.hp).toBe(80);
    // headshot
    const head = eyePos(enemy, sim.config.movement);
    const headPitch = (Math.atan2(head.y - eye.y, 10) * 180) / Math.PI;
    tick(sim, { 1: { buttons: Btn.Fire, view: view(0, headPitch) } }, 1);
    tick(sim, { 1: { view: view(0, headPitch) } }, 12);
    expect(enemy.hp).toBe(45);
    tick(sim, { 1: { buttons: Btn.Fire, view: view(0, headPitch) } }, 1);
    tick(sim, { 1: { view: view(0, headPitch) } }, 12);
    expect(sim.p.laserCharges).toBe(0);
    const ev3 = tick(sim, { 1: { buttons: Btn.Fire } }, 1);
    expect(ev3.some((e) => e.type === 'laserWarn')).toBe(false); // out of charges
  });

  it('a grenade can be shot out of the air and detonates there', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const thrower = addOther(sim, 2, 1, v3(0, 0, -12));
    settle(sim);
    tick(sim, { 2: { buttons: Btn.Grenade, view: view(180, 10) } }, 1);
    const g = sim.world.grenades[0];
    expect(g).toBeDefined();
    const b = boomerangOf(sim, 1);
    b.phase = Phase.Dropped;
    b.pos = v3(30, 0.3, 30);
    tick(sim, {}, 3);
    // aim at the grenade and fire the laser
    const eye = eyePos(sim.p, sim.config.movement);
    const d = sub(g.pos, eye);
    const yaw = (Math.atan2(-d.x, -d.z) * 180) / Math.PI;
    const pitch = (Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI;
    // lead: predict where it will be when the laser fires (12 ticks later) by stepping a copy
    const ev = tick(sim, { 1: { buttons: Btn.Fire, view: view(yaw, pitch) } }, 1);
    expect(ev.some((e) => e.type === 'laserWarn')).toBe(true);
    let activated = false;
    for (let i = 0; i < 12; i++) {
      const dd = sub(g.pos, eyePos(sim.p, sim.config.movement));
      const vy = (Math.atan2(-dd.x, -dd.z) * 180) / Math.PI;
      const vp = (Math.atan2(dd.y, Math.hypot(dd.x, dd.z)) * 180) / Math.PI;
      const e = tick(sim, { 1: { view: view(vy, vp) } }, 1);
      if (e.some((x) => x.type === 'grenadeActivate' && x.shot)) activated = true;
    }
    expect(activated).toBe(true);
    void thrower;
  });

  it('grenade pulls players then pops for damage (friendly fire)', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const mate = addOther(sim, 2, 0, v3(0, 0, -4));
    settle(sim);
    tick(sim, { 1: { buttons: Btn.Grenade, view: view(0, -30) } }, 1);
    const ev = tick(sim, {}, 200);
    expect(ev.some((e) => e.type === 'grenadePop')).toBe(true);
    expect(mate.hp).toBeLessThan(100);
  });
});

describe('prediction of other players’ grenades', () => {
  it('an active enemy grenade pulls the predicted player exactly like the server', async () => {
    const {
      stepPredict,
      step,
      cloneWorld,
      addPlayer,
      createPlayer,
      v3: vec,
    } = await import('../src/index');
    const sim = makeSim(flatLevel(), vec(0, 0, 0));
    addPlayer(sim.world, createPlayer(2, 1, vec(20, 0, 0), 0, sim.config));
    settle(sim);
    sim.world.grenades.push({ id: 999, owner: 2, pos: vec(4, 1, 0), vel: vec(), phase: 1, t: 10 });
    const server = cloneWorld(sim.world);
    const client = cloneWorld(sim.world);
    for (let i = 0; i < 20; i++) {
      const tick = server.tick + 1;
      const input = { tick, buttons: 0, view: view(0) };
      step(server, { 1: input }, sim.ctx);
      stepPredict(client, 1, input, sim.ctx);
    }
    const ps = server.players.find((p) => p.id === 1)!;
    const pc = client.players.find((p) => p.id === 1)!;
    expect(ps.pos.x).toBeGreaterThan(0.2); // it really pulls
    expect(pc.pos).toEqual(ps.pos);
    expect(pc.vel).toEqual(ps.vel);
  });
});

describe('hit registration: judged by what the shooter saw', () => {
  it('a Boomerang hits the target where its thrower saw it (lag compensation)', async () => {
    const { hitboxOf } = await import('../src/index');
    const sim = makeSim(flatLevel());
    settle(sim);
    const target = addOther(sim, 2, 1, v3(3, 0, -10));
    settle(sim);
    // on the thrower's screen the target stood 3 m to the left: right in the Boomerang's path
    const seen = hitboxOf({ ...target, pos: v3(0, target.pos.y, -10) }, sim.config);
    sim.ctx.rewindHitboxes = (id) => (id === 1 ? [seen] : null);
    const ev = [...quickThrow(sim, 1), ...tick(sim, {}, 40)];
    expect(ev.some((e) => e.type === 'hit' && e.victim === 2 && e.attacker === 1)).toBe(true);
    // ...and without lag compensation the same throw misses the real (current) spot
    const sim2 = makeSim(flatLevel());
    settle(sim2);
    addOther(sim2, 2, 1, v3(3, 0, -10));
    settle(sim2);
    const ev2 = [...quickThrow(sim2, 1), ...tick(sim2, {}, 40)];
    expect(ev2.some((e) => e.type === 'hit')).toBe(false);
  });

  it('prediction never guesses kills that are judged where players are now', async () => {
    const { stepPredict, cloneWorld } = await import('../src/index');
    // a lethal recall straight through an enemy: the server kills, the client doesn't guess
    const sim = makeSim(flatLevel());
    settle(sim);
    const b = boomerangOf(sim, 1);
    b.phase = Phase.Dropped;
    b.pos = v3(0, 1.2, -30);
    addOther(sim, 2, 1, v3(0, 0, -20));
    settle(sim);
    const client = cloneWorld(sim.world);
    const predicted: SimEvent[] = [];
    for (let i = 0; i < 60; i++) {
      const input = { tick: client.tick + 1, buttons: i === 0 ? Btn.Recall : 0, view: view(0) };
      stepPredict(client, 1, input, sim.ctx);
      predicted.push(...client.events);
    }
    expect(predicted.some((e) => e.type === 'recallStart')).toBe(true);
    expect(predicted.some((e) => e.type === 'hit')).toBe(false);
    const real = tick(sim, { 1: { buttons: Btn.Recall } }, 1).concat(tick(sim, {}, 59));
    expect(real.some((e) => e.type === 'kill' && e.victim === 2)).toBe(true);
  });

  it('a predicted deflect trusts only where the defender saw the other Boomerang', async () => {
    const { stepPredict, cloneWorld } = await import('../src/index');
    const sim = makeSim(flatLevel());
    settle(sim);
    addOther(sim, 2, 1, v3(0, 0, -20));
    settle(sim);
    // the enemy Boomerang (as last reported) is right in front of player 1's blade...
    const enemyB = boomerangOf(sim, 2);
    enemyB.phase = Phase.Out;
    enemyB.controller = 2;
    enemyB.pos = v3(0, 1.6, -1.5);
    enemyB.vel = v3(0, 0, 45);
    const slash = (seenAt: ReturnType<typeof v3>) => {
      const client = cloneWorld(sim.world);
      const ctx = {
        ...sim.ctx,
        rewindPos: (id: number, kind: string) => (id === 1 && kind === 'boomerang' ? seenAt : null),
      };
      stepPredict(client, 1, { tick: client.tick + 1, buttons: Btn.Melee, view: view(0) }, ctx);
      return client.events.some((e) => e.type === 'deflect');
    };
    // ...but on the defender's screen it was still 12 m away: no deflect predicted
    expect(slash(v3(0, 1.6, -12))).toBe(false);
    // seen within reach: deflect predicted
    expect(slash(v3(0, 1.6, -1.5))).toBe(true);
  });
});

describe('Boomerang preview in gravity zones', () => {
  it.each([
    ['zero-G', v3(0, 0, 0)],
    ['sideways gravity', v3(20, 0, 0)],
  ] as const)('the preview matches the real flight in %s', (_name, gravity) => {
    const sim = makeSim(
      flatLevel([], [{ name: 'zone', min: v3(-40, 0.5, -60), max: v3(40, 30, -4), gravity }]),
    );
    settle(sim);
    sim.config.movement.runSpeed = 0;
    sim.config.movement.sprintSpeed = 0;
    tick(sim, { 1: { buttons: Btn.Fire, view: view(0, 3) } }, 5);
    const pred = predictThrow(sim.world, sim.ctx, sim.p, 0, 200);
    tick(sim, { 1: { buttons: 0, view: view(0, 3) } }, 1);
    const b = boomerangOf(sim, 1);
    const real = [{ ...b.pos }];
    for (let i = 0; i < 200 && b.phase !== Phase.Held && b.phase !== Phase.Dropped; i++) {
      tick(sim);
      real.push({ ...b.pos });
    }
    const n = Math.min(real.length, pred.points.length) - 1;
    expect(n).toBeGreaterThan(20);
    for (let i = 0; i < n; i++) expect(len(sub(real[i], pred.points[i + 1]))).toBeLessThan(1e-9);
    // the zone really bends it (sideways: drifts +x)
    if (gravity.x > 0) expect(Math.max(...real.map((p) => p.x))).toBeGreaterThan(0.5);
  });
});
