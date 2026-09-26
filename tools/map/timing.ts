// Measured route timings: a scripted player sprints along each named route with the game's own
// movement code (sim step at 60 Hz: acceleration, ramps, drops, corners), so the times are what
// a player holding W and steering perfectly gets — not straight-line estimates. The balance
// checks below are the owner's targets for asymmetric maps (Split Deck); maps.ts lists each
// map's routes, `npm run map` prints the table and tools/map/test keeps the checks passing.
import {
  addPlayer,
  Btn,
  createPlayer,
  createWorld,
  defaultConfig,
  lineOfSight,
  step,
  TICK_DT,
  v3,
  waypointRoute,
  yawToView,
  type GameConfig,
  type Level,
  type SimContext,
  type Vec3,
  type WaypointDef,
} from '@space-yz/shared';
import type { Team } from './maps';

/** A route: from a team's spawn centroid through named waypoints (shortest path between). */
export interface RouteSpec {
  /** what the route is called in the table, e.g. "mid (connector → atrium → mid corridor)" */
  name: string;
  mode: 'tower' | 'bomb' | 'contact';
  team: Team;
  /** destination label; routes with the same team + destination are compared (check 4) */
  to: string;
  /** waypoint names to pass through in order; the last one is the destination */
  via: string[];
  /** alternative destinations (the route ends at whichever is reached first on the graph) */
  anyOf?: string[];
}

export interface RouteTiming {
  spec: RouteSpec;
  /** waypoint path (names) */
  path: string[];
  /** length along the waypoint path (m) */
  metres: number;
  /** measured: seconds the sprinting walker needs (null = did not arrive) */
  seconds: number | null;
  /** distance it actually covered (m) */
  walked: number | null;
}

export interface TimingCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface TimingReport {
  sprintSpeed: number;
  routes: RouteTiming[];
  checks: TimingCheck[];
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

const spawnCentroid = (level: Level, team: Team): Vec3 => {
  const sp = level.def.spawns.filter((s) => s.team === team);
  const n = Math.max(1, sp.length);
  return v3(
    sp.reduce((a, s) => a + s.pos.x, 0) / n,
    sp.reduce((a, s) => a + s.pos.y, 0) / n,
    sp.reduce((a, s) => a + s.pos.z, 0) / n,
  );
};

/** Waypoint path (indices) for a route: nearest visible waypoint to the start, then via. */
export const routePath = (level: Level, spec: RouteSpec): number[] => {
  const wps = level.def.waypoints ?? [];
  const idx = (n: string) => {
    const i = wps.findIndex((w) => w.name === n);
    if (i < 0) throw new Error(`route "${spec.name}": no waypoint named ${n}`);
    return i;
  };
  const start = spawnCentroid(level, spec.team);
  const eye = v3(start.x, start.y + 1, start.z);
  let entry = -1;
  for (let i = 0; i < wps.length; i++)
    if (
      lineOfSight(level, eye, wps[i].pos) &&
      (entry < 0 || dist(eye, wps[i].pos) < dist(eye, wps[entry].pos))
    )
      entry = i;
  if (entry < 0) throw new Error(`route "${spec.name}": no waypoint in sight of the spawns`);
  const legs = (names: string[]): number[] | null => {
    let path = [entry];
    for (const n of names) {
      const leg = waypointRoute(wps, path[path.length - 1], idx(n));
      if (!leg.length) return null;
      path = path.concat(leg.slice(1));
    }
    return path;
  };
  const ends = spec.anyOf ?? [null];
  let best: number[] | null = null;
  for (const end of ends) {
    const p = legs(end ? [...spec.via, end] : spec.via);
    if (p && (!best || pathLength(wps, p) < pathLength(wps, best))) best = p;
  }
  if (!best) throw new Error(`route "${spec.name}" is not connected`);
  return best;
};

const pathLength = (wps: WaypointDef[], path: number[]): number => {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += dist(wps[path[i - 1]].pos, wps[path[i]].pos);
  return d;
};

/**
 * Sprint along points with the real movement code: face the next point (flat), hold forward
 * (= sprint), switch to the next point within 1.2 m (flat distance, so ramps and drops work).
 * Returns seconds and metres covered, or null when it does not arrive within `maxSec`.
 */
export const walkPoints = (
  level: Level,
  start: Vec3,
  points: Vec3[],
  config: GameConfig = defaultConfig(),
  maxSec = 60,
): { seconds: number; walked: number } | null => {
  const ctx: SimContext = { level, config, dt: TICK_DT };
  const world = createWorld(level, 1);
  const first = points[0] ?? start;
  const yaw0 = (Math.atan2(-(first.x - start.x), -(first.z - start.z)) * 180) / Math.PI;
  const p = addPlayer(world, createPlayer(1, 0, start, yaw0, config));
  let target = 0;
  let walked = 0;
  const flatTo = (q: Vec3) => Math.hypot(q.x - p.pos.x, q.z - p.pos.z);
  for (let t = 0; t <= maxSec / TICK_DT; t++) {
    // waypoints are 1 m above their floor; the last one must really be reached (same floor)
    while (target < points.length - 1 && flatTo(points[target]) < 1.2) target++;
    const q = points[target];
    if (target === points.length - 1 && flatTo(q) < 0.8 && Math.abs(q.y - 1 - p.pos.y) < 2)
      return { seconds: t * TICK_DT, walked };
    const yaw = (Math.atan2(-(q.x - p.pos.x), -(q.z - p.pos.z)) * 180) / Math.PI;
    const before = { ...p.pos };
    step(world, { 1: { tick: world.tick + 1, buttons: Btn.Forward, view: yawToView(yaw) } }, ctx);
    walked += dist(before, p.pos);
  }
  return null;
};

/** Time every route of a map (graph length + measured sprint). */
export const measureRoutes = (
  level: Level,
  specs: RouteSpec[],
  config: GameConfig = defaultConfig(),
): TimingReport => {
  const wps = level.def.waypoints ?? [];
  const routes = specs.map((spec): RouteTiming => {
    const path = routePath(level, spec);
    const start = spawnCentroid(level, spec.team);
    const run = walkPoints(
      level,
      start,
      path.map((i) => wps[i].pos),
      config,
    );
    const metres =
      dist(v3(start.x, start.y + 1, start.z), wps[path[0]].pos) + pathLength(wps, path);
    return {
      spec,
      path: path.map((i) => wps[i].name ?? `#${i}`),
      metres: r1(metres),
      seconds: run ? r2(run.seconds) : null,
      walked: run ? r1(run.walked) : null,
    };
  });
  return { sprintSpeed: config.movement.sprintSpeed, routes, checks: timingChecks(routes) };
};

// ------------------------------------------------------------------------------------------
// balance checks (the owner's targets)

const TEAM = ['Cyan', 'Orange'];

/**
 * 1. Tower mode: the fastest carrier route Cyan spawn → Orange Tower and Orange spawn → Cyan
 *    Tower within ±10 %; each team's 2nd-best route within ±15 %.
 * 2. First contact: both teams reach the map centre (the power-up) within 0.5 s of each other.
 * 3. Bomb mode (Orange attacks): Cyan reaches each site 3–5 s before Orange can, and Orange's
 *    best A and B times are within ±15 % of each other.
 * 4. Lanes stay viable: no route more than 25 % faster than any other route of the same team
 *    to the same destination (slowest ≤ 1.25 × fastest).
 */
export const timingChecks = (routes: RouteTiming[]): TimingCheck[] => {
  const out: TimingCheck[] = [];
  const secs = (f: (r: RouteTiming) => boolean) =>
    routes
      .filter((r) => f(r) && r.seconds !== null)
      .map((r) => r.seconds!)
      .sort((a, b) => a - b);
  const within = (a: number, b: number, pct: number) =>
    Math.abs(a - b) <= (pct / 100) * Math.min(a, b) + 1e-9;
  const missing = routes.filter((r) => r.seconds === null);
  out.push({
    name: 'Every route can be walked',
    pass: missing.length === 0,
    detail: missing.length
      ? `stuck: ${missing.map((r) => `${TEAM[r.spec.team]} ${r.spec.name}`).join(', ')}`
      : `${routes.length} routes`,
  });
  // 1. Tower
  const tower = [0, 1].map((t) => secs((r) => r.spec.mode === 'tower' && r.spec.team === t));
  if (tower[0].length && tower[1].length) {
    const [a, b] = tower;
    out.push({
      name: 'Tower: fastest carrier routes within ±10 %',
      pass: within(a[0], b[0], 10),
      detail: `Cyan ${a[0]} s, Orange ${b[0]} s`,
    });
    if (a.length > 1 && b.length > 1)
      out.push({
        name: 'Tower: 2nd-best carrier routes within ±15 %',
        pass: within(a[1], b[1], 15),
        detail: `Cyan ${a[1]} s, Orange ${b[1]} s`,
      });
  }
  // 2. first contact
  const contact = [0, 1].map((t) => secs((r) => r.spec.mode === 'contact' && r.spec.team === t));
  if (contact[0].length && contact[1].length) {
    const d = Math.abs(contact[0][0] - contact[1][0]);
    out.push({
      name: 'First contact: both teams reach the centre within 0.5 s',
      pass: d <= 0.5 + 1e-9,
      detail: `Cyan ${contact[0][0]} s, Orange ${contact[1][0]} s (${r2(d)} s apart)`,
    });
  }
  // 3. Bomb
  const sites = [...new Set(routes.filter((r) => r.spec.mode === 'bomb').map((r) => r.spec.to))];
  const attack: number[] = [];
  for (const site of sites) {
    const def = secs((r) => r.spec.mode === 'bomb' && r.spec.to === site && r.spec.team === 0);
    const att = secs((r) => r.spec.mode === 'bomb' && r.spec.to === site && r.spec.team === 1);
    if (!def.length || !att.length) continue;
    attack.push(att[0]);
    const lead = r2(att[0] - def[0]);
    out.push({
      name: `Bomb: Cyan reaches ${site} 3–5 s before Orange`,
      pass: lead >= 3 && lead <= 5,
      detail: `Cyan ${def[0]} s, Orange ${att[0]} s: ${lead} s ahead`,
    });
  }
  if (attack.length === 2)
    out.push({
      name: "Bomb: Orange's best A and B times within ±15 %",
      pass: within(attack[0], attack[1], 15),
      detail: sites.map((s, i) => `${s} ${attack[i]} s`).join(', '),
    });
  // 4. lanes
  const groups = new Map<string, RouteTiming[]>();
  for (const r of routes) {
    if (r.spec.mode === 'contact' || r.seconds === null) continue;
    const k = `${TEAM[r.spec.team]} → ${r.spec.to}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const [k, rs] of groups) {
    if (rs.length < 2) continue;
    const s = rs.map((r) => r.seconds!).sort((a, b) => a - b);
    const ratio = s[s.length - 1] / s[0];
    out.push({
      name: `Lanes: ${k}: no route > 25 % faster than another`,
      pass: ratio <= 1.25 + 1e-9,
      detail: `${s[0]}–${s[s.length - 1]} s (slowest ${r2(ratio)} × fastest)`,
    });
  }
  return out;
};
