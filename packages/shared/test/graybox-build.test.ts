// The graybox builder (level/graybox.ts) on made-up layouts: suction tubes (LevelDef.liftTubes,
// feet positions, a one-way bot link from the mouth to the landing), smooth ramps on a ceiling
// deck, and a huge generated city (test/graybox-gen.ts) that must still build quickly with
// waypoints every few cells.
import { describe, expect, it } from 'vitest';
import {
  buildGraybox,
  buildLevel,
  raycast,
  v3,
  waypointRoute,
  type GrayboxLayout,
  type LevelDef,
} from '../src/index';
import { generatedLayout } from './graybox-gen';

const nearest = (d: LevelDef, x: number, y: number, z: number) => {
  let best = -1;
  let bd = Infinity;
  d.waypoints!.forEach((w, i) => {
    const dd = Math.hypot(w.pos.x - x, w.pos.y - y, w.pos.z - z);
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  });
  return best;
};

describe('graybox builder', () => {
  it("a 'tube' link: a lift tube (feet positions) and a one-way bot link mouth → landing", () => {
    const warns: string[] = [];
    // B site (low, west) has a tube up to the high corridors (3 m)
    const d = buildGraybox(generatedLayout(4, { links: [['B', 'C', 'tube']] }), {
      warn: (m) => warns.push(m),
    });
    expect(warns).toEqual([]);
    expect(d.liftTubes).toHaveLength(1);
    const t = d.liftTubes![0];
    expect(t.base.y).toBeCloseTo(0, 5); // feet on B's floor
    expect(t.land.y).toBeCloseTo(3, 5); // feet on the corridor floor
    expect(t.top.y).toBeGreaterThan(t.land.y);
    expect([t.top.x, t.top.z]).toEqual([t.base.x, t.base.z]);
    const wps = d.waypoints!;
    const mouth = wps.findIndex((w) => w.name!.startsWith('tube:'));
    expect(mouth).toBeGreaterThanOrEqual(0);
    expect(wps[mouth].pos.x).toBeCloseTo(t.base.x, 5);
    expect(wps[mouth].pos.z).toBeCloseTo(t.base.z, 5);
    expect(wps[mouth].pos.y).toBeCloseTo(t.base.y + 1, 5);
    const land = nearest(d, t.land.x, t.land.y + 1, t.land.z);
    expect(wps[mouth].links).toContain(land);
    expect(wps[land].links).not.toContain(mouth);
    // the mouth is walked into from its cell, and back out
    const cell = wps[mouth].links.find((j) => j !== land)!;
    expect(wps[cell].links).toContain(mouth);
    expect(waypointRoute(wps, cell, land)).toContain(mouth);
  });

  it('a smooth ramp on a ceiling deck: walked upside down, flush with both rooms', () => {
    // a 10 m ceiling deck over the floor rooms: u hangs at 10, v lower at 8, the ramp between
    const lay: GrayboxLayout = {
      name: 'Ceiling Ramp',
      cellM: 4,
      layers: [
        { name: 'Floor', y: 0, rows: ['QQffffAA', 'QQffffAA', 'BBffffOO', 'BBffffOO'] },
        {
          name: 'Ceiling',
          y: 10,
          o: 'down',
          rows: ['uuurrvvv', 'uuurrvvv', '........', '........'],
        },
      ],
      legend: {
        Q: { n: 'Cyan Spawn', k: 'cyan', h: 0 },
        O: { n: 'Orange Spawn', k: 'orange', h: 0 },
        A: { n: 'A Site', k: 'site', h: 0 },
        B: { n: 'B Site', k: 'site', h: 0 },
        f: { n: 'Hall', k: 'room', h: 0 },
        u: { n: 'High Ceiling', k: 'room', h: 10 },
        v: { n: 'Low Ceiling', k: 'room', h: 8 },
        r: { n: 'Ceiling Ramp', k: 'ramp', r: [8, 10], dir: 'w' },
      },
    };
    const warns: string[] = [];
    const d = buildGraybox(lay, { warn: (m) => warns.push(m) });
    expect(warns).toEqual([]);
    const lv = buildLevel(d);
    // looking up from the hall: the ceiling's underside, 10 m over u, 8 m over v, and in between
    // a smooth slope (no step a ceiling walker can't take)
    const at = (x: number) => raycast(lv, v3(x, 2, 2), v3(0, 1, 0), 20)!.point.y;
    expect(at(6)).toBeCloseTo(10, 1);
    expect(at(26)).toBeCloseTo(8, 1);
    let last = at(11);
    for (let x = 11.25; x <= 21; x += 0.25) {
      const y = at(x);
      expect(Math.abs(y - last), `at x ${x}`).toBeLessThanOrEqual(0.2);
      last = y;
    }
    expect(at(16)).toBeCloseTo(9, 1);
    // the bots walk it both ways
    const wps = d.waypoints!;
    const hi = wps.findIndex((w) => w.name === 'u1:1,0');
    const lo = wps.findIndex((w) => w.name === 'v1:6,0');
    expect(waypointRoute(wps, hi, lo).length).toBeGreaterThan(0);
    expect(waypointRoute(wps, lo, hi).length).toBeGreaterThan(0);
  });

  it('a huge map (160 × 160 cells, waypoints every third cell) builds fast, all of it botted', () => {
    const t0 = Date.now();
    const d = buildGraybox(generatedLayout(16, { waypointEvery: 3 }), { warn: () => {} });
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(30_000);
    const wps = d.waypoints!;
    // a waypoint for every few cells, not one per cell (25 600 cells)
    expect(wps.length).toBeGreaterThan(1000);
    expect(wps.length).toBeLessThan(10_000);
    const sp = d.spawns.find((s) => s.team === 0)!.pos;
    const from = nearest(d, sp.x, sp.y + 1, sp.z);
    const seen = new Set([from]);
    const q = [from];
    for (let i = 0; i < q.length; i++)
      for (const j of wps[q[i]].links)
        if (!seen.has(j)) {
          seen.add(j);
          q.push(j);
        }
    expect(seen.size).toBe(wps.length);
  }, 120_000);
});
