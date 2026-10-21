// A generated graybox layout for the builder's tests (graybox-build.test.ts): a city of rooms on
// a grid of n × n blocks (10 cells each), joined by two-cell corridors; every third column of
// rooms stands 3 m higher (smooth ramps lead up to it), and some rooms have a catwalk at 7 m
// reached by a ramp. Cyan spawns in the north-west room, Orange in the south-east one, site A in
// the north-east room and site B in the south-west one.
import type { GrayboxArea, GrayboxLayout } from '../src/index';

export const generatedLayout = (n: number, extra: Partial<GrayboxLayout> = {}): GrayboxLayout => {
  const size = n * 10;
  const ground = Array.from({ length: size }, () => Array<string>(size).fill('.'));
  const deck = Array.from({ length: size }, () => Array<string>(size).fill('.'));
  const legend: Record<string, GrayboxArea> = {
    c: { n: 'Low Corridor', k: 'room', h: 0 },
    C: { n: 'High Corridor', k: 'room', h: 3 },
    k: { n: 'Catwalk', k: 'room', h: 7 },
  };
  let next = 0x4e00;
  const fresh = (a: GrayboxArea) => {
    const ch = String.fromCharCode(next++);
    legend[ch] = a;
    return ch;
  };
  const high = (bx: number) => bx % 3 === 1;
  const roomChar: string[][] = [];
  for (let by = 0; by < n; by++) {
    roomChar.push([]);
    for (let bx = 0; bx < n; bx++) {
      const h = high(bx) ? 3 : 0;
      const ch =
        bx === 0 && by === 0
          ? 'Q'
          : bx === n - 1 && by === n - 1
            ? 'O'
            : bx === n - 1 && by === 0
              ? 'A'
              : bx === 0 && by === n - 1
                ? 'B'
                : fresh({ n: `Room ${bx}-${by}`, k: 'room', h });
      roomChar[by].push(ch);
      for (let y = 1; y <= 8; y++)
        for (let x = 1; x <= 8; x++) ground[by * 10 + y][bx * 10 + x] = ch;
    }
  }
  legend.Q = { n: 'Cyan Spawn', k: 'cyan', h: 0 };
  legend.O = { n: 'Orange Spawn', k: 'orange', h: high(n - 1) ? 3 : 0 };
  legend.A = { n: 'A Site', k: 'site', h: high(n - 1) ? 3 : 0 };
  legend.B = { n: 'B Site', k: 'site', h: 0 };
  for (let by = 0; by < n; by++)
    for (let bx = 0; bx < n; bx++) {
      const x0 = bx * 10;
      const y0 = by * 10;
      // east corridor (two cells long, two wide): a ramp where the heights differ
      if (bx + 1 < n) {
        const a = high(bx) ? 3 : 0;
        const b = high(bx + 1) ? 3 : 0;
        const ch =
          a === b
            ? a
              ? 'C'
              : 'c'
            : fresh({ n: `Ramp ${bx}-${by}`, k: 'ramp', r: [0, 3], dir: b > a ? 'e' : 'w' });
        for (const y of [4, 5]) for (const x of [9, 10]) ground[y0 + y][x0 + x] = ch;
      }
      // south corridor
      if (by + 1 < n) {
        const ch = high(bx) ? 'C' : 'c';
        for (const y of [9, 10]) for (const x of [4, 5]) ground[y0 + y][x0 + x] = ch;
      }
      // a catwalk across some low rooms, up a ramp along the room's north side
      if (!high(bx) && (bx + by) % 3 === 0 && roomChar[by][bx].charCodeAt(0) >= 0x4e00) {
        const ch = fresh({ n: `Catwalk Ramp ${bx}-${by}`, k: 'ramp', r: [0, 7], dir: 'e' });
        for (let x = 2; x <= 5; x++) ground[y0 + 2][x0 + x] = ch;
        for (let x = 6; x <= 8; x++) deck[y0 + 2][x0 + x] = 'k';
      }
    }
  return {
    name: `Generated ${size}`,
    cellM: 4,
    layers: [
      { name: 'Ground', y: 0, rows: ground.map((r) => r.join('')) },
      { name: 'Catwalks', y: 7, overlay: true, rows: deck.map((r) => r.join('')) },
    ],
    legend,
    ...extra,
  };
};
