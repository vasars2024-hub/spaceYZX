// Glass scenery (course data `block` with `mat: 'glass'`, B02 Glass Garden): a see-through pane
// that never collides — it expands to a `skyglass` box with its edges drawn, even when `solid`.
// Every other block material is unchanged. `lowDetail` blocks are drawn one quad per face.
import { describe, expect, it } from 'vitest';
import { copperReefCourse, expandCourse, type CourseData, type SceneryElement } from '../src';

const withScenery = (scenery: SceneryElement[]): CourseData => {
  const c = copperReefCourse();
  return { ...c, scenery };
};

const boxesAt = (data: CourseData, y: number) =>
  expandCourse(data).def.boxes.filter((b) => Math.abs(b.c.y - y) < 1e-6);

describe('glass scenery blocks', () => {
  it('a glass pane is see-through, edged and never collides (even solid)', () => {
    for (const solid of [false, true]) {
      const data = withScenery([
        { t: 'block', at: [0, 900, 0], size: [20, 12, 0.4], mat: 'glass', color: 0xc4e2de, solid },
      ]);
      const [b] = boxesAt(data, 906);
      expect(b).toBeDefined();
      expect(b.mat).toBe('skyglass');
      expect(b.noCollide).toBe(true);
      expect(b.trim).toBe(0xc4e2de);
      expect(b.color).toBe(0xc4e2de);
    }
  });

  it("a glass pane without a colour takes the palette's crystal colour", () => {
    const data = withScenery([{ t: 'block', at: [0, 900, 0], size: [4, 4, 4], mat: 'glass' }]);
    const [b] = boxesAt(data, 902);
    expect(b.color).toBe(data.palette.crystal);
    expect(b.noCollide).toBe(true);
  });

  it('a lowDetail block is drawn with one quad per face (default: tiled)', () => {
    const data = withScenery([
      { t: 'block', at: [0, 900, 0], size: [36, 300, 36], mat: 'wood', lowDetail: true },
      { t: 'block', at: [0, 1300, 0], size: [4, 4, 4], mat: 'wood' },
    ]);
    expect(boxesAt(data, 1050)[0].lowDetail).toBe(true);
    expect(boxesAt(data, 1302)[0].lowDetail).toBeUndefined();
  });

  it('other materials are unchanged', () => {
    const data = withScenery([
      { t: 'block', at: [0, 900, 0], size: [4, 4, 4], mat: 'wood', color: 0x123456 },
      { t: 'block', at: [0, 920, 0], size: [4, 4, 4], mat: 'rock', color: 0x123456, solid: true },
    ]);
    const [a] = boxesAt(data, 902);
    const [b] = boxesAt(data, 922);
    expect(a.mat).toBe('wood');
    expect(a.noCollide).toBe(true);
    expect(a.trim).toBeUndefined();
    expect(b.mat).toBe('rock');
    expect(b.noCollide).toBeUndefined();
  });
});
