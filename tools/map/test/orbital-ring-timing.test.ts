// Orbital Ring is mirrored north ↔ south, so both teams are equal by construction; what is
// measured is the owner's plan: a scripted player sprints every named route (tools/map/maps.ts)
// with the game's movement code, and each route with a target time must land within ±20 % of it
// (core ~5 s, a site across the core ~8 s, a site down the outer corridor ~11 s). After a map
// edit, `npm run map -- orbital-ring` prints the same table.
import { describe, expect, it } from 'vitest';
import { buildLevel, mapDef } from '@space-yz/shared';
import { mapConfig } from '../maps';
import { measureRoutes, TARGET_PCT, timingChecks, type RouteTiming } from '../timing';

const def = mapDef('orbital-ring');
const level = buildLevel(def);
const config = mapConfig('orbital-ring', def);
const report = measureRoutes(level, config.routes!, undefined, config.timingRules);
const secs = (team: 0 | 1, to: string, name: string) =>
  report.routes.find((r) => r.spec.team === team && r.spec.to === to && r.spec.name === name)!
    .seconds!;

describe('Orbital Ring route timings (measured sprint)', () => {
  it('uses the plan targets, not the asymmetric rules', () => {
    expect(config.timingRules).toBe('targets');
    expect(report.routes.length).toBe(config.routes!.length);
    for (const r of report.routes) {
      expect(r.seconds, `${r.spec.name} (team ${r.spec.team})`).not.toBeNull();
      expect(r.seconds!).toBeGreaterThan((r.metres / 9) * 0.9);
      expect(r.seconds!).toBeLessThan((r.metres / 9) * 1.1 + 0.5);
    }
    // core, both sites (across the core and down the outer corridor), for both teams
    expect(report.routes.filter((r) => r.spec.targetSec !== undefined).length).toBe(10);
  });

  it.each(report.checks.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(c.pass, c.detail).toBe(true);
  });

  it('is the same for both teams (the map is mirrored)', () => {
    for (const r of report.routes.filter((x) => x.spec.team === 0)) {
      const twin = report.routes.find(
        (o) => o.spec.team === 1 && o.spec.mode === r.spec.mode && o.spec.name === r.spec.name,
      )!;
      expect(Math.abs(twin.seconds! - r.seconds!), r.spec.name).toBeLessThan(0.1);
    }
  });

  it('keeps the plan’s order: core first, then a site across the core, then the long way', () => {
    for (const team of [0, 1] as const)
      for (const site of ['A site', 'B site']) {
        const core = secs(team, 'core', 'spoke, core (hole rim)');
        const across = secs(team, site, 'spoke, across the core');
        const outer = secs(team, site, 'outer corridor');
        expect(core).toBeLessThan(across);
        expect(across + 1).toBeLessThan(outer);
      }
  });
});

describe('target timing checks', () => {
  const t = (seconds: number, targetSec?: number): RouteTiming => ({
    spec: {
      name: `r ${seconds}`,
      mode: 'bomb',
      team: 0,
      to: 'A site',
      via: [],
      ...(targetSec !== undefined ? { targetSec } : {}),
    },
    path: [],
    metres: seconds * 9,
    seconds,
    walked: seconds * 9,
  });
  it('pass within the tolerance, fail outside it, and skip the asymmetric rules', () => {
    const checks = timingChecks(
      [t(8, 8), t(8 * (1 + TARGET_PCT / 100) + 0.1, 8), t(20)],
      'targets',
    );
    // every route walked; the first on target; the second too slow; the third has no target
    expect(checks.map((c) => c.pass)).toEqual([true, true, false]);
    expect(checks[0].name).toBe('Every route can be walked');
    expect(checks.some((c) => c.name.startsWith('Lanes') || c.name.startsWith('Bomb'))).toBe(false);
  });
});
