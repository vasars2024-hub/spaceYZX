import { describe, expect, it } from 'vitest';
import {
  Btn,
  Move,
  v3,
  qFromAxisAngle,
  buildLevel,
  buildTestShip,
  LevelBuilder,
  dot,
  len,
  type BoxDef,
} from '../src/index';
import { flatLevel, makeSim, run, settle, view, planarSpeed } from './helpers';

const F = Btn.Forward;

describe('ground movement', () => {
  it('settles on the floor and reaches sprint speed', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    expect(sim.p.grounded).toBe(true);
    expect(sim.p.pos.y).toBeCloseTo(0.9, 1);
    run(sim, 60, F);
    expect(planarSpeed(sim.p)).toBeCloseTo(sim.config.movement.sprintSpeed, 1);
    expect(sim.p.vel.z).toBeLessThan(0); // yaw 0 faces -Z
  });

  it('strafe-only uses run speed and friction stops the player', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    run(sim, 60, Btn.Right);
    expect(planarSpeed(sim.p)).toBeCloseTo(sim.config.movement.runSpeed, 1);
    run(sim, 40, 0);
    expect(planarSpeed(sim.p)).toBeLessThan(0.05);
  });

  it('jump reaches the configured height', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    const y0 = sim.p.pos.y;
    let maxY = y0;
    run(sim, 1, Btn.Jump);
    for (let i = 0; i < 60; i++) {
      run(sim, 1);
      maxY = Math.max(maxY, sim.p.pos.y);
    }
    expect(maxY - y0).toBeCloseTo(sim.config.movement.jumpHeight, 1);
    expect(sim.p.grounded).toBe(true);
  });

  it('steps up small ledges without jumping', () => {
    const step: BoxDef = { c: v3(0, 0.15, -3), h: v3(2, 0.15, 1) };
    const sim = makeSim(flatLevel([step]));
    settle(sim);
    run(sim, 60, F);
    expect(sim.p.pos.z).toBeLessThan(-5);
    expect(sim.p.grounded).toBe(true);
  });

  it('does not tunnel through a thin wall at max speed', () => {
    const wall: BoxDef = { c: v3(0, 2, -5), h: v3(10, 2, 0.15) };
    const sim = makeSim(flatLevel([wall]));
    settle(sim);
    sim.p.vel = v3(0, 0, -30);
    run(sim, 30, F);
    expect(sim.p.pos.z).toBeGreaterThan(-5);
  });

  it('does not catch on seams between floor tiles', () => {
    const tiles: BoxDef[] = [];
    for (let i = 0; i < 20; i++) tiles.push({ c: v3(0, 0.5, -i * 2 - 1), h: v3(3, 0.5, 1) });
    const def = flatLevel(tiles);
    def.boxes[0] = { c: v3(0, -50, 0), h: v3(1, 1, 1) }; // remove default floor
    const sim = makeSim(def, v3(0, 1, -1));
    settle(sim);
    run(sim, 60, F);
    const speeds: number[] = [];
    for (let i = 0; i < 30; i++) {
      run(sim, 1, F);
      speeds.push(planarSpeed(sim.p));
    }
    expect(Math.min(...speeds)).toBeGreaterThan(sim.config.movement.sprintSpeed * 0.95);
    expect(sim.p.grounded).toBe(true);
  });
});

describe('slide & bhop', () => {
  it('slide gives a boost that goes on cooldown', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    run(sim, 60, F);
    const before = planarSpeed(sim.p);
    run(sim, 1, F | Btn.Crouch);
    expect(sim.p.move).toBe(Move.Slide);
    expect(planarSpeed(sim.p)).toBeGreaterThan(before + 2);
    expect(sim.p.crouched).toBe(true);
    run(sim, 200, F | Btn.Crouch);
    expect(sim.p.move).not.toBe(Move.Slide); // slows below end speed
  });

  it('running up a ramp keeps you on the ground at full pace', () => {
    const b = new LevelBuilder();
    b.ramp('z', -6, -10, 0, 2, 0, 6); // 27° like Kestrel's core ramps
    const def = flatLevel([...b.boxes, { c: v3(0, 1, -30), h: v3(4, 1, 20) }]);
    const sim = makeSim(def, v3(0, 1, 6));
    settle(sim);
    run(sim, 60, F, view(0));
    const speeds: number[] = [];
    for (let i = 0; i < 70; i++) {
      run(sim, 1, F, view(0));
      if (sim.p.pos.z < -6.3 && sim.p.pos.z > -9.7) {
        speeds.push(planarSpeed(sim.p));
        expect(sim.p.grounded).toBe(true);
      }
    }
    // a small dip on the first touch of the slope, then full sprint pace all the way up
    expect(speeds[0]).toBeGreaterThan(7.5);
    expect(Math.min(...speeds.slice(2))).toBeGreaterThan(sim.config.movement.sprintSpeed - 0.1);
    expect(sim.p.pos.y).toBeGreaterThan(2.5); // made it up
  });

  it('sliding down a ramp gains speed', () => {
    const angle = (15 * Math.PI) / 180;
    // long ramp descending toward -Z
    const ramp: BoxDef = {
      c: v3(0, 10 - 0.3, -40),
      h: v3(4, 0.3, 40),
      q: qFromAxisAngle(v3(1, 0, 0), -angle), // high at +z end, descends toward -Z
    };
    const def = flatLevel([ramp]);
    def.boxes[0] = { c: v3(0, -40, 0), h: v3(1, 1, 1) };
    const sim = makeSim(def, v3(0, 20, -8));
    run(sim, 90);
    expect(sim.p.grounded).toBe(true);
    run(sim, 40, F);
    run(sim, 1, F | Btn.Crouch);
    const s0 = planarSpeed(sim.p);
    run(sim, 60, F | Btn.Crouch);
    expect(sim.p.move).toBe(Move.Slide);
    expect(len(sim.p.vel)).toBeGreaterThan(s0 + 1);
  });

  it('well-timed bunny hops keep most of the speed', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    run(sim, 60, F);
    run(sim, 1, F | Btn.Crouch); // slide boost
    run(sim, 1, F | Btn.Crouch | Btn.Jump); // slide-jump
    const s0 = planarSpeed(sim.p);
    expect(s0).toBeGreaterThan(sim.config.movement.sprintSpeed + 1.5);
    // hold jump presses as soon as landing (buffered)
    for (let hop = 0; hop < 4; hop++) {
      let landed = false;
      for (let i = 0; i < 120 && !landed; i++) {
        const wasAir = !sim.p.grounded;
        run(sim, 1, (i % 2 === 0 ? Btn.Jump : 0) | F);
        if (wasAir && sim.p.grounded) landed = true;
        if (sim.p.airTicks === 0 && i > 3 && !sim.p.grounded) landed = true;
      }
    }
    expect(planarSpeed(sim.p)).toBeGreaterThan(s0 * 0.8);
  });
});

describe('air control', () => {
  it('air strafing bends the path without losing speed', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    run(sim, 60, F);
    run(sim, 1, F | Btn.Jump);
    const s0 = planarSpeed(sim.p);
    const dir0 = v3(sim.p.vel.x, 0, sim.p.vel.z);
    // strafe right while turning the view right
    for (let i = 0; i < 25; i++) run(sim, 1, Btn.Right, view(-2 * i));
    const s1 = planarSpeed(sim.p);
    const dir1 = v3(sim.p.vel.x, 0, sim.p.vel.z);
    const cos = dot(dir0, dir1) / (len(dir0) * len(dir1));
    expect(cos).toBeLessThan(0.97); // turned
    expect(s1).toBeGreaterThanOrEqual(s0 - 0.01); // no speed loss
  });

  it('soft cap stops runaway strafing speed', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    sim.p.vel = v3(0, 0, -16);
    run(sim, 1, Btn.Jump);
    for (let i = 0; i < 30; i++)
      run(sim, 1, i % 10 < 5 ? Btn.Right : Btn.Left, view(i % 10 < 5 ? -3 * i : 3 * i));
    expect(planarSpeed(sim.p)).toBeLessThanOrEqual(16.01);
  });

  it('tap-strafe redirects sharply but is limited per airtime', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    sim.p.vel = v3(0, 0, -12);
    run(sim, 1, Btn.Jump);
    const before = v3(sim.p.vel.x, 0, sim.p.vel.z);
    run(sim, 6, Btn.Forward, view(-90)); // fresh W tap + look right
    const after = v3(sim.p.vel.x, 0, sim.p.vel.z);
    const cos = dot(before, after) / (len(before) * len(after));
    expect(Math.acos(cos)).toBeGreaterThan(0.5);
    expect(sim.p.tapStrafesLeft).toBe(sim.config.movement.tapStrafesPerAir - 1);
  });
});

describe('mantle, climb, wall-jump', () => {
  it('vaults waist-high cover and keeps speed', () => {
    const crate: BoxDef = { c: v3(0, 0.5, -6), h: v3(3, 0.5, 0.5) };
    const sim = makeSim(flatLevel([crate]));
    settle(sim);
    let mantled = false;
    for (let i = 0; i < 90; i++) {
      run(sim, 1, F);
      if (sim.p.move === Move.Mantle) mantled = true;
    }
    expect(mantled).toBe(true);
    expect(sim.p.pos.z).toBeLessThan(-6.5);
  });

  it('climbs a 2.4 m ledge when holding jump', () => {
    const ledge: BoxDef = { c: v3(0, 1.2, -8), h: v3(4, 1.2, 2) };
    const sim = makeSim(flatLevel([ledge]));
    settle(sim);
    run(sim, 30, F);
    run(sim, 30, F | Btn.Jump);
    expect(sim.p.pos.y).toBeGreaterThan(2.4 + 0.8);
    expect(sim.p.grounded).toBe(true);
  });

  it('wall-jump redirects off a wall and is limited per airtime', () => {
    const wall: BoxDef = { c: v3(1.0, 5, 0), h: v3(0.5, 5, 10) };
    const sim = makeSim(flatLevel([wall]));
    settle(sim);
    run(sim, 1, Btn.Jump);
    run(sim, 10, Btn.Right); // drift into the wall
    const vxBefore = sim.p.vel.x;
    run(sim, 1, Btn.Jump);
    expect(sim.p.vel.x).toBeLessThan(vxBefore - 4); // pushed away from wall (-x)
    expect(sim.p.wallJumpsLeft).toBe(sim.config.movement.wallJumpsPerAir - 1);
    expect(sim.p.vel.y).toBeGreaterThan(5);
  });
});

describe('rails, gravity zones, zero-G', () => {
  it('rides a zip-rail and lets go with jump', () => {
    const def = flatLevel([], [], { rails: [{ points: [v3(0, 3.2, -1), v3(0, 3.2, -40)] }] });
    const sim = makeSim(def);
    settle(sim);
    run(sim, 1, Btn.Jump | F);
    let grabbed = false;
    for (let i = 0; i < 30; i++) {
      run(sim, 1, F);
      if (sim.p.move === Move.Rail) grabbed = true;
    }
    expect(grabbed).toBe(true);
    expect(len(sim.p.vel)).toBeGreaterThanOrEqual(sim.config.movement.railSpeed - 0.01);
    run(sim, 1, Btn.Jump);
    expect(sim.p.move).not.toBe(Move.Rail);
  });

  it('walks on a wall inside a wall-gravity zone', () => {
    const wall: BoxDef = { c: v3(5.5, 10, 0), h: v3(0.5, 10, 20) };
    const zone = { name: 'side', min: v3(-10, -1, -20), max: v3(5, 30, 20), gravity: v3(1, 0, 0) };
    const sim = makeSim(flatLevel([wall], [zone]));
    run(sim, 120);
    expect(sim.p.up.x).toBeLessThan(-0.99); // up points away from the +x wall
    expect(sim.p.grounded).toBe(true);
    expect(sim.p.pos.x).toBeCloseTo(5 - 0.9, 1);
    // walking works in the rotated frame
    const z0 = sim.p.pos.z;
    run(sim, 60, F);
    expect(Math.abs(sim.p.pos.z - z0) + Math.abs(sim.p.pos.y - 0)).toBeGreaterThan(3);
  });

  it('floats in zero-G keeping momentum; thrusters have charges', () => {
    const zone = { name: 'z', min: v3(-50, 5, -50), max: v3(50, 50, 50), gravity: v3(0, 0, 0) };
    const sim = makeSim(flatLevel([], [zone]), v3(0, 20, 0));
    sim.p.vel = v3(3, 0, 0);
    run(sim, 30);
    expect(sim.p.move).toBe(Move.Float);
    expect(sim.p.vel.x).toBeCloseTo(3, 3);
    const charges = sim.p.thrusterCharges;
    run(sim, 1, Btn.Jump);
    expect(sim.p.thrusterCharges).toBe(charges - 1);
    expect(len(sim.p.vel)).toBeGreaterThan(5);
  });

  it('mag-boots attach to the nearest surface and re-orient', () => {
    const zone = { name: 'z', min: v3(-50, -5, -50), max: v3(50, 50, 50), gravity: v3(0, 0, 0) };
    const ceiling: BoxDef = { c: v3(0, 8, 0), h: v3(20, 0.5, 20) };
    const sim = makeSim(flatLevel([ceiling], [zone]), v3(0, 6, 0));
    run(sim, 1, Btn.MagBoots);
    expect(sim.p.mag).not.toBeNull();
    run(sim, 90);
    expect(sim.p.up.y).toBeLessThan(-0.99); // standing on the ceiling
    expect(sim.p.grounded).toBe(true);
    run(sim, 1, Btn.Jump);
    expect(sim.p.mag).toBeNull();
  });

  it('gravity pad flips the room and reverts', () => {
    const zone = {
      name: 'room',
      min: v3(-20, -1, -20),
      max: v3(20, 20, 20),
      gravity: v3(0, -1, 0),
    };
    const ceiling: BoxDef = { c: v3(0, 12.5, 0), h: v3(20, 0.5, 20) };
    const def = flatLevel([ceiling], [zone], {
      pads: [
        {
          min: v3(-2, 0, -2),
          max: v3(2, 2, 2),
          zone: 'room',
          gravity: v3(0, 1, 0),
          durationSec: 2,
          cooldownSec: 1,
        },
      ],
    });
    const sim = makeSim(def);
    run(sim, 90);
    expect(sim.p.up.y).toBeLessThan(-0.99);
    expect(sim.p.pos.y).toBeGreaterThan(10);
    run(sim, 80); // 2 s flip is over: back on the floor side
    expect(sim.p.up.y).toBeGreaterThan(0.99);
  });
});

describe('test ship', () => {
  it('builds and the spawn is valid', () => {
    const def = buildTestShip();
    const level = buildLevel(def);
    expect(level.colliders).toBeGreaterThan(20);
    const sim = makeSim(def, def.spawns[0].pos);
    settle(sim);
    expect(sim.p.grounded).toBe(true);
    for (const a of def.areas ?? []) {
      const s = makeSim(def, a.pos, a.yawDeg);
      settle(s);
      expect(s.p.grounded, a.name).toBe(true);
    }
  });
});

describe('dash burst', () => {
  it('keeps dash speed for the whole burst (no friction eating it)', async () => {
    const { Btn: B, v3: vec } = await import('../src/index');
    const {
      makeSim: mk,
      run: go,
      settle: st,
      flatLevel: fl,
      planarSpeed: ps,
      view: vw,
    } = await import('./helpers');
    const sim = mk(fl(), vec(0, 0, 0));
    st(sim);
    go(sim, 1, B.Dash, vw(0));
    go(sim, 6, 0, vw(0));
    expect(ps(sim.p)).toBeGreaterThan(14);
  });
});

describe('jetpack', () => {
  // jump, let go of Space, then (falling) press Space again with `hold` deciding each tick
  const jumpThenJet = (hold: (i: number) => number, ticks = 30) => {
    const sim = makeSim(flatLevel());
    settle(sim);
    run(sim, 1, Btn.Jump);
    run(sim, 30); // near the top / starting to fall
    const y0 = sim.p.pos.y;
    const vy0 = sim.p.vel.y;
    const events: string[] = [];
    for (let i = 0; i < ticks; i++) {
      run(sim, 1, hold(i), view(0));
      events.push(...sim.world.events.map((e) => e.type));
    }
    return { sim, y0, vy0, events };
  };

  it('holding Space in the air catches the fall, lifts you and burns fuel', () => {
    const { sim, y0, vy0, events } = jumpThenJet(() => Btn.Jump);
    expect(vy0).toBeLessThan(0.5);
    expect(events.filter((e) => e === 'jetpack').length).toBe(1);
    expect(sim.p.jetFuel).toBeLessThan(sim.config.movement.jetpackFuelSec);
    expect(sim.p.pos.y).toBeGreaterThan(y0 + 0.5);
    expect(sim.p.vel.y).toBeLessThanOrEqual(sim.config.movement.jetpackMaxRise + 1e-9);
  });

  it('steers in any direction while it burns, backwards too', () => {
    const { sim } = jumpThenJet(() => Btn.Jump | Btn.Back, 40);
    // facing -Z: backwards is +Z, at close to the jetpack's steering speed
    expect(sim.p.vel.z).toBeGreaterThan(sim.config.movement.jetpackDirSpeed * 0.8);
  });

  it('quick taps (mouse-wheel jumps) never light it', () => {
    const { events, sim } = jumpThenJet((i) => (i % 3 === 0 ? Btn.Jump : 0));
    expect(events).not.toContain('jetpack');
    expect(sim.p.jetFuel).toBe(sim.config.movement.jetpackFuelSec);
  });

  it('runs dry, then refills after a rest', () => {
    const { sim } = jumpThenJet(() => Btn.Jump, 80);
    expect(sim.p.jetFuel).toBe(0);
    expect(sim.p.jetOn).toBe(false);
    const m = sim.config.movement;
    run(sim, Math.round((m.jetpackRechargeDelaySec + m.jetpackRechargeSec) * 60) + 5);
    expect(sim.p.jetFuel).toBeCloseTo(m.jetpackFuelSec, 6);
  });
});

describe('gravity shift (F) in normal gravity', () => {
  // a wall 1.5 m to the right of the player
  const withWall = () => {
    const sim = makeSim(flatLevel([{ c: v3(2.4, 3, 0), h: v3(0.5, 3, 6) }]));
    settle(sim);
    return sim;
  };

  it('sticks you to a nearby wall whichever way you face, F again lets go', () => {
    const sim = withWall();
    run(sim, 1, Btn.MagBoots, view(180)); // facing away from the wall
    expect(sim.p.mag).not.toBeNull();
    expect(sim.p.mag!.x).toBeLessThan(-0.9); // the wall's face points back at you (−X)
    run(sim, 60);
    expect(sim.p.up.x).toBeLessThan(-0.9); // you now stand on the wall
    run(sim, 1, Btn.MagBoots);
    expect(sim.p.mag).toBeNull();
  });

  it('does nothing far from walls, and never picks the floor you stand on', () => {
    const sim = makeSim(flatLevel());
    settle(sim);
    run(sim, 1, Btn.MagBoots);
    expect(sim.p.mag).toBeNull();
  });

  it('runs out after the time limit, then needs a short cooldown', () => {
    const sim = withWall();
    const m = sim.config.movement;
    run(sim, 1, Btn.MagBoots);
    expect(sim.p.mag).not.toBeNull();
    run(sim, Math.round(m.magMaxSec * 60) + 2);
    expect(sim.p.mag).toBeNull();
    expect(sim.p.magCd).toBeGreaterThan(0);
  });
});
