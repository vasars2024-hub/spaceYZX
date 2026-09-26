import { describe, expect, it } from 'vitest';
import {
  Btn,
  Phase,
  v3,
  sub,
  dot,
  normalize,
  step,
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  csConfig,
  configLoadout,
  loadoutOf,
  createMatch,
  matchView,
  eyePos,
  hitboxOf,
  chestOf,
  qFromBasis,
  qForward,
  qRight,
  qUp,
  shotDirection,
  gunConeDeg,
  gunRandom,
  AK_PATTERN,
  TICK_DT,
  type GameConfig,
  type PlayerState,
  type SimContext,
  type SimEvent,
  type Vec3,
  type WorldState,
  type Quat,
  CS_MOVE_SCALE,
} from '../src/index';
import { flatLevel } from './helpers';

const DEG = Math.PI / 180;

interface CsSim {
  ctx: SimContext;
  world: WorldState;
  me: PlayerState;
  foe: PlayerState;
  config: GameConfig;
}

/** A CS-mode world: you at the origin facing -Z, an enemy `dist` m ahead facing you. */
const csSim = (dist = 10, patch?: (c: GameConfig) => void, seed = 1): CsSim => {
  const config = csConfig(defaultConfig());
  patch?.(config);
  const ctx: SimContext = { level: buildLevel(flatLevel()), config, dt: TICK_DT };
  const world = createWorld(ctx.level, seed);
  const me = addPlayer(world, createPlayer(1, 0, v3(0, 0, 0), 0, config));
  const foe = addPlayer(world, createPlayer(2, 1, v3(0, 0, -dist), 180, config));
  const sim = { ctx, world, me, foe, config };
  tick(sim, {}, 30); // land
  return sim;
};

/** Take the enemy out of the world: shoot at nothing. */
const alone = (sim: CsSim): void => {
  sim.world.players = [sim.me];
  sim.world.boomerangs = sim.world.boomerangs.filter((b) => b.owner === sim.me.id);
};

type Frame = Record<number, { buttons?: number; view?: Quat }>;

const tick = (sim: CsSim, frame: Frame = {}, n = 1): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const inputs: Record<number, { tick: number; buttons: number; view: Quat }> = {};
    for (const p of sim.world.players) {
      const f = frame[p.id] ?? {};
      inputs[p.id] = { tick: sim.world.tick + 1, buttons: f.buttons ?? 0, view: f.view ?? p.view };
    }
    step(sim.world, inputs, sim.ctx);
    out.push(...sim.world.events);
  }
  return out;
};

/** View from the shooter's eye toward a point. */
const lookAt = (sim: CsSim, p: PlayerState, target: Vec3): Quat =>
  qFromBasis(normalize(sub(target, eyePos(p, sim.config.movement))), v3(0, 1, 0));

/** Tap LMB once (press on one tick, release on the next), then wait `gap` ticks. */
const tap = (sim: CsSim, view: Quat, gap = 40): SimEvent[] => [
  ...tick(sim, { 1: { buttons: Btn.Fire, view } }),
  ...tick(sim, { 1: { view } }, gap),
];

const hits = (ev: SimEvent[]) =>
  ev.filter((e): e is Extract<SimEvent, { type: 'hit' }> => e.type === 'hit');

/** Angle (deg) of `dir` relative to the view: [up, right]. */
const offsetDeg = (view: Quat, dir: Vec3): [number, number] => {
  const f = qForward(view);
  const along = dot(dir, f);
  return [
    Math.atan2(dot(dir, qUp(view)), along) / DEG,
    Math.atan2(dot(dir, qRight(view)), along) / DEG,
  ];
};

describe('CS mode config', () => {
  it('scales the movement speeds by CS_MOVE_SCALE, keeps gravity and jump height, and is idempotent', () => {
    const base = defaultConfig();
    const cs = csConfig(base);
    expect(configLoadout(base)).toBe('lethal');
    expect(configLoadout(cs)).toBe('cs');
    expect(cs.movement.sprintSpeed).toBe(base.movement.sprintSpeed * CS_MOVE_SCALE);
    expect(cs.movement.runSpeed).toBe(base.movement.runSpeed * CS_MOVE_SCALE);
    expect(cs.movement.crouchSpeed).toBe(base.movement.crouchSpeed * CS_MOVE_SCALE);
    expect(cs.movement.dashSpeed).toBe(base.movement.dashSpeed * CS_MOVE_SCALE);
    expect(cs.movement.slideMaxSpeed).toBe(base.movement.slideMaxSpeed * CS_MOVE_SCALE);
    expect(cs.movement.jetpackDirSpeed).toBe(base.movement.jetpackDirSpeed * CS_MOVE_SCALE);
    expect(cs.movement.airSoftCap).toBe(base.movement.airSoftCap * CS_MOVE_SCALE);
    expect(cs.movement.gravity).toBe(base.movement.gravity);
    expect(cs.movement.jumpHeight).toBe(base.movement.jumpHeight);
    expect(csConfig(cs)).toEqual(cs);
    expect(base.movement.sprintSpeed).toBe(9); // the base is not changed
  });

  it('players really move at CS_MOVE_SCALE of normal speed', () => {
    const speed = (config: GameConfig): number => {
      const ctx: SimContext = { level: buildLevel(flatLevel()), config, dt: TICK_DT };
      const world = createWorld(ctx.level, 1);
      const p = addPlayer(world, createPlayer(1, 0, v3(0, 0, 0), 0, config));
      for (let i = 0; i < 150; i++)
        step(world, { 1: { tick: world.tick + 1, buttons: Btn.Forward, view: p.view } }, ctx);
      return Math.hypot(p.vel.x, p.vel.z);
    };
    const normal = speed(defaultConfig());
    const cs = speed(csConfig(defaultConfig()));
    expect(normal).toBeGreaterThan(8.5);
    expect(cs / normal).toBeCloseTo(CS_MOVE_SCALE, 2);
  });

  it('CS matches: bomb rules with the cs loadout, shown to clients', () => {
    const ms = createMatch('2v2', 'bomb', 'cs');
    expect(ms.loadout).toBe('cs');
    expect(matchView(ms).loadout).toBe('cs');
    expect(createMatch('2v2').loadout).toBe('lethal');
    expect(loadoutOf(csConfig(defaultConfig()))).toMatchObject({
      boomerang: false,
      laser: false,
      grenade: false,
      guns: true,
      powerups: false,
    });
    expect(loadoutOf(defaultConfig()).powerups).toBe(true);
  });

  it('no Boomerang throws, Laser or Gravity Grenade; LMB fires the AK, 2 the Deagle, E slashes', () => {
    const sim = csSim(30);
    const ev = [
      ...tick(sim, { 1: { buttons: Btn.Fire } }, 20),
      ...tick(sim, { 1: { buttons: Btn.Alt } }, 120),
      ...tick(sim, { 1: { buttons: Btn.Grenade } }, 2),
      ...tick(sim, {}, 30),
      ...tick(sim, { 1: { buttons: Btn.Recall } }, 2),
    ];
    const types = new Set(ev.map((e) => e.type));
    for (const t of [
      'throw',
      'windupStart',
      'laserWarn',
      'laserFire',
      'grenadeThrow',
      'recallStart',
    ])
      expect(types.has(t as SimEvent['type']), t).toBe(false);
    expect(ev.filter((e) => e.type === 'gunFire' && e.gun === 'ak').length).toBeGreaterThan(0);
    expect(sim.world.boomerangs.find((b) => b.owner === 1)!.phase).toBe(Phase.Held);
    expect(sim.me.grenadesLeft).toBe(sim.config.combat.grenadesPerRound);
    // switch to the Deagle: it needs a moment to come up, then fires
    tick(sim, { 1: { buttons: Btn.Slot2 } });
    tick(sim, {}, 30);
    expect(sim.me.weapon).toBe(1);
    const ev2 = tap(sim, sim.me.view, 5);
    expect(ev2.some((e) => e.type === 'gunFire' && e.gun === 'deagle')).toBe(true);
    // the knife slash stays
    expect(tick(sim, { 1: { buttons: Btn.Melee } }).some((e) => e.type === 'slash')).toBe(true);
  });
});

describe('AK-47 and Desert Eagle damage', () => {
  it('AK: 4 body shots kill, 3 do not', () => {
    const sim = csSim(10);
    const aim = () => lookAt(sim, sim.me, chestOf(hitboxOf(sim.foe, sim.config)));
    const ev: SimEvent[] = [];
    for (let i = 0; i < 3; i++) ev.push(...tap(sim, aim()));
    expect(hits(ev).map((e) => [e.damage, e.head, e.kind])).toEqual(
      Array(3).fill([27, false, 'ak']),
    );
    expect(sim.foe.alive).toBe(true);
    expect(sim.foe.hp).toBe(100 - 3 * 27);
    const last = tap(sim, aim());
    expect(sim.foe.alive).toBe(false);
    expect(last.some((e) => e.type === 'kill' && e.kind === 'ak' && e.victim === 2)).toBe(true);
  });

  it('AK: one head shot kills', () => {
    const sim = csSim(10);
    const ev = tap(sim, lookAt(sim, sim.me, hitboxOf(sim.foe, sim.config).head));
    expect(hits(ev)[0]).toMatchObject({ head: true, damage: 110 });
    expect(sim.foe.alive).toBe(false);
  });

  it('Deagle: 2 body shots kill, one head shot kills', () => {
    const sim = csSim(10);
    tick(sim, { 1: { buttons: Btn.Slot2 } });
    tick(sim, {}, 30);
    const chest = () => lookAt(sim, sim.me, chestOf(hitboxOf(sim.foe, sim.config)));
    const first = tap(sim, chest(), 60);
    expect(hits(first)[0]).toMatchObject({ damage: 54, head: false, kind: 'deagle' });
    expect(sim.foe.alive).toBe(true);
    tap(sim, chest(), 60);
    expect(sim.foe.alive).toBe(false);

    const sim2 = csSim(10);
    tick(sim2, { 1: { buttons: Btn.Slot2 } });
    tick(sim2, {}, 30);
    const ev = tap(sim2, lookAt(sim2, sim2.me, hitboxOf(sim2.foe, sim2.config).head));
    expect(hits(ev)[0]).toMatchObject({ head: true, damage: 150 });
    expect(sim2.foe.alive).toBe(false);
  });
});

describe('fire rate and reload', () => {
  it('AK fires 600 rounds per minute while LMB is held; the Deagle once per click', () => {
    const sim = csSim(60);
    alone(sim);
    const ev = tick(sim, { 1: { buttons: Btn.Fire } }, 60);
    expect(ev.filter((e) => e.type === 'gunFire').length).toBe(10);
    tick(sim, {}, 200);
    tick(sim, { 1: { buttons: Btn.Slot2 } });
    tick(sim, {}, 30);
    const held = tick(sim, { 1: { buttons: Btn.Fire } }, 60);
    expect(held.filter((e) => e.type === 'gunFire').length).toBe(1);
    // clicking as fast as possible: one shot per 0.225 s (14 ticks)
    const clicks = tick(sim, { 1: { buttons: Btn.Fire } }, 1).concat(
      ...Array.from({ length: 60 }, (_, i) => tick(sim, { 1: { buttons: i % 2 ? Btn.Fire : 0 } })),
    );
    const n = clicks.filter((e) => e.type === 'gunFire').length;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(5);
  });

  it('AK: 30 rounds, reloads by itself on an empty trigger pull (2.5 s), R reloads early', () => {
    const sim = csSim(60);
    alone(sim);
    const c = sim.config.combat;
    tick(sim, { 1: { buttons: Btn.Fire } }, 6 * 29 + 1);
    expect(sim.me.akMag).toBe(0);
    const ev = tick(sim, { 1: { buttons: Btn.Fire } }, 2);
    expect(ev.some((e) => e.type === 'gunReload')).toBe(true);
    expect(sim.me.gunReload).toBeGreaterThan(0);
    const during = tick(sim, { 1: { buttons: Btn.Fire } }, Math.round(c.akReloadSec * 60) - 5);
    expect(during.some((e) => e.type === 'gunFire')).toBe(false);
    tick(sim, {}, 10);
    expect(sim.me.akMag).toBe(30);
    expect(sim.me.akReserve).toBe(60);
    // two shots, then R tops the magazine up from the reserve
    tick(sim, { 1: { buttons: Btn.Fire } }, 7);
    expect(sim.me.akMag).toBe(28);
    tick(sim, {}, 30);
    tick(sim, { 1: { buttons: Btn.Recall } }, 1);
    tick(sim, {}, Math.round(c.akReloadSec * 60) + 1);
    expect(sim.me.akMag).toBe(30);
    expect(sim.me.akReserve).toBe(58);
  });
});

describe('spray pattern and inaccuracy', () => {
  /** A CS sim with every random part of the cone switched off: shots follow the pattern. */
  const noCone = (c: GameConfig) => {
    c.combat.akSpreadMrad = 0;
    c.combat.akStandMrad = 0;
    c.combat.akFireMrad = 0;
  };

  it('a spray follows the AK pattern (applied to the bullets), and recovers when you stop', () => {
    const sim = csSim(60, noCone);
    alone(sim);
    const view = sim.me.view;
    const shots = tick(sim, { 1: { buttons: Btn.Fire, view } }, 6 * 30).filter(
      (e): e is Extract<SimEvent, { type: 'gunFire' }> => e.type === 'gunFire',
    );
    expect(shots.length).toBe(30);
    shots.forEach((s, i) => {
      const [up, right] = offsetDeg(view, normalize(sub(s.to, s.from)));
      expect(up, `shot ${i + 1} pitch`).toBeCloseTo(AK_PATTERN[i][0], 4);
      expect(right, `shot ${i + 1} yaw`).toBeCloseTo(AK_PATTERN[i][1], 4);
    });
    // the first ~9 shots climb almost straight up, then it swings left, then right
    expect(AK_PATTERN[9][0]).toBeGreaterThan(5);
    expect(Math.min(...AK_PATTERN.slice(10, 18).map((p) => p[1]))).toBeLessThan(-1.5);
    expect(Math.max(...AK_PATTERN.slice(18, 26).map((p) => p[1]))).toBeGreaterThan(1.5);
    // reload, then a 3-shot burst and a pause: the spray index slides back to the start
    tick(sim, { 1: { buttons: Btn.Recall } }, 1);
    tick(sim, {}, 160);
    tick(sim, { 1: { buttons: Btn.Fire, view } }, 13);
    expect(sim.me.gunSpray).toBe(3);
    tick(sim, { 1: { view } }, 6 + Math.round(sim.config.combat.akSprayRecoverSec * 60));
    expect(sim.me.gunSpray).toBeLessThan(0.35);
    tick(sim, { 1: { view } }, 30);
    expect(sim.me.gunSpray).toBe(0);
    const next = tick(sim, { 1: { buttons: Btn.Fire, view } }, 1).find((e) => e.type === 'gunFire');
    const [up] = offsetDeg(view, normalize(sub(next!.to, next!.from)));
    expect(up).toBeCloseTo(0, 6); // the first shot of a new burst goes where you aim
  });

  it('standing is accurate, running is not, airborne is terrible; crouching is best', () => {
    const sim = csSim(60);
    const p = sim.me;
    const c = sim.config.combat;
    const m = sim.config.movement;
    /** mean angle (deg) of the first shot from the crosshair over many ticks */
    const meanErr = (setup: (q: PlayerState) => void): number => {
      const q: PlayerState = JSON.parse(JSON.stringify(p));
      q.gunPenalty = 0; // fully recovered: only the stance base counts
      setup(q);
      let sum = 0;
      for (let t = 0; t < 400; t++) {
        const [up, right] = offsetDeg(q.view, shotDirection(q, sim.ctx, 1000 + t));
        sum += Math.hypot(up, right);
      }
      return sum / 400;
    };
    const still = meanErr(() => {});
    const crouched = meanErr((q) => (q.crouched = true));
    const walking = meanErr((q) => (q.vel = v3(m.sprintSpeed * 0.3, 0, 0))); // counter-strafed
    const running = meanErr((q) => (q.vel = v3(0, 0, -m.sprintSpeed)));
    const air = meanErr((q) => {
      q.grounded = false;
      q.vel = v3(0, 3, -m.sprintSpeed);
    });
    // CS2 AK: standing ~0.4° cone (mean offset about half of it)
    expect(still).toBeGreaterThan(0.1);
    expect(still).toBeLessThan(0.3);
    expect(crouched).toBeLessThan(still);
    expect(walking).toBeCloseTo(still, 6); // under 34 % of max speed: as good as standing
    expect(running).toBeGreaterThan(3);
    expect(air).toBeGreaterThan(running);
    expect(
      gunConeDeg({ ...p, grounded: false, vel: v3(0, 0, -m.sprintSpeed) }, sim.ctx),
    ).toBeGreaterThan(15);
    expect(
      gunConeDeg({ ...p, grounded: false, vel: v3(0, 0, -m.sprintSpeed) }, sim.ctx),
    ).toBeLessThan(25);
    expect(c.akStandMrad + c.akSpreadMrad).toBeLessThan(10);
  });

  it('firing and landing add inaccuracy that recovers', () => {
    const sim = csSim(60);
    alone(sim);
    const cone0 = gunConeDeg(sim.me, sim.ctx);
    tick(sim, { 1: { buttons: Btn.Fire } }, 25);
    const hot = gunConeDeg(sim.me, sim.ctx);
    expect(hot).toBeGreaterThan(cone0 * 2);
    tick(sim, {}, 60);
    expect(gunConeDeg(sim.me, sim.ctx)).toBeLessThan(cone0 * 1.1);
    // jump: terrible in the air; just after landing still worse than standing; then fine
    tick(sim, { 1: { buttons: Btn.Jump } }, 1);
    tick(sim, {}, 5);
    expect(gunConeDeg(sim.me, sim.ctx)).toBeGreaterThan(7);
    let landed = false;
    for (let i = 0; i < 120 && !landed; i++)
      landed = tick(sim).some((e) => e.type === 'land' && e.player === 1);
    expect(landed).toBe(true);
    expect(gunConeDeg(sim.me, sim.ctx)).toBeGreaterThan(cone0 * 2);
    tick(sim, {}, 90);
    expect(gunConeDeg(sim.me, sim.ctx)).toBeLessThan(cone0 * 1.1);
  });
});

describe('determinism', () => {
  it('the shot randomness is a pure hash of (player, tick, shot)', () => {
    expect(gunRandom(3, 1200, 5, 1)).toBe(gunRandom(3, 1200, 5, 1));
    const vals = new Set<number>();
    for (let t = 0; t < 1000; t++) vals.add(gunRandom(1, t, 0, 0));
    expect(vals.size).toBe(1000);
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('same inputs give the same bullets and hits, whatever the world rng', () => {
    const play = (seed: number) => {
      const sim = csSim(12, undefined, seed);
      const out: string[] = [];
      for (let i = 0; i < 240; i++) {
        const view = lookAt(sim, sim.me, chestOf(hitboxOf(sim.foe, sim.config)));
        const ev = tick(sim, {
          1: { buttons: (i % 50 < 30 ? Btn.Fire : 0) | (i % 80 < 40 ? Btn.Left : Btn.Right), view },
          2: { buttons: i % 60 < 30 ? Btn.Left : Btn.Right },
        });
        for (const e of ev)
          if (e.type === 'gunFire') out.push(`${e.gun}:${e.hit}:${e.to.x},${e.to.y},${e.to.z}`);
      }
      return { out, hp: sim.foe.hp, alive: sim.foe.alive };
    };
    const a = play(1);
    const b = play(1);
    const c = play(987654); // a different world rng stream: bullets don't use it
    expect(a.out.length).toBeGreaterThan(10);
    expect(b).toEqual(a);
    expect(c.out).toEqual(a.out);
    expect(a.out.some((s) => !s.includes(':-1:'))).toBe(true);
  });
});
