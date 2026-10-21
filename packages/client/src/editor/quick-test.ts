// MAP MAKER — the instant Build ⇄ Test toggle, its pure parts (search term: quick test, test
// mode, build/test toggle). The runtime (the game started over the open editor) is
// editor/test-mode.ts; these are the rules it follows, kept free of the DOM so tests run them.
//
//   quickTestKey(e)            T: test from the camera · Shift+T: test from the map's start
//   quickStep(state, event)    the toggle: Build → Test → Build (and "Back to the Map Maker")
//   spawnFromCamera(...)       where "test from here" puts you: feet on the nearest walkable
//                              ground straight below the camera, or at the camera (in the air)
//                              when there is none (a surf ramp or the void below)
//   cameraFromView(eye, view)  back to building: the camera where your eyes were, same look
//   testStartCp(race, feet)    racing from the middle of a course: the gates already behind you
//   testLevelDef(def, spawn)   the level a test plays: your test start is where falls, kill
//                              paint and the respawn key bring you back (until the next gate)
import type {
  Level,
  LevelDef,
  MovementConfig,
  Quat,
  RaceDef,
  RaceGateDef,
  Vec3,
} from '@space-yz/shared';
import { capsuleOverlaps, pointInAabb, qForward, qUp, raycast, v3 } from '@space-yz/shared';
import type { CameraState } from './session';

/** The toggle key (free in the editor and in the game's default binds). */
export const QUICK_TEST_CODE = 'KeyT';
export const QUICK_TEST_LABEL = 'T';
/** Test mode: start the run again at the test start (the clock too). */
export const QUICK_RESTART_CODE = 'Backspace';

export type TestFrom = 'camera' | 'start';

export interface KeyLike {
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

/** Which test a key press asks for: T from the camera, Shift+T from the start (null: not it). */
export const quickTestKey = (e: KeyLike): TestFrom | null => {
  if (e.code !== QUICK_TEST_CODE || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return null;
  return e.shiftKey ? 'start' : 'camera';
};

// ---------------------------------------------------------------------------------------------
// the toggle

export type QuickMode = 'build' | 'test';

export interface QuickState {
  mode: QuickMode;
  /** testing: where this run started */
  from: TestFrom | null;
}

export type QuickEvent =
  /** the key or the button: from building, test (from `from`); from testing, back to building */
  | { k: 'toggle'; from: TestFrom }
  /** the game ended (the pause menu's "Back to the Map Maker", another screen took over) */
  | { k: 'back' }
  /** the test could not start (the map has problems): stay building */
  | { k: 'refused' };

export type QuickAction = { k: 'test'; from: TestFrom } | { k: 'build' } | null;

export const QUICK_BUILD: QuickState = { mode: 'build', from: null };

export const quickStep = (
  s: QuickState,
  e: QuickEvent,
): { state: QuickState; action: QuickAction } => {
  switch (e.k) {
    case 'toggle':
      return s.mode === 'build'
        ? { state: { mode: 'test', from: e.from }, action: { k: 'test', from: e.from } }
        : { state: QUICK_BUILD, action: { k: 'build' } };
    case 'back':
      return s.mode === 'test'
        ? { state: QUICK_BUILD, action: { k: 'build' } }
        : { state: s, action: null };
    case 'refused':
      return { state: QUICK_BUILD, action: null };
  }
};

// ---------------------------------------------------------------------------------------------
// test from here

export interface TestSpawn {
  /** feet */
  feet: Vec3;
  /** the game's yaw (degrees, 0 = facing -z, 90 = facing -x) */
  yawDeg: number;
  /** degrees, + = up */
  pitchDeg: number;
  /** standing on ground (false: dropped in the air at the camera) */
  ground: boolean;
}

export type SpawnResult = { ok: true; spawn: TestSpawn } | { ok: false; why: string };

/** How far a "test from here" start may be lifted out of a block the camera is inside (m). */
export const MAX_LIFT = 12;
const LIFT_STEP = 0.5;
const DEG = Math.PI / 180;
const UPV = v3(0, 1, 0);
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** The eyes' height over the feet (standing). */
export const eyeHeight = (m: MovementConfig): number => m.standHeight - m.eyeFromTopStand;

/** Does a standing body fit with its feet here? */
export const bodyFits = (level: Level, feet: Vec3, m: MovementConfig): boolean =>
  !capsuleOverlaps(
    level,
    {
      center: v3(feet.x, feet.y + m.standHeight / 2 + 0.01, feet.z),
      up: UPV,
      halfSeg: m.standHeight / 2 - m.radius,
      radius: m.radius,
    },
    0.02,
  );

/** Below this height a body falls off the level (a race's killY, else the level's floor). */
const fallLine = (def: LevelDef): number => def.race?.killY ?? def.boundsMin.y;

/**
 * "Test from here": the eyes at the camera, facing where it looks. Feet go on the nearest
 * walkable ground straight below; with none (the void, or a surf ramp's face below) you start
 * at the camera, in the air. A camera inside a block lifts you out of it (up to MAX_LIFT).
 * Refused (the caller starts at the map's start instead): outside the level, below where falls
 * count, no room even after lifting, or red kill paint right below.
 */
export const spawnFromCamera = (level: Level, cam: CameraState, m: MovementConfig): SpawnResult => {
  const def = level.def;
  const yawDeg = r3(-cam.heading);
  const pitchDeg = Math.max(-89, Math.min(89, cam.pitch));
  let feet = v3(cam.pos[0], cam.pos[1] - eyeHeight(m), cam.pos[2]);
  // (20 m outside the level's box counts as falling off; a little over its top is still fine)
  const top = v3(def.boundsMax.x, def.boundsMax.y + 15, def.boundsMax.z);
  if (!pointInAabb(feet, def.boundsMin, top))
    return { ok: false, why: 'The camera is outside the map' };
  if (feet.y <= fallLine(def) + 1) return { ok: false, why: 'The camera is below the map' };
  let lift = 0;
  while (!bodyFits(level, feet, m)) {
    if (lift >= MAX_LIFT) return { ok: false, why: 'No room to stand here' };
    lift += LIFT_STEP;
    feet = v3(feet.x, feet.y + LIFT_STEP, feet.z);
  }
  if (!pointInAabb(feet, def.boundsMin, top)) return { ok: false, why: 'No room to stand here' };
  const drop = feet.y - fallLine(def);
  const hit =
    drop > 0 ? raycast(level, v3(feet.x, feet.y + 0.05, feet.z), v3(0, -1, 0), drop) : null;
  const box = hit ? level.boxes[hit.box] : null;
  const ground = hit ? v3(hit.point.x, hit.point.y + 0.02, hit.point.z) : null;
  if (ground && hit!.normal.y > 0.5 && (box?.kill || inKill(def, ground, m)))
    return { ok: false, why: 'Red kill paint is right below the camera' };
  if (inKill(def, feet, m)) return { ok: false, why: 'The camera is in kill paint' };
  const walkable =
    !!hit && !!box && !box.surf && hit.normal.y >= Math.cos(m.maxWalkableSlopeDeg * DEG);
  if (ground && walkable && bodyFits(level, ground, m))
    return { ok: true, spawn: { feet: round(ground), yawDeg, pitchDeg, ground: true } };
  return { ok: true, spawn: { feet: round(feet), yawDeg, pitchDeg, ground: false } };
};

/** Would a body standing with its feet here be in kill paint (its deadly volume)? */
const inKill = (def: LevelDef, feet: Vec3, m: MovementConfig): boolean => {
  const c = v3(feet.x, feet.y + m.standHeight / 2, feet.z);
  const vols = [...(def.killVolumes ?? []), ...(def.race?.killVolumes ?? [])];
  return vols.some((k) => pointInAabb(c, k.min, k.max));
};

const round = (p: Vec3): Vec3 => v3(r3(p.x), r3(p.y), r3(p.z));

/**
 * Back to building: the camera at your eyes, looking the same way (the editor's heading is a
 * compass heading, 0 = north -z, 90 = east +x; pitch + = up).
 */
export const cameraFromView = (eye: Vec3, view: Quat): CameraState => {
  const f = qForward(view);
  // straight up / down: the heading comes from the view's up (it leans the way you face)
  let hx = f.x;
  let hz = f.z;
  if (Math.hypot(hx, hz) < 1e-3) {
    const u = qUp(view);
    const s = f.y > 0 ? -1 : 1;
    hx = u.x * s;
    hz = u.z * s;
  }
  let heading = Math.atan2(hx, -hz) / DEG;
  if (heading <= -180) heading += 360;
  const pitch = Math.max(-89, Math.min(89, Math.asin(Math.max(-1, Math.min(1, f.y))) / DEG));
  return {
    pos: [r3(eye.x), r3(eye.y), r3(eye.z)],
    heading: Math.round(heading * 100) / 100,
    pitch: Math.round(pitch * 100) / 100,
  };
};

// ---------------------------------------------------------------------------------------------
// the level a test plays

/** The race's route points: the start, every checkpoint, the finish (where each respawns). */
const routePoints = (race: RaceDef): Vec3[] => [
  race.start.respawn,
  ...race.checkpoints.map((g) => g.respawn),
  race.finish.respawn,
];

const distToSegment = (p: Vec3, a: Vec3, b: Vec3): number => {
  const ab = v3(b.x - a.x, b.y - a.y, b.z - a.z);
  const ap = v3(p.x - a.x, p.y - a.y, p.z - a.z);
  const l2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  const t =
    l2 > 1e-9 ? Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / l2)) : 0;
  return Math.hypot(ap.x - ab.x * t, ap.y - ab.y * t, ap.z - ab.z * t);
};

/**
 * Racing from the middle of a course: how many gates are already behind you — the leg of the
 * route (start → checkpoint 1 → … → finish) nearest to your feet. 0 = from the start.
 */
export const testStartCp = (race: RaceDef, feet: Vec3): number => {
  const pts = routePoints(race);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = distToSegment(feet, pts[i], pts[i + 1]);
    if (d < bestD - 1e-6) {
      bestD = d;
      best = i;
    }
  }
  return best;
};

/**
 * The level a test run plays (a copy: `def` is never changed). The test start is where you come
 * back after a fall, kill paint or the respawn key until you pass the next gate:
 *  - a race (def.race): the race's own rules; from the middle of the course (`cp` gates behind
 *    you) the gate before you brings you back to the test start instead of itself;
 *  - no race: free running with race movement (air-strafe, bunny hops, surf ramps) as on a surf
 *    map (no jetpack, no SURGE); kill paint and falls bring you back instead of killing you.
 */
export const testLevelDef = (def: LevelDef, spawn: TestSpawn, cp = 0): LevelDef => {
  const back = { respawn: spawn.feet, yawDeg: spawn.yawDeg };
  const slot = { pos: spawn.feet, yawDeg: spawn.yawDeg };
  if (def.race) {
    const race = def.race;
    const n = race.checkpoints.length;
    const at = Math.max(0, Math.min(n, Math.floor(cp)));
    const checkpoints: RaceGateDef[] =
      at > 0
        ? race.checkpoints.map((g, i) => (i === at - 1 ? { ...g, ...back } : g))
        : race.checkpoints;
    // (the anchors of the section you start in would bring you somewhere behind you)
    const anchors = race.anchors?.filter((a) => a.cp !== at);
    return {
      ...def,
      spawns: [slot],
      race: {
        ...race,
        start: at === 0 ? back : race.start,
        grid: [slot, ...race.grid.slice(1)],
        checkpoints,
        ...(race.anchors ? { anchors } : {}),
      },
    };
  }
  // free running: a course with no gates (you never race it: gates don't count) whose start is
  // the test start; kill volumes become the race's (back to the start, not dead)
  const killY = Math.min(def.boundsMin.y + 10, spawn.feet.y - 20);
  const { killVolumes, ...rest } = def;
  const finish: RaceGateDef = { min: spawn.feet, max: spawn.feet, ...back };
  return {
    ...rest,
    boundsMin: v3(def.boundsMin.x, Math.min(def.boundsMin.y, killY - 10), def.boundsMin.z),
    spawns: [slot],
    race: {
      parSec: 60,
      start: back,
      grid: [slot],
      checkpoints: [],
      finish,
      killY,
      ...(killVolumes?.length ? { killVolumes } : {}),
      line: [],
      surf: true,
      noJetpack: true,
      noSurge: true,
    },
  };
};

/** Where "test from the start" begins: the race's first start slot, else the first spawn. */
export const mapStart = (def: LevelDef): TestSpawn => {
  const s = def.race?.grid[0] ??
    def.spawns.find((x) => x.team === undefined || x.team === 0) ??
    def.spawns[0] ?? { pos: v3(0, 0, 0), yawDeg: 0 };
  return { feet: s.pos, yawDeg: s.yawDeg, pitchDeg: 0, ground: true };
};
