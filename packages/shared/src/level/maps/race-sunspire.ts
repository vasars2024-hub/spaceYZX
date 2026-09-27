// "Sunspire" — race track 1 (medium): a sky temple over a sea of sunrise clouds. Warm cream
// stone, gold edge lines, sky-blue surf ramps, gardens on floating islands. Built as course
// data (level/course): the pen below writes plain JSON elements; expandCourse builds the level.
//
//   1  temple steps, a hop chain curving right, a first A-frame surf         → checkpoint 1
//   2  two surf ramps, a launch pad up, a window jump, stepping stones        → checkpoint 2
//   3  the portal up to the high terraces                                      → checkpoint 3
//   4  behind the wall: a hop chain curving round two tall blocks, a flick    → checkpoint 4
//   5  pillar weave, a launch pad, a beam, drop strafes                       → checkpoint 5
//   6  a curving surf run (three ramps turning left)                          → checkpoint 6
//   7  the portal to the west gardens                                          → checkpoint 7
//   8  a bhop acceleration chain into a speed gap, a booster, surf            → checkpoint 8
//   9  window rings, a last hop chain round the spire                          → FINISH
import type { CourseData, IslandStyle, P2 } from '../course/types';
import { Pen } from '../course/pen';
import { hopChain, landmark, surfRun, wallBeside } from '../course/sections';

const PALETTE = {
  ground: 0xc9a77a,
  ground2: 0xb99466,
  rock: 0x9a7c5c,
  rockDark: 0x735b43,
  edge: 0xffe08a,
  surf: 0x5fa9d6,
  surfEdge: 0xfff2b8,
  stage: 0xf3e9d6,
  stageGlow: 0xffb13b,
  start: 0x63d68a,
  finish: 0xff5a47,
  portal: 0xa77cff,
  pad: 0xff8a3c,
  arrow: 0xfff6dc,
  cloud: 0xfff3f6,
  danger: 0xff5a36,
  leaf: 0x86c25e,
  leafDark: 0x5f9c47,
  trunk: 0x7a5634,
  crystal: 0x9fe6ff,
  water: 0x5cb6e2,
  accent: 0xc9553e,
  accent2: 0xffd98a,
};

/** A garden island beside the way: trees, a lantern, a waterfall off its edge. */
const garden = (
  p: Pen,
  f: number,
  s: number,
  u: number,
  size: P2,
  style: IslandStyle = 'grass',
) => {
  const at = p.rel(f, s, u);
  const top: [number, number, number] = [at.x, at.y, at.z];
  p.deco({
    t: 'island',
    at: top,
    size,
    depth: Math.max(size[0], size[1]) * 0.7,
    style,
    heading: p.heading,
  });
  const t = (df: number, ds: number, h: number, kind: 'pine' | 'broad' = 'broad') => {
    const q = p.rel(f + df, s + ds, u);
    p.deco({ t: 'tree', at: [q.x, q.y, q.z], height: h, kind });
  };
  t(-size[1] * 0.2, -size[0] * 0.2, 7);
  t(size[1] * 0.15, size[0] * 0.2, 5, 'pine');
  const l = p.rel(f + size[1] * 0.25, s - size[0] * 0.25, u);
  p.deco({ t: 'lantern', at: [l.x, l.y, l.z] });
  // (off the island's far side: its top edge)
  const w = p.rel(f, s + (s >= 0 ? size[0] / 2 : -size[0] / 2), u);
  p.deco({
    t: 'waterfall',
    at: [w.x, w.y, w.z],
    heading: (p.heading + (s >= 0 ? 90 : 270)) % 360,
    width: 3,
    drop: 18,
  });
};

/** The course data (pure JSON). */
export const sunspireCourse = (): CourseData => {
  const p = new Pen([150, 200, 440], 0);
  // ---- 1: the temple steps, a hop chain curving right, a first A-frame ----
  p.start();
  garden(p, 6, -22, -2, [12, 14]);
  garden(p, 30, 24, 4, [10, 12]);
  p.platform([8, 12], 'jump');
  p.move(6.5).pads(
    [
      { d: 2.5 },
      { d: 9, turn: 8 },
      { d: 9.5, turn: 8 },
      { d: 10, turn: 8 },
      { d: 10.5, turn: 8 },
      { d: 11.5, turn: 8 },
      { d: 12.5 },
    ],
    'hop',
  );
  p.move(10, -1).platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 45,
      drop: 9,
      height: 12,
      angle: 55,
      side: 'both',
      ride: 'right',
    },
  ]);
  p.move(12, -9).platform([10, 26]);
  garden(p, 14, -24, 2, [12, 12]);
  p.stage(undefined, undefined, 'Twin ramps');
  landmark(p, 60, 'tower', 'grass', 0xf3e9d6);
  // ---- 2: two surf ramps, a launch pad up, a window jump, stepping stones ----
  p.platform([8, 8], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 70,
      drop: 14,
      height: 14,
      angle: 55,
      side: 'both',
      ride: 'right',
    },
    { gap: 16, fall: 8, length: 60, drop: 12, height: 12, angle: 57, side: 'right' },
  ]);
  p.move(12, -10).platform([10, 30]);
  p.turnPad(-40, 10).launch(34, 14, 1.5);
  p.move(-4).platform([9, 14], 'jump');
  p.window(5, [5, 4.5], [14, 16], -1);
  p.move(6, -1.2).pads(
    [
      { d: 0, size: [6, 6] },
      { d: 9.5, turn: -30, rise: 0.5 },
      { d: 9.5, turn: -30, rise: 0.5 },
    ],
    'jump',
  );
  garden(p, 0, 26, 3, [12, 10]);
  p.face(270).move(10).stage(undefined, undefined, 'Portal to the terraces');
  landmark(p, -60, 'arch', 'grass', 0xf3e9d6);
  // ---- 3: the portal up to the high terraces ----
  p.portal([440, 330, -80]);
  p.move(-1).stage([12, 12], undefined, 'Behind the wall');
  landmark(p, 60, 'falls', 'grass', 0xf3e9d6);
  // ---- 4: behind the wall — a hop chain curving right round two tall blocks, a flick ----
  p.platform([8, 8], 'hop');
  hopChain(p, { n: 8, first: 9, grow: 0.4, max: 11.5, turn: 12, size: [6, 6], vary: true });
  wallBeside(p, 1, 3, 12, [6, 30, 16]);
  wallBeside(p, 4, 6, 12, [6, 30, 16]);
  p.move(9).platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 60,
      drop: 12,
      height: 13,
      angle: 56,
      side: 'both',
      ride: 'right',
    },
    { gap: 14, fall: 8, shift: 9, length: 55, drop: 10, height: 12, angle: 58, side: 'left' },
    { gap: 14, fall: 8, shift: -9, length: 50, drop: 10, height: 12, angle: 58, side: 'right' },
  ]);
  p.move(12, -10).platform([10, 30]);
  p.stage(undefined, undefined, 'Pillar weave');
  landmark(p, -60, 'tower', 'grass', 0xf3e9d6);
  // ---- 5: a pillar weave, a launch pad, a beam, drop strafes ----
  p.turnPad(-82, 12, 'hop');
  hopChain(p, {
    n: 7,
    first: 9,
    grow: 0.5,
    max: 12,
    turn: [0, 24, -48, 48, -48, 48, -24],
    size: [5, 5],
    vary: true,
  });
  for (let k = 0; k < 6; k++) wallBeside(p, k, k + 1, k % 2 ? 5.5 : -5.5, [2.5, 26, 2.5], 13);
  p.move(9).platform([8, 12]).launch(30, 10, 1.4);
  p.move(-4).platform([8, 12]);
  p.path(p.relP(26), 1.2, 'beam');
  p.go('jump');
  p.pads(
    [
      { d: 11, rise: -4, turn: 25, size: [6, 6] },
      { d: 12, rise: -4, turn: -50, size: [6, 6] },
      { d: 12, rise: -4, turn: 50, size: [6, 6] },
    ],
    'jump',
  );
  garden(p, 0, -24, 2, [12, 12]);
  p.turn(-25).move(10).stage(undefined, undefined, 'Curving ramps');
  landmark(p, 60, 'arch', 'grass', 0xf3e9d6);
  // ---- 6: a curving surf run: three ramps turning left ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 60,
      drop: 12,
      height: 13,
      angle: 56,
      side: 'both',
      ride: 'right',
    },
    { turn: -25, gap: 15, fall: 8, length: 55, drop: 10, height: 12, angle: 58, side: 'right' },
    { turn: -25, gap: 15, fall: 8, length: 55, drop: 10, height: 12, angle: 58, side: 'right' },
  ]);
  p.move(12, -10).face(180).platform([16, 30]);
  p.stage(undefined, undefined, 'Portal to the gardens');
  landmark(p, -60, 'falls', 'grass', 0xf3e9d6);
  // ---- 7: the portal to the west gardens ----
  p.portal([-330, 300, -380]);
  p.move(-1).stage([12, 12], undefined, 'Speed gap');
  landmark(p, 60, 'tower', 'grass', 0xf3e9d6);
  // ---- 8: a bhop acceleration chain, a speed gap, a booster, surf ----
  p.platform([8, 10], 'hop');
  hopChain(p, {
    n: 10,
    first: 9,
    grow: 0.45,
    max: 13,
    turn: [0, 10, 10, 10, 0, -12, -12, -12, 0, 8],
    size: [6, 6],
    vary: true,
  });
  // the speed gap: 15 m of air, 3 m down (a running jump falls short: carry your hop speed)
  p.move(18.5, -3).platform([10, 10]);
  p.booster(26, 3);
  p.move(20, -4.5).surf({
    length: 60,
    drop: 12,
    height: 13,
    angle: 56,
    side: 'both',
    ride: 'left',
  });
  p.move(12, -10).platform([10, 30]);
  p.stage(undefined, undefined, 'Booster rings');
  landmark(p, -60, 'arch', 'grass', 0xf3e9d6);
  // ---- 9: booster rings through the air, drop strafes ----
  p.platform([8, 12], 'jump');
  p.move(6, -0.5).booster(22, 5, true, [4, 4.5]);
  p.move(18, -2.6).booster(24, 4, true, [4, 4.5]);
  p.move(14, -6).platform([10, 22]);
  p.go('jump');
  p.pads(
    [
      { d: 12.5, rise: -3, turn: -20, size: [6, 6] },
      { d: 12, rise: -3, turn: 40, size: [6, 6] },
      { d: 12, rise: -3, turn: -40, size: [6, 6] },
      { d: 12, rise: -3, turn: 20, size: [6, 6] },
    ],
    'jump',
  );
  garden(p, -6, 24, 3, [14, 12]);
  p.move(11).stage(undefined, undefined, 'Flick and sweep');
  landmark(p, 60, 'falls', 'grass', 0xf3e9d6);
  // ---- 10: surf: a side-switch flick, then a sweeping turn right ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 60,
      drop: 12,
      height: 13,
      angle: 56,
      side: 'both',
      ride: 'left',
    },
    { gap: 14, fall: 8, shift: -10, length: 55, drop: 10, height: 12, angle: 58, side: 'right' },
    { turn: -30, gap: 15, fall: 8, length: 55, drop: 10, height: 12, angle: 58, side: 'right' },
    { turn: -30, gap: 15, fall: 8, length: 50, drop: 10, height: 12, angle: 58, side: 'right' },
  ]);
  p.move(12, -10).face(90).platform([16, 30]);
  p.stage(undefined, undefined, 'Portal to the spire');
  landmark(p, -60, 'tower', 'grass', 0xf3e9d6);
  // ---- 11: the portal to the spire; behind the wall to the left, a launch pad up ----
  p.portal([-120, 330, 420]);
  p.move(-1).stage([12, 12], undefined, 'Round the spire');
  landmark(p, 60, 'arch', 'grass', 0xf3e9d6);
  p.turnPad(-90, 12, 'hop');
  hopChain(p, { n: 8, first: 9, grow: 0.4, max: 11.5, turn: -12, size: [6, 6], vary: true });
  wallBeside(p, 1, 3, -12, [6, 30, 16]);
  wallBeside(p, 4, 6, -12, [6, 30, 16]);
  p.face(270).move(10).platform([10, 14]).launch(34, 12, 1.5);
  p.move(-4).platform([10, 14]);
  garden(p, 0, 26, 3, [14, 12]);
  p.stage(undefined, undefined, 'Portal to the temple');
  landmark(p, -60, 'falls', 'grass', 0xf3e9d6);
  // ---- 13: the portal to the heart of the temple: the grand surf ----
  p.portal([10, 370, -330]);
  p.move(-1).stage([12, 12], undefined, 'The grand surf');
  landmark(p, 60, 'tower', 'grass', 0xf3e9d6);
  p.turnPad(-90, 12).platform([8, 10], 'strafe');
  surfRun(p, [
    {
      entry: true,
      gap: 8,
      fall: 7,
      length: 70,
      drop: 14,
      height: 14,
      angle: 55,
      side: 'both',
      ride: 'right',
    },
    { gap: 15, fall: 8, shift: 10, length: 55, drop: 10, height: 12, angle: 58, side: 'left' },
    { gap: 15, fall: 8, shift: -10, length: 55, drop: 10, height: 12, angle: 58, side: 'right' },
    { turn: -30, gap: 15, fall: 8, length: 50, drop: 10, height: 12, angle: 58, side: 'right' },
    { turn: -30, gap: 15, fall: 8, length: 50, drop: 10, height: 12, angle: 58, side: 'right' },
  ]);
  p.move(12, -10).platform([12, 30]);
  garden(p, 10, 26, 2, [14, 12]);
  p.stage(undefined, undefined, 'Beams and window');
  landmark(p, -60, 'arch', 'grass', 0xf3e9d6);
  // ---- 14: beams and a window: launch up, zigzag beams, thread the wall ----
  p.platform([8, 12]).launch(32, 12, 1.5);
  p.move(-4).platform([8, 10]);
  p.path(p.relP(20, 5), 1.2, 'beam');
  p.go('jump');
  p.turn(15).move(5).platform([4, 4]);
  p.path(p.relP(20, -6), 1.2, 'beam');
  p.go('jump');
  p.turn(-15).move(5).platform([6, 8], 'jump');
  p.window(5, [4.5, 4.5], [14, 16], -1);
  p.move(6, -1.5).platform([8, 12]);
  garden(p, 0, -26, 3, [12, 12]);
  p.stage(undefined, undefined, 'The last chain');
  landmark(p, 60, 'falls', 'grass', 0xf3e9d6);
  // ---- 15: the last chain: accelerate, clear the gap to the finish ----
  p.platform([8, 8], 'hop');
  hopChain(p, {
    n: 10,
    first: 9,
    grow: 0.5,
    max: 13.5,
    turn: [0, -10, -10, -10, -10, -10, -10, -10, 0, 0],
    rise: -0.4,
    size: [6, 6],
    vary: true,
  });
  // (15 m of air, 3 m down: carry your speed or fall)
  p.move(20, -3).finish();
  return p.course({
    name: 'Sunspire',
    kind: 'race',
    parSec: 180,
    palette: PALETTE,
    sky: {
      top: 0x5a8fd8,
      horizon: 0xffc9a2,
      ground: 0xf5d8c8,
      sun: { dir: [0.8, 0.14, 0.3], color: 0xffd08a, sizeDeg: 4.5 },
      sunLight: 0xffe6c8,
      fog: { near: 140, far: 560 },
      ambient: 1.05,
    },
    roomMat: 'sand',
    surfColors: [0x5fa9d6, 0x55c7a4, 0x8f86e0],
    killY: 60,
    floors: [],
    autoFloors: { below: 22, pad: 30 },
    scenery: [
      {
        t: 'scatter',
        kind: 'island',
        count: 26,
        seed: 1,
        min: [-470, 150, -470],
        max: [470, 340, 470],
        size: [18, 46],
        clear: 45,
      },
      {
        t: 'scatter',
        kind: 'cloud',
        count: 30,
        seed: 2,
        min: [-470, 120, -470],
        max: [470, 260, 470],
        size: [30, 70],
        clear: 30,
      },
    ],
  });
};
