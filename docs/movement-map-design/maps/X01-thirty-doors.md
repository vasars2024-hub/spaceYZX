# X01 — Thirty Doors (as built)

Stage surf map (proposed new mode **Expert**) • MOVEMENT_PROFILE v1 • map id `surf-thirty-doors` •
source `packages/shared/src/level/maps/surf-thirty-doors.ts` (`thirtyDoorsCourse`) • own tests
`packages/shared/test/surf-thirty-doors.test.ts`. Built, tested and timed by bots; **not registered
yet** (see §8) and never played by a human. Conventions and formulas:
[README.md](README.md#conventions-used-in-every-spec).

The owner's brief: _"a sectioned off clear room to get to next room surf map with each room having
its own challenge unique gimmick and such, total 30 rooms or so maybe, it needs to start easy and
go to extra challenging extreme."_

## 1. Identity

|                   |                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Theme             | thirty sealed halls open to a twilight sky, stacked in three floors; each hall walled in its wing's colour, glowing pilasters up the walls, a glowing band along their tops, the hall's number in giant glowing digits on its far wall                                                                 |
| Movement identity | _Clear the room, take the door._ Every room is one idea, taught, then combined, then pushed to the extreme.                                                                                                                                                                                            |
| Structure         | 30 rooms = 30 progress gates (C1–C30, named `n · NAME`) + the finish. Each room ends in a **door**: a portal marked with the next room's number                                                                                                                                                        |
| Wings (look)      | 1–5 Dawn Terraces (sea-green faces, limestone walls, warm glow) · 6–10 Amber Halls (amber, sandstone) · 11–15 Glacier Vaults (ice blue, white) · 16–20 Neon Foundry (violet, dark walls, cyan glow) · 21–25 Basalt Forge (basalt, charcoal, orange glow) · 26–30 Void Crown (pearl, near-black, lilac) |
| Sky               | one twilight sky for the map (top #1B2440, horizon #7B6D8E, low sun), fog 220–820 m; the per-room look comes from the wing colours (the engine has one sky per map)                                                                                                                                    |
| Hazards           | hazard red #E8242C only on red zones; cloud floors (`autoFloors`, 25 m under each stretch, pad 15 m) under every room                                                                                                                                                                                  |

## 2. How a room works

1. You come out of the previous room's door (a portal, `vertical: 'zero'`: level, heading south)
   inside a **speed ring** (an air booster 16 × 8 m) that sets your speed to the room's level:
   **teach 24, medium 27, hard 30, extreme 33 m/s** — whatever you carried in. Every room starts
   the same way, so splits compare and a room's difficulty doesn't depend on the last one.
2. 6 m on you fly through the room's **gate** (its progress gate and split; the HUD shows
   `C n` and `n · NAME`).
3. You clear the room and leave through its **door** (portal openings shrink by level:
   18 → 16 → 14 → 12 m); the door is marked with the next room's number (shown over the portal
   and over its exit). Room 30 ends at the finish gate.
4. **A fall anywhere in a room brings you back to that room's start**: its restart bay 16 m
   behind the door exit, 2 m up; the bay's launch throws you back through the speed ring, so a
   restart replays the room's start exactly. Room 1's bay sits beside the start's run-up and
   throws you onto its ramp at about run-off speed. No anchors: rooms are 6–15 s long.

## 3. The building

Three floors of ten rooms (5 columns × 2 rows of ~192 × 470 m cells); every room starts heading
south. Floor 1 (rooms 1–10) starts at y 460, floor 2 (11–20) at y 320, floor 3 (21–30) at y 180;
kill height y 60. Row order: rooms 1–5 north row west → east, 6–10 south row east → west (the
same snake on each floor). Rooms 2, 20, 25, 26 and 27 are shifted in their cells (`SHIFT`) so
their walls fit. Walls stand 26 m outside the room's racing line and bay, from 40 m under its
lowest point to 20 m over its highest; any wall that would cut through something is pulled in
or left out (all 120 are placed).

## 4. The rooms

Measured with the steady bot (clean run) and the human bot at 0.6; speed = average / top in the
room (m/s); faces = face heights used (m); R = tightest ridge radius (m); ramp = metres of ridge.

| #   | Room            | Gimmick                                                                        | Level   | In  | Clean s | Human 0.6 s  | Speed   | Faces | R   | Ramp | Windows           | Portals | Red |
| --- | --------------- | ------------------------------------------------------------------------------ | ------- | --- | ------- | ------------ | ------- | ----- | --- | ---- | ----------------- | ------- | --- |
| 1   | First Light     | one long wide straight: hold into the ramp                                     | teach   | 12  | 7.6     | 8.0          | 22 / 29 | 18    | –   | 145  | –                 | –       | –   |
| 2   | The Long Bend   | one broad banked quarter turn                                                  | teach   | 24  | 7.7     | 7.8          | 31 / 35 | 16    | 80  | 226  | –                 | –       | –   |
| 3   | Crossing        | the first transfer between two opposing wide faces                             | teach   | 24  | 7.3     | 7.6          | 30 / 34 | 18    | –   | 185  | –                 | –       | –   |
| 4   | Stepping Stones | a climbing lip, three big bhop pads (17 m apart), back onto a ramp             | teach   | 24  | 10.0    | 10.0         | 27 / 31 | 16    | –   | 185  | –                 | –       | –   |
| 5   | The Grand Surf  | two long S-curves joined by a transfer                                         | teach   | 24  | 12.1    | 12.3         | 32 / 36 | 16    | 120 | 358  | –                 | –       | –   |
| 6   | Turnaround      | a portal (↺) turns you 180° onto a parallel ramp                               | medium  | 27  | 7.1     | 7.3          | 33 / 38 | 14    | –   | 202  | –                 | 1       | –   |
| 7   | Keyhole         | two transfers, each through a window                                           | medium  | 27  | 8.2     | 8.8          | 32 / 34 | 14    | –   | 210  | 16×11, 14×10      | –       | –   |
| 8   | Scoop Valley    | dips and climbs; release off a climb up onto a raised catch                    | medium  | 27  | 9.5     | 9.6          | 32 / 34 | 14    | –   | 265  | –                 | –       | –   |
| 9   | Quarter Turns   | two turning portals (↱ +90°, ↲ −90°), a catch after each                       | medium  | 27  | 8.5     | 8.7          | 35 / 40 | 14    | –   | 244  | –                 | 2       | –   |
| 10  | The Spine       | an A-frame spine crossing, then an S down the far face                         | medium  | 27  | 10.0    | 10.0         | 33 / 37 | 14    | 110 | 302  | –                 | –       | –   |
| 11  | Slingshot       | a booster ring (36 m/s, +8 up) flings you 47 m onto a far ramp                 | hard    | 30  | 10.1    | 10.2         | 35 / 38 | 12/16 | 90  | 279  | –                 | –       | –   |
| 12  | Red Band        | red strips (from depth 0.62) down two bends                                    | hard    | 30  | 8.6     | 8.7          | 33 / 37 | 12    | 100 | 255  | –                 | –       | 2   |
| 13  | The Coil        | a full turn of descending helix (R 55), out under its own start                | hard    | 30  | 11.6    | 11.7         | 36 / 38 | 11    | 55  | 421  | –                 | –       | –   |
| 14  | Zigzag          | six short 9 m faces left and right in turn, red below                          | hard    | 30  | 10.3    | 11.1         | 36 / 43 | 12/9  | –   | 260  | –                 | –       | 6   |
| 15  | Hall of Windows | three transfers through ever smaller windows                                   | hard    | 30  | 8.5     | 10.3         | 33 / 34 | 12    | –   | 215  | 13×10, 11×9, 10×8 | –       | –   |
| 16  | The Drop        | two 16 m high-to-low transfers onto wide faces                                 | hard    | 30  | 8.8     | ≈ 33 (falls) | 34 / 37 | 12/18 | –   | 240  | –                 | –       | –   |
| 17  | Bhop Gauntlet   | five small (6 × 8) pads swinging ±15–22° over a red pool, a lintel             | hard    | 30  | 11.1    | 10.9         | 26 / 35 | 12    | –   | 170  | –                 | –       | 1   |
| 18  | Tight S         | a tight S on one face (45 m bends, one outside)                                | hard    | 30  | 6.7     | 6.8          | 35 / 38 | 12    | 45  | 217  | –                 | –       | –   |
| 19  | Portal Maze     | three offset turning portals (◇ ◈ ◆): west, south, east                        | hard    | 30  | 7.9     | 7.7          | 35 / 38 | 12    | –   | 211  | –                 | 3       | –   |
| 20  | Low Vault       | a red cornice over the ridge and a red strip below: ride the band              | hard    | 30  | 9.0     | 8.8          | 32 / 36 | 12    | 90  | 262  | –                 | –       | 34  |
| 21  | Long Jump       | two 30 m transfers off climbing lips onto red-footed faces                     | extreme | 33  | 8.6     | 8.8          | 36 / 38 | 11    | –   | 230  | –                 | –       | 2   |
| 22  | Needle          | two transfers through 9 × 7 m windows                                          | extreme | 33  | 6.3     | 6.6          | 34 / 37 | 11    | –   | 160  | 9×7, 9×7          | –       | –   |
| 23  | The Drain       | a half-turn spiral tightening 64 → 30 m round a red core, red strip below      | extreme | 33  | 6.3     | 6.2          | 37 / 39 | 11    | 30  | 228  | –                 | –       | 3   |
| 24  | Pillar Garden   | four transfers, each between two red posts (10 m apart)                        | extreme | 33  | 8.7     | 9.2          | 30 / 36 | 11    | –   | 198  | –                 | –       | 8   |
| 25  | Switchback      | two banked 180° hairpins (R 34), red below, the second across the first's back | extreme | 33  | 8.9     | 8.9          | 36 / 39 | 11    | 34  | 304  | –                 | –       | 2   |
| 26  | Cannon          | two booster rings (40 m/s) fire you 52 m onto short red-footed bends           | extreme | 33  | 10.4    | 10.4         | 40 / 46 | 11/9  | 60  | 288  | –                 | –       | 2   |
| 27  | Chain Reaction  | four offset portals (α β γ δ, 10 × 10) with 9 m catches between                | extreme | 33  | 8.7     | 8.6          | 37 / 40 | 11/9  | –   | 238  | –                 | 4       | –   |
| 28  | Twin Spines     | two tight A-frames back to back                                                | extreme | 33  | 9.8     | 11.2         | 34 / 37 | 11    | 80  | 308  | –                 | –       | –   |
| 29  | The Gauntlet    | needle window, red-strip bend, red posts, red cornice, an offset portal (✶)    | extreme | 33  | 9.9     | 10.5         | 33 / 36 | 11/9  | 60  | 266  | 9×7               | 1       | 13  |
| 30  | The Last Door   | a full helix tightening to 45 m with a red strip, a needle window, home        | extreme | 33  | 15.2    | 15.2         | 37 / 41 | 11/18 | 45  | 535  | 9×7               | –       | 1   |

(Red = red elements plus curves with red strips; the cornice counts every strip.)

## 5. The difficulty ramp (what the tests hold)

- entry speed rises every level (24 → 27 → 30 → 33 m/s); doors shrink (18 → 16 → 14 → 12 m);
- the smallest face per room shrinks on average (teach 16.8 m, medium 14, hard ~11.6, extreme ~10.4);
- tightest bends: teach ≥ 80 m, hard 45 m, extreme 30 m; windows: 16 → 10 → 9 m wide;
- red: none in rooms 1–10, 4 hard rooms, 7 extreme rooms.

## 6. Measured timings and budget

- Steady bot, clean run: **4:34.9** (274.9 s), 0 respawns, every room 6.3–15.2 s; par **275 s**
  (DNF at 2 × par). Human 0.75: 298.7 s (2 falls); human 0.6: 306.8 s (4 falls, all in 16 The
  Drop — its 16 m drops are the hardest landing for a sloppy strafer).
- From every restart bay the steady bot clears its room (6–18 s), never faster than riding on.
- Seams: all 85 curved ramps ridden at 0.8 / 1.0 / 1.15 V without a catch (the
  `tools/race/lab.ts` `rideLine` check of `surf-seams.test.ts`, run by hand: the map isn't in
  `surfMaps()` yet).
- Budget: **9 948 boxes** (5 003 colliders), **≈ 223 k triangles** (ramps 114 k, red strips 15 k,
  cloud floors 27 k + their glow ≈ 18 k, gates/frames/walls the rest), 0 overlaps, 0 validation
  problems. That is over the ~180 k target of a 3-minute map, for 4.6 minutes of rooms (≈ 810
  triangles per second of play vs ≈ 850–1000 on the standard maps). The shells are `lowDetail`
  / glow (one quad per face). Source 46 KB (≈ 20 KB minified once registered; first download
  today 1.48 MB of the 5 MB budget).

## 7. Not possible on a surf map today

- **Fuel-cell jetpack rooms**: a surf course always gets `noJetpack` (expand.ts:
  `noJetpack: surf || …`), so no room uses fuel cells.
- **Per-room sky**: one `CourseSky` per course; rooms differ by wall and face colours only.

## 8. To register it (owner decision; not done — other agents are editing the registry)

- `maps/index.ts`: `courseMap('surf-thirty-doors', 'Thirty Doors', thirtyDoorsCourse, 'expert')`
  and `export * from './level/maps/surf-thirty-doors'` in `packages/shared/src/index.ts`, a
  `MAP_BLURBS` line in `packages/client/src/ui/flow.ts`.
- A new mode: `CourseMode = 'beginner' | 'intermediate' | 'expert'` (types.ts), a `SURF_MODES`
  entry (e.g. `{ mode: 'expert', label: 'Expert', color: '#e0525f' }`), and the course's `mode`
  changed from `'intermediate'` (a placeholder: the type has no third value yet) to `'expert'`.
- `surf-maps.test.ts` assumes a standard map (5 gates, ≥ 5 anchors, 165–195 s, modes
  beginner/intermediate): either skip `expert` maps there (this map has its own test file) or
  make those rules per mode (expert: one gate per room, no anchors required, 250–310 s).
  `tools/race/test/surf-seams.test.ts` will then ride it automatically.

## 9. Untested assumptions

- Nobody has played it or looked at it in the client (it can't be picked before it is
  registered). Readability of the doors, rings and red posts is unchecked.
- The speed ring makes every room start the same; players may miss carrying speed through doors.
- The human bots barely slow down on surf (the ring evens things out); real extreme-room success
  rates (9 × 7 windows at 33+ m/s, 10 m offset portals, R 30 spiral) are unknown.
- Triangle count ≈ 223 k: frame rate and load (light baking) untested on low-end machines.
