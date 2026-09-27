// "Surf Cinder" — surf map 2 (hard): steep, narrow ramps over a sea of ash at dusk, lava
// glowing through the gaps. Seven stages, each started from a walled room that caps your speed
// and ended through a big portal. No jetpack, no SURGE. Built as course data (level/course).
//
//   1  fast straights: steep ramps, long gaps                                 → stage 2
//   2  a royal spin: left, right, right, left                                 → stage 3
//   3  a window to thread, then drop strafes onto offset ramps               → stage 4
//   4  a wall surf (78°) into a flick                                         → stage 5
//   5  a pillar weave between transfers                                      → stage 6
//   6  the needles: the steepest, narrowest ramps                            → stage 7
//   7  the mixed finale: a booster ring, flicks, a turn                     → FINISH
import type { CourseData } from '../course/types';
import { Pen } from '../course/pen';
import { surfRun, type RampOpts } from '../course/sections';

const PALETTE = {
  ground: 0x433836,
  ground2: 0x51443f,
  rock: 0x2d2624,
  rockDark: 0x1e1918,
  edge: 0xff8c2a,
  surf: 0xe0532e,
  surfEdge: 0xffe07a,
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
  accent: 0x8a2b1c,
  accent2: 0xffb347,
};

const CAP = 9.5;
const S = { height: 10, angle: 62 };
const N = { height: 8, angle: 65 };

/** The start of every stage after the first: the portal's room at `at` (heading north). */
const LANES: [number, number, number][] = [
  [-270, 330, 420],
  [-140, 330, 420],
  [-10, 330, 420],
  [120, 330, 420],
  [250, 330, 420],
  [380, 330, 420],
];

/** Land, then the portal to the next stage's room (or the finish). */
const end = (p: Pen, lane: number) => {
  p.move(14, -12).face(0).platform([22, 34]);
  if (lane < LANES.length) {
    p.portal(LANES[lane], [9, 10]);
    p.move(-1).stage([14, 14], CAP);
  } else p.finish([16, 18]);
};

const entry = (r: Omit<RampOpts, 'entry' | 'gap' | 'fall'>): RampOpts => ({
  entry: true,
  gap: 8,
  fall: 7,
  ...r,
});

/** The course data (pure JSON). */
export const surfCinderCourse = (): CourseData => {
  const p = new Pen([-400, 330, 420], 0);
  p.start();
  // ---- 1: fast straights ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    entry({ length: 70, drop: 16, height: 12, angle: 60, side: 'both', ride: 'right' }),
    { gap: 22, fall: 9, length: 50, drop: 11, ...S, side: 'right' },
    { gap: 24, fall: 10, length: 50, drop: 11, ...S, side: 'right' },
    { gap: 24, fall: 10, length: 45, drop: 10, ...S, side: 'right' },
    { gap: 26, fall: 11, length: 45, drop: 10, ...S, side: 'right' },
  ]);
  end(p, 0);
  // ---- 2: a royal spin ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    entry({ length: 70, drop: 16, height: 12, angle: 60, side: 'both', ride: 'right' }),
    { turn: -30, gap: 20, fall: 9, length: 45, drop: 10, ...S, side: 'right' },
    { turn: 30, gap: 20, fall: 9, length: 45, drop: 10, ...S, side: 'left' },
    { turn: 30, gap: 20, fall: 9, length: 45, drop: 10, ...S, side: 'left' },
    { turn: -30, gap: 20, fall: 9, length: 45, drop: 10, ...S, side: 'right' },
  ]);
  end(p, 1);
  // ---- 3: a window to thread, then drop strafes ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [entry({ length: 70, drop: 16, height: 12, angle: 60, side: 'both', ride: 'left' })]);
  // (a wall across the transfer: through its hole or into it)
  p.window(11, [8, 8], [26, 24], -6.5);
  p.move(11, -3.5, 0);
  p.surf({ length: 45, drop: 10, ...S, side: 'left' });
  surfRun(p, [
    { gap: 28, fall: 12, shift: -9, length: 45, drop: 10, ...S, side: 'right' },
    { gap: 28, fall: 12, shift: 9, length: 45, drop: 10, ...S, side: 'left' },
    { gap: 28, fall: 12, shift: -9, length: 40, drop: 9, ...S, side: 'right' },
  ]);
  end(p, 2);
  // ---- 4: a wall surf into a flick ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    entry({ length: 70, drop: 16, height: 12, angle: 60, side: 'both', ride: 'right' }),
    { gap: 18, fall: 8, length: 50, drop: 8, height: 14, angle: 72, side: 'right' },
    { gap: 20, fall: 10, shift: 10, length: 45, drop: 10, ...S, side: 'left' },
    { gap: 20, fall: 9, shift: -10, length: 45, drop: 10, ...S, side: 'right' },
    { gap: 18, fall: 8, length: 50, drop: 8, height: 14, angle: 72, side: 'right' },
    { gap: 20, fall: 10, shift: 10, length: 45, drop: 10, ...S, side: 'left' },
  ]);
  end(p, 3);
  // ---- 5: a pillar weave between transfers ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [entry({ length: 70, drop: 16, height: 12, angle: 60, side: 'both', ride: 'right' })]);
  for (let i = 0; i < 4; i++) {
    const s = i % 2 ? -1 : 1;
    // two basalt pillars flanking the flight, one pushed into the straight line
    p.wall(10, s * 3, [2.4, 34, 2.4], -26);
    p.wall(10, -s * 7, [2.4, 34, 2.4], -26);
    surfRun(p, [
      {
        gap: 20,
        fall: 9,
        shift: -s * 7,
        length: 42,
        drop: 9,
        ...S,
        side: s > 0 ? 'right' : 'left',
      },
    ]);
  }
  end(p, 4);
  // ---- 6: the needles ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    entry({ length: 70, drop: 16, height: 12, angle: 60, side: 'both', ride: 'left' }),
    { gap: 20, fall: 9, length: 38, drop: 8, ...N, side: 'left' },
    { gap: 22, fall: 10, shift: -8, length: 38, drop: 8, ...N, side: 'right' },
    { gap: 22, fall: 10, shift: 8, length: 38, drop: 8, ...N, side: 'left' },
    { gap: 22, fall: 10, shift: -8, length: 38, drop: 8, ...N, side: 'right' },
    { gap: 22, fall: 10, length: 38, drop: 8, height: 8, angle: 66, side: 'right' },
  ]);
  end(p, 5);
  // ---- 7: the mixed finale ----
  p.platform([8, 10], 'strafe');
  surfRun(p, [
    entry({ length: 70, drop: 16, height: 12, angle: 60, side: 'both', ride: 'right' }),
    { gap: 18, fall: 9, shift: 10, length: 45, drop: 10, ...S, side: 'left' },
  ]);
  p.move(14, -3).booster(32, 3, true, [6, 6]);
  p.move(26, -9);
  p.surf({ length: 60, drop: 12, height: 12, angle: 60, side: 'both', ride: 'right' });
  surfRun(p, [
    { turn: -25, gap: 20, fall: 9, length: 45, drop: 10, ...S, side: 'right' },
    { turn: 25, gap: 20, fall: 9, length: 45, drop: 10, ...S, side: 'left' },
    { gap: 20, fall: 9, shift: -9, length: 40, drop: 9, ...N, side: 'right' },
  ]);
  end(p, 6);
  return p.course({
    name: 'Surf Cinder',
    kind: 'surf',
    parSec: 150,
    palette: PALETTE,
    sky: {
      top: 0x2a1a3a,
      horizon: 0xff7045,
      ground: 0x3a1a1a,
      sun: { dir: [-0.85, 0.06, -0.3], color: 0xff7a3a, sizeDeg: 14 },
      sunLight: 0xffa878,
      fog: { near: 110, far: 480 },
      ambient: 0.95,
    },
    killY: 40,
    floors: [],
    autoFloors: { below: 14, pad: 30 },
    scenery: [
      {
        t: 'scatter',
        kind: 'island',
        count: 18,
        seed: 41,
        min: [-470, 150, -470],
        max: [470, 320, 470],
        size: [18, 40],
        clear: 40,
        style: 'basalt',
      },
      {
        t: 'scatter',
        kind: 'spire',
        count: 14,
        seed: 42,
        min: [-470, 110, -470],
        max: [470, 180, 470],
        size: [60, 120],
        clear: 40,
      },
      {
        t: 'scatter',
        kind: 'cloud',
        count: 22,
        seed: 43,
        min: [-470, 100, -470],
        max: [470, 200, 470],
        size: [30, 70],
        clear: 30,
      },
    ],
  });
};
