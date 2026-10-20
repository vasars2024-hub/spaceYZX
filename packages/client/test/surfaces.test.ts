// Procedural level surfaces (render/surfaces.ts): drawn in code, the same on every PC, tiling
// without seams, and tinted by each box's own colour.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mapDef, v3, type LevelDef } from '@space-yz/shared';
import { SURFACES, SURFACE_SPEC, drawSurface, type Surface } from '../src/render/surfaces';
import { baseColorOf, buildLevelMeshes, hiddenFaces, surfaceOf } from '../src/render/level-mesh';

const N = 48;
const lum = (d: Float32Array, x: number, y: number) => {
  const i = ((y % N) * N + (x % N)) * 3;
  return d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15;
};

describe('procedural surfaces', () => {
  const drawn = new Map<Surface, Float32Array>(SURFACES.map((k) => [k, drawSurface(k, N)]));

  it('are deterministic (the same pixels every time)', () => {
    for (const k of ['strata', 'paving', 'wood'] as const)
      expect(Array.from(drawSurface(k, N))).toEqual(Array.from(drawn.get(k)!));
  });

  it.each(SURFACES.filter((k) => SURFACE_SPEC[k].scale !== null))(
    '%s tiles without a visible seam',
    (k) => {
      const d = drawn.get(k)!;
      // the step across the wrap (last column → first) is no bigger than ordinary steps
      let inner = 0;
      let across = 0;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N - 1; x++) inner += Math.abs(lum(d, x + 1, y) - lum(d, x, y));
        across += Math.abs(lum(d, 0, y) - lum(d, N - 1, y));
        across += Math.abs(lum(d, y, 0) - lum(d, y, N - 1));
      }
      const innerAvg = inner / (N * (N - 1));
      const acrossAvg = across / (2 * N);
      expect(acrossAvg).toBeLessThan(innerAvg * 2.5 + 0.02);
    },
  );

  it('average out to the box colour (texture brightness ~1) and have real detail', () => {
    for (const k of SURFACES) {
      const d = drawn.get(k)!;
      let sum = 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const l = lum(d, x, y);
          sum += l;
          lo = Math.min(lo, l);
          hi = Math.max(hi, l);
        }
      expect(sum / (N * N)).toBeCloseTo(SURFACE_SPEC[k].mean, 2);
      if (k !== 'plain') expect(hi - lo).toBeGreaterThan(0.15);
    }
  });

  it('natural materials look different on the ground and on walls', () => {
    const up = v3(0, 1, 0);
    const side = v3(1, 0, 0);
    expect(surfaceOf('sand', up)).toBe('sandFloor');
    expect(surfaceOf('sand', side)).toBe('sandstone');
    expect(surfaceOf('rock', up)).toBe('rockGround');
    expect(surfaceOf('rock', side)).toBe('strata');
    expect(surfaceOf('plate', up)).toBe('paving');
    expect(surfaceOf('floor', up)).toBe('concrete');
    expect(surfaceOf('hull', side)).toBe('hull');
    expect(surfaceOf('water', up)).toBe('plain');
  });

  it('walls without a colour are light steel, not near-black; a box colour wins', () => {
    const hull = baseColorOf({ c: v3(), h: v3(1, 1, 1), mat: 'hull' });
    for (const ch of [hull >> 16, (hull >> 8) & 255, hull & 255]) expect(ch).toBeGreaterThan(140);
    expect(baseColorOf({ c: v3(), h: v3(1, 1, 1), mat: 'hull', color: 0x123456 })).toBe(0x123456);
  });

  it('every ordinary surface of a level is one mesh, each vertex naming its layer', () => {
    const def: LevelDef = {
      name: 't',
      boundsMin: v3(-20, -2, -20),
      boundsMax: v3(20, 10, 20),
      defaultGravity: v3(0, -1, 0),
      boxes: [
        { c: v3(0, -0.5, 0), h: v3(20, 0.5, 20), mat: 'sand' },
        { c: v3(5, 4, 0), h: v3(0.5, 4, 20), mat: 'rock', color: 0xaa5533 },
        { c: v3(-5, 4, 0), h: v3(0.5, 4, 20), mat: 'hull' },
        { c: v3(0, 1, 0), h: v3(1, 1, 1), mat: 'crate' },
      ],
      zones: [],
      rails: [],
      pads: [],
      spawns: [{ pos: v3(0, 0, 5), yawDeg: 0 }],
      towers: [],
    };
    const m = buildLevelMeshes(def, { atmosphere: false, dust: false });
    const meshes: THREE.Mesh[] = [];
    m.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.getAttribute('surf'))
        meshes.push(o as THREE.Mesh);
    });
    expect(meshes.length).toBe(1);
    const surf = meshes[0].geometry.getAttribute('surf');
    const layers = new Set<number>();
    for (let i = 0; i < surf.count; i++) layers.add(surf.getX(i));
    // sand floor + sandstone sides, rock ground + strata, hull, crate
    for (const k of ['sandFloor', 'sandstone', 'strata', 'hull', 'crate'] as const)
      expect(layers.has(SURFACES.indexOf(k))).toBe(true);
    m.dispose();
  });

  it('a real map draws its boxes in a handful of draw calls, hidden faces left out', () => {
    const m = buildLevelMeshes(mapDef('canyon-relay'), { boxesOnly: true });
    let meshes = 0;
    m.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBeLessThanOrEqual(5);
    m.dispose();
  });

  it('leaves out a face pressed flat against a neighbour, keeps a partly covered one', () => {
    const def: LevelDef = {
      name: 't',
      boundsMin: v3(-20, -2, -20),
      boundsMax: v3(20, 30, 20),
      defaultGravity: v3(0, -1, 0),
      boxes: [
        { c: v3(0, 10, 0), h: v3(2, 10, 2) }, // a wall column…
        { c: v3(4, 10, 0), h: v3(2, 10, 2) }, // …and its neighbour, same size
        { c: v3(0, -0.5, 0), h: v3(10, 0.5, 10), mat: 'floor' }, // the floor both stand on
        { c: v3(0, 10, 4), h: v3(2, 10, 2), mat: 'skyglass' }, // glass hides nothing
      ],
      zones: [],
      rails: [],
      pads: [],
      spawns: [{ pos: v3(0, 0, 5), yawDeg: 0 }],
      towers: [],
    };
    const h = hiddenFaces(def);
    // FACES order: +x, -x, +y, -y, +z, -z
    expect(h.has(0 * 6 + 0)).toBe(true); // column 0's +x side touches column 1
    expect(h.has(1 * 6 + 1)).toBe(true); // and back
    expect(h.has(0 * 6 + 3)).toBe(true); // column bottoms stand on the floor
    expect(h.has(2 * 6 + 2)).toBe(false); // the floor top is only partly covered
    expect(h.has(0 * 6 + 4)).toBe(false); // the side behind the glass stays
  });
});
