// Painted wall signs for graybox maps ("A →", "B SITE", "MID"), like the ones on CS maps: a
// small built-in pixel font (5 × 7 pixels per letter) drawn as thin unlit 'glow' boxes a
// centimetre or two in front of a wall. The boxes never collide (bullets, players and sight
// pass), they only show the text. Pixels of a letter are merged into as few boxes as possible
// (runs along each row, then equal runs stacked over several rows).
import type { Vec3 } from '../math/vec3';
import { v3 } from '../math/vec3';
import type { BoxDef } from './types';

/** 5 × 7 pixel letters: '#' is paint. */
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '←': ['.....', '..#..', '.#...', '#####', '.#...', '..#..', '.....'],
  '→': ['.....', '..#..', '...#.', '#####', '...#.', '..#..', '.....'],
  '↑': ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '..#..'],
  '↓': ['..#..', '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
};

/** Glyph width and height in pixels, and the gap after each letter / between lines. */
export const GLYPH_W = 5;
export const GLYPH_H = 7;
const GAP_X = 1;
const GAP_Y = 2;

/** Can the font draw this character? (lower case is drawn as upper case) */
export const hasGlyph = (ch: string): boolean => ch.toUpperCase() in FONT;

/** Width of a line of text in pixels. */
export const textWidthPx = (line: string): number => [...line].length * (GLYPH_W + GAP_X) - GAP_X;

/** Height of a (multi-line) text in pixels. */
export const textHeightPx = (lines: number): number => lines * (GLYPH_H + GAP_Y) - GAP_Y;

/** A rectangle of pixels: columns x0..x1, rows y0..y1 (row 0 at the top). */
interface Run {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const runCache = new Map<string, Run[]>();
const cachedRuns = (ch: string): Run[] => {
  let r = runCache.get(ch);
  if (!r) runCache.set(ch, (r = runsOf(ch)));
  return r;
};

/** The painted pixels of one letter as merged rectangles. */
const runsOf = (ch: string): Run[] => {
  const g = FONT[ch.toUpperCase()] ?? FONT[' '];
  const rows: Run[][] = g.map((row, y) => {
    const out: Run[] = [];
    for (let x = 0; x < GLYPH_W; x++) {
      if (row[x] !== '#') continue;
      let x1 = x;
      while (x1 + 1 < GLYPH_W && row[x1 + 1] === '#') x1++;
      out.push({ x0: x, x1, y0: y, y1: y });
      x = x1;
    }
    return out;
  });
  // stack equal runs of consecutive rows
  const done: Run[] = [];
  for (let y = 0; y < GLYPH_H; y++)
    for (const r of rows[y]) {
      if ((r as Run & { used?: boolean }).used) continue;
      let y1 = y;
      for (;;) {
        const next = rows[y1 + 1]?.find((q) => q.x0 === r.x0 && q.x1 === r.x1);
        if (!next) break;
        (next as Run & { used?: boolean }).used = true;
        y1++;
      }
      done.push({ x0: r.x0, x1: r.x1, y0: y, y1 });
    }
  return done;
};

/**
 * The boxes of a painted text on a wall. `centre`: where the middle of the text's bottom edge is
 * on the wall's face; `right`: the reader's right along the wall (a unit vector along x or z);
 * `normal`: out of the wall toward the reader; `px`: pixel size (m). Lines are split at '\n'.
 * The paint stands `proud` metres in front of the face (1–2 cm). `up` -1: the reader stands upside
 * down (a ceiling deck), so the text grows downward from `centre`.
 */
export const paintText = (
  text: string,
  centre: Vec3,
  right: Vec3,
  normal: Vec3,
  px: number,
  color: number,
  proud = 0.015,
  up: 1 | -1 = 1,
): BoxDef[] => {
  const lines = text.split('\n');
  const total = textHeightPx(lines.length);
  const out: BoxDef[] = [];
  const thick = 0.005;
  lines.forEach((line, li) => {
    const w = textWidthPx(line);
    // top of this line, in pixels above the text's bottom edge
    const top = total - li * (GLYPH_H + GAP_Y);
    [...line].forEach((ch, ci) => {
      const left = -w / 2 + ci * (GLYPH_W + GAP_X);
      for (const r of cachedRuns(ch)) {
        const u0 = (left + r.x0) * px;
        const u1 = (left + r.x1 + 1) * px;
        const v1 = (top - r.y0) * px;
        const v0 = (top - r.y1 - 1) * px;
        const u = (u0 + u1) / 2;
        const v = (v0 + v1) / 2;
        const hu = (u1 - u0) / 2;
        out.push({
          c: v3(
            centre.x + right.x * u + normal.x * proud,
            centre.y + up * v,
            centre.z + right.z * u + normal.z * proud,
          ),
          h: v3(
            Math.abs(right.x) * hu + Math.abs(normal.x) * thick,
            (v1 - v0) / 2,
            Math.abs(right.z) * hu + Math.abs(normal.z) * thick,
          ),
          mat: 'glow',
          color,
          noCollide: true,
        });
      }
    });
  });
  return out;
};
