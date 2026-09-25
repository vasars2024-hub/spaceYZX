import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLevel, mapDef, v3, type LevelDef } from '@space-yz/shared';
import { buildLevelMeshes, collectLights, makeLightAt } from '../src/render/level-mesh';

describe('level lighting', () => {
  it('strip lights add lights automatically; Kestrel has atmosphere lights everywhere', () => {
    const lights = collectLights(mapDef('kestrel'));
    expect(lights.length).toBeGreaterThan(60);
    expect(lights.some((l) => l.shaft)).toBe(true);
  });

  it('walls block baked light (no bleeding into the next room)', () => {
    const def: LevelDef = {
      name: 't',
      boundsMin: v3(-20, -2, -20),
      boundsMax: v3(20, 10, 20),
      defaultGravity: v3(0, -1, 0),
      boxes: [
        { c: v3(0, -0.5, 0), h: v3(20, 0.5, 20) },
        { c: v3(0, 4, 0), h: v3(0.5, 4, 20) }, // wall at x = 0
      ],
      zones: [],
      rails: [],
      pads: [],
      spawns: [{ pos: v3(-5, 0, 0), yawDeg: 0 }],
      towers: [],
    };
    const lightAt = makeLightAt(buildLevel(def), [
      { pos: v3(-3, 3, 0), color: new THREE.Color(1, 1, 1), radius: 10, intensity: 1 },
    ]);
    const up = v3(0, 1, 0);
    expect(lightAt(v3(-3, 0, 0), up).r).toBeGreaterThan(0.3); // under the light
    expect(lightAt(v3(3, 0, 0), up).r).toBe(0); // same distance, behind the wall
  });

  it('builds textured meshes without a DOM (textures just stay off)', () => {
    const m = buildLevelMeshes(mapDef('training-bay'), { atmosphere: true });
    expect(m.group.children.length).toBeGreaterThan(3);
    m.dispose();
  });
});
