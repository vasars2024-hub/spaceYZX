# Leviathan — redesign notes

**Before:** one giant open nave (about 110 × 130 m) with some 60 crates dotted over it. You could
be shot from almost anywhere: every spot was watched by about 2,160 m² of floor, and 81% of
spots were seen from 6 or more directions.

**Now:** the fight happens _inside_ the dead creature: bone rooms, corridors and doors on three
floors. The look stays the same: ivory bone, teal and violet glow, salvage camps, the crystal
heart, the teal nebula outside.

The map is still an exact mirror image left ↔ right (x = 0): Cyan lives on the west flank,
Orange on the east flank. Both bomb sites sit on the mirror line, so both teams have the same
routes and the same timings to each. The head half (north) and the tail half (south) share the
same plan.

## Openness (npm run map -- leviathan, section 12)

|        | Mean watched floor | 90th percentile | Seen from 6+ directions |
| ------ | ------------------ | --------------- | ----------------------- |
| Before | 2,159 m²           | 3,104 m²        | 81.4%                   |
| After  | 297 m²             | 560 m²          | 9.1%                    |
| Target | ≤ 800 m²           | ≤ 1,500 m²      | ≤ 30%                   |

## The three floors

```
UPPER (5.5 m)   the Spine: an enclosed bone walkway along the backbone, north and south
                of the Heart, broken into 4 segments by vertebra housings (their doors
                zig-zag: side, middle, side, so you never see down the whole spine);
                it opens onto the Heart's balcony ring and the brow ledges over the sites

GROUND (0 m)    the Heart, rib halls, rib galleries, the throat / gullet, salvage flanks,
                jaw grounds / hip yards, the skull (A) and the tail (B), spawn camps

MARROW (-5 m)   canals under the ribcage: a stair pit in each flank drops into the
                marrow, a canal runs under the galleries to the marrow chamber, and the
                foramen tunnel climbs up behind the bomb site
```

## Plan of the ground floor (one team's side; north = skull = A)

```
            [jaw grounds]   [   THE SKULL — site A   ]   [jaw grounds]
                  |          jaw door   |   jaw door          |
   [flank room 2]--[rib gallery 2 + stairs]-[throat]-[rib gallery 2]--[flank room 2]
 [skull camp]      |               |          |          |               |
   [flank room 1 + marrow pit]--[rib gallery 1]-[throat]-[gallery 1]--[flank room 1]
                   |                          |
 [heart camp]--[TOWER room]--[rib hall]--[ THE HEART ]--[rib hall]--[TOWER room]
                   ...  the same again to the south, ending at the tail (site B)  ...
```

- **The Heart** (20 × 16 m, 10 m tall): the crystal heart hangs over the power-up. It has doors
  from both rib halls, the throat (north) and the gullet (south), plus a balcony ring at 5.5 m
  that the Spine opens onto. Crystal columns in the corners give cover.
- **Rib halls**: the short rooms between the Heart and each team's Tower room, with a bone rib
  standing across the Heart door.
- **Rib galleries**: two bone rooms per quarter between the ribs, with a fallen rib, salvage
  stacks and doors to the throat, the flank and the jaw grounds. The second gallery holds the
  stairs up to the Spine.
- **The throat (north) / the gullet (south)**: the mid corridor from the Heart to the site, with a
  vertebra standing in the middle to break the long line.
- **Salvage flanks**: three roofed salvage rooms per side. The middle one holds the team's Tower;
  the other two have a stair pit down into the marrow.
- **Jaw grounds / hip yards**: the only open-air areas, walled in by bone, with the lower jaw's
  fangs as cover.

## The bomb sites

- **A: the skull** (north), a bone cathedral 11 m tall with vaulted arches and glass eye-socket
  windows onto the nebula. Entrances: the **throat door** (mid), a **jaw door** on each side
  (from each team's jaw grounds), and the **foramen**, a ramp coming up from the marrow tunnel
  behind the site. Over the throat door is the **brow ledge**, reached from the Spine, where you
  can drop down onto the site.
- **B: the tail** (south) mirrors the skull: the gullet door, the two hip-yard doors, the foramen
  from below and the ledge. A coil of tail vertebrae spirals overhead (decoration only).

## Lanes to each site (for each team)

1. **Flank / jaw lane**: through the salvage flank rooms into the jaw grounds and the side door.
2. **Mid lane**: through the Heart and the throat (or the gullet) to the front door.
3. **High lane**: up the stairs in rib gallery 2, along the Spine, onto the brow ledge.
4. **Low lane**: down the flank pit into the marrow, along the canal, up the foramen behind the
   site.

**Connectors:** the rib galleries join the flank to the throat. The marrow chamber under each
throat is a **loop tunnel between the two teams' sides**, so you can flank under the ribcage
and come up in the enemy's flank room.

## Spawn groups (8 per team, in three camps)

Each camp is a roofed salvage hut: a vestibule with **two doors** and the spawn room behind a
partition, so nobody outside can see a spawn.

| Group   | Spawns | Where                          | Purpose                                      |
| ------- | ------ | ------------------------------ | -------------------------------------------- |
| `skull` | 3      | north flank                    | closest to A (the skull): go hold or hit A   |
| `heart` | 2      | middle, next to the Tower room | mid control: the Heart, the Tower, rotations |
| `tail`  | 3      | south flank                    | closest to B (the tail): go hold or hit B    |

In 3v3 each player starts in a different camp, like a CS left or right spawn.

## Tower mode, Bomb, Elimination

- Towers stand in each team's middle salvage room (x = ±27), with the Controller home next to
  them.
- The bomb sites are 22 × 5.8 m plant zones in front of the foramen pits.
- The power-up floats under the crystal heart.

## Checks

- `packages/shared/test/leviathan.test.ts`: mirror symmetry, no clipping, floors and roofs where
  the plan has them, spawn groups and safety, two exits per camp, clear bot waypoints, bots
  walking from every camp to both sites, the Spine, the ledge and the marrow, Controller carries
  over each crossing, and an Elimination round.
- `npx vitest run tools/map/test/openness.test.ts -t leviathan`: the openness targets.
