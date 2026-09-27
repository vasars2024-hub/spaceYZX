// Render budget of a map: boxes, rendered faces and the triangles the level mesh builds from them
// (packages/client/src/render/level-mesh.ts splits every face into ~2.5 m tiles, at most 48 × 48).
//
//   npx tsx tools/race/budget.ts [map-id ...]
import { MAPS, mapDef, type BoxDef } from '@space-yz/shared';

const TILE = 2.5;
const tiles = (l: number) => Math.min(48, Math.max(1, Math.round(l / TILE)));

/** Triangles of one box as the level mesh draws it (a prism has no top face). */
export const boxTriangles = (b: BoxDef): number => {
  if (b.noRender) return 0;
  if (b.mat === 'trim' || b.mat === 'glass' || b.mat === 'skyglass' || b.lowDetail)
    return (b.prism !== undefined ? 5 : 6) * 2;
  const x = b.h.x * 2;
  const y = b.h.y * 2;
  const z = b.h.z * 2;
  const slant = b.prism !== undefined ? Math.hypot(y, z / 2) : y;
  const faces: [number, number][] = [
    [y, z], // ±x (end faces: triangles on a prism, tiled the same)
    [y, z],
    [z, x], // bottom
    [slant, x],
    [slant, x],
  ];
  if (b.prism === undefined) faces.push([z, x]);
  return faces.reduce((a, [u, v]) => a + tiles(u) * tiles(v) * 2, 0);
};

export const mapBudget = (id: string) => {
  const def = mapDef(id);
  const boxes = def.boxes.filter((b) => !b.noRender);
  return {
    boxes: boxes.length,
    colliders: def.boxes.filter((b) => !b.noCollide).length,
    triangles: boxes.reduce((a, b) => a + boxTriangles(b), 0),
    trims: boxes.filter((b) => b.mat === 'trim').length,
  };
};

if (process.argv[1]?.replace(/\\/g, '/').endsWith('race/budget.ts')) {
  const ids = process.argv.slice(2);
  for (const m of MAPS) {
    if (ids.length && !ids.includes(m.id)) continue;
    const r = mapBudget(m.id);
    console.log(
      `${m.id.padEnd(18)} boxes ${String(r.boxes).padStart(5)}  colliders ${String(r.colliders).padStart(5)}  triangles ${String(r.triangles).padStart(7)}  strip lights ${r.trims}`,
    );
  }
}
