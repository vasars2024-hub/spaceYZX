// Canyon Relay is mirrored north ↔ south, so both teams are equal by construction; what is
// measured is the owner's plan: a scripted player sprints every named route (tools/map/maps.ts)
// with the game's movement code, and each route with a target time must land within ±20 % of it
// (first contact at the gorge edge ~9 s and on a bridge ~10 s, a site down the outer path ~10 s,
// over the mesa and the canyon passage ~11.5 s), and site to site takes 10–15 s. After a map
// edit, `npm run map -- canyon-relay` prints the same table.
import { describe, expect, it } from 'vitest';
import { buildLevel, mapDef, v3, waypointRoute } from '@space-yz/shared';
import { mapConfig } from '../maps';
import { measureRoutes, walkPoints } from '../timing';

const def = mapDef('canyon-relay');
const level = buildLevel(def);
const config = mapConfig('canyon-relay', def);
const report = measureRoutes(level, config.routes!, undefined, config.timingRules);
const secs = (team: 0 | 1, to: string, name: string) =>
  report.routes.find((r) => r.spec.team === team && r.spec.to === to && r.spec.name === name)!
    .seconds!;

describe('Canyon Relay route timings (measured sprint)', () => {
  it('uses the plan targets, not the asymmetric rules', () => {
    expect(config.timingRules).toBe('targets');
    expect(report.routes.length).toBe(config.routes!.length);
    for (const r of report.routes) {
      expect(r.seconds, `${r.spec.name} (team ${r.spec.team})`).not.toBeNull();
      expect(r.seconds!).toBeGreaterThan((r.metres / 9) * 0.9);
      expect(r.seconds!).toBeLessThan((r.metres / 9) * 1.1 + 0.5);
    }
    // gorge edge, bridge, both sites two ways, for both teams
    expect(report.routes.filter((r) => r.spec.targetSec !== undefined).length).toBe(12);
  });

  it.each(report.checks.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(c.pass, c.detail).toBe(true);
  });

  it('first contact comes 8–12 s after the spawn', () => {
    for (const team of [0, 1] as const) {
      const edge = secs(team, 'gorge edge', 'cliff ramp, mesa (gorge edge)');
      const bridge = secs(team, 'bridge', 'cliff ramp, mesa, bridge (middle)');
      for (const t of [edge, bridge]) {
        expect(t).toBeGreaterThanOrEqual(8);
        expect(t).toBeLessThanOrEqual(12);
      }
    }
  });

  it('is the same for both teams (the map is mirrored)', () => {
    for (const r of report.routes.filter((x) => x.spec.team === 0)) {
      const twin = report.routes.find(
        (o) => o.spec.team === 1 && o.spec.mode === r.spec.mode && o.spec.name === r.spec.name,
      )!;
      expect(Math.abs(twin.seconds! - r.seconds!), r.spec.name).toBeLessThan(0.1);
    }
  });

  it('site to site (A basin → B basin, over a mesa) takes 10–15 s', () => {
    const wps = def.waypoints!;
    const a = wps.findIndex((w) => w.name === 'siteE');
    const b = wps.findIndex((w) => w.name === 'siteW');
    const path = waypointRoute(wps, a, b);
    expect(path.length).toBeGreaterThan(2);
    const s = wps[a].pos;
    const run = walkPoints(
      level,
      v3(s.x, s.y - 1, s.z),
      path.slice(1).map((i) => wps[i].pos),
    );
    expect(run).not.toBeNull();
    expect(run!.seconds).toBeGreaterThanOrEqual(10);
    expect(run!.seconds).toBeLessThanOrEqual(15);
  });
});
