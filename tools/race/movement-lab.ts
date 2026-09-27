// The movement laboratory (docs/movement-map-design/Complete-Map-Design-Brief.md §3): measures
// in the real simulation what the surf-map movement lets a player do, and saves it as the
// versioned movement profile every surf map is fitted to:
//
//   npm run race:lab            measure everything, print it, write
//                               docs/movement-map-design/movement-profile.md
//   npm run race:lab -- --quick the cheap measurements only (no curve limits), print only
//
// The measurements are tools/race/lab.ts; the profile's key numbers are also in
// packages/shared/src/level/course/profile.ts (SURF_PROFILE), which the surf tests check
// against the simulation, so a physics change that moves them fails a test until the profile's
// version is bumped and the maps are re-checked.
import { writeFileSync } from 'node:fs';
import {
  buildLevel,
  driveRaceLine,
  expandCourse,
  HUMAN_RACER,
  Pen,
  resetRacer,
  step,
  STEADY_RACER,
  SURF_PROFILE,
  TICK_DT,
  addPlayer,
  createPlayer,
  createWorld,
  defaultConfig,
  type CourseData,
  type RacerSkill,
} from '@space-yz/shared';
import {
  airBrake,
  bhop,
  faceHold,
  fallSpeed,
  jumpApex,
  M,
  median,
  minRadius,
  runJump,
  strafeTurnRate,
} from './lab';

const quick = process.argv.includes('--quick');
const r1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const r2 = (x: number) => x.toFixed(2);

/**
 * The reference surf chain (V): a straight 60° ramp, a transfer onto a 90° curve, a straight,
 * an S-bend — the kind of phrase the standard maps are built from.
 */
export const referenceChain = (): CourseData => {
  const p = new Pen([0, 260, 420], 0);
  p.start();
  p.platform([8, 10], 'strafe');
  p.move(10, -6).curve({ legs: [{ len: 70, drop: 12 }], height: 12, angle: 60, side: 'right' });
  p.move(16, -7, 9).curve({
    legs: [{ turn: -90, radius: 70, drop: 10 }],
    height: 12,
    angle: 60,
    side: 'left',
  });
  p.move(16, -7, -9).curve({ legs: [{ len: 60, drop: 10 }], height: 12, angle: 60, side: 'right' });
  p.move(16, -7, 9).curve({
    legs: [
      { turn: -50, radius: 80, drop: 8 },
      { turn: 50, radius: 80, drop: 8 },
    ],
    height: 12,
    angle: 60,
    side: 'left',
  });
  p.move(6, -2).finishGate([16, 14]);
  return p.course({
    name: 'Reference chain',
    kind: 'surf',
    parSec: 60,
    palette: {
      ground: 0x888888,
      ground2: 0x999999,
      rock: 0x555555,
      rockDark: 0x333333,
      edge: 0xffffff,
      surf: 0x3aa8e8,
      surfEdge: 0xffffff,
      stage: 0xdddddd,
      stageGlow: 0x5cf2c0,
      start: 0x4dff9a,
      finish: 0xff4d6a,
      portal: 0xb07cff,
      pad: 0xffd23c,
      arrow: 0xffffff,
      cloud: 0xffffff,
      danger: 0xff4a6a,
      leaf: 0x3f7a6a,
      leafDark: 0x2c5a4f,
      trunk: 0x4a3f38,
      crystal: 0x9ff5ff,
      water: 0x7fd8ff,
      accent: 0xb07cff,
      accent2: 0x5cf2c0,
    },
    sky: { top: 0, horizon: 0, ground: 0, fog: { near: 100, far: 500 } },
    killY: 60,
    floors: [],
  });
};

/** Median horizontal speed on the reference chain's ramps (V), and its run time. */
export const referenceSpeed = (skill: RacerSkill) => {
  const def = expandCourse(referenceChain()).def;
  const config = defaultConfig();
  const ctx = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 1);
  const g = def.race!.grid[0];
  const p = addPlayer(world, createPlayer(1, 0, g.pos, g.yawDeg, config));
  resetRacer(p, config.movement, g.pos, g.yawDeg, 0);
  const speeds: number[] = [];
  const stepAndLog = (...a: Parameters<typeof step>) => {
    step(...a);
    // on a ramp face: in the air, touching a surf box
    if (!p.grounded && p.pos.y < 250 && Math.abs(p.vel.y) < 12)
      speeds.push(Math.hypot(p.vel.x, p.vel.z));
  };
  const r = driveRaceLine(ctx, world, p, stepAndLog, skill, 60);
  return { v: median(speeds), finished: r.finished, time: r.timeSec, top: r.topSpeed };
};

const main = (): void => {
  const out: string[] = [];
  const log = (s = '') => {
    out.push(s);
    console.log(s);
  };
  const t0 = Date.now();
  log(`# Movement profile — ${SURF_PROFILE.version}`);
  log();
  log(
    'Measured by `npm run race:lab` (tools/race/movement-lab.ts, measurements in tools/race/lab.ts) in the real',
  );
  log(
    'simulation with the surf-map movement rules (race movement: `LevelDef.race`, surf maps: no jetpack, no SURGE).',
  );
  log(
    'Every surf map is fitted to these numbers. The key ones are also in `packages/shared/src/level/course/profile.ts`',
  );
  log(
    '(`SURF_PROFILE`), checked against the simulation by `tools/race/test/movement-profile.test.ts`: if movement',
  );
  log(
    'physics change, that test fails until the profile version is bumped and the maps re-checked.',
  );
  log();
  log(
    'Riders: **steady** = perfect strafing (the bot racer, `STEADY_RACER`); **human** = strafe efficiency',
  );
  log(
    '0.6 (misses keys/mouse on 40 % of air ticks in a fixed pattern, `HUMAN_RACER`). Units m, s, m/s.',
  );
  log();
  log('## Body and caps (config, `packages/shared/src/config/movement.ts`)');
  log();
  log('| Symbol | Value | Meaning |');
  log('|---|---|---|');
  log(`| H | ${M.standHeight} m (crouched ${M.crouchHeight} m) | standing collision height |`);
  log(`| W | ${M.radius * 2} m | collision width (capsule radius ${M.radius} m) |`);
  log(`| step | ${M.stepHeight} m | step-up height |`);
  log(`| g | ${M.gravity} m/s² | gravity |`);
  log(`| sprint | ${M.raceSprintSpeed} m/s | race / surf sprint speed |`);
  log(`| strafe cap | ${M.raceAirSoftCap} m/s | strafing cannot push horizontal speed past this |`);
  log(`| max speed | ${M.raceMaxSpeed} m/s | total speed cap (surfing down, falling) |`);
  log(
    `| walkable | < ${M.maxWalkableSlopeDeg}° | steeper plain slopes are not ground; surf ramps (\`surf\`) are never ground |`,
  );
  log(`| jump buffer | ${M.raceJumpBufferSec} s | a jump pressed this early fires on landing |`);
  log(`| coyote | ${M.coyoteSec} s | jump after running off an edge |`);
  log(`| landing friction | from the 1st ground tick | jump on the landing tick or lose ~10 % |`);
  log(
    `| recovery | ${M.raceSurfPenaltySec} s | frozen in the restart bay after a fall (surf maps) |`,
  );
  log();

  log('## Jumps (flat ground)');
  log();
  const Z = jumpApex();
  log(`- **Z** (jump apex, standing): **${r2(Z)} m**`);
  const jumps = [M.raceSprintSpeed, 16, 20, 25].map((v) => ({
    v,
    plain: runJump(v, false),
    strafe: runJump(v, true),
  }));
  log(`- **J** (running jump, take-off to the same height):`);
  log();
  log('| approach | no strafe | perfect strafe | comfortable (0.85 × no strafe) |');
  log('|---|---|---|---|');
  for (const j of jumps)
    log(`| ${j.v} m/s | ${r1(j.plain)} m | ${r1(j.strafe)} m | ${r1(j.plain * 0.85)} m |`);
  log();

  log('## Bunny hops (B(v)) — first-tick jumps, strafing toward the way on');
  log();
  log(
    '| approach | steady: m/hop | steady: +m/s per hop | human 0.6: m/hop | human: +m/s per hop |',
  );
  log('|---|---|---|---|---|');
  const hops = [M.raceSprintSpeed, 16, 20, 25].map((v) => ({ v, s: bhop(v, 1), h: bhop(v, 0.6) }));
  for (const b of hops)
    log(
      `| ${b.v} m/s | ${r1(b.s.perHop)} | ${r2(b.s.gain)} | ${r1(b.h.perHop)} | ${r2(b.h.gain)} |`,
    );
  const held = bhop(16, 1, 6, true);
  const assisted = bhop(16, 1, 6, true, true);
  log();
  log(
    `- **Hold-to-bhop: off by default.** Holding Space from the first jump gives ${held.hops} hop(s): every hop needs a`,
  );
  log(
    `  fresh press within ${M.raceJumpBufferSec} s before landing (scroll-wheel jumping works). The brief recommends`,
  );
  log('  consistent hold-to-bhop assistance in the default queues: it exists as a **map option**');
  log(
    `  (\`CourseData.holdToBhop\` → \`RaceDef.holdToBhop\`): a held jump fires on every landing — ${assisted.hops} hops at`,
  );
  log(
    `  ${r1(assisted.perHop)} m/hop from 16 m/s (steady strafing). No map turns it on yet (an owner decision).`,
  );
  log();

  log('## Air control');
  log();
  for (const v of [15, 25, 35])
    log(`- perfect strafe turn at ${v} m/s: **${r1(strafeTurnRate(v))}°/s** without losing speed`);
  log(
    `- holding S (back) in the air at 30 m/s: ${r1(airBrake(30))} m/s after ONE tick (air braking is very strong)`,
  );
  log(
    `- free fall: ${r1(fallSpeed(1))} m/s after 1 s, ${r1(fallSpeed(2))} after 2 s, ${r1(fallSpeed(4))} after 4 s (the ${M.raceMaxSpeed} m/s cap)`,
  );
  log();

  log('## Surf faces (straight level ramp, 14 m faces)');
  log();
  log(
    '| face angle | steady holds 20 m/s for 4 s | holds 30 m/s | slide speed letting go (after 1 s) |',
  );
  log('|---|---|---|---|');
  let lo = 0;
  let hi = 0;
  for (const a of [45, 50, 55, 60, 65, 70, 75, 80, 85]) {
    const h20 = faceHold(a, 20);
    const h30 = faceHold(a, 30);
    if (h20.ok && h30.ok) {
      if (!lo) lo = a;
      hi = a;
    }
    log(
      `| ${a}° | ${h20.ok ? 'yes' : 'no'}${h20.grounded ? ' (ground!)' : ''} | ${h30.ok ? 'yes' : 'no'} | ${r1(h20.slide)} m/s |`,
    );
  }
  log();
  log(
    `- stable surf range (steady holds both speeds): **${lo}°–${hi}°**. Course data allows 50°–85°; build standard maps at 55°–70°.`,
  );
  log();

  log('## Reference surf speed (V)');
  log();
  const vs = referenceSpeed(STEADY_RACER);
  const vh = referenceSpeed({ ...HUMAN_RACER, strafeEff: 0.6 });
  log(
    '- The reference chain (tools/race/movement-lab.ts `referenceChain`: a 70 m straight, a 90° curve, a straight, an S-bend; 60° faces, 12 m tall, ~50 m of drop):',
  );
  log(
    `  - steady: median **V = ${r1(vs.v)} m/s** (top ${r1(vs.top)}, ${vs.finished ? `${r1(vs.time)} s` : 'did not finish'})`,
  );
  log(
    `  - human 0.6: median **${r1(vh.v)} m/s** (top ${r1(vh.top)}, ${vh.finished ? `${r1(vh.time)} s` : 'did not finish'})`,
  );
  log('- Test curves at 0.8 V, V and 1.2 V (brief §12.3).');
  log();

  if (!quick) {
    log('## Curve capability C(v)');
    log();
    log(
      'The tightest ridge radius a rider holds over a nearly level 180° curve on 12 m faces, riding',
    );
    log('a third of the way down: following it round, never leaving the face, keeping 90 % of the');
    log(
      'speed. **Inside** = the curve turns toward the face (it holds you like a banked track; too',
    );
    log(
      'fast and it lifts you over the ridge). **Outside** = it turns away from the face (you hold',
    );
    log('into it with the strafe key). Bots measured with steady and 0.7-efficiency strafing.');
    log();
    log('| face | entry speed | inside, steady | inside, 0.7 | outside, steady | outside, 0.7 |');
    log('|---|---|---|---|---|---|');
    for (const a of [55, 60, 65, 70])
      for (const v of [15, 20, 25, 30, 35]) {
        const row = [
          minRadius(v, a, true, 1),
          minRadius(v, a, true, 0.7),
          minRadius(v, a, false, 1),
          minRadius(v, a, false, 0.7),
        ];
        log(`| ${a}° | ${v} m/s | ${row.map((x) => `${r1(x)} m`).join(' | ')} |`);
      }
    log();
    log('The air control (Source-style, air acceleration 100) is strong enough that the physics');
    log('allows very tight curves; what limits a human is turning the mouse smoothly. The design');
    log('rule therefore adds a **turn-rate comfort limit** (an assumption until human playtests):');
    log('radius ≥ v / ω with ω = **60°/s for Beginner** and **90°/s for Intermediate** main lines');
    log('(optional faster lines may go to 120°/s), and never below the bot limits above:');
    log();
    log('| speed | Beginner min radius (60°/s) | Intermediate min radius (90°/s) |');
    log('|---|---|---|');
    for (const v of [15, 20, 25, 30, 35, 40])
      log(`| ${v} m/s | ${r1(v / (Math.PI / 3))} m | ${r1(v / (Math.PI / 2))} m |`);
    log();
  }
  log(`_Measured in ${((Date.now() - t0) / 1000).toFixed(0)} s._`);
  if (!quick)
    writeFileSync(
      new URL('../../docs/movement-map-design/movement-profile.md', import.meta.url),
      `${out.join('\n')}\n`,
    );
};

if (process.argv[1]?.replace(/\\/g, '/').endsWith('race/movement-lab.ts')) main();
