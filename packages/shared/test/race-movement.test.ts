// Race movement (race tracks and surf maps only): Source-style air-strafing, bunny hops that
// gain speed, surf ramps (triangular prisms you slide along, never ground), and what races
// switch off (gravity boots; jetpack and SURGE on surf maps). Combat maps keep their movement.
import { describe, expect, it } from 'vitest';
import {
  Btn,
  buildLevel,
  capsuleContacts,
  closestPointOnBox,
  hashWorld,
  qFromAxisAngle,
  raycast,
  resetRacer,
  strafeToward,
  v3,
  type BoxDef,
  type LevelDef,
  type RaceDef,
} from '../src/index';
import { flatLevel, makeSim, run, settle, view, planarSpeed, type Sim } from './helpers';

const DEG = Math.PI / 180;

/** A minimal race track around a test level (so race movement applies). */
const raceDef = (more: Partial<RaceDef> = {}): RaceDef => {
  const gate = { min: v3(-1, -1, 200), max: v3(1, 1, 202), respawn: v3(0, 0, 0), yawDeg: 0 };
  return {
    parSec: 60,
    start: { respawn: v3(0, 0, 0), yawDeg: 0 },
    grid: [{ pos: v3(0, 0, 0), yawDeg: 0 }],
    checkpoints: [],
    finish: gate,
    killY: -15,
    line: [{ pos: v3(0, 0, 0), cp: 0 }],
    ...more,
  };
};

const raceLevel = (extra: BoxDef[] = [], race: Partial<RaceDef> = {}): LevelDef => ({
  ...flatLevel(extra),
  boundsMin: v3(-300, -20, -300),
  boundsMax: v3(300, 120, 300),
  boxes: [{ c: v3(0, -0.5, 0), h: v3(300, 0.5, 300) }, ...extra],
  race: raceDef(race),
});

/** Racing (gates count, SURGE works) from where the player stands. */
const racing = (sim: Sim): void => {
  const p = sim.p;
  resetRacer(p, sim.config.movement, v3(p.pos.x, p.pos.y - 0.9, p.pos.z), 0, 0);
  p.frozen = false;
  p.racePenalty = 0;
};

/** Sprint forward (yaw 0 = -z) until up to speed. */
const sprint = (sim: Sim): void => {
  settle(sim);
  run(sim, 90, Btn.Forward, view(0));
};

/**
 * A bunny-hop chain: jump on the first ground tick of every landing (the press lands inside the
 * jump buffer) and, in the air, either strafe perfectly toward -z (the strafer) or hold W only.
 * Returns the planar speed after `hops` landings.
 */
const hopChain = (sim: Sim, hops: number, how: 'strafe' | 'w' | 'late'): number => {
  const p = sim.p;
  let landings = 0;
  let wasAir = false;
  let late = 0;
  for (let t = 0; t < 60 * 60 && landings < hops; t++) {
    const tick = sim.world.tick + 1;
    let buttons: number;
    let vq = view(0);
    if (p.grounded) {
      if (wasAir) landings++;
      wasAir = false;
      // late: stand one extra tick on the ground each landing
      if (how === 'late' && late++ < 2) buttons = Btn.Forward;
      else {
        buttons = Btn.Forward | (p.prevButtons & Btn.Jump ? 0 : Btn.Jump);
        late = 0;
      }
    } else {
      wasAir = true;
      if (how === 'w') buttons = Btn.Forward;
      else {
        const s = strafeToward(p, v3(0, 0, -1), tick);
        buttons = s.buttons;
        vq = s.view;
      }
      // scroll-wheel style: tap Space on the way down (buffered to the landing tick); never
      // during the late run
      if (how !== 'late' && p.vel.y < -2 && tick % 2 === 0) buttons |= Btn.Jump;
    }
    run(sim, 1, buttons, vq);
  }
  return planarSpeed(p);
};

describe('race air-strafing and bunny hops', () => {
  it('race tracks run faster than combat maps', () => {
    const sim = makeSim(raceLevel());
    sprint(sim);
    expect(planarSpeed(sim.p)).toBeCloseTo(sim.config.movement.raceSprintSpeed, 1);
    const combat = makeSim(flatLevel());
    sprint(combat);
    expect(planarSpeed(combat.p)).toBeCloseTo(combat.config.movement.sprintSpeed, 1);
  });

  it('strafing while turning the mouse the same way gains speed; W alone or no turn does not', () => {
    const jumpThen = (buttons: number, turnDegPerTick: number): number => {
      const sim = makeSim(raceLevel());
      sprint(sim);
      run(sim, 1, Btn.Forward | Btn.Jump, view(0));
      const s0 = planarSpeed(sim.p);
      for (let i = 0; i < 30; i++) run(sim, 1, buttons, view(-turnDegPerTick * (i + 1)));
      return planarSpeed(sim.p) - s0;
    };
    // D + turning right at the strafe rate: speed builds
    expect(jumpThen(Btn.Right, 4.5)).toBeGreaterThan(0.8);
    // D without turning: the path bends, hardly any speed
    expect(jumpThen(Btn.Right, 0)).toBeLessThan(0.1);
    // W only: nothing
    expect(Math.abs(jumpThen(Btn.Forward, 0))).toBeLessThan(0.01);
  });

  it('a perfect 10-hop strafe chain from a sprint ends far past sprint speed', () => {
    const sim = makeSim(raceLevel());
    sprint(sim);
    const m = sim.config.movement;
    const end = hopChain(sim, 10, 'strafe');
    expect(end).toBeGreaterThan(m.raceSprintSpeed * 1.6);
    expect(end).toBeLessThanOrEqual(m.raceAirSoftCap + 0.01);
  });

  it('hopping with W only stays at sprint speed', () => {
    const sim = makeSim(raceLevel());
    sprint(sim);
    const end = hopChain(sim, 10, 'w');
    expect(end).toBeLessThanOrEqual(sim.config.movement.raceSprintSpeed + 0.05);
    expect(end).toBeGreaterThan(sim.config.movement.raceSprintSpeed - 0.5);
  });

  it('a jump on landing, a little late or pressed a little early keeps all the speed', () => {
    /** Hop at 22 m/s, fall back holding nothing; `late` ticks after landing, or `early` ticks
     * before it (a single tap, buffered), press jump. Returns the speed after that jump. */
    const fast = (late: number, early = 0): number => {
      const sim = makeSim(raceLevel());
      settle(sim);
      sim.p.vel = v3(0, 0, -22);
      run(sim, 1, Btn.Jump, view(0));
      // how long the fall takes, measured on a twin with the same inputs
      const twin = makeSim(raceLevel());
      settle(twin);
      twin.p.vel = v3(0, 0, -22);
      run(twin, 1, Btn.Jump, view(0));
      let fall = 0;
      while (!twin.p.grounded && fall++ < 200) run(twin, 1, 0, view(0));
      for (let t = 0; t < fall; t++)
        run(sim, 1, early && t === fall - early ? Btn.Jump : 0, view(0));
      if (early) {
        run(sim, 1, 0, view(0)); // the buffered jump fires on the first ground tick
        expect(sim.p.grounded, 'the early tap jumped').toBe(false);
        expect(sim.p.vel.y).toBeGreaterThan(3);
        return planarSpeed(sim.p);
      }
      if (late) run(sim, late, 0, view(0));
      run(sim, 1, Btn.Jump, view(0));
      return planarSpeed(sim.p);
    };
    const m = makeSim(raceLevel()).config.movement;
    expect(fast(0)).toBeGreaterThan(21.9);
    // up to raceLandGraceSec late: no friction yet, nothing lost
    expect(fast(Math.round(m.raceLandGraceSec * 60) - 2)).toBeGreaterThan(21.9);
    // tapped 0.13 s before landing: remembered, fires on landing
    const early = fast(0, 8);
    expect(early).toBeGreaterThan(21.9);
    // hesitating a fifth of a second on the ground still costs speed
    expect(fast(12)).toBeLessThan(19);
  });

  it('strafing can not push speed past the race cap', () => {
    const sim = makeSim(raceLevel());
    settle(sim);
    const m = sim.config.movement;
    sim.p.vel = v3(0, 0, -(m.raceAirSoftCap - 0.2));
    run(sim, 1, Btn.Jump, view(0));
    for (let t = 0; t < 40; t++) {
      const s = strafeToward(sim.p, v3(0, 0, -1), sim.world.tick + 1);
      run(sim, 1, s.buttons, s.view);
    }
    expect(planarSpeed(sim.p)).toBeLessThanOrEqual(m.raceAirSoftCap + 0.01);
  });

  it('combat maps keep their air soft cap (the race rules are off)', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    sim.p.vel = v3(0, 0, -12);
    run(sim, 1, Btn.Jump, view(0));
    for (let t = 0; t < 30; t++) {
      const s = strafeToward(sim.p, v3(0, 0, -1), sim.world.tick + 1);
      run(sim, 1, s.buttons, s.view);
    }
    expect(planarSpeed(sim.p)).toBeLessThanOrEqual(sim.config.movement.airSoftCap + 0.01);
  });
});

/**
 * A surf ramp: an A-frame prism running north–south (length along z), `angle` degrees from
 * the horizontal on both faces, its ridge `top` metres up.
 */
const ramp = (
  x: number,
  z: number,
  lenZ: number,
  angle: number,
  top: number,
  bottom = 8,
): BoxDef => {
  const h = top - bottom;
  const half = h / Math.tan(angle * DEG);
  // local x = the ramp's length (world z), local z = across (world x), local y = up
  return {
    c: v3(x, bottom + h / 2, z),
    h: v3(lenZ / 2, h / 2, half),
    q: qFromAxisAngle(v3(0, 1, 0), 90 * DEG),
    prism: 0,
    surf: true,
    mat: 'rock',
  };
};

describe('surf ramps', () => {
  it('collide as a prism: the slanted face, not the bounding box', () => {
    const r = ramp(0, 0, 40, 60, 28);
    const level = buildLevel(raceLevel([r]));
    const box = level.boxes[1];
    // straight down onto the ridge line: hit at the top
    const top = raycast(level, v3(0, 40, 0), v3(0, -1, 0), 50);
    expect(top!.point.y).toBeCloseTo(28, 3);
    // straight down 6 m out from the ridge: hit on the face, well below the box's top
    const face = raycast(level, v3(6, 40, 0), v3(0, -1, 0), 50);
    expect(face!.point.y).toBeCloseTo(28 - 6 * Math.tan(60 * DEG), 2);
    expect(face!.normal.x).toBeCloseTo(Math.sin(60 * DEG), 3);
    expect(face!.normal.y).toBeCloseTo(Math.cos(60 * DEG), 3);
    // a body in the box's empty top corner touches nothing
    const corner = { center: v3(9, 26, 0), up: v3(0, 1, 0), halfSeg: 0.5, radius: 0.4 };
    expect(capsuleContacts(level, corner)).toHaveLength(0);
    // the closest point to a point off the face is on the face
    const q = closestPointOnBox(box, v3(10, 20, 3));
    expect(q.y).toBeCloseTo(28 - q.x * Math.tan(60 * DEG), 3);
  });

  /** Drop a racer onto the east face of a 60° ramp moving north at `speed`. */
  const onRamp = (speed: number) => {
    const sim = makeSim(raceLevel([ramp(0, 0, 200, 60, 48)]), v3(5, 40, 90));
    racing(sim);
    sim.p.pos = v3(4.2, 41.7, 90);
    sim.p.vel = v3(0, 0, -speed);
    return sim;
  };

  it('strafing into the ramp keeps you on it, never grounded, gaining speed down it', () => {
    const sim = onRamp(18);
    let grounded = 0;
    let minY = Infinity;
    let touches = 0;
    const face = (p: { x: number; y: number }) => 48 - p.x * Math.tan(60 * DEG);
    for (let t = 0; t < 60 * 10 && sim.p.pos.z > -90; t++) {
      // aim along a line slowly descending the face: the strafer presses toward the ramp
      const want = v3(2 + (90 - sim.p.pos.z) * 0.05 - sim.p.pos.x, 0, -8);
      const s = strafeToward(sim.p, want, sim.world.tick + 1);
      run(sim, 1, s.buttons, s.view);
      if (sim.p.grounded) grounded++;
      minY = Math.min(minY, sim.p.pos.y);
      if (Math.abs(sim.p.pos.y - 0.9 - face(sim.p.pos)) < 0.6) touches++;
    }
    expect(sim.p.pos.z).toBeLessThan(-90); // rode the whole 180 m
    expect(grounded).toBe(0);
    expect(minY).toBeGreaterThan(15); // still on the ramp, far above its foot
    expect(touches).toBeGreaterThan(100);
    // (about 9 m of height lost: speed gained from it)
    expect(planarSpeed(sim.p)).toBeGreaterThan(22);
  });

  it('letting go slides you off the ramp', () => {
    const sim = onRamp(18);
    run(sim, 60 * 3, 0, view(0));
    expect(sim.p.pos.y).toBeLessThan(10);
    expect(sim.p.pos.x).toBeGreaterThan(20);
  });

  it('velocity is clipped along the face: landing on it keeps the speed', () => {
    const sim = makeSim(raceLevel([ramp(0, 0, 200, 60, 48)]), v3(5, 40, 90));
    racing(sim);
    // fall onto the east face moving north and west (into it)
    sim.p.pos = v3(6, 40, 60);
    sim.p.vel = v3(-6, -8, -20);
    const before = Math.hypot(sim.p.vel.x, sim.p.vel.y, sim.p.vel.z);
    run(sim, 12, 0, view(0));
    // pressed against the face: nothing left going into it, most of the speed kept along it
    const n = v3(Math.sin(60 * DEG), Math.cos(60 * DEG), 0);
    const vn = sim.p.vel.x * n.x + sim.p.vel.y * n.y;
    expect(vn).toBeGreaterThan(-0.05);
    expect(Math.hypot(sim.p.vel.x, sim.p.vel.y, sim.p.vel.z)).toBeGreaterThan(before * 0.75);
    expect(sim.p.grounded).toBe(false);
  });

  it('you can not wall-jump off a surf ramp', () => {
    const sim = onRamp(12);
    run(sim, 10, Btn.Left, view(0));
    const events: string[] = [];
    run(sim, 1, Btn.Left | Btn.Jump, view(0));
    for (const e of sim.world.events) events.push(e.type);
    expect(events).not.toContain('wallJump');
  });
});

describe('what races switch off', () => {
  it('the gravity boots (F) never switch on on a race track', () => {
    const wall: BoxDef = { c: v3(1.6, 3, 0), h: v3(0.5, 3, 5) };
    const sim = makeSim(raceLevel([wall]));
    settle(sim);
    run(sim, 1, Btn.MagBoots);
    run(sim, 5, 0);
    expect(sim.p.mag).toBeNull();
    // (the same spot on a combat map sticks)
    const combat = makeSim(flatLevel([wall]));
    settle(combat);
    run(combat, 1, Btn.MagBoots);
    expect(combat.p.mag).not.toBeNull();
  });

  it('surf maps have no jetpack and no SURGE', () => {
    const sim = makeSim(raceLevel([], { surf: true }));
    settle(sim);
    racing(sim);
    run(sim, 100, 0);
    run(sim, 1, Btn.Jump);
    run(sim, 1, 0);
    run(sim, 1, Btn.Jump);
    run(sim, 30, Btn.Jump);
    expect(sim.world.events.some((e) => e.type === 'jetpack')).toBe(false);
    expect(sim.p.jetOn).toBe(false);
    run(sim, 60, 0);
    const s0 = planarSpeed(sim.p);
    run(sim, 1, Btn.Dash | Btn.Forward);
    expect(planarSpeed(sim.p)).toBeLessThan(s0 + 3);
    expect(sim.p.surgeTicks).toBe(0);
  });

  it('is deterministic: the same strafing inputs give the same world', () => {
    const go = () => {
      const sim = makeSim(raceLevel([ramp(30, 0, 120, 58, 40)]));
      sprint(sim);
      hopChain(sim, 6, 'strafe');
      return hashWorld(sim.world);
    };
    expect(go()).toBe(go());
  });
});
