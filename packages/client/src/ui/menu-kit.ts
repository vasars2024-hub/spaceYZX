// Menu building blocks shared by every screen: cards (modes, maps, bots…), a screen header with
// a back button, step breadcrumbs, a summary bar, and the slide/fade transitions between screens
// and steps (CSS in ui/menu-flow.css; `prefers-reduced-motion` turns them off).
import { mapDef } from '@space-yz/shared';
import { h } from './menus';
import { icon, mapThumbnail, type IconName } from './icons';
import { MAP_BLURBS, mapTags } from './flow';

/** Transition direction: forward slides in from the right, back from the left. */
export type Dir = 'forward' | 'back' | 'fade' | 'none';

const FX_IN_MS = 700; // longest enter animation incl. the card stagger
const FX_OUT_MS = 220;

const reducedMotion = (): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const FX_CLASSES = ['fx-enter', 'fx-leave', 'fx-forward', 'fx-back', 'fx-fade'];
/** pending timers per element (an element can come back while it is still leaving) */
const fxTimers = new WeakMap<HTMLElement, number>();

const fxReset = (el: HTMLElement): void => {
  window.clearTimeout(fxTimers.get(el));
  fxTimers.delete(el);
  el.classList.remove(...FX_CLASSES);
  el.inert = false;
  el.removeAttribute('aria-hidden');
};

/** Play an element's enter animation. */
export const fxEnter = (el: HTMLElement, dir: Dir): void => {
  fxReset(el);
  if (dir === 'none' || reducedMotion()) return;
  // restart the animation even if the same classes were just removed
  void el.offsetWidth;
  el.classList.add('fx-enter', `fx-${dir}`);
  fxTimers.set(
    el,
    window.setTimeout(() => fxReset(el), FX_IN_MS),
  );
};

/** Play an element's leave animation, then remove it (it no longer takes clicks). */
export const fxLeave = (el: HTMLElement, dir: Dir): void => {
  fxReset(el);
  if (dir === 'none' || reducedMotion()) {
    el.remove();
    return;
  }
  el.classList.add('fx-leave', `fx-${dir}`);
  el.inert = true;
  el.setAttribute('aria-hidden', 'true');
  fxTimers.set(
    el,
    window.setTimeout(() => {
      fxTimers.delete(el);
      el.remove();
      el.classList.remove(...FX_CLASSES);
      el.inert = false;
      el.removeAttribute('aria-hidden');
    }, FX_OUT_MS),
  );
};

/**
 * Swap what a stage shows (children stack in one grid cell, so the old step slides out while
 * the new one slides in). Keyboard focus moves to the new step's selected (or first) button.
 */
export const swapStage = (stage: HTMLElement, next: HTMLElement, dir: Dir): void => {
  const hadFocus = stage.contains(document.activeElement);
  for (const c of Array.from(stage.children))
    if (c !== next && !c.classList.contains('fx-leave')) fxLeave(c as HTMLElement, dir);
  stage.append(next);
  fxEnter(next, dir);
  if (hadFocus) focusFirst(next);
};

/** Focus the selected card, else the first button (for keyboard players; no scroll jump). */
export const focusFirst = (root: HTMLElement): void => {
  requestAnimationFrame(() => {
    const t =
      root.querySelector<HTMLElement>('.card.selected:not(:disabled)') ??
      root.querySelector<HTMLElement>('.card:not(:disabled), button:not(:disabled)');
    t?.focus({ preventScroll: true });
  });
};

export interface CardOpts {
  title: string;
  desc?: string;
  /** picture: an icon, bot badge or map thumbnail */
  art?: Node | null;
  tags?: string[];
  selected?: boolean;
  cls?: string;
  disabled?: boolean;
  onClick: () => void;
}

/** A card button: picture + name + one-line description. */
export const card = (o: CardOpts): HTMLButtonElement => {
  const b = h(
    'button',
    {
      class: `card${o.cls ? ' ' + o.cls : ''}${o.selected ? ' selected' : ''}`,
      type: 'button',
    },
    o.art ? h('span', { class: 'card-art' }, o.art) : null,
    h(
      'span',
      { class: 'card-body' },
      h('span', { class: 'card-title' }, o.title),
      o.desc ? h('span', { class: 'card-desc' }, o.desc) : null,
      o.tags?.length
        ? h('span', { class: 'card-tags' }, ...o.tags.map((t) => h('span', { class: 'chip' }, t)))
        : null,
    ),
  );
  if (o.selected !== undefined) b.setAttribute('aria-pressed', String(o.selected));
  b.disabled = !!o.disabled;
  b.addEventListener('click', o.onClick);
  return b;
};

/** A grid of cards (entering cards fade in one after another). */
export const cardGrid = (cls: string, cards: HTMLElement[]): HTMLDivElement => {
  cards.forEach((c, i) => c.style.setProperty('--i', String(i)));
  return h('div', { class: `card-grid ${cls}`.trim() }, ...cards);
};

/**
 * A group of cards where one is picked: clicking moves the highlight without rebuilding the
 * screen (keyboard focus stays put).
 */
export const pickGrid = <T>(
  cls: string,
  items: T[],
  isSelected: (item: T) => boolean,
  make: (item: T, selected: boolean, pick: () => void) => HTMLButtonElement,
  onPick: (item: T) => void,
): HTMLDivElement => {
  const cards: HTMLButtonElement[] = [];
  items.forEach((it) => {
    const c = make(it, isSelected(it), () => {
      for (const o of cards) {
        o.classList.toggle('selected', o === c);
        o.setAttribute('aria-pressed', String(o === c));
      }
      onPick(it);
    });
    cards.push(c);
  });
  return cardGrid(cls, cards);
};

/** A map card with its top-down picture, blurb and features. */
export const mapCard = (
  id: string,
  selected: boolean,
  onClick: () => void,
  extraTags: string[] = [],
): HTMLButtonElement => {
  const def = mapDef(id);
  const art = h('span', { class: 'map-art' });
  art.innerHTML = mapThumbnail(def); // our own SVG markup, built from level data
  return card({
    title: def.name,
    desc: MAP_BLURBS[id],
    tags: [...mapTags(def), ...extraTags],
    art,
    selected,
    cls: 'map',
    onClick,
  });
};

/** A small map picture (summary bar). */
export const mapMini = (id: string): HTMLElement => {
  const s = h('span', { class: 'map-mini' });
  s.innerHTML = mapThumbnail(mapDef(id), 110, 70);
  return s;
};

/** The back button: Esc presses it too (the app looks for `data-esc`). */
export const backButton = (onClick: () => void, label = 'Back'): HTMLButtonElement => {
  const b = h(
    'button',
    { class: 'btn secondary back-btn', type: 'button', 'data-esc': '' },
    icon('back'),
    label,
  );
  b.addEventListener('click', onClick);
  return b;
};

/** A button with an icon in front of its label. */
export const iconButton = (
  name: IconName,
  label: string,
  onClick: () => void,
  cls = 'btn',
): HTMLButtonElement => {
  const b = h('button', { class: `${cls} icon-btn`, type: 'button' }, icon(name), label);
  b.addEventListener('click', onClick);
  return b;
};

/** Screen header: back button, icon and title. */
export const screenHead = (
  name: IconName,
  title: string,
  back: (() => void) | null,
  ...extra: (Node | null)[]
): HTMLElement =>
  h(
    'header',
    { class: 'flow-head' },
    back ? backButton(back) : null,
    h('h2', {}, icon(name, 'head-icon'), title),
    ...extra,
  );

export interface Crumb {
  label: string;
  state: 'done' | 'current' | 'todo';
  onClick?: () => void;
}

/** Step breadcrumbs: 1 Mode › 2 Map › 3 Teams; finished steps can be clicked to go back. */
export const crumbs = (items: Crumb[]): HTMLElement => {
  const nav = h('nav', { class: 'crumbs', 'aria-label': 'Steps' });
  items.forEach((c, i) => {
    if (i > 0) nav.append(h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '›'));
    const b = h(
      'button',
      { class: `crumb ${c.state}`, type: 'button' },
      h('span', { class: 'num' }, String(i + 1)),
      c.label,
    );
    if (c.state === 'current') b.setAttribute('aria-current', 'step');
    if (c.state === 'done' && c.onClick) b.addEventListener('click', c.onClick);
    else b.disabled = c.state !== 'current';
    if (c.state === 'current') b.tabIndex = -1;
    nav.append(b);
  });
  return nav;
};

/** One item of a summary bar: a picture and a short text. */
export const sumItem = (art: Node, text: string, cls = ''): HTMLElement =>
  h('span', { class: `sum-item ${cls}`.trim() }, art, text);

/** A step: a heading and its content. */
export const stepPanel = (title: string, ...content: (Node | null)[]): HTMLElement =>
  h('section', { class: 'step' }, h('h3', { class: 'step-title' }, title), ...content);

/** Segmented tabs (e.g. Create room | Join by code). */
export const segTabs = <T extends string>(
  items: { id: T; label: string; icon: IconName }[],
  current: T,
  onPick: (id: T) => void,
): HTMLElement =>
  h(
    'div',
    { class: 'seg', role: 'tablist' },
    ...items.map((it) => {
      const b = h(
        'button',
        { type: 'button', role: 'tab', 'aria-selected': String(it.id === current) },
        icon(it.icon),
        it.label,
      );
      b.addEventListener('click', () => onPick(it.id));
      return b;
    }),
  );
