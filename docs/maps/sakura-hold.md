# Sakura Hold — redesign notes

A small cherry-blossom castle compound at dusk, 80 × 80 m, for Elimination 1v1–3v3 and small
Bomb games (it stays out of Premier's 5v5 pool). It used to be one big open courtyard with a keep
in the middle; now it plays like a tight CS wingman map: walled garden courts, roofed halls,
paper-screen corridors, a covered wall-walk and a cellar under the keep. What stayed: the
gatehouses with their torii, the shallow moat that slows you down, blossom trees and stone
lanterns, the paper (shoji) walls that stop players, bullets and eyes but let the Boomerang fly
through, and the three-storey keep with a walkable roof.

The map is mirrored north ↔ south (Cyan north, Orange south), so both teams have exactly the
same routes. East and west are different on purpose: A (east) is the tea garden, B (west) the
storehouse court. Both sites sit on the middle line, so each team is equally far from each site.

## Floors

- **Ground** (y 0): everything below.
- **Wall-walk** (y 3): a covered walkway along the west castle wall, with arrow slits looking
  down into the west lane; it ends in a tower room with stairs down into B.
- **Keep**: ground floor, 1st floor (y 4), 2nd floor (y 8) and a walled roof terrace (y 12). Each
  floor is a room joined to the next by stairs; the walls only have narrow arrow slits.
- **Cellar** (y −3.2): stairs go down from the tatami hall and the tea room on each side; the
  tunnels run under both sites to a storeroom under the keep. It is the flank / rotation loop.

## Plan (north half; the south half is the mirror image)

| Section                  | Where (x, z)     | What it is                                                                        |
| ------------------------ | ---------------- | --------------------------------------------------------------------------------- |
| Postern (side spawn)     | 3–13, 3–10       | Roofed spawn room, a wooden screen hides it; exits south (yard) and east (garden) |
| Gatehouse (main spawn)   | 32–48, 3–10      | Roofed, the Tower inside; exits: main gate (front court) and two side doors       |
| North garden             | 14–31, 3–11      | Garden between the two spawns, blossom tree and lanterns                          |
| East yard + moat bank    | 49–77, 3–13      | Garden to the tea corridor and the moat's torii                                   |
| Front court (mid)        | 32–48, 11–33     | Shrine stone in the middle, steps south to the keep door                          |
| Tatami hall              | 16–30, 14–22     | Roofed hall with a shoji wall inside; stairs to the cellar                        |
| West lane + yard         | 3–15, 11–29      | Lane along the wall-walk, from the postern to B's veranda                         |
| Wall-walk                | 3–9, 13–35 (y 3) | Covered, arrow slits, stairs up from the postern yard                             |
| Tea room + tea corridor  | 50–63, 12–24     | Roofed room with cellar stairs; a zig-zag of paper walls to A                     |
| Moat lane                | 71–77, 13–40     | Shallow water (slow), two water walls break its sightline; ends at A's water gate |
| B site: storehouse court | 15–27, 29–51     | Walk-through kura (storehouse) in the middle, roofed verandas N and S             |
| A site: tea garden       | 53–65, 29–51     | Paper tea house in the middle, roofed verandas N and S                            |
| Keep                     | 33–47, 33–47     | Three storeys + roof, doors N / S / E / W on the ground floor                     |

## Lanes

- **B side**: west lane (along the wall-walk) → B veranda; or the tatami hall → B veranda; or up
  the wall-walk → tower room → stairs down into B from the west.
- **Mid**: gatehouse → front court → keep; the keep's west and east doors open onto short
  roofed links into B and A.
- **A side**: tea room → tea corridor (paper walls) → A veranda; or the east yard → the moat →
  the water gate into A from the east.
- **Cellar**: from either hall down under B (or A) to the other team's hall, or into the storeroom
  under the keep between them.

## Bomb sites and their entrances

- **A — tea garden**: north veranda (Cyan side), south veranda (Orange side), the keep link from
  the west, the water gate from the moat in the east. The tea house in the middle is paper: you
  cannot see or shoot through it, but a Boomerang goes straight through.
- **B — storehouse court**: north veranda, south veranda, the keep link from the east, the
  wall-walk stairs from the west. The kura in the middle is solid, with doors north and south.

Each team reaches each site by three ways of its own (its veranda, the keep link, and the moat or
the wall-walk); the map test blocks all but one and checks the site is still reachable.

## Spawn groups (detached spawns)

Each team has 8 spawns in 2 groups; a round spreads a team over both before doubling up.

- **gate** (4 spawns, gatehouse, with the Tower): for mid and A. Three exits: the main gate
  into the front court, the west side door to the garden and the east side door to the east yard.
- **postern** (4 spawns, the side gate in the north-west corner): for B and the wall-walk. Two
  exits: south to the postern yard (west lane, wall-walk stairs) and east into the garden.

No spawn can be seen from anywhere outside its building (the test checks every standing spot on
a 1.5 m grid, on every floor).

## Openness (tools/map/openness.ts)

|        | Mean watched area | 90th percentile | Seen from 6+ directions |
| ------ | ----------------- | --------------- | ----------------------- |
| Before | 886 m²            | 1424 m²         | 45.7%                   |
| After  | 134 m²            | 256 m²          | 0.9%                    |

Target: ≤ 800 m² / ≤ 1500 m² / ≤ 30% (Split Deck, the reference: 643 / 1040 / 22.5%). Sakura Hold
is now much tighter than Split Deck: nearly every fight is a corridor, a doorway or a small court
(94% of sightlines are shorter than 15 m). The longest looks are the front court → keep steps,
the moat lane and the courts' length (about 20 m).
