// MAP MAKER (touch) — the Minecraft-style hotbar: 9 slots, slot 1 is always the hand (select and
// edit), the others hold pieces. Picking a piece in the bag puts it in the current slot (or, with
// the hand out, over the piece used longest ago). Plain data; kept on this device.
import { BLOCK_BRUSHES, OBJECT_BRUSHES, type BrushId } from './palette';

export type Slot = BrushId | 'hand';

export interface Hotbar {
  slots: Slot[];
  current: number;
  /** slot numbers, most recently used first (which slot a new piece replaces) */
  recent: number[];
}

export const HOTBAR_SIZE = 9;

const DEFAULT_SLOTS: Slot[] = [
  'hand',
  'platform',
  'block',
  'wedge',
  'surf',
  'curveRamp',
  'killpaint',
  'checkpoint',
  'portal',
];

const isBrush = (s: unknown): s is BrushId =>
  BLOCK_BRUSHES.some((b) => b.id === s) || OBJECT_BRUSHES.some((b) => b.id === s);

export const newHotbar = (): Hotbar => ({
  slots: [...DEFAULT_SLOTS],
  current: 1,
  recent: [1, 2, 3, 4, 5, 6, 7, 8],
});

/** What the current slot holds. */
export const held = (h: Hotbar): Slot => h.slots[h.current] ?? 'hand';

const touch = (recent: number[], i: number): number[] => [i, ...recent.filter((x) => x !== i)];

export const selectSlot = (h: Hotbar, i: number): Hotbar =>
  i < 0 || i >= HOTBAR_SIZE
    ? h
    : { ...h, current: i, recent: i === 0 ? h.recent : touch(h.recent, i) };

/** A piece picked in the bag: into the hotbar, and in hand. */
export const pickBrush = (h: Hotbar, b: BrushId): Hotbar => {
  const already = h.slots.indexOf(b);
  if (already > 0) return selectSlot(h, already);
  // the current slot, or with the hand out the slot used longest ago
  const target =
    h.current !== 0 ? h.current : ([...h.recent].reverse().find((i) => i > 0) ?? HOTBAR_SIZE - 1);
  const slots = [...h.slots];
  slots[target] = b;
  return { slots, current: target, recent: touch(h.recent, target) };
};

/** A saved hotbar read back (anything odd: the default one). */
export const parseHotbar = (raw: string | null): Hotbar => {
  try {
    const v = JSON.parse(raw ?? '') as Partial<Hotbar>;
    if (!Array.isArray(v.slots) || v.slots.length !== HOTBAR_SIZE) return newHotbar();
    const slots: Slot[] = v.slots.map((s, i) =>
      i === 0 ? 'hand' : isBrush(s) ? s : DEFAULT_SLOTS[i],
    );
    const current =
      typeof v.current === 'number' && v.current >= 0 && v.current < HOTBAR_SIZE ? v.current : 1;
    const recent = Array.isArray(v.recent)
      ? v.recent.filter((i): i is number => Number.isInteger(i) && i > 0 && i < HOTBAR_SIZE)
      : [];
    for (let i = 1; i < HOTBAR_SIZE; i++) if (!recent.includes(i)) recent.push(i);
    return { slots, current, recent };
  } catch {
    return newHotbar();
  }
};
