// Map Maker: the instant Build ⇄ Test toggle (editor/quick-test.ts, editor/test-mode.ts) — the
// keys and the toggle, where "test from here" puts you, where the camera goes back, and the
// test run itself (falls, kill paint and the respawn key bring you back to the test start).
import { describe, expect, it } from 'vitest';
import {
  Btn,
  buildLevel,
  compileCustomMap,
  defaultConfig,
  yawToView,
  type CustomBlock,
  type CustomGate,
  type CustomMapDoc,
  type LevelDef,
} from '@space-yz/shared';
import {
  cameraFromView,
  eyeHeight,
  mapStart,
  QUICK_BUILD,
  quickStep,
  quickTestKey,
  spawnFromCamera,
  testLevelDef,
  testStartCp,
  type KeyLike,
  type QuickState,
  type TestSpawn,
} from '../src/editor/quick-test';
import { createQuickTestRun, testStart } from '../src/editor/test-mode';

const config = defaultConfig();
const m = config.movement;

const block = (id: number, b: Partial<CustomBlock>): CustomBlock => ({
  id,
  shape: 'box',
  pos: [0, 0, 0],
  size: [1, 1, 1],
  mat: 'concrete',
  ...b,
});

/** A floor (top at y 0, x/z -20..20), a 3 m block on it, red paint, a surf ramp far out. */
const doc = (race?: CustomMapDoc['race']): CustomMapDoc => ({
  v: 1,
  name: 'Test map',
  base: '',
  sky: 'day',
  blocks: [
    block(1, { pos: [0, -0.5, 0], size: [40, 1, 40] }),
    block(2, { pos: [10, 1.5, 0], size: [4, 3, 4] }),
    block(3, { shape: 'killpaint', pos: [-10, 0.05, -10], size: [4, 0.1, 4], mat: 'killpaint' }),
    block(4, { shape: 'surf', pos: [0, 10, 70], size: [8, 6, 16] }),
  ],
  movers: [],
  spawns: [{ pos: [0, 0, 15], yaw: 0 }],
  ...(race ? { race } : {}),
  portals: [],
  launchPads: [],
});

const gate = (z: number): CustomGate => ({ pos: [0, 1.5, z], size: [8, 3, 1], yaw: 0 });
const RACE: CustomMapDoc['race'] = {
  start: { pos: [0, 1, -15], size: [6, 2, 2], yaw: 0 },
  checkpoints: [gate(0), gate(10)],
  finish: gate(18),
};

const key = (code: string, k: Partial<KeyLike> = {}): KeyLike => ({
  code,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  ...k,
});

const idle = () => ({ buttons: 0, view: yawToView(0) });
const steps = (s: { update: (dt: number, f: typeof idle) => void }, n: number, f = idle) => {
  for (let i = 0; i < n; i++) s.update(1 / 60, f);
};
const feetOf = (p: { pos: { x: number; y: number; z: number } }) => ({
  x: p.pos.x,
  y: p.pos.y - m.standHeight / 2,
  z: p.pos.z,
});

describe('the Build ⇄ Test toggle', () => {
  it('T tests from the camera, Shift+T from the start; nothing else is the toggle', () => {
    expect(quickTestKey(key('KeyT'))).toBe('camera');
    expect(quickTestKey(key('KeyT', { shiftKey: true }))).toBe('start');
    expect(quickTestKey(key('KeyT', { ctrlKey: true }))).toBeNull();
    expect(quickTestKey(key('KeyT', { altKey: true }))).toBeNull();
    expect(quickTestKey(key('KeyT', { repeat: true }))).toBeNull();
    expect(quickTestKey(key('KeyR'))).toBeNull();
    expect(quickTestKey(key('Tab'))).toBeNull();
  });

  it('the T key is free in the game binds and the editor keys', async () => {
    const { DEFAULT_KEYBINDS } = await import('../src/settings');
    expect(Object.values(DEFAULT_KEYBINDS).flat()).not.toContain('KeyT');
    const { HELP_ROWS } = await import('../src/editor/ui');
    const keys = HELP_ROWS.map(([k]) => k);
    expect(keys.filter((k) => /\bT\b/.test(k))).toEqual(['T / Shift + T']);
  });

  it('toggles build → test → build; the pause menu and refusals go back to building', () => {
    let s: QuickState = QUICK_BUILD;
    let r = quickStep(s, { k: 'toggle', from: 'camera' });
    expect(r.action).toEqual({ k: 'test', from: 'camera' });
    expect(r.state).toEqual({ mode: 'test', from: 'camera' });
    s = r.state;
    // Shift+T while testing is back to building too (one key, two states)
    r = quickStep(s, { k: 'toggle', from: 'start' });
    expect(r.action).toEqual({ k: 'build' });
    expect(r.state).toEqual(QUICK_BUILD);
    s = quickStep(QUICK_BUILD, { k: 'toggle', from: 'start' }).state;
    expect(s).toEqual({ mode: 'test', from: 'start' });
    r = quickStep(s, { k: 'back' });
    expect(r.action).toEqual({ k: 'build' });
    expect(r.state.mode).toBe('build');
    // "back" while building does nothing
    expect(quickStep(QUICK_BUILD, { k: 'back' })).toEqual({ state: QUICK_BUILD, action: null });
    // a test that could not start (map problems): building, and nothing to undo
    r = quickStep({ mode: 'test', from: 'camera' }, { k: 'refused' });
    expect(r).toEqual({ state: QUICK_BUILD, action: null });
  });
});

describe('test from here: where you start', () => {
  const def = compileCustomMap(doc());
  const level = buildLevel(def);
  const eyeH = eyeHeight(m);

  it('drops you on the ground straight below the camera, facing where it looks', () => {
    const r = spawnFromCamera(level, { pos: [2, 12, 3], heading: 90, pitch: -25 }, m);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spawn.ground).toBe(true);
    expect(r.spawn.feet.x).toBeCloseTo(2);
    expect(r.spawn.feet.z).toBeCloseTo(3);
    expect(r.spawn.feet.y).toBeCloseTo(0.02, 2);
    // compass heading 90 (east, +x) is the game's yaw -90; the pitch is kept
    expect(r.spawn.yawDeg).toBe(-90);
    expect(r.spawn.pitchDeg).toBe(-25);
    const fwd = yawToView(r.spawn.yawDeg);
    // (facing +x: the view's forward)
    const f = { x: -2 * (fwd.x * fwd.z + fwd.w * fwd.y) };
    expect(f.x).toBeGreaterThan(0.99);
  });

  it('lands on the nearest ground: the top of a block, not the floor under it', () => {
    const r = spawnFromCamera(level, { pos: [10, 9, 0], heading: 0, pitch: 0 }, m);
    expect(r.ok && r.spawn.ground && r.spawn.feet.y).toBeCloseTo(3.02, 2);
  });

  it('a camera inside a block: lifted out of it onto its top', () => {
    const r = spawnFromCamera(level, { pos: [10, 1.5, 0], heading: 0, pitch: 0 }, m);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spawn.ground).toBe(true);
      expect(r.spawn.feet.y).toBeCloseTo(3.02, 2);
    }
  });

  it('nothing below (the void) or a surf ramp below: you start in the air at the camera', () => {
    for (const pos of [
      [0, 10, 40],
      [0, 24, 70],
    ] as [number, number, number][]) {
      const r = spawnFromCamera(level, { pos, heading: 180, pitch: 10 }, m);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.spawn.ground).toBe(false);
      // your eyes are where the camera was
      expect(r.spawn.feet.y + eyeH).toBeCloseTo(pos[1], 3);
      expect(r.spawn.feet.x).toBeCloseTo(pos[0]);
      expect(r.spawn.feet.z).toBeCloseTo(pos[2]);
    }
  });

  it('refuses red paint below, and a camera outside or under the map', () => {
    expect(spawnFromCamera(level, { pos: [-10, 6, -10], heading: 0, pitch: 0 }, m).ok).toBe(false);
    expect(spawnFromCamera(level, { pos: [400, 6, 0], heading: 0, pitch: 0 }, m).ok).toBe(false);
    expect(
      spawnFromCamera(level, { pos: [0, def.boundsMin.y - 5, 0], heading: 0, pitch: 0 }, m).ok,
    ).toBe(false);
    // (the editor then starts you at the map's start and says why)
    const s = testStart(def, 'camera', { pos: [-10, 6, -10], heading: 0, pitch: 0 }, config);
    expect(s.note).toMatch(/kill paint/i);
    expect(s.spawn).toEqual(mapStart(def));
  });

  it("Shift+T: the map's start (a race's first start slot, else the first spawn)", () => {
    expect(mapStart(def).feet).toEqual({ x: 0, y: 0, z: 15 });
    const race = compileCustomMap(doc(RACE));
    const s = testStart(race, 'start', { pos: [0, 50, 0], heading: 0, pitch: 0 }, config);
    expect(s.cp).toBe(0);
    expect(s.spawn.feet).toEqual(race.race!.grid[0].pos);
  });
});

describe('back to building: the camera', () => {
  it('goes where your eyes were, looking the same way', () => {
    for (const [heading, pitch] of [
      [0, 0],
      [90, -30],
      [-135, 45],
      [179, -80],
      [-60, 12.5],
    ]) {
      const cam = cameraFromView({ x: 1, y: 2.5, z: -3 }, yawToView(-heading, pitch));
      expect(cam.pos).toEqual([1, 2.5, -3]);
      expect(cam.heading).toBeCloseTo(heading, 1);
      expect(cam.pitch).toBeCloseTo(pitch, 1);
    }
  });

  it('build → test → build without moving keeps the camera', () => {
    const level = buildLevel(compileCustomMap(doc()));
    const cam = { pos: [3, 15, 40] as [number, number, number], heading: -40, pitch: -15 };
    const r = spawnFromCamera(level, cam, m);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const eye = { ...r.spawn.feet, y: r.spawn.feet.y + eyeHeight(m) };
    const back = cameraFromView(eye, yawToView(r.spawn.yawDeg, r.spawn.pitchDeg));
    expect(back.pos[0]).toBeCloseTo(cam.pos[0]);
    expect(back.pos[1]).toBeCloseTo(cam.pos[1]);
    expect(back.pos[2]).toBeCloseTo(cam.pos[2]);
    expect(back.heading).toBeCloseTo(cam.heading, 1);
    expect(back.pitch).toBeCloseTo(cam.pitch, 1);
  });
});

describe('the level a test plays', () => {
  const spawnAt = (x: number, y: number, z: number, ground = true): TestSpawn => ({
    feet: { x, y, z },
    yawDeg: 0,
    pitchDeg: 0,
    ground,
  });

  it('racing from the middle of the course: the gates behind you count', () => {
    const race = compileCustomMap(doc(RACE)).race!;
    expect(testStartCp(race, { x: 0, y: 0, z: -14 })).toBe(0);
    expect(testStartCp(race, { x: 1, y: 0, z: 4 })).toBe(1);
    expect(testStartCp(race, { x: -2, y: 0, z: 14 })).toBe(2);
  });

  it('is a copy: the map is never changed', () => {
    for (const d of [compileCustomMap(doc()), compileCustomMap(doc(RACE))]) {
      const before = JSON.stringify(d);
      const t = testLevelDef(d, spawnAt(1, 0.02, 4), 1);
      expect(JSON.stringify(d)).toBe(before);
      expect(t).not.toBe(d);
      expect(t.spawns).toEqual([{ pos: { x: 1, y: 0.02, z: 4 }, yawDeg: 0 }]);
    }
  });

  it('no race: surf-map movement, the test start is where you come back', () => {
    const d = compileCustomMap(doc());
    expect(d.race).toBeUndefined();
    const t = testLevelDef(d, spawnAt(2, 0.02, 3));
    expect(t.race?.surf).toBe(true);
    expect(t.race?.start.respawn).toEqual({ x: 2, y: 0.02, z: 3 });
    expect(t.race?.checkpoints).toEqual([]);
    // kill paint brings you back instead of killing you
    expect(t.killVolumes).toBeUndefined();
    expect(t.race?.killVolumes?.length).toBe(d.killVolumes?.length);
    expect(t.race!.killY).toBeLessThan(-5);
  });

  it('a race from the middle: the gate behind you brings you back to the test start', () => {
    const d = compileCustomMap(doc(RACE));
    const t = testLevelDef(d, spawnAt(1, 0.02, 4), 1);
    expect(t.race!.checkpoints[0].respawn).toEqual({ x: 1, y: 0.02, z: 4 });
    expect(t.race!.checkpoints[0].min).toEqual(d.race!.checkpoints[0].min);
    expect(t.race!.checkpoints[1]).toBe(d.race!.checkpoints[1]);
    expect(t.race!.start).toEqual(d.race!.start);
  });
});

describe('a test run', () => {
  it('free running: falls, kill paint and the respawn key bring you back to the test start', () => {
    const d = compileCustomMap(doc());
    const before = JSON.stringify(d);
    const spawn: TestSpawn = {
      feet: { x: 2, y: 0.02, z: 3 },
      yawDeg: 30,
      pitchDeg: -20,
      ground: true,
    };
    const run = createQuickTestRun(d, spawn, 0, config);
    expect(run.race).toBeNull();
    const p = run.session.local()!;
    // you look where the camera looked
    expect(p.view).toEqual(yawToView(30, -20));
    steps(run.session, 30);
    expect(feetOf(p).x).toBeCloseTo(2, 1);
    // off the edge of the floor, into the void
    p.pos = { x: 0, y: 5, z: 40 };
    steps(run.session, 60 * 6);
    expect(p.alive).toBe(true);
    expect(Math.hypot(p.pos.x - 2, p.pos.z - 3)).toBeLessThan(0.5);
    // onto the red paint
    p.pos = { x: -10, y: 1.2, z: -10 };
    p.vel = { x: 0, y: -3, z: 0 };
    steps(run.session, 30);
    expect(p.alive).toBe(true);
    expect(Math.hypot(p.pos.x - 2, p.pos.z - 3)).toBeLessThan(0.5);
    // walk away, hold R
    p.pos = { x: 12, y: 1, z: -12 };
    steps(run.session, 20);
    const hold = () => ({ buttons: Btn.Recall, view: p.view });
    steps(run.session, Math.ceil(m.raceRespawnHoldSec * 60) + 5, hold);
    expect(Math.hypot(p.pos.x - 2, p.pos.z - 3)).toBeLessThan(0.5);
    // Backspace: again
    p.pos = { x: 12, y: 1, z: -12 };
    run.restart();
    expect(feetOf(p).x).toBeCloseTo(2);
    // nothing you did changed the map
    expect(JSON.stringify(d)).toBe(before);
  });

  it('a race from the middle: racing at once, splits, back to the test start, again after the finish', () => {
    const d: LevelDef = compileCustomMap(doc(RACE));
    const s = testStart(d, 'camera', { pos: [1, 8, 4], heading: 0, pitch: -10 }, config);
    expect(s.cp).toBe(1);
    const run = createQuickTestRun(d, s.spawn, s.cp, config);
    const st = run.race!;
    const p = run.session.local()!;
    expect(st.phase).toBe('racing');
    expect(p.raceCp).toBe(1);
    expect(p.frozen).toBe(false);
    steps(run.session, 10);
    // the gate behind you counted
    expect(st.entries[0].splits.length).toBe(1);
    // a fall before the next gate: back to the test start (not checkpoint 1)
    p.pos = { x: 0, y: -200, z: 4 };
    steps(run.session, 2);
    expect(Math.hypot(p.pos.x - s.spawn.feet.x, p.pos.z - s.spawn.feet.z)).toBeLessThan(0.1);
    expect(p.raceCp).toBe(1);
    steps(run.session, 60 * 3);
    // through checkpoint 2 and the finish
    p.frozen = false;
    p.racePenalty = 0;
    p.pos = { x: 0, y: 1.2, z: 10 };
    steps(run.session, 2);
    expect(p.raceCp).toBe(2);
    p.pos = { x: 0, y: 1.2, z: 18 };
    steps(run.session, 2);
    expect(p.raceCp).toBe(3);
    expect(st.phase).toBe('results');
    expect(st.result?.standings[0].timeMs).toBeGreaterThan(0);
    // a few seconds later: the run starts again from the test start
    steps(run.session, 60 * 5);
    expect(st.phase).toBe('racing');
    expect(p.raceCp).toBe(1);
    expect(st.race).toBe(2);
  });

  it('a race from the start: racing at once from the first start slot', () => {
    const d = compileCustomMap(doc(RACE));
    const s = testStart(d, 'start', { pos: [0, 0, 0], heading: 0, pitch: 0 }, config);
    const run = createQuickTestRun(d, s.spawn, s.cp, config);
    expect(run.race!.phase).toBe('racing');
    expect(run.session.local()!.raceCp).toBe(0);
    expect(feetOf(run.session.local()!).z).toBeCloseTo(d.race!.grid[0].pos.z, 1);
  });
});
