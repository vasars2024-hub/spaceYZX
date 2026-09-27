// Checks a Map Maker doc that came from anywhere (a player's browser, the network, the database)
// before anything uses it: every field's type and range, the limits (CUSTOM_MAP_LIMITS) and the
// references between fields. Returns a clean copy holding only the known fields, or the list
// of problems. Never throws.
import {
  blockPieceCount,
  boxAabb,
  customPortalDefs,
  expandCustomBlock,
  isBuiltInMap,
  isCurveShape,
  maxWaveAmplitude,
} from './compile';
import type {
  CustomBlock,
  CustomGate,
  CustomLaunchPad,
  CustomMapDoc,
  CustomMaterial,
  CustomMover,
  CustomPortal,
  CustomShape,
  CustomSky,
  CustomSpawn,
} from './types';
import { CUSTOM_MAP_LIMITS, CUSTOM_MAP_VERSION } from './types';

type Vec = [number, number, number];

const MATERIALS: readonly CustomMaterial[] = [
  'concrete',
  'metal',
  'wood',
  'rock',
  'sand',
  'grass',
  'ice',
  'glass',
  'neon',
  'killpaint',
];
const SHAPES: readonly CustomShape[] = [
  'box',
  'wedge',
  'surf',
  'surfSide',
  'curveSurf',
  'curveRamp',
  'quarterPipe',
  'curvePlatform',
  'cylinder',
  'killpaint',
];
const CURVE_KINDS: readonly NonNullable<NonNullable<CustomBlock['curve']>['kind']>[] = [
  'arc',
  'sCurve',
  'spiral',
  'wave',
];
const SKIES: readonly CustomSky[] = ['day', 'sunset', 'night', 'space', 'aurora'];

/** Limits of this checker (beyond CUSTOM_MAP_LIMITS). */
const MAX_SIZE = 2 * CUSTOM_MAP_LIMITS.maxCoord;
const MAX_SPAWNS = 64;
const MAX_LAUNCH_PADS = 64;
const MAX_REMOVED = 20000;
const MAX_REMOVED_DEVICES = 200;
const MAX_BASE_ID = 60;
const MAX_FINGERPRINT = 60;
/** every compiled piece stays inside the network's ±500 m */
const NET_RANGE = 500;

/** Pieces a doc's blocks expand into (curves count as their pieces). */
export const countPieces = (doc: Pick<CustomMapDoc, 'blocks'>): number => {
  let n = 0;
  for (const b of doc.blocks) n += blockPieceCount(b);
  return n;
};

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

export const validateCustomMap = (
  raw: unknown,
): { ok: true; doc: CustomMapDoc } | { ok: false; errors: string[] } => {
  const errors: string[] = [];
  const err = (m: string): void => {
    if (errors.length < 50) errors.push(m);
  };
  if (!isObj(raw)) return { ok: false, errors: ['not a map'] };
  try {
    const bytes = JSON.stringify(raw).length;
    if (bytes > CUSTOM_MAP_LIMITS.maxBytes) return { ok: false, errors: ['the map is too big'] };
  } catch {
    return { ok: false, errors: ['not a map'] };
  }

  const num = (x: unknown, at: string, lo: number, hi: number): number => {
    if (!fin(x) || x < lo || x > hi) {
      err(`${at}: must be a number from ${lo} to ${hi}`);
      return lo;
    }
    return x === 0 ? 0 : x; // (no -0)
  };
  const int = (x: unknown, at: string, lo: number, hi: number): number => {
    const n = num(x, at, lo, hi);
    if (fin(x) && !Number.isInteger(x)) err(`${at}: must be a whole number`);
    return n;
  };
  const vec = (x: unknown, at: string, lo: number, hi: number): Vec => {
    if (!Array.isArray(x) || x.length !== 3) {
      err(`${at}: must be 3 numbers`);
      return [lo, lo, lo];
    }
    return [
      num(x[0], `${at}[0]`, lo, hi),
      num(x[1], `${at}[1]`, lo, hi),
      num(x[2], `${at}[2]`, lo, hi),
    ];
  };
  const coord = (x: unknown, at: string): Vec =>
    vec(x, at, -CUSTOM_MAP_LIMITS.maxCoord, CUSTOM_MAP_LIMITS.maxCoord);
  const str = (x: unknown, at: string, max: number, min = 0): string => {
    if (typeof x !== 'string' || x.length > max || x.length < min || CONTROL.test(x)) {
      err(`${at}: must be text of ${min} to ${max} characters`);
      return '';
    }
    return x;
  };
  const oneOf = <T extends string>(x: unknown, at: string, list: readonly T[]): T => {
    if (typeof x !== 'string' || !list.includes(x as T)) {
      err(`${at}: must be one of ${list.join(', ')}`);
      return list[0];
    }
    return x as T;
  };
  const bool = (x: unknown, at: string): boolean => {
    if (x === undefined) return false;
    if (typeof x !== 'boolean') err(`${at}: must be true or false`);
    return x === true;
  };
  const color = (x: unknown, at: string): number | undefined =>
    x === undefined ? undefined : int(x, at, 0, 0xffffff);
  const list = (x: unknown, at: string, max: number): unknown[] => {
    if (!Array.isArray(x)) {
      err(`${at}: must be a list`);
      return [];
    }
    if (x.length > max) {
      err(`${at}: at most ${max}`);
      return [];
    }
    return x;
  };

  if (raw.v !== CUSTOM_MAP_VERSION) err(`v: must be ${CUSTOM_MAP_VERSION}`);
  const name = str(raw.name, 'name', CUSTOM_MAP_LIMITS.nameLength, 1).trim();
  if (!name && typeof raw.name === 'string') err('name: must not be blank');
  const base = str(raw.base ?? '', 'base', MAX_BASE_ID);
  const sky = oneOf(raw.sky, 'sky', SKIES);

  // an edit of a built-in map
  let patch: CustomMapDoc['patch'];
  if (raw.patch !== undefined) {
    if (!isObj(raw.patch)) err('patch: must be an object');
    else {
      if (!isBuiltInMap(base))
        err(
          base
            ? `base: this map no longer exists (it was a change of "${base}", a built-in map that was removed)`
            : 'base: an edit must name a built-in map',
        );
      const removed = list(raw.patch.removed, 'patch.removed', MAX_REMOVED).map((f, i) =>
        str(f, `patch.removed[${i}]`, MAX_FINGERPRINT, 1),
      );
      const indices = (x: unknown, at: string): number[] | undefined =>
        x === undefined
          ? undefined
          : list(x, at, MAX_REMOVED_DEVICES).map((n, i) => int(n, `${at}[${i}]`, 0, 9999));
      patch = { removed };
      const rp = indices(raw.patch.removedPortals, 'patch.removedPortals');
      const rl = indices(raw.patch.removedLaunchPads, 'patch.removedLaunchPads');
      if (rp?.length) patch.removedPortals = rp;
      if (rl?.length) patch.removedLaunchPads = rl;
    }
  }

  // blocks
  const ids = new Set<number>();
  const blocks: CustomBlock[] = list(raw.blocks, 'blocks', CUSTOM_MAP_LIMITS.maxPieces).map(
    (x, i) => {
      const at = `blocks[${i}]`;
      if (!isObj(x)) {
        err(`${at}: must be an object`);
        return { id: -1, shape: 'box', pos: [0, 0, 0], size: [1, 1, 1], mat: 'concrete' };
      }
      const id = int(x.id, `${at}.id`, 0, 1e9);
      if (ids.has(id)) err(`${at}.id: ${id} is used twice`);
      ids.add(id);
      const shape = oneOf(x.shape, `${at}.shape`, SHAPES);
      const b: CustomBlock = {
        id,
        shape,
        pos: coord(x.pos, `${at}.pos`),
        size: vec(x.size, `${at}.size`, 0.1, MAX_SIZE),
        mat: shape === 'killpaint' ? 'killpaint' : oneOf(x.mat, `${at}.mat`, MATERIALS),
      };
      if (x.rot !== undefined) {
        const r = vec(x.rot, `${at}.rot`, -3600, 3600);
        if (r[0] || r[1] || r[2]) b.rot = r;
      }
      const c = color(x.color, `${at}.color`);
      if (c !== undefined) b.color = c;
      if (bool(x.noCollide, `${at}.noCollide`)) b.noCollide = true;
      const needsCurve = isCurveShape(shape) && shape !== 'quarterPipe';
      if (needsCurve && x.curve === undefined) err(`${at}.curve: a ${shape} needs its curve`);
      if (isCurveShape(shape) && x.curve !== undefined) {
        const cv = x.curve;
        if (!isObj(cv)) err(`${at}.curve: must be an object`);
        else {
          const pipe = shape === 'quarterPipe';
          const curve: NonNullable<CustomBlock['curve']> = {
            radius:
              pipe && cv.radius === undefined ? 1 : num(cv.radius, `${at}.curve.radius`, 0.5, 200),
            angle: num(cv.angle, `${at}.curve.angle`, pipe ? -90 : -360, pipe ? 90 : 360),
          };
          if (Math.abs(curve.angle) < 10) err(`${at}.curve.angle: must turn at least 10 degrees`);
          if (cv.segments !== undefined)
            curve.segments = int(cv.segments, `${at}.curve.segments`, 4, 48);
          // (a quarter pipe takes only its angle and segments; fields a shape doesn't use go)
          if (!pipe) {
            if (cv.rise !== undefined) curve.rise = num(cv.rise, `${at}.curve.rise`, -200, 200);
            const kind =
              cv.kind === undefined ? 'arc' : oneOf(cv.kind, `${at}.curve.kind`, CURVE_KINDS);
            if (kind !== 'arc') curve.kind = kind;
            if (kind === 'spiral' && cv.endRadius !== undefined)
              curve.endRadius = num(cv.endRadius, `${at}.curve.endRadius`, 2, 200);
            if (kind === 'wave') {
              if (cv.amplitude !== undefined)
                curve.amplitude = num(cv.amplitude, `${at}.curve.amplitude`, -12, 12);
              if (cv.waves !== undefined) curve.waves = num(cv.waves, `${at}.curve.waves`, 0.5, 6);
            }
            if (shape === 'curveSurf' && cv.steepness !== undefined)
              curve.steepness = num(cv.steepness, `${at}.curve.steepness`, 46, 80);
            if (shape !== 'curveSurf' && cv.bank !== undefined)
              curve.bank = num(cv.bank, `${at}.curve.bank`, -45, 45);
          }
          b.curve = curve;
          // (a wave is clamped to what stays smooth: maxWaveAmplitude)
          if (curve.amplitude !== undefined && !errors.length) {
            const cap = maxWaveAmplitude(b);
            if (Math.abs(curve.amplitude) > cap) curve.amplitude = curve.amplitude < 0 ? -cap : cap;
          }
        }
      }
      return b;
    },
  );

  // every piece stays in range
  let pieces = 0;
  if (!errors.length)
    for (const b of blocks) {
      pieces += blockPieceCount(b);
      if (pieces > CUSTOM_MAP_LIMITS.maxPieces) break;
      for (const box of expandCustomBlock(b)) {
        const { min, max } = boxAabb(box);
        if (
          Math.max(-min.x, -min.y, -min.z, max.x, max.y, max.z) > NET_RANGE ||
          ![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite)
        ) {
          err(`block ${b.id}: reaches outside the map`);
          break;
        }
      }
    }
  if (pieces > CUSTOM_MAP_LIMITS.maxPieces)
    err(
      `too many blocks: ${countPieces({ blocks })} pieces (at most ${CUSTOM_MAP_LIMITS.maxPieces})`,
    );

  // movers
  const moved = new Set<number>();
  const movers: CustomMover[] = list(raw.movers ?? [], 'movers', CUSTOM_MAP_LIMITS.movers).map(
    (x, i) => {
      const at = `movers[${i}]`;
      if (!isObj(x)) {
        err(`${at}: must be an object`);
        return { block: -1, points: [], speed: 1, delay: 0 };
      }
      const block = int(x.block, `${at}.block`, 0, 1e9);
      if (!ids.has(block)) err(`${at}.block: there is no block ${block}`);
      if (moved.has(block)) err(`${at}.block: block ${block} already moves`);
      moved.add(block);
      const [lo, hi] = CUSTOM_MAP_LIMITS.moverPoints;
      const pts = list(x.points, `${at}.points`, hi);
      if (Array.isArray(x.points) && pts.length < lo) err(`${at}.points: at least ${lo}`);
      return {
        block,
        points: pts.map((p, j) => coord(p, `${at}.points[${j}]`)),
        speed: num(x.speed, `${at}.speed`, ...CUSTOM_MAP_LIMITS.moverSpeed),
        delay: num(x.delay, `${at}.delay`, ...CUSTOM_MAP_LIMITS.moverDelay),
      };
    },
  );

  const spawns: CustomSpawn[] = list(raw.spawns ?? [], 'spawns', MAX_SPAWNS).map((x, i) => {
    const at = `spawns[${i}]`;
    if (!isObj(x)) {
      err(`${at}: must be an object`);
      return { pos: [0, 0, 0], yaw: 0 };
    }
    const s: CustomSpawn = {
      pos: coord(x.pos, `${at}.pos`),
      yaw: num(x.yaw, `${at}.yaw`, -3600, 3600),
    };
    if (x.team !== undefined) {
      if (x.team !== 0 && x.team !== 1) err(`${at}.team: must be 0 or 1`);
      else s.team = x.team;
    }
    return s;
  });

  const gate = (x: unknown, at: string): CustomGate => {
    if (!isObj(x)) {
      err(`${at}: must be an object`);
      return { pos: [0, 0, 0], size: [1, 1, 1], yaw: 0 };
    }
    const g: CustomGate = {
      pos: coord(x.pos, `${at}.pos`),
      size: vec(x.size, `${at}.size`, 0.5, 200),
      yaw: num(x.yaw, `${at}.yaw`, -3600, 3600),
    };
    if (x.name !== undefined) {
      const n = str(x.name, `${at}.name`, CUSTOM_MAP_LIMITS.nameLength).trim();
      if (n) g.name = n;
    }
    return g;
  };
  let race: CustomMapDoc['race'];
  if (raw.race !== undefined && raw.race !== null) {
    const r = raw.race;
    if (!isObj(r)) err('race: must be an object');
    else {
      race = {
        start: gate(r.start, 'race.start'),
        checkpoints: list(
          r.checkpoints ?? [],
          'race.checkpoints',
          CUSTOM_MAP_LIMITS.checkpoints,
        ).map((g, i) => gate(g, `race.checkpoints[${i}]`)),
        finish: gate(r.finish, 'race.finish'),
      };
      if (r.killY !== undefined)
        race.killY = num(
          r.killY,
          'race.killY',
          -CUSTOM_MAP_LIMITS.maxCoord,
          CUSTOM_MAP_LIMITS.maxCoord,
        );
      if (bool(r.surf, 'race.surf')) race.surf = true;
    }
  }

  const box = (x: unknown, at: string): { pos: Vec; size: Vec } => {
    if (!isObj(x)) {
      err(`${at}: must be an object`);
      return { pos: [0, 0, 0], size: [1, 1, 1] };
    }
    return { pos: coord(x.pos, `${at}.pos`), size: vec(x.size, `${at}.size`, 0.2, 60) };
  };
  const portals: CustomPortal[] = list(raw.portals ?? [], 'portals', CUSTOM_MAP_LIMITS.portals).map(
    (x, i) => {
      const at = `portals[${i}]`;
      if (!isObj(x)) {
        err(`${at}: must be an object`);
        return { from: { pos: [0, 0, 0], size: [1, 1, 1] }, to: [0, 0, 0] };
      }
      const p: CustomPortal = { from: box(x.from, `${at}.from`), to: coord(x.to, `${at}.to`) };
      if (bool(x.twoWay, `${at}.twoWay`)) p.twoWay = true;
      const c = color(x.color, `${at}.color`);
      if (c !== undefined) p.color = c;
      return p;
    },
  );
  // a portal's exit must be outside every portal (or you'd bounce straight back)
  if (!errors.length) {
    const defs = portals.flatMap((p, i) => customPortalDefs(p, i));
    defs.forEach((d, i) => {
      const e = d.exit;
      if (Math.max(Math.abs(e.x), Math.abs(e.y), Math.abs(e.z)) > NET_RANGE)
        err(`portal ${i + 1}: its exit is outside the map`);
      for (const o of defs)
        if (
          e.x >= o.min.x &&
          e.x <= o.max.x &&
          e.y >= o.min.y &&
          e.y <= o.max.y &&
          e.z >= o.min.z &&
          e.z <= o.max.z
        ) {
          err(`portal ${i + 1}: its exit is inside a portal`);
          break;
        }
    });
  }

  const launchPads: CustomLaunchPad[] = list(
    raw.launchPads ?? [],
    'launchPads',
    MAX_LAUNCH_PADS,
  ).map((x, i) => {
    const at = `launchPads[${i}]`;
    if (!isObj(x)) {
      err(`${at}: must be an object`);
      return { pos: [0, 0, 0], size: [1, 1, 1], vel: [0, 0, 0] };
    }
    const b = box(x, at);
    return { ...b, vel: vec(x.vel, `${at}.vel`, -80, 80) };
  });

  if (errors.length) return { ok: false, errors };
  const doc: CustomMapDoc = {
    v: CUSTOM_MAP_VERSION,
    name,
    base,
    sky,
    blocks,
    movers,
    spawns,
    portals,
    launchPads,
  };
  if (patch) doc.patch = patch;
  if (race) doc.race = race;
  return { ok: true, doc };
};
