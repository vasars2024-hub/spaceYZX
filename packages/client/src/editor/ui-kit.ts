// MAP MAKER — small DOM pieces for the editor's panels: labelled number fields, sliders with a
// number box, toggles, icon buttons and a modal dialog. All text goes through textContent.
import { h } from '../ui/menus';
import { edIcon, type EditorIconName } from './icons';

/** An icon button (icon + label; `title` = the tooltip). */
export const edButton = (
  icon: EditorIconName | null,
  label: string,
  onClick: () => void,
  cls = 'btn small secondary',
  title = '',
): HTMLButtonElement => {
  const b = h(
    'button',
    { class: `${cls} icon-btn`, type: 'button' },
    icon ? edIcon(icon) : null,
    label,
  );
  if (title) b.title = title;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
    // (Space must never click a button again: the keys fly the camera)
    b.blur();
  });
  return b;
};

const fmt = (v: number): string => String(Math.round(v * 1000) / 1000);

/** A number box: changes apply on Enter or when you leave the box. */
export const numBox = (
  value: number,
  onCommit: (v: number) => void,
  opts: { step?: number; min?: number; max?: number; title?: string } = {},
): HTMLInputElement => {
  const i = h('input', {
    type: 'number',
    class: 'ed-num',
    step: String(opts.step ?? 0.25),
    value: Number.isFinite(value) ? fmt(value) : '',
  });
  if (opts.min !== undefined) i.min = String(opts.min);
  if (opts.max !== undefined) i.max = String(opts.max);
  if (opts.title) i.title = opts.title;
  const apply = () => {
    let v = Number(i.value);
    if (!i.value.trim() || !Number.isFinite(v)) {
      i.value = Number.isFinite(value) ? fmt(value) : '';
      return;
    }
    if (opts.min !== undefined) v = Math.max(opts.min, v);
    if (opts.max !== undefined) v = Math.min(opts.max, v);
    if (v !== value) onCommit(v);
  };
  i.addEventListener('change', apply);
  i.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') i.blur();
    if (e.key === 'Escape') {
      i.value = Number.isFinite(value) ? fmt(value) : '';
      i.blur();
    }
  });
  return i;
};

/** A labelled row. */
export const row = (label: string, ...controls: (Node | null)[]): HTMLElement =>
  h(
    'div',
    { class: 'ed-row' },
    h('span', { class: 'ed-label' }, label),
    h('span', { class: 'ed-ctl' }, ...controls),
  );

/** x / y / z number boxes. */
export const vecRow = (
  label: string,
  v: readonly number[],
  onCommit: (v: [number, number, number]) => void,
  opts: { step?: number; min?: number; names?: [string, string, string] } = {},
): HTMLElement => {
  const names = opts.names ?? ['x', 'y', 'z'];
  return row(
    label,
    ...[0, 1, 2].map((k) =>
      h(
        'label',
        { class: 'ed-axis' },
        h('span', {}, names[k]),
        numBox(
          v[k],
          (x) => {
            const out = [...v] as [number, number, number];
            out[k] = x;
            onCommit(out);
          },
          { step: opts.step, min: opts.min },
        ),
      ),
    ),
  );
};

/**
 * A slider with a number box (speed, delay, power). `onChange(v, final)`: while dragging
 * final = false (one undo step for the whole drag).
 */
export const sliderRow = (
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  unit: string,
  onChange: (v: number, final: boolean) => void,
): HTMLElement => {
  const r = h('input', {
    type: 'range',
    class: 'ed-range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
  });
  const n = numBox(value, (v) => onChange(v, true), { step, min, max });
  r.addEventListener('input', () => {
    n.value = r.value;
    onChange(Number(r.value), false);
  });
  r.addEventListener('change', () => onChange(Number(r.value), true));
  return row(label, r, n, h('span', { class: 'ed-unit' }, unit));
};

export const toggleRow = (
  label: string,
  on: boolean,
  onChange: (v: boolean) => void,
): HTMLElement => {
  const c = h('input', { type: 'checkbox' });
  c.checked = on;
  c.addEventListener('change', () => {
    onChange(c.checked);
    c.blur();
  });
  return h('label', { class: 'ed-row ed-toggle' }, c, h('span', {}, label));
};

export const selectRow = <T extends string>(
  label: string,
  options: [T, string][],
  value: T,
  onChange: (v: T) => void,
): HTMLElement => {
  const s = h('select', { class: 'ed-select' });
  for (const [v, text] of options) {
    const o = h('option', { value: v }, text);
    if (v === value) o.selected = true;
    s.append(o);
  }
  s.addEventListener('change', () => {
    onChange(s.value as T);
    s.blur();
  });
  s.addEventListener('keydown', (e) => e.stopPropagation());
  return row(label, s);
};

export const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Colour swatches (+ a free colour picker). */
export const swatchRow = (
  label: string,
  colors: number[],
  value: number | null,
  onPick: (c: number | null) => void,
  opts: { none?: string; picker?: boolean } = {},
): HTMLElement => {
  const items: HTMLElement[] = [];
  if (opts.none) {
    const b = h('button', {
      type: 'button',
      class: `ed-swatch none${value === null ? ' on' : ''}`,
      title: opts.none,
    });
    b.textContent = '∅';
    b.addEventListener('click', () => onPick(null));
    items.push(b);
  }
  for (const c of colors) {
    const b = h('button', {
      type: 'button',
      class: `ed-swatch${value === c ? ' on' : ''}`,
      title: hex(c),
    });
    b.style.background = hex(c);
    b.addEventListener('click', () => onPick(c));
    items.push(b);
  }
  if (opts.picker) {
    const i = h('input', {
      type: 'color',
      class: 'ed-color',
      value: hex(value ?? 0xffffff),
      title: 'Any colour',
    });
    i.addEventListener('change', () => onPick(parseInt(i.value.slice(1), 16)));
    items.push(i);
  }
  return h(
    'div',
    { class: 'ed-block' },
    h('div', { class: 'ed-label' }, label),
    h('div', { class: 'ed-swatches' }, ...items),
  );
};

export interface ModalButton {
  label: string;
  cls?: string;
  onClick?: () => void;
}

/** A dialog over the editor; any button closes it. Returns the close function. */
export const modal = (
  host: HTMLElement,
  title: string,
  body: (Node | string)[],
  buttons: ModalButton[],
  onClose?: () => void,
): (() => void) => {
  const box = h('div', { class: 'ed-modal panel', role: 'dialog', 'aria-modal': 'true' });
  const back = h('div', { class: 'ed-modal-back interactive' }, box);
  const close = () => {
    back.remove();
    onClose?.();
  };
  box.append(
    h('h3', { class: 'ed-modal-title' }, title),
    h('div', { class: 'ed-modal-body' }, ...body),
    h(
      'div',
      { class: 'ed-modal-buttons' },
      ...buttons.map((b) => {
        const btn = h('button', { type: 'button', class: b.cls ?? 'btn small secondary' }, b.label);
        btn.addEventListener('click', () => {
          b.onClick?.();
          close();
        });
        return btn;
      }),
    ),
  );
  back.addEventListener('mousedown', (e) => {
    if (e.target === back) close();
  });
  host.append(back);
  requestAnimationFrame(() => box.querySelector<HTMLButtonElement>('button')?.focus());
  return close;
};

/** Ask yes / no (a modal); resolves true for yes. */
export const confirmBox = (
  host: HTMLElement,
  title: string,
  text: string,
  yes: string,
  no = 'Cancel',
  danger = false,
): Promise<boolean> =>
  new Promise((resolve) => {
    let done = false;
    modal(
      host,
      title,
      [h('p', {}, text)],
      [
        { label: no, onClick: () => ((done = true), resolve(false)) },
        {
          label: yes,
          cls: danger ? 'btn small orange' : 'btn small primary',
          onClick: () => ((done = true), resolve(true)),
        },
      ],
      () => {
        if (!done) resolve(false);
      },
    );
  });

/** A readable message from a failed request. */
export const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong.';
