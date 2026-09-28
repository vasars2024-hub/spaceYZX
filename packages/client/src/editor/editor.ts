// MAP MAKER — the editor itself: fly around, pick a tool, click to build. It owns the 3D view
// (editor/viewport.ts), the keyboard and mouse while it is open, and the editing session (the
// doc + undo history, editor/session.ts). The panels are editor/ui.ts.
//
// Every change goes through commit(): a new doc (editor/model.ts) onto the undo stack, then the
// view, the panels, the checks and the autosaved draft follow.
import * as THREE from 'three';
import type { BoxDef, CustomBlock, CustomMaterial, LevelDef } from '@space-yz/shared';
import {
  baseBoxesForEditor,
  countPieces,
  customSkyLook,
  CUSTOM_MAP_LIMITS,
  getMap,
  isCurveShape,
  levelToCustomMap,
  mapDef,
  mapExists,
  v3,
  validateCustomMap,
} from '@space-yz/shared';
import type { App } from '../app';
import { setLeaveGuard } from '../game/input';
import {
  addBlocks,
  addCheckpoint,
  addMoverPoint,
  addPad,
  addPortal,
  addSpawn,
  adoptBaseBoxes,
  blockById,
  deleteRefs,
  duplicateRefs,
  gateAt,
  liveRefs,
  moverOf,
  moveRefs,
  refKey,
  removeMoverPoint,
  rotateRefs,
  scaleRefs,
  setFinish,
  setMoverPoint,
  setPortal,
  setStart,
  toCustomDoc,
  unfinishedNotes,
  updateBlock,
  type EditDoc,
  type Ref,
  type V3,
} from './model';
import { boxBounds, pickNearest } from './pick';
import { rampGroups } from './ramps';
import { CONNECT_DIST, connectSnap } from './connect-snap';
import { structureKeys, type StructItem } from './structure';
import { placeInAir, placeOnSurface } from './snap';
import { BLOCK_BRUSHES, blockBrush, makeBlock, type BrushId } from './palette';
import {
  curveEndLocal,
  fitWave,
  localToWorld,
  posKeepingStart,
  solveCurveEnd,
  worldToLocal,
  type Curve,
} from './curve-edit';
import { blockBoxes, piece, sceneData, volumeBox, SPAWN_BOX, type PickPiece } from './scene-data';
import { EditorViewport, type EditorLook } from './viewport';
import { saveDraft, type CameraState, type EditorSession } from './session';
import { EditorUI } from './ui';
import { quickTestKey } from './quick-test';
import { QuickTester } from './test-mode';

export type Tool =
  | { k: 'select' }
  | { k: 'place'; brush: BrushId }
  /** placing a portal's exit (after its entry) */
  | { k: 'portalExit'; i: number }
  /** placing the next point of a moving block */
  | { k: 'moverPoint'; id: number }
  /** the selection follows where you aim; click to drop it */
  | { k: 'grab'; start: EditDoc; refs: Ref[] };

/** A left mouse press: a click, or the start of a drag (move or box-select). */
interface DownState {
  x: number;
  y: number;
  ref: Ref | null;
  point: V3 | null;
  shift: boolean;
  dragging: 'move' | 'box' | null;
  moveStart?: EditDoc;
  moveRefs?: Ref[];
  adopted?: boolean;
  /** the moving pieces where the drag started (for the connect magnet) */
  template?: BoxDef[];
  /** dragging a curve handle */
  handle?: { kind: 'end' | 'height'; id: number; start: EditDoc; pos: V3 };
}

interface Aim {
  /** what the ray hit (null: the sky) */
  hit: { point: V3; normal: V3; piece: PickPiece } | null;
  origin: V3;
  dir: V3;
}

/** What the next click would place (and its ghost). */
interface Placement {
  boxes: BoxDef[];
  ok: boolean;
  why?: string;
  /** the grid shows at this height */
  floor: V3;
  apply: (e: EditDoc) => { doc: EditDoc; select: Ref[] };
}

export interface EditorHooks {
  /** leave the editor (back to the Map Maker's start screen) */
  exit: () => void;
  /** open the editor again on this session (after a test run), with a message to show */
  reopen: (notice?: string) => void;
}

const BASE_SPEED = 12;
/** the climb handle floats this high over the curve's end */
const HANDLE_UP = 2.5;
const DEG = Math.PI / 180;
const r3 = (a: V3): V3 => a.map((x) => Math.round(x * 1000) / 1000) as V3;
const snap90 = (h: number): number => Math.round(h / 90) * 90;

export class MapEditor {
  view: EditorViewport;
  ui: EditorUI;
  /** the built-in map this doc edits (patch docs) */
  baseDef: LevelDef | null = null;
  baseName = '';
  private base: { fingerprint: string; box: BoxDef }[] = [];
  /**
   * the built-in map's curved ramps (free-form prisms, BoxDef.hull): each ramp's pieces (they
   * share the exact corners of their joints) — a click takes the whole ramp. They can be
   * deleted, not changed (no block shape holds them).
   */
  private rampOfFp = new Map<string, number>();
  private rampFps: string[][] = [];
  private baseByFp = new Map<string, BoxDef[]>();
  private basePieces: PickPiece[] = [];
  private baseKey = '';
  pieces: PickPiece[] = [];
  selection: Ref[] = [];
  tool: Tool = { k: 'select' };
  // palette choices
  material: CustomMaterial = 'concrete';
  /** null: the material's own colour */
  color: number | null = null;
  grid = 1;
  /** extra turn of the next placed thing (R), degrees */
  yawOffset = 0;
  /** the next piece's size and curve, per brush (the palette's defaults until changed) */
  private brushSize = new Map<BrushId, V3>();
  private brushCurve = new Map<BrushId, Curve>();
  /** the drag handles of a selected curve (end: turn + radius, height: climb / drop) */
  handles: { kind: 'end' | 'height'; pos: V3 }[] = [];
  // camera
  cam: CameraState = { pos: [0, 10, 20], heading: 0, pitch: -20 };
  flySpeed = 1;
  private held = new Set<string>();
  private mouse = { x: 0, y: 0, inCanvas: false };
  private looking = false;
  /** Tab: the mouse stays locked (aim with the centre dot) */
  lockMode = false;
  private aim: Aim | null = null;
  private hoverKey = '';
  private ghostKey = '';
  private placement: Placement | null = null;
  private down: DownState | null = null;
  private dragN = 0;
  private autosaveTimer = 0;
  private checkTimer = 0;
  /** problems the game would refuse, and unfinished things it would leave out */
  errors: string[] = [];
  notes: string[] = [];
  private disposed = false;
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
  /** the instant Build ⇄ Test toggle (T; editor/test-mode.ts) */
  readonly quick: QuickTester;
  /** testing: the editor waits hidden, everything kept (suspend / resume) */
  suspended = false;

  /** the phone / tablet editor (editor/touch-ui.ts): taps, holds, a stick; no mouse or keys */
  readonly touch: boolean;
  /** touch: the stick (x right, y forward, -1..1) and the fly up / down buttons (-1, 0, 1) */
  touchMove = { x: 0, y: 0 };
  touchFly = 0;
  /** touch: the fast-fly toggle */
  touchFast = false;
  private flashTimer = 0;
  /** pieces the aim looks through (the ones being dragged) */
  private dragIgnore: Set<string> | null = null;
  /** "Just this piece": drags, the move pad and turning leave the rest of the structure */
  justThis = readJustThis();
  /** a touch drag of a piece (its whole structure) under way */
  private fdrag: {
    start: EditDoc;
    refs: Ref[];
    template: BoxDef[];
    key: string;
    lift: number;
    at: [number, number] | null;
    last: [number, number];
    /** the grabbed point on the piece (the drag slides level through it) */
    point: V3;
  } | null = null;
  private connectTimer = 0;

  constructor(
    public app: App,
    public session: EditorSession,
    public hooks: EditorHooks,
    opts: { touch?: boolean } = {},
  ) {
    this.touch = !!opts.touch;
    const doc = this.doc;
    // (a removed built-in map is never loaded as another one: the start screen refuses to open
    // it, and here it just has no base map)
    if (doc.patch && doc.base && mapExists(doc.base)) {
      try {
        this.base = baseBoxesForEditor(doc.base);
        this.baseDef = mapDef(doc.base);
        this.baseName = getMap(doc.base).name;
      } catch {
        this.base = [];
      }
      for (const b of this.base) {
        const list = this.baseByFp.get(b.fingerprint) ?? [];
        list.push(b.box);
        this.baseByFp.set(b.fingerprint, list);
      }
      this.rampFps = rampGroups(this.base);
      this.rampFps.forEach((fps, i) => fps.forEach((fp) => this.rampOfFp.set(fp, i)));
    } else if (doc.patch && doc.base) this.baseName = 'a removed map';
    this.view = new EditorViewport(app.renderer);
    // phones: a shorter view distance keeps big maps smooth
    if (this.touch) this.view.camera.far = 1200;
    this.view.setLook(this.look());
    this.cam = session.camera ?? this.startCamera();
    this.quick = new QuickTester(this);
    this.ui = new EditorUI(this);
    this.attach();
    this.sync();
    this.view.resize(window.innerWidth, window.innerHeight);
    app.editorView = this;
    app.setScreen(this.ui.root, 'fade');
    setLeaveGuard(true);
  }

  get doc(): EditDoc {
    return this.session.history.current;
  }

  get isPatch(): boolean {
    return !!this.doc.patch;
  }

  // -------------------------------------------------------------------------------------------
  // setup

  private look(): EditorLook {
    const d = this.baseDef;
    const lk = d ?? customSkyLook(this.doc.sky);
    const centre: [number, number, number] = d
      ? [
          (d.boundsMin.x + d.boundsMax.x) / 2,
          (d.boundsMin.y + d.boundsMax.y) / 2,
          (d.boundsMin.z + d.boundsMax.z) / 2,
        ]
      : [0, 0, 0];
    return { outdoor: lk.outdoor, sky: lk.sky, fog: lk.fog, centre };
  }

  /** Reload the sky (the map's sky setting changed). */
  refreshLook(): void {
    this.view.setLook(this.look());
  }

  /** Where the camera starts: behind the first spawn (or the race start), a little above. */
  private startCamera(): CameraState {
    const d = this.doc;
    const s = d.race.start
      ? { pos: d.race.start.pos, yaw: d.race.start.yaw }
      : d.spawns[0]
        ? { pos: d.spawns[0].pos, yaw: d.spawns[0].yaw }
        : this.baseDef?.spawns[0]
          ? {
              pos: [
                this.baseDef.spawns[0].pos.x,
                this.baseDef.spawns[0].pos.y,
                this.baseDef.spawns[0].pos.z,
              ] as V3,
              yaw: -this.baseDef.spawns[0].yawDeg,
            }
          : { pos: [0, 0, 0] as V3, yaw: 0 };
    const a = s.yaw * DEG;
    return {
      pos: r3([s.pos[0] - Math.sin(a) * 8, s.pos[1] + 5, s.pos[2] + Math.cos(a) * 8]),
      heading: s.yaw,
      pitch: -18,
    };
  }

  private on<K extends string>(
    target: EventTarget,
    type: K,
    fn: (e: Event) => void,
    opts?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, fn, opts);
    this.listeners.push([target, type, fn, opts]);
  }

  private attach(): void {
    const canvas = this.app.canvas;
    this.on(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.on(window, 'keyup', (e) => this.held.delete((e as KeyboardEvent).code));
    this.on(window, 'blur', () => {
      this.held.clear();
      this.endDrag();
    });
    this.on(canvas, 'mousedown', (e) => this.onMouseDown(e as MouseEvent));
    this.on(window, 'mouseup', (e) => this.onMouseUp(e as MouseEvent));
    this.on(window, 'mousemove', (e) => this.onMouseMove(e as MouseEvent));
    this.on(canvas, 'mouseleave', () => (this.mouse.inCanvas = false));
    this.on(canvas, 'wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.on(canvas, 'contextmenu', (e) => e.preventDefault());
    this.on(document, 'pointerlockchange', () => {
      if (document.pointerLockElement !== canvas) {
        this.looking = false;
        if (this.lockMode) {
          this.lockMode = false;
          this.ui.refreshMode();
        }
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.quick.dispose();
    this.disposed = true;
    this.session.camera = { ...this.cam };
    saveDraft(this.session);
    window.clearTimeout(this.autosaveTimer);
    window.clearTimeout(this.checkTimer);
    window.clearTimeout(this.flashTimer);
    window.clearTimeout(this.connectTimer);
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts);
    if (document.pointerLockElement) document.exitPointerLock();
    this.app.canvas.style.cursor = '';
    if (this.app.editorView === this) this.app.editorView = null;
    this.view.dispose();
    this.ui.dispose();
    setLeaveGuard(false);
  }

  /**
   * A test run starts (editor/test-mode.ts): the editor stops listening and hides, keeping the
   * doc, undo history, selection, tool and its 3D view. The draft is saved, just in case.
   */
  suspend(): void {
    this.suspended = true;
    this.held.clear();
    this.endDrag();
    this.rightDown = null;
    this.fdrag = null;
    this.touchMove = { x: 0, y: 0 };
    this.touchFly = 0;
    this.ui.setHoverText('');
    if (this.lockMode) {
      this.lockMode = false;
      this.ui.refreshMode();
    }
    window.clearTimeout(this.autosaveTimer);
    this.session.camera = { ...this.cam };
    saveDraft(this.session);
  }

  /** Back from a test run: the camera at `cam` (where your eyes were), the editor as it was. */
  resume(cam: CameraState | null): void {
    if (this.disposed) return;
    this.suspended = false;
    if (cam) this.cam = { pos: [...cam.pos] as V3, heading: cam.heading, pitch: cam.pitch };
    this.hoverKey = '';
    this.ghostKey = '';
    this.app.editorView = this;
    this.app.setScreen(this.ui.root, 'none');
    this.view.resize(window.innerWidth, window.innerHeight);
    setLeaveGuard(true);
  }

  // -------------------------------------------------------------------------------------------
  // changes

  /** Apply a new doc (one undo step; the same mergeKey as the last change merges into it). */
  commit(doc: EditDoc, mergeKey: string | null = null, select?: Ref[]): void {
    if (doc === this.doc && !select) return;
    this.session.history.push(doc, mergeKey);
    if (select) this.selection = select;
    this.sync();
  }

  undo(): void {
    if (!this.session.history.canUndo) return this.ui.toast('Nothing to undo');
    this.session.history.undo();
    this.cancelTool();
    this.sync();
  }

  redo(): void {
    if (!this.session.history.canRedo) return this.ui.toast('Nothing to redo');
    this.session.history.redo();
    this.cancelTool();
    this.sync();
  }

  /** Everything follows the doc: the view, what can be clicked, the panels, checks, draft. */
  sync(): void {
    const doc = this.doc;
    const removed = doc.patch?.removed ?? [];
    const key = `${removed.length}|${removed.join(';')}|${this.view.showHidden}`;
    if (key !== this.baseKey) {
      this.baseKey = key;
      const gone = new Set(removed);
      const live = this.base.filter((b) => !gone.has(b.fingerprint));
      const visible = live.filter((b) => this.view.showHidden || !b.box.noRender);
      this.basePieces = visible.map((b) => piece({ k: 'base', fp: b.fingerprint }, b.box));
      this.view.setBase(visible.map((b) => b.box));
    }
    const sd = sceneData(doc, (r) => this.isSelected(r), this.baseDef);
    this.view.setDoc(sd.docBoxes);
    this.view.setMovers(sd.movers);
    this.view.setMarkers(sd.markers);
    this.pieces = this.basePieces.concat(sd.pieces);
    this.selection = liveRefs(doc, this.selection, (fp) => this.baseByFp.has(fp));
    this.hoverKey = '';
    this.ghostKey = '';
    this.refreshSelection();
    this.updateHandles();
    this.ui.refreshTop();
    this.scheduleChecks();
    window.clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => {
      this.session.camera = { ...this.cam };
      saveDraft(this.session);
    }, 800);
  }

  private scheduleChecks(): void {
    window.clearTimeout(this.checkTimer);
    this.checkTimer = window.setTimeout(() => this.runChecks(), 350);
  }

  /** Run the game's own checks now (before saving / testing too). */
  runChecks(): boolean {
    window.clearTimeout(this.checkTimer);
    const v = validateCustomMap(toCustomDoc(this.doc));
    this.errors = v.ok ? [] : v.errors;
    this.notes = unfinishedNotes(this.doc);
    this.ui.refreshStatus();
    return v.ok;
  }

  pieceCount(): number {
    return countPieces(this.doc);
  }

  get maxPieces(): number {
    return CUSTOM_MAP_LIMITS.maxPieces;
  }

  // -------------------------------------------------------------------------------------------
  // selection

  isSelected(r: Ref): boolean {
    const k = refKey(r);
    return this.selection.some((s) => refKey(s) === k);
  }

  select(refs: Ref[]): void {
    this.selection = refs;
    this.refreshSelection();
    this.updateHandles();
    // numbered labels of a selected moving block turn yellow
    this.view.setMovers(sceneData(this.doc, (r) => this.isSelected(r), this.baseDef).movers);
  }

  private refreshSelection(): void {
    const keys = new Set(this.selection.map(refKey));
    this.view.setSelection(this.pieces.filter((p) => keys.has(refKey(p.ref))).map((p) => p.box));
    this.ui.refreshInspector();
  }

  /** The boxes of one thing (a block's pieces, a gate's volume...). */
  boxesOf(r: Ref): BoxDef[] {
    const k = refKey(r);
    return this.pieces.filter((p) => refKey(p.ref) === k).map((p) => p.box);
  }

  /**
   * Built-in boxes in the selection become blocks of this doc (they can't move otherwise): same
   * box, now editable. Returns the refs to use.
   */
  adoptSelection(refs = this.selection, mergeKey: string | null = null): Ref[] {
    const bases = refs.filter((r) => r.k === 'base') as { k: 'base'; fp: string }[];
    if (!bases.length) return refs;
    const items: { fp: string; block: Omit<CustomBlock, 'id'> }[] = [];
    const skipped: Ref[] = [];
    for (const r of bases) {
      for (const box of this.baseByFp.get(r.fp) ?? []) {
        const block = baseBoxToBlock(box);
        if (block) items.push({ fp: r.fp, block });
        else skipped.push(r);
      }
    }
    if (!items.length) {
      this.ui.toast("Curved ramps can't be moved or changed, only deleted");
      return refs;
    }
    const res = adoptBaseBoxes(this.doc, items);
    const others = refs.filter((r) => r.k !== 'base');
    const out = [...others, ...res.refs, ...skipped];
    this.commit(res.doc, mergeKey, out);
    if (skipped.length) this.ui.toast("Curved ramps can't be moved or changed, only deleted");
    return out;
  }

  deleteSelection(): void {
    if (!this.selection.length) return this.ui.toast('Nothing selected');
    const n = this.selection.length;
    const ramps = this.rampSelection();
    this.commit(deleteRefs(this.doc, this.selection), null, []);
    this.ui.toast(
      ramps?.whole
        ? `Deleted ${ramps.ramps === 1 ? 'the curved ramp' : `${ramps.ramps} curved ramps`} · Ctrl+Z undoes it`
        : n === 1
          ? 'Deleted'
          : `Deleted ${n} things`,
    );
  }

  // curved ramps of the built-in map

  /** Is this a piece of one of the built-in map's curved ramps? */
  isRampPiece(r: Ref): boolean {
    return r.k === 'base' && this.rampOfFp.has(r.fp);
  }

  /** The pieces (still there) of the curved ramp `r` belongs to (just `r` for anything else). */
  rampOf(r: Ref): Ref[] {
    const i = r.k === 'base' ? this.rampOfFp.get(r.fp) : undefined;
    if (i === undefined) return [r];
    const gone = new Set(this.doc.patch?.removed ?? []);
    return this.rampFps[i].filter((fp) => !gone.has(fp)).map((fp) => ({ k: 'base', fp }));
  }

  /** What a click on `r` selects: a curved ramp whole (not with Alt or "Just this piece"). */
  clickGroup(r: Ref, single = false): Ref[] {
    return single || this.justThis ? [r] : this.rampOf(r);
  }

  /**
   * The selection when it is only curved-ramp pieces: how many ramps they belong to, how many
   * pieces, and whether each of those ramps is selected whole (null: something else too).
   */
  rampSelection(): { ramps: number; pieces: number; whole: boolean } | null {
    const s = this.selection;
    if (!s.length || !s.every((r) => this.isRampPiece(r))) return null;
    const ids = new Set(s.map((r) => this.rampOfFp.get((r as { fp: string }).fp)!));
    const all = [...ids].reduce(
      (n, i) => n + this.rampOf({ k: 'base', fp: this.rampFps[i][0] }).length,
      0,
    );
    return { ramps: ids.size, pieces: s.length, whole: all === s.length };
  }

  /** Only curved-ramp pieces selected: say they can only be deleted (true: stop there). */
  private rampOnly(): boolean {
    if (!this.rampSelection()) return false;
    this.ui.toast("Curved ramps can't be moved or changed, only deleted (Delete / X)", 'ramp');
    return true;
  }

  /** Select the whole curved ramps of the selected pieces. */
  selectWholeRamps(): void {
    const seen = new Set<string>();
    const out: Ref[] = [];
    for (const r of this.selection)
      for (const p of this.rampOf(r)) {
        const k = refKey(p);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(p);
        }
      }
    this.select(out);
  }

  duplicateSelection(): void {
    if (!this.selection.length) return this.ui.toast('Nothing selected');
    if (this.rampOnly()) return;
    const refs = this.adoptSelection();
    const off: V3 = [this.grid * Math.max(1, Math.round(2 / this.grid)), 0, 0];
    const res = duplicateRefs(this.doc, refs, off);
    this.commit(res.doc, null, res.refs);
    this.ui.toast('Copied (it is 2 m to the side)');
  }

  rotateSelection(deg: number): void {
    if (this.tool.k === 'place' || this.tool.k === 'moverPoint') {
      this.yawOffset = (this.yawOffset + deg + 360) % 360;
      this.ghostKey = '';
      return;
    }
    if (!this.selection.length || this.rampOnly()) return;
    this.expandToStructure();
    const refs = this.adoptSelection();
    this.commit(rotateRefs(this.doc, refs, deg), `rotate:${refs.map(refKey).join()}`);
  }

  scaleSelection(k: number): void {
    if (this.tool.k === 'place') {
      const b = this.tool.brush;
      const cur = this.brushSettings(b);
      if (!cur) return;
      this.setBrushSettings(b, {
        size: cur.size.map((s, i) =>
          cur.curve && i === 2 ? s : Math.max(0.1, Math.min(200, Math.round(s * k * 100) / 100)),
        ) as V3,
        ...(cur.curve
          ? {
              curve: {
                ...cur.curve,
                radius: Math.max(2, Math.round(cur.curve.radius * k * 2) / 2),
                ...(cur.curve.endRadius !== undefined
                  ? { endRadius: Math.max(2, Math.round(cur.curve.endRadius * k * 2) / 2) }
                  : {}),
              },
            }
          : {}),
      });
      return;
    }
    if (!this.selection.length) return;
    if (this.rampOnly()) return;
    const refs = this.adoptSelection();
    this.commit(scaleRefs(this.doc, refs, k), `scale:${refs.map(refKey).join()}`);
  }

  /** Move the selection by `d` (arrow keys). */
  nudge(d: V3): void {
    if (!this.selection.length || this.rampOnly()) return;
    this.expandToStructure();
    const refs = this.adoptSelection();
    this.commit(moveRefs(this.doc, refs, d), `nudge:${refs.map(refKey).join()}`);
  }

  /** Fly to the selection. */
  focusSelection(): void {
    const boxes = this.selection.flatMap((r) => this.boxesOf(r));
    if (!boxes.length) return;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const p of this.pieces)
      if (boxes.includes(p.box)) {
        min[0] = Math.min(min[0], p.min.x);
        min[1] = Math.min(min[1], p.min.y);
        min[2] = Math.min(min[2], p.min.z);
        max[0] = Math.max(max[0], p.max.x);
        max[1] = Math.max(max[1], p.max.y);
        max[2] = Math.max(max[2], p.max.z);
      }
    const c: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const size = Math.max(3, max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const dist = size * 0.9 + 4;
    const a = this.cam.heading * DEG;
    const p = this.cam.pitch * DEG;
    this.cam.pos = r3([
      c[0] - Math.sin(a) * Math.cos(p) * dist,
      c[1] - Math.sin(p) * dist,
      c[2] + Math.cos(a) * Math.cos(p) * dist,
    ]);
  }

  // -------------------------------------------------------------------------------------------
  // tools

  setTool(t: Tool): void {
    if (this.tool.k === 'grab' && t.k !== 'grab') this.cancelGrab();
    this.tool = t;
    this.ghostKey = '';
    this.placement = null;
    this.view.setGhost(null);
    this.view.setGrid(null, this.grid);
    this.ui.refreshMode();
  }

  setBrush(b: BrushId | 'select'): void {
    if (b === 'select') return this.setTool({ k: 'select' });
    const brush = blockBrush(b);
    // a brush with its own material (glass, kill paint) doesn't change the palette's
    if (brush && !brush.mat && this.material === 'glass') this.material = 'concrete';
    this.yawOffset = 0;
    this.setTool({ k: 'place', brush: b });
  }

  /** The next piece of a block brush: its size and (curves) curve. */
  brushSettings(id: BrushId): { size: V3; curve?: Curve } | null {
    const bb = blockBrush(id);
    if (!bb) return null;
    const size = this.brushSize.get(id) ?? bb.size;
    const curve =
      bb.curve || isCurveShape(bb.shape)
        ? (this.brushCurve.get(id) ?? {
            kind: 'arc' as const,
            ...(bb.curve ?? { radius: 4, angle: 90 }),
          })
        : undefined;
    return { size: [...size] as V3, ...(curve ? { curve: { ...curve } } : {}) };
  }

  setBrushSettings(id: BrushId, c: { size?: V3; curve?: Curve }): void {
    if (c.size) this.brushSize.set(id, c.size);
    if (c.curve) this.brushCurve.set(id, c.curve);
    // a wave stays within what the game allows (radius, turn, height... change the limit)
    const bb = blockBrush(id);
    const cur = this.brushSettings(id);
    if (bb && cur?.curve) {
      const fitted = fitWave({
        shape: bb.shape,
        pos: [0, 0, 0],
        size: cur.size,
        mat: 'concrete',
        curve: cur.curve,
      });
      if (fitted.curve) this.brushCurve.set(id, fitted.curve);
    }
    this.ghostKey = '';
    this.ui.refreshInspector();
  }

  /** "The next one like the last one": a curve you changed becomes its brush's setting. */
  rememberCurve(b: CustomBlock): void {
    const brush = BLOCK_BRUSHES.find((x) => x.shape === b.shape && isCurveShape(x.shape));
    if (!brush || !b.curve) return;
    this.brushCurve.set(brush.id, { ...b.curve });
    this.brushSize.set(brush.id, [...b.size] as V3);
  }

  /** A palette choice changed (material, colour, grid): redraw the ghost. */
  setBrushRefresh(): void {
    this.ghostKey = '';
  }

  /** Esc / right-click: stop what you are doing. */
  cancelTool(): boolean {
    if (this.tool.k === 'grab') {
      this.cancelGrab();
      this.setTool({ k: 'select' });
      return true;
    }
    if (this.tool.k !== 'select') {
      this.setTool({ k: 'select' });
      return true;
    }
    return false;
  }

  private cancelGrab(): void {
    if (this.tool.k !== 'grab') return;
    const start = this.tool.start;
    if (this.doc !== start) {
      this.session.history.undo();
      this.sync();
    }
    this.tool = { k: 'select' };
  }

  /** G: the selection follows your aim until you click. */
  startGrab(): void {
    if (!this.selection.length) return this.ui.toast('Select something first');
    if (this.rampOnly()) return;
    const refs = this.adoptSelection();
    this.session.history.seal();
    this.setTool({ k: 'grab', start: this.doc, refs });
  }

  /** "Make it move": the block is point 1; now click to place point 2. */
  makeMove(id: number): void {
    const doc = this.doc;
    if (moverOf(doc, id)) return this.addPoint(id);
    if (doc.movers.length >= CUSTOM_MAP_LIMITS.movers)
      return this.ui.toast(`A map can have ${CUSTOM_MAP_LIMITS.movers} moving blocks at most`);
    const b = blockById(doc, id);
    if (!b) return;
    this.commit(
      { ...doc, movers: [...doc.movers, { block: id, points: [b.pos], speed: 4, delay: 1 }] },
      null,
      [{ k: 'block', id }],
    );
    this.addPoint(id);
  }

  addPoint(id: number): void {
    const m = moverOf(this.doc, id);
    if (!m) return;
    if (m.points.length >= CUSTOM_MAP_LIMITS.moverPoints[1])
      return this.ui.toast('4 points is the most (it goes back to 1 after 4)');
    this.setTool({ k: 'moverPoint', id });
    // (touch: the sheet steps aside so the next tap can place the point)
    if (this.touch) this.ui.closeSheet();
    this.ui.toast(`${this.touch ? 'Tap' : 'Click'} where point ${m.points.length + 1} goes`);
  }

  // -------------------------------------------------------------------------------------------
  // frame

  frame(dt: number): void {
    if (this.disposed) return;
    // a test run ended without telling us (the game was stopped): back to building
    if (this.suspended) {
      this.quick.back();
      if (this.suspended) this.resume(null);
      return;
    }
    // another screen took over (an invite into a game, the title...): close, keeping the draft
    if (!this.ui.root.isConnected) return this.dispose();
    this.moveCamera(dt);
    const cam = this.view.camera;
    cam.position.set(...this.cam.pos);
    cam.rotation.set(this.cam.pitch * DEG, -this.cam.heading * DEG, 0, 'YXZ');
    cam.fov = this.app.settings.fov ?? 90;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // (touch: no hover or ghost following a pointer; taps aim for themselves)
    if (this.fdrag?.at) this.applyTouchDrag();
    if (!this.touch) {
      this.updateAim();
      this.updateTool();
    }
    this.view.frame(dt);
    this.ui.frame();
  }

  resize(w: number, h: number): void {
    this.view.resize(w, h);
  }

  private moveCamera(dt: number): void {
    const k = this.held;
    const typing = isTyping();
    if (typing) return;
    const ctrl = k.has('ControlLeft') || k.has('ControlRight');
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + this.touchMove.y;
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.touchMove.x;
    const u =
      (k.has('Space') || k.has('KeyE') ? 1 : 0) -
      (k.has('KeyC') || k.has('KeyQ') || ctrl ? 1 : 0) +
      this.touchFly;
    if (!f && !r && !u) return;
    const fast = k.has('ShiftLeft') || k.has('ShiftRight') || this.touchFast ? 3 : 1;
    const speed = BASE_SPEED * this.flySpeed * fast * dt;
    const a = this.cam.heading * DEG;
    const p = this.cam.pitch * DEG;
    // forward follows where you look (up and down too); strafing stays level
    const fw: V3 = [Math.sin(a) * Math.cos(p), Math.sin(p), -Math.cos(a) * Math.cos(p)];
    const rt: V3 = [Math.cos(a), 0, Math.sin(a)];
    const pos = this.cam.pos;
    for (let i = 0; i < 3; i++) pos[i] += (fw[i] * f + rt[i] * r + (i === 1 ? u : 0)) * speed;
    const lim = CUSTOM_MAP_LIMITS.maxCoord + 60;
    for (let i = 0; i < 3; i++) pos[i] = Math.max(-lim, Math.min(lim, pos[i]));
  }

  /** The ray under the mouse (or the centre dot while the mouse is locked). */
  private updateAim(): void {
    const locked = document.pointerLockElement === this.app.canvas;
    let ndc: [number, number] | null = null;
    if (locked) ndc = [0, 0];
    else if (!locked && this.mouse.inCanvas) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ndc = [(this.mouse.x / w) * 2 - 1, -(this.mouse.y / h) * 2 + 1];
    }
    if (!ndc) {
      this.aim = null;
      return;
    }
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(ndc[0], ndc[1]), this.view.camera);
    const o = rc.ray.origin;
    const d = rc.ray.direction;
    const origin: V3 = [o.x, o.y, o.z];
    const dir: V3 = [d.x, d.y, d.z];
    // while grabbing, the grabbed things don't block the aim
    const grabbed = this.tool.k === 'grab' ? new Set(this.tool.refs.map(refKey)) : null;
    const moving = this.tool.k === 'moverPoint' ? `point:${this.tool.id}:` : null;
    const hit = pickNearest(v3(...origin), v3(...dir), this.pieces, 1500, (i) => {
      const r = this.pieces[i].ref;
      if (grabbed?.has(refKey(r))) return true;
      if (this.dragIgnore?.has(refKey(r))) return true;
      if (moving && refKey(r).startsWith(moving)) return true;
      return false;
    });
    this.aim = {
      origin,
      dir,
      hit: hit
        ? {
            point: [o.x + d.x * hit.t, o.y + d.y * hit.t, o.z + d.z * hit.t],
            normal: [hit.n.x, hit.n.y, hit.n.z],
            piece: this.pieces[hit.i],
          }
        : null,
    };
  }

  /** Hover outline, the placement ghost, the grab. */
  private updateTool(): void {
    const aim = this.aim;
    const t = this.tool;
    if (t.k === 'select') {
      const hd =
        this.handles.length && this.mouse.inCanvas && !this.down
          ? this.handleAt(this.mouse.x, this.mouse.y)
          : null;
      const ref = this.down?.dragging || hd ? null : (aim?.hit?.piece.ref ?? null);
      const key = hd ? `handle:${hd.kind}` : ref ? refKey(ref) : '';
      if (key !== this.hoverKey) {
        this.hoverKey = key;
        this.view.setHover(ref && !this.isSelected(ref) ? this.boxesOf(ref) : []);
        this.ui.setHoverText(
          hd
            ? hd.kind === 'end'
              ? 'Drag to bend the curve (turn and radius)'
              : 'Drag up or down: the end climbs or drops'
            : ref
              ? this.describe(ref)
              : '',
        );
        this.app.canvas.style.cursor = hd ? 'grab' : '';
      }
      return;
    }
    if (this.hoverKey) {
      this.hoverKey = '';
      this.view.setHover([]);
      this.ui.setHoverText('');
    }
    if (!aim) {
      if (this.ghostKey !== 'none') {
        this.ghostKey = 'none';
        this.placement = null;
        this.view.setGhost(null);
        this.view.setGrid(null, this.grid);
      }
      return;
    }
    const pl = this.computePlacement(aim);
    const key = pl ? JSON.stringify([pl.boxes.map((b) => [b.c, b.h, b.q]), pl.ok]) : 'x';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.placement = pl;
    if (t.k === 'grab') {
      // the grabbed things themselves move (no ghost)
      if (pl) {
        const res = pl.apply(t.start);
        if (res.doc !== this.doc) this.commit(res.doc, 'grab');
      }
      this.view.setGhost(null);
    } else this.view.setGhost(pl?.boxes ?? null, pl?.ok ?? true);
    this.view.setGrid(pl ? pl.floor : null, this.grid);
  }

  /** Where the thing to place goes: flush on the surface aimed at, on the grid. */
  private placeAt(aim: Aim, template: BoxDef[]): { pos: V3; floor: V3 } {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const b of template) {
      const p = piece({ k: 'start' }, b);
      min[0] = Math.min(min[0], p.min.x);
      min[1] = Math.min(min[1], p.min.y);
      min[2] = Math.min(min[2], p.min.z);
      max[0] = Math.max(max[0], p.max.x);
      max[1] = Math.max(max[1], p.max.y);
      max[2] = Math.max(max[2], p.max.z);
    }
    if (!template.length) {
      min.fill(0);
      max.fill(0);
    }
    const half: V3 = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
    const off: V3 = [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2];
    let c: V3;
    if (aim.hit) c = placeOnSurface(aim.hit.point, aim.hit.normal, half, this.grid);
    else {
      const d = 14;
      c = placeInAir(
        [
          aim.origin[0] + aim.dir[0] * d,
          aim.origin[1] + aim.dir[1] * d,
          aim.origin[2] + aim.dir[2] * d,
        ],
        half,
        this.grid,
      );
    }
    const pos = r3([c[0] - off[0], c[1] - off[1], c[2] - off[2]]);
    return { pos, floor: [c[0], c[1] - half[1], c[2]] };
  }

  /** Default facing of a new thing: toward you for ramps, away from you for the rest. */
  private placeYaw(brush: BrushId | null): number {
    const base = snap90(this.cam.heading);
    const y = ((base + (brush === 'wedge' ? 180 : 0) + this.yawOffset + 540) % 360) - 180;
    return y === -180 ? 180 : y;
  }

  private computePlacement(aim: Aim): Placement | null {
    const t = this.tool;
    const doc = this.doc;
    if (t.k === 'place') {
      const bb = blockBrush(t.brush);
      const yaw = this.placeYaw(t.brush);
      if (bb) {
        const { size, curve } = this.brushSettings(t.brush)!;
        const make = (pos: V3) => makeBlock(bb, pos, yaw, this.material, this.color, size, curve);
        const template = blockBoxes({ ...make([0, 0, 0]), id: -1 } as CustomBlock);
        const { pos, floor } = this.placeAt(aim, template);
        const block = make(pos);
        const boxes = blockBoxes({ ...block, id: -1 } as CustomBlock);
        const over = this.pieceCount() + boxes.length > CUSTOM_MAP_LIMITS.maxPieces;
        return {
          boxes,
          floor,
          ok: !over,
          why: over ? `The map is full (${CUSTOM_MAP_LIMITS.maxPieces} pieces)` : undefined,
          apply: (e) => {
            const res = addBlocks(e, [block]);
            return { doc: res.doc, select: [{ k: 'block', id: res.ids[0] }] };
          },
        };
      }
      if (t.brush === 'start' || t.brush === 'finish' || t.brush === 'checkpoint') {
        const g = gateAt([0, 0, 0], yaw);
        const { pos, floor } = this.placeAt(aim, [volumeBox(g.pos, g.size, g.yaw)]);
        const gate = { ...g, pos };
        const full =
          t.brush === 'checkpoint' && doc.race.checkpoints.length >= CUSTOM_MAP_LIMITS.checkpoints;
        return {
          boxes: [volumeBox(pos, g.size, g.yaw)],
          floor,
          ok: !full,
          why: full ? `${CUSTOM_MAP_LIMITS.checkpoints} checkpoints is the most` : undefined,
          apply: (e) =>
            t.brush === 'start'
              ? { doc: setStart(e, gate), select: [{ k: 'start' }] }
              : t.brush === 'finish'
                ? { doc: setFinish(e, gate), select: [{ k: 'finish' }] }
                : {
                    doc: addCheckpoint(e, gate),
                    select: [{ k: 'cp', i: e.race.checkpoints.length }],
                  },
        };
      }
      if (t.brush === 'spawn') {
        const tpl = volumeBox([0, SPAWN_BOX[1] / 2, 0], SPAWN_BOX, yaw);
        const { pos, floor } = this.placeAt(aim, [tpl]);
        return {
          boxes: [volumeBox([pos[0], pos[1] + SPAWN_BOX[1] / 2, pos[2]], SPAWN_BOX, yaw)],
          floor,
          ok: true,
          apply: (e) => ({
            doc: addSpawn(e, { pos, yaw }),
            select: [{ k: 'spawn', i: e.spawns.length }],
          }),
        };
      }
      if (t.brush === 'portal') {
        const probe = addPortal(doc, [0, 0, 0], [0, 0, 0], yaw).portals.at(-1)!;
        const { pos, floor } = this.placeAt(aim, [volumeBox([0, 0, 0], probe.from.size)]);
        const full = doc.portals.length >= CUSTOM_MAP_LIMITS.portals;
        return {
          boxes: [volumeBox(pos, probe.from.size)],
          floor,
          ok: !full,
          why: full ? `${CUSTOM_MAP_LIMITS.portals} portals is the most` : undefined,
          apply: (e) => {
            // the exit starts a little in front; the next click places it
            const a = yaw * DEG;
            const to = r3([pos[0] + Math.sin(a) * 6, pos[1], pos[2] - Math.cos(a) * 6]);
            return { doc: addPortal(e, pos, to, yaw), select: [] };
          },
        };
      }
      if (t.brush === 'pad') {
        const { pos, floor } = this.placeAt(aim, [volumeBox([0, 0, 0], [2.5, 0.4, 2.5])]);
        return {
          boxes: [volumeBox(pos, [2.5, 0.4, 2.5])],
          floor,
          ok: true,
          apply: (e) => ({
            doc: addPad(e, pos, yaw),
            select: [{ k: 'pad', i: e.launchPads.length }],
          }),
        };
      }
      return null;
    }
    if (t.k === 'portalExit') {
      const p = doc.portals[t.i];
      if (!p) return null;
      const size: V3 = p.twoWay ? p.from.size : [0.8, 1.8, 0.8];
      const { pos, floor } = this.placeAt(aim, [volumeBox([0, 0, 0], size)]);
      const inside = doc.portals.some((q) => insideBox(pos, q.from.pos, q.from.size, 0.6));
      return {
        boxes: [volumeBox(pos, p.twoWay ? p.from.size : [0.8, 0.8, 0.8])],
        floor,
        ok: !inside,
        why: inside ? "The exit can't be inside a portal" : undefined,
        apply: (e) => ({
          doc: setPortal(e, t.i, { ...e.portals[t.i], to: pos }),
          select: [{ k: 'portal', i: t.i, end: 'from' }],
        }),
      };
    }
    if (t.k === 'moverPoint') {
      const b = blockById(doc, t.id);
      const m = moverOf(doc, t.id);
      if (!b || !m) return null;
      const boxes = blockBoxes(b);
      const local = boxes.map((x) => ({
        ...x,
        c: v3(x.c.x - b.pos[0], x.c.y - b.pos[1], x.c.z - b.pos[2]),
      }));
      const { pos, floor } = this.placeAt(aim, local);
      return {
        boxes: local.map((x) => ({ ...x, c: v3(x.c.x + pos[0], x.c.y + pos[1], x.c.z + pos[2]) })),
        floor,
        ok: true,
        apply: (e) => ({ doc: addMoverPoint(e, t.id, pos), select: [{ k: 'block', id: t.id }] }),
      };
    }
    if (t.k === 'grab') {
      // the whole selection moves so its bottom sits where you aim
      const boxes = t.refs.flatMap((r) => boxesInDoc(t.start, r, this));
      if (!boxes.length) return null;
      const { pos: at, floor } = this.placeAt(aim, boxes);
      // pos = where the template's origin goes; the template is in world space, so pos is
      // the move itself (then the connect magnet)
      const shift = this.connect(moveBoxes(this.groupBoxes(t.start, t.refs), at), t.refs);
      const pos: V3 = [at[0] + shift[0], at[1] + shift[1], at[2] + shift[2]];
      return {
        boxes: boxes.map((x) => ({ ...x, c: v3(x.c.x + pos[0], x.c.y + pos[1], x.c.z + pos[2]) })),
        floor,
        ok: true,
        apply: (e) => ({ doc: moveRefs(e, t.refs, pos), select: t.refs }),
      };
    }
    return null;
  }

  /** Click with a placing tool. */
  private placeClick(): void {
    const t = this.tool;
    if (t.k === 'grab') {
      this.session.history.seal();
      this.setTool({ k: 'select' });
      this.ui.toast('Moved');
      return;
    }
    const pl = this.placement;
    if (!pl) return;
    if (!pl.ok) return this.ui.toast(pl.why ?? "Can't place it there");
    const res = pl.apply(this.doc);
    this.commit(res.doc, null, res.select);
    this.ghostKey = '';
    if (t.k === 'place' && t.brush === 'portal') {
      this.setTool({ k: 'portalExit', i: res.doc.portals.length - 1 });
      this.ui.toast(`Now ${this.touch ? 'tap' : 'click'} where the portal comes out`);
    } else if (t.k === 'portalExit') {
      this.setTool({ k: 'place', brush: 'portal' });
      this.ui.toast('Portal done');
    } else if (t.k === 'moverPoint') {
      const m = moverOf(this.doc, t.id);
      const n = m?.points.length ?? 0;
      if (n >= CUSTOM_MAP_LIMITS.moverPoints[1]) {
        this.setTool({ k: 'select' });
        this.ui.toast('4 points placed: it loops 1 → 2 → 3 → 4 → 1');
        if (this.touch) this.ui.openSheet();
      } else
        this.ui.toast(
          this.touch
            ? `Point ${n} placed. Tap for point ${n + 1}, or Done`
            : `Point ${n} placed. Click for point ${n + 1}, or Esc when done`,
        );
    }
  }

  // -------------------------------------------------------------------------------------------
  // structures: what a drag takes along (editor/structure.ts), and the connect magnet

  setJustThis(on: boolean): void {
    this.justThis = on;
    try {
      localStorage.setItem(JUST_THIS_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    this.ui.refreshInspector();
  }

  /** The layered structure of a piece (the map's own blocks and the built-in boxes). */
  structureOf(ref: Ref): { refs: Ref[]; pieces: number; capped: boolean } {
    if (ref.k !== 'block' && ref.k !== 'base') return { refs: [ref], pieces: 1, capped: false };
    // a curved ramp: its own pieces (and it never comes along with what it touches)
    if (this.isRampPiece(ref)) {
      const refs = this.rampOf(ref);
      return { refs, pieces: refs.length, capped: false };
    }
    const items: StructItem[] = [];
    const byKey = new Map<string, Ref>();
    for (const p of this.pieces) {
      if (p.ref.k !== 'block' && p.ref.k !== 'base') continue;
      if (this.isRampPiece(p.ref)) continue;
      const k = refKey(p.ref);
      byKey.set(k, p.ref);
      items.push({ key: k, min: p.min, max: p.max });
    }
    const s = structureKeys(items, refKey(ref));
    return {
      refs: [...s.keys].map((k) => byKey.get(k)!).filter(Boolean),
      pieces: s.pieces,
      capped: s.capped,
    };
  }

  /**
   * What dragging `ref` moves: the selection when it is part of a bigger one, else the piece's
   * structure (just the piece with "Just this piece", or when the structure is too big).
   */
  dragGroup(ref: Ref): Ref[] {
    const k = refKey(ref);
    if (this.selection.length > 1 && this.selection.some((r) => refKey(r) === k))
      return this.selection;
    if (this.justThis) return [ref];
    const s = this.structureOf(ref);
    if (s.capped) {
      this.ui.toast('Too big to drag together: use Just this piece or select fewer', 'drag');
      return [ref];
    }
    if (s.refs.length > 1) this.ui.toast(`Moving ${s.pieces} pieces`, 'drag');
    return s.refs;
  }

  /** Select connected: the whole structure of the selected piece. */
  selectConnected(): void {
    const r = this.selection[0];
    if (!r) return this.ui.toast('Select a piece first');
    const s = this.structureOf(r);
    if (s.capped) return this.ui.toast('Too big to select together (over 400 pieces)');
    this.select(s.refs);
    this.ui.toast(`${s.pieces} piece${s.pieces === 1 ? '' : 's'} selected`);
  }

  /** The move pad / turning on one piece: its structure comes along (not "Just this piece"). */
  private expandToStructure(): void {
    const s = this.selection;
    if (this.justThis || s.length !== 1 || (s[0].k !== 'block' && s[0].k !== 'base')) return;
    const refs = this.dragGroup(s[0]);
    if (refs.length > 1) this.select(refs);
  }

  /** The pieces of these things in a doc (the blocks' own, the rest as drawn now). */
  private groupBoxes(doc: EditDoc, refs: Ref[]): BoxDef[] {
    return refs.flatMap((r) => (r.k === 'block' || r.k === 'base' ? boxesInDoc(doc, r, this) : []));
  }

  /**
   * The connect magnet: how much more to move pieces (at their new place) so they sit flush
   * against a nearby piece that is not part of the move. The piece they connect to glows.
   */
  private connect(moved: BoxDef[], refs: Ref[]): V3 {
    if (!moved.length) return [0, 0, 0];
    const skip = new Set(refs.map(refKey));
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const b of moved) {
      const bb = boxBounds(b);
      min.x = Math.min(min.x, bb.min.x);
      min.y = Math.min(min.y, bb.min.y);
      min.z = Math.min(min.z, bb.min.z);
      max.x = Math.max(max.x, bb.max.x);
      max.y = Math.max(max.y, bb.max.y);
      max.z = Math.max(max.z, bb.max.z);
    }
    const r = CONNECT_DIST + 0.05;
    const near = this.pieces.filter(
      (p) =>
        (p.ref.k === 'block' || p.ref.k === 'base') &&
        p.min.x <= max.x + r &&
        p.max.x >= min.x - r &&
        p.min.y <= max.y + r &&
        p.max.y >= min.y - r &&
        p.min.z <= max.z + r &&
        p.max.z >= min.z - r &&
        !skip.has(refKey(p.ref)),
    );
    const res = connectSnap(
      moved.slice(0, 200),
      near.map((p) => p.box),
    );
    window.clearTimeout(this.connectTimer);
    if (res.hit < 0) {
      this.view.setConnect([]);
      return [0, 0, 0];
    }
    this.view.setConnect(this.boxesOf(near[res.hit].ref));
    this.connectTimer = window.setTimeout(() => {
      if (!this.disposed) this.view.setConnect([]);
    }, 700);
    return res.shift;
  }

  // -------------------------------------------------------------------------------------------
  // touch drags: a piece (and its structure) follows the finger over the surfaces

  /** A finger started dragging at (x, y) with the hand: true when it grabbed a piece. */
  beginTouchDrag(x: number, y: number): boolean {
    if (this.disposed || this.tool.k !== 'select') return false;
    const ref = this.refAt(x, y);
    const point = this.aim?.hit?.point;
    if (!ref || !point) return false;
    if (this.isRampPiece(ref)) {
      this.ui.toast("Curved ramps can't be moved, only deleted", 'drag');
      return false;
    }
    let refs = this.dragGroup(ref);
    this.session.history.seal();
    const key = `tdrag${++this.dragN}`;
    // built-in boxes become blocks first (the same undo step as the drag)
    if (refs.some((r) => r.k === 'base')) refs = this.adoptSelection(refs, key);
    this.select(refs);
    this.fdrag = {
      start: this.doc,
      refs,
      template: refs.flatMap((r) => boxesInDoc(this.doc, r, this)),
      key,
      lift: 0,
      at: [x, y],
      last: [x, y],
      point,
    };
    return true;
  }

  get touchDragging(): boolean {
    return !!this.fdrag;
  }

  touchDragTo(x: number, y: number): void {
    if (!this.fdrag) return;
    this.fdrag.at = [x, y];
    this.fdrag.last = [x, y];
  }

  /** ▲ / ▼ while dragging: up or down one grid step. */
  touchDragLift(dir: number): void {
    if (!this.fdrag) return;
    this.fdrag.lift += dir * this.grid;
    this.fdrag.at = this.fdrag.last;
  }

  endTouchDrag(): void {
    if (!this.fdrag) return;
    if (this.fdrag.at) this.applyTouchDrag();
    this.fdrag = null;
    this.session.history.seal();
  }

  /**
   * Once a frame: the dragged pieces slide level at the height they were grabbed (like the
   * mouse drag; ▲ / ▼ change the height), on the grid, and snap flush to pieces they meet.
   * Never onto whatever surface is behind the finger: behind a floating piece that can be the
   * far end of the map.
   */
  private applyTouchDrag(): void {
    const fd = this.fdrag;
    if (!fd?.at) return;
    const [x, y] = fd.at;
    fd.at = null;
    this.dragIgnore = new Set(fd.refs.map(refKey));
    this.mouse = { x, y, inCanvas: true };
    this.updateAim();
    this.dragIgnore = null;
    const aim = this.aim;
    if (!aim || !fd.template.length) return;
    const o = aim.origin;
    const dir = aim.dir;
    const p = fd.point;
    // where the finger's ray crosses the level plane through the grabbed point
    if (Math.abs(dir[1]) < 1e-4) return;
    const t = (p[1] - o[1]) / dir[1];
    if (t <= 0) return;
    let dx = o[0] + dir[0] * t - p[0];
    let dz = o[2] + dir[2] * t - p[2];
    // looking almost level, a tiny finger move is a huge distance: keep the drag in reach
    const reach = Math.max(20, 2 * Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]));
    const far = Math.hypot(dx, dz);
    if (far > reach) {
      dx *= reach / far;
      dz *= reach / far;
    }
    const g = this.grid;
    const delta: V3 = [Math.round(dx / g) * g, fd.lift, Math.round(dz / g) * g];
    const snapBoxes = this.groupBoxes(fd.start, fd.refs);
    const shift = this.connect(moveBoxes(snapBoxes, delta), fd.refs);
    const d: V3 = [delta[0] + shift[0], delta[1] + shift[1], delta[2] + shift[2]];
    this.commit(moveRefs(fd.start, fd.refs, d), fd.key, fd.refs);
  }

  // -------------------------------------------------------------------------------------------
  // touch (editor/touch-ui.ts turns taps, holds and drags into these)

  /** What is under a screen point (and aim there). */
  refAt(x: number, y: number): Ref | null {
    this.mouse = { x, y, inCanvas: true };
    this.updateAim();
    return this.aim?.hit?.piece.ref ?? null;
  }

  /** A tap: with the hand, select (and open its sheet); holding a piece, place it there. */
  tapAt(x: number, y: number): void {
    if (this.disposed) return;
    const ref = this.refAt(x, y);
    const aim = this.aim;
    if (this.tool.k === 'select') {
      this.select(ref ? this.clickGroup(ref) : []);
      if (ref) this.ui.openSheet();
      else this.ui.closeSheet();
      return;
    }
    if (!aim || this.tool.k === 'grab') return;
    const pl = this.computePlacement(aim);
    this.placement = pl;
    if (!pl) return;
    this.placeClick();
    // a short flash of the ghost where it went (red: it could not go there)
    this.view.setGhost(pl.boxes, pl.ok);
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      if (!this.disposed) this.view.setGhost(null);
    }, 320);
  }

  /** A long press: break what is under the finger (undoable). */
  breakAt(x: number, y: number): boolean {
    if (this.disposed) return false;
    const ref = this.refAt(x, y);
    if (!ref) return false;
    const name = this.describe(ref);
    const group = this.clickGroup(ref);
    const next =
      ref.k === 'point' ? removeMoverPoint(this.doc, ref.id, ref.i) : deleteRefs(this.doc, group);
    const gone = new Set(group.map(refKey));
    this.commit(
      next,
      null,
      this.selection.filter((r) => !gone.has(refKey(r))),
    );
    try {
      navigator.vibrate?.(35);
    } catch {
      /* no vibration here */
    }
    this.ui.toast(`${name} broken · ↶ undoes it`, 'break');
    return true;
  }

  /** Touch look: a finger drag turns the view (the touch sensitivity setting). */
  lookBy(dx: number, dy: number): void {
    const sens = this.app.settings.touchLookSensitivity ?? 0.3;
    const inv = this.app.settings.invertY ? -1 : 1;
    this.cam.heading = ((((this.cam.heading + dx * sens) % 360) + 540) % 360) - 180;
    this.cam.pitch = Math.max(-89, Math.min(89, this.cam.pitch - dy * sens * inv));
  }

  /** Two-finger pinch: fly forward (spread) or back. */
  pinchBy(d: number): void {
    const a = this.cam.heading * DEG;
    const p = this.cam.pitch * DEG;
    const k = d * 0.06 * this.flySpeed * (this.touchFast ? 3 : 1);
    const pos = this.cam.pos;
    pos[0] += Math.sin(a) * Math.cos(p) * k;
    pos[1] += Math.sin(p) * k;
    pos[2] -= Math.cos(a) * Math.cos(p) * k;
  }

  // -------------------------------------------------------------------------------------------
  // input

  private onKeyDown(e: KeyboardEvent): void {
    if (this.disposed || this.suspended || this.app.client) return;
    const target = e.target as HTMLElement | null;
    if (target?.matches?.('input, select, textarea')) return;
    if (this.ui.modalOpen()) {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.ui.closeModal();
      }
      return;
    }
    const code = e.code;
    const ctrl = e.ctrlKey || e.metaKey;
    // keep the browser from scrolling / tabbing / focusing buttons with Space
    if (
      [
        'Space',
        'Tab',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'PageUp',
        'PageDown',
      ].includes(code) ||
      ctrl
    )
      e.preventDefault();
    if (ctrl) {
      if (code === 'KeyZ') return e.shiftKey ? this.redo() : this.undo();
      if (code === 'KeyY') return this.redo();
      if (code === 'KeyD') return this.duplicateSelection();
      if (code === 'KeyS') return void this.ui.save();
      if (code === 'KeyA') return this.select(this.docRefs());
      this.held.add(code);
      return;
    }
    this.held.add(code);
    if (
      e.repeat &&
      !code.startsWith('Arrow') &&
      !code.startsWith('Page') &&
      !code.startsWith('Bracket')
    )
      return;
    // T: play it now from the camera · Shift+T: from the start (T again: back here)
    const test = quickTestKey(e);
    // (a T the game already took — back from a test — must not start another one)
    if (test && !e.defaultPrevented) return this.quick.toggle(test);
    const digit = /^Digit(\d)$/.exec(code);
    if (digit) return this.ui.pickHotbar(digit[1]);
    switch (code) {
      case 'Escape':
        e.preventDefault();
        if (this.ui.helpOpen()) return this.ui.toggleHelp(false);
        if (this.cancelTool()) return;
        if (this.selection.length) return this.select([]);
        return this.ui.openMenu();
      case 'Delete':
      case 'Backspace':
      case 'KeyX':
        return this.deleteSelection();
      case 'KeyR':
        return this.rotateSelection(e.shiftKey ? -15 : 15);
      case 'BracketLeft':
      case 'Minus':
        return this.scaleSelection(1 / 1.25);
      case 'BracketRight':
      case 'Equal':
        return this.scaleSelection(1.25);
      case 'KeyG':
        return this.startGrab();
      case 'KeyL':
        return this.selectConnected();
      case 'KeyF':
        return this.focusSelection();
      case 'KeyH':
        return this.ui.toggleHelp();
      case 'KeyM': {
        const b = this.singleBlock();
        return b ? this.makeMove(b) : this.ui.toast('Select one block first');
      }
      case 'KeyN': {
        const b = this.singleBlock();
        return b && moverOf(this.doc, b) ? this.addPoint(b) : undefined;
      }
      case 'Tab':
        return this.toggleLockMode();
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'PageUp':
      case 'PageDown':
        return this.nudge(this.nudgeDir(code));
    }
  }

  /** One grid step in a direction (arrow keys / the touch move pad), turned with the camera. */
  nudgeDir(code: string): V3 {
    const g = this.grid;
    if (code === 'PageUp') return [0, g, 0];
    if (code === 'PageDown') return [0, -g, 0];
    const a = snap90(this.cam.heading) * DEG;
    const fw: V3 = [Math.round(Math.sin(a)) * g, 0, -Math.round(Math.cos(a)) * g];
    const rt: V3 = [-fw[2], 0, fw[0]];
    if (code === 'ArrowUp') return fw;
    if (code === 'ArrowDown') return [-fw[0], 0, -fw[2]];
    if (code === 'ArrowRight') return rt;
    return [-rt[0], 0, -rt[2]];
  }

  /** The only selected block (id), if exactly one block is selected. */
  singleBlock(): number | null {
    const s = this.selection;
    if (s.length === 1 && s[0].k === 'block') return s[0].id;
    if (s.length === 1 && s[0].k === 'point') return s[0].id;
    return null;
  }

  /** Every thing of this doc (Ctrl+A): blocks and gameplay objects, not the built-in map. */
  private docRefs(): Ref[] {
    const d = this.doc;
    return [
      ...d.blocks.map((b): Ref => ({ k: 'block', id: b.id })),
      ...d.spawns.map((_, i): Ref => ({ k: 'spawn', i })),
      ...d.launchPads.map((_, i): Ref => ({ k: 'pad', i })),
      ...d.portals.map((_, i): Ref => ({ k: 'portal', i, end: 'from' })),
      ...d.race.checkpoints.map((_, i): Ref => ({ k: 'cp', i })),
      ...(d.race.start ? [{ k: 'start' } as Ref] : []),
      ...(d.race.finish ? [{ k: 'finish' } as Ref] : []),
    ];
  }

  toggleLockMode(): void {
    this.lockMode = !this.lockMode;
    if (this.lockMode) void this.lock();
    else if (document.pointerLockElement) document.exitPointerLock();
    this.ui.refreshMode();
  }

  private async lock(): Promise<void> {
    try {
      await (this.app.canvas.requestPointerLock() as unknown as Promise<void> | undefined);
    } catch {
      /* not now (needs a click) */
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (this.disposed || this.touch || this.app.client || this.ui.modalOpen()) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (e.button === 2) {
      // right mouse: look around while held (also cancels a placing tool when just clicked)
      this.looking = true;
      this.down = null;
      if (!document.pointerLockElement) void this.lock();
      this.rightDown = { x: e.clientX, y: e.clientY, moved: 0 };
      return;
    }
    if (e.button !== 0) return;
    this.mouse = { x: e.clientX, y: e.clientY, inCanvas: true };
    // a curve's drag handle comes first (drawn on top of everything)
    const hd = this.tool.k === 'select' ? this.handleAt(e.clientX, e.clientY) : null;
    const hid = this.singleBlock();
    if (hd && hid !== null) {
      this.session.history.seal();
      this.down = {
        x: e.clientX,
        y: e.clientY,
        ref: null,
        point: null,
        shift: false,
        dragging: null,
        handle: { kind: hd.kind, id: hid, start: this.doc, pos: hd.pos },
      };
      return;
    }
    this.updateAim();
    const hit = this.aim?.hit ?? null;
    this.down = {
      x: e.clientX,
      y: e.clientY,
      ref: hit?.piece.ref ?? null,
      point: hit?.point ?? null,
      shift: e.shiftKey,
      dragging: null,
    };
    // grabbing an unselected thing selects it right away (so it can be dragged at once); a
    // curved ramp whole (Alt: just the piece)
    if (this.tool.k === 'select' && hit && !e.shiftKey && !this.isSelected(hit.piece.ref))
      this.select(this.clickGroup(hit.piece.ref, e.altKey));
  }

  private rightDown: { x: number; y: number; moved: number } | null = null;

  private onMouseUp(e: MouseEvent): void {
    if (this.disposed || this.touch || this.suspended) return;
    if (e.button === 2) {
      this.looking = false;
      if (!this.lockMode && document.pointerLockElement) document.exitPointerLock();
      // a right-click without turning: stop placing
      if (this.rightDown && this.rightDown.moved < 6) this.cancelTool();
      this.rightDown = null;
      return;
    }
    if (e.button !== 0 || !this.down) return;
    const d = this.down;
    this.down = null;
    if (d.handle) {
      this.session.history.seal();
      this.dragN++;
      return;
    }
    if (d.dragging === 'move') {
      this.session.history.seal();
      this.dragN++;
      return;
    }
    if (d.dragging === 'box') {
      this.ui.boxRect(null);
      this.boxSelect(d.x, d.y, e.clientX, e.clientY, d.shift);
      return;
    }
    // a click
    if (this.tool.k !== 'select') return this.placeClick();
    if (!d.ref) {
      if (!d.shift) this.select([]);
      return;
    }
    // (a curved ramp comes whole: Alt-click for one piece of it)
    const group = this.clickGroup(d.ref, e.altKey);
    if (d.shift) {
      const keys = new Set(group.map(refKey));
      this.select(
        this.isSelected(d.ref)
          ? this.selection.filter((r) => !keys.has(refKey(r)))
          : [...this.selection.filter((r) => !keys.has(refKey(r))), ...group],
      );
    } else this.select(group);
    if (!d.shift && this.isRampPiece(d.ref))
      this.ui.toast(
        group.length > 1
          ? `Curved ramp · ${group.length} pieces · Delete / X removes it · Alt-click for one piece`
          : 'One piece of a curved ramp · Delete / X removes it',
        'ramp',
      );
  }

  private endDrag(): void {
    if (this.down?.dragging === 'box') this.ui.boxRect(null);
    this.down = null;
    this.looking = false;
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.disposed || this.touch || this.suspended) return;
    const locked = document.pointerLockElement === this.app.canvas;
    if (locked && (this.looking || this.lockMode)) {
      const sens = this.app.settings.sensitivity ?? 0.1;
      const inv = this.app.settings.invertY ? -1 : 1;
      this.cam.heading = ((((this.cam.heading + e.movementX * sens) % 360) + 540) % 360) - 180;
      this.cam.pitch = Math.max(-89, Math.min(89, this.cam.pitch - e.movementY * sens * inv));
      if (this.rightDown) this.rightDown.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (!this.lockMode) return;
    }
    if (!locked) {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inCanvas = e.target === this.app.canvas;
    }
    const d = this.down;
    if (!d || this.tool.k !== 'select') return;
    if (d.handle) return this.dragHandle(d.handle);
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (!d.dragging && !locked && moved > 5) {
      // (curved ramps can't move: a drag across one selects an area, e.g. a section of it)
      if (d.ref && !d.shift && this.isSelected(d.ref) && d.point && !this.isRampPiece(d.ref)) {
        d.dragging = 'move';
        // the piece brings its whole layered structure (unless "Just this piece")
        const refs = this.dragGroup(d.ref);
        if (refs.length !== this.selection.length) this.select(refs);
        d.moveStart = this.doc;
        d.moveRefs = refs;
      } else d.dragging = 'box';
    }
    if (d.dragging === 'box') this.ui.boxRect([d.x, d.y, e.clientX, e.clientY]);
    if (d.dragging === 'move') this.dragMove(d, e.altKey);
  }

  // -------------------------------------------------------------------------------------------
  // curve handles

  /** The handles of the selected curve: its end (turn + radius) and its climb. */
  private updateHandles(): void {
    this.handles = [];
    const id =
      this.selection.length === 1 && this.selection[0].k === 'block' ? this.selection[0].id : null;
    const b = id !== null ? blockById(this.doc, id) : undefined;
    if (
      b?.curve &&
      isCurveShape(b.shape) &&
      b.shape !== 'quarterPipe' &&
      !b.rot?.[1] &&
      !b.rot?.[2]
    ) {
      const [x, z] = curveEndLocal(b.curve);
      const top = b.shape === 'curveSurf' ? b.size[1] : 0;
      const end = localToWorld(b.pos, b.rot?.[0] ?? 0, [x, (b.curve.rise ?? 0) + top, z]);
      this.handles = [
        { kind: 'end', pos: end },
        { kind: 'height', pos: [end[0], end[1] + HANDLE_UP, end[2]] },
      ];
    }
    // (touch edits curves with the sheet's sliders: no tiny handles to hit)
    if (this.touch) this.handles = [];
    this.view.setHandles(this.handles);
  }

  /** The handle under the mouse (screen pixels), if any. */
  private handleAt(x: number, y: number): { kind: 'end' | 'height'; pos: V3 } | null {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let best: { kind: 'end' | 'height'; pos: V3 } | null = null;
    let bd = 18;
    for (const hd of this.handles) {
      const s = this.view.project(hd.pos, w, h);
      if (!s) continue;
      const dd = Math.hypot(s[0] - x, s[1] - y);
      if (dd < bd) {
        bd = dd;
        best = hd;
      }
    }
    return best;
  }

  /** Dragging a curve handle: the end changes the turn and radius, the top the climb. */
  private dragHandle(hd: NonNullable<DownState['handle']>): void {
    this.updateAim();
    const aim = this.aim;
    const b = blockById(hd.start, hd.id);
    if (!aim || !b?.curve) return;
    const o = aim.origin;
    const dir = aim.dir;
    let curve: Curve;
    if (hd.kind === 'end') {
      // along the flat plane at the end's height
      if (Math.abs(dir[1]) < 1e-4) return;
      const t = (hd.pos[1] - o[1]) / dir[1];
      if (t <= 0 || t > 1500) return;
      const p: V3 = [o[0] + dir[0] * t, hd.pos[1], o[2] + dir[2] * t];
      const l = worldToLocal(b.pos, b.rot?.[0] ?? 0, p);
      curve = solveCurveEnd(b.curve, [l[0], l[2]]);
    } else {
      // up and down: a vertical plane through the handle, facing the camera
      const n: V3 = [dir[0], 0, dir[2]];
      const nl = Math.hypot(n[0], n[2]) || 1;
      const den = (n[0] * dir[0] + n[2] * dir[2]) / nl;
      if (Math.abs(den) < 1e-4) return;
      const t = (n[0] * (hd.pos[0] - o[0]) + n[2] * (hd.pos[2] - o[2])) / nl / den;
      if (t <= 0) return;
      const y = o[1] + dir[1] * t;
      const top = b.shape === 'curveSurf' ? b.size[1] : 0;
      const step = Math.min(this.grid, 0.5);
      const rise = Math.round((y - HANDLE_UP - top - b.pos[1]) / step) * step;
      curve = { ...b.curve, rise: Math.max(-200, Math.min(200, rise)) };
    }
    const pos = posKeepingStart(b.pos, b.rot?.[0] ?? 0, b.curve, curve);
    const next = updateBlock(hd.start, hd.id, fitWave({ ...b, curve, pos }));
    this.commit(next, `handle${this.dragN}`);
    const nb = blockById(this.doc, hd.id);
    if (nb) this.rememberCurve(nb);
  }

  /** Dragging the selection: along the floor (Alt: up and down). */
  private dragMove(d: DownState, vertical: boolean): void {
    this.updateAim();
    const aim = this.aim;
    if (!aim || !d.point || !d.moveStart || !d.moveRefs) return;
    const o = aim.origin;
    const dir = aim.dir;
    let delta: V3;
    if (vertical) {
      // a vertical plane through the grabbed point, facing the camera
      const n: V3 = [dir[0], 0, dir[2]];
      const nl = Math.hypot(n[0], n[2]) || 1;
      n[0] /= nl;
      n[2] /= nl;
      const den = n[0] * dir[0] + n[2] * dir[2];
      if (Math.abs(den) < 1e-4) return;
      const t = (n[0] * (d.point[0] - o[0]) + n[2] * (d.point[2] - o[2])) / den;
      if (t <= 0) return;
      delta = [0, o[1] + dir[1] * t - d.point[1], 0];
    } else {
      if (Math.abs(dir[1]) < 1e-4) return;
      const t = (d.point[1] - o[1]) / dir[1];
      if (t <= 0 || t > 1500) return;
      delta = [o[0] + dir[0] * t - d.point[0], 0, o[2] + dir[2] * t - d.point[2]];
    }
    const g = this.grid;
    delta = delta.map((x) => Math.round(x / g) * g) as V3;
    if (!delta[0] && !delta[1] && !delta[2] && this.doc === d.moveStart) return;
    const key = `drag${this.dragN}`;
    if (!d.adopted && d.moveRefs.some((r) => r.k === 'base')) {
      d.adopted = true;
      this.session.history.seal();
      d.moveRefs = this.adoptSelection(d.moveRefs, key);
      d.moveStart = this.doc;
    }
    d.template ??= this.groupBoxes(d.moveStart, d.moveRefs);
    const shift = this.connect(moveBoxes(d.template, delta), d.moveRefs);
    delta = [delta[0] + shift[0], delta[1] + shift[1], delta[2] + shift[2]];
    this.commit(moveRefs(d.moveStart, d.moveRefs, delta), key, d.moveRefs);
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    const seen = new Map<string, Ref>();
    const camPos = this.cam.pos;
    for (const p of this.pieces) {
      const c: V3 = [(p.min.x + p.max.x) / 2, (p.min.y + p.max.y) / 2, (p.min.z + p.max.z) / 2];
      if (Math.hypot(c[0] - camPos[0], c[1] - camPos[1], c[2] - camPos[2]) > 400) continue;
      const s = this.view.project(c, w, h);
      if (!s || s[0] < ax || s[0] > bx || s[1] < ay || s[1] > by) continue;
      seen.set(refKey(p.ref), p.ref);
    }
    const found = [...seen.values()];
    if (!add) this.select(found);
    else {
      const keys = new Set(this.selection.map(refKey));
      this.select([...this.selection, ...found.filter((r) => !keys.has(refKey(r)))]);
    }
    if (found.length) this.ui.toast(`${this.selection.length} selected`);
  }

  private onWheel(e: WheelEvent): void {
    if (this.disposed || this.touch || this.app.client) return;
    e.preventDefault();
    if (e.altKey) return this.scaleSelection(e.deltaY < 0 ? 1.25 : 1 / 1.25);
    this.flySpeed = Math.max(0.1, Math.min(20, this.flySpeed * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    this.ui.toast(`Fly speed ${Math.round(this.flySpeed * BASE_SPEED)} m/s`, 'speed');
  }

  /** A short name of a thing (hover text, inspector title). */
  describe(r: Ref): string {
    switch (r.k) {
      case 'base':
        return this.isRampPiece(r)
          ? `Curved ramp of ${this.baseName || 'the map'}`
          : `Part of ${this.baseName || 'the map'}`;
      case 'block': {
        const b = blockById(this.doc, r.id);
        return b ? blockName(b) : 'Block';
      }
      case 'point':
        return `Moving block · point ${r.i + 1}`;
      case 'spawn':
        return 'Spawn point';
      case 'start':
        return 'Race start';
      case 'finish':
        return 'Finish';
      case 'cp':
        return `Checkpoint ${r.i + 1}`;
      case 'portal':
        return r.end === 'from' ? `Portal ${r.i + 1}` : `Portal ${r.i + 1} exit`;
      case 'pad':
        return 'Launch pad';
      case 'basePortal':
        return `Portal of ${this.baseName || 'the map'}`;
      case 'basePad':
        return `Launch pad of ${this.baseName || 'the map'}`;
    }
  }

  cameraState(): CameraState {
    return { pos: [...this.cam.pos] as V3, heading: this.cam.heading, pitch: this.cam.pitch };
  }

  /** Move point i of a moving block (the inspector's number fields). */
  setMoverPointAt(id: number, i: number, p: V3): void {
    this.commit(setMoverPoint(this.doc, id, i, p));
  }
}

const JUST_THIS_KEY = 'spaceyz.mapmaker.justThis';
const readJustThis = (): boolean => {
  try {
    return localStorage.getItem(JUST_THIS_KEY) === '1';
  } catch {
    return false;
  }
};

/** Boxes moved by `d`. */
const moveBoxes = (boxes: BoxDef[], d: V3): BoxDef[] =>
  boxes.map((b) => ({ ...b, c: v3(b.c.x + d[0], b.c.y + d[1], b.c.z + d[2]) }));

const isTyping = (): boolean => {
  const a = document.activeElement as HTMLElement | null;
  return !!a?.matches?.('input:not([type=range]):not([type=checkbox]), select, textarea');
};

const insideBox = (p: V3, c: V3, size: V3, pad: number): boolean =>
  Math.abs(p[0] - c[0]) < size[0] / 2 + pad &&
  Math.abs(p[1] - c[1]) < size[1] / 2 + pad &&
  Math.abs(p[2] - c[2]) < size[2] / 2 + pad;

/** The boxes of a thing in another doc (the grab's starting doc). */
const boxesInDoc = (e: EditDoc, r: Ref, ed: MapEditor): BoxDef[] => {
  if (r.k === 'block') {
    const b = blockById(e, r.id);
    return b ? blockBoxes(b) : [];
  }
  return ed.boxesOf(r);
};

const SHAPE_NAMES: Record<string, string> = {
  box: 'Block',
  wedge: 'Ramp',
  surf: 'Surf ramp',
  surfSide: 'One-sided surf ramp',
  curveSurf: 'Curved surf ramp',
  curveRamp: 'Curved ramp',
  quarterPipe: 'Quarter pipe',
  curvePlatform: 'Curved walkway',
  cylinder: 'Round block',
  killpaint: 'Kill paint',
};

export const blockName = (b: CustomBlock): string => {
  let n = SHAPE_NAMES[b.shape] ?? 'Block';
  if (b.shape === 'box' && b.size[1] <= 0.6 && Math.min(b.size[0], b.size[2]) >= 2) n = 'Platform';
  if (b.shape === 'box' && b.mat === 'glass') n = 'Glass';
  return n;
};

/** A built-in box as a block of the doc (null: a kind of box a doc can't hold). */
export const baseBoxToBlock = (box: BoxDef): Omit<CustomBlock, 'id'> | null => {
  const def = {
    name: '',
    boundsMin: v3(-500, -500, -500),
    boundsMax: v3(500, 500, 500),
    defaultGravity: v3(0, -1, 0),
    boxes: [box],
    zones: [],
    rails: [],
    pads: [],
    spawns: [],
    towers: [],
  } as LevelDef;
  try {
    const b = levelToCustomMap(def, '', '').blocks[0];
    if (!b) return null;
    const { id: _id, ...rest } = b;
    void _id;
    return rest;
  } catch {
    return null;
  }
};
