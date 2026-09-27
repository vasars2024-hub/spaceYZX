// Map Maker on phones (packages/client/src/editor/touch-*.ts, hotbar.ts): telling taps, holds,
// drags and pinches apart, and the Minecraft-style hotbar.
import { describe, expect, it } from 'vitest';
import {
  GestureTracker,
  HOLD_MS,
  HOLD_SHOW_MS,
  TAP_MOVE_PX,
  type GestureEvent,
} from '../src/editor/touch-gesture';
import {
  held,
  HOTBAR_SIZE,
  newHotbar,
  parseHotbar,
  pickBrush,
  selectSlot,
} from '../src/editor/hotbar';

const kinds = (ev: GestureEvent[]) => ev.map((e) => e.k);

describe('tap, hold or drag', () => {
  it('a quick touch that barely moves is a tap (never a hold)', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    expect(g.move(1, 104, 103, 50)).toEqual([]);
    expect(g.tick(100)).toEqual([]); // no ring yet (a tap must not flash it)
    expect(g.up(1, 200)).toEqual([{ k: 'tap', x: 104, y: 103 }]);
  });

  it('holding still fills the ring, then breaks once; letting go after is nothing', () => {
    const g = new GestureTracker();
    g.down(1, 50, 60, 0);
    const mid = g.tick(HOLD_SHOW_MS + (HOLD_MS - HOLD_SHOW_MS) / 2);
    expect(mid).toHaveLength(1);
    expect(mid[0]).toMatchObject({ k: 'holdProgress', p: 0.5 });
    const done = g.tick(HOLD_MS);
    expect(kinds(done)).toEqual(['holdProgress', 'hold']);
    expect(done[1]).toEqual({ k: 'hold', x: 50, y: 60 });
    expect(g.tick(HOLD_MS + 500)).toEqual([]); // breaks only once
    expect(g.up(1, HOLD_MS + 600)).toEqual([]); // and no tap
  });

  it('a drag looks around and never places or breaks', () => {
    const g = new GestureTracker();
    g.down(1, 0, 0, 0);
    g.tick(HOLD_SHOW_MS + 10); // the ring started...
    const ev = g.move(1, TAP_MOVE_PX + 5, 0, HOLD_SHOW_MS + 20);
    // ...and goes away; the look includes the whole move (no jump)
    expect(ev).toEqual([
      { k: 'holdProgress', x: TAP_MOVE_PX + 5, y: 0, p: -1 },
      { k: 'look', dx: TAP_MOVE_PX + 5, dy: 0 },
    ]);
    expect(g.move(1, TAP_MOVE_PX + 8, -4, 300)).toEqual([{ k: 'look', dx: 3, dy: -4 }]);
    expect(g.tick(HOLD_MS * 3)).toEqual([]);
    expect(g.up(1, HOLD_MS * 3)).toEqual([]);
  });

  it('two fingers pinch (the first finger does not tap or break)', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 30);
    expect(g.move(2, 220, 100, 60)).toEqual([{ k: 'pinch', d: 20 }]);
    expect(g.tick(HOLD_MS * 2)).toEqual([]);
    expect(g.up(1, 700)).toEqual([]);
    // the finger left behind does nothing until it lifts
    expect(g.move(2, 400, 100, 710)).toEqual([]);
    expect(g.up(2, 720)).toEqual([]);
    expect(g.active).toBe(0);
  });

  it('a cancelled touch does nothing', () => {
    const g = new GestureTracker();
    g.down(1, 0, 0, 0);
    expect(g.cancel(1)).toEqual([]);
    expect(g.tick(HOLD_MS * 2)).toEqual([]);
  });
});

describe('hotbar', () => {
  it('slot 1 is the hand; picking a slot holds its piece', () => {
    let h = newHotbar();
    expect(h.slots).toHaveLength(HOTBAR_SIZE);
    expect(h.slots[0]).toBe('hand');
    h = selectSlot(h, 0);
    expect(held(h)).toBe('hand');
    h = selectSlot(h, 3);
    expect(held(h)).toBe('wedge');
    expect(selectSlot(h, 42)).toBe(h);
  });

  it('a piece from the bag goes into the current slot, or selects it if already there', () => {
    let h = selectSlot(newHotbar(), 2);
    h = pickBrush(h, 'glass');
    expect(h.slots[2]).toBe('glass');
    expect(held(h)).toBe('glass');
    h = selectSlot(h, 5);
    h = pickBrush(h, 'glass'); // already in slot 3: just select it
    expect(h.current).toBe(2);
    expect(h.slots.filter((s) => s === 'glass')).toHaveLength(1);
  });

  it('with the hand out, a new piece replaces the one used longest ago (never the hand)', () => {
    let h = newHotbar();
    for (const i of [1, 2, 3, 4, 5, 6, 7]) h = selectSlot(h, i); // slot 9 (index 8) is oldest
    h = selectSlot(h, 0);
    h = pickBrush(h, 'pillar');
    expect(h.slots[8]).toBe('pillar');
    expect(h.slots[0]).toBe('hand');
    expect(held(h)).toBe('pillar');
  });

  it('a saved hotbar comes back, anything odd falls back to the default', () => {
    const h = pickBrush(selectSlot(newHotbar(), 4), 'spawn');
    expect(parseHotbar(JSON.stringify(h))).toEqual(h);
    expect(parseHotbar('nonsense')).toEqual(newHotbar());
    const bad = parseHotbar(
      JSON.stringify({ ...h, slots: ['block', ...h.slots.slice(1, 8), 'dragon'] }),
    );
    expect(bad.slots[0]).toBe('hand');
    expect(bad.slots[8]).toBe(newHotbar().slots[8]);
  });
});
