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

describe('Split Deck look', () => {
  const drawables = (group: THREE.Object3D): THREE.Object3D[] => {
    const out: THREE.Object3D[] = [];
    group.traverse((o) => {
      const d = o as THREE.Object3D & { isMesh?: boolean; isPoints?: boolean; isSprite?: boolean };
      if (d.isMesh || d.isPoints || d.isSprite) out.push(o);
    });
    return out;
  };

  it('bakes fixtures, moonlight under the glass and team accents into the level light', () => {
    const def = mapDef('split-deck');
    const lights = collectLights(def);
    expect(lights.length).toBeGreaterThan(150);
    const glass = mapDef('split-deck').boxes.filter((b) => b.mat === 'skyglass');
    // moonlight: cool lights just under the glass ceiling (y 14)
    expect(lights.filter((l) => l.color === 0xa9c4ff && l.pos.y > 12.5).length).toBeGreaterThan(5);
    expect(glass.length).toBeGreaterThan(3);
  });

  it('draws the whole level (glass, stars, moons included) in a handful of draw calls', () => {
    // effects 'reduced' (the default) and 'minimal': no decoration layer
    const m = buildLevelMeshes(mapDef('split-deck'), { atmosphere: false, dust: false });
    const d = drawables(m.group);
    expect(d.length).toBeLessThanOrEqual(14);
    // the glass is see-through and drawn after the level; the sky ignores the fog
    const glassMesh = d.find(
      (o) => ((o as THREE.Mesh).material as THREE.Material).transparent === true,
    ) as THREE.Mesh;
    expect(glassMesh).toBeDefined();
    expect((glassMesh.material as THREE.Material).depthWrite).toBe(false);
    const stars = d.find((o) => (o as THREE.Points).isPoints) as THREE.Points;
    expect((stars.material as THREE.PointsMaterial).fog).toBe(false);
    m.dispose();
  });
});
