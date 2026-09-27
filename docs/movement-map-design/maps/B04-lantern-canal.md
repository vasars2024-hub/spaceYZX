# B04 — Lantern Canal (build spec)

Beginner surf • MOVEMENT_PROFILE v1 • map id `surf-lantern-canal` (suggested) • brief §9 B04
Conventions, symbols and formulas: [README.md](README.md#conventions-used-in-every-spec). Every
number is a first blockout value **to calibrate** unless it quotes the movement profile.

## 1. Identity

|                     |                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode / discipline   | Beginner / surf                                                                                                                                                                                                                                                                                                                                                     |
| Movement identity   | _Read each bend before you reach it: cross the canal bank to bank, let the doors turn you, and pick the height that takes you under or over._                                                                                                                                                                                                                       |
| Dominant techniques | 1. **reading bends**: 14 bank-to-bank transfers across curved canal banks (every one an opposing V over water); 2. **turning portals**: Door A (+90°, main) and Door B (+85°, optional) realign horizontal heading, speed kept; 3. **departure height**: under a dock beam, up into the open dock, Door B only from the upper band, all with generous clearance     |
| Supporting          | two manual bhop phrases (4 + 3 ferry stones) round a moored ferry; a broad 180° court curve with a crossing over a red strip; a portal lift (+86 m) back to the upper town                                                                                                                                                                                          |
| Landmark            | **the paper festival lantern**: a 24 m paper lantern hung from four timber masts over the finish in the festival square (≈ −351, 190–214, 122), the lowest point of a hill town. Seen from above in Acts 1, 2 and 5 (route y 370 / 330 / 265), met head-on through the arcade in Act 6.                                                                             |
| Palette             | midnight indigo `#242F52` (sky, water, deep shadow), lantern amber `#F2B85E` (lanterns, windows, gate lanterns: never on a usable edge), weathered timber `#725545` (bank planking, houses, beams), soft teal `#518C91` (every usable ridge strip, anchors, Door A), paper white `#F4EEDC` (Door B, glyphs), hazard red `#E8242C` + black hatching (red zones only) |
| Materials           | surf faces: timber-planked canal banks with stone coping, planks running along the ramp, one continuous teal ridge strip; pads: pale moonstone tops `#C9D3D6` with teal rims, drawn as rounded ferry stones inside the square collision; structure: timber houses on stone plinths, stone bridges and arches; water: indigo, rough (blurred) reflections            |
| Lighting            | warm lanterns strung along eaves and bridges, always above or behind the corridor, never at a lip or landing; cool teal edge light on every usable ridge; gates = timber arches with amber lanterns + a teal split panel                                                                                                                                            |
| Fog                 | `#242F52`, near 150 m, far 700 m; water reflections blurred (no mirror-sharp lantern lines that read as ledges); low mist only below canal-floor level, never across a transfer                                                                                                                                                                                     |
| Sound               | water against stone; restrained festival percussion (frame drum, clappers) growing act by act; distant domestic sounds (a door sliding shut, dishes above) in Acts 1–3; Door A a low two-note chime, Door B a single high bell; the standard red-failure cue                                                                                                        |
| Poetic              | _Evening fills the canals first; let the lanterns lead you down through the town to the one waiting over the square._                                                                                                                                                                                                                                               |
| Practical           | _Keep lantern warmth off every lip and landing: each ridge carries the one cool teal line, and each door shows its glyph and its destination from two seconds away._                                                                                                                                                                                                |

The town is terraced on a hillside: each act's canal level lies 2 m below the foot of its banks
(walkable shallow water) and the levels step down through lock gates and sluices (red where deep).
The route falls from y 400 to 186, Door A lifts it to 272, and it falls again to the square at 160.

## 2. Route sketch

Top-down, north up (schematic, not to scale; coordinates ≈ ±15 m, pen sequence authoritative).
`◎` Door A pair, `◇` Door B pair (optional), `▒` red, `~` shallow canal, `◉` fountain, `✦` the paper lantern.

```
   z  x: -1450     -1250     -1050      -850      -650      -450      -250       -50
 -520                                                  S(-520,400)══1A══╗ Quay Bridge over 1A
 -470                   ╭══5B bend══╮═5C══C5══6A══╗                     ╚═R1a═T1╗
 -430                   ║  ◇P2'→5C s 20  C5(-826,230,-468)                     1B ~
 -370                   5B  ◇P2 balcony            ║6A                         ║
 -336                   ╚T5b═lip·R5b               R6a(-636,205,-296)          ║
 -200                     ║5A  bend canal ~          ╲6B                       C1(-80,349,-133)
  -90                     ║5A                          R6b                     2A ~
   60                   ◎P1' exit(-1080,272,60) h0         ╲6C           R2a ║
  120                              ╭═══4A═══╮                F ✦ lantern ═beam═ T2b
  160                              ║ ◉ ▒    ║ lantern      (-351,163,122)   2B ║
  200                            R4a╝ ▒red  ║ court                       R2b T2c↑ ▒DS1
  240                          4B╮ crossing ║C3(-762,266,283)               2C ╮ open dock
  340    ◎P1═5L═R5a═C4═══4C═══R4b══4B╯      ║3C                               ║
  560    ▒DS2 lock chamber under 5L        F7‥F5═R3b═3B═F4‥F1(ferry)═R3a═3A═C2(-312,303,598)═╯
```

Faster line: Door B (`◇P2` → `◇P2'`) skips 5B's bend; the tighter court release leaves 4A early
over the red strip onto 4B's mid band further along (§6). Shallow canal (`~`) lies under every
bank; its slow bank routes are in §4 "Failure surfaces".

Side elevation (route-line height vs. route distance):

```
 y 400 S╮
   370    ╲1A_R1a
   350        ╲1B_C1
   330            ╲2A_beam_2B╮  ╱R2b                     ◎P1' 272╮
   305                        ╲╱  ╲2C_C2_3A╮╱F1‥F4                ╲5A__╮_╱lip R5b ···◇P2
   290                                      ╲3B╱F5‥F7                    ╲5B_╲
   266                                              ╲3C_C3                    5C_C5 230
   246                                                  ╲4A╮ crossing ▒        ╲6A_R6a
   222                                                      ╲4B_R4b                ╲6B_R6b
   200                                                          ╲4C_C4                 ╲6C_F 163
   186                                                               ╲5L_R5a_◎P1 (lift +86 m)
       0 m      690        1550        2300        3160    3320 │ 3330       4170          5060
```

## 3. Phrase tables

Speeds are practiced-human (0.6 strafe) estimates; the steady bot runs higher.

### Act 1 — Outer quay (target 27 s)

| Beat | Time | Geometry                                                    | Player action               | Required result                     |
| ---- | ---: | ----------------------------------------------------------- | --------------------------- | ----------------------------------- |
| 1    |  3 s | start deck (quay steps), 6 m drop                           | sprint, drop onto 1A        | board 1A at depth 0.2–0.5, ≥ 14 m/s |
| 2    | 12 s | 1A: the quay bank, banked right, under the high Quay Bridge | hold the band, build speed  | leave 1A at 28–31 m/s               |
| 3    |  1 s | T1 across the canal between the bridge piers                | first bank-to-bank transfer | catch 1B mid band                   |
| 4    | 11 s | 1B: broad outside bend to heading 180                       | hold into the face          | cross C1 at 29–32 m/s               |

### Act 2 — Covered docks (target 29 s)

| Beat | Time | Geometry                                                | Player action            | Required result                          |
| ---- | ---: | ------------------------------------------------------- | ------------------------ | ---------------------------------------- |
| 1    |  9 s | T2a onto 2A inside the first covered bay                | settle on the other bank | 29–33 m/s                                |
| 2    |  1 s | T2b **under** a tie beam (≥ 5 m clear of a normal head) | ordinary release         | catch 2B, never touch the beam           |
| 3    |  9 s | 2B bends back and climbs 8 m to its lip                 | ride up, keep the band   | lip at 27–31 m/s, vy ≈ +4                |
| 4    |  1 s | T2c **rises** out of the roof into the open dock        | release on the climb     | catch 2C above depth 0.6 (DS1 red below) |
| 5    |  9 s | 2C banked 90° out of the docks                          | settle                   | cross C2 at 28–32 m/s                    |

### Act 3 — Ferry stones (target 28 s)

| Beat | Time | Geometry                                                               | Player action                  | Required result          |
| ---- | ---: | ---------------------------------------------------------------------- | ------------------------------ | ------------------------ |
| 1    |  8 s | 3A banked left, climbs 10 m to a lip                                   | spend speed                    | lip at 22–27 m/s         |
| 2    |  4 s | T3b onto F1 [10, 20]; F1–F4 curve 15° per stone round the moored ferry | manual hops, steer 15° per hop | hop onto 3B at 24–26 m/s |
| 3    |  6 s | 3B broad bank under a footbridge, climbs 5 m                           | board mid band, ride up        | lip at 25–29 m/s         |
| 4    |  2 s | F5–F7: three hops, 20° per stone, toward the court                     | hop, steer                     | board 3C                 |
| 5    |  8 s | 3C straight descent through the Ferry Arch                             | rebuild speed                  | cross C3 at 30–33 m/s    |

### Act 4 — Lantern court (target 27 s)

| Beat | Time | Geometry                                                             | Player action                                            | Required result              |
| ---- | ---: | -------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------- |
| 1    |  4 s | 4A lantern lane, the court opening ahead                             | settle                                                   | 30–33 m/s at the court       |
| 2    |  6 s | 4A: 180° round the fountain on the broad outside wall                | follow the curve at 0.2–0.5                              | 33–35 m/s at the curve's end |
| 3    |  2 s | 15 m climb, release south across the court centre over the red strip | release on the climb (tighter line: earlier, upper band) | catch 4B's broad lower catch |
| 4    |  7 s | 4B banked right out of the court                                     | settle, rebuild                                          | 32–35 m/s                    |
| 5    |  8 s | T4c onto 4C, a gentle S through the west lane                        | read the S                                               | cross C4 at 31–34 m/s        |

### Act 5 — Twin doors (target 32 s)

| Beat | Time | Geometry                                                                                      | Player action                                                   | Required result                   |
| ---- | ---: | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------- |
| 1    |  5 s | T5a onto the lock ramp 5L; Door A (teal moon gate) straight ahead, previewing the upper canal | fly the door's centre                                           | enter within ±8 m of centre       |
| 2    |  0 s | Door A: turn +90°, lift +86 m                                                                 | look ahead                                                      | exit heading 0, speed kept        |
| 3    | 13 s | 5A settling ramp (≥ 6 s before any demand), Door B on its balcony ahead-right                 | **decide**: mid band (main) or climb to the upper band (Door B) | committed by ≈ 2 s before the lip |
| 4    |  9 s | main: T5b left onto 5B, the 105° bend round the corner house, T5c onto 5C                     | read the bend                                                   | catch 5C at s 70                  |
| 4′   |  3 s | optional: strafe right off the lip into Door B (+85°), out onto 5C's lead-in                  | fly the door                                                    | land 5C's upper band at s 15–25   |
| 5    |  5 s | 5C merge straight                                                                             | settle                                                          | cross C5 at 32–34 m/s             |

### Act 6 — Festival run (target 28 s)

| Beat | Time | Geometry                                                                              | Player action  | Required result                       |
| ---- | ---: | ------------------------------------------------------------------------------------- | -------------- | ------------------------------------- |
| 1    | 10 s | T6a onto 6A, broad banked sweep to the south                                          | familiar       | 32–35 m/s                             |
| 2    |  9 s | T6b (standard) onto 6B, sweeping back toward the lantern                              | familiar       | 32–35 m/s                             |
| 3    |  1 s | T6c: the longer, graceful transfer (24 m ahead, 12 m across) over the festival sluice | release, align | catch 6C                              |
| 4    |  8 s | 6C sweeps to heading 180 through the open arcade                                      | coast          | finish under the lantern at 31–34 m/s |

## 4. Element geometry

Face shapes (README): **WIDE** 18 × 55° (slant 22.0, run 12.6), **BROAD** 16 × 56° (19.3, 10.8),
**STD** 14 × 58° (16.5, 8.7). "b" = banked, "o" = outside; rider radius at depth 0.35; ω = turn
rate at the top of the speed band. ⇔ = stretch leg. Main-line ω ≤ 36°/s everywhere (Beginner
comfort 60°/s). Every transfer below is checked with the README window (flat release unless noted).

### Act 1

Pen start: `new Pen([-520, 400, -520], 90)`, `start([16, 16])`, `platform([10, 12], 'strafe')`.

| ID          | Pen                                                                                                                                                                               | Face / side                               | Turn, R, ω                | Drop | Heading | Band     | Speed |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------- | ---- | ------- | -------- | ----- |
| 1A          | `move(12,-6)` `[straight(130,10)⇔, arc(45,200,9), straight(50,3)]`                                                                                                                | BROAD right                               | +45° R 200 (b, 196) ω 9   | 22   | 90→135  | 0.2–0.5  | 14→31 |
| Quay Bridge | stone bridge across 1A's arc middle (≈ −281, 379, −504), deck underside ≥ ridge + 22; piers ≥ 14 m outside 1A's ridge and ≥ 14 m beyond 1B's foot, framing 1B from the T1 release | solid, amber lanterns on the parapet only |                           |      |         |          |       |
| R1a         | `move(4,-2).anchor('Bridge Pier', {}, [16,14])` (heading 135: enlarged AABB, nothing else within 30 m)                                                                            |                                           |                           |      |         |          |       |
| T1          | `move(11,-3,+9)` → (15, −5, +9): at 30 t 0.58, 10t² 3.4 → −6.4…−2.4 ✓                                                                                                             |                                           |                           |      |         |          | 30    |
| 1B          | `[straight(40,2), arc(45,240,9), straight(70,5)⇔]`                                                                                                                                | WIDE left                                 | +45° R 240 (o, 244) ω 7.5 | 16   | 135→180 | 0.15–0.5 | 29–32 |
| C1          | `move(6,-2).gate([24,18],'Quay Bridge')`: the bridge's toll arch at the quay's south landing ≈ (−80, 349, −133), heading 180                                                      |                                           |                           |      |         |          |       |

### Act 2

| ID         | Pen                                                                                                                                                                                                                                 | Face / side           | Turn, R, ω               | Drop                | Heading | Band                          | Speed    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------ | ------------------- | ------- | ----------------------------- | -------- |
| T2a        | `move(14,-5,-9)` → from 1B's end (20, −7, −9): t 0.73, 10t² 5.3 → −8.3…−4.3 ✓                                                                                                                                                       |                       |                          |                     |         |                               |          |
| 2A         | `[straight(100,6)⇔, arc(25,220,5), straight(40,2)]`                                                                                                                                                                                 | STD right             | +25° R 220 (b, 217) ω 9  | 13                  | 180→205 | 0.2–0.5                       | 29–33    |
| roof       | covered bays over 2A and 2B s 0–150: underside ≥ ridge + 9, posts ≥ 6 m outside both face edges                                                                                                                                     | timber                |                          |                     |         |                               |          |
| R2a        | `move(4,-2).anchor('Beam Bay', {}, [16,14])` (heading 205)                                                                                                                                                                          |                       |                          |                     |         |                               |          |
| T2b + beam | `move(11,-3,+9)` → (15, −5, +9) ✓; tie beam [50 × 2 × 1.5] across the flight 8 m after the release, **underside = 2A's end ridge + 4.5**: 9.4 m over a racing-line head, 2.2 m over a ridge-band release with a jump (H + margin ✓) | solid timber, not red |                          |                     |         |                               |          |
| 2B         | `[straight(40,2), arc(-25,220,5), straight(70,5), straight(60,-8)]`                                                                                                                                                                 | STD left              | −25° R 220 (b) ω 9       | 12, climbs 8 (13 %) | 205→180 | 0.2–0.45                      | 30→34→29 |
| R2b        | `move(4,-1).anchor('Open Dock', {}, [16,14])`                                                                                                                                                                                       |                       |                          |                     |         |                               |          |
| T2c        | `move(12,-1,-9)` → (16, −2, −9) **rising**: at 29 t 0.63, 10t² 4.0, vy0 = 29 × 0.133 = 3.9 → lands −1.5 (window −4.5…−0.5) ✓; 2C's ridge sits ≈ 7 m above 2B's lowest ridge                                                         |                       |                          |                     |         |                               | 27–31    |
| DS1        | red box [30, 1, 40] (dock lock) 12 m below the T2c flight, heading 180                                                                                                                                                              | red, hatched          |                          |                     |         |                               |          |
| 2C         | `[straight(50,3), arc(90,160,12)]`                                                                                                                                                                                                  | WIDE right            | +90° R 160 (b, 156) ω 12 | 15                  | 180→270 | catch 0.15–0.6, ride 0.2–0.45 | 27→32    |
| C2         | `move(6,-2).gate([24,18],'Dock Gate',{ flightSec: 1.0 })` ≈ (−312, 303, 598), heading 270                                                                                                                                           |                       |                          |                     |         |                               |          |

### Act 3

| ID         | Pen                                                                                                                                                 | Face / side                      | Turn, R, ω                 | Drop                 | Heading | Band                          | Speed    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------- | -------------------- | ------- | ----------------------------- | -------- |
| T3a        | `move(14,-5,+9)` → (20, −7, +9) ✓                                                                                                                   |                                  |                            |                      |         |                               |          |
| 3A         | `[straight(40,2), arc(-30,150,3), straight(70,-10)]`                                                                                                | STD left                         | −30° R 150 (b, 147) ω 12   | 5, climbs 10 (14 %)  | 270→240 | 0.2–0.45                      | 30→25    |
| R3a        | `move(4,-1).anchor('Ferry Steps', {}, [16,14])` (heading 240)                                                                                       |                                  |                            |                      |         |                               |          |
| T3b        | `move(20,-5,-3)` surf-to-bhop: at 25 t 0.97, vy0 3.6 → lands −5.9 ✓ on F1                                                                           |                                  |                            |                      |         |                               | 25       |
| F1–F4      | `bhopPads([{d:0,size:[10,20]},{d:20,turn:15,rise:-1},{d:20.5,turn:15,rise:-1},{d:21,turn:15,rise:-1}],[9,12])`                                      | moonstone [9 × 12] (11 W × 15 W) | arc ≈ R 78 round the ferry | 3                    | 240→285 |                               | 24→26    |
| ferry      | moored hull [46 × 7 × 12] 30 m north of F2–F3 (inside the arc), deck ≥ 8 m below the pad tops, no mast, canopy or lantern within 12 m of a hop line | solid, non-interactive           |                            |                      |         |                               |          |
| T3c        | from F4 `move(16,-2,+3)` onto 3B (bhop-to-surf; the hop meets the face early)                                                                       |                                  |                            |                      |         |                               | 26       |
| 3B         | `[straight(40,3), arc(30,120,3), straight(40,-5)]`                                                                                                  | BROAD right                      | +30° R 120 (b, 116) ω 14   | 6, climbs 5 (12.5 %) | 285→315 | catch 0.2–0.6, ride 0.25–0.45 | 25→28→27 |
| footbridge | timber walkway across 3B at s ≈ 35, underside ≥ ridge + 6                                                                                           | solid                            |                            |                      |         |                               |          |
| R3b        | `move(4,-1).anchor('Ferry Walk', {}, [16,14])` (between the phrases)                                                                                |                                  |                            |                      |         |                               |          |
| T3d        | `move(18,-4,+3)` → (22, −5, +3): at 27 t 0.82, vy0 3.4 → −4.0 ✓ on F5                                                                               |                                  |                            |                      |         |                               | 27       |
| F5–F7      | `bhopPads([{d:0,size:[10,18]},{d:21.5,turn:20,rise:-1},{d:22,turn:20,rise:-1}],[9,12])`                                                             | moonstone [9 × 12]               |                            | 2                    | 315→355 |                               | 26→28    |
| T3e        | from F7 `move(16,-2,-3)` onto 3C                                                                                                                    |                                  |                            |                      |         |                               |          |
| 3C         | `[straight(180,12)⇔, straight(40,2)]`                                                                                                               | BROAD right                      | —                          | 14                   | 355     | catch 0.2–0.6, ride 0.2–0.5   | 27→33    |
| C3         | `move(6,-2).gate([22,16],'Ferry Arch')` ≈ (−762, 266, 283), heading 355                                                                             |                                  |                            |                      |         |                               |          |

**Pad spacing**: stones step down 1 m, t_air 0.82 s; phrase 1 at 24.5 m/s +0.5/hop → 20.1 / 20.5
/ 20.9 (d 20 / 20.5 / 21); phrase 2 at 26.5 → 21.7 / 22.1 (d 21.5 / 22). Depth 12 ≥ 0.4 × 22 + 2 ✓.
**Manual hops only**: a missed first tick (−10 %) flies 18.1 m, inside the next back edge (d − 6 = 14) ✓; the stones accept ≈ 17–31 m/s (phrase 2: 18.5–32). F1's ±5 m landing spread carries to F2
(half-depth 6): grow F2 to [9, 14] if traces land long. **Dockside paths** (branches, as B01's
walkway): a 3 m `path` 10 m left of the stones (quay side), 2.5 m lower, stairs from the basin at
every stone, a `launch` at its end onto 3B s 24 / 3C s 30 (`flightSec` 1.1), `forks` entries with
`salvage: true`; a lost rhythm costs ≈ 6–9 s.

### Act 4 — lantern court

Court: sunken plaza, walkable floor y ≈ 222 (shallow basin water over it). 4A's arc centre
C_A ≈ (−820, 159). Fountain column r 3, top y 238, at (−850, 222, 192): inside the 180° curve, 20 m
east of the crossing. **Red strip** (the deep central basin): red box [22, 1.5, 44] centred
(−870, 222, 200), heading 0, hatched rim, directly under the crossing; the rest of the basin and the
plaza are shallow (non-lethal).

| ID       | Pen                                                                                                                                                  | Face / side                            | Turn, R, ω                               | Drop                | Heading     | Band                                               | Speed    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------- | ------------------- | ----------- | -------------------------------------------------- | -------- |
| T4a      | `move(8,-3,+9)` → from 3C's end (14, −5, +9): at 32 t 0.52, 2.7 → −5.7…−1.7 ✓                                                                        |                                        |                                          |                     |             |                                                    |          |
| 4A       | `[straight(120,5)⇔, arc(-180,60,14), straight(15,-2)]`                                                                                               | **WIDE** left (the broad outside wall) | −180° R 60 (b, 55.6) ω 36 at 35          | 19, climbs 2 (13 %) | 355→175     | 0.15–0.55, no red                                  | 30→35→33 |
| R4a      | `move(4,-0.5).anchor('Pavilion', {}, [18,16])` (first metres of the crossing)                                                                        |                                        |                                          |                     |             |                                                    |          |
| crossing | `move(36,-10.5,-6)` → (40, −11, −6): at 33 t 1.22, 10t² 14.9, vy0 = 33 × 0.133 = 4.4 → lands −9.5 (window −12.5…−8.5) ✓; 14–24 m above the red strip |                                        |                                          |                     |             |                                                    | 32–35    |
| 4B       | `[straight(20,2), arc(95,90,9), straight(50,2)]`                                                                                                     | BROAD right                            | +95° R 90 (b, 86) ω 23                   | 13                  | 175→270     | catch 0.15–0.75 (lower broad catch), ride 0.2–0.45 | 31→35    |
| R4b      | `move(4,-2).anchor('Colonnade', {}, [16,14])`                                                                                                        |                                        |                                          |                     |             |                                                    |          |
| T4c      | `move(10,-3,+9)` → (14, −5, +9) ✓                                                                                                                    |                                        |                                          |                     |             |                                                    |          |
| 4C       | `[straight(40,2), arc(-30,150,5), arc(30,150,5), straight(60,3)]`                                                                                    | STD left                               | −30° R 150 (b, 147) / +30° (o, 153) ω 13 | 15                  | 270→240→270 | 0.2–0.45                                           | 31–34    |
| C4       | `move(6,-2).gate([24,18],'Fountain Exit')` ≈ (−1270, 200, 363), heading 270                                                                          |                                        |                                          |                     |             |                                                    |          |

The 180° is "round the fountain": the column stands inside the curve (44 m from C_A) and stays on
the rider's left the whole way; the release crosses the court centre. Too slow a crossing (< 25
m/s) catches 4B low (depth ≈ 0.9) or drops onto the red strip → R4a.

### Act 5 — twin doors

| ID                                    | Pen                                                                                                                                                                                                                                           | Face / side                                                         | Turn, R, ω                | Drop                    | Heading | Band                                            | Speed    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------- | ----------------------- | ------- | ----------------------------------------------- | -------- |
| T5a                                   | `move(14,-5,-9)` → (20, −7, −9) ✓                                                                                                                                                                                                             |                                                                     |                           |                         |         |                                                 |          |
| 5L                                    | `[straight(140,7)⇔]` (the lock ramp)                                                                                                                                                                                                          | STD right                                                           | —                         | 7                       | 270     | 0.2–0.45                                        | 30–33    |
| DS2                                   | lock chamber: red box [34, 1, 190] 8 m below 5L's foot, from 5L's start to 30 m past Door A                                                                                                                                                   | red                                                                 |                           |                         |         |                                                 |          |
| R5a                                   | `move(4,-2).anchor('Door A', {}, [16,14])`                                                                                                                                                                                                    |                                                                     |                           |                         |         |                                                 |          |
| **P1 Door A**                         | `airPortal(18, [-1080, 272, 60], 90, [16,16])`: opening ≈ (−1446, 186, 372), faces **270** (approach exactly 270), `turn` **+90**, exit lifted **+86 m**                                                                                      | teal moon gate, crescent glyph                                      |                           |                         | 270→0   |                                                 | kept     |
| 5A                                    | `move(14,-8).curve({ lead: 14, legs: [straight(190,3)⇔, arc(-15,300,2), straight(60,6), straight(60,-7)] })`                                                                                                                                  | WIDE left                                                           | −15° R 300 (b, 296) ω 6   | 11, climbs 7 (11.7 %)   | 0→345   | 0.2–0.45 (Door B: ≤ 0.27)                       | 30→33→31 |
| R5b                                   | `move(4,-1).anchor('Balcony', {}, [18,16])` (both lines pass it)                                                                                                                                                                              |                                                                     |                           |                         |         |                                                 |          |
| T5b                                   | `move(12,-1,-9)` → (16, −2, −9): at 31 t 0.59, 10t² 3.5, vy0 3.6 → lands −1.4 (window −4.4…−0.4) ✓                                                                                                                                            |                                                                     |                           |                         |         |                                                 |          |
| 5B                                    | `[straight(20,1), arc(105,90,10), straight(70,3)]`                                                                                                                                                                                            | WIDE right                                                          | +105° R 90 (b, 85.6) ω 23 | 14                      | 345→90  | 0.2–0.45                                        | 31–35    |
| T5c                                   | `move(14,-5,+9)` ✓                                                                                                                                                                                                                            |                                                                     |                           |                         |         |                                                 |          |
| 5C                                    | `curve({ lead: 70, legs: [straight(140,7)] })`: main catch at s 70; the lead-in runs beside 5B's last straight (starts 14 m after that straight begins: no clip with 5B's arc)                                                                | WIDE left                                                           | —                         | 7 (+3.5 on the lead-in) | 90      | Door B catch s 15–25 at 0.15–0.5; main 0.2–0.45 | 32–34    |
| C5                                    | `move(6,-2).gate([24,18],'Twin-Door Merge')` ≈ (−826, 230, −468), heading 90                                                                                                                                                                  |                                                                     |                           |                         |         |                                                 |          |
| **P2 Door B** (optional, off the pen) | opening [16, 16] ≈ (−1118, 261, −370) = 5A's lip + 32 m ahead, 12 m right; faces **0**; bottom edge ≈ y 253 (lip ridge − 13); `turn` **+85**; exit **(−1034, 251, −466)** = 12 m before 5C's lead-in s 20, 9 m above it, 2 m toward its ridge | paper-white ogee door, diamond glyph, on the corner house's balcony |                           |                         | ≈5→90   |                                                 | kept     |

**Portal rules.** Door A `v_out = rotY(+90°)·v_in`, Door B `v_out = rotY(+85°)·v_in`: |v| and
vertical speed kept, view turned alike, exit point fixed (README gap 1). Door A: the lock flight
arrives at vy ≈ −14, so the exit sits 8 m above 5A's catch and 5A gives 190 m (≈ 6 s ≥ 1.5 s) of
settling; the 16 m opening's ≤ 8 m snap lands on the WIDE face. Door B: 34 m / 1.1 s of flight at
31 m/s on bearing ≈ 5° (5° off its cardinal 0 ✓), arriving at vy ≈ −18: the exit sits 9 m above
5C's lead-in (a normal high-to-low catch), and +85° turns the ideal 5° approach onto 5C's 90°
tangent. Each exit has a non-colliding twin frame behind it and a glyph banner 40 m ahead.

**Door B height choice.** From the lip (ridge Y, release grade 0.117) the flight to the door drops
≈ 8.1 m at 31 m/s (10.9 at 28, 6.0 at 34). The opening spans Y − 13 … Y + 3: it takes depth ≤ 0.27
at 31 m/s (≤ 0.12 at 28, ≤ 0.39 at 34) — **upper band only**; lower flights pass under the balcony
slab (Y − 14 … Y − 13) into the shallow bend canal. The main line leaves the same lip 9 m left and
stays ≥ 12 m from door and slab; a straight-ahead ridge-band flight passes 8 m left of the jamb. The
corner house stands inside 5B's bend, ≥ 10 m inside 5B's face foot.

### Act 6

| ID     | Pen                                                                                                       | Face / side                    | Turn, R, ω                 | Drop | Heading | Band           | Speed |
| ------ | --------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------- | ---- | ------- | -------------- | ----- |
| T6a    | `move(14,-5,-9)` → (20, −7, −9) ✓                                                                         |                                |                            |      |         |                |       |
| 6A     | `[straight(30,2), arc(90,150,14), straight(30,2)⇔]`                                                       | BROAD right                    | +90° R 150 (b, 146) ω 14   | 18   | 90→180  | 0.2–0.45       | 31–35 |
| R6a    | `move(4,-2).anchor('Lantern Street', {}, [16,14])`                                                        |                                |                            |      |         |                |       |
| T6b    | `move(11,-3,+9)` → (15, −5, +9) ✓                                                                         |                                |                            |      |         |                |       |
| 6B     | `[straight(30,2), arc(-70,170,12), straight(30,2)⇔]`                                                      | WIDE left                      | −70° R 170 (b, 166) ω 12   | 16   | 180→110 | 0.2–0.45       | 32–35 |
| R6b    | `move(4,-2).anchor('Arcade', {}, [16,14])`                                                                |                                |                            |      |         |                |       |
| T6c    | `move(20,-6,-12)` → (24, −8, −12): at 33 t 0.81, 10t² 6.6 → −9.6…−5.6 ✓ (the graceful one)                |                                |                            |      |         |                | 33    |
| DS3    | festival sluice: red box [30, 1, 36] 10 m below 6C's foot under T6c                                       | red                            |                            |      |         |                |       |
| 6C     | `[straight(30,2), arc(70,160,8), straight(50,3)]`                                                         | WIDE right                     | +70° R 160 (b, 156) ω 12.5 | 13   | 110→180 | catch 0.15–0.5 | 31–34 |
| arcade | open timber arcade over 6C's last 50 m: roof underside ≥ ridge + 8, columns ≥ 6 m outside both face edges |                                |                            |      |         |                |       |
| F      | `move(8,-2).finishGate([24,20], 30, 10)` ≈ (−351, 163, 122), heading 180, under the lantern               | inter-map connector style (§6) |                            |      |         |                |       |

### Failure surfaces (shallow canal vs. red)

The course format has kill floors only (README / `course/types.ts`), so every shallow canal is a
**walkable floor** built as `branch` platforms (alt) with a `water` scenery sheet 0.5 m above
them, 2 m below the local bank feet; `killY` sits below the lowest canal (y ≈ 140).

| Zone           | Under                           | Bank route (stairs + towpath + `launch`)                                                               | Cost vs. riding on |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------ |
| Quay canal     | 1A, T1, 1B                      | stairs every ≈ 150 m; launches throw onto the ramp above ≈ 60 m upstream, 1.1–1.4 s                    | ≈ 4–8 s            |
| Dock water     | 2A, T2b, 2B, 2C (DS1 excepted)  | same pattern                                                                                           | ≈ 4–8 s            |
| Ferry basin    | F1–F7, 3B                       | the two dockside paths (above)                                                                         | ≈ 6–9 s            |
| Court plaza    | 4A, 4B (red strip excepted)     | court stairs → launch onto 4B s 10 at ≈ 20 m/s                                                         | ≥ 4 s              |
| Bend canal     | 5A's end, under the balcony, 5B | towpath → launch onto 5B s 20 at ≈ 20 m/s (never onto 5C: a failed Door B must not beat the main line) | ≈ 5–6 s vs. main   |
| Festival canal | 6A–6C (DS3 excepted)            | same pattern as the quay                                                                               | ≈ 4–8 s            |

Red (→ latest gate/anchor): DS1 dock lock, DS2 lock chamber, the fountain's red strip, DS3
festival sluice. Every red box is visibly deeper water behind a hatched red sill; lantern
reflections never fall on it.

## 5. Checkpoints, splits, recovery

| Gate / anchor      | Where (≈)                                              | Clean-run time | Restore state (bay → `to`, arrival, descent check)                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------ | -------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C0 start           | (−520, 400, −520), h 90                                |              0 | start deck, standing                                                                                                                                                                                                          |
| R1a Bridge Pier    | 1A end (−181, 370, −424)                               |             16 | default; onto 1B at 23 m/s; 1B descends 16 m ≥ 7.3 (v_d 28) ✓                                                                                                                                                                 |
| C1 Quay Bridge     | (−80, 349, −133), h 180                                |             27 | onto 2A; 13 m before T2b ✓ (T2b is a plain flat release)                                                                                                                                                                      |
| R2a Beam Bay       | 2A end (−110, 329, 112)                                |             36 | onto 2B (under the beam) at 23; 12 m down, 8 up → lip ≈ 25 m/s → T2c lands ≈ 1.5 m lower on 2C's WIDE catch ✓                                                                                                                 |
| R2b Open Dock      | 2B lip (−160, 321, 381)                                |             45 | onto 2C at 23; 15 m of descent → 32 ✓                                                                                                                                                                                         |
| C2 Dock Gate       | (−312, 303, 598), h 270                                |             56 | onto 3A; default 23 m/s gives 17 m/s at the lip (F1 barely) ✗ → **`flightSec: 1.0`** (≈ 27 m/s) → lip ≈ 22 m/s, inside the stones' 17–31 ✓, below a clean 25 ✓                                                                |
| R3a Ferry Steps    | 3A lip (−504, 302, 646)                                |             64 | default; lands on F1 [10, 20] at 23 m/s (design 24.5) ✓                                                                                                                                                                       |
| R3b Ferry Walk     | 3B lip (−716, 290, 580), between the phrases           |             74 | default; lands on F5 at 23 (phrase 2 accepts 18.5–32) ✓                                                                                                                                                                       |
| C3 Ferry Arch      | (−762, 266, 283), h 355                                |             84 | onto 4A; 5 + 14 m before the crossing ≥ 7.3 ✓                                                                                                                                                                                 |
| R4a Pavilion       | 4A end (−875, 246, 183)                                |             95 | onto 4B at 23; 4B descends 13 → 31 ✓. A failed crossing restores past it: 0.5 s + 1.2 s + fall ≈ 3.2 s vs. 1.2 s clean, 23 vs. 33 m/s — slower ✓                                                                              |
| R4b Colonnade      | 4B end (−1004, 220, 332)                               |            103 | onto 4C; 15 m ✓                                                                                                                                                                                                               |
| C4 Fountain Exit   | (−1270, 200, 363), h 270                               |            112 | onto 5L at 23 → Door A at ≈ 28 (Door A needs no speed) ✓                                                                                                                                                                      |
| R5a Door A         | 5L lip (−1428, 186, 372)                               |            117 | the next landing is **after** Door A (B01 precedent): onto 5A at 23 → lip ≈ 25 m/s: main T5b ✓. Door B needs ≈ 30 (1.15 × (900 − 529)/40 = 10.7 m net descent; 5A has 4) ✗ **by design**: a restore never grants the shortcut |
| R5b Balcony        | 5A lip (−1122, 259, −340)                              |            131 | onto 5B (main) at 23; 14 m down ✓                                                                                                                                                                                             |
| C5 Twin-Door Merge | (−826, 230, −468), h 90 (after both lines merge on 5C) |            144 | onto 6A; 18 m ✓                                                                                                                                                                                                               |
| R6a Lantern Street | 6A end (−636, 205, −296)                               |            154 | onto 6B at 23; 16 m → ≈ 33 at T6c (v_d 30 needs 10.7) ✓                                                                                                                                                                       |
| R6b Arcade         | 6B end (−504, 184, −88)                                |            163 | onto 6C at 23; 13 m to the finish ✓                                                                                                                                                                                           |
| F finish           | (−351, 163, 122), h 180                                |          ≈ 172 | —                                                                                                                                                                                                                             |

Cadence gaps 16–11–9–9–11–8–10–11–10–8–9–5–14–13–10–9–10 s ✓ (Beginner 10–15); R before each
portal (R5a, R5b) and between the ferry phrases (R3b). Gate headings 180 / 270 / 355 / 270 / 90
(README gap 3); anchors at 135 / 205 / 240 / 315 get enlarged AABBs, kept 30 m from other levels.
Only C2 needs a custom `flightSec`; no restore beats a clean arrival at the same point.

## 6. Faster line, failure, critical test

**Faster line** (target **6–7 s**; brief 5–8):

- **Door B** (Act 5): ride 5A's upper band (≤ 0.27), strafe right off the lip into the balcony door,
  land on 5C's lead-in at s 15–25. Skips T5b, 5B and T5c (≈ 280 m, 8.8 s) for 34 m of flight, 12 m
  after the exit and 50 m of lead-in (≈ 3.0 s): **≈ 5.8 s**.
- **Tighter court release** (Act 4): leave 4A 8–12 m before its end (still on the climb, depth
  0.1–0.25), strafe ≈ 10° right over the widest part of the red strip, catch 4B's mid band at s
  15–30. Skips part of the climb (≈ +1 m/s kept) and ≈ 20 m of path: **≈ 0.8–1.2 s**. Too short a
  flight lands on the red strip.
- Door B cannot be expressed with today's pen (`branch` refuses portals): build it as an off-route
  portal element plus a `forks` entry (name "Balcony door", line: lip at depth 0.2 → air point in
  the door → [portal] → exit → 5C s 20 → 5C s 70) — see §8.

**Failure treatment**: shallow canal falls → slow bank routes (§4 table), never faster. Red deep
sluices DS1/DS2/DS3 and the fountain's red strip → latest R. A failed Door B attempt drops into the
bend canal → towpath → launch onto 5B: ≈ 5–6 s slower than the main line. Missing the stones →
ferry basin → dockside path.

**Critical test** (brief): _portal identifiers must be understandable while moving; players never
stop to decode symbols._ The two pairs differ in four channels: frame (round moon gate vs. pointed
ogee door), rim colour (teal `#518C91` vs. paper white `#F4EEDC`), glyph (crescent vs. four-point
diamond, 3 m tall on the crown, both sides of both frames, repeated on the exit banners) and sound
(low two-note chime vs. single high bell); no door uses amber or red. In-map momentum doors are
round/arched with glyph and chime; the inter-map connectors (start deck, finish) are square
festival gates with a race-flag icon and no glyph (brief §13.3). Verify:

1. **Channels survive**: screenshots 2 s before each door, in greyscale and with deuteranopia /
   protanopia / tritanopia filters, still separate the pairs by shape and glyph alone.
2. **Glyph size**: at 2 s × 31 m/s = 62 m a 3 m glyph subtends ≈ 2.8° ≈ 38 px (1280 px, 90° hFOV;
   need ≥ 24 px), checked from `trace.ts` positions.
3. **Sightline ≥ 2 s** (Door B ≥ 3 s ≈ 95 m: the upper-band setup takes 1–1.5 s): the segment from
   sampled trace positions to each door centre hits no box; Door A has ≥ 200 m of straight
   approach, Door B is in view from 5A s ≥ 250; the preview disc (`portal-preview.ts`, 260 m range)
   shows the next receiver's teal ridge.
4. **No hesitation**: 5 first-time Beginners at race speed, no briefing: nobody drops below 85 % of
   approach speed within 3 s of a door, and ≥ 4 of 5 can say after one run which door turned them
   where.
5. **Exit headings** (`trace.ts` from R5a / R5b): Door A 0 ± 2°, Door B 90 ± 10°, landings in band.

Commands: `npx tsx tools/race/check.ts surf-lantern-canal`;
`npx tsx tools/race/time-tracks.ts surf-lantern-canal --human --sections` (every restore finishes
its section; the Door B fork and the salvage forks are driven);
`npx tsx tools/race/trace.ts surf-lantern-canal a<anchor>` (Door B corridor at 28/31/34 m/s,
crossing at 25/33/37); `npx tsx tools/race/sketch.ts surf-lantern-canal --svg <file>`.

## 7. Clean-run estimate

| Act             |           Length (surf + flight) |     Avg speed |                          Estimate | Brief budget |
| --------------- | -------------------------------: | ------------: | --------------------------------: | -----------: |
| 1 Outer quay    |                          ≈ 690 m | 25 (start 12) |                              27 s |           25 |
| 2 Covered docks |                          ≈ 850 m |            29 |                              29 s |           30 |
| 3 Ferry stones  | ≈ 550 m surf + 200 m stones/hops |     28 / 24.5 |                              28 s |           30 |
| 4 Lantern court |                          ≈ 860 m |            31 |                              27 s |           35 |
| 5 Twin doors    |                         ≈ 1010 m |            31 |                              32 s |           35 |
| 6 Festival run  |                          ≈ 890 m |            32 |                              28 s |           25 |
| **Total**       |                        ≈ 5.06 km |               | **≈ 172 s** (faster line ≈ 165 s) |      165–195 |

Why: a practiced Beginner holds 25–28 m/s on the early faces (less on the 2B / 3A climbs), ≈ 31–33
on the long broad descents of Acts 4–6 (under the 34 m/s strafe cap) and ≈ 24–27 on the stones,
from a 12 m/s start. Door A is a teleport that returns 86 m of height, so Acts 5–6 run fast. Act 4
is under budget (the R 60 court circles in 6 s) and Act 6 over: after timing, move ≈ 3 s from 6B/6C
into 4A's lane or 3C. Under 165 s on the human proxy: lengthen the ⇔ legs (1A, 1B, 2A, 3C, 4A, 5L,
5A, 6A, 6B) as lanes with lanterns and houses, never empty travel.

## 8. Open questions / to calibrate

1. **Optional portal off the racing line** (gap): `Pen.branch` throws on `portal` and `forks` lines
   have no teleport node, so Door B can't be built or bot-driven. Proposal: allow `portal` in
   `branch` (marked `alt`) and add `{ at, portal: true }` fork nodes (fly into the opening, resume
   at `exit`). Until then Door B is a hand-added element, untested by the bot.
2. **Paired identifiers are not in the data** (gap): `PortalEl` has no glyph / frame / colour and
   the course palette has one `portal` colour; the critical test needs a per-portal `mark`.
3. **Fixed exit point** (README gap 1): off-centre entries snap up to 8 m sideways _and
   vertically_ (a low entry gains height). Check Door B's snap never lifts a low entry above 5C's
   upper band.
4. **Non-lethal shallow water** (gap): course floors are kill volumes only; the walkable canal
   floors, stairs, towpaths and ≈ 12 launches are branch elements. A `shallow` floor kind would be
   cleaner; confirm `validateCourse` ("route above every floor") and `findOverlaps` accept them.
5. **No hold-to-bhop** (README gap 4): stones sized for manual first-tick hops with a missed-tick
   margin; record miss rates per stone and dockside-path usage.
6. **Anchors before portals restore after them** (bays wait for the next landing, B01 precedent):
   `BayOpts` has no `to` override if the owner wants Door A re-flown after R5a.
7. **Door B arrival** (vy ≈ −18 m/s) lands like a 9 m drop: if humans bounce, move the door 6 m
   closer to the lip or raise the exit. `PortalDef.exit` is body centre, `airPortal`'s exit is
   feet: convert when hand-placing Door B.
8. **Corridors**: the crossing and Door B flights are projectile first guesses; fit them from
   `trace.ts` at 0.8 V, V, 1.2 V before fixing the red strip, balcony slab and door edge, and
   confirm the 256 px preview disc reads inside a round and an ogee frame at 62–95 m.
