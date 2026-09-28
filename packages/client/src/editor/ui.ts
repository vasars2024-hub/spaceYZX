// MAP MAKER — the editor's panels: the top bar (name, pieces, checks, save / publish / test),
// the palette (left), the inspector for what is selected (right), the hotbar (keys 1-0), hints,
// toasts, the Esc menu and the How-to overlay (H).
import type { CustomBlock, CustomGate, CustomShape, CustomSky } from '@space-yz/shared';
import {
  blockPieceCount,
  CUSTOM_MAP_LIMITS,
  isCurveShape,
  maxWaveAmplitude,
} from '@space-yz/shared';
import { h } from '../ui/menus';
import { account } from '../net/account';
import {
  isAdmin,
  playMap,
  publishOfficial,
  restoreOfficial,
  saveMap,
  undoOfficial,
} from '../net/custom-maps';
import type { MapEditor } from './editor';
import { blockName } from './editor';
import { edIcon, type EditorIconName } from './icons';
import {
  blockById,
  deleteRefs,
  gateOf,
  isRace,
  moveCheckpoint,
  moverOf,
  padAim,
  padVel,
  PORTAL_COLORS,
  removeMoverPoint,
  setGate,
  setMoverTiming,
  setPad,
  setPortal,
  setSpawn,
  stopMover,
  toCustomDoc,
  updateBlock,
  type Ref,
  type V3,
} from './model';
import { moverCycle } from './mover-time';
import {
  applyPreset,
  CURVE_KINDS,
  CURVE_LIMITS,
  CURVE_PRESETS,
  curveFields,
  fitWave,
  posKeepingStart,
  setCurveKind,
  type Curve,
  type CurveKind,
} from './curve-edit';
import {
  BLOCK_BRUSHES,
  brushLabel,
  HOTBAR,
  MATERIALS,
  materialColor,
  OBJECT_BRUSHES,
  SWATCHES,
  type BrushId,
} from './palette';
import { GRID_SIZES } from './snap';
import { TOUCH_HELP_ROWS, TouchLayer } from './touch-ui';
import { saveDraft } from './session';
import { QUICK_TEST_LABEL } from './quick-test';
import {
  confirmBox,
  edButton,
  errorText,
  hex,
  modal,
  numBox,
  row,
  selectRow,
  setTouchKit,
  sliderRow,
  swatchRow,
  toggleRow,
  vecRow,
} from './ui-kit';

const BRUSH_ICON: Record<BrushId | 'select', EditorIconName> = {
  select: 'select',
  platform: 'platform',
  block: 'block',
  wall: 'wall',
  wedge: 'wedge',
  surf: 'surf',
  surfSide: 'surfSide',
  curveSurf: 'curveSurf',
  curveRamp: 'curveRamp',
  quarterPipe: 'quarterPipe',
  curvePlatform: 'curvePlatform',
  cylinder: 'cylinder',
  pillar: 'pillar',
  glass: 'glass',
  killpaint: 'killpaint',
  start: 'start',
  checkpoint: 'checkpoint',
  finish: 'finish',
  spawn: 'spawn',
  portal: 'portal',
  pad: 'pad',
};

const KIND_ICON: Record<CurveKind, EditorIconName> = {
  arc: 'kindArc',
  sCurve: 'kindS',
  spiral: 'kindSpiral',
  wave: 'kindWave',
};

const SKIES: [CustomSky, string][] = [
  ['day', 'Day'],
  ['sunset', 'Sunset'],
  ['night', 'Night'],
  ['space', 'Space'],
  ['aurora', 'Aurora'],
];

export const HELP_ROWS: [string, string][] = [
  ['W A S D', 'Fly'],
  ['Space / E', 'Fly up'],
  ['C / Q / Ctrl', 'Fly down'],
  ['Shift', 'Fly fast'],
  ['Mouse wheel', 'Fly speed'],
  ['Right mouse (hold)', 'Look around'],
  ['Tab', 'Mouse look on / off (aim with the centre dot)'],
  [
    `${QUICK_TEST_LABEL} / Shift + ${QUICK_TEST_LABEL}`,
    `Play it now from the camera / from the start (${QUICK_TEST_LABEL} again: back to building, nothing lost)`,
  ],
  [
    '1 – 0',
    'Tools: 1 Select, 2 Platform, 3 Block, 4 Ramp, 5 Surf, 6 Curved ramp, 7 Kill paint, 8 Checkpoint, 9 Portal, 0 Launch pad',
  ],
  ['Left click', 'Select · place (with a building tool)'],
  ['Shift + click', 'Select more than one'],
  ['Drag', 'Move what is selected (hold Alt: up / down) · on empty space: select an area'],
  ['Arrows · PgUp / PgDn', 'Move the selection one grid step'],
  ['G', 'Move the selection to where you aim (click to drop)'],
  ['L', 'Select connected (everything built onto the piece)'],
  ['R / Shift + R', 'Turn 15°'],
  ['[ and ]  (or Alt + wheel)', 'Smaller / bigger'],
  ['Delete / X', 'Delete'],
  ['Ctrl + D', 'Copy'],
  ['Ctrl + Z / Ctrl + Y', 'Undo / redo'],
  ['Ctrl + S', 'Save'],
  ['M', 'Make the selected block move · N: add its next point'],
  ['F', 'Fly to the selection'],
  ['H', 'This help'],
  ['Esc', 'Stop placing · deselect · menu'],
];

export class EditorUI {
  root: HTMLElement;
  private top: HTMLElement;
  private status: HTMLElement;
  private left: HTMLElement;
  private right: HTMLElement;
  private hotbar: HTMLElement;
  private hint: HTMLElement;
  private hover: HTMLElement;
  private toasts: HTMLElement;
  private cross: HTMLElement;
  private rect: HTMLElement;
  private help: HTMLElement | null = null;
  private closeModalFn: (() => void) | null = null;
  private leftTab: 'build' | 'game' = 'build';
  private inspectorDirty = false;
  private toastKeys = new Map<string, HTMLElement>();
  /** the phone / tablet layer (editor/touch-ui.ts); null on desktop */
  touchLayer: TouchLayer | null = null;
  /** touch: the edit sheet (the inspector in a bottom sheet) and whether it is up */
  private sheet: HTMLElement | null = null;
  private sheetOpen = false;

  constructor(private ed: MapEditor) {
    this.top = h('div', { class: 'ed-top interactive' });
    this.status = h('div', { class: 'ed-status' });
    this.left = h('aside', { class: 'ed-panel ed-left interactive' });
    this.right = h('aside', { class: 'ed-panel ed-right interactive' });
    this.hotbar = h('div', { class: 'ed-hotbar interactive' });
    this.hint = h('div', { class: 'ed-hint' });
    this.hover = h('div', { class: 'ed-hover' });
    this.toasts = h('div', { class: 'ed-toasts' });
    this.cross = h('div', { class: 'ed-cross' });
    this.rect = h('div', { class: 'ed-rect' });
    if (ed.touch) {
      setTouchKit(true);
      this.touchLayer = new TouchLayer(ed, this);
      this.right.className = 'ed-sheet-body';
      this.sheet = h('div', { class: 'ed-sheet interactive' }, this.right);
      this.root = h(
        'div',
        { class: 'ed-root ed-touch' },
        this.top,
        ...this.touchLayer.elements(),
        this.sheet,
        this.hint,
        this.cross,
        this.toasts,
      );
      this.right.addEventListener('pointerdown', () => (this.pointerHeld = true));
      window.addEventListener('pointerup', this.onPointerUp);
      this.refreshMode();
      this.touchLayer.start();
      return;
    }
    this.root = h(
      'div',
      { class: 'ed-root' },
      this.top,
      this.left,
      this.right,
      this.hotbar,
      this.hint,
      this.hover,
      this.cross,
      this.rect,
      this.toasts,
    );
    // a slider drag holds the inspector still; letting go rebuilds it with the new values
    this.right.addEventListener('pointerdown', () => (this.pointerHeld = true));
    window.addEventListener('pointerup', this.onPointerUp);
    this.buildLeft();
    this.buildHotbar();
    this.refreshMode();
    if (!localStorageFlag('spaceyz.mapmaker.helpSeen')) {
      this.toggleHelp(true);
      setLocalFlag('spaceyz.mapmaker.helpSeen');
    }
  }

  dispose(): void {
    window.removeEventListener('pointerup', this.onPointerUp);
    this.touchLayer?.dispose();
    if (this.touchLayer) setTouchKit(false);
    this.closeModal();
    this.root.remove();
  }

  frame(): void {
    if (this.touchLayer) {
      this.touchLayer.frame();
      // (placing points / a portal exit: the centre dot shows where "At the dot" puts it)
      const t = this.ed.tool.k;
      this.cross.classList.toggle('on', t === 'moverPoint' || t === 'portalExit');
      return;
    }
    const locked = document.pointerLockElement === this.ed.app.canvas;
    this.cross.classList.toggle('on', locked);
  }

  // -------------------------------------------------------------------------------------------
  // touch: the edit sheet

  /** Show the edit sheet for the selection (touch). */
  openSheet(): void {
    if (!this.sheet || !this.ed.selection.length) return;
    this.sheetOpen = true;
    this.refreshInspector();
  }

  /** Hide the edit sheet (touch); the selection goes too. */
  closeSheet(): void {
    if (!this.sheet) return;
    const was = this.sheetOpen;
    this.sheetOpen = false;
    this.sheet.classList.remove('on');
    if (was && this.ed.selection.length) this.ed.select([]);
  }

  // -------------------------------------------------------------------------------------------
  // top bar

  refreshTop(): void {
    if (this.touchLayer) return this.refreshTouchTop();
    const ed = this.ed;
    const doc = ed.doc;
    const s = ed.session;
    const official = s.kind === 'official';
    const admin = isAdmin();
    const name = h('input', {
      class: 'ed-name',
      value: doc.name,
      maxlength: String(CUSTOM_MAP_LIMITS.nameLength),
      title: 'Map name',
      'aria-label': 'Map name',
    });
    name.addEventListener('change', () => {
      const v = name.value.trim().slice(0, CUSTOM_MAP_LIMITS.nameLength);
      if (v && v !== ed.doc.name) ed.commit({ ...ed.doc, name: v });
      else name.value = ed.doc.name;
    });
    name.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Escape') name.blur();
    });
    const count = ed.pieceCount();
    const pieces = h(
      'span',
      {
        class: `ed-count${count > ed.maxPieces ? ' bad' : count > ed.maxPieces * 0.9 ? ' warn' : ''}`,
        title: 'Pieces in your map (curves count as several)',
      },
      `${count} / ${ed.maxPieces} pieces`,
    );
    const kind = official
      ? h('span', { class: 'chip ed-kind official' }, `Real map: ${ed.baseName}`)
      : ed.isPatch
        ? h('span', { class: 'chip ed-kind' }, `My version of ${ed.baseName}`)
        : null;
    const unsaved = s.history.current !== s.savedDoc;
    this.top.replaceChildren(
      ...nn([
        edButton(
          'exit',
          'Exit',
          () => this.exit(),
          'btn small secondary',
          'Back to the Map Maker menu',
        ),
        name,
        kind,
        pieces,
        this.status,
        h('span', { class: 'ed-spacer' }),
        edButton('undo', '', () => ed.undo(), 'btn small secondary ed-sq', 'Undo (Ctrl+Z)'),
        edButton('redo', '', () => ed.redo(), 'btn small secondary ed-sq', 'Redo (Ctrl+Y)'),
        edButton(
          'save',
          unsaved ? 'Save' : 'Saved',
          () => void this.save(),
          `btn small ${unsaved ? '' : 'secondary'}`,
          official ? 'Save a copy to My Maps (not public)' : 'Save to My Maps (Ctrl+S)',
        ),
        official && admin
          ? edButton(
              'publish',
              'Publish to the real map',
              () => void this.publish(),
              'btn small orange',
              'Everyone will play this version',
            )
          : null,
        official && admin
          ? edButton(
              'restore',
              'Restore…',
              () => this.restoreMenu(),
              'btn small secondary',
              'Put the original map back, or undo the last publish',
            )
          : null,
        edButton(
          'test',
          `Play · ${QUICK_TEST_LABEL}`,
          () => ed.quick.toggle('camera'),
          'btn small primary',
          `Play it now from the camera (${QUICK_TEST_LABEL}) · Shift+${QUICK_TEST_LABEL}: from the start · ${QUICK_TEST_LABEL} again: back to building`,
        ),
        edButton(
          null,
          'Test…',
          () => this.testMenu(),
          'btn small secondary',
          'Race it, walk around it with target dummies, or play it online with friends',
        ),
        edButton('help', '', () => this.toggleHelp(), 'btn small secondary ed-sq', 'How to (H)'),
      ]),
    );
    this.refreshStatus();
  }

  refreshStatus(): void {
    const ed = this.ed;
    const n = ed.errors.length;
    const w = ed.notes.length;
    this.status.replaceChildren();
    if (!n && !w) {
      this.status.className = 'ed-status ok';
      this.status.textContent = '✓ Ready to play';
      this.status.onclick = null;
      return;
    }
    this.status.className = `ed-status ${n ? 'bad' : 'warn'}`;
    this.status.textContent = n
      ? `⚠ ${n} problem${n === 1 ? '' : 's'}`
      : `${w} thing${w === 1 ? '' : 's'} unfinished`;
    this.status.title = 'Click to see';
    this.status.onclick = () => this.showProblems();
  }

  showProblems(): void {
    const ed = this.ed;
    const items = [
      ...ed.errors.map((e) => h('li', { class: 'bad' }, e)),
      ...ed.notes.map((e) => h('li', { class: 'warn' }, e)),
    ];
    this.openModal(
      ed.errors.length ? 'Fix these before playing' : 'Not finished yet',
      [items.length ? h('ul', { class: 'ed-problems' }, ...items) : 'All good!'],
      [{ label: 'OK', cls: 'btn small primary' }],
    );
  }

  // -------------------------------------------------------------------------------------------
  // palette (left)

  buildLeft(): void {
    if (this.touchLayer) return; // (touch: the bag in the hotbar)
    const ed = this.ed;
    const tabs = h(
      'div',
      { class: 'seg ed-tabs', role: 'tablist' },
      ...(
        [
          ['build', 'Build'],
          ['game', 'Game'],
        ] as const
      ).map(([id, label]) => {
        const b = h(
          'button',
          { type: 'button', role: 'tab', 'aria-selected': String(this.leftTab === id) },
          label,
        );
        b.addEventListener('click', () => {
          this.leftTab = id;
          this.buildLeft();
        });
        return b;
      }),
    );
    const active = ed.tool.k === 'place' ? ed.tool.brush : null;
    const brushBtn = (id: BrushId, label: string, desc: string) => {
      const b = h(
        'button',
        { type: 'button', class: `ed-brush${active === id ? ' on' : ''}`, title: desc },
        edIcon(BRUSH_ICON[id]),
        h('span', {}, label),
      );
      b.addEventListener('click', () => {
        ed.setBrush(id);
        b.blur();
      });
      return b;
    };
    const content: (HTMLElement | null)[] = [];
    if (this.leftTab === 'build') {
      content.push(
        h(
          'div',
          { class: 'ed-brushes' },
          ...BLOCK_BRUSHES.map((b) => brushBtn(b.id, b.label, b.desc)),
        ),
        h('div', { class: 'ed-sub' }, 'New pieces are made of'),
        h(
          'div',
          { class: 'ed-mats' },
          ...MATERIALS.map((m) => {
            const b = h(
              'button',
              {
                type: 'button',
                class: `ed-mat${ed.material === m.id ? ' on' : ''}`,
                title: m.label,
              },
              h('span', { class: `ed-dot mat-${m.id}` }),
              m.label,
            );
            (b.firstChild as HTMLElement).style.background = hex(materialColor(m.id));
            b.addEventListener('click', () => {
              ed.material = m.id;
              this.buildLeft();
              ed.setBrushRefresh();
            });
            return b;
          }),
        ),
        swatchRow(
          'Colour',
          SWATCHES,
          ed.color,
          (c) => {
            ed.color = c;
            this.buildLeft();
            ed.setBrushRefresh();
          },
          { none: "The material's own colour", picker: true },
        ),
        h(
          'div',
          { class: 'ed-block' },
          h('div', { class: 'ed-label' }, 'Grid (metres)'),
          h(
            'div',
            { class: 'seg ed-grid' },
            ...GRID_SIZES.map((g) => {
              const b = h(
                'button',
                { type: 'button', 'aria-selected': String(ed.grid === g) },
                String(g),
              );
              b.addEventListener('click', () => {
                ed.grid = g;
                this.buildLeft();
                ed.setBrushRefresh();
              });
              return b;
            }),
          ),
        ),
      );
    } else {
      content.push(
        h(
          'div',
          { class: 'ed-brushes' },
          ...OBJECT_BRUSHES.map((b) => brushBtn(b.id, b.label, b.desc)),
        ),
        h(
          'p',
          { class: 'ed-tip' },
          'A race needs a Start and a Finish. Checkpoints count in the order you place them (reorder them in the Map panel on the right when nothing is selected).',
        ),
      );
    }
    content.push(
      h('div', { class: 'ed-sub' }, 'View'),
      toggleRow('Moving blocks move', ed.view.previewMotion, (v) => {
        ed.view.previewMotion = v;
        ed.view.resetTime();
      }),
      ed.isPatch
        ? toggleRow('Show invisible walls', ed.view.showHidden, (v) => {
            ed.view.showHidden = v;
            ed.sync();
          })
        : null,
    );
    this.left.replaceChildren(tabs, ...nn(content));
  }

  // -------------------------------------------------------------------------------------------
  // hotbar + mode

  private buildHotbar(): void {
    if (this.touchLayer) return this.touchLayer.refreshHotbar();
    const ed = this.ed;
    const cur = ed.tool.k === 'place' ? ed.tool.brush : ed.tool.k === 'select' ? 'select' : null;
    this.hotbar.replaceChildren(
      ...HOTBAR.map((s) => {
        const b = h(
          'button',
          {
            type: 'button',
            class: `ed-slot${cur === s.tool ? ' on' : ''}`,
            title: s.tool === 'select' ? 'Select' : brushLabel(s.tool),
          },
          h('span', { class: 'ed-key' }, s.key),
          edIcon(BRUSH_ICON[s.tool]),
          h('span', { class: 'ed-slot-name' }, s.tool === 'select' ? 'Select' : brushLabel(s.tool)),
        );
        b.addEventListener('click', () => {
          this.pickHotbar(s.key);
          b.blur();
        });
        return b;
      }),
    );
  }

  pickHotbar(key: string): void {
    const s = HOTBAR.find((x) => x.key === key);
    if (!s) return;
    this.ed.setBrush(s.tool);
  }

  /** The tool changed: hotbar, palette highlight, hint line. */
  refreshMode(): void {
    this.buildHotbar();
    this.buildLeft();
    this.refreshInspector();
    const ed = this.ed;
    const t = ed.tool;
    if (this.touchLayer) {
      this.touchLayer.refreshBanner();
      this.hint.textContent =
        t.k === 'select'
          ? 'Tap a piece to change it · hold to break'
          : t.k === 'place'
            ? `Tap to place ${brushLabel(t.brush)} · hold to break`
            : '';
      return;
    }
    const look = `${ed.lockMode ? 'Tab: free the mouse' : 'Hold right mouse to look · Tab: mouse look'} · ${QUICK_TEST_LABEL}: play`;
    let text = '';
    if (t.k === 'select')
      text = `Click to select · drag to move · Del delete · R turn · G move to aim · ${look}`;
    else if (t.k === 'place')
      text = `Click to place ${brushLabel(t.brush)} · R turn · [ ] size · Esc or right-click: stop · ${look}`;
    else if (t.k === 'portalExit')
      text = 'Click where the portal comes out · Esc: keep it where it is';
    else if (t.k === 'moverPoint') {
      const n = (moverOf(ed.doc, t.id)?.points.length ?? 1) + 1;
      text = `Click where point ${n} goes (the block moves 1 → ${n}${n < 4 ? ' …' : ''} → 1) · Esc: done`;
    } else if (t.k === 'grab') text = 'Aim where it goes and click to drop it · Esc: put it back';
    this.hint.textContent = text;
  }

  setHoverText(s: string): void {
    this.hover.textContent = s;
    this.hover.classList.toggle('on', !!s);
  }

  // -------------------------------------------------------------------------------------------
  // inspector (right)

  refreshInspector(): void {
    // not while a slider is being dragged (it would be pulled from under the mouse): after it
    const a = document.activeElement as HTMLElement | null;
    const focused = a && this.right.contains(a) && a.matches('input, select') ? a : null;
    if (focused && this.pointerHeld) {
      this.inspectorDirty = true;
      return;
    }
    this.inspectorDirty = false;
    if (this.sheet) {
      // touch: only the edit sheet, and only while it is up with something selected
      if (!this.sheetOpen || !this.ed.selection.length) {
        this.sheetOpen = false;
        this.sheet.classList.remove('on');
        return;
      }
      this.sheet.classList.add('on');
      const head = this.touchLayer!.sheetHead(() => this.closeSheet());
      this.sheet.querySelector('.ed-t-sheethead')?.remove();
      this.sheet.prepend(head);
    }
    // the field you are in stays focused after the rebuild (same place in the panel)
    const fields = () => Array.from(this.right.querySelectorAll<HTMLElement>('input, select'));
    const at = focused ? fields().indexOf(focused) : -1;
    const ed = this.ed;
    const sel = ed.selection;
    let content: (Node | null)[];
    if (
      !this.sheet &&
      ed.tool.k === 'place' &&
      BLOCK_BRUSHES.some((b) => b.id === (ed.tool as { brush: BrushId }).brush)
    )
      content = this.brushPanel(ed.tool.brush);
    else if (!sel.length) content = this.mapPanel();
    else if (sel.length > 1) content = this.multiPanel();
    else content = this.onePanel(sel[0]);
    this.right.replaceChildren(...nn(content));
    if (at >= 0) {
      const f = fields()[at];
      if (f && f.tagName === focused!.tagName) f.focus({ preventScroll: true });
    }
  }

  /** a mouse button is down on the inspector (a slider drag) */
  private pointerHeld = false;
  private onPointerUp = (): void => {
    this.pointerHeld = false;
    if (this.inspectorDirty) window.setTimeout(() => this.refreshInspector(), 0);
  };

  private title(text: string, icon: EditorIconName): HTMLElement {
    return h('h3', { class: 'ed-title' }, edIcon(icon), text);
  }

  private actions(...b: (HTMLElement | null)[]): HTMLElement {
    return h('div', { class: 'ed-actions' }, ...b);
  }

  private commonActions(): HTMLElement | null {
    if (this.touchLayer) return null; // (touch: the sheet's quick buttons)
    const ed = this.ed;
    const piece = ed.selection.some((r) => r.k === 'block' || r.k === 'base');
    return h(
      'div',
      { class: 'ed-block' },
      this.actions(
        edButton('copy', 'Copy', () => ed.duplicateSelection(), undefined, 'Ctrl+D'),
        edButton('move', 'Move to aim', () => ed.startGrab(), undefined, 'G'),
        edButton('rotate', 'Turn', () => ed.rotateSelection(15), undefined, 'R'),
        edButton('trash', 'Delete', () => ed.deleteSelection(), 'btn small orange', 'Delete / X'),
        piece
          ? edButton(
              'select',
              'Select connected',
              () => ed.selectConnected(),
              undefined,
              'Everything built onto it (L)',
            )
          : null,
      ),
      piece
        ? toggleRow('Just this piece (drags leave what is built onto it)', ed.justThis, (v) =>
            ed.setJustThis(v),
          )
        : null,
    );
  }

  private mapPanel(): (Node | null)[] {
    const ed = this.ed;
    const d = ed.doc;
    const r = d.race;
    const out: (Node | null)[] = [this.title('Map', 'map')];
    if (!ed.isPatch)
      out.push(
        selectRow('Sky', SKIES, d.sky, (v) => {
          ed.commit({ ...d, sky: v });
          ed.refreshLook();
        }),
      );
    else
      out.push(
        h(
          'p',
          { class: 'ed-tip' },
          `This is ${ed.session.kind === 'official' ? 'the real' : 'your version of'} ${ed.baseName}. Click any part of it to change or delete it.`,
        ),
      );
    // race
    const tick = (ok: boolean) => h('span', { class: ok ? 'ed-ok' : 'ed-no' }, ok ? '✓' : '—');
    out.push(
      h('div', { class: 'ed-sub' }, 'Race'),
      h(
        'div',
        { class: 'ed-racebar' },
        h('span', {}, tick(!!r.start), ' Start'),
        h('span', {}, `${r.checkpoints.length} checkpoint${r.checkpoints.length === 1 ? '' : 's'}`),
        h('span', {}, tick(!!r.finish), ' Finish'),
      ),
    );
    if (ed.isPatch && ed.baseDef?.race && !isRace(d))
      out.push(
        h(
          'p',
          { class: 'ed-tip' },
          `${ed.baseName}'s own race stays as it is (its gates are shown dimmed). Add a Start and a Finish here to give it a new race instead.`,
        ),
      );
    if (r.checkpoints.length)
      out.push(
        h(
          'ol',
          { class: 'ed-cps' },
          ...r.checkpoints.map((g, i) =>
            h(
              'li',
              {},
              this.linkBtn(g.name || `Checkpoint ${i + 1}`, () =>
                this.selectAndFocus({ k: 'cp', i }),
              ),
              edButton(
                'up',
                '',
                () => ed.commit(moveCheckpoint(ed.doc, i, -1)),
                'btn tiny secondary ed-sq',
                'Earlier',
              ),
              edButton(
                'down',
                '',
                () => ed.commit(moveCheckpoint(ed.doc, i, 1)),
                'btn tiny secondary ed-sq',
                'Later',
              ),
            ),
          ),
        ),
      );
    out.push(
      this.actions(
        edButton('start', r.start ? 'Move start' : 'Add start', () => ed.setBrush('start')),
        edButton('checkpoint', 'Add checkpoint', () => ed.setBrush('checkpoint')),
        edButton('finish', r.finish ? 'Move finish' : 'Add finish', () => ed.setBrush('finish')),
      ),
      toggleRow('Surf map (no jetpack, no SURGE)', !!r.surf, (v) =>
        ed.commit({ ...ed.doc, race: { ...ed.doc.race, surf: v || undefined } }),
      ),
      row(
        'Fall height',
        numBox(
          r.killY ?? NaN,
          (v) => ed.commit({ ...ed.doc, race: { ...ed.doc.race, killY: v } }),
          { step: 1, title: 'Below this height a racer is sent back (empty: automatic)' },
        ),
        r.killY !== undefined
          ? edButton(
              null,
              'Auto',
              () => {
                const { killY: _k, ...rest } = ed.doc.race;
                void _k;
                ed.commit({ ...ed.doc, race: rest });
              },
              'btn tiny secondary',
            )
          : h('span', { class: 'ed-unit' }, 'auto'),
      ),
      h('div', { class: 'ed-sub' }, 'Players'),
      h(
        'p',
        { class: 'ed-tip' },
        `${d.spawns.length} spawn point${d.spawns.length === 1 ? '' : 's'}${ed.isPatch && !d.spawns.length ? ' (the map keeps its own)' : ''}.`,
      ),
      this.actions(edButton('spawn', 'Add spawn point', () => ed.setBrush('spawn'))),
      h('p', { class: 'ed-tip' }, 'Click something to change it. Press H for all the keys.'),
    );
    return out;
  }

  private multiPanel(): (Node | null)[] {
    const ed = this.ed;
    return [
      this.title(
        ed.selection.every((r) => r.k === 'block' || r.k === 'base')
          ? `${ed.selection.length} pieces`
          : `${ed.selection.length} things selected`,
        'select',
      ),
      this.commonActions(),
      this.actions(
        edButton(null, 'Smaller', () => ed.scaleSelection(1 / 1.25), undefined, '['),
        edButton(null, 'Bigger', () => ed.scaleSelection(1.25), undefined, ']'),
      ),
      h(
        'p',
        { class: 'ed-tip' },
        'Shift-click to add or remove one. Arrows move them one grid step.',
      ),
    ];
  }

  private onePanel(r: Ref): (Node | null)[] {
    const ed = this.ed;
    const d = ed.doc;
    switch (r.k) {
      case 'base':
        return [
          this.title(ed.describe(r), 'block'),
          h(
            'p',
            { class: 'ed-tip' },
            ed.session.kind === 'official'
              ? 'A piece of the real map. Change or delete it; players see it when you publish.'
              : 'A piece of the built-in map. Changing it only changes your version.',
          ),
          this.actions(
            edButton(
              'move',
              'Change it',
              () => ed.adoptSelection(),
              'btn small',
              'Turn it into a block you can move, turn, resize and repaint',
            ),
            edButton('trash', 'Delete', () => ed.deleteSelection(), 'btn small orange'),
          ),
          this.commonActions(),
        ];
      case 'block': {
        const b = blockById(d, r.id);
        return b ? this.blockPanel(b) : [];
      }
      case 'point': {
        const m = moverOf(d, r.id);
        const p = m?.points[r.i];
        if (!m || !p) return [];
        return [
          this.title(`Point ${r.i + 1} of a moving block`, 'moving'),
          vecRow('Position', p, (v) => ed.setMoverPointAt(r.id, r.i, v)),
          this.actions(
            edButton('select', 'Select the block', () => ed.select([{ k: 'block', id: r.id }])),
            edButton(
              'trash',
              'Remove point',
              () =>
                ed.commit(removeMoverPoint(ed.doc, r.id, r.i), null, [{ k: 'block', id: r.id }]),
              'btn small orange',
            ),
          ),
        ];
      }
      case 'start':
      case 'finish':
      case 'cp': {
        const g = gateOf(d, r);
        if (!g) return [];
        const set = (ng: CustomGate) => ed.commit(setGate(ed.doc, r, ng));
        const out: (Node | null)[] = [
          this.title(
            ed.describe(r),
            r.k === 'cp' ? 'checkpoint' : r.k === 'start' ? 'start' : 'finish',
          ),
          vecRow('Position', g.pos, (v) => set({ ...g, pos: v })),
          vecRow('Size', g.size, (v) => set({ ...g, size: v }), {
            min: 0.5,
            names: ['w', 'h', 'd'],
          }),
          row(
            'Facing',
            numBox(g.yaw, (v) => set({ ...g, yaw: v }), { step: 15 }),
            h('span', { class: 'ed-unit' }, '°'),
          ),
        ];
        if (r.k === 'cp') {
          const nameBox = h('input', {
            class: 'ed-text',
            value: g.name ?? '',
            placeholder: 'Name (optional)',
            maxlength: '40',
          });
          nameBox.addEventListener('keydown', (e) => e.stopPropagation());
          nameBox.addEventListener('change', () => {
            const v = nameBox.value.trim();
            const { name: _n, ...rest } = g;
            void _n;
            set(v ? { ...rest, name: v } : rest);
          });
          out.push(
            row('Name', nameBox),
            row(
              'Order',
              h('span', {}, `${r.i + 1} of ${d.race.checkpoints.length}`),
              edButton(
                'up',
                'Earlier',
                () =>
                  ed.commit(moveCheckpoint(ed.doc, r.i, -1), null, [
                    { k: 'cp', i: Math.max(0, r.i - 1) },
                  ]),
                'btn tiny secondary',
              ),
              edButton(
                'down',
                'Later',
                () =>
                  ed.commit(moveCheckpoint(ed.doc, r.i, 1), null, [
                    { k: 'cp', i: Math.min(d.race.checkpoints.length - 1, r.i + 1) },
                  ]),
                'btn tiny secondary',
              ),
            ),
          );
        }
        out.push(
          h(
            'p',
            { class: 'ed-tip' },
            'Racers pass through it. After a fall they come back at its bottom middle, so keep it on a floor.',
          ),
          this.commonActions(),
        );
        return out;
      }
      case 'spawn': {
        const s = d.spawns[r.i];
        if (!s) return [];
        const set = (ns: typeof s) => ed.commit(setSpawn(ed.doc, r.i, ns));
        return [
          this.title('Spawn point', 'spawn'),
          vecRow('Feet at', s.pos, (v) => set({ ...s, pos: v })),
          row(
            'Facing',
            numBox(s.yaw, (v) => set({ ...s, yaw: v }), { step: 15 }),
            h('span', { class: 'ed-unit' }, '°'),
          ),
          selectRow<'any' | '0' | '1'>(
            'Team',
            [
              ['any', 'Anyone'],
              ['0', 'Team 1 (cyan)'],
              ['1', 'Team 2 (orange)'],
            ],
            s.team === undefined ? 'any' : (String(s.team) as '0' | '1'),
            (v) => {
              const { team: _t, ...rest } = s;
              void _t;
              set(v === 'any' ? rest : { ...rest, team: Number(v) as 0 | 1 });
            },
          ),
          this.commonActions(),
        ];
      }
      case 'portal': {
        const p = d.portals[r.i];
        if (!p) return [];
        const set = (np: typeof p) => ed.commit(setPortal(ed.doc, r.i, np));
        return [
          this.title(`Portal ${r.i + 1}`, 'portal'),
          vecRow('Entry', p.from.pos, (v) => set({ ...p, from: { ...p.from, pos: v } })),
          vecRow('Entry size', p.from.size, (v) => set({ ...p, from: { ...p.from, size: v } }), {
            min: 0.5,
            names: ['w', 'h', 'd'],
          }),
          vecRow('Exit', p.to, (v) => set({ ...p, to: v })),
          toggleRow('Both ways (walk back through the exit)', !!p.twoWay, (v) => {
            const { twoWay: _t, ...rest } = p;
            void _t;
            set(v ? { ...rest, twoWay: true } : rest);
          }),
          swatchRow(
            'Colour',
            PORTAL_COLORS,
            p.color ?? PORTAL_COLORS[0],
            (c) => set({ ...p, color: c ?? PORTAL_COLORS[0] }),
            { picker: true },
          ),
          this.actions(
            edButton('portal', 'Place the exit again', () =>
              ed.setTool({ k: 'portalExit', i: r.i }),
            ),
          ),
          this.commonActions(),
        ];
      }
      case 'pad': {
        const p = d.launchPads[r.i];
        if (!p) return [];
        const aim = padAim(p);
        const set = (np: typeof p, key: string | null = null) =>
          ed.commit(setPad(ed.doc, r.i, np), key);
        return [
          this.title('Launch pad', 'pad'),
          vecRow('Position', p.pos, (v) => set({ ...p, pos: v })),
          vecRow('Size', p.size, (v) => set({ ...p, size: v }), {
            min: 0.3,
            names: ['w', 'h', 'd'],
          }),
          row(
            'Throws toward',
            numBox(aim.yaw, (v) => set({ ...p, vel: padVel(v, aim.forward, aim.up) }), {
              step: 15,
            }),
            h('span', { class: 'ed-unit' }, '°'),
          ),
          sliderRow('Forward power', 0, 40, 0.5, aim.forward, 'm/s', (v, final) =>
            this.drag(final, () => set({ ...p, vel: padVel(aim.yaw, v, aim.up) }, `padf${r.i}`)),
          ),
          sliderRow('Up power', 0, 40, 0.5, aim.up, 'm/s', (v, final) =>
            this.drag(final, () =>
              set({ ...p, vel: padVel(aim.yaw, aim.forward, v) }, `padu${r.i}`),
            ),
          ),
          this.commonActions(),
        ];
      }
      case 'basePortal':
      case 'basePad':
        return [
          this.title(ed.describe(r), r.k === 'basePortal' ? 'portal' : 'pad'),
          h(
            'p',
            { class: 'ed-tip' },
            'Part of the built-in map: you can delete it, and place new ones from the Game tab.',
          ),
          this.actions(
            edButton(
              'trash',
              'Delete',
              () => ed.commit(deleteRefs(ed.doc, [r]), null, []),
              'btn small orange',
            ),
          ),
        ];
    }
  }

  private blockPanel(b: CustomBlock): (Node | null)[] {
    const ed = this.ed;
    const id = b.id;
    const set = (c: Partial<CustomBlock>, key: string | null = null) =>
      ed.commit(updateBlock(ed.doc, id, c), key);
    const curve = isCurveShape(b.shape);
    const out: (Node | null)[] = [
      this.title(blockName(b), moverOf(ed.doc, id) ? 'moving' : 'block'),
      vecRow('Position', b.pos, (v) => set({ pos: v })),
    ];
    if (!curve)
      out.push(
        vecRow('Size', b.size, (v) => set({ size: v }), { min: 0.1, names: ['w', 'h', 'd'] }),
      );
    else
      out.push(
        ...this.curvePanel(
          b.shape,
          b.size as V3,
          { kind: 'arc', ...(b.curve ?? { radius: 10, angle: 90 }) },
          (c, final) =>
            this.drag(final, () => {
              const cur = blockById(ed.doc, id);
              const pos =
                cur?.curve && c.curve
                  ? posKeepingStart(cur.pos, cur.rot?.[0] ?? 0, cur.curve, c.curve)
                  : undefined;
              const next = updateBlock(ed.doc, id, pos ? { ...c, pos } : c);
              const nb0 = blockById(next, id);
              ed.commit(nb0 ? updateBlock(next, id, fitWave(nb0)) : next, `curve${id}`);
              const nb = blockById(ed.doc, id);
              if (nb) ed.rememberCurve(nb);
            }),
        ),
      );
    const rot = b.rot ?? [0, 0, 0];
    out.push(
      vecRow('Turn', rot, (v) => set({ rot: v }), { step: 15, names: ['↻', 'tilt', 'roll'] }),
    );
    if (b.shape !== 'killpaint') {
      out.push(
        h(
          'div',
          { class: 'ed-block' },
          h('div', { class: 'ed-label' }, 'Material'),
          h(
            'div',
            { class: 'ed-mats' },
            ...MATERIALS.map((m) => {
              const btn = h(
                'button',
                { type: 'button', class: `ed-mat${b.mat === m.id ? ' on' : ''}` },
                h('span', { class: 'ed-dot' }),
                m.label,
              );
              (btn.firstChild as HTMLElement).style.background = hex(materialColor(m.id));
              btn.addEventListener('click', () => set({ mat: m.id }));
              return btn;
            }),
          ),
        ),
        swatchRow(
          'Colour',
          SWATCHES,
          b.color ?? null,
          (c) => {
            if (c === null) {
              const { color: _c, ...rest } = ed.doc.blocks.find((x) => x.id === id)!;
              void _c;
              ed.commit({ ...ed.doc, blocks: ed.doc.blocks.map((x) => (x.id === id ? rest : x)) });
            } else set({ color: c });
          },
          { none: "The material's own colour", picker: true },
        ),
        toggleRow('Walk through it (decoration only)', !!b.noCollide, (v) =>
          set({ noCollide: v || undefined }),
        ),
      );
    } else
      out.push(
        h(
          'p',
          { class: 'ed-tip ed-danger' },
          'Kill paint: anyone who touches it dies (in a race: back to the last checkpoint).',
        ),
      );
    out.push(this.moverSection(b), this.commonActions());
    return out;
  }

  private moverSection(b: CustomBlock): HTMLElement {
    const ed = this.ed;
    const id = b.id;
    const m = moverOf(ed.doc, id);
    const box = h('div', { class: 'ed-mover' }, h('div', { class: 'ed-sub' }, 'Moving block'));
    if (!m) {
      box.append(
        h(
          'p',
          { class: 'ed-tip' },
          'Make it move between 2, 3 or 4 points at your speed, waiting at each one. After the last point it goes back to 1, forever.',
        ),
        this.actions(
          edButton('moving', 'Make it move', () => ed.makeMove(id), 'btn small primary', 'M'),
        ),
      );
      return box;
    }
    const pts = [b.pos, ...m.points.slice(1)];
    box.append(
      h(
        'ol',
        { class: 'ed-points' },
        ...pts.map((p, i) =>
          h(
            'li',
            {},
            h('span', { class: 'ed-pnum' }, String(i + 1)),
            h(
              'span',
              { class: 'ed-pxyz' },
              i === 0 ? 'the block itself' : p.map((x) => Math.round(x * 10) / 10).join(', '),
            ),
            i > 0
              ? edButton(
                  'select',
                  '',
                  () => this.selectAndFocus({ k: 'point', id, i }),
                  'btn tiny secondary ed-sq',
                  'Select this point (to move it)',
                )
              : null,
            i > 0
              ? edButton(
                  'trash',
                  '',
                  () => ed.commit(removeMoverPoint(ed.doc, id, i)),
                  'btn tiny secondary ed-sq',
                  'Remove this point',
                )
              : null,
          ),
        ),
      ),
    );
    if (pts.length < CUSTOM_MAP_LIMITS.moverPoints[1])
      box.append(
        this.actions(
          edButton(
            'plus',
            `Add point ${pts.length + 1}`,
            () => ed.addPoint(id),
            'btn small primary',
            'N',
          ),
        ),
      );
    if (pts.length < 2)
      box.append(h('p', { class: 'ed-tip ed-warn' }, 'Add point 2 so it has somewhere to go.'));
    box.append(
      sliderRow(
        'Speed',
        CUSTOM_MAP_LIMITS.moverSpeed[0],
        CUSTOM_MAP_LIMITS.moverSpeed[1],
        0.5,
        m.speed,
        'm/s',
        (v, final) =>
          this.drag(final, () => ed.commit(setMoverTiming(ed.doc, id, { speed: v }), `speed${id}`)),
      ),
      sliderRow(
        'Delay',
        CUSTOM_MAP_LIMITS.moverDelay[0],
        CUSTOM_MAP_LIMITS.moverDelay[1],
        0.25,
        m.delay,
        's',
        (v, final) =>
          this.drag(final, () => ed.commit(setMoverTiming(ed.doc, id, { delay: v }), `delay${id}`)),
      ),
    );
    if (pts.length >= 2)
      box.append(
        h(
          'p',
          { class: 'ed-tip' },
          `Waits ${m.delay} s at each point. One loop 1 → ${pts.length} → 1 takes ${Math.round(moverCycle(pts as V3[], m.speed, m.delay) * 10) / 10} s.`,
        ),
      );
    box.append(
      this.actions(
        edButton('restore', 'Restart preview', () => ed.view.resetTime()),
        edButton(
          'trash',
          'Stop moving',
          () => ed.commit(stopMover(ed.doc, id)),
          'btn small orange',
        ),
      ),
    );
    return box;
  }

  private pendingDrag: (() => void) | null = null;

  /**
   * A slider drag is one undo step: every change merges, the release ends the step. While
   * dragging, changes apply at most once a frame (a big map stays smooth).
   */
  private drag(final: boolean, apply: () => void): void {
    if (final) {
      this.pendingDrag = null;
      apply();
      this.ed.session.history.seal();
      return;
    }
    const first = !this.pendingDrag;
    this.pendingDrag = apply;
    if (first)
      requestAnimationFrame(() => {
        const f = this.pendingDrag;
        this.pendingDrag = null;
        f?.();
      });
  }

  /**
   * A curve's settings: its type, quick presets, and sliders for everything it has. set
   * gets the changed size / curve (final = the slider was let go).
   */
  private curvePanel(
    shape: CustomShape,
    size: V3,
    curve: Curve,
    set: (c: { size?: V3; curve?: Curve }, final: boolean) => void,
    handlesTip = true,
  ): HTMLElement[] {
    const kind = curve.kind ?? 'arc';
    const f = curveFields(shape, kind);
    const L = CURVE_LIMITS;
    const out: HTMLElement[] = [];
    const setC = (c: Partial<Curve>, final: boolean) => set({ curve: { ...curve, ...c } }, final);
    if (f.kinds) {
      out.push(
        h('div', { class: 'ed-sub' }, 'Curve type'),
        h(
          'div',
          { class: 'ed-kinds' },
          ...CURVE_KINDS.map((k) => {
            const b = h(
              'button',
              { type: 'button', class: `ed-kind-btn${kind === k.id ? ' on' : ''}`, title: k.desc },
              edIcon(KIND_ICON[k.id]),
              h('span', {}, k.label),
            );
            b.addEventListener('click', () => {
              set({ curve: setCurveKind(curve, k.id) }, true);
              b.blur();
            });
            return b;
          }),
        ),
      );
      const presets = CURVE_PRESETS.filter((p) => p.shapes.includes(shape));
      if (presets.length)
        out.push(
          h(
            'div',
            { class: 'ed-presets' },
            ...presets.map((p) => {
              const b = h('button', { type: 'button', class: 'chip ed-preset' }, p.label);
              b.addEventListener('click', () => {
                set({ curve: applyPreset(curve, p) }, true);
                b.blur();
              });
              return b;
            }),
          ),
        );
    }
    const left = curve.angle < 0;
    if (shape === 'quarterPipe') {
      out.push(
        sliderRow(
          'Curves up',
          L.pipeAngle[0],
          L.pipeAngle[1],
          L.pipeAngle[2],
          Math.abs(curve.angle),
          '°',
          (v, fin) => setC({ angle: v }, fin),
        ),
      );
    } else {
      const dirs = h(
        'div',
        { class: 'seg ed-dir' },
        ...(
          [
            [true, 'Left'],
            [false, 'Right'],
          ] as const
        ).map(([l, label]) => {
          const b = h('button', { type: 'button', 'aria-selected': String(left === l) }, label);
          b.addEventListener('click', () => {
            if (left !== l) setC({ angle: -curve.angle }, true);
            b.blur();
          });
          return b;
        }),
      );
      out.push(
        row('Turns', dirs),
        sliderRow(
          'Turn',
          L.angle[0],
          L.angle[1],
          L.angle[2],
          Math.abs(curve.angle),
          '°',
          (v, fin) => setC({ angle: left ? -v : v }, fin),
        ),
        sliderRow(
          kind === 'spiral' ? 'Start radius' : 'Radius',
          L.radius[0],
          L.radius[1],
          L.radius[2],
          curve.radius,
          'm',
          (v, fin) => setC({ radius: v }, fin),
        ),
      );
      if (f.endRadius)
        out.push(
          sliderRow(
            'End radius',
            L.endRadius[0],
            L.endRadius[1],
            L.endRadius[2],
            curve.endRadius ?? curve.radius,
            'm',
            (v, fin) => setC({ endRadius: v }, fin),
          ),
        );
      out.push(
        sliderRow('Climb / drop', L.rise[0], L.rise[1], L.rise[2], curve.rise ?? 0, 'm', (v, fin) =>
          setC({ rise: v }, fin),
        ),
      );
      if (f.wave) {
        // (a surf ramp's humps are kept gentle enough to ride: the game says how high they may be)
        let cap: number = L.amplitude[1];
        try {
          cap = Math.min(
            cap,
            maxWaveAmplitude({ id: 0, shape, pos: [0, 0, 0], size, mat: 'concrete', curve }),
          );
        } catch {
          /* keep the plain limit */
        }
        cap = Math.floor(cap * 4) / 4;
        const waveRow = sliderRow(
          'Wave height',
          -Math.max(cap, 0.25),
          Math.max(cap, 0.25),
          L.amplitude[2],
          Math.max(-cap, Math.min(cap, curve.amplitude ?? 2)),
          'm',
          (v, fin) => setC({ amplitude: v }, fin),
        );
        // no room at all: the climb / drop alone is as steep as a surf ramp may wave
        if (cap <= 0)
          for (const i of waveRow.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
            'input, button',
          ))
            i.disabled = true;
        out.push(
          waveRow,
          sliderRow('Waves', L.waves[0], L.waves[1], L.waves[2], curve.waves ?? 2, '', (v, fin) =>
            setC({ waves: v }, fin),
          ),
        );
        if (cap <= 0)
          out.push(
            h('p', { class: 'ed-tip ed-warn' }, 'Too steep for waves: make it climb or drop less.'),
          );
        else if (cap < L.amplitude[1])
          out.push(
            h(
              'p',
              { class: 'ed-tip' },
              `Wave height is limited to ${cap} m here so surfers don't catch on the bumps.${shape === 'curveSurf' ? ' More smoothness allows bigger waves.' : ''}`,
            ),
          );
      }
    }
    // (a curved surf ramp's width comes from its height and steepness)
    if (shape !== 'curveSurf')
      out.push(
        sliderRow('Width', L.width[0], L.width[1], L.width[2], size[0], 'm', (v, fin) =>
          set({ size: [v, size[1], size[2]] }, fin),
        ),
      );
    const tall = shape === 'curveSurf' || shape === 'quarterPipe';
    const hl = tall ? L.height : L.thickness;
    out.push(
      sliderRow(tall ? 'Height' : 'Thickness', hl[0], hl[1], hl[2], size[1], 'm', (v, fin) =>
        set({ size: [size[0], v, size[2]] }, fin),
      ),
    );
    if (f.steepness)
      out.push(
        sliderRow(
          'Steepness',
          L.steepness[0],
          L.steepness[1],
          L.steepness[2],
          curve.steepness ?? 55,
          '°',
          (v, fin) => setC({ steepness: v }, fin),
        ),
      );
    if (f.bank)
      out.push(
        sliderRow('Bank', L.bank[0], L.bank[1], L.bank[2], curve.bank ?? 0, '°', (v, fin) =>
          setC({ bank: v }, fin),
        ),
      );
    // the pieces the game builds it from (its own default when not set)
    let autoSeg = 8;
    try {
      autoSeg = blockPieceCount({ id: 0, shape, pos: [0, 0, 0], size, mat: 'concrete', curve });
    } catch {
      /* keep 8 */
    }
    out.push(
      sliderRow(
        'Smoothness',
        L.segments[0],
        L.segments[1],
        L.segments[2],
        curve.segments ?? autoSeg,
        'pieces',
        (v, fin) => setC({ segments: Math.round(v) }, fin),
      ),
    );
    if (f.kinds && handlesTip)
      out.push(
        h(
          'p',
          { class: 'ed-tip' },
          'Tip: drag the blue ball at its end to bend it, the orange arrow to raise or lower the end.',
        ),
      );
    return out;
  }

  /** While placing a block: what the next one will be (its size, and its curve). */
  private brushPanel(brush: BrushId): (Node | null)[] {
    const ed = this.ed;
    const bb = BLOCK_BRUSHES.find((b) => b.id === brush);
    const st = ed.brushSettings(brush);
    if (!bb || !st) return [];
    const out: (Node | null)[] = [
      this.title(`Next: ${bb.label}`, BRUSH_ICON[brush]),
      h(
        'p',
        { class: 'ed-tip' },
        `${bb.desc}. Click in the world to place it. Press 1 (Select) to change pieces you placed.`,
      ),
    ];
    const set = (c: { size?: V3; curve?: Curve }, final: boolean) =>
      this.drag(final, () => ed.setBrushSettings(brush, c));
    if (st.curve) out.push(...this.curvePanel(bb.shape, st.size, st.curve, set, false));
    else
      out.push(
        vecRow('Size', st.size, (v) => set({ size: v }, true), {
          min: 0.1,
          names: ['w', 'h', 'd'],
        }),
      );
    out.push(
      this.actions(
        edButton(null, 'Smaller', () => ed.scaleSelection(1 / 1.25), undefined, '['),
        edButton(null, 'Bigger', () => ed.scaleSelection(1.25), undefined, ']'),
        edButton('rotate', 'Turn', () => ed.rotateSelection(15), undefined, 'R'),
      ),
    );
    return out;
  }

  private linkBtn(text: string, fn: () => void): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'ed-link' }, text);
    b.addEventListener('click', fn);
    return b;
  }

  private selectAndFocus(r: Ref): void {
    this.ed.select([r]);
    this.ed.focusSelection();
  }

  // -------------------------------------------------------------------------------------------
  // save / publish / test

  async save(): Promise<void> {
    const ed = this.ed;
    if (!ed.runChecks()) return this.showProblems();
    const s = ed.session;
    const doc = ed.doc;
    this.toast('Saving…', 'save');
    try {
      // an admin's edit of the real map saves as a private copy (never over the official one)
      const { id } = await saveMap(toCustomDoc(doc), s.kind === 'official' ? undefined : s.savedId);
      if (s.kind === 'own') s.savedId = id;
      if (s.kind === 'own') s.savedDoc = doc;
      saveDraft(s);
      this.toast(s.kind === 'official' ? 'A copy is saved in My Maps' : 'Saved to My Maps', 'save');
      if (!ed.app.editorView) return;
      this.refreshTop();
    } catch (e) {
      this.toast('', 'save');
      const guest = !account.me?.secured;
      this.openModal(
        'Not saved',
        [
          h('p', {}, errorText(e)),
          guest
            ? h(
                'p',
                {},
                'Saving maps needs a secured account: open your Profile from the title screen and secure it (it is free). You can keep building and testing meanwhile: your work is kept on this PC.',
              )
            : null,
        ].filter((x): x is HTMLParagraphElement => !!x),
        [{ label: 'OK', cls: 'btn small primary' }],
      );
    }
  }

  private async publish(): Promise<void> {
    const ed = this.ed;
    if (!ed.runChecks()) return this.showProblems();
    const ok = await confirmBox(
      this.root,
      'Publish to the real map?',
      `Everyone will play this version of ${ed.baseName}. Matches already running keep the old one.`,
      'Publish',
    );
    if (!ok) return;
    try {
      const doc = ed.doc;
      await publishOfficial(doc.base, toCustomDoc(doc));
      ed.session.savedDoc = doc;
      saveDraft(ed.session);
      this.toast(`${ed.baseName} is updated for everyone`);
      this.refreshTop();
    } catch (e) {
      this.openModal(
        'Not published',
        [h('p', {}, errorText(e))],
        [{ label: 'OK', cls: 'btn small primary' }],
      );
    }
  }

  private restoreMenu(): void {
    const ed = this.ed;
    const base = ed.doc.base;
    this.openModal(
      `Restore ${ed.baseName}`,
      [h('p', {}, 'Both keep every version in the history. Your edit stays open here.')],
      [
        { label: 'Cancel' },
        {
          label: 'Undo the last publish',
          cls: 'btn small secondary',
          onClick: () =>
            void undoOfficial(base).then(
              () => this.toast('The version before the last publish is back'),
              (e) => this.toast(errorText(e)),
            ),
        },
        {
          label: 'Put the original back',
          cls: 'btn small orange',
          onClick: () =>
            void restoreOfficial(base).then(
              () => this.toast(`The original ${ed.baseName} is back for everyone`),
              (e) => this.toast(errorText(e)),
            ),
        },
      ],
    );
  }

  testMenu(): void {
    const ed = this.ed;
    ed.runChecks();
    // an edit of a race map keeps that map's own race unless it is given a new one
    const race = isRace(ed.doc) || !!(ed.isPatch && ed.baseDef?.race);
    this.openModal(
      'Test your map',
      [
        h(
          'p',
          {},
          race
            ? 'It has a start and a finish: you can race it.'
            : 'Add a Start and a Finish (Game tab) to race it.',
        ),
        ed.errors.length
          ? h('p', { class: 'ed-danger' }, 'Fix the problems first (the red button at the top).')
          : null,
      ].filter((x): x is HTMLParagraphElement => !!x),
      [
        { label: 'Cancel' },
        {
          label: 'Play online with friends',
          cls: 'btn small secondary',
          onClick: () => this.test(race ? 'race' : 'freeRoam', true),
        },
        ...(race
          ? [
              {
                label: 'Race it',
                cls: 'btn small primary',
                onClick: () => this.test('race', false),
              },
            ]
          : []),
        {
          label: 'Walk around it',
          cls: race ? 'btn small secondary' : 'btn small primary',
          onClick: () => this.test('freeRoam', false),
        },
      ],
    );
  }

  /** Leave the editor for a test game; quitting the game comes back here. */
  test(mode: 'freeRoam' | 'race', online: boolean): void {
    const ed = this.ed;
    if (!ed.runChecks()) return this.showProblems();
    const doc = toCustomDoc(ed.doc);
    const { app, hooks } = ed;
    ed.dispose();
    app.setScreen(
      h(
        'div',
        { class: 'screen flow-screen quickplay-wait' },
        h('h2', { class: 'pause-title' }, online ? 'Making a room…' : 'Loading your map…'),
      ),
      'fade',
    );
    // (no await before the game starts: the click can still lock the mouse)
    playMap({ doc }, mode, { private: online, onExit: () => hooks.reopen() }).catch((e) =>
      hooks.reopen(errorText(e)),
    );
  }

  private exit(): void {
    this.ed.hooks.exit();
  }

  // -------------------------------------------------------------------------------------------
  // touch: the compact top bar and the ☰ menu

  private refreshTouchTop(): void {
    const ed = this.ed;
    const btn = (label: string, fn: () => void, cls = '', aria = label) => {
      const b = h(
        'button',
        { type: 'button', class: `ed-t-topbtn ${cls}`.trim(), 'aria-label': aria },
        label,
      );
      b.addEventListener('click', fn);
      return b;
    };
    const unsaved = ed.session.history.current !== ed.session.savedDoc;
    this.top.replaceChildren(
      btn('☰', () => this.openTouchMenu(), '', 'Menu'),
      h('span', { class: 'ed-t-name' }, `${ed.doc.name}${unsaved ? ' •' : ''}`),
      this.status,
      h('span', { class: 'ed-spacer' }),
      btn('↶', () => ed.undo(), '', 'Undo'),
      btn('↷', () => ed.redo(), '', 'Redo'),
      btn('▶ Play', () => ed.quick.toggle('camera'), 'primary', 'Play it now from here'),
      btn('Test…', () => this.testMenu(), '', 'Test'),
    );
    this.refreshStatus();
  }

  private openTouchMenu(): void {
    const ed = this.ed;
    const official = ed.session.kind === 'official' && isAdmin();
    const name = h('input', {
      class: 'ed-text ed-t-rename',
      value: ed.doc.name,
      maxlength: String(CUSTOM_MAP_LIMITS.nameLength),
      'aria-label': 'Map name',
    });
    name.addEventListener('change', () => {
      const v = name.value.trim().slice(0, CUSTOM_MAP_LIMITS.nameLength);
      if (v && v !== ed.doc.name) ed.commit({ ...ed.doc, name: v });
    });
    this.openModal(
      'Map Maker',
      [
        h('label', { class: 'ed-row' }, h('span', { class: 'ed-label' }, 'Name'), name),
        h(
          'p',
          {},
          `${ed.pieceCount()} / ${ed.maxPieces} pieces · your work is kept on this device.`,
        ),
      ],
      [
        { label: 'Back to building', cls: 'btn small primary' },
        { label: 'Save', onClick: () => void this.save() },
        ...(official
          ? [
              {
                label: 'Publish to the real map',
                cls: 'btn small orange',
                onClick: () => void this.publish(),
              },
              { label: 'Restore…', onClick: () => this.restoreMenu() },
            ]
          : []),
        { label: 'Map settings', onClick: () => this.mapSheet() },
        { label: 'How to', onClick: () => this.toggleHelp(true) },
        { label: 'Exit Map Maker', cls: 'btn small orange', onClick: () => this.exit() },
      ],
    );
  }

  /** Touch: the map's own settings (sky, race, spawns) in a dialog. */
  private mapSheet(): void {
    this.openModal('Map settings', nn(this.mapPanel()).slice(1) as Node[], [
      { label: 'Done', cls: 'btn small primary' },
    ]);
  }

  // -------------------------------------------------------------------------------------------
  // menu, help, dialogs, toasts

  openMenu(): void {
    if (this.touchLayer) return this.openTouchMenu();
    const ed = this.ed;
    this.openModal(
      'Map Maker',
      [h('p', {}, `${ed.doc.name} · your work is kept on this PC automatically.`)],
      [
        { label: 'Back to building', cls: 'btn small primary' },
        { label: 'Save', onClick: () => void this.save() },
        { label: 'Test', onClick: () => this.testMenu() },
        { label: 'How to', onClick: () => this.toggleHelp(true) },
        { label: 'Exit Map Maker', cls: 'btn small orange', onClick: () => this.exit() },
      ],
    );
  }

  openModal(
    title: string,
    body: (Node | string)[],
    buttons: { label: string; cls?: string; onClick?: () => void }[],
  ): void {
    this.closeModal();
    if (document.pointerLockElement) document.exitPointerLock();
    this.closeModalFn = modal(this.root, title, body, buttons, () => {
      this.closeModalFn = null;
    });
  }

  modalOpen(): boolean {
    return !!this.closeModalFn;
  }

  closeModal(): void {
    const f = this.closeModalFn;
    this.closeModalFn = null;
    f?.();
  }

  helpOpen(): boolean {
    return !!this.help;
  }

  toggleHelp(on = !this.help): void {
    if (!on) {
      this.help?.remove();
      this.help = null;
      return;
    }
    if (this.help) return;
    const close = edButton(null, 'Got it', () => this.toggleHelp(false), 'btn small primary');
    if (this.touchLayer) {
      this.help = h(
        'div',
        { class: 'ed-help panel interactive' },
        h('h3', {}, 'How to build'),
        h(
          'table',
          { class: 'controls ed-keys' },
          ...TOUCH_HELP_ROWS.map(([k, d]) =>
            h('tr', {}, h('td', { class: 'key' }, k), h('td', {}, d)),
          ),
        ),
        close,
      );
      this.root.append(this.help);
      return;
    }
    this.help = h(
      'div',
      { class: 'ed-help panel interactive' },
      h('h3', {}, 'How to build'),
      h(
        'ol',
        { class: 'ed-steps' },
        h('li', {}, 'Fly with W A S D, hold the right mouse button to look around.'),
        h(
          'li',
          {},
          'Pick a piece in the bar at the bottom (keys 1–0) or on the left, then click to place it.',
        ),
        h(
          'li',
          {},
          'Press 1 (Select) and click a piece to change it on the right; drag it to move it.',
        ),
        h(
          'li',
          {},
          `Press ${QUICK_TEST_LABEL} to play it right where you are, ${QUICK_TEST_LABEL} again to keep building. Save keeps it in My Maps.`,
        ),
      ),
      h(
        'table',
        { class: 'controls ed-keys' },
        ...HELP_ROWS.map(([k, d]) => h('tr', {}, h('td', { class: 'key' }, k), h('td', {}, d))),
      ),
      close,
    );
    this.root.append(this.help);
  }

  /** A short message at the bottom; `key` replaces the previous one with the same key. */
  toast(msg: string, key?: string): void {
    if (key) {
      this.toastKeys.get(key)?.remove();
      this.toastKeys.delete(key);
      if (!msg) return;
    }
    const t = h('div', { class: 'ed-toast' }, msg);
    this.toasts.append(t);
    if (key) this.toastKeys.set(key, t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => t.classList.add('fade'), 2600);
    window.setTimeout(() => {
      t.remove();
      if (key && this.toastKeys.get(key) === t) this.toastKeys.delete(key);
    }, 3100);
  }

  /** The box-select rectangle (screen pixels), or null to hide it. */
  boxRect(r: [number, number, number, number] | null): void {
    if (!r) {
      this.rect.classList.remove('on');
      return;
    }
    const [x0, y0, x1, y1] = r;
    Object.assign(this.rect.style, {
      left: `${Math.min(x0, x1)}px`,
      top: `${Math.min(y0, y1)}px`,
      width: `${Math.abs(x1 - x0)}px`,
      height: `${Math.abs(y1 - y0)}px`,
    });
    this.rect.classList.add('on');
  }
}

/** Without the nulls (replaceChildren would print them). */
const nn = <T>(a: (T | null | undefined)[]): T[] =>
  a.filter((x): x is T => x !== null && x !== undefined);

const localStorageFlag = (k: string): boolean => {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return true;
  }
};
const setLocalFlag = (k: string): void => {
  try {
    localStorage.setItem(k, '1');
  } catch {
    /* ignore */
  }
};
