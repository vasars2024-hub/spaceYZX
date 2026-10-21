// The CS2 classics, traced from Valve's official radars at 1.25× real size (level/maps/cs/).
// The shared bar (bots reach everything, routes, clipping, walks to both sites) is in
// graybox-maps / minimap / map-clipping; this file checks what is special to these eight:
// registered for matches, about the real size, the famous callouts, one attacker (T = Orange)
// and one defender (CT = Cyan) spawn, sites A and B, and no gravity areas.
import { describe, expect, it } from 'vitest';
import {
  ANCIENT_LAYOUT,
  ANUBIS_LAYOUT,
  CACHE_LAYOUT,
  DUST2_LAYOUT,
  INFERNO_LAYOUT,
  mapDef,
  MAPS,
  MIRAGE_LAYOUT,
  NUKE_LAYOUT,
  TRAIN_LAYOUT,
  type GrayboxLayout,
} from '../src/index';

const CS: [id: string, layout: GrayboxLayout, callouts: string[]][] = [
  [
    'dust2',
    DUST2_LAYOUT,
    ['Long A', 'Catwalk', 'Mid', 'Xbox', 'Upper Tunnels', 'B Site', 'A Site'],
  ],
  ['mirage', MIRAGE_LAYOUT, ['Palace', 'Jungle', 'Connector', 'Window', 'Underpass', 'Apartments']],
  ['inferno', INFERNO_LAYOUT, ['Banana', 'Apartments', 'Library', 'Coffins', 'Second Mid', 'Arch']],
  ['nuke', NUKE_LAYOUT, ['Lobby', 'Squeaky', 'Hut', 'Heaven', 'Ramp', 'Secret', 'Outside']],
  ['ancient', ANCIENT_LAYOUT, ['Donut', 'Cave', 'Red Room', 'Temple', 'Elbow', 'Pillar']],
  [
    'anubis',
    ANUBIS_LAYOUT,
    ['Canal / Water', 'Bridge', 'Connector', 'Palace', 'Walkway', 'Heaven'],
  ],
  ['cache', CACHE_LAYOUT, ['Squeaky', 'Highway', 'Checkers', 'Garage', 'White Box', 'Sun Room']],
  ['train', TRAIN_LAYOUT, ['Ivy', 'Popdog', 'Ladder Room', 'Upper B', 'Lower B', 'El Box']],
];

describe.each(CS)('%s (traced CS map)', (id, layout, callouts) => {
  it('is a competitive map with the real callouts', () => {
    const m = MAPS.find((x) => x.id === id);
    expect(m?.competitive).toBe(true);
    expect(m?.retired).toBeFalsy();
    const names = Object.values(layout.legend).map((a) => a.n);
    for (const c of callouts) expect(names, c).toContain(c);
  });

  it('is about the real size × 1.25 (one CS map ≈ 90–170 m across at that scale)', () => {
    const d = mapDef(id);
    const w = d.boundsMax.x - d.boundsMin.x;
    const l = d.boundsMax.z - d.boundsMin.z;
    expect(Math.max(w, l)).toBeGreaterThan(90);
    expect(Math.max(w, l)).toBeLessThan(240);
  });

  it('has one T (Orange) and one CT (Cyan) spawn area, sites A and B, no gravity areas', () => {
    const kinds = Object.values(layout.legend).map((a) => a.k);
    expect(kinds.filter((k) => k === 'orange')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'cyan')).toHaveLength(1);
    expect(kinds).not.toContain('gravity');
    expect(
      mapDef(id)
        .bombSites?.map((s) => s.name)
        .sort(),
    ).toEqual(['A', 'B']);
  });
});
