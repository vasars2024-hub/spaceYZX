// The key binding model: every action the game has, its default keys, friendly key names, and
// the rules for changing a binding (conflicts, swaps, clearing, loading old saves). Pure data and
// functions (no DOM), so test/keybinds.test.ts checks it without a browser. The Controls tab in
// ui/settings-screen.ts draws it, game/input.ts reads it.
//
// A binding is a "code": a keyboard key (KeyboardEvent.code, e.g. 'KeyQ', 'ShiftLeft'), a mouse
// button ('Mouse0' left, 'Mouse1' middle, 'Mouse2' right, 'Mouse3' / 'Mouse4' the side buttons)
// or a wheel notch ('WheelUp', 'WheelDown'). Every action has up to two codes (two slots).
import { Btn } from '@space-yz/shared';

export type ActionGroup = 'Movement' | 'Weapons' | 'Equipment' | 'Communication' | 'Interface';

export interface ActionDef {
  id: string;
  /** what the Controls tab calls it */
  label: string;
  group: ActionGroup;
  /** the simulation button it presses (none: a client-only action like the scoreboard) */
  button?: number;
  /** default keys (at most two) */
  keys: string[];
}

/** How many keys one action can have. */
export const MAX_SLOTS = 2;

/** Every rebindable action, in the order the Controls tab lists them. */
export const ACTIONS: readonly ActionDef[] = [
  {
    id: 'forward',
    label: 'Move forward',
    group: 'Movement',
    button: Btn.Forward,
    keys: ['KeyW', 'ArrowUp'],
  },
  {
    id: 'back',
    label: 'Move back',
    group: 'Movement',
    button: Btn.Back,
    keys: ['KeyS', 'ArrowDown'],
  },
  {
    id: 'left',
    label: 'Strafe left',
    group: 'Movement',
    button: Btn.Left,
    keys: ['KeyA', 'ArrowLeft'],
  },
  {
    id: 'right',
    label: 'Strafe right',
    group: 'Movement',
    button: Btn.Right,
    keys: ['KeyD', 'ArrowRight'],
  },
  {
    id: 'jump',
    label: 'Jump / jetpack (hold in the air) / thruster',
    group: 'Movement',
    button: Btn.Jump,
    keys: ['Space', 'WheelDown'],
  },
  {
    id: 'crouch',
    label: 'Crouch / slide',
    group: 'Movement',
    button: Btn.Crouch,
    keys: ['ControlLeft', 'KeyC'],
  },
  {
    id: 'dash',
    label: 'Dash (races: SURGE)',
    group: 'Movement',
    button: Btn.Dash,
    keys: ['ShiftLeft'],
  },
  {
    id: 'magboots',
    label: 'Gravity shift (walk on walls)',
    group: 'Movement',
    button: Btn.MagBoots,
    keys: ['KeyF'],
  },
  {
    id: 'fire',
    label: 'Throw (hold to aim) / fire',
    group: 'Weapons',
    button: Btn.Fire,
    keys: ['Mouse0'],
  },
  { id: 'alt', label: 'Wind-up / steer', group: 'Weapons', button: Btn.Alt, keys: ['Mouse2'] },
  {
    id: 'melee',
    label: 'Slash / deflect / knife · hold: teleport slash',
    group: 'Weapons',
    button: Btn.Melee,
    keys: ['KeyE'],
  },
  {
    id: 'recall',
    label: 'Lethal Recall / reload (races: hold for the checkpoint)',
    group: 'Weapons',
    button: Btn.Recall,
    keys: ['KeyR'],
  },
  {
    id: 'slot1',
    label: 'Weapon 1 (Boomerang / AK)',
    group: 'Weapons',
    button: Btn.Slot1,
    keys: ['Digit1'],
  },
  {
    id: 'slot2',
    label: 'Weapon 2 (Laser / Deagle)',
    group: 'Weapons',
    button: Btn.Slot2,
    keys: ['Digit2'],
  },
  { id: 'grenade', label: 'Grenade', group: 'Equipment', button: Btn.Grenade, keys: ['KeyQ'] },
  {
    id: 'nadeBounce',
    label: 'Grenade bounces (cycle)',
    group: 'Equipment',
    button: Btn.NadeBounce,
    keys: ['Mouse1'],
  },
  // T is the Map Maker's Build ⇄ Test key and X switches the route's bomb site, so the mine
  // starts on Z and H (plus the thumb button); rebind them to anything you like
  {
    id: 'minePlace',
    label: 'Remote mine: place',
    group: 'Equipment',
    button: Btn.MinePlace,
    keys: ['KeyZ'],
  },
  {
    id: 'mineDetonate',
    label: 'Remote mine: detonate',
    group: 'Equipment',
    button: Btn.MineDetonate,
    keys: ['KeyH', 'Mouse3'],
  },
  {
    id: 'use',
    label: 'Plant / defuse the bomb (hold)',
    group: 'Equipment',
    button: Btn.Use,
    keys: ['KeyG'],
  },
  { id: 'chatTeam', label: 'Team chat (online)', group: 'Communication', keys: ['Enter'] },
  { id: 'chatAll', label: 'All chat (online)', group: 'Communication', keys: ['KeyY'] },
  { id: 'voiceTeam', label: 'Push to talk: team (online)', group: 'Communication', keys: ['KeyV'] },
  {
    id: 'voiceAll',
    label: 'Push to talk: everyone (online)',
    group: 'Communication',
    keys: ['KeyB'],
  },
  { id: 'scoreboard', label: 'Scoreboard (hold)', group: 'Interface', keys: ['Tab'] },
  { id: 'bigMap', label: 'Big map (hold)', group: 'Interface', keys: ['KeyM'] },
  { id: 'routeSite', label: 'Route: switch bomb site (A / B)', group: 'Interface', keys: ['KeyX'] },
  { id: 'tuning', label: 'Tuning panel (practice)', group: 'Interface', keys: ['Backquote'] },
];

export const ACTION_GROUPS: readonly ActionGroup[] = [
  'Movement',
  'Weapons',
  'Equipment',
  'Communication',
  'Interface',
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export const actionDef = (id: string): ActionDef | undefined => BY_ID.get(id);

/** The simulation button of an action (0 for client-only actions and unknown ones). */
export const actionButton = (id: string): number => BY_ID.get(id)?.button ?? 0;

export type Keybinds = Record<string, string[]>;

/** A fresh copy of the default bindings. */
export const defaultKeybinds = (): Keybinds =>
  Object.fromEntries(ACTIONS.map((a) => [a.id, [...a.keys]]));

export const DEFAULT_KEYBINDS: Keybinds = defaultKeybinds();

/** Esc always opens the menu / cancels: it can never be bound. */
export const RESERVED_CODES: readonly string[] = ['Escape'];

// ---------------------------------------------------------------- codes from events

/** The code of a mouse button (0 left, 1 middle, 2 right, 3 / 4 the side buttons). */
export const mouseCode = (button: number): string => `Mouse${button}`;

/** The code of a wheel notch. */
export const wheelCode = (deltaY: number): string => (deltaY > 0 ? 'WheelDown' : 'WheelUp');

// ---------------------------------------------------------------- names

const MOUSE_NAMES: Record<string, [long: string, short: string]> = {
  Mouse0: ['Left mouse', 'LMB'],
  Mouse1: ['Middle mouse', 'MMB'],
  Mouse2: ['Right mouse', 'RMB'],
  Mouse3: ['Mouse 4 (side)', 'Mouse 4'],
  Mouse4: ['Mouse 5 (side)', 'Mouse 5'],
  WheelUp: ['Wheel up', 'Wheel up'],
  WheelDown: ['Wheel down', 'Wheel down'],
};

const KEY_NAMES: Record<string, string> = {
  Space: 'Space',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  CapsLock: 'Caps Lock',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  NumpadEnter: 'Num Enter',
};

/** Friendly names for key codes ("Q", "Left mouse", "Shift (left)", "—" for nothing). */
export const keyLabel = (code: string | undefined): string => {
  if (!code) return '—';
  const mouse = MOUSE_NAMES[code];
  if (mouse) return mouse[0];
  const extra = /^Mouse(\d+)$/.exec(code);
  if (extra) return `Mouse ${Number(extra[1]) + 1}`;
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return `${code.slice(5)} arrow`;
  return code.replace(/Left$/, ' (left)').replace(/Right$/, ' (right)');
};

/** Short key names for the one-line in-game hints ("LMB", "Shift", "Ctrl"). */
export const keyShort = (code: string | undefined): string => {
  if (!code) return '—';
  const mouse = MOUSE_NAMES[code];
  if (mouse) return mouse[1];
  if (code.startsWith('Arrow')) return code.slice(5);
  const label = keyLabel(code).replace(/ \((left|right)\)$/, '');
  return label === 'Control' ? 'Ctrl' : label === 'Meta' ? 'Win' : label;
};

/** The key names of an action ("Q", "Ctrl / C"; "unbound" when it has none). */
export const actionKeys = (binds: Keybinds, action: string, short = true): string => {
  const codes = binds[action] ?? [];
  if (!codes.length) return 'unbound';
  return codes.map(short ? keyShort : keyLabel).join(' / ');
};

/** The first key of an action, short ("G"; "unbound" when it has none). */
export const firstKey = (binds: Keybinds, action: string): string => {
  const code = binds[action]?.[0];
  return code ? keyShort(code) : 'unbound';
};

/**
 * Fills `{action}` in a hint with that action's key ("{use} plant" → "G plant"), so every hint
 * shows the player's own bindings. `{action*}` lists every key of the action ("Ctrl / C").
 * Unknown names are left as they are.
 */
export const keyHint = (binds: Keybinds, text: string): string =>
  text.replace(/\{(\w+)(\*?)\}/g, (all, id: string, every: string) =>
    BY_ID.has(id) ? (every ? actionKeys(binds, id) : firstKey(binds, id)) : all,
  );

// ---------------------------------------------------------------- changing bindings

export interface BindConflict {
  /** the other action that already has the key */
  action: string;
  slot: number;
}

/** Which other action (and slot) already uses `code`, if any. */
export const findConflict = (
  binds: Keybinds,
  action: string,
  code: string,
): BindConflict | null => {
  for (const a of ACTIONS) {
    if (a.id === action) continue;
    const slot = (binds[a.id] ?? []).indexOf(code);
    if (slot >= 0) return { action: a.id, slot };
  }
  for (const [a, codes] of Object.entries(binds)) {
    if (a === action || BY_ID.has(a)) continue;
    const slot = codes.indexOf(code);
    if (slot >= 0) return { action: a, slot };
  }
  return null;
};

/**
 * Put `code` on `action` slot `slot` (null clears the slot). If another action has the key:
 * - 'clear' (default): it loses it (the other action's slot becomes empty);
 * - 'swap': it gets this slot's old key instead (or loses it when this slot was empty).
 * Returns a new object; the input is not changed.
 */
export const bindKey = (
  binds: Keybinds,
  action: string,
  slot: number,
  code: string | null,
  resolve: 'clear' | 'swap' = 'clear',
): Keybinds => {
  const out: Keybinds = {};
  for (const [a, codes] of Object.entries(binds)) out[a] = [...codes];
  const mine = [...(out[action] ?? [])];
  const old = mine[slot] as string | undefined;
  if (code === null) {
    if (slot < mine.length) mine.splice(slot, 1);
    out[action] = mine;
    return out;
  }
  const clash = findConflict(binds, action, code);
  if (clash) {
    const theirs = out[clash.action];
    if (resolve === 'swap' && old && old !== code && !theirs.includes(old))
      theirs[clash.slot] = old;
    else theirs.splice(clash.slot, 1);
  }
  // the same key in this action's other slot: the two slots trade places
  const dup = mine.indexOf(code);
  if (dup >= 0 && dup !== slot) {
    if (old) mine[dup] = old;
    else mine.splice(dup, 1);
  }
  if (slot < mine.length) mine[slot] = code;
  else mine.push(code);
  out[action] = mine.slice(0, MAX_SLOTS);
  return out;
};

/** Keys bound to more than one action (code → the actions), e.g. from hand-edited saves. */
export const duplicateCodes = (binds: Keybinds): Map<string, string[]> => {
  const by = new Map<string, string[]>();
  for (const [a, codes] of Object.entries(binds))
    for (const c of codes) by.set(c, [...(by.get(c) ?? []), a]);
  for (const [c, list] of by) if (list.length < 2) by.delete(c);
  return by;
};

/**
 * Bindings loaded from storage, made safe: every action present, at most two keys each, no
 * repeats, no reserved keys. An action the save doesn't know yet (added in an update, like the
 * remote mine) gets its default keys, except keys the player already uses for something else,
 * so an update never steals or doubles up a key the player chose.
 */
export const normalizeKeybinds = (saved: unknown): Keybinds => {
  const src =
    saved && typeof saved === 'object' && !Array.isArray(saved)
      ? (saved as Record<string, unknown>)
      : {};
  const out: Keybinds = {};
  const used = new Set<string>();
  for (const a of ACTIONS) {
    const v = src[a.id];
    if (!Array.isArray(v)) continue;
    const codes: string[] = [];
    for (const c of v) {
      if (typeof c !== 'string' || !c || RESERVED_CODES.includes(c) || codes.includes(c)) continue;
      if (codes.length < MAX_SLOTS) codes.push(c);
    }
    out[a.id] = codes;
    for (const c of codes) used.add(c);
  }
  for (const a of ACTIONS) {
    if (out[a.id]) continue;
    out[a.id] = a.keys.filter((c) => !used.has(c));
    for (const c of out[a.id]) used.add(c);
  }
  return out;
};
