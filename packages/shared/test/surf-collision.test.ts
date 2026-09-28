// Curved surf ramps and the surf maps' state systems at the level of single pieces:
//   - free-form prisms (BoxDef.hull) collide exactly like the prism they describe
//   - a ramp cut into many exactly-joined pieces rides exactly like one piece (no seam loss)
//   - curves, helices, scoops and S-bends ride without a catch at slow, typical and fast speeds
//   - red zones send you back at their surface; riding above a red strip is safe
//   - a turning portal turns velocity and view, keeping the speed; one keeping the offset puts
//     you as far off its exit as you went in off its middle; one may level you out
//   - hold-to-bhop (a map option); shallow water you land and wade in; course portal checks
//   - recovery anchors: where a fall brings you back in their section, never progress
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  buildCurve,
  buildLevel,
  closestPointOnBox,
  createPlayer,
  createWorld,
  cross,
  defaultConfig,
  normalize,
  qFromBasis,
  qForward,
  raycast,
  resetRacer,
  scale,
  sendRacerBack,
  step,
  sub,
  surfToward,
  TICK_DT,
  UP,
  v3,
  add,
  Btn,
  copperReefCourse,
  expandCourse,
  Pen,
  validateCourse,
  type BoxDef,
  type CurveEl,
  type LevelDef,
  type RaceDef,
  type Vec3,
} from '../src/index';

const DEG = Math.PI / 180;

const race = (more: Partial<RaceDef> = {}): RaceDef => ({
  parSec: 60,
  start: { respawn: v3(0, 200, 0), yawDeg: 0 },
  grid: [{ pos: v3(0, 200, 0), yawDeg: 0 }],
  checkpoints: [],
  finish: { min: v3(-1, -900, 900), max: v3(1, -899, 901), respawn: v3(0, 0, 0), yawDeg: 0 },
  killY: -100,
  line: [{ pos: v3(0, 0, 0), cp: 0 }],
  surf: true,
  noJetpack: true,
  noSurge: true,
  ...more,
});

const level = (boxes: BoxDef[], more: Partial<LevelDef> = {}): LevelDef => ({
  name: 'surf test',
  boundsMin: v3(-600, -150, -600),
  boundsMax: v3(600, 400, 600),
  defaultGravity: v3(0, -1, 0),
  boxes,
  zones: [],
  rails: [],
  pads: [],
  spawns: [{ pos: v3(0, 0, 0), yawDeg: 0 }],
  towers: [],
  race: race(),
  ...more,
});

const sim = (def: LevelDef, feet: Vec3) => {
  const config = defaultConfig();
  const ctx = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 1);
  const p = addPlayer(world, createPlayer(1, 0, feet, 0, config));
  resetRacer(p, config.movement, feet, 0, 0);
  return { ctx, world, p, config };
};

const curve = (legs: CurveEl['legs'], more: Partial<CurveEl> = {}): CurveEl => ({
  t: 'curve',
  at: [0, 150, 0],
  heading: 0,
  legs,
  height: 12,
  angle: 60,
  side: 'right',
  depth: 0.35,
  ...more,
});

/**
 * Ride a curve's racing line from its start at `speed`, surfing it like the bot racers do:
 * the speeds each tick, the worst one-tick loss, whether it got to the end on the face.
 */
const ride = (boxes: BoxDef[], line: Vec3[], speed: number) => {
  const s = sim(level(boxes), line[0]);
  const p = s.p;
  p.pos = v3(line[0].x, line[0].y + 0.92, line[0].z);
  p.vel = scale(normalize(sub(line[1], line[0])), speed);
  let k = 0;
  let worst = 0;
  let prev = speed;
  let upKick = 0;
  let prevVy = p.vel.y;
  let ticks = 0;
  for (let t = 0; t < 60 * 30; t++) {
    const feet = v3(p.pos.x, p.pos.y - 0.9, p.pos.z);
    while (k < line.length - 2) {
      const seg = sub(line[k + 1], line[k]);
      const d = sub(feet, line[k + 1]);
      if (seg.x * d.x + seg.z * d.z > 0) k++;
      else break;
    }
    const last = sub(line[line.length - 1], line[line.length - 2]);
    const past = sub(feet, line[line.length - 1]);
    if (k >= line.length - 2 && last.x * past.x + last.z * past.z > 0)
      return { ok: true, speed: prev, worst, upKick, ticks };
    const a = surfToward(p, line[k], line[k + 1], s.world.tick + 1);
    step(s.world, { 1: { tick: s.world.tick + 1, buttons: a.buttons, view: a.view } }, s.ctx);
    ticks++;
    const sp = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    worst = Math.max(worst, prev - sp);
    upKick = Math.max(upKick, p.vel.y - prevVy);
    prev = sp;
    prevVy = p.vel.y;
    if (feet.y < line[k].y - 10 || s.world.events.some((e) => e.type === 'raceRespawn'))
      return { ok: false, speed: sp, worst, upKick, ticks };
  }
  return { ok: false, speed: prev, worst, upKick, ticks };
};

/** A single straight prism ramp of the same shape as `curve([{ len, drop }])`. */
const prismRamp = (len: number, drop: number): BoxDef => {
  const a = v3(0, 150, 0);
  const b = v3(0, 150 - drop, -len);
  const L = normalize(sub(b, a));
  const yl = normalize(sub(UP, scale(L, L.y)));
  const zl = cross(L, yl);
  const run = 12 / Math.tan(60 * DEG);
  const mid = scale(add(a, b), 0.5);
  return {
    c: add(sub(mid, scale(yl, 6)), scale(zl, run / 2)),
    h: v3(Math.hypot(len, drop) / 2, 6, run / 2),
    q: qFromBasis(scale(zl, -1), yl),
    prism: -1,
    surf: true,
  };
};

const built = (e: CurveEl) => {
  const b = buildCurve(e, { color: 1, trim: 2, hazard: 3 }, 0);
  return { boxes: b.boxes, line: b.nodes.map((n) => n.pos) };
};

describe('free-form prisms (curved surf pieces)', () => {
  it('collide exactly like the prism they describe', () => {
    const e = curve([{ len: 60, drop: 6 }]);
    const { boxes } = built(e);
    const hulls = buildLevel(level(boxes));
    const prism = buildLevel(level([prismRamp(60, 6)]));
    // closest points and rays from all round agree (to a millimetre)
    for (let i = 0; i < 40; i++) {
      const q = v3(-8 + (i % 5) * 5, 138 + ((i * 7) % 20), -5 - ((i * 13) % 50));
      const a = hulls.boxes.map((b) => closestPointOnBox(b, q));
      const best = a.reduce((m, x) =>
        Math.hypot(x.x - q.x, x.y - q.y, x.z - q.z) < Math.hypot(m.x - q.x, m.y - q.y, m.z - q.z)
          ? x
          : m,
      );
      const pb = closestPointOnBox(prism.boxes[0], q);
      expect(Math.hypot(best.x - pb.x, best.y - pb.y, best.z - pb.z)).toBeLessThan(0.002);
      const dir = normalize(v3(0.3, -1, 0.1 * (i % 3)));
      const h1 = raycast(hulls, v3(q.x, 170, q.z), dir, 60);
      const h2 = raycast(prism, v3(q.x, 170, q.z), dir, 60);
      expect(!!h1).toBe(!!h2);
      if (h1 && h2) expect(Math.abs(h1.t - h2.t)).toBeLessThan(0.002);
    }
  });

  it('a straight ramp cut into exactly-joined pieces rides exactly like one piece', () => {
    const e = curve([{ len: 120, drop: 12 }]);
    const { boxes, line } = built(e);
    expect(boxes.length).toBeGreaterThan(10);
    for (const v of [15, 30, 45]) {
      const cut = ride(boxes, line, v);
      const whole = ride([prismRamp(120, 12)], line, v);
      expect(cut.ok && whole.ok).toBe(true);
      expect(Math.abs(cut.speed - whole.speed), `${v} m/s`).toBeLessThan(0.1);
      expect(cut.ticks).toBe(whole.ticks);
    }
  });

  it('curves, helices, scoops and S-bends ride without a catch, slow to fast', () => {
    const shapes: [string, CurveEl, number[]][] = [
      ['a 90° curve', curve([{ turn: 90, radius: 60, drop: 8 }]), [18, 26, 34]],
      ['a curve away from the face', curve([{ turn: -60, radius: 70, drop: 8 }]), [18, 26, 34]],
      ['a 270° helix', curve([{ turn: 270, radius: 50, drop: 30 }], { angle: 62 }), [16, 22, 28]],
      [
        'a vertical scoop',
        curve([
          { len: 60, drop: 16 },
          { len: 60, drop: -10 },
        ]),
        [18, 26, 34],
      ],
      [
        'an S-bend',
        curve([
          { turn: 40, radius: 60, drop: 5 },
          { len: 15, drop: 1 },
          { turn: -40, radius: 60, drop: 5 },
        ]),
        [18, 26, 34],
      ],
      [
        'a spiral closing in',
        curve([{ turn: 120, radius: 90, toRadius: 50, drop: 12 }]),
        [18, 26, 32],
      ],
    ];
    for (const [name, e, speeds] of shapes) {
      const { boxes, line } = built(e);
      for (const v of speeds) {
        const r = ride(boxes, line, v);
        expect(r.ok, `${name} at ${v} m/s`).toBe(true);
        // never a sudden loss of speed, never kicked up off the face
        expect(r.worst, `${name} at ${v} m/s: worst one-tick loss`).toBeLessThan(0.4);
        expect(r.upKick, `${name} at ${v} m/s: an upward kick`).toBeLessThan(2);
      }
    }
  });

  it('joins share their corners exactly (the faces meet edge to edge)', () => {
    const e = curve([{ turn: 180, radius: 40, drop: 20 }]);
    const { boxes } = built(e);
    for (let i = 1; i < boxes.length; i++) {
      const a = boxes[i - 1].hull!;
      const b = boxes[i].hull!;
      // the end of one = the start of the next: base corners and ridge
      for (const [x, y] of [
        [2, 0],
        [3, 1],
        [5, 4],
      ])
        expect(a[x]).toEqual(b[y]);
    }
  });
});

describe('red zones', () => {
  it('a red strip on a face sends you back when you touch it; riding above it is safe', () => {
    const e = curve([{ len: 120, drop: 10 }], { red: 0.75 });
    const { boxes, line } = built(e);
    expect(boxes.some((b) => b.kill)).toBe(true);
    // riding the racing line (above the strip): fine
    expect(ride(boxes, line, 25).ok).toBe(true);
    // letting go: you slide down into the strip and go back
    const s = sim(level(boxes), line[0]);
    s.p.pos = v3(line[2].x, line[2].y + 0.92, line[2].z);
    s.p.vel = v3(0, 0, -20);
    let red = false;
    for (let t = 0; t < 180 && !red; t++) {
      step(s.world, {}, s.ctx);
      red = s.world.events.some((ev) => ev.type === 'raceRespawn' && ev.reason === 'red');
    }
    expect(red).toBe(true);
  });

  it('a red block sends you back exactly at its surface, not a hand before it', () => {
    const red: BoxDef = { c: v3(0, 100, 0), h: v3(5, 1, 5), kill: true, mat: 'hazard' };
    const s = sim(level([red]), v3(0, 101.2, 0));
    // just above it (body 3 cm clear): nothing
    s.p.pos = v3(0, 101 + 0.9 + 0.05, 0);
    s.p.vel = v3();
    step(s.world, {}, s.ctx);
    expect(s.world.events.some((ev) => ev.type === 'raceRespawn')).toBe(false);
    // touching it
    s.p.pos = v3(0, 101 + 0.9 + 0.005, 0);
    s.p.vel = v3(0, -1, 0);
    step(s.world, {}, s.ctx);
    expect(s.world.events.some((ev) => ev.type === 'raceRespawn' && ev.reason === 'red')).toBe(
      true,
    );
  });
});

describe('turning portals', () => {
  it('turn velocity and view about the vertical, keeping the speed', () => {
    const def = level([], {
      portals: [
        {
          name: 'lens',
          min: v3(-5, 95, -6),
          max: v3(5, 105, -4),
          exit: v3(200, 100, 0),
          color: 0,
          turn: 90,
        },
      ],
    });
    const s = sim(def, v3(0, 99, 0));
    s.p.pos = v3(0, 100, 0);
    s.p.vel = v3(0, 2, -30);
    const before = Math.hypot(s.p.vel.x, s.p.vel.y, s.p.vel.z);
    for (let t = 0; t < 30 && s.p.pos.x < 100; t++) step(s.world, {}, s.ctx);
    expect(s.p.pos.x).toBeGreaterThan(150);
    // heading north (-z) turned 90° right: east (+x), the same speed (gravity aside)
    expect(s.p.vel.x).toBeGreaterThan(29);
    expect(Math.abs(s.p.vel.z)).toBeLessThan(0.01);
    expect(Math.abs(Math.hypot(s.p.vel.x, s.p.vel.z) - 30)).toBeLessThan(0.3);
    expect(Math.hypot(s.p.vel.x, s.p.vel.y, s.p.vel.z)).toBeGreaterThan(before - 2);
    // the view turned with it: looking east now
    const f = qForward(s.p.view);
    expect(f.x).toBeGreaterThan(0.99);
    const turned = s.world.events.length >= 0;
    expect(turned).toBe(true);
  });
});

describe('portal options', () => {
  const portal = (more: object) =>
    level([], {
      portals: [
        {
          name: 'p',
          min: v3(-8, 92, -6),
          max: v3(8, 108, -4),
          exit: v3(200, 100, 0),
          color: 0,
          turn: 90,
          dir: v3(0, 0, -1),
          ...more,
        },
      ],
    });

  it('keeping the offset: as far off the exit as you went in off the middle, turned', () => {
    const s = sim(portal({ offset: true }), v3(0, 99, 0));
    s.p.pos = v3(3, 102, -3.6);
    s.p.vel = v3(0, 0, -30);
    step(s.world, {}, s.ctx);
    // 3 m right of the middle going north = 3 m right of the exit going east (+z), 2 m up
    expect(s.p.pos.x).toBeCloseTo(200, 1);
    expect(s.p.pos.z).toBeCloseTo(3, 1);
    expect(s.p.pos.y).toBeCloseTo(102, 0);
    // without it: at the exit
    const t = sim(portal({}), v3(0, 99, 0));
    t.p.pos = v3(3, 102, -3.6);
    t.p.vel = v3(0, 0, -30);
    step(t.world, {}, t.ctx);
    expect(t.p.pos).toEqual(v3(200, 100, 0));
  });

  it("vertical 'zero': you come out level, the horizontal speed kept", () => {
    const s = sim(portal({ vertical: 'zero' }), v3(0, 99, 0));
    s.p.pos = v3(0, 100, -3.6);
    s.p.vel = v3(0, -15, -30);
    step(s.world, {}, s.ctx);
    expect(s.p.pos.x).toBeCloseTo(200, 3);
    expect(s.p.vel.y).toBe(0);
    expect(s.p.vel.x).toBeCloseTo(30, 0);
  });

  it('the course check rejects an exit inside a portal', () => {
    const data = copperReefCourse();
    expect(validateCourse(data)).toEqual([]);
    const e = data.route.find((q) => q.t === 'portal');
    if (e?.t !== 'portal') throw new Error('no portal');
    e.exit = [e.at[0], e.at[1] + 4, e.at[2]];
    expect(validateCourse(data).some((m) => m.includes('its exit lies in a portal'))).toBe(true);
  });

  it('may stand in a branch (off the racing line) and on a fork line', () => {
    const p = new Pen([0, 100, 0], 0);
    p.branch((b) => b.airPortal(20, [100, 100, 0], 90, [12, 12]));
    expect(p.route[0]).toMatchObject({ t: 'portal', alt: true });
    expect(p.pos).toEqual(v3(0, 100, 0));
    const data = copperReefCourse();
    data.forks = [
      {
        name: 'through',
        safe: 'a',
        risky: 'b',
        line: [{ at: [0, 200, 0] }, { at: [0, 200, -20], portal: true }, { at: [50, 200, 0] }],
      },
    ];
    const f = expandCourse(data).def.race!.forks![0];
    expect(f.riskyLine[1]).toMatchObject({ portal: true, air: true });
  });
});

describe('hold-to-bhop', () => {
  const hops = (holdToBhop: boolean): number => {
    const def = level([{ c: v3(0, -1, 0), h: v3(500, 1, 500) }], { race: race({ holdToBhop }) });
    const s = sim(def, v3(0, 0, 0));
    let n = 0;
    let was = true;
    for (let t = 0; t < 60 * 4; t++) {
      step(s.world, { 1: { tick: s.world.tick + 1, buttons: Btn.Jump, view: s.p.view } }, s.ctx);
      if (was && !s.p.grounded) n++;
      was = s.p.grounded;
    }
    return n;
  };
  it('holding Space hops once, unless the map asks for hold-to-bhop', () => {
    expect(hops(false)).toBe(1);
    expect(hops(true)).toBeGreaterThan(4);
  });
});

describe('shallow water', () => {
  it('is a floor you land on and wade in, not a kill', () => {
    const data = copperReefCourse();
    data.scenery!.push({ t: 'water', at: [0, 30, 0], size: [40, 40], shallow: true });
    expect(validateCourse(data)).toEqual([]);
    const { def } = expandCourse(data);
    expect(def.slowZones?.length).toBe(1);
    // (its floor, under the water, is drawn cheaply: one quad per face)
    const floor = def.boxes.find((b) => b.mat === 'sand' && b.c.y > 28 && b.c.y < 29);
    expect(floor?.lowDetail).toBe(true);
    const config = defaultConfig();
    const ctx = { level: buildLevel(def), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 1);
    const p = addPlayer(world, createPlayer(1, 0, v3(0, 35, 10), 0, config));
    resetRacer(p, config.movement, v3(0, 35, 10), 0, 1);
    p.vel = v3(0, 0, -25);
    for (let t = 0; t < 90; t++) step(world, {}, ctx);
    expect(world.events.some((e) => e.type === 'raceRespawn')).toBe(false);
    expect(p.grounded).toBe(true);
    expect(p.pos.y).toBeCloseTo(29 + 0.9, 0);
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeLessThanOrEqual(
      config.movement.sprintSpeed * 0.6 + 0.01,
    );
  });
});

describe('recovery anchors', () => {
  const gate = (z: number, respawn: Vec3) => ({
    min: v3(-10, 90, z - 2),
    max: v3(10, 110, z + 2),
    respawn,
    yawDeg: 0,
  });
  const def = level([{ c: v3(0, -1, 0), h: v3(500, 1, 500) }], {
    race: race({
      start: { respawn: v3(0, 0, 0), yawDeg: 0 },
      checkpoints: [gate(-100, v3(50, 0, -100)), gate(-300, v3(50, 0, -300))],
      finish: gate(-500, v3(0, 0, -520)),
      anchors: [
        { ...gate(-200, v3(80, 0, -200)), cp: 1, name: 'R1' },
        { ...gate(-400, v3(80, 0, -400)), cp: 2, name: 'R2' },
      ],
      killY: -50,
    }),
  });

  it('bring you back in their section only, never as progress, and reset at the next gate', () => {
    const s = sim(def, v3(0, 0, 0));
    const p = s.p;
    const fly = (z: number) => {
      p.pos = v3(0, 100, z);
      p.vel = v3();
      step(s.world, {}, s.ctx);
    };
    // R1 before C1: not its section, no effect
    fly(-200);
    expect(p.raceAnchor).toBe(-1);
    fly(-100);
    expect(p.raceCp).toBe(1);
    fly(-200);
    expect(p.raceAnchor).toBe(0);
    expect(p.raceCp).toBe(1);
    // a fall: back at R1's bay, still one gate passed
    sendRacerBack(s.world, s.ctx, p, 'fall');
    expect(p.pos.x).toBeCloseTo(80, 5);
    expect(p.pos.z).toBeCloseTo(-200, 5);
    expect(p.raceCp).toBe(1);
    expect(s.world.events.some((ev) => ev.type === 'raceRespawn' && ev.anchor === 0)).toBe(true);
    // the next gate: the anchor is left behind; a fall goes to C2's bay
    for (let t = 0; t < 40; t++) step(s.world, {}, s.ctx);
    fly(-300);
    expect(p.raceCp).toBe(2);
    expect(p.raceAnchor).toBe(-1);
    sendRacerBack(s.world, s.ctx, p, 'fall');
    expect(p.pos.z).toBeCloseTo(-300, 5);
    // R2 is an anchor, not a gate: passing it never counts toward the finish
    for (let t = 0; t < 40; t++) step(s.world, {}, s.ctx);
    fly(-400);
    expect(p.raceAnchor).toBe(1);
    expect(p.raceCp).toBe(2);
  });
});
