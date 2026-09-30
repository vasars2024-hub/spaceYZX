// Minimap logic (pure: no Three.js, no DOM) — everything read off the level and the match as
// they are right now, so any map works as it is: new maps, Map Maker edits, player-made maps.
//   - what your route leads to (goalFor): the objective that matters to you this moment
//   - the map drawn "sliced" at your height (sliceMap): the floor you're on bright, floors below
//     fading with depth, walls at your height dark, what's above you left out — so stacked decks
//     (Afterglow's rooftops, the Orrery's ring, Antipode's two decks) read clearly
//   - which enemies you may see on it (enemyShown): the same rule as the world markers — only
//     the ones in your sight, or revealed by the rules (carriers), never through walls
import type { Level, LevelDef, MatchView, Vec3 } from '@space-yz/shared';
import { dot, len, sub, v3 } from '@space-yz/shared';
import { towerRole, controllerHome } from './objectives';

export type GoalKind =
  'tower' | 'site' | 'bomb' | 'controller' | 'escort' | 'intercept' | 'powerup' | 'zone' | 'gate';

export interface Goal {
  key: string;
  kind: GoalKind;
  /** short text on the minimap and the route ("ATTACK", "DEFEND A", "PICK UP"...) */
  label: string;
  /** feet position the route leads to */
  pos: Vec3;
  /** '#rrggbb' */
  color: string;
}

export interface GoalInput {
  def: LevelDef;
  match: MatchView | null;
  myTeam: 0 | 1;
  localId: number;
  me: Vec3;
  alive: boolean;
  /** everyone the client knows about (carriers: `carrier`, and where) */
  players: { id: number; team: 0 | 1; pos: Vec3; alive: boolean; carrier: boolean }[];
  /** power-ups floating right now */
  powerups: Vec3[];
  /** Bomb mode: the site you picked (X), else the nearer one */
  site: 'A' | 'B' | null;
  /** races: checkpoints passed (the next gate is this one, or the finish) */
  raceCp?: number;
  /** a power-up in hand (don't route to another one) */
  holding?: boolean;
}

const RED = '#ff4d5e';
const WHITE = '#f4f7ff';

/** The middle of a bomb site's floor. */
export const siteCenter = (s: { min: Vec3; max: Vec3 }): Vec3 =>
  v3((s.min.x + s.max.x) / 2, s.min.y, (s.min.z + s.max.z) / 2);

const nearest = (me: Vec3, ps: Vec3[]): Vec3 | null => {
  let best: Vec3 | null = null;
  for (const p of ps) if (!best || len(sub(p, me)) < len(sub(best, me))) best = p;
  return best;
};

/**
 * Where your route should lead right now, or null (nothing to go for — then there's no line):
 *   Tower mode — carrying: the enemy Tower · your Controller dropped: pick it up · a mate
 *     carries: escort them · the enemy carries: cut them off · else: go get it (the enemy Tower)
 *   Bomb — attackers: the dropped bomb, else your site · planted: guard it (attackers) or defuse
 *     it (defenders) · defenders: hold your site
 *   Elimination / Brawl — the nearest power-up while one floats (you hold none)
 *   Overtime collapse — into the safe zone · races — the next gate
 */
export const goalFor = (g: GoalInput): Goal | null => {
  const { def, match: m, me } = g;
  if (!g.alive) return null;
  // races and surf: the next gate
  const race = def.race;
  if (race) {
    const cp = g.raceCp ?? 0;
    const gate = race.checkpoints[cp] ?? race.finish;
    const last = cp >= race.checkpoints.length;
    return {
      key: `gate-${cp}`,
      kind: 'gate',
      label: last ? 'FINISH' : (gate.name ?? `GATE ${cp + 1}`),
      pos: siteCenter(gate),
      color: last ? WHITE : '#ffd23f',
    };
  }
  const powerup = (): Goal | null => {
    if (g.holding) return null;
    const p = nearest(me, g.powerups);
    return p
      ? {
          key: 'powerup',
          kind: 'powerup',
          label: 'POWER-UP',
          pos: v3(p.x, p.y - 0.9, p.z),
          color: '#ffc44d',
        }
      : null;
  };
  if (!m) return powerup();
  if (m.phase !== 'live' && m.phase !== 'spawnLock') return null;
  if (m.overtime?.kind === 'sky') return null;
  if (m.overtime?.kind === 'collapse')
    return { key: 'zone', kind: 'zone', label: 'SAFE ZONE', pos: m.overtime.center, color: WHITE };
  const carrierOf = (id: number | null) =>
    id === null ? undefined : g.players.find((p) => p.id === id && p.alive);

  if (m.objective === 'bomb') {
    const b = m.bomb;
    const sites = def.bombSites ?? [];
    if (!b || !sites.length) return null;
    const iAttack = g.myTeam === m.attackers;
    const pick = (name: 'A' | 'B' | null) => sites.find((s) => s.name === name) ?? null;
    const chosen =
      pick(g.site) ??
      sites.reduce((a, s) => (len(sub(siteCenter(s), me)) < len(sub(siteCenter(a), me)) ? s : a));
    if (b.planted) {
      const site = pick(b.planted.site) ?? chosen;
      return iAttack
        ? {
            key: `guard-${site.name}`,
            kind: 'site',
            label: `GUARD ${site.name}`,
            pos: siteCenter(site),
            color: RED,
          }
        : { key: 'defuse', kind: 'bomb', label: 'DEFUSE', pos: b.pos, color: RED };
    }
    if (iAttack && b.carrier === null)
      return { key: 'bomb', kind: 'bomb', label: 'PICK UP BOMB', pos: b.pos, color: RED };
    return {
      key: `site-${chosen.name}`,
      kind: 'site',
      label: `${iAttack ? 'ATTACK' : 'DEFEND'} ${chosen.name}`,
      pos: siteCenter(chosen),
      color: iAttack ? RED : WHITE,
    };
  }

  if (m.objective === 'tower') {
    const enemyTower = def.towers.find((t) => towerRole(t.team, m.sideSwapped, g.myTeam).attack);
    const tower = (label: string): Goal | null =>
      enemyTower
        ? {
            key: 'tower',
            kind: 'tower',
            label,
            // (a Tower hanging from a ceiling deck: its tip, where you touch it)
            pos: enemyTower.hanging
              ? v3(enemyTower.pos.x, enemyTower.pos.y + 1, enemyTower.pos.z)
              : enemyTower.pos,
            color: RED,
          }
        : null;
    const mine = m.controllers.find((c) => c.team === g.myTeam);
    const theirs = m.controllers.find((c) => c.team !== g.myTeam);
    if (mine?.carrier === g.localId) return tower('ATTACK');
    if (mine?.droppedAt) {
      const home = controllerHome(def, g.myTeam, m.sideSwapped);
      // lying at its home at the round start: the first one there takes it
      const atHome = !!home && len(sub(home, mine.droppedAt)) < 0.75;
      return {
        key: 'controller',
        kind: 'controller',
        label: atHome ? 'TAKE CONTROLLER' : 'PICK UP',
        pos: mine.droppedAt,
        color: WHITE,
      };
    }
    const mate = carrierOf(mine?.carrier ?? null);
    if (mate)
      return {
        key: `escort-${mate.id}`,
        kind: 'escort',
        label: 'ESCORT',
        pos: mate.pos,
        color: WHITE,
      };
    const foe = carrierOf(theirs?.carrier ?? null);
    if (foe)
      return {
        key: `stop-${foe.id}`,
        kind: 'intercept',
        label: 'STOP CARRIER',
        pos: foe.pos,
        color: RED,
      };
    return tower('ATTACK');
  }
  // Elimination
  return powerup();
};

// ------------------------------------------------------------------------------------------
// the map, sliced at your height

export type SliceKind = 'level' | 'below' | 'wall';

export interface Slice {
  /** box index in the level */
  box: number;
  kind: SliceKind;
  /** metres below your feet (floors below) */
  depth: number;
  /** footprint corners (x, z) */
  poly: [number, number][];
}

/** A box's footprint on the ground (x, z): its corners seen from above (a convex polygon). */
export const footprint = (level: Level, i: number): [number, number][] => {
  const b = level.boxes[i];
  if (b.hull || !b.rotated)
    return [
      [b.min.x, b.min.z],
      [b.max.x, b.min.z],
      [b.max.x, b.max.z],
      [b.min.x, b.max.z],
    ];
  const pts: [number, number][] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        pts.push([
          b.c.x + b.ax.x * b.h.x * sx + b.ay.x * b.h.y * sy + b.az.x * b.h.z * sz,
          b.c.z + b.ax.z * b.h.x * sx + b.ay.z * b.h.y * sy + b.az.z * b.h.z * sz,
        ]);
  return convexHull(pts);
};

/** Convex hull of 2D points (monotone chain), counter-clockwise. */
export const convexHull = (pts: [number, number][]): [number, number][] => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0)
      lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0)
      upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
};

/** Boxes worth drawing: solid, seen, not tiny trims (cached per level). */
const drawable = new WeakMap<Level, number[]>();
const drawableBoxes = (level: Level): number[] => {
  let d = drawable.get(level);
  if (!d) {
    d = [];
    for (let i = 0; i < level.boxes.length; i++) {
      const b = level.boxes[i];
      const src = level.def.boxes[i] ?? level.def.skyArena?.boxes[i - level.def.boxes.length];
      if (!b.collide || src?.noRender) continue;
      if (Math.max(b.max.x - b.min.x, b.max.z - b.min.z) < 0.35) continue;
      d.push(i);
    }
    drawable.set(level, d);
  }
  return d;
};

/**
 * The map around `me` (within `radius` m) cut at your height, along your up (`sign` +1 on a
 * normal floor, −1 standing on a ceiling deck; wall gravity: the last floor's sign):
 *   'level' — a floor you could walk on at about your height (its top within 1.6 m below / 1.2 m
 *             above your feet)
 *   'below' — floors further down (to 16 m), `depth` for fading
 *   'wall'  — solid across your body's height: walls, pillars, crates you can't see over
 * Things above your head are left out. Moving blocks are where they are this tick.
 */
export const sliceMap = (level: Level, me: Vec3, sign: 1 | -1, radius: number): Slice[] => {
  const out: Slice[] = [];
  const feet = me.y * sign;
  const r2 = radius * radius;
  for (const i of drawableBoxes(level)) {
    const b = level.boxes[i];
    // (quick reject by the footprint's box)
    const dx = Math.max(b.min.x - me.x, 0, me.x - b.max.x);
    const dz = Math.max(b.min.z - me.z, 0, me.z - b.max.z);
    if (dx * dx + dz * dz > r2) continue;
    const top = sign > 0 ? b.max.y : -b.min.y;
    const bottom = sign > 0 ? b.min.y : -b.max.y;
    let kind: SliceKind | null = null;
    let depth = 0;
    if (bottom < feet + 1.5 && top > feet + 0.5) kind = 'wall';
    else if (top <= feet + 1.2 && top >= feet - 1.6) kind = 'level';
    else if (top < feet - 1.6 && top > feet - 16) {
      kind = 'below';
      depth = feet - top;
    }
    if (kind) out.push({ box: i, kind, depth, poly: footprint(level, i) });
  }
  // deepest first, then your floor, then walls on top
  const order: Record<SliceKind, number> = { below: 0, level: 1, wall: 2 };
  out.sort((a, b) => order[a.kind] - order[b.kind] || b.depth - a.depth);
  return out;
};

/** Height of `p` over your feet along your up (▲ above / ▼ below on the map when big). */
export const heightOver = (p: Vec3, me: Vec3, up: Vec3): number => dot(sub(p, me), up);

/**
 * May an enemy show on your minimap? Only what the world markers would show: revealed by the
 * rules (a carrier, the last seconds), or in your sight right now (`inSight`, checked by the
 * caller against walls and fog). Last-seen ghosts fade out from where you last saw them.
 */
export const enemyShown = (p: { alive: boolean; revealed: boolean }, inSight: boolean): boolean =>
  p.alive && (p.revealed || inSight);
