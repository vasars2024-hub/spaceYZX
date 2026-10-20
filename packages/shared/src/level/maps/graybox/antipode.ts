// Antipode (graybox, the 2026 map rework, round 2): the ship where the other team stands on your
// sky. Two decks face each other 10 m apart: Cyan (CT, defends) lives on the FLOOR deck (y 0,
// normal gravity) at the west end; Orange (T, attacks) lives on the CEILING deck (y 10, gravity
// pulls up: they walk it upside down) at the east end. 4 m cells, 32 × 20.
//
// Every room is a normal room: no zero-G, no wall runs, no gravity chains. The ONLY ways from one
// deck to the other are three TURN corridors, each one straight line you can read from its foot:
//   a floor ramp (smooth, 5 cells, 7.2 m up) → a short landing → the ceiling deck's doorway.
//   Walk off the landing into the doorway and the ceiling deck's gravity takes you: you fall
//   "up" 1 m and turn over in 0.3 s (the same turn as a ceiling spawn), still facing the way you
//   walked. The other way round you fall 1 m onto the landing and walk down the ramp.
//     West Turn  — Cyan's spawn → straight up to B (the CT's way onto B).
//     Mid Turn   — Floor Mid ↔ Upper Mid (the rotation in the middle).
//     East Turn  — Orange's south door ↔ Lower East (the T's way down to A).
// Sites: A on the floor deck (south of Floor Mid), B on the ceiling deck (north-west, over the
// CT side). Cyan reaches each site about 3–5 s before Orange (antipode-graybox.test.ts measures
// the routes). Painted signs at every junction and turn ("A →", "TO CEILING ↑"…).
//
// The builder (level/graybox.ts) never joins areas of different orientation, so after it the
// turns get their bot links here (landing ↔ doorway, both ways), and a filler block under each
// doorway so its edge is flush with the landing (no 2 m step down into the turn).
import type { BoxDef, LevelDef } from '../../types';
import { v3 } from '../../../math/vec3';
import { buildGraybox, type GrayboxLayout, type GrayboxSign } from '../../graybox';

/** the ceiling deck's height (m) */
const DECK = 10;
/** a turn's landing: 2.8 m under the ceiling deck, so the fall either way is 1 m */
const LANDING = DECK - 2.8;

/** the three turns: landing area (floor layer) → doorway area (ceiling layer) */
export const ANTIPODE_TURNS: { name: string; landing: string; door: string }[] = [
  { name: 'West Turn', landing: 'x', door: 'Y' },
  { name: 'Mid Turn', landing: 'y', door: 'Z' },
  { name: 'East Turn', landing: 'z', door: 'X' },
];

type Dir = 'n' | 's' | 'e' | 'w';
const BACK: Record<Dir, Dir> = { n: 's', s: 'n', e: 'w', w: 'e' };
/** your right hand when you look this way: standing upright / upside down (ceiling deck) */
const RIGHT_UP: Record<Dir, Dir> = { n: 'e', e: 's', s: 'w', w: 'n' };
const RIGHT_DOWN: Record<Dir, Dir> = { n: 'w', w: 's', s: 'e', e: 'n' };

/**
 * A painted sign on the WALL cell (x, y) of layer l (0 floor deck, 1 ceiling deck), on its
 * `face` side (you read it standing in the next cell that way, looking back at the wall). Each
 * part names a place and the map direction it lies in; the arrow is worked out as the reader
 * sees it — upside down on the ceiling deck left and right swap, so the arrows do too.
 */
const sign = (x: number, y: number, l: 0 | 1, face: Dir, ...parts: [string, Dir][]) => {
  const look = BACK[face];
  const right = (l === 1 ? RIGHT_DOWN : RIGHT_UP)[look];
  const text = parts
    .map(([what, way]) =>
      way === look
        ? `${what} ↑`
        : way === right
          ? `${what} →`
          : way === BACK[right]
            ? `← ${what}`
            : `${what} ↓`,
    )
    .join('   ');
  return { x, y, l, face, text };
};

/** the floor deck's way up / the ceiling deck's way down at each turn */
const UP_SIGN = 'TO CEILING';
const DOWN_SIGN = 'TO FLOOR';

const SIGNS: GrayboxSign[] = [
  // ---- floor deck (Cyan's) ----
  // CT spawn: B is up the West Turn (north-west), Mid and A out of the east and south doors
  sign(4, 7, 0, 's', [`B · ${UP_SIGN}`, 'w']),
  sign(5, 12, 0, 'n', ['MID', 'e'], ['A', 's']),
  sign(5, 8, 0, 's', ['MID', 'e']),
  sign(1, 13, 0, 'e', ['A', 's']),
  // the West Turn: up the ramp, then the landing turns you onto the ceiling deck (B)
  sign(1, 5, 0, 'e', [`B · ${UP_SIGN}`, 'n']),
  sign(4, 2, 0, 'w', [`B · ${UP_SIGN}`, 'n']),
  // Floor Mid: the Mid Turn east, A south-west, CT spawn west
  sign(14, 9, 0, 'w', [`${UP_SIGN} (U MID)`, 's']),
  sign(14, 12, 0, 'w', [`${UP_SIGN} (U MID)`, 'n']),
  sign(11, 13, 0, 'n', ['A', 'w']),
  sign(8, 13, 0, 'n', ['A', 's']),
  sign(7, 12, 0, 'n', ['CT SPAWN', 'w']),
  sign(19, 9, 0, 's', [UP_SIGN, 'e']),
  // A short / South Hall / A
  sign(11, 13, 0, 's', ['A', 'e']),
  sign(3, 17, 0, 'n', ['A', 'e'], ['CT SPAWN', 'n']),
  sign(17, 14, 0, 'w', ['A SITE', 'w']),
  sign(17, 15, 0, 's', ['A', 'w'], ['EAST TURN', 'e']),
  // Lower East and the East Turn (the T's way down)
  sign(19, 15, 0, 'e', ['A', 'w']),
  sign(24, 15, 0, 'w', [`${UP_SIGN} (T SPAWN)`, 's']),
  sign(24, 18, 0, 'w', [`${UP_SIGN} (T SPAWN)`, 'n']),
  sign(29, 15, 0, 's', [UP_SIGN, 'e']),
  // ---- ceiling deck (Orange's) ----
  // T spawn: B out of the north door, Mid out of the west door, A out of the south door
  sign(30, 9, 1, 'w', ['B', 'n'], ['A', 's']),
  sign(25, 7, 1, 's', ['MID', 'w']),
  sign(26, 12, 1, 'n', ['A · EAST TURN', 's']),
  // the north corridor and B Halls to B
  sign(27, 1, 1, 's', ['B', 'w']),
  sign(21, 5, 1, 's', ['B', 'w']),
  sign(23, 7, 1, 'w', ['B', 'n'], [`A · ${DOWN_SIGN}`, 's']),
  // Upper Mid: the Mid Turn's door west (down to Floor Mid, then A)
  sign(20, 9, 1, 'e', [`A · ${DOWN_SIGN}`, 's']),
  sign(21, 12, 1, 'n', [`A · ${DOWN_SIGN}`, 'w']),
  // B and the West Turn's door (down to the CT spawn)
  sign(10, 6, 1, 'n', ['B SITE', 's']),
  sign(15, 4, 1, 'n', ['B', 'w']),
  sign(5, 2, 1, 'e', [`${DOWN_SIGN} · CT`, 'n']),
  sign(4, 2, 1, 'n', ['B', 'e']),
  // T South: the East Turn's door
  sign(29, 15, 1, 'n', [`A · ${DOWN_SIGN}`, 'e']),
];

export const ANTIPODE_GRAYBOX_LAYOUT: GrayboxLayout = {
  name: 'Antipode',
  cellM: 4,
  theme: 'station',
  layers: [
    {
      name: 'Floor deck (Cyan’s up)',
      y: 0,
      rows: [
        '................................', // 0
        '................................', // 1
        '..xx............................', // 2
        '..ww............................', // 3
        '..ww............................', // 4
        '..ww............................', // 5
        '..ww............................', // 6
        '..ww............................', // 7
        '.CCCC...mmmmmm..................', // 8
        '.CCCClllmmmmmm..................', // 9
        '.CCCClllmm..mmvvvvvy............', // 10
        '.CCCClllmmmmmmvvvvvy............', // 11
        '.CCCC...mmmmmm..................', // 12
        '..ss.....gg.....................', // 13
        '..ss.....gggaaaaa...eeee........', // 14
        '..qqqqqqqqqqaaaaa...eeee........', // 15
        '..qqqqqqqqqqaaaaahhheeeeuuuuuz..', // 16
        '............aaaaahhheeeeuuuuuz..', // 17
        '............aaaaa...eeee........', // 18
        '................................', // 19
      ],
    },
    {
      name: 'Ceiling deck (Orange’s up, 10 m)',
      y: DECK,
      o: 'down',
      rows: [
        '................................', // 0
        '..YYYYBBBBBLLLL.................', // 1
        '......BBBBBLLLLNNNNNNNNNNNNNN...', // 2
        '......BBBBBLLLLNNNNNNNNNNNNNN...', // 3
        '......BBBBB................RR...', // 4
        '......BBBBBkk..............RR...', // 5
        '...........kkKKKKKKKKK.....RR...', // 6
        '.....................MM...OOOO..', // 7
        '.....................MMPPPOOOO..', // 8
        '.....................MMPPPOOOO..', // 9
        '....................ZMMPPPOOOO..', // 10
        '....................ZMM...OOOO..', // 11
        '...........................TTTT.', // 12
        '...........................TTTT.', // 13
        '...........................TTTT.', // 14
        '..............................X.', // 15
        '..............................X.', // 16
        '..............................X.', // 17
        '................................', // 18
        '................................', // 19
      ],
    },
  ],
  legend: {
    // floor deck
    C: { n: 'CT Spawn', k: 'cyan', h: 0, s: 'CT' },
    w: { n: 'West Turn', k: 'ramp', r: [0, LANDING], dir: 'n' },
    x: { n: 'West Turn Top', k: 'room', h: LANDING, s: 'W Turn' },
    l: { n: 'CT Lobby', k: 'room', h: 0 },
    m: { n: 'Floor Mid', k: 'room', h: 0, s: 'Mid' },
    g: { n: 'A Short', k: 'room', h: 0 },
    v: { n: 'Mid Turn', k: 'ramp', r: [0, LANDING], dir: 'e' },
    y: { n: 'Mid Turn Top', k: 'room', h: LANDING, s: 'M Turn' },
    s: { n: 'CT South', k: 'room', h: 0 },
    q: { n: 'South Hall', k: 'room', h: 0, s: 'South' },
    a: { n: 'A Site', k: 'site', h: 0, s: 'A' },
    h: { n: 'A Long', k: 'room', h: 0 },
    e: { n: 'Lower East', k: 'room', h: 0, s: 'L East' },
    u: { n: 'East Turn', k: 'ramp', r: [0, LANDING], dir: 'e' },
    z: { n: 'East Turn Top', k: 'room', h: LANDING, s: 'E Turn' },
    // ceiling deck
    O: { n: 'T Spawn', k: 'orange', h: DECK, s: 'T' },
    P: { n: 'T Lobby', k: 'room', h: DECK },
    M: { n: 'Upper Mid', k: 'room', h: DECK, s: 'U Mid' },
    Z: { n: 'Mid Turn Door', k: 'room', h: DECK, s: 'M Door' },
    R: { n: 'T North', k: 'room', h: DECK },
    N: { n: 'Upper North', k: 'room', h: DECK, s: 'U North' },
    K: { n: 'B Halls', k: 'room', h: DECK },
    k: { n: 'B Short', k: 'room', h: DECK },
    L: { n: 'B Long', k: 'room', h: DECK },
    B: { n: 'B Site', k: 'site', h: DECK, s: 'B' },
    Y: { n: 'West Turn Door', k: 'room', h: DECK, s: 'W Door' },
    T: { n: 'T South', k: 'room', h: DECK },
    X: { n: 'East Turn Door', k: 'room', h: DECK, s: 'E Door' },
  },
  signs: SIGNS,
};

/**
 * The turns, after the builder: bot links between each landing cell and the doorway cell beside
 * it (both ways — a bot walks off the landing, turns over and walks on), and a filler block
 * under each such doorway cell from the deck boundary up to the landing's floor.
 */
export const withTurns = (
  def: LevelDef,
  lay: GrayboxLayout = ANTIPODE_GRAYBOX_LAYOUT,
): LevelDef => {
  const s = lay.cellM;
  const [floor, ceiling] = lay.layers;
  const wps = def.waypoints!;
  const wpAt = (name: string) => {
    const i = wps.findIndex((w) => w.name === name);
    if (i < 0) throw new Error(`Antipode: no waypoint ${name}`);
    return i;
  };
  const link = (a: number, b: number) => {
    if (!wps[a].links.includes(b)) wps[a].links.push(b);
  };
  const fillers: BoxDef[] = [];
  const boundary = (floor.y + ceiling.y) / 2;
  for (const t of ANTIPODE_TURNS) {
    let joined = 0;
    floor.rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== t.landing) return;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          if (ceiling.rows[y + dy]?.[x + dx] !== t.door) continue;
          const a = wpAt(`${t.landing}0:${x},${y}`);
          const b = wpAt(`${t.door}1:${x + dx},${y + dy}`);
          link(a, b);
          link(b, a);
          joined++;
          const top = lay.legend[t.landing].h!;
          fillers.push({
            c: v3((x + dx + 0.5) * s, (boundary + top) / 2, (y + dy + 0.5) * s),
            h: v3(s / 2, (top - boundary) / 2, s / 2),
            mat: 'hull',
          });
        }
      }),
    );
    if (!joined) throw new Error(`Antipode: ${t.name} has no landing beside its door`);
  }
  return { ...def, boxes: [...def.boxes, ...fillers] };
};

export const buildAntipodeGraybox = (): LevelDef =>
  withTurns(buildGraybox(ANTIPODE_GRAYBOX_LAYOUT));
