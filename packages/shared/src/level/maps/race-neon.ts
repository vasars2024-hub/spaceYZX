// "Neon Drift" — race track 2 (hard): a night course among floating fragments of a neon city,
// under stars and a big moon. Dark slate walkways with cyan edges, magenta surf ramps, glowing
// towers; the deadly cloud sea below glows red. Built as course data (level/course).
//
//   1  a tight hop chain curving left behind a tower                         → checkpoint 1
//   2  steep surf: flicks both ways, a turning transfer                       → checkpoint 2
//   3  a pillar weave on small pads, a launch pad, a narrow window            → checkpoint 3
//   4  the portal to the east blocks                                           → checkpoint 4
//   5  a jetpack gap (fuel cell first), a broken beam, drop strafes           → checkpoint 5
//   6  the speed gate: a hop chain up to 14 m steps, a 16 m gap, booster rings → checkpoint 6
//   7  a 90° surf spin                                                         → checkpoint 7
//   8  behind the wall to the right on small pads, a launch pad               → checkpoint 8
//   9  the portal to the old town                                              → checkpoint 9
//  10  steep narrow ramps                                                     → checkpoint 10
//  11  the portal to the west towers                                          → checkpoint 11
//  12  a pillar gauntlet, a jetpack gap, drop strafes                        → checkpoint 12
//  13  a royal spin (left, then right, then right again)                     → checkpoint 13
//  14  a launch pad, broken beams, a narrow window                           → checkpoint 14
//  15  the portal to the tower tops                                           → checkpoint 15
//  16  a last steep surf run with two flicks                                  → checkpoint 16
//  17  the last chain: 17 m of air to the finish                              → FINISH
import type { CourseData, P2 } from '../course/types';
import { Pen } from '../course/pen';
import { hopChain, landmark, surfRun, wallBeside } from '../course/sections';

const PALETTE = {
  ground: 0x30364f,
  ground2: 0x3a4160,
  rock: 0x1f2438,
  rockDark: 0x161a2b,
  edge: 0x3ff0ff,
  surf: 0xb13cf0,
  surfEdge: 0xff8af6,
  stage: 0x2a3050,
  stageGlow: 0x39f3ff,
  start: 0x39ff8e,
  finish: 0xff3b6b,
  portal: 0xff4fd8,
  pad: 0xffd23c,
  arrow: 0x9ffcff,
  cloud: 0xa99be0,
  danger: 0xff2a6d,
  leaf: 0x2ee6a6,
  leafDark: 0x1b8f73,
  trunk: 0x3b3f5c,
  crystal: 0x7af9ff,
  water: 0x4f7dff,
  accent: 0xff4fd8,
  accent2: 0x39f3ff,
};

/** A floating city block beside the way: a neon island with towers and a sign. */
const block = (p: Pen, f: number, s: number, u: number, size: P2, towers = 2) => {
  const at = p.rel(f, s, u);
  p.deco({
    t: 'island',
    at: [at.x, at.y, at.z],
    size,
    depth: Math.max(size[0], size[1]) * 0.6,
    style: 'neon',
    heading: p.heading,
  });
  for (let i = 0; i < towers; i++) {
    const q = p.rel(
      f + (i - (towers - 1) / 2) * size[1] * 0.4,
      s + (i % 2 ? 1 : -1) * size[0] * 0.15,
      u,
    );
    p.deco({
      t: 'spire',
      at: [q.x, q.y, q.z],
      height: 14 + ((i * 7) % 3) * 6,
      width: 4 + (i % 2),
      color: i % 2 ? PALETTE.ground2 : PALETTE.ground,
    });
  }
  const b = p.rel(f - size[1] * 0.35, s + size[0] * 0.3, u);
  p.deco({
    t: 'banner',
    at: [b.x, b.y, b.z],
    heading: p.heading + 90,
    height: 7,
    color: PALETTE.accent,
  });
};

/** The course data (pure JSON). */
export const neonDriftCourse = (): CourseData => {
  const p = new Pen([-400, 260, -420], 90);
  // ---- 1: a tight hop chain curving left behind a tower ----
  p.start();
  block(p, 10, -26, -3, [16, 14]);
  block(p, 20, 30, 4, [14, 12], 3);
  p.platform([8, 12], 'hop');
  hopChain(p, {
    n: 9,
    first: 9,
    grow: 0.5,
    max: 13,
    turn: [0, 0, 10, 10, 10, 10, 10, 10, 0],
    size: [5, 5],
    vary: true,
  });
  wallBeside(p, 2, 4, 11, [6, 34, 18]);
  wallBeside(p, 5, 7, 11, [6, 34, 18]);
  p.face(90).move(10).stage(undefined, undefined, 'Steep flicks');
  landmark(p, 60, 'tower', 'neon', 0x3a4160);
  // ---- 2: steep surf: flicks both ways, a turning transfer ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 60,
      drop: 12,
      height: 12,
      angle: 60,
      side: 'both',
      ride: 'right',
    },
    { gap: 15, fall: 8, shift: 10, length: 50, drop: 10, height: 11, angle: 61, side: 'left' },
    { gap: 15, fall: 8, shift: -10, length: 50, drop: 10, height: 11, angle: 61, side: 'right' },
    { turn: 40, gap: 16, fall: 8, length: 50, drop: 10, height: 11, angle: 62, side: 'left' },
  ]);
  p.move(12, -10).platform([12, 30]);
  block(p, 0, -28, 2, [16, 16], 3);
  p.stage(undefined, undefined, 'Pillar weave');
  landmark(p, -60, 'arch', 'neon', 0x3a4160);
  // ---- 3: a pillar weave on small pads, a launch pad, a narrow window ----
  p.platform([8, 8], 'hop');
  hopChain(p, {
    n: 8,
    first: 9,
    grow: 0.45,
    max: 12.5,
    turn: [0, 28, -56, 56, -56, 56, -56, 28],
    size: [5, 5],
    vary: true,
  });
  for (let k = 0; k < 7; k++) wallBeside(p, k, k + 1, k % 2 ? -5 : 5, [2.5, 26, 2.5], 13);
  p.move(9).platform([8, 12]).launch(32, 12, 1.5);
  p.move(-4).platform([8, 10], 'jump');
  p.window(5, [3.6, 4.2], [14, 16], -1);
  p.move(6, -1.5).platform([8, 10]);
  p.face(180).move(2).platform([10, 10]);
  p.stage(undefined, undefined, 'Portal to the east blocks');
  landmark(p, 60, 'falls', 'neon', 0x3a4160);
  // ---- 4: the portal to the east blocks ----
  p.portal([420, 330, -260]);
  p.move(-1).stage([12, 12], undefined, 'Jetpack gap');
  landmark(p, -60, 'tower', 'neon', 0x3a4160);
  // ---- 5: a jetpack gap (fuel cell first), a broken beam, drop strafes ----
  p.platform([8, 14]).jet(60);
  p.fuel();
  // (26 m of open air: a running jump reaches 9 m; burn the jetpack across)
  p.move(26).platform([8, 12]);
  p.path(p.relP(16), 0.9, 'beam');
  p.go('jump');
  p.move(4.5).platform([2, 2], undefined, { style: 'plain' });
  p.path(p.relP(16, 3), 0.9, 'beam');
  p.go('jump');
  p.pads(
    [
      { d: 12, rise: -4, turn: 30, size: [5, 5] },
      { d: 12.5, rise: -4, turn: -60, size: [5, 5] },
      { d: 12.5, rise: -4, turn: 60, size: [5, 5] },
      { d: 12.5, rise: -4, turn: -30, size: [5, 5] },
    ],
    'jump',
  );
  block(p, -8, 28, 3, [14, 14]);
  p.move(10).stage(undefined, undefined, 'Speed gate');
  landmark(p, 60, 'arch', 'neon', 0x3a4160);
  // ---- 6: the speed gate: accelerate, clear a 16 m gap, booster rings ----
  p.platform([8, 8], 'hop');
  hopChain(p, {
    n: 10,
    first: 9,
    grow: 0.55,
    max: 14,
    turn: [0, 10, 10, 10, 0, -12, -12, -12, 0, 0],
    size: [5.5, 5.5],
    vary: true,
  });
  p.move(19.5, -2).platform([10, 10]);
  p.booster(24, 5, false);
  p.move(18, -1.6).booster(24, 4, true, [4, 4.5]);
  p.move(14, -6).platform([10, 22]);
  p.stage(undefined, undefined, 'The spin');
  landmark(p, -60, 'falls', 'neon', 0x3a4160);
  // ---- 7: a 90° surf spin ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 60,
      drop: 12,
      height: 12,
      angle: 60,
      side: 'both',
      ride: 'right',
    },
    { turn: 30, gap: 18, fall: 8, length: 45, drop: 9, height: 11, angle: 61, side: 'left' },
    { turn: 30, gap: 18, fall: 8, length: 45, drop: 9, height: 11, angle: 61, side: 'left' },
    { turn: 30, gap: 18, fall: 8, length: 45, drop: 9, height: 11, angle: 62, side: 'left' },
  ]);
  p.move(12, -10).platform([12, 30]);
  block(p, 4, 30, 2, [16, 14], 3);
  p.stage(undefined, undefined, 'Behind the wall');
  landmark(p, 60, 'tower', 'neon', 0x3a4160);
  // ---- 8: behind the wall to the right on small pads, a launch pad ----
  p.platform([8, 8], 'hop');
  hopChain(p, { n: 8, first: 9, grow: 0.5, max: 13, turn: 12, size: [5, 5], vary: true });
  wallBeside(p, 1, 3, 11, [6, 34, 18]);
  wallBeside(p, 4, 6, 11, [6, 34, 18]);
  p.face(
    p.heading < 45 || p.heading >= 315 ? 0 : p.heading < 135 ? 90 : p.heading < 225 ? 180 : 270,
  );
  p.move(10).platform([10, 14]).launch(34, 12, 1.5);
  p.move(-4).platform([10, 14]);
  p.stage(undefined, undefined, 'Portal to the old town');
  landmark(p, -60, 'arch', 'neon', 0x3a4160);
  // ---- 9: the portal to the old town ----
  p.portal([-120, 360, 420]);
  p.move(-1).stage([12, 12], undefined, 'Narrow ramps');
  landmark(p, 60, 'falls', 'neon', 0x3a4160);
  // ---- 10: steep narrow ramps, a speed gap, the last chain ----
  p.turnPad(p.heading === 0 ? 0 : -90, 12).platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 55,
      drop: 11,
      height: 10,
      angle: 62,
      side: 'both',
      ride: 'right',
    },
    { gap: 15, fall: 8, shift: 9, length: 45, drop: 9, height: 9, angle: 63, side: 'left' },
    { gap: 15, fall: 8, shift: -9, length: 45, drop: 9, height: 9, angle: 64, side: 'right' },
  ]);
  p.move(12, -10).platform([12, 30]);
  p.stage(undefined, undefined, 'Portal to the west towers');
  landmark(p, -60, 'tower', 'neon', 0x3a4160);
  // ---- 11: the portal to the west towers: a pillar gauntlet, a jetpack gap, drop strafes ----
  p.portal([-380, 330, 330]);
  p.move(-1).stage([12, 12], undefined, 'The gauntlet');
  landmark(p, 60, 'arch', 'neon', 0x3a4160);
  p.platform([8, 8], 'hop');
  hopChain(p, {
    n: 8,
    first: 9,
    grow: 0.45,
    max: 12.5,
    turn: [0, 30, -60, 60, -60, 60, -60, 30],
    size: [5, 5],
    vary: true,
  });
  for (let k = 0; k < 7; k++) wallBeside(p, k, k + 1, k % 2 ? -5 : 5, [2.5, 26, 2.5], 13);
  p.move(9).platform([8, 12]).jet(60);
  p.fuel();
  p.move(26).platform([8, 12], 'jump');
  p.pads(
    [
      { d: 12.5, rise: -4, turn: -35, size: [5, 5] },
      { d: 12.5, rise: -4, turn: 70, size: [5, 5] },
      { d: 12.5, rise: -4, turn: -70, size: [5, 5] },
      { d: 12.5, rise: -4, turn: 35, size: [5, 5] },
    ],
    'jump',
  );
  block(p, -6, -28, 3, [16, 14], 3);
  p.move(10).stage(undefined, undefined, 'Royal spin');
  landmark(p, -60, 'falls', 'neon', 0x3a4160);
  // ---- 12: a royal spin: right onto a left-turning ramp, then back ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 55,
      drop: 11,
      height: 11,
      angle: 60,
      side: 'both',
      ride: 'right',
    },
    { turn: -32, gap: 17, fall: 8, length: 50, drop: 10, height: 11, angle: 61, side: 'right' },
    { turn: 32, gap: 18, fall: 8, length: 50, drop: 10, height: 11, angle: 61, side: 'left' },
    { turn: 32, gap: 18, fall: 8, length: 45, drop: 9, height: 10, angle: 62, side: 'left' },
  ]);
  p.move(12, -10).face(90).platform([16, 30]);
  block(p, 0, 30, 2, [16, 14], 3);
  p.stage(undefined, undefined, 'Beams and window');
  landmark(p, 60, 'tower', 'neon', 0x3a4160);
  // ---- 13: up and through: a launch pad, broken beams, a narrow window ----
  p.platform([8, 12]).launch(32, 12, 1.5);
  p.move(-4).platform([8, 10]);
  p.path(p.relP(18, 4), 0.9, 'beam');
  p.go('jump');
  p.turn(12).move(4.5).platform([2, 2], undefined, { style: 'plain' });
  p.path(p.relP(18, -5), 0.9, 'beam');
  p.go('jump');
  p.turn(-12).move(5).platform([6, 8], 'jump');
  p.window(5, [3.6, 4.2], [14, 16], -1);
  p.move(6, -1.5).platform([10, 12]);
  p.stage(undefined, undefined, 'Portal to the tower tops');
  landmark(p, -60, 'arch', 'neon', 0x3a4160);
  // ---- 14: the portal to the tower tops; the last chain: 17 m of air to the finish ----
  p.portal([330, 380, 420]);
  p.move(-1).stage([12, 12], 12, 'Tower-top surf');
  landmark(p, 60, 'falls', 'neon', 0x3a4160);
  p.turnPad(-90, 12).platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 70,
      drop: 16,
      height: 12,
      angle: 60,
      side: 'both',
      ride: 'left',
    },
    { gap: 16, fall: 8, shift: -9, length: 50, drop: 10, height: 10, angle: 62, side: 'right' },
    { gap: 16, fall: 8, shift: 9, length: 50, drop: 10, height: 10, angle: 63, side: 'left' },
    { turn: -20, gap: 20, fall: 9, length: 45, drop: 9, height: 10, angle: 63, side: 'right' },
  ]);
  p.move(12, -10).face(0).platform([16, 30]);
  block(p, 0, -30, 2, [16, 14], 3);
  p.stage(undefined, undefined, 'The last chain');
  landmark(p, -60, 'tower', 'neon', 0x3a4160);
  p.platform([8, 8], 'hop');
  hopChain(p, {
    n: 10,
    first: 9,
    grow: 0.55,
    max: 14,
    turn: [0, 8, 8, 8, 0, 0, -8, -8, -8, 0],
    rise: -0.4,
    size: [5, 5],
    vary: true,
  });
  p.move(17.5, -3).finish();
  return p.course({
    name: 'Neon Drift',
    kind: 'race',
    parSec: 180,
    palette: PALETTE,
    sky: {
      top: 0x060a1c,
      horizon: 0x2a1d5a,
      ground: 0x120a2a,
      sun: { dir: [-0.4, 0.42, -0.6], color: 0xf2f0ff, sizeDeg: 5 },
      sunLight: 0xb8c4ff,
      stars: true,
      fog: { near: 120, far: 520 },
      ambient: 0.85,
    },
    roomMat: 'panel',
    surfColors: [0xb13cf0, 0x22c8e8, 0xff3caa],
    killY: 60,
    floors: [],
    autoFloors: { below: 22, pad: 30 },
    scenery: [
      {
        t: 'scatter',
        kind: 'island',
        count: 22,
        seed: 11,
        min: [-470, 160, -470],
        max: [470, 360, 470],
        size: [18, 40],
        clear: 45,
        style: 'neon',
      },
      {
        t: 'scatter',
        kind: 'spire',
        count: 18,
        seed: 12,
        min: [-470, 120, -470],
        max: [470, 220, 470],
        size: [40, 90],
        clear: 50,
      },
      {
        t: 'scatter',
        kind: 'cloud',
        count: 24,
        seed: 13,
        min: [-470, 120, -470],
        max: [470, 240, 470],
        size: [30, 70],
        clear: 30,
      },
    ],
  });
};
