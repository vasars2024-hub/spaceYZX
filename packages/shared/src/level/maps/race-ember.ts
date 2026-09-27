// "Ember Spire" — race track 3 (very hard): basalt islands over an ash-cloud sea at dusk, lava
// falls pouring off their edges, a red sun going down. Small pads, steep narrow surf ramps,
// jetpack gaps with one fuel cell for two burns. Built as course data (level/course).
//
//   1  a hop chain on small pads curving right behind two basalt columns    → checkpoint 1
//   2  steep surf: an A-frame, a flick left, a flick right                   → checkpoint 2
//   3  a pillar weave on small pads, a window, drop strafes                  → checkpoint 3
//   4  the portal to the ash fields                                          → checkpoint 4
//   5  two jetpack gaps on one fuel cell, a broken beam                     → checkpoint 5
//   6  the speed gate: a hop chain to 14 m steps, 17 m of air              → checkpoint 6
//   7  a surf spin: three transfers turning right                           → checkpoint 7
//   8  behind the wall to the left on small pads, a launch pad             → checkpoint 8
//   9  the portal to the caldera                                            → checkpoint 9
//  10  booster rings, a narrow window, drop strafes                         → checkpoint 10
//  11  a royal spin on the steepest ramps                                   → checkpoint 11
//  12  a pillar gauntlet into a jetpack gap                                → checkpoint 12
//  13  the portal to the spire                                              → checkpoint 13
//  14  a long surf descent with two flicks                                  → checkpoint 14
//  15  up the spire: a launch pad, a jetpack gap, a window, drop strafes    → checkpoint 15
//  16  the last chain: accelerate, 17 m of air to the finish               → FINISH
import type { CourseData, P2 } from '../course/types';
import { Pen } from '../course/pen';
import { hopChain, surfRun, wallBeside } from '../course/sections';

const PALETTE = {
  ground: 0x433836,
  ground2: 0x51443f,
  rock: 0x2d2624,
  rockDark: 0x1e1918,
  edge: 0xff8c2a,
  surf: 0xc9432c,
  surfEdge: 0xffd36b,
  stage: 0x4a3b36,
  stageGlow: 0xff9a3c,
  start: 0x5cff9d,
  finish: 0xff3b3b,
  portal: 0xffb13b,
  pad: 0x5ce1ff,
  arrow: 0xffe0b0,
  cloud: 0x5d4d55,
  danger: 0xff4a12,
  leaf: 0x6a8a3a,
  leafDark: 0x4a6a2a,
  trunk: 0x2a201c,
  crystal: 0xff7a3a,
  water: 0xff6a1a,
  accent: 0xff6a1a,
  accent2: 0xffb347,
};

/** A basalt island beside the way: glowing cracks under it, a lava fall off its edge. */
const basalt = (p: Pen, f: number, s: number, u: number, size: P2) => {
  const at = p.rel(f, s, u);
  p.deco({
    t: 'island',
    at: [at.x, at.y, at.z],
    size,
    depth: Math.max(size[0], size[1]) * 0.8,
    style: 'basalt',
    heading: p.heading,
  });
  const c = p.rel(f + size[1] * 0.2, s - size[0] * 0.2, u);
  p.deco({ t: 'crystal', at: [c.x, c.y, c.z], height: 5 });
  const t = p.rel(f - size[1] * 0.25, s + size[0] * 0.15, u);
  p.deco({ t: 'tree', at: [t.x, t.y, t.z], height: 6, kind: 'dead' });
  const w = p.rel(f, s + (s >= 0 ? size[0] / 2 : -size[0] / 2), u);
  p.deco({
    t: 'waterfall',
    at: [w.x, w.y, w.z],
    heading: (p.heading + (s >= 0 ? 90 : 270)) % 360,
    width: 2.5,
    drop: 22,
  });
};

/** The course data (pure JSON). */
export const emberSpireCourse = (): CourseData => {
  const p = new Pen([-400, 250, 420], 0);
  // ---- 1: a hop chain on small pads curving right behind two basalt columns ----
  p.start();
  basalt(p, 10, -26, -3, [16, 14]);
  basalt(p, 24, 28, 3, [14, 12]);
  p.platform([8, 12], 'hop');
  hopChain(p, {
    n: 10,
    first: 9,
    grow: 0.55,
    max: 13.5,
    turn: [0, 0, 9, 9, 9, 9, 9, 9, 9, 0],
    size: [4.5, 4.5],
  });
  wallBeside(p, 2, 4, 10, [6, 36, 18]);
  wallBeside(p, 5, 7, 10, [6, 36, 18]);
  p.face(90).move(10).stage();
  // ---- 2: steep surf: an A-frame, a flick left, a flick right ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 70,
      drop: 15,
      height: 11,
      angle: 62,
      side: 'both',
      ride: 'left',
    },
    { gap: 16, fall: 8, shift: -9, length: 50, drop: 10, height: 9, angle: 64, side: 'right' },
    { gap: 16, fall: 8, shift: 9, length: 50, drop: 10, height: 9, angle: 64, side: 'left' },
    { gap: 16, fall: 8, shift: -9, length: 45, drop: 9, height: 9, angle: 65, side: 'right' },
  ]);
  p.move(12, -10).face(0).platform([16, 30]);
  basalt(p, 0, 30, 2, [16, 14]);
  p.stage();
  // ---- 3: a pillar weave on small pads, a window, drop strafes ----
  p.platform([8, 8], 'hop');
  hopChain(p, {
    n: 8,
    first: 9,
    grow: 0.5,
    max: 12.5,
    turn: [0, 30, -60, 60, -60, 60, -60, 30],
    size: [4.5, 4.5],
  });
  for (let k = 0; k < 7; k++) wallBeside(p, k, k + 1, k % 2 ? -4.5 : 4.5, [2.2, 28, 2.2], 14);
  p.move(9).platform([8, 10], 'jump');
  p.window(5, [3.2, 4], [14, 16], -1);
  p.move(6, -1.5).platform([6, 8], 'jump');
  p.pads(
    [
      { d: 12.5, rise: -4, turn: -40, size: [4.5, 4.5] },
      { d: 13, rise: -4, turn: 80, size: [4.5, 4.5] },
      { d: 13, rise: -4, turn: -80, size: [4.5, 4.5] },
      { d: 13, rise: -4, turn: 40, size: [4.5, 4.5] },
    ],
    'jump',
  );
  p.face(0).move(11).stage();
  // ---- 4: the portal to the ash fields ----
  p.portal([-150, 340, 300]);
  p.move(-1).stage([12, 12]);
  // ---- 5: two jetpack gaps on one fuel cell, a broken beam ----
  p.platform([8, 14]).jet(55);
  p.fuel();
  // (24 m of open air, then 24 m more: half a tank each)
  p.move(24).platform([6, 8]).jet(55);
  p.move(24).platform([8, 10]);
  p.path(p.relP(16, 3), 0.8, 'beam');
  p.go('jump');
  p.turn(10).move(4.5).platform([2, 2], undefined, { style: 'plain' });
  p.path(p.relP(16, -3), 0.8, 'beam');
  p.go('jump');
  p.turn(-10).move(6.5).stage();
  // ---- 6: the speed gate: a hop chain to 14 m steps, 17 m of air ----
  p.platform([8, 8], 'hop');
  hopChain(p, {
    n: 11,
    first: 9,
    grow: 0.55,
    max: 14.5,
    turn: [0, 6, 6, -6, -6, 6, 6, -6, -6, 0, 0],
    size: [5, 5],
  });
  p.move(20, -2).platform([10, 22]);
  basalt(p, 0, -28, 3, [14, 14]);
  p.stage();
  // ---- 7: a surf spin: three transfers turning right ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 70,
      drop: 15,
      height: 11,
      angle: 62,
      side: 'both',
      ride: 'right',
    },
    { turn: 30, gap: 18, fall: 8, length: 45, drop: 9, height: 9, angle: 63, side: 'left' },
    { turn: 30, gap: 18, fall: 8, length: 45, drop: 9, height: 9, angle: 64, side: 'left' },
    { turn: 30, gap: 18, fall: 8, length: 45, drop: 9, height: 9, angle: 64, side: 'left' },
  ]);
  p.move(12, -10).face(90).platform([16, 30]);
  p.stage();
  // ---- 8: behind the wall to the left on small pads, a launch pad ----
  p.platform([8, 8], 'hop');
  hopChain(p, { n: 9, first: 9, grow: 0.55, max: 13.5, turn: -11, size: [4.5, 4.5] });
  wallBeside(p, 1, 3, -10, [6, 36, 18]);
  wallBeside(p, 4, 6, -10, [6, 36, 18]);
  p.face(0).move(10).platform([10, 14]).launch(34, 12, 1.5);
  p.move(-4).platform([10, 14]);
  p.stage();
  // ---- 9: the portal to the caldera ----
  p.portal([180, 360, 420]);
  p.move(-1).stage([12, 12]);
  // ---- 10: booster rings, a narrow window, drop strafes ----
  p.platform([8, 12], 'jump');
  p.move(6, -0.5).booster(22, 5, true, [3.5, 4]);
  p.move(18, -2.6).booster(24, 4, true, [3.5, 4]);
  p.move(14, -6).platform([10, 20], 'jump');
  p.window(5, [3.2, 4], [14, 16], -1);
  p.move(6, -1.5).platform([6, 8], 'jump');
  p.pads(
    [
      { d: 12.5, rise: -4, turn: 40, size: [4.5, 4.5] },
      { d: 13, rise: -4, turn: -80, size: [4.5, 4.5] },
      { d: 13, rise: -4, turn: 80, size: [4.5, 4.5] },
      { d: 13, rise: -4, turn: -40, size: [4.5, 4.5] },
    ],
    'jump',
  );
  basalt(p, -6, 28, 3, [14, 14]);
  p.face(0).move(11).stage();
  // ---- 11: a royal spin on the steepest ramps ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 70,
      drop: 15,
      height: 11,
      angle: 62,
      side: 'both',
      ride: 'right',
    },
    { turn: -30, gap: 18, fall: 8, length: 45, drop: 9, height: 9, angle: 64, side: 'right' },
    { turn: 30, gap: 18, fall: 8, length: 45, drop: 9, height: 8, angle: 65, side: 'left' },
    { turn: 30, gap: 18, fall: 8, length: 45, drop: 9, height: 8, angle: 66, side: 'left' },
  ]);
  p.move(12, -10).face(0).platform([16, 30]);
  p.stage();
  // ---- 12: a pillar gauntlet into a jetpack gap ----
  p.platform([8, 8], 'hop');
  hopChain(p, {
    n: 8,
    first: 9,
    grow: 0.5,
    max: 12.5,
    turn: [0, -30, 60, -60, 60, -60, 60, -30],
    size: [4.5, 4.5],
  });
  for (let k = 0; k < 7; k++) wallBeside(p, k, k + 1, k % 2 ? 4.5 : -4.5, [2.2, 28, 2.2], 14);
  p.move(9).platform([8, 12]).jet(60);
  p.fuel();
  p.move(26).platform([10, 12]);
  basalt(p, 0, -26, 2, [14, 14]);
  p.stage();
  // ---- 13: the portal to the spire ----
  p.portal([380, 400, 420]);
  p.move(-1).stage([12, 12]);
  // ---- 14: a long surf descent with two flicks ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 75,
      drop: 16,
      height: 11,
      angle: 62,
      side: 'both',
      ride: 'left',
    },
    { gap: 16, fall: 8, shift: -9, length: 50, drop: 10, height: 9, angle: 64, side: 'right' },
    { gap: 16, fall: 8, shift: 9, length: 50, drop: 10, height: 9, angle: 65, side: 'left' },
    { turn: -25, gap: 20, fall: 9, length: 45, drop: 9, height: 9, angle: 65, side: 'right' },
    { turn: 25, gap: 20, fall: 9, length: 45, drop: 9, height: 8, angle: 66, side: 'left' },
  ]);
  p.move(12, -10).face(0).platform([16, 30]);
  basalt(p, 0, 30, 2, [16, 14]);
  p.stage();
  // ---- 15: up the spire: a launch pad, a jetpack gap, a narrow window, drop strafes ----
  p.platform([8, 12]).launch(34, 14, 1.5);
  p.move(-4).platform([8, 14]).jet(60);
  p.fuel();
  p.move(26).platform([6, 10], 'jump');
  p.window(5, [3.2, 4], [14, 16], -1);
  p.move(6, -1.5).platform([6, 8], 'jump');
  p.pads(
    [
      { d: 12.5, rise: -4, turn: -40, size: [4.5, 4.5] },
      { d: 13, rise: -4, turn: 80, size: [4.5, 4.5] },
      { d: 13, rise: -4, turn: -40, size: [4.5, 4.5] },
    ],
    'jump',
  );
  basalt(p, -6, -28, 3, [14, 14]);
  p.move(11).stage();
  // ---- 16: the last chain: accelerate, 17 m of air to the finish ----
  p.platform([8, 8], 'hop');
  hopChain(p, {
    n: 11,
    first: 9,
    grow: 0.55,
    max: 14.5,
    turn: [0, 7, 7, 7, 0, 0, -7, -7, -7, 0, 0],
    rise: -0.4,
    size: [4.5, 4.5],
  });
  p.move(20, -3).finish();
  return p.course({
    name: 'Ember Spire',
    kind: 'race',
    parSec: 210,
    palette: PALETTE,
    sky: {
      top: 0x2a1a3a,
      horizon: 0xff7a45,
      ground: 0x3a1a1a,
      sun: { dir: [0.9, 0.07, -0.2], color: 0xff8a4a, sizeDeg: 13 },
      sunLight: 0xffb080,
      fog: { near: 110, far: 480 },
      ambient: 0.95,
    },
    killY: 60,
    floors: [],
    autoFloors: { below: 22, pad: 30 },
    scenery: [
      {
        t: 'scatter',
        kind: 'island',
        count: 24,
        seed: 21,
        min: [-470, 160, -470],
        max: [470, 380, 470],
        size: [18, 44],
        clear: 45,
        style: 'basalt',
      },
      {
        t: 'scatter',
        kind: 'spire',
        count: 12,
        seed: 22,
        min: [-470, 130, -470],
        max: [470, 220, 470],
        size: [50, 110],
        clear: 50,
      },
      {
        t: 'scatter',
        kind: 'cloud',
        count: 26,
        seed: 23,
        min: [-470, 120, -470],
        max: [470, 260, 470],
        size: [30, 70],
        clear: 30,
      },
    ],
  });
};
