// MAP MAKER — the instant Build ⇄ Test toggle (search term: quick test, test mode). T plays the
// map as it is right now (unsaved edits too) from where the camera is; Shift+T from the map's
// start; T again (or the pause menu's "Back to the Map Maker") is back to building with the
// camera where your eyes were. The editor is never closed: it waits hidden with its selection,
// undo history, tool and unsaved changes, and its 3D view stays built. Only the level is compiled
// from the doc (cached while nothing changed), and the parts of the game's view of it that the
// edits touched are rebuilt (TestViews); the renderer is the same.
//
//   a race (start + finish, or an edit of a race map): the race rules, the clock running from
//     the moment you drop in, splits at the gates; from the middle of the course the gates behind
//     you count as passed. Finishing starts the run again after a short look at the result.
//   no race: free running with surf-map movement (air-strafe, bunny hops, surf ramps).
//   both: hold R = back to the test start (races: the last checkpoint you passed), Backspace =
//     start the run again, falls and kill paint bring you back instead of out of the editor.
// The pure rules (keys, the toggle, where you start, where the camera goes back) are in
// editor/quick-test.ts. The Test menu (online rooms, walking around with target dummies) is
// unchanged: net/custom-maps.ts playMap.
import type {
  CustomBlock,
  CustomMapDoc,
  GameConfig,
  Level,
  LevelDef,
  RaceState,
  SimContext,
  WorldState,
} from '@space-yz/shared';
import * as THREE from 'three';
import {
  applyCustomPatch,
  buildLevel,
  createRace,
  customMapHash,
  expandCustomBlock,
  mapDefForSize,
  raceView,
  resetRacer,
  roomLevelDef,
  startRaceCountdown,
  updateRace,
  yawToView,
} from '@space-yz/shared';
import type { ClientFeature, GameClient } from '../game/client';
import { LocalSession } from '../game/local-session';
import { RaceLocalSession } from '../game/race-entry';
import { RaceFeature, type RaceStore } from '../game/race-feature';
import { buildLevelMeshes, type LevelMeshes, type LevelMeshOptions } from '../render/level-mesh';
import { h } from '../ui/menus';
import { loadTuning } from '../ui/tuning';
import type { MapEditor } from './editor';
import { toCustomDoc } from './model';
import {
  cameraFromView,
  mapStart,
  QUICK_BUILD,
  QUICK_RESTART_CODE,
  QUICK_TEST_LABEL,
  quickStep,
  quickTestKey,
  spawnFromCamera,
  testLevelDef,
  testStartCp,
  type QuickEvent,
  type QuickState,
  type TestFrom,
  type TestSpawn,
} from './quick-test';
import type { CameraState } from './session';

/** The race HUD's track id for test runs (personal bests stay in memory, never saved). */
export const TEST_TRACK = 'mapmaker-test';
/** A test run is never DNF (the race's own limit is twice its par time). */
const TEST_LIMIT_SEC = 3600;
/** After the finish: the result shows this long, then the run starts again. */
const TEST_RESULTS_SEC = 4;
/** the local player of an offline session (LocalSession.localId) */
const LOCAL_ID = 1;

export interface QuickTestRun {
  session: LocalSession;
  /** the race rules (null: free running) */
  race: RaceState | null;
  /** the level played (a copy of the map's, with the test start in it) */
  def: LevelDef;
  spawn: TestSpawn;
  /** start again at the test start (the clock too) */
  restart(): void;
}

/**
 * The offline session of a test run (no rendering; tests use it too). `compiled` is the map's
 * level, `spawn` the test start, `cp` the gates already behind it (races).
 */
export const createQuickTestRun = (
  compiled: LevelDef,
  spawn: TestSpawn,
  cp: number,
  config: GameConfig,
): QuickTestRun => {
  const def = testLevelDef(compiled, spawn, cp);
  const view = yawToView(spawn.yawDeg, spawn.pitchDeg);
  if (!compiled.race) {
    // free running: race movement, no race
    const session = new LocalSession({
      levelDef: def,
      config,
      seed: 1,
      setup: (world) => {
        world.players[0].view = view;
      },
    });
    const restart = () => {
      const p = session.local();
      if (!p) return;
      resetRacer(p, config.movement, spawn.feet, spawn.yawDeg, -1);
      p.view = view;
    };
    return { session, race: null, def, spawn, restart };
  }
  const st = createRace(TEST_TRACK, { resultsSec: TEST_RESULTS_SEC });
  // GO right away: the clock runs from the moment you drop in (no lobby, no 3-2-1)
  const begin = (world: WorldState, ctx: SimContext) => {
    startRaceCountdown(st, world, ctx);
    const p = world.players.find((q) => q.id === LOCAL_ID);
    if (p) {
      resetRacer(p, ctx.config.movement, spawn.feet, spawn.yawDeg, cp);
      p.view = view;
    }
    st.phase = 'racing';
    st.startTick = world.tick;
    st.limitTick = world.tick + Math.round(TEST_LIMIT_SEC / ctx.dt);
    st.phaseEnds = st.limitTick;
  };
  const session: RaceLocalSession = new RaceLocalSession(
    {
      levelDef: def,
      config,
      seed: 1,
      setup: begin,
      afterStep: (world, ctx) => {
        if (st.phase === 'results' && world.tick >= st.phaseEnds) begin(world, ctx);
        else updateRace(st, world, ctx);
      },
    },
    st,
  );
  return { session, race: st, def, spawn, restart: () => begin(session.world(), session.ctx) };
};

/** A level for aiming the camera's start (collision only; kept while the map is unchanged). */
const levels = new WeakMap<LevelDef, Level>();
const levelOf = (def: LevelDef): Level => {
  let l = levels.get(def);
  if (!l) {
    l = buildLevel(def);
    levels.set(def, l);
  }
  return l;
};

/** The level of the doc as it is now (the same object while nothing changed: cached). */
export const compileForTest = (doc: CustomMapDoc): LevelDef =>
  roomLevelDef(doc.patch ? doc.base : 'custom:draft', 5, { doc, hash: customMapHash(doc) });

/** Where a test starts: from the camera (falling back to the map's start), or the start. */
export const testStart = (
  compiled: LevelDef,
  from: TestFrom,
  cam: CameraState,
  config: GameConfig,
): { spawn: TestSpawn; cp: number; note: string } => {
  if (from === 'camera') {
    const r = spawnFromCamera(levelOf(compiled), cam, config.movement);
    if (r.ok)
      return {
        spawn: r.spawn,
        cp: compiled.race ? testStartCp(compiled.race, r.spawn.feet) : 0,
        note: '',
      };
    return { spawn: mapStart(compiled), cp: 0, note: `${r.why}: you start at the map's start` };
  }
  return { spawn: mapStart(compiled), cp: 0, note: '' };
};

const memoryStore = (): RaceStore => {
  const data = new Map<string, string>();
  return { get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
};

/** In test mode: the T / Backspace keys, the TEST badge (a button on touch), where you look. */
class TestModeFeature implements ClientFeature {
  private el: HTMLElement | null = null;
  /** your eyes and look the last frame (the camera goes back there) */
  pose: CameraState | null = null;

  constructor(
    private tester: QuickTester,
    private run: QuickTestRun,
    private touch: boolean,
  ) {}

  init(c: GameClient): void {
    const where = this.run.race ? 'last checkpoint' : 'test start';
    const back = h(
      'button',
      {
        type: 'button',
        class: 'btn small primary',
        title: `Back to building (${QUICK_TEST_LABEL})`,
      },
      this.touch ? '◀ Build' : `${QUICK_TEST_LABEL} · Build`,
    );
    back.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tester.toggle('camera');
    });
    this.el = h(
      'div',
      { class: 'interactive' },
      h('span', {}, 'TEST'),
      back,
      this.touch
        ? null
        : h('span', { style: 'opacity:.8;font-weight:500' }, `hold R: ${where} · Backspace: again`),
    );
    Object.assign(this.el.style, {
      position: 'absolute',
      // (computer: bottom right, the HUD and the race bar use the top and the left; touch: the
      // left edge between the HUD and the stick, the buttons are bottom right)
      ...(this.touch ? { left: '12px', top: '40%' } : { right: '12px', bottom: '12px' }),
      whiteSpace: 'nowrap',
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      padding: '6px 10px',
      borderRadius: '8px',
      background: 'rgba(8, 12, 20, 0.6)',
      color: '#ffe9a8',
      font: '700 13px/1.2 system-ui, sans-serif',
      letterSpacing: '0.04em',
      zIndex: '5',
    });
    // (the pointer is locked on a computer: the button is for touch; keys say the rest)
    if (!this.touch) back.style.pointerEvents = 'none';
    c.deps.ui.append(this.el);
    // free running moves like a surf map: no dash, SURGE or jetpack to show (races: RaceFeature)
    if (!this.run.race) c.hud.dashLine = () => [];
    window.addEventListener('keydown', this.onKey, { capture: true });
    this.track(c);
  }

  private client: GameClient | null = null;

  private track(c: GameClient): void {
    this.client = c;
    const eye = c.session.localEye();
    if (eye) this.pose = cameraFromView(eye, c.fps.quat);
  }

  private onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t?.matches?.('input, select, textarea')) return;
    const from = quickTestKey(e);
    if (from) {
      e.preventDefault();
      // (the editor's own key handler must not see this T and start another test)
      e.stopImmediatePropagation();
      this.tester.toggle(from);
      return;
    }
    const c = this.client;
    if (e.code === QUICK_RESTART_CODE && !e.repeat && c && !c.paused) {
      e.preventDefault();
      this.run.restart();
      c.syncCameraToPlayer();
      c.hud.resetBest();
    }
  };

  frame(c: GameClient): void {
    this.track(c);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, { capture: true });
    this.el?.remove();
    this.el = null;
    this.client = null;
  }
}

/** Blocks per piece of the test view (by block id: an edit rebuilds only its own piece). */
const VIEW_CHUNK = 32;

/**
 * The game's view of the level for test runs. Building it (baked lighting over every piece) is
 * the slow part of a switch on a big map, so it is built in parts and kept between runs:
 *  - the map's part: an edited built-in map's own boxes (minus the removed ones), or nothing for
 *    a map of its own; with the portals, launch pads, sky and light glows of the whole map;
 *  - the doc's blocks, in pieces of VIEW_CHUNK block ids.
 * A change rebuilds only the parts it touches. (Each part is lit on its own, so a block casts
 * no baked shadow on other parts: a test-view shortcut; the Test menu's games light it whole.)
 */
class TestViews {
  private kept = new Map<string, LevelMeshes>();

  get(doc: CustomMapDoc, compiled: LevelDef, opts: LevelMeshOptions): LevelMeshes {
    const look = JSON.stringify(opts);
    const used: string[] = [];
    const part = (key: string, build: () => LevelMeshes): LevelMeshes => {
      used.push(key);
      let m = this.kept.get(key);
      if (!m) this.kept.set(key, (m = build()));
      return m;
    };
    const group = new THREE.Group();
    if (doc.patch) {
      // (the built-in map as edited, without the doc's blocks: its size, lights, portals...)
      const key = `map|${doc.base}|${JSON.stringify([doc.patch, doc.portals, doc.launchPads])}`;
      const map = part(`${key}|${look}`, () =>
        buildLevelMeshes(
          applyCustomPatch(mapDefForSize(doc.base, 5), { ...doc, blocks: [], movers: [] }),
          opts,
        ),
      );
      group.add(map.group);
    } else {
      const around = [doc.sky, doc.portals, doc.launchPads, compiled.boundsMin, compiled.boundsMax];
      const rest = part(`rest|${JSON.stringify(around)}|${look}`, () =>
        buildLevelMeshes({ ...compiled, boxes: [], movers: [] }, opts),
      );
      group.add(rest.group);
    }
    // the doc's blocks (moving ones are drawn by the game on their own)
    const moving = new Set(doc.movers.map((m) => m.block));
    const chunks = new Map<number, CustomBlock[]>();
    for (const b of doc.blocks) {
      if (moving.has(b.id)) continue;
      const k = Math.floor(b.id / VIEW_CHUNK);
      const list = chunks.get(k);
      if (list) list.push(b);
      else chunks.set(k, [b]);
    }
    for (const [k, blocks] of chunks) {
      const m = part(`doc|${k}|${JSON.stringify(blocks)}|${look}`, () =>
        buildLevelMeshes(
          { ...compiled, boxes: blocks.flatMap(expandCustomBlock), movers: [] },
          { ...opts, boxesOnly: true },
        ),
      );
      group.add(m.group);
    }
    // (only the parts of this view stay: the last test run's client is gone by now)
    for (const [k, m] of this.kept)
      if (!used.includes(k)) {
        m.dispose();
        this.kept.delete(k);
      }
    // (the parts are kept here: the game only removes the view from its scene)
    return { group, dispose: () => {} };
  }

  dispose(): void {
    for (const m of this.kept.values()) m.dispose();
    this.kept.clear();
  }
}

/** The toggle of one open editor. */
export class QuickTester {
  state: QuickState = QUICK_BUILD;
  private client: GameClient | null = null;
  private feature: TestModeFeature | null = null;
  /** best times of runs from the start, this editing session (in memory) */
  private bests = memoryStore();
  /** the game's view of the level, kept between test runs (see TestViews) */
  private views = new TestViews();

  constructor(private ed: MapEditor) {}

  get testing(): boolean {
    return this.state.mode === 'test';
  }

  /** T / Shift+T / the buttons. */
  toggle(from: TestFrom): void {
    this.dispatch({ k: 'toggle', from });
  }

  /** The game ended without the key (the pause menu, something else took over). */
  back(): void {
    this.dispatch({ k: 'back' });
  }

  private dispatch(e: QuickEvent): void {
    const { state, action } = quickStep(this.state, e);
    this.state = state;
    if (action?.k === 'test' && !this.startTest(action.from))
      this.state = quickStep(this.state, { k: 'refused' }).state;
    else if (action?.k === 'build') this.stopTest();
  }

  private startTest(from: TestFrom): boolean {
    const ed = this.ed;
    if (!ed.runChecks()) {
      ed.ui.toast('Fix the problems first');
      ed.ui.showProblems();
      return false;
    }
    let compiled: LevelDef;
    let doc: CustomMapDoc;
    try {
      doc = toCustomDoc(ed.doc);
      compiled = compileForTest(doc);
    } catch {
      ed.ui.toast("The map can't be played yet");
      return false;
    }
    const config = loadTuning();
    const start = testStart(compiled, from, ed.cameraState(), config);
    const run = createQuickTestRun(compiled, start.spawn, start.cp, config);
    const app = ed.app;
    const feature = new TestModeFeature(this, run, ed.touch);
    const features: ClientFeature[] = [];
    if (run.race) {
      const st = run.race;
      features.push(
        new RaceFeature({
          view: () => raceView(st, run.session.ctx),
          // (runs from the middle of the course never count as bests)
          track: TEST_TRACK,
          trackName: ed.doc.name,
          store: from === 'start' && start.cp === 0 ? this.bests : memoryStore(),
        }),
      );
    }
    features.push(feature);
    ed.suspend();
    app.afterGame = () => this.back();
    const client = app.startGame(run.session, features, {
      tuning: false,
      keepLock: true,
      levelMeshes: (opts) => this.views.get(doc, compiled, opts),
    });
    this.client = client;
    this.feature = feature;
    const again = run.race ? 'last checkpoint' : 'test start';
    client.hud.setHint(
      start.note ||
        `Testing ${ed.doc.name} · ${QUICK_TEST_LABEL}: back to building · hold R: ${again} · Backspace: again · Esc menu`,
      8,
    );
    return true;
  }

  private stopTest(): void {
    const ed = this.ed;
    const app = ed.app;
    const pose = this.feature?.pose ?? null;
    if (app.afterGame) app.afterGame = null;
    if (this.client && app.client === this.client) app.stopGame();
    this.client = null;
    this.feature = null;
    ed.resume(pose);
  }

  /** The editor is closing. */
  dispose(): void {
    if (this.testing) {
      const app = this.ed.app;
      if (app.afterGame) app.afterGame = null;
      if (this.client && app.client === this.client) app.stopGame();
      this.client = null;
      this.state = QUICK_BUILD;
    }
    this.views.dispose();
  }
}
