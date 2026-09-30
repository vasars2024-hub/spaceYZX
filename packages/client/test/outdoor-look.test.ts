// Outdoor maps (LevelDef.outdoor): a gradient sky dome + sun instead of the space sky, and a
// coloured key light baked into the level. Indoor maps keep their look.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mapDef } from '@space-yz/shared';
import { buildLevelMeshes } from '../src/render/level-mesh';
import { SPACE_SKY_NAME } from '../src/render/sky';

const skyOf = (id: string) => {
  const m = buildLevelMeshes(mapDef(id), { atmosphere: false, dust: false });
  const sky = m.group.getObjectByName(SPACE_SKY_NAME) ?? null;
  const meshes = sky ? sky.children.filter((c) => (c as THREE.Mesh).isMesh) : [];
  return { m, sky, meshes };
};

describe('outdoor look', () => {
  it.each(['canyon-relay', 'sakura-hold'])('%s: sky dome with its gradient and a sun', (id) => {
    const def = mapDef(id);
    const { m, sky, meshes } = skyOf(id);
    expect(sky).not.toBeNull();
    expect(meshes.length).toBe(2); // dome + sun
    const dome = meshes[0] as THREE.Mesh;
    const mat = dome.material as THREE.MeshBasicMaterial;
    expect(mat.side).toBe(THREE.BackSide);
    expect(mat.fog).toBe(false);
    // the top of the dome is the top colour, the horizon ring the horizon colour
    const pos = dome.geometry.getAttribute('position');
    const col = dome.geometry.getAttribute('color');
    let top = 0;
    for (let i = 1; i < pos.count; i++) if (pos.getY(i) > pos.getY(top)) top = i;
    const want = new THREE.Color(def.outdoor!.top);
    expect(col.getX(top)).toBeCloseTo(want.r, 2);
    expect(col.getZ(top)).toBeCloseTo(want.b, 2);
    m.dispose();
  });

  it('indoor maps keep the space sky (no dome)', () => {
    const { m, meshes } = skyOf('orbital-ring');
    // stars (points) + moons, no BackSide dome
    for (const c of meshes)
      expect(((c as THREE.Mesh).material as THREE.Material).side).not.toBe(THREE.BackSide);
    m.dispose();
  });
});
