// Split Deck is asymmetric, so its balance is measured: a scripted player sprints every named
// route (tools/map/maps.ts) with the game's movement code and the owner's timing targets must
// hold. After a map edit, `npm run map -- split-deck` prints the same table.
import { describe, expect, it } from 'vitest';
import { buildLevel, defaultConfig, mapDef, v3 } from '@space-yz/shared';
import { mapConfig } from '../maps';
import { measureRoutes, timingChecks, walkPoints, type RouteTiming } from '../timing';
import { analyzeMap, defaultOptions } from '../metrics';
import { renderMarkdown } from '../report';

const def = mapDef('split-deck');
const level = buildLevel(def);
const config = mapConfig('split-deck', def);
const report = measureRoutes(level, config.routes!);

describe('Split Deck route timings (measured sprint)', () => {
  it('times every route of both teams', () => {
    expect(report.routes.length).toBe(config.routes!.length);
    for (const r of report.routes) {
      expect(r.seconds, `${r.spec.name} (team ${r.spec.team})`).not.toBeNull();
      // a sprinting player covers the path at about sprint speed (acceleration, ramps, corners)
      expect(r.seconds!).toBeGreaterThan((r.metres / 9) * 0.9);
      expect(r.seconds!).toBeLessThan((r.metres / 9) * 1.1 + 0.5);
    }
  });

  it.each(report.checks.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(c.pass, c.detail).toBe(true);
  });

  it('covers all four balance targets', () => {
    const names = report.checks.map((c) => c.name).join('\n');
    expect(names).toContain('Tower: fastest carrier routes');
    expect(names).toContain('Tower: 2nd-best');
    expect(names).toContain('First contact');
    expect(names).toContain('Bomb: Cyan reaches A site');
    expect(names).toContain('Bomb: Cyan reaches B site');
    expect(names).toContain("Orange's best A and B");
    expect(names).toContain('Lanes: Cyan → Orange Tower');
    expect(names).toContain('Lanes: Orange → Cyan Tower');
    expect(names).toContain('Lanes: Orange → A site');
    expect(names).toContain('Lanes: Orange → B site');
  });

  it('shows up in the map report', () => {
    const a = analyzeMap(level, config, defaultOptions(true));
    expect(a.report.walks?.routes.length).toBe(config.routes!.length);
    const md = renderMarkdown(a.report);
    expect(md).toContain('### Measured route timings');
    expect(md).toContain('Measured route timings meet the balance targets');
    expect(md).not.toContain('Mirror check FAILED');
  });
});

describe('timing checks', () => {
  const t = (
    team: 0 | 1,
    mode: 'tower' | 'bomb' | 'contact',
    to: string,
    seconds: number,
  ): RouteTiming => ({
    spec: { name: `${mode} ${to} ${seconds}`, mode, team, to, via: [] },
    path: [],
    metres: seconds * 9,
    seconds,
    walked: seconds * 9,
  });
  it('flag an unfair map', () => {
    const checks = timingChecks([
      t(0, 'contact', 'power-up', 4),
      t(1, 'contact', 'power-up', 5), // 1 s later
      t(0, 'tower', 'Orange Tower', 10),
      t(0, 'tower', 'Orange Tower', 14), // 40 % slower lane
      t(1, 'tower', 'Cyan Tower', 12), // 20 % slower than Cyan
      t(1, 'tower', 'Cyan Tower', 13),
      t(0, 'bomb', 'A site', 5),
      t(1, 'bomb', 'A site', 7), // only 2 s lead
      t(0, 'bomb', 'B site', 5),
      t(1, 'bomb', 'B site', 9),
    ]);
    const failed = checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed).toEqual([
      'Tower: fastest carrier routes within ±10 %',
      'First contact: both teams reach the centre within 0.5 s',
      'Bomb: Cyan reaches A site 3–5 s before Orange',
      "Bomb: Orange's best A and B times within ±15 %",
      'Lanes: Cyan → Orange Tower: no route > 25 % faster than another',
    ]);
    expect(timingChecks([]).map((c) => c.name)).toEqual(['Every route can be walked']);
  });

  it('walks with the real movement: 18 m of flat floor at sprint speed in about 2 s', () => {
    // along the B hold's floor (flat, open)
    const run = walkPoints(level, v3(16, -5, 19), [v3(16, -4, 28), v3(16, -4, 37)]);
    expect(run).not.toBeNull();
    // (it stops 0.8 m short of the last point)
    expect(run!.seconds).toBeGreaterThan(17.2 / 9);
    expect(run!.seconds).toBeLessThan(18 / 9 + 0.6);
  });
});

describe('Split Deck bomb timings fit the rules', () => {
  const rules = defaultConfig().rules;
  const secs = report.routes.map((r) => r.seconds ?? Infinity);
  // the longest measured sprint on the map (spawn to the far side): the worst retake
  const longest = Math.max(...secs);

  it('the fuse leaves a full retake from anywhere: the longest route + the defuse + 5 s', () => {
    expect(longest).toBeLessThan(20);
    expect(rules.bombFuseSec).toBeGreaterThanOrEqual(longest + rules.bombDefuseSec + 5);
  });

  it('attackers have time to reach a site, fight for it and plant', () => {
    const toSite = report.routes
      .filter((r) => r.spec.team === 1 && r.spec.mode === 'bomb')
      .map((r) => r.seconds ?? Infinity);
    expect(toSite.length).toBeGreaterThan(0);
    // even the slowest site route + the plant uses well under half the round
    expect(Math.max(...toSite) + rules.bombPlantSec).toBeLessThan(rules.bombRoundSec / 2);
  });
});
