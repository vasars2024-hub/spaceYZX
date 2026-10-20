// The key binding model (src/keybinds.ts): defaults, conflicts, swaps, mouse buttons and the
// wheel, loading old saves, hints with the player's own keys.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_BUTTONS, Btn, MAPS, type MapInfo } from '@space-yz/shared';
import {
  ACTIONS,
  DEFAULT_KEYBINDS,
  MAX_SLOTS,
  actionButton,
  actionKeys,
  bindKey,
  defaultKeybinds,
  duplicateCodes,
  findConflict,
  keyHint,
  keyLabel,
  keyShort,
  mouseCode,
  normalizeKeybinds,
  wheelCode,
} from '../src/keybinds';
import { loadSettings, saveSettings } from '../src/settings';
import { controlsHelp } from '../src/ui/menus';
import { trainingMapGroups } from '../src/ui/flow';
import { trainingStartMap } from '../src/ui/training-menu';

describe('actions and defaults', () => {
  it('every simulation button has a rebindable action, each with its own default keys', () => {
    const buttons = ACTIONS.map((a) => a.button ?? 0).filter((b) => b);
    expect(new Set(buttons).size).toBe(buttons.length);
    expect(buttons.reduce((a, b) => a | b, 0)).toBe(ALL_BUTTONS);
    for (const a of ACTIONS) {
      expect(a.keys.length).toBeLessThanOrEqual(MAX_SLOTS);
      expect(DEFAULT_KEYBINDS[a.id]).toEqual(a.keys);
    }
  });

  it('no key is bound twice by default, and T and Esc stay free', () => {
    expect(duplicateCodes(defaultKeybinds()).size).toBe(0);
    const all = Object.values(DEFAULT_KEYBINDS).flat();
    expect(all).not.toContain('KeyT'); // the Map Maker's Build ⇄ Test key
    expect(all).not.toContain('Escape');
  });

  it('the new actions: grenade bounces on middle mouse, the remote mine on free keys', () => {
    expect(DEFAULT_KEYBINDS.nadeBounce).toEqual(['Mouse1']);
    expect(actionButton('nadeBounce')).toBe(Btn.NadeBounce);
    expect(actionButton('minePlace')).toBe(Btn.MinePlace);
    expect(actionButton('mineDetonate')).toBe(Btn.MineDetonate);
    expect(DEFAULT_KEYBINDS.minePlace.length).toBeGreaterThan(0);
    expect(DEFAULT_KEYBINDS.mineDetonate.length).toBeGreaterThan(0);
    // client-only actions press no simulation button
    expect(actionButton('scoreboard')).toBe(0);
    expect(actionButton('nonsense')).toBe(0);
  });

  it('weapon switches, use, chat, scoreboard and the map are all rebindable', () => {
    const ids = ACTIONS.map((a) => a.id);
    for (const id of ['slot1', 'slot2', 'use', 'chatTeam', 'chatAll', 'scoreboard', 'bigMap'])
      expect(ids).toContain(id);
  });
});

describe('changing a binding', () => {
  it('takes the key away from the other action (clear)', () => {
    const b = bindKey(defaultKeybinds(), 'dash', 1, 'KeyE');
    expect(b.dash).toEqual(['ShiftLeft', 'KeyE']);
    expect(b.melee).toEqual([]);
  });

  it('swaps: the other action gets this slot’s old key', () => {
    const b = bindKey(defaultKeybinds(), 'grenade', 0, 'KeyE', 'swap');
    expect(b.grenade).toEqual(['KeyE']);
    expect(b.melee).toEqual(['KeyQ']);
    // nothing in the slot: a swap just moves the key
    const c = bindKey(defaultKeybinds(), 'melee', 1, 'KeyQ', 'swap');
    expect(c.melee).toEqual(['KeyE', 'KeyQ']);
    expect(c.grenade).toEqual([]);
  });

  it('finds the conflict before binding (the Controls tab asks first)', () => {
    expect(findConflict(defaultKeybinds(), 'grenade', 'KeyE')).toEqual({
      action: 'melee',
      slot: 0,
    });
    expect(findConflict(defaultKeybinds(), 'grenade', 'KeyQ')).toBeNull(); // its own key
    expect(findConflict(defaultKeybinds(), 'grenade', 'KeyP')).toBeNull();
  });

  it('the same key in the other slot of the same action trades places', () => {
    const b = bindKey(defaultKeybinds(), 'forward', 0, 'ArrowUp');
    expect(b.forward).toEqual(['ArrowUp', 'KeyW']);
  });

  it('clears a slot, keeps at most two keys, never changes its input', () => {
    const before = defaultKeybinds();
    const b = bindKey(before, 'jump', 0, null);
    expect(b.jump).toEqual(['WheelDown']);
    expect(before.jump).toEqual(['Space', 'WheelDown']);
    const c = bindKey(before, 'dash', 5, 'KeyP');
    expect(c.dash).toEqual(['ShiftLeft', 'KeyP']);
    expect(bindKey(c, 'dash', 2, 'KeyO').dash.length).toBe(MAX_SLOTS);
  });

  it('mouse buttons (middle, side) and the wheel are bindable like keys', () => {
    expect(mouseCode(1)).toBe('Mouse1');
    expect(mouseCode(3)).toBe('Mouse3');
    expect(wheelCode(1)).toBe('WheelDown');
    expect(wheelCode(-1)).toBe('WheelUp');
    let b = bindKey(defaultKeybinds(), 'slot1', 1, 'WheelUp');
    b = bindKey(b, 'slot2', 1, 'Mouse4');
    b = bindKey(b, 'melee', 1, 'Mouse1'); // middle mouse, taken from the grenade bounces
    expect(b.slot1).toEqual(['Digit1', 'WheelUp']);
    expect(b.slot2).toEqual(['Digit2', 'Mouse4']);
    expect(b.nadeBounce).toEqual([]);
    expect(duplicateCodes(b).size).toBe(0);
  });

  it('reports keys that do two things (hand-edited saves)', () => {
    const b = { ...defaultKeybinds(), dash: ['KeyE'] };
    expect(duplicateCodes(b).get('KeyE')).toEqual(['dash', 'melee']); // the Controls tab's order
  });
});

describe('loading saved bindings', () => {
  it('fills in actions an old save does not know, without taking the player’s keys', () => {
    // an old save: before the remote mine and the grenade bounces; the player moved melee
    // to middle mouse and the scoreboard to Z
    const old: Record<string, string[]> = { ...DEFAULT_KEYBINDS };
    delete old.nadeBounce;
    delete old.minePlace;
    delete old.mineDetonate;
    old.melee = ['Mouse1'];
    old.scoreboard = ['KeyZ'];
    const b = normalizeKeybinds(old);
    expect(b.melee).toEqual(['Mouse1']);
    expect(b.nadeBounce).toEqual([]); // its default (middle mouse) is the player's melee
    expect(b.minePlace).toEqual([]); // Z is the player's scoreboard
    expect(b.mineDetonate).toEqual(DEFAULT_KEYBINDS.mineDetonate);
    expect(duplicateCodes(b).size).toBe(0);
  });

  it('cleans junk: repeats, too many keys, Esc, wrong types', () => {
    const b = normalizeKeybinds({
      jump: ['Space', 'Space', 'Escape', 'KeyJ', 'KeyK'],
      dash: 'ShiftLeft',
      fire: [42, 'Mouse0'],
    });
    expect(b.jump).toEqual(['Space', 'KeyJ']);
    expect(b.dash).toEqual(DEFAULT_KEYBINDS.dash);
    expect(b.fire).toEqual(['Mouse0']);
    expect(normalizeKeybinds(null)).toEqual(defaultKeybinds());
    expect(normalizeKeybinds(['x'])).toEqual(defaultKeybinds());
  });
});

describe('saved per player', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a rebinding survives saving and loading the settings', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    const s = loadSettings();
    expect(s.keybinds).toEqual(defaultKeybinds());
    s.keybinds = bindKey(s.keybinds, 'mineDetonate', 0, 'Mouse4');
    s.keybinds = bindKey(s.keybinds, 'slot1', 0, 'WheelUp');
    saveSettings(s);
    const again = loadSettings();
    expect(again.keybinds.mineDetonate[0]).toBe('Mouse4');
    expect(again.keybinds.slot1).toEqual(['WheelUp']);
    expect(again.keybinds.grenade).toEqual(['KeyQ']);
  });
});

describe('key names in menus and hints', () => {
  it('friendly and short names', () => {
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('Mouse1')).toBe('Middle mouse');
    expect(keyLabel('Mouse3')).toBe('Mouse 4 (side)');
    expect(keyLabel('Mouse7')).toBe('Mouse 8');
    expect(keyLabel('WheelUp')).toBe('Wheel up');
    expect(keyLabel('Backquote')).toBe('`');
    expect(keyLabel(undefined)).toBe('—');
    expect(keyShort('Mouse0')).toBe('LMB');
    expect(keyShort('ControlLeft')).toBe('Ctrl');
    expect(keyShort('ShiftLeft')).toBe('Shift');
    expect(keyShort('ArrowUp')).toBe('Up');
  });

  it('hints show the player’s own keys', () => {
    const b = bindKey(defaultKeybinds(), 'use', 0, 'KeyF');
    expect(keyHint(b, 'hold {use} to plant · {fire} throw')).toBe('hold F to plant · LMB throw');
    expect(keyHint(b, '{crouch*} slide')).toBe('Ctrl / C slide');
    expect(keyHint(b, '{magboots} shift')).toBe('unbound shift'); // F went to Use
    expect(keyHint(b, 'Room {code}')).toBe('Room {code}'); // not an action: left alone
    expect(actionKeys(b, 'jump', false)).toBe('Space / Wheel down');
  });

  it('the Controls help lists the current keys and the 4 s defuse', () => {
    const rows = controlsHelp(bindKey(defaultKeybinds(), 'grenade', 0, 'Mouse3'));
    expect(rows.find(([, d]) => d === 'Grenade')?.[0]).toBe('Mouse 4');
    expect(rows.some(([, d]) => d.includes('defuse next to the bomb (4 s)'))).toBe(true);
    expect(rows.some(([k]) => k.includes('{'))).toBe(false);
  });
});

describe('Training: free roam on any map', () => {
  const info = (id: string, extra: Partial<MapInfo> = {}): MapInfo =>
    ({ id, name: id, build: () => null as never, competitive: false, ...extra }) as MapInfo;

  it('offers every map in rotation, competitive first, never a retired one', () => {
    const maps = [
      info('dust', { competitive: true }),
      info('old', { competitive: true, retired: true }),
      info('shibuya'),
      info('pits', { arena: true }),
      info('track', { race: true }),
      info('surfy', { race: true, surf: true, mode: 'beginner' }),
    ];
    const groups = trainingMapGroups(maps);
    expect(groups.map((g) => [g.title, g.maps.map((m) => m.id)])).toEqual([
      ['Competitive maps', ['dust']],
      ['Other maps', ['shibuya', 'pits']],
      ['Race tracks', ['track']],
      ['Surf maps', ['surfy']],
    ]);
    expect(trainingStartMap(groups, 'old')).toBe('dust');
    expect(trainingStartMap(groups, 'surfy')).toBe('surfy');
  });

  it('the real map list: every offered map appears exactly once', () => {
    const ids = trainingMapGroups().flatMap((g) => g.maps.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(
      MAPS.filter((m) => !m.retired)
        .map((m) => m.id)
        .sort(),
    );
  });
});
