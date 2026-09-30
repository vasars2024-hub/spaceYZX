// Canyon Relay is mirrored north ↔ south, so both teams are equal by construction; what is
// measured is the plan: a scripted player sprints every named route (tools/map/maps.ts) from the
// team's station yard with the game's movement code, and each route with a target time must land
// within ±20 % of it (sight contact across the gorge from the terrace ~5 s, the rock bridge and
// the rail tunnel ~6.5 s, a site through the mine ~10.5 s, down the slot canyon ~12 s), each
// spawn camp is nearest its own basin, and site to site through the mine takes 12–18 s. After a
// map edit, `npm run map -- canyon-relay` prints the same table.
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

/** sprint along the bot graph between two named waypoints (null = did not arrive) */
const walk = (from: string, to: string) => {
  const wps = def.waypoints!;
  const a = wps.findIndex((w) => w.name === from);
  const b = wps.findIndex((w) => w.name === to);
  const path = waypointRoute(wps, a, b);
  expect(path.length).toBeGreaterThan(1);
  const s = wps[a].pos;
  return walkPoints(
    level,
    v3(s.x, s.y - 1, s.z),
    path.slice(1).map((i) => wps[i].pos),
  );
};

describe('Canyon Relay route timings (measured sprint)', () => {
  it('uses the plan targets, not the asymmetric rules', () => {
    expect(config.timingRules).toBe('targets');
    expect(report.routes.length).toBe(config.routes!.length);
    for (const r of report.routes) {
      expect(r.seconds, `${r.spec.name} (team ${r.spec.team})`).not.toBeNull();
      // (the stairs down into the mine count their slope in the metres: a little under 9 m/s)
      expect(r.seconds!).toBeGreaterThan((r.metres / 9) * 0.85);
      expect(r.seconds!).toBeLessThan((r.metres / 9) * 1.1 + 0.5);
    }
    // terrace edge, bridge, rail tunnel, both sites two ways, for both teams
    expect(report.routes.filter((r) => r.spec.targetSec !== undefined).length).toBe(14);
  });

  it.each(report.checks.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(c.pass, c.detail).toBe(true);
  });

  it('first contact: the terrace edge before the bridge and the tunnel, all within 4–8 s', () => {
    for (const team of [0, 1] as const) {
      const edge = secs(team, 'terrace edge', 'relay house, terrace (gorge edge)');
      const bridge = secs(team, 'bridge', 'lookout, gatehouse, bridge (middle)');
      const tunnel = secs(team, 'rail tunnel', 'plaza stair, mine hall, rail tunnel (middle)');
      expect(edge).toBeLessThan(bridge);
      expect(edge).toBeLessThan(tunnel);
      for (const t of [edge, bridge, tunnel]) {
        expect(t).toBeGreaterThanOrEqual(4);
        expect(t).toBeLessThanOrEqual(8);
      }
    }
  });

  it('is the same for both teams (the map is mirrored)', () => {
    for (const r of report.routes.filter((x) => x.spec.team === 0)) {
      const twin = report.routes.find(
        (o) =>
          o.spec.team === 1 &&
          o.spec.mode === r.spec.mode &&
          o.spec.to.replace('Cyan', 'Orange') === r.spec.to.replace('Cyan', 'Orange') &&
          o.spec.name === r.spec.name,
      )!;
      expect(Math.abs(twin.seconds! - r.seconds!), r.spec.name).toBeLessThan(0.1);
    }
  });

  it('each camp is closest to its own basin: east camp → A, west camp → B', () => {
    const own = walk('campNE', 'siteE')!;
    const far = walk('campNE', 'siteW')!;
    expect(own).not.toBeNull();
    expect(far).not.toBeNull();
    expect(own.seconds).toBeLessThan(far.seconds - 3);
    // and the mirror camps are the same
    expect(Math.abs(walk('campNW', 'siteW')!.seconds - own.seconds)).toBeLessThan(0.1);
    expect(Math.abs(walk('campSE', 'siteE')!.seconds - own.seconds)).toBeLessThan(0.1);
  });

  it('site to site (A basin → B basin, through the mine) takes 12–18 s', () => {
    const run = walk('siteE', 'siteW');
    expect(run).not.toBeNull();
    expect(run!.seconds).toBeGreaterThanOrEqual(12);
    expect(run!.seconds).toBeLessThanOrEqual(18);
  });
});
