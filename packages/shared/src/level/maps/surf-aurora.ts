// "Surf Aurora" — surf map 1 (beginner–intermediate): long, forgiving ramps over a frozen sea
// under an aurora night sky. Five stages; each starts in a walled room that caps your speed
// (no carrying speed in), ends on a landing and a big portal into the next stage's room.
// No jetpack, no SURGE. Built as course data (level/course).
//
//   1  long A-frames, straight transfers (55°)                                → stage 2
//   2  longer straight transfers                                              → stage 3
//   3  side-switch flicks (left face, right face, left...)                    → stage 4
//   4  a 90° turn in three transfers, a booster ring                          → stage 5
//   5  the curved finale: ramps swinging left and right                       → FINISH
import type { CourseData } from '../course/types';
import { Pen } from '../course/pen';
import { landmark, surfRun, type RampOpts } from '../course/sections';

const PALETTE = {
  ground: 0x5d7894,
  ground2: 0x6b88a6,
  rock: 0x3f4d60,
  rockDark: 0x2c3645,
  edge: 0x5cf2c0,
  surf: 0x3aa8e8,
  surfEdge: 0xb8fff0,
  stage: 0xe8f0f6,
  stageGlow: 0x5cf2c0,
  start: 0x4dff9a,
  finish: 0xff4d6a,
  portal: 0xb07cff,
  pad: 0xffd23c,
  arrow: 0xe8fff8,
  cloud: 0xe8f2fb,
  danger: 0xff4a6a,
  leaf: 0x3f7a6a,
  leafDark: 0x2c5a4f,
  trunk: 0x4a3f38,
  crystal: 0x9ff5ff,
  water: 0x7fd8ff,
  accent: 0xb07cff,
  accent2: 0x5cf2c0,
};

/** The speed a stage room lets you leave with (m/s): no carrying speed into a stage. */
const CAP = 9.5;

/** One surf stage: from the room at the pen, drop onto the ramps, land, the portal onward. */
const stage = (
  p: Pen,
  ramps: RampOpts[],
  next: [number, number, number] | null,
  name = '',
  side = 60,
) => {
  p.platform([8, 10], 'strafe');
  surfRun(p, ramps);
  p.move(14, -12).platform([16, 34]);
  if (next) {
    p.portal(next, [9, 10]);
    p.move(-1).stage([14, 14], CAP, name);
    landmark(p, side, side > 0 ? 'tower' : 'falls', 'snow');
  } else p.finish([16, 18]);
};

const A = { height: 14, angle: 55 };
const B = { height: 13, angle: 55 };

/** The course data (pure JSON). */
export const surfAuroraCourse = (): CourseData => {
  const p = new Pen([-380, 330, 420], 0);
  p.start();
  // ---- 1: long A-frames, straight transfers ----
  stage(
    p,
    [
      { entry: true, gap: 8, fall: 7, length: 80, drop: 14, ...A, side: 'both', ride: 'right' },
      { gap: 14, fall: 8, length: 80, drop: 14, ...A, side: 'both', ride: 'right' },
      { gap: 14, fall: 8, length: 80, drop: 14, ...A, side: 'both', ride: 'right' },
      { gap: 14, fall: 8, length: 80, drop: 14, ...A, side: 'both', ride: 'right' },
      { gap: 14, fall: 8, length: 80, drop: 14, ...A, side: 'both', ride: 'right' },
      { gap: 14, fall: 8, length: 70, drop: 12, ...A, side: 'both', ride: 'right' },
    ],
    [-200, 330, 420],
    'Longer transfers',
  );
  // ---- 2: longer straight transfers ----
  stage(
    p,
    [
      { entry: true, gap: 8, fall: 7, length: 70, drop: 14, ...A, side: 'both', ride: 'left' },
      { gap: 18, fall: 9, length: 65, drop: 12, ...B, side: 'left' },
      { gap: 18, fall: 9, length: 65, drop: 12, ...B, side: 'left' },
      { gap: 18, fall: 9, length: 65, drop: 12, ...B, side: 'left' },
      { gap: 18, fall: 9, length: 65, drop: 12, ...B, side: 'left' },
      { gap: 18, fall: 9, length: 65, drop: 12, ...B, side: 'left' },
      { gap: 18, fall: 9, length: 60, drop: 12, ...B, side: 'left' },
    ],
    [-20, 330, 420],
    'Flicks',
    -60,
  );
  // ---- 3: side-switch flicks ----
  stage(
    p,
    [
      { entry: true, gap: 8, fall: 7, length: 70, drop: 14, ...A, side: 'both', ride: 'right' },
      { gap: 16, fall: 8, shift: 10, length: 60, drop: 12, ...B, side: 'left' },
      { gap: 16, fall: 8, shift: -10, length: 60, drop: 12, ...B, side: 'right' },
      { gap: 16, fall: 8, shift: 10, length: 60, drop: 12, ...B, side: 'left' },
      { gap: 16, fall: 8, shift: -10, length: 60, drop: 12, ...B, side: 'right' },
      { gap: 16, fall: 8, shift: 10, length: 60, drop: 12, ...B, side: 'left' },
      { gap: 16, fall: 8, shift: -10, length: 55, drop: 11, ...B, side: 'right' },
    ],
    [160, 330, 420],
    'The turn',
  );
  // ---- 4: a 90° turn in three transfers, a booster ring ----
  {
    p.platform([8, 10], 'strafe');
    surfRun(p, [
      { entry: true, gap: 8, fall: 7, length: 70, drop: 14, ...A, side: 'both', ride: 'right' },
      { gap: 16, fall: 8, length: 70, drop: 13, ...A, side: 'both', ride: 'right' },
      { gap: 16, fall: 8, length: 70, drop: 13, ...A, side: 'both', ride: 'right' },
      { turn: 30, gap: 18, fall: 8, length: 55, drop: 11, ...B, side: 'left' },
      { turn: 30, gap: 18, fall: 8, length: 55, drop: 11, ...B, side: 'left' },
      { turn: 30, gap: 18, fall: 8, length: 55, drop: 11, ...B, side: 'left' },
    ]);
    // (off the last ramp through a ring that throws you on to a long last ramp)
    p.move(14, -3).booster(30, 3, true, [6, 6]);
    p.move(24, -8);
    p.surf({ length: 70, drop: 12, ...A, side: 'both', ride: 'right' });
    p.move(14, -12, -8).face(0).platform([34, 34]);
    p.portal([400, 330, 40], [9, 10]);
    p.move(-1).stage([14, 14], CAP, 'Curved finale');
    landmark(p, -60, 'arch', 'snow');
  }
  // ---- 5: the curved finale: ramps swinging left and right ----
  stage(
    p,
    [
      { entry: true, gap: 8, fall: 7, length: 70, drop: 14, ...A, side: 'both', ride: 'right' },
      { turn: -20, gap: 18, fall: 8, length: 55, drop: 11, ...B, side: 'right' },
      { turn: 20, gap: 18, fall: 8, length: 55, drop: 11, ...B, side: 'left' },
      { turn: 20, gap: 18, fall: 8, length: 55, drop: 11, ...B, side: 'left' },
      { turn: -20, gap: 18, fall: 8, length: 55, drop: 11, ...B, side: 'right' },
      { gap: 16, fall: 8, length: 60, drop: 12, ...A, side: 'both', ride: 'right' },
    ],
    null,
  );
  return p.course({
    name: 'Surf Aurora',
    kind: 'surf',
    parSec: 150,
    palette: PALETTE,
    sky: {
      top: 0x071a2e,
      horizon: 0x1f5a6a,
      ground: 0x0a1a2a,
      sun: { dir: [0.3, 0.5, -0.8], color: 0xe8f4ff, sizeDeg: 4 },
      sunLight: 0xa8e8ff,
      stars: true,
      fog: { near: 140, far: 540 },
      ambient: 0.95,
    },
    roomMat: 'sand',
    surfColors: [0x2f9fe8, 0x19d6a0, 0xa45cff, 0xff5aa0, 0xffb02e],
    killY: 40,
    floors: [],
    autoFloors: { below: 14, pad: 30 },
    scenery: [
      {
        t: 'scatter',
        kind: 'island',
        count: 20,
        seed: 31,
        min: [-470, 150, -470],
        max: [470, 320, 470],
        size: [18, 40],
        clear: 45,
        style: 'snow',
      },
      {
        t: 'scatter',
        kind: 'crystal',
        count: 16,
        seed: 32,
        min: [-470, 100, -470],
        max: [470, 200, 470],
        size: [20, 45],
        clear: 50,
      },
      {
        t: 'scatter',
        kind: 'cloud',
        count: 24,
        seed: 33,
        min: [-470, 100, -470],
        max: [470, 220, 470],
        size: [30, 70],
        clear: 30,
      },
    ],
  });
};
