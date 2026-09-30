// No visible clipping on the combat maps: the overlap check (level/course/overlap.ts, the same
// one `npx tsx tools/race/check.ts <map> --list` prints) finds no two pieces of a different look
// (material or colour) cutting into each other — no floor running into a wall of another
// colour, no prop sunk through a floor, no strip light buried in a box, no coplanar faces of
// different colours fighting. Same-look pieces may overlap (that is one solid). A map that
// really needs an exception lists it in ALLOWED with the reason.
import { describe, expect, it } from 'vitest';
import { describeOverlap, findOverlaps, mapDef, MAPS } from '../src/index';

/** map id → overlap descriptions that are accepted (keep this empty if at all possible) */
const ALLOWED: Record<string, string[]> = {};

const COMBAT_MAPS = MAPS.filter((m) => (m.competitive || m.arena) && !m.race).map((m) => m.id);

describe('combat maps: no visible clipping', () => {
  it('covers every combat map', () => {
    for (const id of ['split-deck', 'kestrel', 'orbital-ring', 'canyon-relay', 'sakura-hold'])
      expect(COMBAT_MAPS).toContain(id);
    expect(COMBAT_MAPS).toContain('arena');
  });

  it.each(COMBAT_MAPS)('%s', (id) => {
    const def = mapDef(id);
    const hits = findOverlaps(def).map((o) => describeOverlap(def, o));
    expect(hits.filter((h) => !(ALLOWED[id] ?? []).includes(h))).toEqual([]);
  });
});
