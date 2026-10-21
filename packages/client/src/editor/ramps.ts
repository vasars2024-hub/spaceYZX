// MAP MAKER — the built-in map's curved ramps: its free-form prisms (BoxDef.hull, built by
// level/course/curve.ts) grouped into whole ramps, so a click can take one ramp at once. Two
// pieces are one ramp when they share a joint (two or more exact corners). No Three.js here.
import type { BoxDef } from '@space-yz/shared';

/** The fingerprints of each curved ramp's pieces. */
export const rampGroups = (base: { fingerprint: string; box: BoxDef }[]): string[][] => {
  const hulls = base.filter((b) => b.box.hull);
  const parent = hulls.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const byCorner = new Map<string, number[]>();
  hulls.forEach((b, i) => {
    const keys = new Set(
      b.box.hull!.map(
        (p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`,
      ),
    );
    for (const k of keys) {
      const l = byCorner.get(k) ?? [];
      l.push(i);
      byCorner.set(k, l);
    }
  });
  const shared = new Map<string, number>();
  for (const l of byCorner.values())
    for (let a = 0; a < l.length; a++)
      for (let b = a + 1; b < l.length; b++) {
        const k = `${l[a]}|${l[b]}`;
        const n = (shared.get(k) ?? 0) + 1;
        shared.set(k, n);
        if (n === 2) parent[find(l[a])] = find(l[b]);
      }
  const groups = new Map<number, Set<string>>();
  hulls.forEach((b, i) => {
    const r = find(i);
    const g = groups.get(r) ?? new Set<string>();
    g.add(b.fingerprint);
    groups.set(r, g);
  });
  return [...groups.values()].map((g) => [...g]);
};
