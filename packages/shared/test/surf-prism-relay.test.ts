// Prism Relay (surf map I04, level/maps/surf-prism-relay.ts): what the shared surf-map tests
// (surf-maps.test.ts) can't see — the brief's critical test for its ten portals: speed magnitude
// kept through every portal, direction turned exactly by the portal's turn, the crossing point
// kept (offset portals) — at the middle, near the edges and corners, 15° off square, at 25, 38,
// 48 and 50 m/s, flat, falling and rising; a centre outside the opening never teleports; nothing
// bounces straight back (standing on an exit or reversing out of it triggers nothing). And the
// portal pairs are told apart: every portal has its own mark, and each group its own colour.
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  buildLevel,
  createPlayer,
  createWorld,
  defaultConfig,
  mapDef,
  prismRelayCourse,
  rotateAxis,
  TICK_DT,
  v3,
  type SimContext,
  type Vec3,
} from '../src/index';
import { run, type Sim } from './helpers';

const def = mapDef('surf-prism-relay');
// (the level is built once: every flight below starts a fresh world on it)
const config = defaultConfig();
const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
const makeSim = (_def: unknown, feet: Vec3, yawDeg: number): Sim => {
  const world = createWorld(ctx.level, 1);
  const p = addPlayer(world, createPlayer(1, 0, feet, yawDeg, config));
  return { ctx, world, p, config };
};
const data = prismRelayCourse();
const portals = def.portals ?? [];
const DEG = Math.PI / 180;

/** Heading (compass degrees) of a flat vector. */
const headingOf = (v: Vec3): number => (((Math.atan2(v.x, -v.z) / DEG) % 360) + 360) % 360;
const angleDiff = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

/**
 * Fly a player at the portal so that its body centre meets the trigger (1.5 m before the
 * opening's plane) `across` metres right of the opening's middle and `up` above it, moving
 * `speed` m/s `yaw` degrees off square with vertical speed `vy`, from 2.5 m before it; step
 * until something happens (at most 20 ticks).
 */
const flyAt = (i: number, across: number, up: number, speed: number, yaw: number, vy: number) => {
  const pt = portals[i];
  const dir = pt.dir!;
  const right = v3(-dir.z, 0, dir.x);
  const mid = v3((pt.min.x + pt.max.x) / 2, (pt.min.y + pt.max.y) / 2, (pt.min.z + pt.max.z) / 2);
  const d = rotateAxis(dir, v3(0, 1, 0), -yaw * DEG);
  const L = 2.5 / Math.cos(yaw * DEG);
  const t = L / speed;
  const meet = v3(
    mid.x - dir.x * 1.5 + right.x * across,
    mid.y + up,
    mid.z - dir.z * 1.5 + right.z * across,
  );
  const start = v3(meet.x - d.x * L, meet.y - (vy * t - 10 * t * t), meet.z - d.z * L);
  const sim = makeSim(def, v3(start.x, start.y - 0.9, start.z), 0);
  sim.p.pos = start;
  sim.p.vel = v3(d.x * speed, vy, d.z * speed);
  sim.p.grounded = false;
  let before = { ...sim.p.vel };
  let beforePos = { ...sim.p.pos };
  for (let t = 0; t < 20; t++) {
    before = { ...sim.p.vel };
    beforePos = { ...sim.p.pos };
    run(sim, 1);
    const ev = sim.world.events.filter((e) => e.type === 'portal');
    if (ev.length) return { sim, ev, before, beforePos, mid, right, dir };
  }
  return { sim, ev: [], before, beforePos, mid, right, dir };
};

describe('surf-prism-relay', () => {
  it('has its ten portals: nine momentum portals that keep your offset, one finish portal', () => {
    expect(portals.length).toBe(10);
    expect(portals.filter((p) => p.offset).length).toBe(9);
    // every turn is a quarter turn or none; nobody's vertical speed is dropped
    for (const p of portals) {
      expect([0, 90, -90]).toContain(p.turn ?? 0);
      expect(p.vertical ?? 'keep').toBe('keep');
    }
  });

  it('portal pairs are told apart: a mark per portal, a colour per group', () => {
    const marks = portals.map((p) => p.glyph);
    expect(marks.every((m) => !!m)).toBe(true);
    expect(new Set(marks).size).toBe(portals.length);
    // five groups (Input, Quarter, Spectrum, Relay, the finish) and the high spectrum portal:
    // six colours (the two portals seen together at the split never share one)
    expect(new Set(portals.map((p) => p.color)).size).toBe(6);
  });

  it('speed is kept and the direction turned exactly, at the edges, off square and fast', () => {
    for (let i = 0; i < portals.length; i++) {
      const pt = portals[i];
      const w = Math.abs(pt.dir!.x) > 0.5 ? pt.max.z - pt.min.z : pt.max.x - pt.min.x;
      const h = pt.max.y - pt.min.y;
      // (the body centre stays 1 m inside the opening: the capsule never meets a post)
      const ax = w / 2 - 1.4;
      const ay = h / 2 - 1.4;
      const spots: [number, number][] = [
        [0, 0],
        [ax, 0],
        [-ax, 0],
        [0, ay],
        [0, -ay],
        [ax, ay],
        [-ax, -ay],
      ];
      for (const [across, up] of spots)
        for (const speed of [25, 38, 48, 50])
          for (const yaw of [0, 15, -15])
            // (at 50 m/s only flat: the 50 m/s speed cap would trim a falling flight)
            for (const vy of speed < 50 ? [0, -12, 5] : [0]) {
              const r = flyAt(i, across, up, speed, yaw, vy);
              const tag = `${pt.name} (${pt.glyph}) at ${across.toFixed(1)}/${up.toFixed(1)}, ${speed} m/s, ${yaw}°, vy ${vy}`;
              expect(r.ev.length, tag).toBe(1);
              const v = r.sim.p.vel;
              // |v| flat kept, vertical speed only what one tick of gravity changed
              expect(Math.hypot(v.x, v.z), tag).toBeCloseTo(Math.hypot(r.before.x, r.before.z), 1);
              expect(v.y - r.before.y, tag).toBeLessThan(0.01);
              expect(v.y - r.before.y, tag).toBeGreaterThan(-0.4);
              // turned exactly by the portal's turn
              const want = headingOf(r.before) + (pt.turn ?? 0);
              expect(angleDiff(headingOf(v), want), tag).toBeLessThan(0.5);
              // offset portals: you come out as far off the exit as you went in off the middle
              if (pt.offset) {
                const from = r.ev[0].type === 'portal' ? r.ev[0].from : r.beforePos;
                const acrossIn = (from.x - r.mid.x) * r.right.x + (from.z - r.mid.z) * r.right.z;
                const upIn = from.y - r.mid.y;
                const outDir = rotateAxis(r.dir, v3(0, 1, 0), (-(pt.turn ?? 0) * Math.PI) / 180);
                const outRight = v3(-outDir.z, 0, outDir.x);
                const q = r.sim.p.pos;
                const acrossOut = (q.x - pt.exit.x) * outRight.x + (q.z - pt.exit.z) * outRight.z;
                expect(acrossOut, tag).toBeCloseTo(acrossIn, 0);
                // (one tick of flight after the teleport moves you at most ~1 m up or down)
                expect(Math.abs(q.y - pt.exit.y - upIn), tag).toBeLessThan(1.2);
              }
            }
    }
  });

  it('a centre outside the opening never teleports; nothing bounces straight back', () => {
    for (let i = 0; i < portals.length; i++) {
      const pt = portals[i];
      const w = Math.abs(pt.dir!.x) > 0.5 ? pt.max.z - pt.min.z : pt.max.x - pt.min.x;
      // just outside the opening's edge (the post stops you or you pass beside it)
      for (const across of [w / 2 + 0.3, -(w / 2 + 0.3)]) {
        const r = flyAt(i, across, 0, 31, 0, 0);
        expect(r.ev.length, `${pt.name} beside the opening`).toBe(0);
      }
      // standing on an exit (or just off it, at the offset corners): no portal for a second
      for (const [s, u] of [
        [0, 0],
        [4, 4],
        [-4, -4],
      ]) {
        const out = rotateAxis(pt.dir!, v3(0, 1, 0), (-(pt.turn ?? 0) * Math.PI) / 180);
        const side = v3(-out.z, 0, out.x);
        const at = v3(pt.exit.x + side.x * s, pt.exit.y + u - 0.95, pt.exit.z + side.z * s);
        const sim = makeSim(def, at, 0);
        sim.p.vel = v3(0, 0, 0);
        let fired = false;
        for (let t = 0; t < 60; t++) {
          run(sim, 1);
          if (sim.world.events.some((e) => e.type === 'portal')) fired = true;
        }
        expect(fired, `${pt.name}: its exit is clear of every portal`).toBe(false);
      }
      // coming out and braking straight back (holding S) never re-enters it
      const r = flyAt(i, 0, 0, 34, 0, 0);
      expect(r.ev.length).toBe(1);
      const back = r.sim.p.vel;
      r.sim.p.vel = v3(-back.x * 0.5, back.y, -back.z * 0.5);
      let again = false;
      for (let t = 0; t < 30; t++) {
        run(r.sim, 1);
        if (r.sim.world.events.some((e) => e.type === 'portal')) again = true;
      }
      expect(again, `${pt.name}: reversing out of its exit`).toBe(false);
    }
  });

  it('the high spectrum portal lives on an optional line; the long route is the racing line', () => {
    const high = data.route.filter((e) => e.t === 'portal' && e.alt);
    expect(high.length).toBe(1);
    expect(def.race!.forks!.some((f) => f.name === 'High spectrum')).toBe(true);
    // (the racing line flies eight momentum portals and the finish portal)
    expect(def.race!.line.filter((n) => n.portal).length).toBe(9);
  });
});
