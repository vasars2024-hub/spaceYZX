// Ancient and Anubis (level/maps/cs/): the CS2 classics rebuilt at about 3× their size. The layout
// is painted from rectangles in CS units, so these checks make sure the painted grid still is the
// map it should be: the right callouts, touching only the areas they should (a wall that rounds
// away would join two rooms), gentle straight ramps, signs on walls, props on flat floor.
import { describe, expect, it } from 'vitest';
import { ANCIENT_LAYOUT, ANUBIS_LAYOUT, MAPS, type GrayboxLayout } from '../src/index';

/** every pair of areas that meet (side by side, any layer) — the map's connections */
const CONNECTIONS: Record<string, string[]> = {
  ancient: [
    'A Main Ramp | Elbow',
    'A Main | A Main Ramp',
    'A Main | T Spawn',
    'A Site | Donut Ramp',
    'A Site | Elbow',
    'A Site | Temple',
    'B Long | B Main',
    'B Long | B Site',
    'B Main | B Ramp',
    'B Pillar | B Site',
    'B Pillar | Ruins',
    'B Ramp | Lane',
    'B Short | B Site',
    'B Short | Cave',
    'CT Mid | CT Spawn',
    'CT Mid | Top Mid',
    'CT Spawn | Ruins',
    'CT Spawn | Temple',
    'Cave | Water',
    'Donut Entrance | Top Mid',
    'Donut | Donut Entrance',
    'Donut | Donut Ramp',
    'Lane | T Spawn',
    'Mid | Top Mid',
    'Mid | Water',
    'Red Room | T Ramp',
    'Red Room | T Spawn',
    'T Ramp | Water',
  ],
  anubis: [
    'A CT | A Site',
    'A CT | CT Spawn',
    'A CT | Heaven Ramp',
    'A Heaven | A Site',
    'A Heaven | Heaven Ramp',
    'A Heaven | Heaven Stairs',
    'A Main Stairs | A Site',
    'A Main | A Main Stairs',
    'A Main | Street',
    'A Site | Heaven Stairs',
    'A Site | Palace',
    'A Site | Walkway',
    'B CT | CT Spawn',
    'B CT | Camera',
    'B Connector | B Site',
    'B Connector | Canal',
    'B Heaven Stairs | Ruins',
    'B Heaven | B Heaven Stairs',
    'B Heaven | B Site',
    'B Main | B Site',
    'B Main | T Spawn',
    'B Site | Camera Steps',
    'B Site | Ruins Steps',
    'Bridge | Camera',
    'Bridge | Connector',
    'Bridge | Water',
    'CT Spawn | Ruins',
    'CT Spawn | Water Stairs',
    'Camera | Camera Steps',
    'Camera | Water',
    'Canal Stairs | Mid',
    'Canal | Canal Stairs',
    'Canal | Water',
    'Connector | Walkway Steps',
    'Connector | Water',
    'Mid | T Spawn',
    'Palace Stairs | Street',
    'Palace | Palace Stairs',
    'Ruins | Ruins Steps',
    'Street | T Spawn',
    'Walkway | Walkway Steps',
    'Water | Water Stairs',
  ],
};

const CALLOUTS: Record<string, string[]> = {
  ancient: [
    'T Spawn',
    'CT Spawn',
    'Red Room',
    'T Ramp',
    'Water',
    'Mid',
    'Top Mid',
    'CT Mid',
    'Donut',
    'Temple',
    'A Main',
    'Elbow',
    'A Site',
    'Lane',
    'B Ramp',
    'B Main',
    'B Long',
    'B Short',
    'B Pillar',
    'Cave',
    'Ruins',
    'B Site',
  ],
  anubis: [
    'T Spawn',
    'CT Spawn',
    'Mid',
    'Canal',
    'Water',
    'Bridge',
    'Connector',
    'Walkway',
    'A Main',
    'Street',
    'Palace',
    'A Site',
    'A Heaven',
    'B Main',
    'B Site',
    'B Connector',
    'Camera',
    'Ruins',
    'B Heaven',
    'A CT',
    'B CT',
  ],
};

const LAYOUTS: [string, GrayboxLayout, string][] = [
  ['ancient', ANCIENT_LAYOUT, 'jungle'],
  ['anubis', ANUBIS_LAYOUT, 'egypt'],
];

const STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as const;

describe.each(LAYOUTS)('%s', (id, lay, theme) => {
  const ground = lay.layers[0].rows;
  const W = ground[0].length;
  const H = ground.length;
  const at = (l: number, x: number, y: number) => lay.layers[l]?.rows[y]?.[x];

  it('is in the registry as a competitive graybox with its theme', () => {
    const m = MAPS.find((x) => x.id === id)!;
    expect(m.competitive).toBe(true);
    expect(m.graybox).toBe(true);
    expect(lay.theme).toBe(theme);
    expect(W).toBeLessThanOrEqual(140);
    expect(H).toBeLessThanOrEqual(140);
    for (const l of lay.layers) {
      expect(l.rows).toHaveLength(H);
      for (const r of l.rows) expect(r).toHaveLength(W);
    }
  });

  it('has the real callouts, one attacker and one defender spawn, sites A and B', () => {
    const names = Object.values(lay.legend).map((a) => a.n);
    for (const n of CALLOUTS[id]) expect(names, n).toContain(n);
    const kinds = Object.values(lay.legend).map((a) => a.k);
    expect(kinds.filter((k) => k === 'orange')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'cyan')).toHaveLength(1);
    const sites = Object.values(lay.legend).filter((a) => a.k === 'site');
    expect(sites.map((a) => a.n[0]).sort()).toEqual(['A', 'B']);
    // no gravity rooms; nothing needs a pad, rail, portal or tube
    expect(kinds).not.toContain('gravity');
    expect(lay.links ?? []).toEqual([]);
    expect(lay.sizes).toBeUndefined();
  });

  it('connects exactly the areas it should', () => {
    const pairs = new Set<string>();
    lay.layers.forEach((L) =>
      L.rows.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (c === '.') return;
          for (const [dx, dy] of [
            [1, 0],
            [0, 1],
          ])
            for (let m = 0; m < lay.layers.length; m++) {
              const d = at(m, x + dx, y + dy);
              if (d && d !== '.' && d !== c)
                pairs.add([lay.legend[c].n, lay.legend[d].n].sort().join(' | '));
            }
        }),
      ),
    );
    expect([...pairs].sort()).toEqual([...CONNECTIONS[id]].sort());
  });

  it('ramps are straight and gentle (30° at most)', () => {
    for (const [c, a] of Object.entries(lay.legend)) {
      if (a.k !== 'ramp') continue;
      expect(a.dir, a.n).toBeDefined();
      expect(a.r, a.n).toBeDefined();
      const cells: [number, number][] = [];
      lay.layers.forEach((L) =>
        L.rows.forEach((row, y) => [...row].forEach((ch, x) => ch === c && cells.push([x, y]))),
      );
      const along = cells.map(([x, y]) => (a.dir === 'n' || a.dir === 's' ? y : x));
      const run = (Math.max(...along) - Math.min(...along) + 1) * lay.cellM;
      const rise = Math.abs(a.r![1] - a.r![0]);
      expect((Math.atan2(rise, run) * 180) / Math.PI, a.n).toBeLessThanOrEqual(30);
    }
  });

  it('signs hang on a wall, facing a floor', () => {
    expect(lay.signs!.length).toBeGreaterThan(10);
    for (const s of lay.signs!) {
      expect(at(s.l ?? 0, s.x, s.y), s.text).toBe('.');
      const [dx, dy] = STEP[s.face];
      const front = at(s.l ?? 0, s.x + dx, s.y + dy);
      expect(front && front !== '.', s.text).toBe(true);
    }
  });

  it('props stand on flat floor of one area', () => {
    expect(lay.cover).toBe(false);
    expect(lay.props!.length).toBeGreaterThan(15);
    for (const p of lay.props!) {
      const under = new Set<string>();
      for (let y = Math.floor(p.y); y < Math.ceil(p.y + p.d); y++)
        for (let x = Math.floor(p.x); x < Math.ceil(p.x + p.w); x++)
          under.add(at(p.l ?? 0, x, y) ?? '.');
      const where = JSON.stringify(p);
      expect(under.size, where).toBe(1);
      const c = [...under][0];
      expect(c, where).not.toBe('.');
      expect(lay.legend[c].k, where).not.toBe('ramp');
    }
  });
});
