// Map Maker: dragging whole structures (editor/structure.ts) and the connect magnet
// (editor/connect-snap.ts), on made-up pieces and on the real maps.
import { describe, expect, it } from 'vitest';
import { baseBoxesForEditor, mapDef, qFromAxisAngle, v3, type BoxDef } from '@space-yz/shared';
import { connectSnap } from '../src/editor/connect-snap';
import { linked, structureKeys, STRUCTURE, type StructItem } from '../src/editor/structure';
import { boxBounds } from '../src/editor/pick';

const box = (c: [number, number, number], h: [number, number, number]): BoxDef => ({
  c: v3(...c),
  h: v3(...h),
});
const item = (key: string, b: BoxDef): StructItem => ({ key, ...boxBounds(b) });

describe('connect magnet', () => {
  const platform = box([0, 0, 0], [2, 0.25, 2]);

  it('a platform dragged near another snaps flush beside it, edges lined up', () => {
    // 0.3 m gap on x, 0.2 m off on z, 0.1 m off in height
    const moving = box([4.3, 0.1, 0.2], [2, 0.25, 2]);
    const r = connectSnap([moving], [platform]);
    expect(r.hit).toBe(0);
    expect(r.shift).toEqual([-0.3, -0.1, -0.2]);
  });

  it('an overlapping piece is pushed out to touch, not inside', () => {
    const moving = box([3.8, 0, 0], [2, 0.25, 2]);
    expect(connectSnap([moving], [platform]).shift[0]).toBeCloseTo(0.2);
  });

  it('a crate dropped just above a platform lands on it', () => {
    const crate = box([0.3, 0.9, 0.1], [0.5, 0.5, 0.5]);
    const r = connectSnap([crate], [platform]);
    expect(r.shift[1]).toBeCloseTo(-0.15);
  });

  it('too far, or only corner to corner: nothing happens', () => {
    expect(connectSnap([box([5, 0, 0], [2, 0.25, 2])], [platform]).hit).toBe(-1);
    expect(connectSnap([box([4.2, 0, 4.2], [2, 0.25, 2])], [platform]).hit).toBe(-1);
  });

  it('turned pieces snap only to faces parallel to theirs', () => {
    const q30 = qFromAxisAngle(v3(0, 1, 0), Math.PI / 6);
    const turned = { ...box([4.3, 0, 0], [2, 0.25, 2]), q: q30 };
    expect(connectSnap([turned], [platform]).hit).toBe(-1);
    // a quarter turn is parallel
    const q90 = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2);
    const quarter = { ...box([4.3, 0, 0], [2, 0.25, 2]), q: q90 };
    expect(connectSnap([quarter], [platform]).shift[0]).toBeCloseTo(-0.3);
    // two pieces turned the same way snap in their own frame
    const a = { ...box([0, 0, 0], [2, 0.25, 2]), q: q30 };
    const along = qFromAxisAngle(v3(0, 1, 0), Math.PI / 6);
    const off = { x: 4.3 * Math.cos(Math.PI / 6), z: -4.3 * Math.sin(Math.PI / 6) };
    const b = { ...box([off.x, 0, off.z], [2, 0.25, 2]), q: along };
    const r = connectSnap([b], [a]);
    expect(r.hit).toBe(0);
    expect(Math.hypot(r.shift[0], r.shift[2])).toBeCloseTo(0.3, 2);
  });

  it('a group snaps as one: the closest of its pieces decides', () => {
    const group = [box([4.4, 0, 0], [2, 0.25, 2]), box([4.4, 1, 0], [0.5, 0.75, 0.5])];
    expect(connectSnap(group, [platform]).shift[0]).toBeCloseTo(-0.4);
  });
});

describe('structures (what a drag takes along)', () => {
  const floor = item('floor', box([0, -0.5, 0], [50, 0.5, 50]));
  const plat = item('plat', box([0, 3, 0], [3, 0.25, 3]));
  const tier = item('tier', box([0, 2.25, 0], [2, 0.5, 2])); // rock tier under it
  const trim = item('trim', box([2.95, 3.3, 0], [0.1, 0.1, 3])); // along an edge
  const crate = item('crate', box([1, 3.75, 1], [0.5, 0.5, 0.5])); // standing on it
  const neighbour = item('next', box([6, 3, 0], [3, 0.25, 3])); // side by side
  const pillar = item('pillar', box([0, 0.9, 0], [0.4, 0.9, 0.4])); // on the floor, under the tier
  const all = [floor, plat, tier, trim, crate, neighbour, pillar];

  it('stacked or embedded pieces link; side-by-side ones do not', () => {
    expect(linked(plat, tier)).toBe(true);
    expect(linked(plat, trim)).toBe(true);
    expect(linked(plat, crate)).toBe(true);
    expect(linked(plat, neighbour)).toBe(false);
  });

  it('a platform brings its layers but not its neighbour or the floor', () => {
    const s = structureKeys(all, 'plat');
    expect([...s.keys].sort()).toEqual(['crate', 'pillar', 'plat', 'tier', 'trim']);
    expect(s.capped).toBe(false);
  });

  it('a crate leaves the platform it stands on... unless the platform is small', () => {
    // (the platform's footprint is 36 m², the crate's 1 m²: it is the crate's ground)
    expect([...structureKeys(all, 'crate').keys]).toEqual(['crate']);
  });

  it('dragging the floor takes everything on it (not the floating neighbour)', () => {
    expect(structureKeys(all, 'floor').keys.has('next')).toBe(false);
    expect(structureKeys(all, 'floor').keys.size).toBe(all.length - 1);
  });

  it('a structure over the cap is too big to drag together', () => {
    const many: StructItem[] = [];
    for (let i = 0; i <= STRUCTURE.cap + 5; i++)
      many.push(item(`k${i}`, box([0, i * 0.5, 0], [1, 0.25, 1])));
    expect(structureKeys(many, 'k0').capped).toBe(true);
  });

  const baseItems = (mapId: string): StructItem[] =>
    baseBoxesForEditor(mapId).map((b) => item(b.fingerprint, b.box));

  it('Sunspire: grabbing a race platform takes its layers, not the course', () => {
    const items = baseItems('race-sunspire');
    const def = mapDef('race-sunspire');
    const sizes: number[] = [];
    for (const g of def.race!.checkpoints.slice(0, 4)) {
      // the floor under each checkpoint's respawn point
      const p = g.respawn;
      const under = items
        .filter(
          (it) =>
            p.x >= it.min.x &&
            p.x <= it.max.x &&
            p.z >= it.min.z &&
            p.z <= it.max.z &&
            Math.abs(it.max.y - p.y) < 0.3,
        )
        .sort(
          (a, b) =>
            (a.max.x - a.min.x) * (a.max.z - a.min.z) - (b.max.x - b.min.x) * (b.max.z - b.min.z),
        )[0];
      if (!under) continue;
      const s = structureKeys(items, under.key);
      sizes.push(s.keys.size);
    }
    console.log('Sunspire checkpoint platforms: structure sizes', sizes, 'of', items.length);
    expect(sizes.length).toBeGreaterThan(0);
    for (const n of sizes) expect(n).toBeLessThan(items.length / 10);
  });

  it('Split Deck: grabbing a crate takes the crate(s), not the deck', () => {
    const boxes = baseBoxesForEditor('split-deck');
    const items = boxes.map((b) => item(b.fingerprint, b.box));
    const crates = boxes.filter((b) => b.box.mat === 'crate');
    expect(crates.length).toBeGreaterThan(0);
    const sizes = crates.slice(0, 8).map((c) => structureKeys(items, c.fingerprint).keys.size);
    console.log('Split Deck crates: structure sizes', sizes, 'of', items.length);
    for (const n of sizes) expect(n).toBeLessThanOrEqual(6);
  });
});
