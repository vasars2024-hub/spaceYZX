// Full-screen transition cards (game/transitions.ts plans them): a DOM overlay that never
// takes input (pointer-events: none) and never holds up the match — cards only run during
// spawn lock / round end / match end, and the match HUD clears them when a round goes live.
// Each card says its announcer line as it appears.
//
// Other HUDs (e.g. Brawl) call showTransition(kind, info) directly.
import type { TransitionCard, TransitionKind, EffectsLevel } from '../game/transitions';
import { cardDuration, defaultCard } from '../game/transitions';
import type { Announcer } from '../audio/announcer';
import { h } from './menus';

export interface TransitionConfig {
  /** where the overlay goes (default: #ui, else document.body) */
  root?: HTMLElement | null;
  announcer?: Announcer | null;
  /** Settings → effects (full / reduced / minimal) */
  effects?: () => EffectsLevel;
}

let cfg: TransitionConfig = {};
let layer: HTMLDivElement | null = null;
let timers: ReturnType<typeof setTimeout>[] = [];

export const configureTransitions = (c: TransitionConfig): void => {
  cfg = { ...cfg, ...c };
};

const reducedMotion = (): boolean => {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch (_err) {
    return false;
  }
};

const ensureLayer = (): HTMLDivElement => {
  if (!layer || !layer.isConnected) {
    layer = h('div', { class: 'tx-layer', 'aria-hidden': 'true' });
    (cfg.root ?? document.getElementById('ui') ?? document.body).append(layer);
  }
  return layer;
};

/**
 * Puts the (empty) overlay in place now, so menus opened later (pause) stack above it.
 * Called by the match HUD when a game starts.
 */
export const mountTransitions = (root?: HTMLElement | null): void => {
  if (root && root !== cfg.root) {
    layer?.remove();
    layer = null;
    cfg.root = root;
  }
  try {
    // (re-)append: above the HUD that was just added, below menus opened later
    const l = ensureLayer();
    l.parentElement?.append(l);
  } catch (_err) {
    // no DOM
  }
};

const cardEl = (c: TransitionCard, durMs: number, level: EffectsLevel, still: boolean) => {
  const content = h('div', { class: 'tx-content' });
  if (c.kicker) content.append(h('div', { class: 'tx-kicker' }, c.kicker));
  if (c.kind === 'matchStart' && c.title === 'LETHAL RECOIL')
    content.append(
      h(
        'div',
        { class: 'tx-wordmark' },
        h('span', { class: 'tx-w1' }, 'LETHAL'),
        h('span', { class: 'tx-w2' }, 'RECOIL'),
      ),
    );
  else content.append(h('div', { class: 'tx-title' }, c.title));
  if (c.side)
    content.append(
      h('div', { class: 'tx-side', style: `--tx-side:${c.side.color}` }, c.side.label),
    );
  const sub = c.kind === 'matchStart' ? [c.map, c.mode].filter(Boolean).join('  //  ') : c.sub;
  if (sub) content.append(h('div', { class: 'tx-sub' }, sub));
  const style = `--tx-dur:${durMs}ms;${c.accent ? `--tx-accent:${c.accent};` : ''}`;
  return h(
    'div',
    { class: `tx-card tx-${c.kind} tx-fx-${level}${still ? ' tx-still' : ''}`, style },
    h('div', { class: 'tx-slab' }),
    level === 'minimal' ? null : h('div', { class: 'tx-scan' }),
    level === 'minimal' || still ? null : h('div', { class: 'tx-sweep' }),
    content,
  );
};

const show = (c: TransitionCard, durMs: number, level: EffectsLevel, still: boolean): void => {
  try {
    ensureLayer().replaceChildren(cardEl(c, durMs, level, still));
  } catch (_err) {
    // no DOM (tests) — the voice still plays
  }
  if (c.voice) cfg.announcer?.say(c.voice);
};

/** Plays cards one after the other (replacing any running ones). Returns the total ms. */
export const playTransitions = (cards: readonly TransitionCard[]): number => {
  clearTransitions();
  const level = cfg.effects?.() ?? 'full';
  const still = reducedMotion();
  let t = 0;
  for (const c of cards) {
    const dur = cardDuration(c.durMs, level, still);
    if (t === 0) show(c, dur, level, still);
    else timers.push(setTimeout(() => show(c, dur, level, still), t));
    t += dur;
  }
  if (t > 0) timers.push(setTimeout(() => layer?.replaceChildren(), t));
  return t;
};

/** One card of a kind with its usual title and voice (info overrides: title, sub, map…). */
export const showTransition = (
  kind: TransitionKind,
  info: Partial<TransitionCard> & { round?: number } = {},
): number => playTransitions([defaultCard(kind, info)]);

/** Removes every card now (a round went live, the player left, Tab for the scoreboard). */
export const clearTransitions = (): void => {
  for (const t of timers) clearTimeout(t);
  timers = [];
  layer?.replaceChildren();
};

/** Says an announcer line without a card (e.g. "Fight!" when the round goes live). */
export const announce = (id: string): void => {
  cfg.announcer?.say(id);
};

/** Starts loading the announcer's clips in the background (a match is about to start). */
export const preloadAnnouncer = (): void => {
  cfg.announcer?.preload();
};

/** Is a card on screen? */
export const transitionShowing = (): boolean => !!layer && layer.childElementCount > 0;
