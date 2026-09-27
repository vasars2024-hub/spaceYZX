// FREE ROAM — practice on any map (search term: free roam).
//
// Just you on the map you picked, no rounds or timers, and target dummies placed automatically at
// sensible spots of that map (at varied distances and heights; some stand still, some strafe,
// some strafe and jump). They never attack and pop back up a second after they're downed; the
// stats panel shows your hit rates like the practice range (game/range.ts). Race tracks get no
// dummies (no weapons there): free movement practice. Boomerang kit or CS kit.
//
//   placeDummies(def, count?)          where the dummies stand on a map (validated against the
//                                      level: on a floor, not in a wall, in bounds, normal
//                                      gravity, visible from a spawn)
//   createFreeRoamSession(opts)        the offline session (no rendering; tests use it)
//   startFreeRoam(app, opts)           start it (pause menu: Respawn, Reset dummies, Dummies
//                                      on / off)
import type {
  GameConfig,
  Level,
  LevelDef,
  LoadoutName,
  PlayerInput,
  SimContext,
  SpawnDef,
  Vec3,
  WorldState,
} from '@space-yz/shared';
import {
  addPlayer,
  buildLevel,
  capsuleOverlaps,
  configForLoadout,
  createPlayer,
  createWorld,
  gravityDirAt,
  inSkyZone,
  len,
  lineOfSight,
  loadoutName,
  mapDef,
  pointInAabb,
  raycast,
  respawnPlayer,
  StatsTracker,
  sub,
  v3,
  yawToView,
  TICK_DT,
} from '@space-yz/shared';
import type { App } from '../app';
import { CombatFeature } from './combat-feature';
import { LocalSession, type LocalSessionOptions } from './local-session';
import { dummyInput, type DummyKind } from './range';
import { loadTuning } from '../ui/tuning';

export interface DummySpot {
  /** feet position */
  pos: Vec3;
  kind: DummyKind;
  /** facing (toward where you start) */
  yawDeg: number;
}

export const FREE_ROAM = {
  /** how many dummies a map gets (fewer if it has fewer good spots) */
  count: 10,
  /** no dummy closer than this to where you start, or to another dummy (metres) */
  minFromStart: 8,
  minApart: 5,
  /** dummies within this distance of where you start come first (shooting range) */
  maxFromStart: 60,
  /** strafers need this much room to each side (and a floor under it) */
  strafeRoom: 2.5,
  /** a dummy that wandered off this far (or fell) goes back to its spot */
  leashM: 8,
  /** a downed dummy is back after this long (ticks) */
  respawnTicks: 60,
  /** and you after this long (ticks), at the spawn point nearest to where you went down */
  youRespawnTicks: 90,
};

const UPV = v3(0, 1, 0);
const DOWN = v3(0, -1, 0);

/** The facing (yaw, degrees) that looks from `from` toward `to` (yaw 0 = -Z, 90 = -X). */
const yawToward = (from: Vec3, to: Vec3): number => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.abs(dx) + Math.abs(dz) < 1e-6) return 0;
  return (Math.atan2(-dx, -dz) * 180) / Math.PI;
};

/** Where you start on a map: the first team-0 spawn (else the first spawn). */
export const freeRoamStart = (def: LevelDef): SpawnDef =>
  def.spawns.find((s) => s.team === 0) ?? def.spawns[0];

/** The spawn point nearest to `p`. */
export const nearestSpawn = (def: LevelDef, p: Vec3): SpawnDef => {
  let best = def.spawns[0];
  for (const s of def.spawns) if (len(sub(s.pos, p)) < len(sub(best.pos, p))) best = s;
  return best;
};

/** The floor right under `p` (feet on it), or null if there is none within `below` metres. */
const floorAt = (level: Level, p: Vec3, below = 1.6): Vec3 | null => {
  const hit = raycast(level, v3(p.x, p.y + 0.6, p.z), DOWN, 0.6 + below);
  if (!hit || hit.normal.y < 0.7) return null;
  return v3(hit.point.x, hit.point.y + 0.02, hit.point.z);
};

/** Candidate points: spawns, bot waypoints, power-up points, bomb sites, dev areas, a grid. */
const candidates = (def: LevelDef): Vec3[] => {
  const out: Vec3[] = [];
  for (const s of def.spawns) out.push(s.pos);
  for (const w of def.waypoints ?? []) out.push(w.pos);
  for (const p of def.powerups ?? []) out.push(p);
  for (const b of def.bombSites ?? [])
    out.push(v3((b.min.x + b.max.x) / 2, b.min.y + 0.5, (b.min.z + b.max.z) / 2));
  for (const a of def.areas ?? []) out.push(a.pos);
  // maps without bot waypoints: every floor seen from a spawn, on a coarse grid
  if (!def.waypoints?.length) {
    const lo = def.boundsMin;
    const hi = def.boundsMax;
    for (let x = lo.x + 3; x < hi.x; x += 6)
      for (let z = lo.z + 3; z < hi.z; z += 6)
        for (const s of def.spawns.slice(0, 2)) out.push(v3(x, s.pos.y, z));
  }
  return out;
};

/** Is `feet` a good place for a dummy? (see placeDummies) */
const validSpot = (ctx: SimContext, world: WorldState, feet: Vec3, eyes: Vec3[]): boolean => {
  const def = ctx.level.def;
  const m = ctx.config.movement;
  if (!pointInAabb(feet, def.boundsMin, def.boundsMax) || inSkyZone(def, feet)) return false;
  // normal gravity (not a wall lane or a zero-G bay)
  const g = gravityDirAt(ctx, world, v3(feet.x, feet.y + 0.9, feet.z));
  if (g.y > -0.9) return false;
  // standing room: the body fits
  const center = v3(feet.x, feet.y + m.standHeight / 2 + 0.05, feet.z);
  const cap = { center, up: UPV, halfSeg: m.standHeight / 2 - m.radius, radius: m.radius };
  if (capsuleOverlaps(ctx.level, cap, 0.02)) return false;
  // nothing deadly or moving you around right there (gorges below, pads, portals)
  const near = (min: Vec3, max: Vec3, pad: number) =>
    pointInAabb(
      feet,
      v3(min.x - pad, min.y - pad, min.z - pad),
      v3(max.x + pad, max.y + 4, max.z + pad),
    );
  for (const k of def.killVolumes ?? []) if (near(k.min, k.max, 2)) return false;
  for (const l of def.launchPads ?? []) if (near(l.min, l.max, 1.5)) return false;
  for (const p of def.portals ?? []) if (near(p.min, p.max, 1.5)) return false;
  // seen from somewhere you can stand (a spawn): not on a roof outside the play space
  const chest = v3(feet.x, feet.y + 1.2, feet.z);
  return eyes.some((e) => lineOfSight(ctx.level, e, chest));
};

/** Room to strafe: open to both sides (along the dummy's right) with a floor under each end. */
const canStrafe = (level: Level, feet: Vec3, yawDeg: number): boolean => {
  const a = (yawDeg * Math.PI) / 180;
  const right = v3(Math.cos(a), 0, -Math.sin(a));
  const chest = v3(feet.x, feet.y + 1, feet.z);
  const room = FREE_ROAM.strafeRoom;
  for (const s of [1, -1]) {
    const dir = v3(right.x * s, 0, right.z * s);
    if (raycast(level, chest, dir, room, 0.3)) return false;
    const end = v3(feet.x + dir.x * room, feet.y, feet.z + dir.z * room);
    const f = floorAt(level, end, 1.2);
    // (a small step up or down is fine: the leash brings a strafer back)
    if (!f || f.y - feet.y > 0.6 || f.y - feet.y < -1) return false;
  }
  return true;
};

/** Headroom to jump. */
const canJump = (level: Level, feet: Vec3): boolean =>
  !raycast(level, v3(feet.x, feet.y + 1.6, feet.z), UPV, 2.2, 0.3);

/**
 * Dummy spots for a map: candidate points (spawns, bot waypoints, power-up points, bomb sites,
 * or a grid on maps without waypoints) snapped to the floor under them and kept only if valid:
 * in bounds, normal gravity, the body fits (no wall), clear of kill volumes / launch pads /
 * portals, and in sight of some spawn. Then spread out by farthest-point picking from where you
 * start (so distances and heights vary). Kinds cycle static → strafe → jumper where there is
 * room to strafe / jump. Race tracks get none. Deterministic.
 */
export const placeDummies = (
  def: LevelDef,
  config: GameConfig,
  count = FREE_ROAM.count,
): DummySpot[] => {
  if (def.race || !def.spawns.length) return [];
  const level = buildLevel(def);
  const ctx: SimContext = { level, config, dt: TICK_DT };
  const world = createWorld(level, 1);
  const start = freeRoamStart(def).pos;
  const eyes = def.spawns.map((s) => v3(s.pos.x, s.pos.y + 1.6, s.pos.z));
  const ok: Vec3[] = [];
  for (const c of candidates(def)) {
    const f = floorAt(level, c);
    if (!f || len(sub(f, start)) < FREE_ROAM.minFromStart) continue;
    if (ok.some((o) => len(sub(o, f)) < 1)) continue; // (duplicates)
    if (validSpot(ctx, world, f, eyes)) ok.push(f);
  }
  // farthest-point picking: each next spot is the one farthest from you and every spot so far
  const picked: Vec3[] = [];
  const dist = ok.map((p) => len(sub(p, start)));
  // (the first one fairly close: a warm-up target)
  let first = -1;
  for (let i = 0; i < ok.length; i++)
    if (dist[i] >= 10 && (first < 0 || dist[i] < dist[first])) first = i;
  if (first < 0 && ok.length) first = 0;
  const minD = ok.map(() => Infinity);
  // spots within shooting range of where you start first; farther ones only if still short
  const inRange = (i: number, far: boolean) => far || dist[i] <= FREE_ROAM.maxFromStart;
  let next = first;
  for (const far of [false, true]) {
    while (next >= 0 && picked.length < count) {
      const p = ok[next];
      picked.push(p);
      for (let i = 0; i < ok.length; i++) minD[i] = Math.min(minD[i], len(sub(ok[i], p)), dist[i]);
      next = -1;
      let best = FREE_ROAM.minApart;
      for (let i = 0; i < ok.length; i++)
        if (inRange(i, far) && minD[i] > best) {
          best = minD[i];
          next = i;
        }
    }
    // (the far pass starts from the best far spot)
    next = -1;
    let best = FREE_ROAM.minApart;
    for (let i = 0; i < ok.length; i++)
      if (minD[i] > best) {
        best = minD[i];
        next = i;
      }
  }
  const kinds: DummyKind[] = ['static', 'strafe', 'jumper'];
  return picked.map((pos, i) => {
    const facing = yawToward(pos, start);
    let kind = kinds[i % kinds.length];
    let yawDeg = facing;
    if (kind !== 'static') {
      // strafe across your view if there is room, else turned (along a corridor), else stand
      const turn = [0, 90, -90].find((t) => canStrafe(level, pos, facing + t));
      if (turn === undefined) kind = 'static';
      else yawDeg = facing + turn;
    }
    if (kind === 'jumper' && !canJump(level, pos)) kind = 'strafe';
    return { pos, kind, yawDeg };
  });
};

export interface FreeRoamOptions {
  mapId: string;
  kit?: LoadoutName;
  /** place target dummies (default on; race tracks never get any) */
  dummies?: boolean;
  /** default: your saved tuning */
  config?: GameConfig;
}

interface LiveDummy extends DummySpot {
  id: number;
  deadSince: number;
  phase: number;
}

/** The offline free-roam session: you, the map and (optionally) dummies. */
export class FreeRoamSession extends LocalSession {
  constructor(
    opts: LocalSessionOptions,
    readonly mapId: string,
    readonly stats: StatsTracker,
    private readonly controls: {
      reset(): void;
      setOn(on: boolean): void;
      isOn(): boolean;
      spots: number;
    },
  ) {
    super(opts);
  }

  /** How many spots the map has for dummies (0: none, e.g. a race track). */
  get dummySpots(): number {
    return this.controls.spots;
  }

  dummiesOn(): boolean {
    return this.controls.isOn();
  }

  /** Every dummy back on its spot, up and at full health. */
  resetDummies(): void {
    this.controls.reset();
  }

  /** Dummies on (placed again) or off (gone). */
  setDummies(on: boolean): void {
    this.controls.setOn(on);
  }

  /** Back to where you started. */
  override respawn(): void {
    const s = freeRoamStart(this.level.def);
    const p = this.local();
    if (!p) return;
    respawnPlayer(this.world(), p, s.pos, s.yawDeg, this.config);
  }

  /** Pause menu extras (app.ts): reset the dummies, switch them on / off. */
  pauseActions(): { icon: 'respawn' | 'range'; label: string; run: () => void }[] {
    if (!this.controls.spots) return [];
    const on = this.controls.isOn();
    return [
      ...(on
        ? [{ icon: 'respawn' as const, label: 'Reset dummies', run: () => this.resetDummies() }]
        : []),
      {
        icon: 'range' as const,
        label: on ? 'Dummies: on' : 'Dummies: off',
        run: () => this.setDummies(!on),
      },
    ];
  }
}

export const createFreeRoamSession = (opts: FreeRoamOptions): FreeRoamSession => {
  const def = mapDef(opts.mapId);
  const kit = loadoutName(opts.kit);
  const config = configForLoadout(opts.config ?? loadTuning(), kit);
  const spots = placeDummies(def, config);
  const start = freeRoamStart(def);
  const stats = new StatsTracker();
  const names: Record<number, string> = {};
  let on = opts.dummies !== false && spots.length > 0;
  let dummies: LiveDummy[] = [];
  let meDeadSince = -1;
  let world: WorldState | null = null;
  let ctx: SimContext | null = null;
  const place = () => {
    if (!world || !ctx) return;
    const w = world;
    // (dummies are ids 2…; they are removed and added again as a whole)
    w.players = w.players.filter((p) => p.id === 1);
    w.boomerangs = w.boomerangs.filter((b) => b.owner === 1);
    dummies = [];
    if (!on) return;
    spots.forEach((s, i) => {
      const id = 2 + i;
      addPlayer(w, createPlayer(id, 1, s.pos, s.yawDeg, ctx!.config));
      dummies.push({ ...s, id, deadSince: -1, phase: i * 37 });
      names[id] =
        s.kind === 'static' ? 'Dummy' : s.kind === 'strafe' ? 'Strafing dummy' : 'Jumping dummy';
    });
  };
  const session = new FreeRoamSession(
    {
      levelDef: def,
      config,
      seed: 7,
      names,
      setup: (w, c) => {
        world = w;
        ctx = c;
        const me = w.players.find((p) => p.id === 1)!;
        respawnPlayer(w, me, start.pos, start.yawDeg, c.config);
        place();
      },
      extraInputs: (w) => {
        const inputs: Record<number, PlayerInput> = {};
        for (const d of dummies)
          inputs[d.id] = {
            tick: w.tick + 1,
            buttons: dummyInput(d, w.tick),
            view: yawToView(d.yawDeg, 0),
          };
        return inputs;
      },
      afterStep: (w, c) => {
        stats.observe(w);
        for (const d of dummies) {
          const p = w.players.find((q) => q.id === d.id);
          if (!p) continue;
          if (p.alive) {
            d.deadSince = -1;
            // strafers drift (and may fall off something): back to their spot
            if (len(sub(p.pos, d.pos)) > FREE_ROAM.leashM || p.pos.y < d.pos.y - 4)
              respawnPlayer(w, p, d.pos, d.yawDeg, c.config);
            continue;
          }
          if (d.deadSince < 0) d.deadSince = w.tick;
          if (w.tick - d.deadSince > FREE_ROAM.respawnTicks) {
            respawnPlayer(w, p, d.pos, d.yawDeg, c.config);
            stats.onRespawn(p.id);
          }
        }
        // you're back after a moment (your own grenade, a fall, leaving the map): at the spawn
        // point nearest to where you went down
        const me = w.players.find((p) => p.id === 1);
        if (me && !me.alive) {
          if (meDeadSince < 0) meDeadSince = w.tick;
          if (w.tick - meDeadSince >= FREE_ROAM.youRespawnTicks) {
            respawnPlayer(w, me, nearestSpawn(def, me.pos).pos, start.yawDeg, c.config);
            meDeadSince = -1;
          }
        } else meDeadSince = -1;
      },
    },
    opts.mapId,
    stats,
    {
      spots: spots.length,
      isOn: () => on,
      setOn: (v) => {
        on = v && spots.length > 0;
        place();
      },
      reset: () => place(),
    },
  );
  return session;
};

/** Start free roam on a map (call from a click: it locks the pointer). */
export const startFreeRoam = (app: App, opts: FreeRoamOptions): void => {
  const session = createFreeRoamSession(opts);
  const combat = new CombatFeature();
  const race = !!session.level.def.race;
  const cs = loadoutName(opts.kit) === 'cs';
  // (no tuning panel in CS mode: its config is a CS copy that must not be saved as tuning)
  const client = app.startGame(session, race ? [] : [combat], { tuning: !cs });
  if (!race) {
    combat.hud.showStats = true;
    combat.statsText = () => {
      const r = session.stats.report([1]);
      const me = session.stats.players.get(1);
      return [
        'FREE ROAM',
        cs
          ? `Hits ${r.boomerangHitPct.toFixed(0)}% · dummies down: ${me?.kills ?? 0}`
          : `Boomerang hits ${r.boomerangHitPct.toFixed(0)}% · Laser hits ${r.laserHitPct.toFixed(0)}%`,
        `Dummies down: ${me?.kills ?? 0}`,
        session.dummiesOn()
          ? 'Static · strafing · jumping dummies · Esc: reset / switch them off'
          : 'Dummies off (Esc menu to switch them on)',
      ].join('\n');
    };
  }
  client.hud.setHint(
    race
      ? 'Free roam · no dummies on race tracks: practise the route · Esc menu (Respawn)'
      : cs
        ? 'Free roam · Esc menu (Respawn, Reset dummies) · LMB fire · 1 AK · 2 Deagle · R reload · E knife'
        : 'Free roam · Esc menu (Respawn, Reset dummies) · LMB throw · RMB wind-up · E slash · R recall · Q grenade',
  );
};
