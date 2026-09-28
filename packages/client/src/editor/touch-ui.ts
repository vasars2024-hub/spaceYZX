// MAP MAKER (touch) — the phone / tablet editor, Minecraft Pocket Edition style (search term:
// map maker mobile). Everything a finger needs on top of the 3D view:
//   stick (bottom left)     fly around            drag the view       look around
//   ▲ / ▼ + Fast (right)    fly up / down / fast  pinch               fly forward / back
//   hotbar (bottom)         9 slots, slot 1 = ✋   bag button          every piece, materials, colours
//   tap                     place the held piece on the face you tap (✋: select + edit sheet)
//   hold (0.5 s)            break (a ring fills while you hold; undo brings it back)
// The edit sheet itself is the desktop inspector (editor/ui.ts) in a bottom sheet, with big
// quick buttons on top (move pad, turn, size, copy, delete).
import { h } from '../ui/menus';
import type { MapEditor } from './editor';
import type { EditorUI } from './ui';
import { edIcon, type EditorIconName } from './icons';
import { GestureTracker, type GestureEvent } from './touch-gesture';
import {
  held,
  HOTBAR_SIZE,
  parseHotbar,
  pickBrush,
  selectSlot,
  type Hotbar,
  type Slot,
} from './hotbar';
import {
  BLOCK_BRUSHES,
  MATERIALS,
  materialColor,
  OBJECT_BRUSHES,
  SWATCHES,
  brushLabel,
  type BrushId,
} from './palette';
import { moverOf } from './model';
import { GRID_SIZES } from './snap';
import { hex } from './ui-kit';

const HOTBAR_KEY = 'spaceyz.mapmaker.hotbar';
const TUTORIAL_KEY = 'spaceyz.mapmaker.touchTutorial';
const ROTATE_KEY = 'spaceyz.mapmaker.rotateHint';
/** stick radius (px) */
const STICK_R = 56;

const readFlag = (k: string): boolean => {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return true;
  }
};
const writeFlag = (k: string): void => {
  try {
    localStorage.setItem(k, '1');
  } catch {
    /* ignore */
  }
};

export const SLOT_ICON = (s: Slot): EditorIconName =>
  s === 'hand' ? 'hand' : (s as EditorIconName);

/** The touch help (the ☰ menu's How to). */
export const TOUCH_HELP_ROWS: [string, string][] = [
  ['Stick (bottom left)', 'Fly around'],
  ['Drag the view', 'Look around'],
  ['▲ / ▼', 'Fly up / down · Fast: fly faster'],
  ['Two fingers', 'Pinch to fly forward / back'],
  ['Tap', 'Place the piece in your hand on the face you tap'],
  ['Hold (½ second)', 'Break the piece under your finger (↶ brings it back)'],
  ['✋ (slot 1) + tap', 'Select a piece and change it in the sheet'],
  ['✋ + drag a piece', 'Move it, with everything built onto it (Just this: only it)'],
  ['Bag (end of the hotbar)', 'All pieces, game items, materials and colours'],
  ['Swipe the sheet down', 'Close it'],
  ['▶ Play', 'Play it now from here · ◀ Build: back to building, nothing lost'],
];

export class TouchLayer {
  hotbar: Hotbar;
  private tracker = new GestureTracker();
  private stickZone: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private flyBox: HTMLElement;
  private bar: HTMLElement;
  private ring: HTMLElement;
  private ringArc: SVGCircleElement;
  private banner: HTMLElement;
  private inv: HTMLElement | null = null;
  private tutorial: HTMLElement | null = null;
  private movePad = false;
  /** a finger is dragging a piece (not looking) */
  private movingPiece = false;
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
  private oldTouchAction = '';

  constructor(
    private ed: MapEditor,
    private ui: EditorUI,
  ) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(HOTBAR_KEY);
    } catch {
      /* ignore */
    }
    this.hotbar = parseHotbar(raw);
    // the stick: a fixed zone at the bottom left, the knob follows the thumb
    this.stick = h('div', { class: 'tc-stick ed-t-stick' });
    this.knob = h('div', { class: 'tc-knob' });
    this.stick.append(this.knob);
    this.stickZone = h('div', { class: 'ed-t-stickzone interactive' }, this.stick);
    this.paintStick(0, 0);
    this.stickZone.addEventListener('pointerdown', this.stickDown);
    this.stickZone.addEventListener('pointermove', this.stickMove);
    this.stickZone.addEventListener('pointerup', this.stickUp);
    this.stickZone.addEventListener('pointercancel', this.stickUp);
    // fly up / down (held) + fast
    const fly = (label: string, dir: number, cls: string) => {
      const b = h(
        'button',
        { type: 'button', class: `ed-t-fly ${cls}`, 'aria-label': label },
        label === 'Fly up' ? '▲' : '▼',
      );
      const set = (v: number) => (e: Event) => {
        e.preventDefault();
        this.ed.touchFly = v;
        b.classList.toggle('held', v !== 0);
      };
      b.addEventListener('pointerdown', (e) => {
        b.setPointerCapture?.((e as PointerEvent).pointerId);
        // dragging a piece: ▲ / ▼ lift it one grid step instead of flying
        if (this.ed.touchDragging) {
          e.preventDefault();
          this.ed.touchDragLift(dir);
          return;
        }
        set(dir)(e);
      });
      b.addEventListener('pointerup', set(0));
      b.addEventListener('pointercancel', set(0));
      return b;
    };
    const fast = h('button', { type: 'button', class: 'ed-t-fast' }, 'Walk');
    fast.addEventListener('click', () => {
      this.ed.touchFast = !this.ed.touchFast;
      fast.textContent = this.ed.touchFast ? 'Fast' : 'Walk';
      fast.classList.toggle('on', this.ed.touchFast);
    });
    this.flyBox = h(
      'div',
      { class: 'ed-t-flybox interactive' },
      fly('Fly up', 1, 'up'),
      fly('Fly down', -1, 'down'),
      fast,
    );
    this.bar = h('div', { class: 'ed-t-hotbar interactive' });
    // the hold ring
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('width', '64');
    svg.setAttribute('height', '64');
    const back = document.createElementNS(svgNs, 'circle');
    const arc = document.createElementNS(svgNs, 'circle');
    for (const c of [back, arc]) {
      c.setAttribute('cx', '32');
      c.setAttribute('cy', '32');
      c.setAttribute('r', '26');
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke-width', '6');
    }
    back.setAttribute('stroke', 'rgba(0,0,0,0.35)');
    arc.setAttribute('stroke', '#ff4a5e');
    arc.setAttribute('stroke-linecap', 'round');
    arc.setAttribute('stroke-dasharray', String(2 * Math.PI * 26));
    arc.setAttribute('transform', 'rotate(-90 32 32)');
    svg.append(back, arc);
    this.ringArc = arc;
    this.ring = h('div', { class: 'ed-t-ring' });
    this.ring.append(svg);
    this.banner = h('div', { class: 'ed-t-banner interactive' });
    // the view: taps, holds, drags, pinches
    const canvas = this.ed.app.canvas;
    this.oldTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    this.on(canvas, 'pointerdown', (e) => this.viewDown(e as PointerEvent));
    this.on(canvas, 'pointermove', (e) => this.viewMove(e as PointerEvent));
    this.on(canvas, 'pointerup', (e) => this.viewUp(e as PointerEvent));
    this.on(canvas, 'pointercancel', (e) =>
      this.handle(this.tracker.cancel((e as PointerEvent).pointerId)),
    );
    // (no long-press menus, text selection or zooming anywhere in the editor)
    this.on(document, 'contextmenu', (e) => e.preventDefault());
    this.on(document, 'gesturestart', (e) => e.preventDefault());
  }

  /** What the touch editor adds over the view (appended to the editor's root). */
  elements(): HTMLElement[] {
    return [this.stickZone, this.flyBox, this.bar, this.banner, this.ring];
  }

  /** After the root is on screen: the one-time rotate hint and tutorial. */
  start(): void {
    this.refreshHotbar();
    this.refreshBanner();
    const portrait = (): boolean => {
      try {
        return matchMedia('(orientation: portrait)').matches;
      } catch {
        return false;
      }
    };
    if (portrait() && !readFlag(ROTATE_KEY)) {
      writeFlag(ROTATE_KEY);
      this.ui.openModal(
        'Turn your phone sideways',
        [
          h(
            'p',
            {},
            'The Map Maker works both ways, but sideways (landscape) gives you more room to build.',
          ),
        ],
        [{ label: 'OK', cls: 'btn small primary', onClick: () => this.maybeTutorial() }],
      );
    } else this.maybeTutorial();
  }

  dispose(): void {
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts);
    this.ed.app.canvas.style.touchAction = this.oldTouchAction;
    this.ed.touchMove = { x: 0, y: 0 };
    this.ed.touchFly = 0;
  }

  frame(): void {
    this.handle(this.tracker.tick(performance.now()));
  }

  private on(
    t: EventTarget,
    type: string,
    fn: (e: Event) => void,
    opts?: AddEventListenerOptions,
  ): void {
    t.addEventListener(type, fn, opts);
    this.listeners.push([t, type, fn, opts]);
  }

  // -------------------------------------------------------------------------------------------
  // the view

  private blocked(): boolean {
    // (testing: the game has the screen, taps are the game's)
    return this.ed.suspended || this.ui.modalOpen() || !!this.inv || !!this.tutorial;
  }

  private viewDown(e: PointerEvent): void {
    if (this.blocked()) return;
    e.preventDefault(); // (no mouse events made up from the touch, no text selection)
    try {
      this.ed.app.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.handle(this.tracker.down(e.pointerId, e.clientX, e.clientY, performance.now()));
  }

  private viewMove(e: PointerEvent): void {
    this.handle(this.tracker.move(e.pointerId, e.clientX, e.clientY, performance.now()));
  }

  private viewUp(e: PointerEvent): void {
    this.handle(this.tracker.up(e.pointerId, performance.now()));
  }

  private handle(events: GestureEvent[]): void {
    const ed = this.ed;
    // (✋ Edit: a hold does nothing; pieces are dragged instead of broken)
    const hand = ed.tool.k === 'select';
    for (const ev of events) {
      if (ev.k === 'dragStart') this.movingPiece = hand && ed.beginTouchDrag(ev.x0, ev.y0);
      else if (ev.k === 'look') {
        if (this.movingPiece) ed.touchDragTo(ev.x, ev.y);
        else ed.lookBy(ev.dx, ev.dy);
      } else if (ev.k === 'dragEnd') {
        if (this.movingPiece) ed.endTouchDrag();
        this.movingPiece = false;
      } else if (ev.k === 'pinch') ed.pinchBy(ev.d);
      else if (ev.k === 'tap') ed.tapAt(ev.x, ev.y);
      else if (ev.k === 'hold') {
        if (!hand) ed.breakAt(ev.x, ev.y);
      } else if (ev.k === 'holdProgress') {
        if (!hand || ev.p < 0) this.paintRing(ev.x, ev.y, ev.p);
      }
    }
  }

  private paintRing(x: number, y: number, p: number): void {
    if (p < 0) {
      this.ring.classList.remove('on');
      return;
    }
    // only over something that can break
    if (!this.ring.classList.contains('on') && !this.ed.refAt(x, y)) return;
    const len = 2 * Math.PI * 26;
    this.ringArc.setAttribute('stroke-dashoffset', String(len * (1 - Math.min(1, p))));
    this.ring.style.transform = `translate(${x - 32}px, ${y - 32}px)`;
    this.ring.classList.add('on');
  }

  // -------------------------------------------------------------------------------------------
  // the stick

  private paintStick(dx: number, dy: number): void {
    const r = STICK_R;
    this.stick.style.width = this.stick.style.height = `${r * 2}px`;
    this.knob.style.width = this.knob.style.height = `${r * 0.9}px`;
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.stick.classList.toggle('idle', this.stickId === null);
  }

  private stickCentre(): [number, number] {
    const b = this.stick.getBoundingClientRect();
    return [b.left + b.width / 2, b.top + b.height / 2];
  }

  private stickDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.stickId !== null) return;
    this.stickId = e.pointerId;
    try {
      this.stickZone.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.stickMove(e);
  };

  private stickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickId) return;
    const [cx, cy] = this.stickCentre();
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
    }
    // a small dead zone in the middle
    const k = (v: number) => (Math.abs(v) < STICK_R * 0.12 ? 0 : v / STICK_R);
    this.ed.touchMove = { x: k(dx), y: -k(dy) };
    this.paintStick(dx, dy);
  };

  private stickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.ed.touchMove = { x: 0, y: 0 };
    this.paintStick(0, 0);
  };

  // -------------------------------------------------------------------------------------------
  // hotbar + bag

  private saveHotbar(): void {
    try {
      localStorage.setItem(HOTBAR_KEY, JSON.stringify(this.hotbar));
    } catch {
      /* ignore */
    }
  }

  /** The hotbar follows the editor's tool (✋ = selecting, a slot = placing that piece). */
  refreshHotbar(): void {
    const t = this.ed.tool;
    if (t.k === 'select') this.hotbar = { ...this.hotbar, current: 0 };
    else if (t.k === 'place') {
      const i = this.hotbar.slots.indexOf(t.brush);
      // (picked elsewhere, e.g. Map settings' Add start: it joins the hotbar)
      this.hotbar = i > 0 ? { ...this.hotbar, current: i } : pickBrush(this.hotbar, t.brush);
    }
    const slots = this.hotbar.slots.slice(0, HOTBAR_SIZE).map((s, i) => {
      const b = h(
        'button',
        {
          type: 'button',
          class: `ed-t-slot${i === this.hotbar.current ? ' on' : ''}`,
          'aria-label': s === 'hand' ? 'Hand: select and edit' : brushLabel(s),
        },
        edIcon(SLOT_ICON(s)),
        h('span', { class: 'ed-t-slot-name' }, s === 'hand' ? 'Edit' : brushLabel(s)),
      );
      b.addEventListener('click', () => this.pickSlot(i));
      return b;
    });
    const bag = h(
      'button',
      { type: 'button', class: 'ed-t-slot ed-t-bag', 'aria-label': 'All pieces' },
      edIcon('bag'),
      h('span', { class: 'ed-t-slot-name' }, 'All'),
    );
    bag.addEventListener('click', () => this.openInventory());
    this.bar.replaceChildren(...slots, bag);
  }

  private pickSlot(i: number): void {
    this.hotbar = selectSlot(this.hotbar, i);
    this.saveHotbar();
    const s = held(this.hotbar);
    if (s !== 'hand') {
      this.ui.closeSheet();
      this.ed.select([]);
    }
    this.ed.setBrush(s === 'hand' ? 'select' : s);
  }

  openInventory(): void {
    if (this.inv) return;
    const ed = this.ed;
    const close = () => {
      this.inv?.remove();
      this.inv = null;
    };
    const tile = (label: string, art: HTMLElement, on: boolean, fn: () => void) => {
      const b = h(
        'button',
        { type: 'button', class: `ed-t-tile${on ? ' on' : ''}` },
        art,
        h('span', {}, label),
      );
      b.addEventListener('click', () => {
        fn();
        close();
      });
      return b;
    };
    const cur = held(this.hotbar);
    const piece = (id: BrushId, label: string) =>
      tile(label, edIcon(id as EditorIconName), cur === id, () => {
        this.hotbar = pickBrush(this.hotbar, id);
        this.saveHotbar();
        this.ui.closeSheet();
        ed.select([]);
        ed.setBrush(id);
      });
    const dot = (color: number) => {
      const d = h('span', { class: 'ed-t-dot' });
      d.style.background = hex(color);
      return d;
    };
    const section = (title: string, ...tiles: HTMLElement[]) =>
      h('section', {}, h('h3', {}, title), h('div', { class: 'ed-t-tiles' }, ...tiles));
    const closeBtn = h(
      'button',
      { type: 'button', class: 'btn small secondary ed-t-inv-close' },
      'Close',
    );
    closeBtn.addEventListener('click', close);
    this.inv = h(
      'div',
      { class: 'ed-t-inv interactive' },
      h('header', {}, h('h2', {}, 'All pieces'), closeBtn),
      section('Build', ...BLOCK_BRUSHES.map((b) => piece(b.id, b.label))),
      section('Game', ...OBJECT_BRUSHES.map((b) => piece(b.id, b.label))),
      section(
        'Made of',
        ...MATERIALS.map((m) =>
          tile(m.label, dot(materialColor(m.id)), ed.material === m.id, () => {
            ed.material = m.id;
            ed.setBrushRefresh();
            this.ui.toast(`New pieces: ${m.label}`);
          }),
        ),
      ),
      section(
        'Colour',
        tile('Its own', h('span', { class: 'ed-t-dot none' }, '∅'), ed.color === null, () => {
          ed.color = null;
          ed.setBrushRefresh();
        }),
        ...SWATCHES.map((c) =>
          tile('', dot(c), ed.color === c, () => {
            ed.color = c;
            ed.setBrushRefresh();
          }),
        ),
      ),
    );
    this.ui.root.append(this.inv);
  }

  // -------------------------------------------------------------------------------------------
  // the edit sheet's quick buttons, and the "tap where it goes" banner

  /** Big buttons over the sheet: move pad, turn, size, copy, delete, close. */
  sheetHead(close: () => void): HTMLElement {
    const ed = this.ed;
    const btn = (icon: EditorIconName | null, label: string, fn: () => void, cls = '') => {
      const b = h(
        'button',
        { type: 'button', class: `ed-t-qbtn ${cls}`.trim() },
        icon ? edIcon(icon) : null,
        h('span', {}, label),
      );
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      return b;
    };
    const grip = h(
      'div',
      { class: 'ed-t-grip', role: 'button', 'aria-label': 'Swipe down to close' },
      h('span', {}),
    );
    let y0: number | null = null;
    grip.addEventListener('pointerdown', (e) => {
      y0 = e.clientY;
      try {
        grip.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    grip.addEventListener('pointermove', (e) => {
      if (y0 !== null && e.clientY - y0 > 50) {
        y0 = null;
        close();
      }
    });
    grip.addEventListener('pointerup', () => (y0 = null));
    const quick = h(
      'div',
      { class: 'ed-t-quick' },
      btn(
        'move',
        'Move',
        () => {
          this.movePad = !this.movePad;
          this.ui.refreshInspector();
        },
        this.movePad ? 'on' : '',
      ),
      btn('rotate', '⟲ 15°', () => ed.rotateSelection(-15)),
      btn('rotate', '⟳ 15°', () => ed.rotateSelection(15)),
      btn(null, 'Smaller', () => ed.scaleSelection(1 / 1.25)),
      btn(null, 'Bigger', () => ed.scaleSelection(1.25)),
      btn('select', 'Connected', () => ed.selectConnected()),
      btn(
        null,
        ed.justThis ? '☑ Just this' : '☐ Just this',
        () => ed.setJustThis(!ed.justThis),
        ed.justThis ? 'on' : '',
      ),
      btn('copy', 'Copy', () => ed.duplicateSelection()),
      btn('trash', 'Delete', () => ed.deleteSelection(), 'danger'),
      btn(null, '✕', close, 'close'),
    );
    const out = h('div', { class: 'ed-t-sheethead' }, grip, quick);
    if (this.movePad) {
      const arrow = (label: string, code: string) =>
        btn(null, label, () => ed.nudge(ed.nudgeDir(code)), 'arrow');
      out.append(
        h(
          'div',
          { class: 'ed-t-pad' },
          h(
            'div',
            { class: 'ed-t-arrows' },
            h('span', {}),
            arrow('↑', 'ArrowUp'),
            h('span', {}),
            arrow('←', 'ArrowLeft'),
            arrow('↓', 'ArrowDown'),
            arrow('→', 'ArrowRight'),
          ),
          h('div', { class: 'ed-t-updown' }, arrow('Up', 'PageUp'), arrow('Down', 'PageDown')),
          h(
            'div',
            { class: 'ed-t-steps' },
            h('span', {}, 'Step'),
            ...GRID_SIZES.map((g) =>
              btn(
                null,
                `${g} m`,
                () => {
                  ed.grid = g;
                  this.ui.refreshInspector();
                },
                ed.grid === g ? 'on' : '',
              ),
            ),
          ),
        ),
      );
    }
    return out;
  }

  /** While placing a portal's exit or a moving block's points: say so, with Done. */
  refreshBanner(): void {
    const ed = this.ed;
    const t = ed.tool;
    const done = h('button', { type: 'button', class: 'btn small primary' }, 'Done');
    const centre = h('button', { type: 'button', class: 'btn small secondary' }, 'At the dot');
    centre.addEventListener('click', () => ed.tapAt(window.innerWidth / 2, window.innerHeight / 2));
    if (t.k === 'moverPoint') {
      const n = (moverOf(ed.doc, t.id)?.points.length ?? 1) + 1;
      done.addEventListener('click', () => {
        this.hotbar = { ...this.hotbar, current: 0 };
        ed.setTool({ k: 'select' });
        ed.select([{ k: 'block', id: t.id }]);
        this.ui.openSheet();
      });
      this.banner.replaceChildren(h('span', {}, `Tap where point ${n} goes`), centre, done);
      this.banner.classList.add('on');
    } else if (t.k === 'portalExit') {
      done.addEventListener('click', () => ed.setTool({ k: 'place', brush: 'portal' }));
      this.banner.replaceChildren(h('span', {}, 'Tap where the portal comes out'), centre, done);
      this.banner.classList.add('on');
    } else this.banner.classList.remove('on');
    this.ui.root.classList.toggle('ed-t-aiming', t.k === 'moverPoint' || t.k === 'portalExit');
  }

  // -------------------------------------------------------------------------------------------
  // first-time tutorial

  private maybeTutorial(): void {
    if (readFlag(TUTORIAL_KEY)) return;
    const steps: { text: string; cls: string }[] = [
      { text: 'Move with the stick', cls: 'stick' },
      { text: 'Drag to look around', cls: 'look' },
      { text: 'Tap to place the piece in your hand', cls: 'tap' },
      { text: 'Hold to break a piece', cls: 'hold' },
    ];
    let i = 0;
    const bubble = h('div', { class: 'ed-t-bubble' });
    const next = () => {
      if (i >= steps.length) {
        writeFlag(TUTORIAL_KEY);
        this.tutorial?.remove();
        this.tutorial = null;
        return;
      }
      const s = steps[i++];
      bubble.className = `ed-t-bubble ${s.cls}`;
      bubble.replaceChildren(
        h('span', {}, s.text),
        h(
          'small',
          {},
          i < steps.length ? `${i} / ${steps.length} · tap to go on` : 'Tap to start building',
        ),
      );
    };
    this.tutorial = h('div', { class: 'ed-t-tut interactive' }, bubble);
    this.tutorial.addEventListener('click', next);
    next();
    this.ui.root.append(this.tutorial);
  }
}
