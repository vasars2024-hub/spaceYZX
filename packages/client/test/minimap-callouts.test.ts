import { describe, expect, it } from 'vitest';
import { v3, type LevelDef } from '@space-yz/shared';
import { calloutsFor, type CalloutLayoutInput } from '../src/game/minimap-model';

const view = (more: Partial<CalloutLayoutInput> = {}): CalloutLayoutInput => ({
  cx: 128,
  cy: 128,
  k: 2,
  me: v3(0, 0, 0),
  you: v3(0, 0, 0),
  right: v3(1, 0, 0),
  fwd: v3(0, 0, -1),
  width: 256,
  height: 256,
  measureText: (text) => text.length * 5,
  ...more,
});
type Callouts = NonNullable<LevelDef['callouts']>;

describe('minimap callouts', () => {
  it('uses the whole map height and longer full names on the overview', () => {
    const callouts = [{ name: 'Upper Observation', short: 'Upper', pos: v3(0, 20, 0) }];
    expect(calloutsFor({ callouts }, view())).toEqual([]);
    expect(calloutsFor({ callouts }, view({ overview: true })).map((l) => l.text)).toEqual([
      'Upper Observation',
    ]);
    const atSlice = { callouts: [{ ...callouts[0], pos: v3(0, 0, 0) }] };
    expect(calloutsFor(atSlice, view()).map((l) => l.text)).toEqual(['Upper']);
  });

  it('tries the short name before culling overview labels at an edge or beside another name', () => {
    const callouts = [
      { name: 'Mid', pos: v3(0, 0, 0) },
      { name: 'Observation Deck', short: 'Obs', pos: v3(20, 0, 0) },
      { name: 'North Observation', short: 'N', pos: v3(-57, 0, -30) },
      { name: 'Hidden', pos: v3(1, 0, 0) },
    ];
    const labels = calloutsFor({ callouts }, view({ overview: true }));
    expect(labels.map((l) => l.text)).toEqual(['Mid', 'Obs', 'N']);
    for (let i = 0; i < labels.length; i++)
      for (const other of labels.slice(i + 1))
        expect(
          Math.abs(labels[i].x - other.x) >= (labels[i].width + other.width) / 2 ||
            Math.abs(labels[i].y - other.y) >= (labels[i].height + other.height) / 2,
        ).toBe(true);
  });

  it('has no labels or text measurement when callouts are absent or empty', () => {
    const v = view({
      measureText: () => {
        throw new Error('No labels to measure');
      },
    });
    expect(calloutsFor({}, v)).toEqual([]);
    expect(calloutsFor({ callouts: [] }, v)).toEqual([]);
  });

  it.each([0, 20, -20])('filters anchors within 4 m of the slice at y=%s', (height) => {
    const callouts = [
      { name: 'Level', pos: v3(0, height, 0) },
      { name: 'Up', pos: v3(20, height + 4, 0) },
      { name: 'Down', pos: v3(-20, height - 4, 0) },
      { name: 'Above', pos: v3(40, height + 4.01, 0) },
      { name: 'Below', pos: v3(-40, height - 4.01, 0) },
    ];
    const v = view({ me: v3(0, height, 0), you: v3(0, height, 0) });
    expect(calloutsFor({ callouts }, v).map((l) => l.text)).toEqual(['Level', 'Up', 'Down']);
  });

  it('uses measured width for short text, keeping full names at exactly 70 px', () => {
    const label = (name: string, short?: string, v = view()) =>
      calloutsFor({ callouts: [{ name, short, pos: v3(0, 0, 0) }] }, v)[0].text;
    expect(label('A Long', 'A')).toBe('A Long');
    expect(label('12345678901234', 'Short')).toBe('12345678901234');
    expect(label('123456789012345', 'Short')).toBe('Short');
    expect(label('123456789012345')).toBe('123456789012345');
    // Width comes from the renderer's font measurement, rather than character count.
    expect(label('WWW', 'W', view({ measureText: () => 71 }))).toBe('W');
  });

  it('projects anchors with the same screen axes and zoom as geometry, keeping boxes upright', () => {
    const def = { callouts: [{ name: 'Mid', pos: v3(4, 0, 6) }] };
    const north = calloutsFor(def, view({ k: 3 }))[0];
    const turned = calloutsFor(def, view({ k: 3, right: v3(0, 0, 1), fwd: v3(1, 0, 0) }))[0];
    const ceiling = calloutsFor(def, view({ k: 3, right: v3(-1, 0, 0) }))[0];
    expect(north).toEqual({ text: 'Mid', x: 140, y: 146, width: 21, height: 16 });
    expect(turned).toEqual({ ...north, x: 146, y: 116 });
    expect(ceiling).toEqual({ ...north, x: 116 });
    expect(calloutsFor(def, view({ k: 1 }))[0]).toEqual({ ...north, x: 132, y: 134 });
  });

  it('culls overlapping boxes nearest first, even when the farther label was authored first', () => {
    const callouts = [
      { name: 'Far', pos: v3(4, 0, 0) },
      { name: 'Near', pos: v3(1, 0, 0) },
      { name: 'Other', pos: v3(35, 0, 0) },
    ];
    expect(calloutsFor({ callouts }, view()).map((l) => l.text)).toEqual(['Near', 'Other']);
    // On the big map, priority is relative to the player, not the map centre.
    expect(calloutsFor({ callouts }, view({ you: v3(10, 0, 0) })).map((l) => l.text)).toEqual([
      'Far',
      'Other',
    ]);
  });

  it('uses the chosen short text box for overlap and checks both screen axes', () => {
    const callouts = [
      { name: 'Very Long Callout Name', short: 'A', pos: v3(0, 0, 0) },
      { name: 'B', pos: v3(10, 0, 0) },
      { name: 'C', pos: v3(0, 0, 5) },
      { name: 'D', pos: v3(0, 0, 15) },
    ];
    expect(calloutsFor({ callouts }, view()).map((l) => l.text)).toEqual(['A', 'B', 'D']);
  });

  it('omits labels outside the view or whose boxes would be clipped at the edge', () => {
    const callouts = [
      { name: 'Mid', pos: v3(0, 0, 0) },
      { name: 'West', pos: v3(-100, 0, 0) },
      { name: 'East', pos: v3(63, 0, 0) },
      { name: 'North', pos: v3(0, 0, -63) },
      { name: 'South', pos: v3(0, 0, 63) },
    ];
    expect(calloutsFor({ callouts }, view()).map((l) => l.text)).toEqual(['Mid']);
  });

  it('is deterministic, breaks distance ties by authored order and leaves inputs untouched', () => {
    const callouts: Callouts = [
      { name: 'First', pos: v3(-1, 0, 0) },
      { name: 'Second', pos: v3(1, 0, 0) },
      { name: 'Separate', pos: v3(30, 0, 0) },
    ];
    const before = structuredClone(callouts);
    for (const callout of callouts) {
      Object.freeze(callout.pos);
      Object.freeze(callout);
    }
    Object.freeze(callouts);
    const v = view();
    const result = calloutsFor({ callouts }, v);
    expect(result.map((l) => l.text)).toEqual(['First', 'Separate']);
    expect(calloutsFor({ callouts }, v)).toEqual(result);
    expect(calloutsFor({ callouts }, v)).toEqual(result);
    expect(callouts).toEqual(before);
  });
});
