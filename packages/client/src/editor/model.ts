// MAP MAKER — the map being edited, as plain data, and every edit as a pure function (new doc
// out, the old one untouched: the undo stack keeps old docs, and blocks are shared between them).
//
// The editor works on an EditDoc: a CustomMapDoc (shared level/custom/types.ts) that may still be
// unfinished — a race with a start but no finish yet, a moving block with only its first point.
// toCustomDoc turns it into the doc the game plays (dropping what is unfinished, with a plain
// message for each thing dropped: unfinishedNotes).
import type {
  CustomBlock,
  CustomGate,
  CustomLaunchPad,
  CustomMapDoc,
  CustomMover,
  CustomPortal,
  CustomSky,
  CustomSpawn,
} from '@space-yz/shared';
import { CUSTOM_MAP_LIMITS, CUSTOM_MAP_VERSION } from '@space-yz/shared';

export type V3 = [number, number, number];

/** A moving block while it is being set up: 1..4 points (point 1 = where the block is). */
export interface EditMover extends Omit<CustomMover, 'points'> {
  points: V3[];
}

export interface EditRace {
  start?: CustomGate;
  checkpoints: CustomGate[];
  finish?: CustomGate;
  killY?: number;
  surf?: boolean;
}

export interface EditDoc extends Omit<CustomMapDoc, 'race' | 'movers'> {
  movers: EditMover[];
  race: EditRace;
}

/** Something you can click in the editor. */
export type Ref =
  | { k: 'base'; fp: string } // a box of the built-in map (by fingerprint)
  | { k: 'block'; id: number }
  | { k: 'point'; id: number; i: number } // point i (1..3) of block id's movement
  | { k: 'spawn'; i: number }
  | { k: 'start' }
  | { k: 'cp'; i: number }
  | { k: 'finish' }
  | { k: 'portal'; i: number; end: 'from' | 'to' }
  | { k: 'pad'; i: number }
  | { k: 'basePortal'; i: number } // a portal / launch pad of the built-in map
  | { k: 'basePad'; i: number };

export const refKey = (r: Ref): string => {
  switch (r.k) {
    case 'base':
      return `base:${r.fp}`;
    case 'block':
      return `block:${r.id}`;
    case 'point':
      return `point:${r.id}:${r.i}`;
    case 'portal':
      return `portal:${r.i}:${r.end}`;
    case 'start':
    case 'finish':
      return r.k;
    default:
      return `${r.k}:${r.i}`;
  }
};

export const sameRef = (a: Ref, b: Ref): boolean => refKey(a) === refKey(b);

const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const r2 = (n: number): number => Math.round(n * 1000) / 1000;
export const round3 = (a: V3): V3 => [r2(a[0]), r2(a[1]), r2(a[2])];
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const wrapDeg = (d: number): number => {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x <= -180) x += 360;
  return r2(x);
};

/** A new empty map (or an edit of a built-in map when `patch`). */
export const newDoc = (
  name: string,
  base = '',
  patch = false,
  sky: CustomSky = 'day',
): EditDoc => ({
  v: CUSTOM_MAP_VERSION,
  name: name.slice(0, CUSTOM_MAP_LIMITS.nameLength),
  base,
  ...(patch ? { patch: { removed: [] } } : {}),
  sky,
  blocks: [],
  movers: [],
  spawns: [],
  race: { checkpoints: [] },
  portals: [],
  launchPads: [],
});

/** Open a saved doc for editing. */
export const fromCustomDoc = (d: CustomMapDoc): EditDoc => ({
  ...d,
  blocks: d.blocks ?? [],
  movers: (d.movers ?? []).map((m) => ({ ...m, points: m.points.map((p) => [...p] as V3) })),
  spawns: d.spawns ?? [],
  portals: d.portals ?? [],
  launchPads: d.launchPads ?? [],
  race: d.race
    ? {
        start: d.race.start,
        checkpoints: d.race.checkpoints ?? [],
        finish: d.race.finish,
        ...(d.race.killY !== undefined ? { killY: d.race.killY } : {}),
        ...(d.race.surf ? { surf: true } : {}),
      }
    : { checkpoints: [] },
});

/** A race needs a start and a finish. */
export const isRace = (e: EditDoc): boolean => !!(e.race.start && e.race.finish);

/** The doc the game plays (and the server stores): unfinished parts left out. */
export const toCustomDoc = (e: EditDoc): CustomMapDoc => {
  const blockPos = new Map(e.blocks.map((b) => [b.id, b.pos] as const));
  const movers: CustomMover[] = e.movers
    .filter((m) => m.points.length >= 2 && blockPos.has(m.block))
    .map((m) => ({
      block: m.block,
      // point 1 is always where the block is
      points: [blockPos.get(m.block)!, ...m.points.slice(1, 4)].map((p) => [...p] as V3),
      speed: m.speed,
      delay: m.delay,
    }));
  const { race, movers: _m, ...rest } = e;
  void _m;
  const doc: CustomMapDoc = { ...rest, movers };
  if (race.start && race.finish)
    doc.race = {
      start: race.start,
      checkpoints: race.checkpoints,
      finish: race.finish,
      ...(race.killY !== undefined ? { killY: race.killY } : {}),
      ...(race.surf ? { surf: true } : {}),
    };
  return doc;
};

/** Plain-language notes about unfinished things the game will leave out. */
export const unfinishedNotes = (e: EditDoc): string[] => {
  const out: string[] = [];
  const r = e.race;
  if (r.start && !r.finish) out.push('The race has a start but no finish yet: add a Finish.');
  if (!r.start && r.finish) out.push('The race has a finish but no start yet: add a Start.');
  if (!r.start && !r.finish && r.checkpoints.length)
    out.push('Checkpoints only count in a race: add a Start and a Finish.');
  const short = e.movers.filter((m) => m.points.length < 2).length;
  if (short)
    out.push(
      `${short === 1 ? 'A moving block has' : `${short} moving blocks have`} only point 1: add point 2.`,
    );
  return out;
};

// ---------------------------------------------------------------------------------------------
// blocks

export const nextBlockId = (e: EditDoc): number =>
  e.blocks.reduce((m, b) => Math.max(m, b.id), 0) + 1;

export const blockById = (e: EditDoc, id: number): CustomBlock | undefined =>
  e.blocks.find((b) => b.id === id);

export const moverOf = (e: EditDoc, id: number): EditMover | undefined =>
  e.movers.find((m) => m.block === id);

/** Add blocks (their ids are replaced by fresh ones); returns the new doc and the new ids. */
export const addBlocks = (
  e: EditDoc,
  blocks: Omit<CustomBlock, 'id'>[],
): { doc: EditDoc; ids: number[] } => {
  let id = nextBlockId(e);
  const added = blocks.map((b) => ({ ...b, pos: round3(b.pos), id: id++ }) as CustomBlock);
  return { doc: { ...e, blocks: [...e.blocks, ...added] }, ids: added.map((b) => b.id) };
};

/** Change one block (a mover's point 1 follows the block; its other points move along). */
export const updateBlock = (e: EditDoc, id: number, change: Partial<CustomBlock>): EditDoc => {
  const old = blockById(e, id);
  if (!old) return e;
  const next: CustomBlock = { ...old, ...change, id };
  if (change.pos) next.pos = round3(change.pos);
  if (change.size) next.size = change.size.map((s) => Math.max(0.1, r2(s))) as V3;
  if (change.rot) next.rot = change.rot.map(wrapDeg) as V3;
  let doc: EditDoc = { ...e, blocks: e.blocks.map((b) => (b.id === id ? next : b)) };
  if (change.pos) {
    const d: V3 = [next.pos[0] - old.pos[0], next.pos[1] - old.pos[1], next.pos[2] - old.pos[2]];
    doc = mapMover(doc, id, (m) => ({ ...m, points: m.points.map((p) => round3(add3(p, d))) }));
  }
  return doc;
};

const mapMover = (e: EditDoc, id: number, f: (m: EditMover) => EditMover | null): EditDoc => {
  if (!e.movers.some((m) => m.block === id)) return e;
  const movers: EditMover[] = [];
  for (const m of e.movers) {
    if (m.block !== id) movers.push(m);
    else {
      const n = f(m);
      if (n) movers.push(n);
    }
  }
  return { ...e, movers };
};

// ---------------------------------------------------------------------------------------------
// moving blocks

export const MOVER_DEFAULTS = { speed: 4, delay: 1 };

/** "Make it move": the block becomes point 1 of a new path. */
export const makeMover = (e: EditDoc, id: number): EditDoc => {
  const b = blockById(e, id);
  if (!b || moverOf(e, id)) return e;
  return {
    ...e,
    movers: [
      ...e.movers,
      {
        block: id,
        points: [[...b.pos] as V3],
        speed: MOVER_DEFAULTS.speed,
        delay: MOVER_DEFAULTS.delay,
      },
    ],
  };
};

export const stopMover = (e: EditDoc, id: number): EditDoc => mapMover(e, id, () => null);

/** Add the next point (max 4). */
export const addMoverPoint = (e: EditDoc, id: number, p: V3): EditDoc =>
  mapMover(e, id, (m) =>
    m.points.length >= CUSTOM_MAP_LIMITS.moverPoints[1]
      ? m
      : { ...m, points: [...m.points, round3(p)] },
  );

/** Remove point i (2..4 are i = 1..3; point 1 is the block itself). */
export const removeMoverPoint = (e: EditDoc, id: number, i: number): EditDoc =>
  i < 1 ? e : mapMover(e, id, (m) => ({ ...m, points: m.points.filter((_, k) => k !== i) }));

export const setMoverPoint = (e: EditDoc, id: number, i: number, p: V3): EditDoc =>
  i < 1
    ? updateBlock(e, id, { pos: p })
    : mapMover(e, id, (m) => ({
        ...m,
        points: m.points.map((q, k) => (k === i ? round3(p) : q)),
      }));

export const setMoverTiming = (
  e: EditDoc,
  id: number,
  t: { speed?: number; delay?: number },
): EditDoc =>
  mapMover(e, id, (m) => ({
    ...m,
    speed:
      t.speed !== undefined
        ? clamp(r2(t.speed), CUSTOM_MAP_LIMITS.moverSpeed[0], CUSTOM_MAP_LIMITS.moverSpeed[1])
        : m.speed,
    delay:
      t.delay !== undefined
        ? clamp(r2(t.delay), CUSTOM_MAP_LIMITS.moverDelay[0], CUSTOM_MAP_LIMITS.moverDelay[1])
        : m.delay,
  }));

// ---------------------------------------------------------------------------------------------
// gameplay objects

export const GATE_SIZE: V3 = [8, 6, 1.5];

export const gateAt = (pos: V3, yaw: number, name?: string): CustomGate => ({
  pos: round3(pos),
  size: [...GATE_SIZE] as V3,
  yaw: wrapDeg(yaw),
  ...(name ? { name } : {}),
});

export const setStart = (e: EditDoc, g: CustomGate | undefined): EditDoc => ({
  ...e,
  race: { ...e.race, start: g },
});
export const setFinish = (e: EditDoc, g: CustomGate | undefined): EditDoc => ({
  ...e,
  race: { ...e.race, finish: g },
});

/** Add a checkpoint at position `at` in the order (default: last). */
export const addCheckpoint = (
  e: EditDoc,
  g: CustomGate,
  at = e.race.checkpoints.length,
): EditDoc => {
  const cps = [...e.race.checkpoints];
  cps.splice(clamp(at, 0, cps.length), 0, g);
  return { ...e, race: { ...e.race, checkpoints: cps } };
};

/** Move checkpoint i earlier (-1) or later (+1) in the order. */
export const moveCheckpoint = (e: EditDoc, i: number, dir: -1 | 1): EditDoc => {
  const j = i + dir;
  const cps = [...e.race.checkpoints];
  if (i < 0 || j < 0 || i >= cps.length || j >= cps.length) return e;
  [cps[i], cps[j]] = [cps[j], cps[i]];
  return { ...e, race: { ...e.race, checkpoints: cps } };
};

export const setGate = (e: EditDoc, r: Ref, g: CustomGate): EditDoc => {
  if (r.k === 'start') return setStart(e, g);
  if (r.k === 'finish') return setFinish(e, g);
  if (r.k === 'cp')
    return {
      ...e,
      race: { ...e.race, checkpoints: e.race.checkpoints.map((c, i) => (i === r.i ? g : c)) },
    };
  return e;
};

export const gateOf = (e: EditDoc, r: Ref): CustomGate | undefined =>
  r.k === 'start'
    ? e.race.start
    : r.k === 'finish'
      ? e.race.finish
      : r.k === 'cp'
        ? e.race.checkpoints[r.i]
        : undefined;

export const addSpawn = (e: EditDoc, s: CustomSpawn): EditDoc => ({
  ...e,
  spawns: [...e.spawns, { ...s, pos: round3(s.pos), yaw: wrapDeg(s.yaw) }],
});
export const setSpawn = (e: EditDoc, i: number, s: CustomSpawn): EditDoc => ({
  ...e,
  spawns: e.spawns.map((x, k) => (k === i ? s : x)),
});

export const PORTAL_SIZE: V3 = [3, 4, 1];
export const PORTAL_COLORS = [0x38e8ff, 0xff6ad5, 0xffd23f, 0x7dff6a, 0xa46bff];

export const addPortal = (e: EditDoc, from: V3, to: V3, yaw = 0): EditDoc => {
  // the portal's thin side faces where you walk in
  const across = Math.abs(Math.sin((yaw * Math.PI) / 180)) > 0.7;
  const size: V3 = across ? [PORTAL_SIZE[2], PORTAL_SIZE[1], PORTAL_SIZE[0]] : [...PORTAL_SIZE];
  const p: CustomPortal = {
    from: { pos: round3(from), size },
    to: round3(to),
    color: PORTAL_COLORS[e.portals.length % PORTAL_COLORS.length],
  };
  return { ...e, portals: [...e.portals, p] };
};
export const setPortal = (e: EditDoc, i: number, p: CustomPortal): EditDoc => ({
  ...e,
  portals: e.portals.map((x, k) => (k === i ? p : x)),
});

export const PAD_SIZE: V3 = [2.5, 0.4, 2.5];

/** A launch pad throwing you toward `yaw` (forward m/s) and up (m/s). */
export const padVel = (yaw: number, forward: number, up: number): V3 => {
  const a = (yaw * Math.PI) / 180;
  return round3([Math.sin(a) * forward, up, -Math.cos(a) * forward]);
};
/** The pad's throw as the editor shows it: facing, forward and up power. */
export const padAim = (p: CustomLaunchPad): { yaw: number; forward: number; up: number } => {
  const [x, y, z] = p.vel;
  const forward = Math.hypot(x, z);
  return {
    yaw: forward < 1e-6 ? 0 : r2((Math.atan2(x, -z) * 180) / Math.PI),
    forward: r2(forward),
    up: r2(y),
  };
};
export const addPad = (e: EditDoc, pos: V3, yaw: number, forward = 12, up = 14): EditDoc => ({
  ...e,
  launchPads: [
    ...e.launchPads,
    { pos: round3(pos), size: [...PAD_SIZE] as V3, vel: padVel(yaw, forward, up) },
  ],
});
export const setPad = (e: EditDoc, i: number, p: CustomLaunchPad): EditDoc => ({
  ...e,
  launchPads: e.launchPads.map((x, k) => (k === i ? p : x)),
});

// ---------------------------------------------------------------------------------------------
// many things at once (the selection)

/** Where a thing is (its centre / feet / entry), or null when it is gone. */
export const refPos = (e: EditDoc, r: Ref, basePos?: (fp: string) => V3 | null): V3 | null => {
  switch (r.k) {
    case 'base':
      return basePos?.(r.fp) ?? null;
    case 'block':
      return blockById(e, r.id)?.pos ?? null;
    case 'point':
      return moverOf(e, r.id)?.points[r.i] ?? null;
    case 'spawn':
      return e.spawns[r.i]?.pos ?? null;
    case 'start':
    case 'finish':
    case 'cp':
      return gateOf(e, r)?.pos ?? null;
    case 'portal': {
      const p = e.portals[r.i];
      return p ? (r.end === 'from' ? p.from.pos : p.to) : null;
    }
    case 'pad':
      return e.launchPads[r.i]?.pos ?? null;
    default:
      return null;
  }
};

/** Keep only refs that still exist. */
export const liveRefs = (e: EditDoc, refs: Ref[], baseExists: (fp: string) => boolean): Ref[] =>
  refs.filter((r) => {
    if (r.k === 'base') return baseExists(r.fp) && !(e.patch?.removed ?? []).includes(r.fp);
    if (r.k === 'basePortal') return !(e.patch?.removedPortals ?? []).includes(r.i);
    if (r.k === 'basePad') return !(e.patch?.removedLaunchPads ?? []).includes(r.i);
    return refPos(e, r) !== null;
  });

/** Move everything selected by `d` metres (a block's whole path moves with it). */
export const moveRefs = (e: EditDoc, refs: Ref[], d: V3): EditDoc => {
  const blocks = new Set(refs.filter((r) => r.k === 'block').map((r) => (r as { id: number }).id));
  let doc = e;
  for (const r of refs) doc = moveOne(doc, r, d, blocks);
  return doc;
};

const moveOne = (e: EditDoc, r: Ref, d: V3, movingBlocks: Set<number>): EditDoc => {
  switch (r.k) {
    case 'block': {
      const b = blockById(e, r.id);
      return b ? updateBlock(e, r.id, { pos: add3(b.pos, d) }) : e;
    }
    case 'point': {
      if (movingBlocks.has(r.id)) return e; // already moved with its block
      const p = moverOf(e, r.id)?.points[r.i];
      return p && r.i > 0 ? setMoverPoint(e, r.id, r.i, add3(p, d)) : e;
    }
    case 'spawn': {
      const s = e.spawns[r.i];
      return s ? setSpawn(e, r.i, { ...s, pos: round3(add3(s.pos, d)) }) : e;
    }
    case 'start':
    case 'finish':
    case 'cp': {
      const g = gateOf(e, r);
      return g ? setGate(e, r, { ...g, pos: round3(add3(g.pos, d)) }) : e;
    }
    case 'portal': {
      const p = e.portals[r.i];
      if (!p) return e;
      return setPortal(
        e,
        r.i,
        r.end === 'from'
          ? { ...p, from: { ...p.from, pos: round3(add3(p.from.pos, d)) } }
          : { ...p, to: round3(add3(p.to, d)) },
      );
    }
    case 'pad': {
      const p = e.launchPads[r.i];
      return p ? setPad(e, r.i, { ...p, pos: round3(add3(p.pos, d)) }) : e;
    }
    default:
      return e; // base boxes are turned into blocks before they move (the editor does it)
  }
};

/**
 * Turn a point by `deg` around the up axis through `c`. Yaw convention: 0 faces -z, +90 faces
 * +x (clockwise seen from above), so a point north of `c` ends up east of it at +90.
 */
export const turnAround =
  (c: V3, deg: number) =>
  (p: V3): V3 => {
    const a = (deg * Math.PI) / 180;
    const x = p[0] - c[0];
    const z = p[2] - c[2];
    return round3([
      c[0] + x * Math.cos(a) - z * Math.sin(a),
      p[1],
      c[2] + x * Math.sin(a) + z * Math.cos(a),
    ]);
  };

/** Turn everything selected by `deg` around the up axis (around their common middle). */
export const rotateRefs = (e: EditDoc, refs: Ref[], deg: number, pivot?: V3): EditDoc => {
  const pts = refs.map((r) => refPos(e, r)).filter((p): p is V3 => !!p);
  if (!pts.length) return e;
  const c: V3 = pivot ?? [
    pts.reduce((a, p) => a + p[0], 0) / pts.length,
    0,
    pts.reduce((a, p) => a + p[2], 0) / pts.length,
  ];
  const turn = turnAround(c, deg);
  const single = refs.length === 1;
  let doc = e;
  for (const r of refs) {
    const p = refPos(doc, r);
    if (!p) continue;
    const np = single ? p : turn(p);
    const d: V3 = [np[0] - p[0], np[1] - p[1], np[2] - p[2]];
    if (r.k === 'block') {
      const b = blockById(doc, r.id)!;
      const m = moverOf(doc, r.id);
      const rot = b.rot ?? [0, 0, 0];
      doc = updateBlock(doc, r.id, { pos: np, rot: [rot[0] + deg, rot[1], rot[2]] });
      // its path turns with it (alone: around the block itself)
      const pathTurn = single ? turnAround(b.pos, deg) : turn;
      if (m)
        doc = mapMover(doc, r.id, (mm) => ({
          ...mm,
          points: m.points.map((q, k) => (k === 0 ? np : pathTurn(q))),
        }));
    } else if (r.k === 'spawn') {
      const s = doc.spawns[r.i];
      doc = setSpawn(doc, r.i, { ...s, pos: np, yaw: wrapDeg(s.yaw + deg) });
    } else if (r.k === 'start' || r.k === 'finish' || r.k === 'cp') {
      const g = gateOf(doc, r)!;
      doc = setGate(doc, r, { ...g, pos: np, yaw: wrapDeg(g.yaw + deg) });
    } else if (r.k === 'pad') {
      const p = doc.launchPads[r.i];
      const aim = padAim(p);
      doc = setPad(doc, r.i, { ...p, pos: np, vel: padVel(aim.yaw + deg, aim.forward, aim.up) });
    } else if (r.k === 'portal') {
      const p = doc.portals[r.i];
      const s = p.from.size;
      const from =
        r.end === 'from' && Math.abs(Math.round(deg / 90)) % 2 === 1 && Math.abs(deg % 90) < 1e-6
          ? { pos: p.from.pos, size: [s[2], s[1], s[0]] as V3 }
          : p.from;
      doc = setPortal(doc, r.i, { ...p, from });
      if (!single) doc = moveOne(doc, r, d, new Set());
    } else if (!single) doc = moveOne(doc, r, d, new Set());
  }
  return doc;
};

/** Grow / shrink everything selected by `k` (blocks, curves, gates, pads, portals). */
export const scaleRefs = (e: EditDoc, refs: Ref[], k: number): EditDoc => {
  let doc = e;
  const sz = (s: V3): V3 => s.map((v) => Math.max(0.1, r2(v * k))) as V3;
  for (const r of refs) {
    if (r.k === 'block') {
      const b = blockById(doc, r.id);
      if (!b) continue;
      doc = updateBlock(doc, r.id, {
        size: sz(b.size),
        ...(b.curve
          ? {
              curve: {
                ...b.curve,
                radius: Math.max(0.5, r2(b.curve.radius * k)),
                ...(b.curve.rise !== undefined ? { rise: r2(b.curve.rise * k) } : {}),
              },
            }
          : {}),
      });
    } else if (r.k === 'start' || r.k === 'finish' || r.k === 'cp') {
      const g = gateOf(doc, r)!;
      doc = setGate(doc, r, { ...g, size: sz(g.size) });
    } else if (r.k === 'pad') {
      const p = doc.launchPads[r.i];
      doc = setPad(doc, r.i, { ...p, size: sz(p.size) });
    } else if (r.k === 'portal' && r.end === 'from') {
      const p = doc.portals[r.i];
      doc = setPortal(doc, r.i, { ...p, from: { ...p.from, size: sz(p.from.size) } });
    }
  }
  return doc;
};

/** Delete everything selected. Base-map boxes, portals and pads go into the patch's lists. */
export const deleteRefs = (e: EditDoc, refs: Ref[]): EditDoc => {
  const key = new Set(refs.map(refKey));
  const has = (r: Ref) => key.has(refKey(r));
  const blockIds = new Set(refs.flatMap((r) => (r.k === 'block' ? [r.id] : [])));
  const removed = new Set(e.patch?.removed ?? []);
  const removedPortals = new Set(e.patch?.removedPortals ?? []);
  const removedPads = new Set(e.patch?.removedLaunchPads ?? []);
  for (const r of refs) {
    if (r.k === 'base') removed.add(r.fp);
    if (r.k === 'basePortal') removedPortals.add(r.i);
    if (r.k === 'basePad') removedPads.add(r.i);
  }
  const movers: EditMover[] = [];
  for (const m of e.movers) {
    if (blockIds.has(m.block)) continue;
    const points = m.points.filter((_, i) => i === 0 || !has({ k: 'point', id: m.block, i }));
    movers.push(points.length === m.points.length ? m : { ...m, points });
  }
  // a portal goes when either of its ends is deleted
  const portalGone = (i: number) =>
    has({ k: 'portal', i, end: 'from' }) || has({ k: 'portal', i, end: 'to' });
  const doc: EditDoc = {
    ...e,
    blocks: e.blocks.filter((b) => !blockIds.has(b.id)),
    movers,
    spawns: e.spawns.filter((_, i) => !has({ k: 'spawn', i })),
    portals: e.portals.filter((_, i) => !portalGone(i)),
    launchPads: e.launchPads.filter((_, i) => !has({ k: 'pad', i })),
    race: {
      ...e.race,
      start: has({ k: 'start' }) ? undefined : e.race.start,
      finish: has({ k: 'finish' }) ? undefined : e.race.finish,
      checkpoints: e.race.checkpoints.filter((_, i) => !has({ k: 'cp', i })),
    },
  };
  if (e.patch)
    doc.patch = {
      removed: [...removed].sort(),
      ...(removedPortals.size ? { removedPortals: [...removedPortals].sort((a, b) => a - b) } : {}),
      ...(removedPads.size ? { removedLaunchPads: [...removedPads].sort((a, b) => a - b) } : {}),
    };
  return doc;
};

/**
 * Copy everything selected, `offset` metres away. Returns the refs of the copies (base boxes
 * must be turned into blocks first; they are skipped here).
 */
export const duplicateRefs = (
  e: EditDoc,
  refs: Ref[],
  offset: V3,
): { doc: EditDoc; refs: Ref[] } => {
  let doc = e;
  const out: Ref[] = [];
  for (const r of refs) {
    if (r.k === 'block') {
      const b = blockById(doc, r.id);
      if (!b) continue;
      const { id: _id, ...rest } = b;
      void _id;
      const res = addBlocks(doc, [{ ...rest, pos: add3(b.pos, offset) }]);
      doc = res.doc;
      const nid = res.ids[0];
      const m = moverOf(e, r.id);
      if (m)
        doc = {
          ...doc,
          movers: [
            ...doc.movers,
            { ...m, block: nid, points: m.points.map((p) => round3(add3(p, offset))) },
          ],
        };
      out.push({ k: 'block', id: nid });
    } else if (r.k === 'spawn') {
      const s = doc.spawns[r.i];
      doc = addSpawn(doc, { ...s, pos: add3(s.pos, offset) });
      out.push({ k: 'spawn', i: doc.spawns.length - 1 });
    } else if (r.k === 'cp') {
      const g = doc.race.checkpoints[r.i];
      doc = addCheckpoint(doc, { ...g, pos: round3(add3(g.pos, offset)) });
      out.push({ k: 'cp', i: doc.race.checkpoints.length - 1 });
    } else if (r.k === 'pad') {
      const p = doc.launchPads[r.i];
      doc = { ...doc, launchPads: [...doc.launchPads, { ...p, pos: round3(add3(p.pos, offset)) }] };
      out.push({ k: 'pad', i: doc.launchPads.length - 1 });
    } else if (r.k === 'portal') {
      const p = doc.portals[r.i];
      doc = {
        ...doc,
        portals: [
          ...doc.portals,
          {
            ...p,
            from: { ...p.from, pos: round3(add3(p.from.pos, offset)) },
            to: round3(add3(p.to, offset)),
          },
        ],
      };
      out.push({ k: 'portal', i: doc.portals.length - 1, end: 'from' });
    }
  }
  return { doc, refs: out };
};

/**
 * Turn built-in boxes into blocks of this doc so they can be moved, turned or resized: each
 * box's fingerprint goes into the patch's removed list and `blocks[i]` (the same box as a
 * block, built by the caller) comes in. Returns the new refs in the same order.
 */
export const adoptBaseBoxes = (
  e: EditDoc,
  items: { fp: string; block: Omit<CustomBlock, 'id'> }[],
): { doc: EditDoc; refs: Ref[] } => {
  if (!items.length) return { doc: e, refs: [] };
  const withRemoved = deleteRefs(
    e,
    items.map((it) => ({ k: 'base', fp: it.fp })),
  );
  const res = addBlocks(
    withRemoved,
    items.map((it) => it.block),
  );
  return { doc: res.doc, refs: res.ids.map((id) => ({ k: 'block', id })) };
};
