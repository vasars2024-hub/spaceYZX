import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { compileCustomMap, type CustomMapDoc } from '@space-yz/shared';
import { buildLevelMeshes } from '../src/render/level-mesh';
import { buildMoverMeshes } from '../src/render/mover-mesh';

// Moving blocks of player-made maps: drawn on their own, where the sim has them.

const doc: CustomMapDoc = {
  v: 1,
  name: 'Movers',
  base: '',
  sky: 'day',
  blocks: [
    { id: 1, shape: 'box', pos: [0, -0.5, 0], size: [20, 1, 20], mat: 'concrete' },
    { id: 2, shape: 'box', pos: [0, 3, 0], size: [4, 0.5, 4], mat: 'glass' },
  ],
  movers: [
    {
      block: 2,
      points: [
        [0, 3, 0],
        [6, 3, 0],
      ],
      speed: 3,
      delay: 0,
    },
  ],
  spawns: [],
  portals: [],
  launchPads: [],
};

const vertices = (g: THREE.Object3D): number => {
  let n = 0;
  g.traverse((o) => {
    if (o instanceof THREE.Mesh)
      n += (o.geometry as THREE.BufferGeometry).getAttribute('position').count;
  });
  return n;
};

describe('mover meshes', () => {
  it('are left out of the static level and moved to the tick asked for', () => {
    const def = compileCustomMap(doc);
    const still = compileCustomMap({ ...doc, movers: [] });
    const level = buildLevelMeshes(def);
    expect(vertices(level.group)).toBeLessThan(vertices(buildLevelMeshes(still).group));
    const movers = buildMoverMeshes(def)!;
    expect(vertices(movers.group)).toBeGreaterThan(0);
    const part = movers.group.children[0];
    movers.update(0);
    expect(part.position.x).toBe(0);
    movers.update(60); // 3 m along, 1 s in
    expect(part.position.x).toBeCloseTo(3, 9);
    movers.update(90.5);
    expect(part.position.x).toBeCloseTo(4.525, 9);
    movers.dispose();
    expect(buildMoverMeshes(still)).toBeNull();
  });
});
