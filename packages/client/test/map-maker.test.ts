// Map Maker (packages/client/src/editor): the pure editing logic — undo stack, grid snapping,
// the moving-block preview timing, building the doc from edits, picking, curve handles.
import { describe, expect, it } from 'vitest';
import {
  MAPS,
  baseBoxesForEditor,
  compileCustomMap,
  countPieces,
  customMoverOffset,
  expandCustomBlock,
  levelToCustomMap,
  mapDef,
  qFromAxisAngle,
  v3,
  validateCustomMap,
  type BoxDef,
  type CustomBlock,
} from '@space-yz/shared';
import { History } from '../src/editor/history';
import {
  addBlocks,
  addCheckpoint,
  addMoverPoint,
  addPad,
  addPortal,
  addSpawn,
  adoptBaseBoxes,
  deleteRefs,
  duplicateRefs,
  fromCustomDoc,
  gateAt,
  makeMover,
  moveRefs,
  newDoc,
  padAim,
  padVel,
  removeMoverPoint,
  rotateRefs,
  scaleRefs,
  setFinish,
  setMoverTiming,
  setStart,
  toCustomDoc,
  unfinishedNotes,
  type EditDoc,
  type V3,
} from '../src/editor/model';
import { placeInAir, placeOnSurface, snap } from '../src/editor/snap';
import { moverCycle, moverPosAt } from '../src/editor/mover-time';
import { pickNearest, rayPiece, boxBounds } from '../src/editor/pick';
import { rampGroups } from '../src/editor/ramps';
import {
  curveEndLocal,
  localToWorld,
  posKeepingStart,
  solveCurveEnd,
  worldToLocal,
  type Curve,
} from '../src/editor/curve-edit';
import { BLOCK_BRUSHES, makeBlock } from '../src/editor/palette';
import { sceneData } from '../src/editor/scene-data';
import {
  GONE_MAP,
  baseGone,
  draftInfo,
  loadDraft,
  newSession,
  saveDraft,
} from '../src/editor/session';

/** A new map as the start screen makes it: a platform and a spawn point. */
const starter = (): EditDoc => {
  const d = addBlocks(newDoc('Test map'), [
    { shape: 'box', pos: [0, -0.5, 0], size: [24, 1, 24], mat: 'concrete' },
  ]).doc;
  return addSpawn(d, { pos: [0, 0, 8], yaw: 0 });
};

const near = (a: readonly number[], b: readonly number[], eps = 1e-6) =>
  a.every((x, i) => Math.abs(x - b[i]) <= eps);

describe('undo stack', () => {
  it('undoes and redoes, and a new change clears redo', () => {
    const h = new History(0);
    h.push(1);
    h.push(2);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toBe(1);
    h.push(5);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe(1);
  });

  it('merges a drag into one step until sealed', () => {
    const h = new History('a');
    h.push('b', 'drag');
    h.push('c', 'drag');
    h.push('d', 'drag');
    expect(h.undo()).toBe('a');
    h.redo();
    h.seal();
    h.push('e', 'drag');
    expect(h.undo()).toBe('d');
  });

  it('keeps at most `limit` steps', () => {
    const h = new History(0, 3);
    for (let i = 1; i <= 10; i++) h.push(i);
    let n = 0;
    while (h.canUndo) {
      h.undo();
      n++;
    }
    expect(n).toBe(3);
    expect(h.current).toBe(7);
  });
});

describe('snapping', () => {
  it('rounds to the grid without float noise', () => {
    expect(snap(1.26, 0.25)).toBe(1.25);
    expect(snap(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(snap(-3.6, 2)).toBe(-4);
  });

  it('puts a piece flush on a floor, its edges on the grid', () => {
    // a 3 x 1 x 2 block aimed at a floor at y = 0
    const c = placeOnSurface([1.3, 0, 4.9], [0, 1, 0], [1.5, 0.5, 1], 1);
    expect(c[1]).toBe(0.5); // sits on the floor
    expect(c[0] - 1.5).toBe(Math.round(c[0] - 1.5)); // low edge on a grid line
    expect(c[2] - 1).toBe(Math.round(c[2] - 1));
  });

  it('puts a piece flush against a wall', () => {
    const c = placeOnSurface([5, 2.2, 0.4], [1, 0, 0], [0.5, 0.5, 0.5], 0.5);
    expect(c[0]).toBe(5.5);
  });

  it('snaps a piece in the air on every axis', () => {
    expect(placeInAir([0.3, 7.7, -2.2], [1, 1, 1], 1)).toEqual([0, 8, -2]);
  });
});

describe('moving block preview', () => {
  const pts: V3[] = [
    [0, 0, 0],
    [8, 0, 0],
    [8, 8, 0],
    [0, 8, 0],
  ];

  it('waits, travels at speed, goes back to point 1 after the last', () => {
    // 8 m at 4 m/s = 2 s per leg, 1 s wait at each point: 4 × 3 s = 12 s a loop
    expect(moverCycle(pts, 4, 1)).toBe(12);
    expect(moverPosAt(pts, 4, 1, 0.5)).toEqual([0, 0, 0]); // waiting at 1
    expect(near(moverPosAt(pts, 4, 1, 2), [4, 0, 0])).toBe(true); // half way to 2
    expect(moverPosAt(pts, 4, 1, 3.5)).toEqual([8, 0, 0]); // waiting at 2
    expect(near(moverPosAt(pts, 4, 1, 11), [0, 4, 0])).toBe(true); // 4 → 1
    expect(moverPosAt(pts, 4, 1, 12.5)).toEqual([0, 0, 0]); // looped
  });

  it('matches the game (the shared mover timeline) for 2, 3 and 4 points', () => {
    for (const n of [2, 3, 4]) {
      const p = pts.slice(0, n);
      const mover = { block: 1, points: p, speed: 4, delay: 1 };
      for (let t = 0; t < 30; t += 0.37) {
        const game = customMoverOffset(mover, t);
        const ours = moverPosAt(p, 4, 1, t);
        // the game counts in 60 Hz ticks
        expect(Math.hypot(game[0] - ours[0], game[1] - ours[1], game[2] - ours[2])).toBeLessThan(
          (4 / 60) * 1.01,
        );
      }
    }
  });
});

describe('building the doc from edits', () => {
  it('a race counts only with a start and a finish', () => {
    let d = starter();
    d = setStart(d, gateAt([0, 0, 5], 0));
    d = addCheckpoint(d, gateAt([0, 0, -5], 0));
    expect(toCustomDoc(d).race).toBeUndefined();
    expect(unfinishedNotes(d)[0]).toMatch(/no finish/);
    d = setFinish(d, gateAt([0, 0, -10], 0));
    const doc = toCustomDoc(d);
    expect(doc.race?.checkpoints).toHaveLength(1);
    expect(unfinishedNotes(d)).toEqual([]);
  });

  it('a moving block needs point 2; point 1 is always the block', () => {
    let d = starter();
    const r = addBlocks(d, [{ shape: 'box', pos: [0, 2, 0], size: [2, 0.5, 2], mat: 'metal' }]);
    d = makeMover(r.doc, r.ids[0]);
    expect(toCustomDoc(d).movers).toEqual([]);
    expect(unfinishedNotes(d).join()).toMatch(/point 2/);
    d = addMoverPoint(d, r.ids[0], [0, 2, 10]);
    d = addMoverPoint(d, r.ids[0], [10, 2, 10]);
    d = addMoverPoint(d, r.ids[0], [10, 2, 0]);
    d = addMoverPoint(d, r.ids[0], [20, 2, 0]); // a 5th point is refused
    d = setMoverTiming(d, r.ids[0], { speed: 99, delay: -1 });
    const m = toCustomDoc(d).movers[0];
    expect(m.points).toHaveLength(4);
    expect(m.points[0]).toEqual([0, 2, 0]);
    expect(m.speed).toBe(30); // clamped to the limits
    expect(m.delay).toBe(0);
    // moving the block moves its whole path
    d = moveRefs(d, [{ k: 'block', id: r.ids[0] }], [1, 0, 0]);
    expect(toCustomDoc(d).movers[0].points[1]).toEqual([1, 2, 10]);
    // a single point moves alone
    d = moveRefs(d, [{ k: 'point', id: r.ids[0], i: 2 }], [0, 1, 0]);
    expect(d.movers[0].points[2]).toEqual([11, 3, 10]);
    d = removeMoverPoint(d, r.ids[0], 1);
    expect(d.movers[0].points).toHaveLength(3);
  });

  it('turning a moving block turns its path around it', () => {
    let d = starter();
    const r = addBlocks(d, [{ shape: 'box', pos: [0, 2, 0], size: [2, 0.5, 2], mat: 'metal' }]);
    d = addMoverPoint(makeMover(r.doc, r.ids[0]), r.ids[0], [0, 2, -10]); // 10 m north
    d = rotateRefs(d, [{ k: 'block', id: r.ids[0] }], 90);
    expect(d.blocks.find((b) => b.id === r.ids[0])?.rot?.[0]).toBe(90);
    expect(near(d.movers[0].points[1], [10, 2, 0], 1e-3)).toBe(true); // now east
  });

  it('deleting a built-in box records it in the patch; blocks take their mover along', () => {
    let d = newDoc('Edit', 'kestrel', true);
    d = deleteRefs(d, [
      { k: 'base', fp: '1,2,3|1,1,1' },
      { k: 'base', fp: '0,0,0|1,1,1' },
      { k: 'base', fp: '1,2,3|1,1,1' },
    ]);
    expect(d.patch?.removed).toEqual(['0,0,0|1,1,1', '1,2,3|1,1,1']);
    const r = addBlocks(d, [{ shape: 'box', pos: [0, 2, 0], size: [2, 1, 2], mat: 'wood' }]);
    d = addMoverPoint(makeMover(r.doc, r.ids[0]), r.ids[0], [0, 5, 0]);
    d = deleteRefs(d, [{ k: 'block', id: r.ids[0] }]);
    expect(d.blocks).toHaveLength(0);
    expect(d.movers).toHaveLength(0);
  });

  it('changing a built-in box: removed from the base, back as a block', () => {
    const d = newDoc('Edit', 'kestrel', true);
    const res = adoptBaseBoxes(d, [
      { fp: '5,1,5|2,1,2', block: { shape: 'box', pos: [5, 1, 5], size: [4, 2, 4], mat: 'metal' } },
    ]);
    expect(res.doc.patch?.removed).toEqual(['5,1,5|2,1,2']);
    expect(res.refs).toEqual([{ k: 'block', id: 1 }]);
    const moved = moveRefs(res.doc, res.refs, [0, 3, 0]);
    expect(moved.blocks[0].pos).toEqual([5, 4, 5]);
  });

  it('copies a block with its movement, grows and shrinks', () => {
    let d = starter();
    const r = addBlocks(d, [{ shape: 'box', pos: [0, 2, 0], size: [2, 1, 2], mat: 'wood' }]);
    d = addMoverPoint(makeMover(r.doc, r.ids[0]), r.ids[0], [0, 6, 0]);
    const dup = duplicateRefs(d, [{ k: 'block', id: r.ids[0] }], [3, 0, 0]);
    expect(dup.doc.blocks).toHaveLength(3);
    expect(dup.doc.movers).toHaveLength(2);
    expect(dup.doc.movers[1].points[1]).toEqual([3, 6, 0]);
    const big = scaleRefs(dup.doc, dup.refs, 2);
    expect(big.blocks[2].size).toEqual([4, 2, 4]);
  });

  it('a launch pad keeps its facing and power', () => {
    const v = padVel(90, 12, 14);
    expect(near(v, [12, 14, 0], 1e-3)).toBe(true);
    const aim = padAim({ pos: [0, 0, 0], size: [1, 1, 1], vel: v });
    expect(aim).toEqual({ yaw: 90, forward: 12, up: 14 });
  });

  it('a map with every piece and object passes the game checks and compiles', () => {
    let d = starter();
    const blocks = BLOCK_BRUSHES.map((b, i) =>
      makeBlock(b, [i * 12 - 80, 1, -40], i * 15, 'metal', i % 2 ? 0xff00ff : null),
    );
    const r = addBlocks(d, blocks);
    d = addMoverPoint(makeMover(r.doc, r.ids[0]), r.ids[0], [-80, 6, -40]);
    d = setStart(d, gateAt([0, 0, 5], 0));
    d = addCheckpoint(d, gateAt([0, 0, -5], 0));
    d = setFinish(d, gateAt([0, 0, -10], 0));
    d = addPortal(d, [5, 2, 0], [5, 1, -12], 0);
    d = addPad(d, [-5, 0.2, 0], 90);
    const doc = toCustomDoc(d);
    const v = validateCustomMap(doc);
    expect(v.ok ? [] : v.errors).toEqual([]);
    expect(countPieces(doc)).toBeGreaterThan(BLOCK_BRUSHES.length);
    const def = compileCustomMap(doc);
    expect(def.race).toBeTruthy();
    expect(def.boxes.length).toBeGreaterThan(BLOCK_BRUSHES.length);
    // and it opens again as it was
    expect(toCustomDoc(fromCustomDoc(doc))).toEqual(doc);
  });

  it('the scene lists every clickable thing', () => {
    let d = starter();
    const r = addBlocks(d, [{ shape: 'box', pos: [0, 2, 0], size: [2, 1, 2], mat: 'wood' }]);
    d = addMoverPoint(makeMover(r.doc, r.ids[0]), r.ids[0], [0, 6, 0]);
    d = setStart(d, gateAt([0, 0, 5], 0));
    d = addPortal(d, [5, 2, 0], [5, 1, -12], 0);
    const sd = sceneData(d, () => false, null);
    const kinds = new Set(sd.pieces.map((p) => p.ref.k));
    expect([...kinds].sort()).toEqual(['block', 'point', 'portal', 'spawn', 'start']);
    expect(sd.movers).toHaveLength(1);
    // the moving block is not drawn with the still ones
    expect(sd.docBoxes).toHaveLength(1);
  });
});

describe('picking', () => {
  const floor: BoxDef = { c: v3(0, -0.5, 0), h: v3(10, 0.5, 10) };

  it('hits the top of a floor from above', () => {
    const hit = rayPiece(v3(1, 10, 1), v3(0, -1, 0), floor);
    expect(hit?.t).toBeCloseTo(10);
    expect(hit?.n.y).toBeCloseTo(1);
  });

  it('hits a turned box and a surf ramp on its slope', () => {
    const turned: BoxDef = {
      c: v3(0, 0, 0),
      h: v3(1, 1, 3),
      q: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2),
    };
    // turned 90°: long along x now
    expect(rayPiece(v3(2.5, 5, 0), v3(0, -1, 0), turned)).not.toBeNull();
    expect(rayPiece(v3(0, 5, 2.5), v3(0, -1, 0), turned)).toBeNull();
    const ramp: BoxDef = { c: v3(0, 1, 0), h: v3(2, 1, 2), prism: 0 };
    const hit = rayPiece(v3(0, 10, 1), v3(0, -1, 0), ramp);
    expect(hit?.t).toBeCloseTo(10 - 1); // the slope is at y = 1 half way down (z = 1 of 2)
    expect(hit!.n.z).toBeGreaterThan(0.3);
  });

  it('picks the nearest piece', () => {
    const top: BoxDef = { c: v3(0, 3, 0), h: v3(1, 0.5, 1) };
    const pieces = [floor, top].map((box) => ({ box, ...boxBounds(box) }));
    expect(pickNearest(v3(0, 10, 0), v3(0, -1, 0), pieces)?.i).toBe(1);
    expect(pickNearest(v3(5, 10, 5), v3(0, -1, 0), pieces)?.i).toBe(0);
  });

  /** A free-form prism along x: base 4 m wide at y 0, ridge at y 2 over z 0 (a curve's piece). */
  const hullPiece = (x0: number, x1: number): BoxDef => ({
    c: v3((x0 + x1) / 2, 1, 0),
    h: v3((x1 - x0) / 2, 1, 2),
    hull: [v3(x0, 0, -2), v3(x0, 0, 2), v3(x1, 0, -2), v3(x1, 0, 2), v3(x0, 2, 0), v3(x1, 2, 0)],
  });

  it("hits a curved ramp's piece on its slope, and misses beside it", () => {
    const hit = rayPiece(v3(1, 10, 1), v3(0, -1, 0), hullPiece(0, 2));
    expect(hit?.t).toBeCloseTo(9); // the slope is at y = 1 half way out (z = 1 of 2)
    expect(hit!.n.z).toBeGreaterThan(0.3);
    expect(rayPiece(v3(3, 10, 0), v3(0, -1, 0), hullPiece(0, 2))).toBeNull();
    expect(rayPiece(v3(1, 10, 2.5), v3(0, -1, 0), hullPiece(0, 2))).toBeNull();
  });

  it('groups curved ramp pieces into whole ramps by their joints', () => {
    const fp = (i: number) => `p${i}`;
    const base = [hullPiece(0, 2), hullPiece(2, 4), hullPiece(4, 6), hullPiece(20, 22), floor].map(
      (box, i) => ({ fingerprint: fp(i), box }),
    );
    const groups = rampGroups(base).map((g) => g.sort());
    expect(groups.sort((a, b) => b.length - a.length)).toEqual([['p0', 'p1', 'p2'], ['p3']]);
  });

  it("every built-in map's curved ramp pieces can be picked and belong to one ramp", () => {
    let hulls = 0;
    for (const m of MAPS) {
      const base = baseBoxesForEditor(m.id);
      const groups = rampGroups(base);
      const inGroups = groups.flat();
      const hullFps = base.filter((b) => b.box.hull).map((b) => b.fingerprint);
      hulls += hullFps.length;
      expect(new Set(inGroups)).toEqual(new Set(hullFps));
      // a ray straight down onto a piece's ridge midpoint hits it
      for (const b of base.filter((x) => x.box.hull).slice(0, 20)) {
        const r = b.box.hull!;
        const top = v3((r[4].x + r[5].x) / 2, (r[4].y + r[5].y) / 2, (r[4].z + r[5].z) / 2);
        const low = v3((r[0].x + r[3].x) / 2, (r[0].y + r[3].y) / 2, (r[0].z + r[3].z) / 2);
        // aim from outside, through the middle of the solid
        const mid = v3((top.x + low.x) / 2, (top.y + low.y) / 2, (top.z + low.z) / 2);
        const from = v3(mid.x, mid.y + 200, mid.z);
        expect(rayPiece(from, v3(0, -1, 0), b.box)).not.toBeNull();
      }
    }
    expect(hulls).toBeGreaterThan(0);
  });
});

describe('curve handles', () => {
  const arc: Curve = { kind: 'arc', radius: 10, angle: 90 };

  it('the end of every curve type is where the game builds its last piece', () => {
    const curves: Curve[] = [
      { radius: 12, angle: 90 },
      { radius: 12, angle: -120 },
      { radius: 12, angle: 200 },
      { kind: 'sCurve', radius: 12, angle: 120 },
      { kind: 'sCurve', radius: 9, angle: -90 },
      { kind: 'spiral', radius: 14, endRadius: 6, angle: 300 },
      { kind: 'wave', radius: 20, angle: 90, amplitude: 2, waves: 2 },
    ];
    for (const curve of curves) {
      const block: CustomBlock = {
        id: 1,
        shape: 'curvePlatform',
        pos: [0, 0, 0],
        size: [4, 0.5, 1],
        mat: 'concrete',
        curve,
      };
      const pieces = expandCustomBlock(block);
      const last = pieces[pieces.length - 1].c;
      const [ex, ez] = curveEndLocal(curve);
      // the last piece's middle is half a piece before the end
      expect(Math.hypot(last.x - ex, last.z - ez)).toBeLessThan(3);
    }
  });

  it('dragging the end to a point gives the turn and radius that reach it', () => {
    for (const c of [
      arc,
      { ...arc, angle: -150 },
      { ...arc, kind: 'spiral', endRadius: 6 } as Curve,
    ]) {
      const target = curveEndLocal({
        ...c,
        angle: c.angle < 0 ? -60 : 60,
        radius: 14,
        endRadius: 14,
      });
      const solved = solveCurveEnd(c, target);
      const end = curveEndLocal(solved);
      expect(Math.hypot(end[0] - target[0], end[1] - target[1])).toBeLessThan(1.2);
    }
    const s: Curve = { kind: 'sCurve', radius: 10, angle: 120 };
    const goal = curveEndLocal({ ...s, radius: 16, angle: 90 });
    const got = curveEndLocal(solveCurveEnd(s, goal));
    expect(Math.hypot(got[0] - goal[0], got[1] - goal[1])).toBeLessThan(1.2);
  });

  it('changing the radius keeps where the curve starts', () => {
    const pos: V3 = [5, 1, 5];
    const yaw = 30;
    const next = { ...arc, radius: 20 };
    const p2 = posKeepingStart(pos, yaw, arc, next);
    const s1 = localToWorld(pos, yaw, [-arc.radius, 0, 0]);
    const s2 = localToWorld(p2, yaw, [-next.radius, 0, 0]);
    expect(near(s1, s2, 1e-2)).toBe(true);
    expect(near(worldToLocal(pos, yaw, localToWorld(pos, yaw, [1, 2, 3])), [1, 2, 3], 1e-9)).toBe(
      true,
    );
  });
});

describe('removed built-in maps and curved surf pieces', () => {
  it('a draft or saved edit of a removed built-in map says so (never another map)', () => {
    expect(baseGone('surf-aurora')).toBe(true);
    expect(baseGone('surf-cinder')).toBe(true);
    expect(baseGone('kestrel')).toBe(false);
    expect(baseGone('')).toBe(false);
    expect(baseGone(undefined)).toBe(false);
    expect(GONE_MAP).toBe('This map no longer exists');
    // the game refuses to play or save it, and says why
    const doc = { ...toCustomDoc(newDoc('Old surf edit', 'kestrel', true)), base: 'surf-aurora' };
    const r = validateCustomMap(JSON.parse(JSON.stringify(doc)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/no longer exists/);
  });

  it('the draft of a removed map still reads (the start screen shows it as gone)', () => {
    const mem = new Map<string, string>();
    const g = globalThis as { localStorage?: unknown };
    const had = g.localStorage;
    g.localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    try {
      const doc = { ...newDoc('Old surf edit', 'kestrel', true), base: 'surf-aurora' };
      saveDraft(newSession(doc, 'own'));
      const info = draftInfo();
      expect(info?.base).toBe('surf-aurora');
      expect(baseGone(info?.base)).toBe(true);
      expect(() => loadDraft()).not.toThrow();
    } finally {
      g.localStorage = had;
    }
  });

  it('a free-form prism (curved surf) never turns into a solid block', () => {
    const def = mapDef('race-sunspire');
    const hull: BoxDef = {
      c: v3(0, 5, 0),
      h: v3(10, 5, 10),
      surf: true,
      hull: [
        v3(-10, 0, -10),
        v3(-10, 0, 10),
        v3(10, 0, -10),
        v3(10, 0, 10),
        v3(-10, 10, 0),
        v3(10, 10, 0),
      ],
    };
    const plain = levelToCustomMap(def, 'race-sunspire', 'x').blocks.length;
    const withHull = levelToCustomMap(
      { ...def, boxes: [...def.boxes, hull] },
      'race-sunspire',
      'x',
    );
    expect(withHull.blocks.length).toBe(plain);
  });
});
