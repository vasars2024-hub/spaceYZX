# I02 — Basalt Cathedral (build spec)

Intermediate surf • MOVEMENT_PROFILE v1 • map id `surf-basalt-cathedral` (suggested) • brief §10 I02
Conventions, symbols and formulas: [README.md](README.md#conventions-used-in-every-spec). Every
number is a first blockout value **to calibrate** unless it quotes the movement profile.

## 1. Identity

|                     |                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode / discipline   | Intermediate / surf                                                                                                                                                                                                                                                                                                                                              |
| Movement identity   | _Hold your height band as the cathedral narrows it: round the bell, over the stone ridges, out through the high light._                                                                                                                                                                                                                                          |
| Dominant techniques | 1. height-band management in a 360° descending helix (a red lower edge plus a red-lined overhead cornice in its second half); 2. spine crossings on A-frame ridges (`side: 'both'`, `ride` switch); 3. window transfers, ending at the high, broad rose window (two-contact main line, one-transfer faster line)                                                 |
| Supporting          | an A-frame crossing in Act 1, climbing scoops before windows, 8 short contacts between choir columns, a 3-pad bhop bridge, a 90° portal, a relaxed sweep round the bell                                                                                                                                                                                          |
| Landmark            | **the suspended bronze bell** over the circular nave (O = 0, 0): mouth Ø 30 m, y 118–150, hung from a 6 m chain-and-rod shaft that rises through the helix to the dome (y 500). Framed by W1 (Act 1), circled from above (Act 2), seen back through the great arch (Act 3), in P5's preview (Act 5), swept round at crown height (Act 6), in view at the finish. |
| Palette             | basalt `#292D33` (structure, sky, fog), ash stone `#8E9296` (rough structural stone: walls, piers, ramp backs), old bronze `#A48B60` (the bell, ridge trim lines, window rims, anchors), pale light `#E5E2D5` (light shafts, window glow, polished-band sheen, mist), hazard red `#E8242C` + black hatching (red zones only)                                     |
| Materials           | surf faces: **polished basalt bands** (dark, glossy, long streaks along the ramp direction, a bronze line on every usable ridge); structure: **rough ash stone** (matte, chiselled, never glossy), so the two never read alike; bell and machinery: old bronze (hazard parts hatched red); tracery: ash stone, visual only outside each collision rectangle      |
| Lighting            | pale light falls in long columns from broken vaults and crosses the nave above the route, never through a window target; every window target is lit from behind (pale rectangle / rose); the bell keeps one warm key highlight from the east                                                                                                                     |
| Fog                 | `#292D33`, near 150 m, far 700 m; low pale mist below **y 80 only** (nave floor y 40); every route level and window target is above y 104                                                                                                                                                                                                                        |
| Sound               | long reverberation, sparse bell overtones (a low hum rising with speed near the bell), restrained low choral textures; wind at W1, W5 and P5; chain creak at red machinery; contact sounds never masked                                                                                                                                                          |
| Poetic              | _Circle the silent bell, cross the stone's old ridges, and leave through the highest light._                                                                                                                                                                                                                                                                     |
| Practical           | _Keep every window target and the bell's silhouette visible from its decision point: light the openings, keep mist below the route, and let polished bands, not ornament, draw the line._                                                                                                                                                                        |

Architecture (plan): rotunda nave, inner wall r 100, floor y 40; ambulatory ring to the outer
wall r 170, buttresses to r 200; the long north transept arm (x −60…120, z −100…−1300); the choir
hall north-east (x 330…470, z −1300…−600, rows of columns); the rose apse east (x 300…450,
z −200…+30, rose window in its east wall at x 432). `killY` 60.

## 2. Route sketch

Top-down, north up, x east, north = −z (schematic, not to scale; ≈ ±15 m; pen sequence authoritative):

```
 z \ x -250        -150          -50    0     50          150         250          350          450
 -1290                             ╭═══3E══════════════════C3══4A═══════════════════════════════╮
 -1250                             ║ G3 lower gallery                                           ║ 4A outside +90
 -1150                             ║                                                          R4a
 -1100                              W3b◇ 3D⌒ scoop                                            K1┊K2  8 SHORT faces zig-zag S,
 -1030                              ║                                                         K3┊K4  one column pair per gap,
  -970                             3C⋀ spine 2 (L→R)                                          K5┊K6  red choir floor below
  -920                              ║                                                         K7┊K8
  -870                              ║                                                         P1·P2·P3 bhop bridge
  -813                                 W3a◇ = R3a                                              ╲ 4E angled entry
  -790                                 3B⌒ scoop                                                ║
  -694                                   3A⋀ spine 1 (R→L)                                      ║
  -629                                    ║                                                    C4
  -535                                    C2                                                 ║ 5A rose stair (±35° S)
  -450                                    ║ 2C                                              ║
  -300                                     ║ 2B (G2 lower aisle below)                     ║
  -165                       F◁═══════════╫═══6C═════════╮ north arcade gallery          R5a
  -140                       C5◁P5′        ║             ║                    5B ╭────⊙────╮ loop centre (382,−84)
   -94     S                 ║6A           W2=R2a        ║                       ╰P1═══fast═══▶W5◇▷P5
   -60     ║                 ║              ║        6B══╝R6a                   5C ↺ 5D kicker ▓ red ceiling
     0     ║                 ║ ╭═══H2═══ O ═══╮ helix R70→60 round the shaft, y 401→383
    35     ║                 ╲ ╰ red frame   W6◇           (bell hangs at O, y 118–150)
    75     ║                  ╲═════6A══════╯ ║ 2A x≈70
    90     ║                                  C1
   158     ╲1A                                W1◇
   209       ╚═════════R1a═══1B⋀══════════════╯ (south buttress tower ≈ (21,188))
```

Key points (x, y, z) and headings:

| Point               | ≈ position                  |   h | Point              | ≈ position                          |       h |
| ------------------- | --------------------------- | --: | ------------------ | ----------------------------------- | ------: |
| S start             | (−228, 472, −94)            | 170 | C3 Spine Merge     | (162, 269, −1286)                   |      90 |
| R1a Buttress        | (−66, 437, 209)             | 120 | R4a Choir Stall    | (418, 239, −1150)                   |     180 |
| W1 clerestory       | (65, 416, 158)              |   0 | pads P1 / P3       | (425, 205, −884) / (420, 205, −847) | 180/195 |
| C1 Nave Arch        | (59, 407, 84)               |   0 | C4 Choir Bridge    | (402, 190, −629)                    |     180 |
| helix φ 0 / φ 360   | (70, 401, 0) / (60, 383, 0) |   0 | R5a Rose Stair     | (353, 153, −148)                    |     180 |
| W2 great arch = R2a | (54, 371, −88)              |   0 | P1 (fork, 5B φ 90) | (382, 140, −45)                     |      90 |
| C2 Transept Door    | (27, 333, −535)             |   0 | W5 rose / P5       | (432, 111, −49) / (436, 116, −49)   |      90 |
| W3a = R3a           | (6, 311, −813)              | 350 | P5 exit, C5        | (−71, 175, −148), (−71, 174, −138)  |     180 |
| W3b                 | (−25, 290, −1093)           |   0 | W6 / R6a           | (66, 140, 41) / (133, 126, −64)     |  60 / 0 |
|                     |                             |     | F finish           | (−73, 104, −162)                    |     270 |

Side elevation (racing-line height vs route distance; the portal lifts the route ≈ 60 m):

```
 y 472 S╲1A 437 ╲1B⋀ W1 C1 407 ╲2A 401 ⟳H2 383 ╲W2 371 ╲2B 2C C2 333
   311          ╲3A⋀ 3B⌒ W3a  3C⋀ 3D⌒ W3b 290 ╲3E C3 269 ╲4A R4a 239
   206          ╲K1‥K8 P1-P3 205 ╲4E C4 190 ╲5A R5a 153 ╲5B P1 140 ══fast══╮
   111          main: 5B↺ 5C↺ 5D╱ ─────────────────────────────────────── W5 111–125 ▷ P5
   175  P5′ C5 ╲6A 152 (bell sweep, crown height) W6 140 ╲6B R6a 126 ╲6C ══ F 104
 distance ≈ 0 · R1a 380 · C1 670 · C2 1750 · C3 2690 · C4 3610 · R5a 4110 · P1 4250 · P5 4650 · F 5400 m
```

## 3. Phrase tables

Speeds are practiced-human (0.6 strafe) estimates; the steady bot runs higher.

### Act 1 — Outer buttress (target 25 s)

| Beat | Time | Geometry                                                         | Player action                     | Required result                         |
| ---- | ---: | ---------------------------------------------------------------- | --------------------------------- | --------------------------------------- |
| 1    |  3 s | start deck on the south-west buttress crown, 8 m drop            | sprint, drop onto 1A              | board 1A at depth 0.2–0.5, ≥ 18 m/s     |
| 2    |  9 s | 1A: long straight, banked left arc R 230 along the buttress line | hold the middle band, build speed | leave 1A at 30–33 m/s, depth ≤ 0.4      |
| 3    |  4 s | T1 onto the freestanding A-frame 1B (near = right face)          | opposing transfer                 | catch 0.2–0.4                           |
| 4    |  3 s | 1B crest leg                                                     | climb to ≤ 0.12, cross the crest  | land on the far (left) face at 0.15–0.3 |
| 5    |  4 s | 1B left face banked −120° round the south buttress tower         | hold 0.25–0.45                    | heading 0 at 31–34 m/s                  |
| 6    |  3 s | T2 through clerestory W1, 1C, C1                                 | release mid-band, fly W1          | cross C1 at 30–33 m/s                   |

### Act 2 — Bell descent (target 30 s)

| Beat | Time | Geometry                                                               | Player action                            | Required result                     |
| ---- | ---: | ---------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------- |
| 1    |  3 s | T2a, approach heading N, the shaft and bell below-left                 | settle                                   | 31–33 m/s at φ 0, depth 0.2–0.4     |
| 2    |  6 s | helix half 1: −180° R 70, no red, no overhead                          | set the line (depth 0.25–0.45)           | ≥ 35 m/s at φ 180                   |
| 3    |  6 s | half 2: spiral R 70→60, red strip ≥ 0.7, red cornice over depth < 0.12 | hold the narrowed band while it tightens | 37–40 m/s at φ 360, depth 0.15–0.65 |
| 4    |  3 s | 80 m exit straight under the helix start                               | line up the great arch                   | release at depth ≤ 0.6              |
| 5    |  1 s | T2b through W2 (the nave's north arch, = R2a)                          | flat release                             | catch 2B 0.2–0.6 (short: G2)        |
| 6    | 12 s | 2B gentle S, T2c, 2C long straight                                     | settle, read the spines ahead            | cross C2 at 31–35 m/s               |

### Act 3 — Transept spines (target 30 s)

| Beat | Time | Geometry                                       | Player action                           | Required result              |
| ---- | ---: | ---------------------------------------------- | --------------------------------------- | ---------------------------- |
| 1    |  3 s | T3 onto A-frame 3A right face, bending right   | catch, settle                           | depth 0.2–0.4                |
| 2    |  3 s | 3A crest leg; beyond it the frame bends left   | climb to ≤ 0.12, cross the crest        | left face at 0.15–0.3        |
| 3    |  4 s | T3a onto scoop 3B (−7 m, +6 m)                 | ride down and up, release on the climb  | 27–32 m/s, vy ≈ +4           |
| 4    |  1 s | W3a (tracery window, = R3a)                    | thread the window, air-strafe right     | catch 3C 0.2–0.5             |
| 5    |  9 s | the mirror: 3C crest (L→R), T3c, 3D scoop, W3b | same sequence, offset to the other side | catch 3E 0.2–0.65 (weak: G3) |
| 6    | 12 s | 3E banked right +90° R 130                     | rebuild                                 | cross C3 at 31–34 m/s        |

### Act 4 — Choir crossing (target 30 s)

| Beat | Time | Geometry                                                                        | Player action                                | Required result                            |
| ---- | ---: | ------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------ |
| 1    | 10 s | T4, 4A: 150 m descent and an outside +90° R 90 into the choir                   | settle, build speed                          | 32–37 m/s at R4a                           |
| 2    |  9 s | K1–K8: SHORT faces alternately right/left, 16 m each, gaps between column pairs | leave each from ≤ 0.35, align before contact | stay above the red strips (0.8) through K8 |
| 3    |  2 s | K8 climbs 3 m, surf-to-bhop onto P1                                             | land facing P2, first-tick hops              | reach P3 at 26–29 m/s                      |
| 4    |  3 s | P3 turned +15°, hop onto 4E's marked upper band                                 | angled bhop-to-surf                          | catch 4E at 0.15–0.35                      |
| 5    |  7 s | 4E banked −15°, long straight                                                   | settle                                       | cross C4 at 30–33 m/s                      |

### Act 5 — Rose window (target 30 s)

| Beat | Time | Geometry                                                               | Player action                                       | Required result                       |
| ---- | ---: | ---------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------- |
| 1    | 15 s | T5, 5A rose stair: 240 m descent + ±35° S, R5a                         | build speed; fast-line riders hold ≤ 0.2            | ≥ 34 m/s boarding 5B                  |
| 2    |  4 s | 5B approach + φ 0–90: W5 appears dead ahead at φ 60–90, high and broad | **decide**: early release (fast) or follow the loop | fast: depth ≤ 0.12 by φ 80, 34–42 m/s |
| 3    |  8 s | main: 5B φ 90–270, T5b, 5C U-turn (contacts 1 and 2 of the loop)       | follow the loop down under P1                       | 37–41 m/s                             |
| 4    |  2 s | T5c onto kicker 5D under the red tracery ceiling                       | stay below the ceiling, release on the lip          | vy ≈ +6.5, 26–34 m/s                  |
| 5    |  1 s | flight through W5 (north half) and P5                                  | fly the rose                                        | pass W5 and P5                        |

### Act 6 — Bell return (target 25 s)

| Beat | Time | Geometry                                                               | Player action                          | Required result         |
| ---- | ---: | ---------------------------------------------------------------------- | -------------------------------------- | ----------------------- |
| 1    |  1 s | P5 exit (turned +90°), C5 in the exit flight                           | let the portal turn you                | catch 6A                |
| 2    |  4 s | 6A: 130 m descending straight through the north-west arcade            | settle (fast arrivals absorb the drop) | 0.2–0.45 at 36–40 m/s   |
| 3    |  5 s | 6A arc −120° R 75 round the bell at crown height, red bell frame below | sweep, stay off the foot               | heading 60 at 38–41 m/s |
| 4    |  1 s | T6 through the generous low window W6 (choir screen)                   | flat release                           | catch 6B 0.2–0.5        |
| 5    |  3 s | 6B outside −60° R 60, R6a                                              | hold into the face                     | heading 0               |
| 6    |  9 s | T6c, 6C banked −90° R 70, 140 m final gallery along the north arcade   | coast, the bell on your left           | finish at speed         |

## 4. Element geometry

Face shapes (README): **MID** 12 × 60° (slant 13.9 m, run 6.9), **TIGHT** 11 × 63° (slant 12.3 m
= 15 W, run 5.6), **SHORT** 9 × 65° (slant 9.9 m = 12 W, run 4.2), **STD** 14 × 58°, **WIDE** 18 × 55°.
"b" = banked, "o" = outside; ω = turn rate at the top of the speed band on the rider radius (all
≤ 66°/s; bot limits C(v) ≤ 13 m inside / ≤ 24 m outside are never approached). ⇔ = stretch leg.
Surf `color` = polished basalt; ridge trim = bronze.

### Act 1

Pen start: `new Pen([-228, 472, -94], 170)`, `start([14,16])`, `platform([10,12],'strafe')`.

| ID      | Pen                                                                                                                                                                 | Face / side                                    | Turn, R, ω                                       | Drop | Heading | Band                                  | Speed |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ | ---- | ------- | ------------------------------------- | ----- |
| 1A      | `move(12,-8)` `[straight(110,7)⇔, arc(-50,230,16), straight(30,2)]`                                                                                                 | MID left                                       | −50° R 230 (b, rider 228) ω 8                    | 25   | 170→120 | 0.2–0.5                               | 18→33 |
| R1a     | `move(4,-2).anchor('Buttress', {}, [14,12])` (heading 120: see §8)                                                                                                  |                                                |                                                  |      |         |                                       |       |
| T1      | `move(15,-5,-9)`: at 31 t 0.56, 10t² 3.2 → window [−6.2, −2.2] ✓                                                                                                    |                                                |                                                  |      |         |                                       | 31    |
| 1B      | A-frame: `[straight(20,3,{ride:'right'}), straight(15,1,{depth:0.12}), straight(15,1,{ride:'left',depth:0.25}), arc(-120,50,7,{depth:0.35}), straight(20,1)]`       | MID both                                       | −120° R 50 (b on the left face, rider 47.6) ω 41 | 13   | 120→0   | right 0.2–0.4 → ≤ 0.12 → left 0.2–0.5 | 29–34 |
| tower   | round buttress tower r 9, y 250→470, at the arc centre ≈ (21, 188), inside the turn                                                                                 | ash stone, solid                               |                                                  |      |         |                                       |       |
| T2 + W1 | `window(10,[18,10],[34,28],-3,-4)` `move(8,-3,-6)`: T(18, −6, −10) at 32: t 0.64, 10t² 4.1 → [−7.1, −3.1] ✓; feet at W1 ≈ −1.2 (sill 1.8 m below, lintel 7 m above) | clerestory in the outer wall r 170, bronze rim |                                                  |      |         |                                       |       |
| 1C      | `[straight(60,4)]`                                                                                                                                                  | MID right                                      | —                                                | 4    | 0       | 0.2–0.45                              | 31–33 |
| C1      | `move(6,-2).gate([22,16],'Nave Arch')` at the nave wall ≈ (59, 407, 84), heading 0                                                                                  |                                                |                                                  |      |         |                                       |       |

### Act 2 — bell descent

| ID         | Pen                                                                                                                                                                                                                                                                                                       | Face / side                                                 | Turn, R, ω                                                                                   | Drop | Heading             | Band                                                  | Speed |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---- | ------------------- | ----------------------------------------------------- | ----- |
| T2a        | `move(14,-5,9)`                                                                                                                                                                                                                                                                                           |                                                             |                                                                                              |      |                     |                                                       |       |
| 2A+H2      | ONE curve (no seam at φ 0): `[straight(70,4), arc(-180,70,9), arc(-180,70,9,{toRadius:60, red:0.7, depth:0.4}), straight(80,3,{red:false})⇔]`                                                                                                                                                             | TIGHT left                                                  | half 1 −180° R 70 (b, rider 68) ω 31 at 37; half 2 spiral 70→60 (rider 67.8→57.8) ω 41 at 41 | 25   | 0 → CCW round O → 0 | approach 0.2–0.5; half 1 0.1–0.8; half 2 **0.12–0.7** | 31→41 |
| cornice    | half 2 overhead limit: 24 `red` strips [9.5, 1, 2.5] (one per 7.5°), underside at that segment's starting ridge height + 0.3 m, from 0.5 m behind the ridge to 2 m over the face, on the underside of a solid ash-stone overhang (scenery, the triforium floor); first two strips flared to +1.5 / +0.9 m | red hatched                                                 |                                                                                              |      |                     |                                                       |       |
| hoist grid | red grid ring r 20–64 at y 355 (15 m under the helix foot, under the exit straight's line by ≥ 15 m) = bell hoist machinery                                                                                                                                                                               | red                                                         |                                                                                              |      |                     |                                                       |       |
| T2b + W2   | `window(14,[20,14],[44,36],-5,-4)`, `move(0,7).anchor('Great Arch', {}, [18,12])`, `move(22,-13,-6)` → T(36, −11, −10) at 39: t 0.96, 10t² 9.2 → [−12.2, −8.2] ✓                                                                                                                                          | W2 = R2a: the nave's north arch ≈ (54, 371, −88), heading 0 |                                                                                              |      |                     |                                                       | 34–40 |
| 2B         | `[straight(60,4), arc(-25,160,5), arc(25,160,5), straight(60,3)⇔]`                                                                                                                                                                                                                                        | MID right                                                   | −25° (o) / +25° (b) R 160, ω 13                                                              | 17   | 0→335→0             | 0.2–0.45                                              | 33–37 |
| G2         | `branch`: `move(4,-14,8)` then MID right `[straight(60,3), arc(-40,120,5), arc(40,120,5), straight(80,3), straight(40,-6)]`, `alt`; its climbing end throws T(16, −1, +9) onto 2C's lower band (0.45–0.7) at s 60–100 (≈ +2.5 s)                                                                          | salvage                                                     |                                                                                              |      |                     |                                                       | 26–31 |
| T2c        | `move(14,-5,9)`                                                                                                                                                                                                                                                                                           |                                                             |                                                                                              |      |                     |                                                       |       |
| 2C         | `[straight(150,8)⇔]`                                                                                                                                                                                                                                                                                      | MID left                                                    | —                                                                                            | 8    | 0                   | 0.2–0.45                                              | 32–35 |
| C2         | `move(6,-2).gate([22,16],'Transept Door')` ≈ (27, 333, −535), heading 0; covers the main and G2 lines                                                                                                                                                                                                     |                                                             |                                                                                              |      |                     |                                                       |       |

**Height band.** Half 1 has no red and no overhead: the rider chooses a line. In half 2 the red
strip (TIGHT, depth ≥ 0.7) and the red cornice (a head reaches it at contact depth ≤ 0.12:
head ≈ contact + 1.6 m, 11 m of height per unit depth) leave **0.12–0.7 = 7.1 m of slant (≈ 9 W)**
while the radius tightens 70 → 60 and speed rises to ≈ 40. The cornice is red rather than solid so
there is no hard stop at its leading edge and no head-bump lips between segments; the flare
previews it from φ 150.

**Stacking (README gap 7).** TIGHT h 11, d 0.35–0.4 → needs max(11, 0.65·11 + 1.8 + 3) = 12 m. The
helix returns 10 m inside its start, so only the exit straight passes under half 1 (φ 20–45):
ridge-to-ridge gap **17.5 m** at ≈ (57, −41) ✓; the half-1 wedge bottom stays 6.5 m above the exit
ridge, 8.7 m above a rider's head. The approach lies behind φ 0 and the half-2 ridge (r 61) stays
20 m inside it. The cornice tops sit ≥ 3 m under the half-1 wedge bottoms near φ 330–360.

### Act 3 — transept spines

| ID        | Pen                                                                                                                                                                                                                                                           | Face / side                           | Turn, R, ω                                 | Drop                | Heading   | Band                                    | Speed    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------ | ------------------- | --------- | --------------------------------------- | -------- |
| T3        | `move(14,-5,-9)` (from 2C's left face)                                                                                                                                                                                                                        |                                       |                                            |                     |           |                                         |          |
| 3A        | A-frame: `[arc(20,120,3,{ride:'right'}), straight(18,1,{depth:0.12}), straight(12,0.5,{ride:'left',depth:0.25}), arc(-30,110,4,{depth:0.35}), straight(20,1)]`                                                                                                | MID both                              | +20° R 120 (b) then −30° R 110 (b), ω ≤ 17 | 9.5                 | 0→20→350  | right 0.2–0.4 → ≤ 0.12 → left 0.15–0.45 | 26–31    |
| T3a       | `move(15,-5,-9)`: at 30 t 0.58, 10t² 3.4 ✓                                                                                                                                                                                                                    |                                       |                                            |                     |           |                                         |          |
| 3B        | scoop `[straight(50,7), straight(45,-6)]`, depth 0.3                                                                                                                                                                                                          | MID right                             | —                                          | 7 down, 6 up (13 %) | 350       | 0.2–0.4                                 | 29→33→29 |
| T3b + W3a | `window(12,[9,7],[30,24],-2.2,4)`, `move(0,3.5).anchor('Tracery', {}, [9,7])`, `move(16,-6.7,6)` → T(28, −5.4, +10): upward release vy0 ≈ 0.13 v ≈ 4, at 31 t 0.97 → u = 3.9 − 9.4 = −5.5 ✓                                                                   | W3a = R3a, tracery window, bronze rim |                                            |                     |           |                                         | 27–32    |
| 3C        | A-frame: `[arc(-20,120,3,{ride:'left'}), straight(18,1,{depth:0.12}), straight(12,0.5,{ride:'right',depth:0.25}), arc(30,110,4,{depth:0.35}), straight(20,1)]`                                                                                                | MID both                              | mirror of 3A                               | 9.5                 | 350→330→0 | left → ≤ 0.12 → right                   | 26–31    |
| T3c       | `move(15,-5,9)`                                                                                                                                                                                                                                               |                                       |                                            |                     |           |                                         |          |
| 3D        | scoop `[straight(50,7), straight(45,-6)]`, depth 0.3                                                                                                                                                                                                          | MID left                              | —                                          | 7 down, 6 up        | 0         | 0.2–0.4                                 | 29→33→29 |
| T3d + W3b | `window(12,[9,7],[30,24],-2.2,-4)`, `move(16,-3.2,-6)` (the sideways offset is mirrored)                                                                                                                                                                      | tracery window                        |                                            |                     |           |                                         | 27–32    |
| 3E        | `[straight(50,3), arc(90,130,10), straight(60,3)⇔]`                                                                                                                                                                                                           | STD right                             | +90° R 130 (b, rider 127) ω 15             | 16                  | 0→90      | catch 0.2–0.65; run 0.2–0.45            | 28→34    |
| G3        | `branch`: `move(0,-14,8)` WIDE right `[straight(90,3), arc(90,150,11), straight(30,2), straight(40,-6)]`, `alt`: catches W3b flights that fall short, swings wider round the bend (≈ +60 m, +2 s) and throws T(16, −1, −9) onto 3E's last straight lower band | salvage                               |                                            |                     |           |                                         | 25–30    |
| C3        | `move(6,-2).gate([22,16],'Spine Merge')` ≈ (162, 269, −1286), heading 90; after G3 has merged                                                                                                                                                                 |                                       |                                            |                     |           |                                         |          |

**Spine crest.** The A-frame crest is the shared top edge of the two 60° faces (curve pieces share
exact corners: identical along the whole frame). No crest cap, bevel, finial or trim collides
within 4 m of the ridge (bronze crest lanterns are `noCollide` scenery ≥ 4 m above it). The crossing
leg is straight (no curvature lift), prepared by an 18 m leg at depth 0.12; crossing takes 3–6 m/s of
lateral speed and pops ≤ 0.5 m, landing at 0.15–0.3 on the far face. Each frame bends first toward
its near face, then (after the crest) toward its far face, so the crossing is the steering reversal.

**Tracery windows W3a/W3b** (hole [9, 7] = 11 W × 3.9 H, bottom 2.2 m below the release point).
Feet at the window (12.6 m) for a depth-0.3 release: 25 m/s −0.9, 31 m/s 0.0, 37 m/s +0.5; release
band 0.2–0.45 adds +1.2 / −1.8 → feet −2.7…+1.7, head ≤ +3.5, hole −2.2…+4.8. Only slow _and_ deep
(< 26 m/s from > 0.42) clips the sill. Below each tracery screen: red crypt grille 20 m down.

### Act 4 — choir crossing

| ID          | Pen                                                                                                                                                                                                                                 | Face / side                                                | Turn, R, ω                           | Drop                    | Heading     | Band                                        | Speed |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------ | ----------------------- | ----------- | ------------------------------------------- | ----- |
| T4          | `move(14,-5,9)` (from 3E's right face)                                                                                                                                                                                              |                                                            |                                      |                         |             |                                             |       |
| 4A          | `[straight(150,11)⇔, arc(90,90,10), straight(30,2)]`                                                                                                                                                                                | MID left                                                   | +90° R 90 (o, rider 92.4) ω 24 at 38 | 23                      | 90→180      | 0.2–0.45                                    | 30→37 |
| R4a         | `move(4,-2).anchor('Choir Stall', {flightSec:0.95}, [14,12])` ≈ (418, 239, −1150), heading 180                                                                                                                                      |                                                            |                                      |                         |             |                                             |       |
| K1–K8       | `move(14,-4,-9)`, then 8 curves alternating right/left (K1 right), each `[straight(16,1)]` (K8 `[straight(8,0.5), straight(16,-3)]`), `depth: 0.25`, `red: 0.8`; between them `move(14,-3.5,±8)` (+ leaving a right face, − a left) | SHORT                                                      | straight                             | 1 per face, 3.5 per gap | 180         | catch 0.15–0.4, release ≤ 0.35              | 29–34 |
| columns     | 7 column pairs (r 2, ash stone, solid, not red), one each side of every gap, 7 m off the flight's midpoint                                                                                                                          |                                                            |                                      |                         |             |                                             |       |
| choir floor | red [50, 1, 130] at y 205 under K1–K4; red [50, 1, 150] at y 188 under K5–P3                                                                                                                                                        | red                                                        |                                      |                         |             |                                             |       |
| P1–P3       | `move(18,-1,-6)` (K8's climbing lip, vy0 ≈ +5: at 29 t 0.66 → u −1.0 ✓), `bhopPads([{d:0},{d:18.6},{d:19.0,turn:15}], [6,9.5])`                                                                                                     | pads 6 across × 9.5 deep (7.5 W × 12 W), flat, bronze tops |                                      | 0                       | 180/180/195 |                                             | 26→28 |
| hop → 4E    | `move(25,-2,-4)`: t_air(−2) 0.91 × 27.6 = 25 m                                                                                                                                                                                      |                                                            |                                      |                         |             |                                             |       |
| 4E          | `[straight(40,3), arc(-15,150,2), straight(110,6)⇔]`                                                                                                                                                                                | MID left                                                   | −15° R 150 (b)                       | 11                      | 195→180     | catch 0.15–0.35 (bronze band), run 0.2–0.45 | 27→33 |
| C4          | `move(6,-2).gate([22,16],'Choir Bridge')` ≈ (402, 190, −629), heading 180                                                                                                                                                           |                                                            |                                      |                         |             |                                             |       |

Short faces: contact 16 m ≈ 0.5 s at 32 m/s (≥ 8 m / 0.25 s ✓). Gap check T(14, −3.5, ±8), 16.1 m:
at 25 → window [−7.1, −3.1], at 31 → [−5.7, −1.7], at 35 → [−5.1, −1.1] ✓. A late or low departure
lands ≈ 0.07–0.1 deeper on the next face: four in a row from 0.4 reach the red strip — the phrase
asks for eight departures from the upper band. Pads: design speed 27 m/s (human, after the surf
landing), +0.55 per hop, flat t_air 0.69 → 18.6, 19.0 m; depth rule 0.4·19 + 2 = 9.6 → 9.5 m,
1.5 m over README's Intermediate 7–8 m because this bridge is taken faster than I01's (22 m/s).
The pads accept 21–33 m/s (±4.75 m); manual hops only (README gap 4).

### Act 5 — rose window

| ID          | Pen                                                                                                                                                                                  | Face / side                              | Turn, R, ω                                | Drop              | Heading         | Band                             | Speed                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------- | ----------------- | --------------- | -------------------------------- | ------------------------- |
| T5          | `move(14,-5,-9)` (from 4E's left face)                                                                                                                                               |                                          |                                           |                   |                 |                                  |                           |
| 5A          | `[straight(240,16)⇔, arc(35,160,6), arc(-35,160,6), straight(40,2)]`                                                                                                                 | STD right                                | ±35° R 160 (b / o), ω ≤ 14                | 30                | 180→215→180     | 0.2–0.45 (fast: ≤ 0.2)           | 31→38                     |
| R5a         | `move(4,-2).anchor('Rose Stair', {flightSec:0.9}, [14,12])` ≈ (353, 153, −148), heading 180                                                                                          |                                          |                                           |                   |                 |                                  |                           |
| T5a         | `move(14,-5,9)`                                                                                                                                                                      |                                          |                                           |                   |                 |                                  |                           |
| 5B          | `[straight(50,6), arc(-90,40,5), arc(-180,40,8), straight(10,0.5)]` (loop centre ≈ (382, −84); P1 = φ 90)                                                                            | MID left                                 | −270° R 40 (b, rider 37.6) ω 61 at 40     | 19.5              | 180→90 (P1)→270 | 0.2–0.45; fast ≤ 0.12 at φ 60–90 | 34→40                     |
| T5b         | `move(16,-4,3)` off 5B's end: at 38 t 0.43, 10t² 1.8 → [−4.8, −0.8] ✓                                                                                                                |                                          |                                           |                   |                 |                                  |                           |
| 5C          | `[arc(-180,38,8), straight(10,0.5)]`                                                                                                                                                 | MID left                                 | −180° R 38 (b, rider 35.6) **ω 66** at 41 | 8.5               | 270→90          | 0.2–0.45                         | 37–41                     |
| T5c         | `move(16,-4,0)` off the end                                                                                                                                                          |                                          |                                           |                   |                 |                                  |                           |
| 5D          | kicker `[straight(8,0.5), straight(20,-4.5)]`                                                                                                                                        | MID right                                | —                                         | climbs 4.5 (22 %) | 90              | 0.25–0.45                        | 38→33 (R5a restart 30→26) |
| red ceiling | `red` [16, 1, 30] over 5D (x 348–378), underside ≈ y 125.5 (≥ 4 m over a rider's head), top ≥ 5 m under 5B's φ 70–110 wedge; stops 2 m before 5D's lip                               | red: the rose's lower tracery            |                                           |                   |                 |                                  |                           |
| T5d + W5    | `window(22,[18,14],[44,40],-5,4)`: hole y ≈ 111–125, z −58…−40 (visual rose Ø 24 m; the rectangle's diagonal 22.8 m fits inside it; the circle's corners are solid tracery, not red) | high, broad (22 W × 7.8 H)               |                                           |                   |                 |                                  |                           |
| P5          | `move(0,5).airPortal(4, [-71,175,-148], 90, [20,20])`: faces 90, opening centred on the rose (y 106–126)                                                                             | bronze frame, preview of 6A and the bell | turn **+90°**                             |                   | 90→180          |                                  | kept                      |

Loop stacking: the loop closes under its own start — 5C's end and 5D pass under 5B's φ 70–110
with ridge gaps of 22.4 m (5B–5C) and 19.2 m (5B–5D); MID d 0.35 needs 12.6 ✓. Portal rule P5:
`v_out = rotY(+90°)·v_in`, |v| and vertical speed kept; approach headings fast 88–95°, main
92–100° (±15° ✓). Exit point fixed (gap 1): both lines pass within 6 m of the 20 × 20 opening's
centre. The exit is ≈ 60 m above the entry (gap 8: portals may lift the route).

**Exit-decision geometry.** The loop turns you to face east at φ 60–90, where W5 is dead ahead,
50 m away and ≈ 22 m below: a pale rose over the dark apse. The fast line climbs to depth ≤ 0.12 by φ
80 and at φ 85–95 simply goes straight: the banked face curves away left, so the line leaves over
the outer (south) ridge, air-strafes 4 m left and flies T(50, −21, −4) through W5's south half. The
main line follows the loop (5B, 5C) down under P1 and kicks up off 5D through W5's north half.
Feet at W5 — fast (P1 y 140, vy0 ≈ −0.08 v): 34 m/s 114.4, 38 m/s 118.7, 42 m/s 121.8 (head 123.6);
main (5D lip y 116, vy0 = 0.225 v, 22 m): 26 m/s 113.8, 30 m/s 115.6, 34 m/s 116.8, ±1.2 for the
contact band. Fit W5 from `trace.ts` samples before fixing it (brief §3.4).

### Act 6 — bell return

| ID         | Pen                                                                                                                                                                               | Face / side                                                              | Turn, R, ω                                    | Drop | Heading | Band                                                                              | Speed |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------- | ---- | ------- | --------------------------------------------------------------------------------- | ----- |
| C5         | `move(10,-1).gate([24,20],'Rose Gallery')` ≈ (−71, 174, −138), heading 180: in the exit flight, where both lines are already merged                                               |                                                                          |                                               |      |         |                                                                                   |       |
| 6A         | `move(8,-3).curve({lead:30, ...})` `[straight(130,10)⇔, arc(-120,75,14), straight(20,1)]` (ridge starts 12 m behind the exit, under it)                                           | WIDE left                                                                | −120° R 75 round O (b, rider 70.6) ω 33 at 41 | 25   | 180→60  | fast catch 0.1–0.35 within 8 m of the exit; main 0.2–0.4 at 15–25 m; run 0.2–0.45 | 36–41 |
| bell frame | 8 radial `red` beams [3, 3, 36] of the bell cradle, r 20 → 56 at y ≈ 114 (≥ 10 m under 6A's foot, which falls 140 → 126), + the red bell wheel (r 14) on the headstock, y 150–178 | red bell machinery                                                       |                                               |      |         |                                                                                   |       |
| T6 + W6    | `window(12,[16,9],[30,22],-4,-3)` `move(14,-3,-5)`: T(26, −7, −8) at 38: t 0.72, 10t² 5.1 → [−8.1, −4.1] ✓                                                                        | W6: generous low window in the choir screen ≈ (66, 140, 41) (20 W × 5 H) |                                               |      |         |                                                                                   |       |
| 6B         | `[straight(30,2), arc(-60,60,6), straight(20,1)]`                                                                                                                                 | STD right                                                                | −60° R 60 (o, rider 63) ω 35                  | 9    | 60→0    | 0.2–0.45                                                                          | 35–38 |
| R6a        | `move(4,-2).anchor('East Arcade', {}, [14,12])` ≈ (133, 126, −64), heading 0                                                                                                      |                                                                          |                                               |      |         |                                                                                   |       |
| T6c        | `move(15,-5,9)`                                                                                                                                                                   |                                                                          |                                               |      |         |                                                                                   |       |
| 6C         | `[straight(20,1), arc(-90,70,9), straight(140,7)⇔]`                                                                                                                               | STD left                                                                 | −90° R 70 (b, rider 67) ω 32                  | 17   | 0→270   | 0.2–0.45                                                                          | 33–37 |
| F          | `move(8,-2).finishGate([24,20], 30, 10)` ≈ (−73, 104, −162), heading 270, bell visible through the arcade                                                                         |                                                                          |                                               |      |         |                                                                                   |       |

The fast line leaves P5 falling ≈ 29 m/s, lands on 6A 5–8 m after the exit with ≈ 25 m/s down
the face (WIDE, slant 22 m = 27 W, absorbs it); the main line exits almost level and lands 15–25 m
on. First demand after the exit: 6A's arc, ≈ 3.5 s later (≥ 1 s ✓).

## 5. Checkpoints, splits, recovery

| Gate / anchor    | Where (≈)                           | Clean-run time | Restore state (bay → `to`) and re-entry check                                                                                                |
| ---------------- | ----------------------------------- | -------------: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| C0 start         | (−228, 472, −94), h 170             |              0 | start deck, standing                                                                                                                         |
| R1a Buttress     | end of 1A (−66, 437, 209)           |             16 | default bay → 1B's landing, 23 m/s; 1B descends 13 m before T2 ≥ 12.4 (v_d 31) ✓                                                             |
| C1 Nave Arch     | (59, 407, 84), h 0                  |             26 | default → 2A approach; approach + half 1 = 13 m before the band test ≥ 7.3 (v_d 28) ✓; W2 reached at ≈ 35 (lands ≈ 1 m lower on 2B) ✓        |
| R2a Great Arch   | ring in W2 (54, 377, −88), h 0      |             43 | default → 2B's landing; 17 m of descent before T2c ✓                                                                                         |
| C2 Transept Door | (27, 333, −535), h 0                |             57 | default → 3A (R before ridge sequence 1); 3A's 9.5 m ≥ 9.0 (v_d 29) for T3a; 3B releases ≈ 29 → W3a ✓                                        |
| R3a Tracery      | ring in W3a (6, 314, −813), h 350   |             68 | default → 3C (R before ridge sequence 2); same numbers as C2 ✓                                                                               |
| C3 Spine Merge   | (162, 269, −1286), h 90             |             89 | default → 4A; 23 m of descent before K1 ✓                                                                                                    |
| R4a Choir Stall  | 4A end (418, 239, −1150), h 180     |            100 | **`flightSec: 0.95`** → K1's landing at ≈ 28.5 m/s (clean ≈ 32): the short faces need their speed on arrival, there is no ramp to rebuild it |
| C4 Choir Bridge  | (402, 190, −629), h 180             |            120 | default → 5A; 5A + T5 + 5B to P1 = 46 m of descent ≥ 18 (v_d 34): **both rose lines from C4's restart** ✓                                    |
| R5a Rose Stair   | 5A end (353, 153, −148), h 180      |            135 | **`flightSec: 0.9`** → 5B's landing at ≈ 30 m/s (clean ≈ 36–38) → P1 at ≈ 36 after 11.6 m (≥ 7.4 m for 30 → 34) ✓ fast and main              |
| C5 Rose Gallery  | exit flight (−71, 174, −138), h 180 |            150 | default → 6A; 24 m of descent before W6 ≥ 10.7 (v_d 30) ✓                                                                                    |
| R6a East Arcade  | 6B end (133, 126, −64), h 0         |            164 | default → 6C; 17 m to the finish ✓                                                                                                           |
| F finish         | (−73, 104, −162), h 270             |          ≈ 173 | —                                                                                                                                            |

Anchor cadence: 16–10–17–14–10–22–11–20–15–15–14–10 s, every stretch ≤ 25 s ✓. R anchors precede
both ridge sequences (C2 for the first, R3a for the second) and the high-window setup (R5a).
Custom launches R4a and R5a follow brief §7.3: never faster than a clean arrival at the same point.
Timing splits = C1..C5, all on merged stretches (G2 before C2, G3 before C3, fast/main merged by
P5's fixed exit before C5). Gate headings are cardinal (AABB triggers, README gap 3).

## 6. Faster line, failure, critical test

**Faster line — "Rose chord"** (`forks`; brief: one-contact rose-window route, target 6–10 s): the
only contact between the setup curve and the window is 5B's first quarter; the main line uses two
more (5B's loop, 5C) plus the kicker 5D. Skipped: 5B φ 90–270 (136 m), T5b, 5C (134 m), T5c, 5D (33
m) and the 26 m final flight ≈ 361 m at ≈ 35 m/s = 10.3 s, replaced by a 54 m flight (1.4 s):
**saving ≈ 8.5–9 s** (holding ≤ 0.2 through 5A costs a few tenths). Needs 34–42 m/s at P1, contact
≤ 0.12 by φ 80, release at φ 85–95.

**Failure treatment**: weak transfers into the transept (W2 → 2B) and into the spine merge (W3b →
3E) fall onto the lower galleries G2 / G3 (slower, a long extra bend, rejoin before C2 / C3). Red
bell machinery resets: the hoist grid under the helix, the helix cornice and red strip, the bell
frame and wheel in Act 6. Missed outer windows reset: under W1, W3a, W3b and W5 there is only the
mist (killY 60) or a red crypt grille. A fast attempt below 34 m/s hits the rose wall below W5; one
that tries to drop onto 5D meets the red tracery ceiling (brief §4.5 red ceiling) → R5a. The
choir's red floor catches missed short faces and pads → R4a.

**Critical test** (brief): _the high window must be reachable from the checkpoint's entry setup
without requiring momentum carried from an earlier act._ Verify:

1. From C4's restart (23 m/s onto 5A) `time-tracks --sections` finishes the C4 → C5 section on the
   main line, and a fast-line run from the same restart passes W5 (P1 ≈ 40 m/s after 46 m of drop).
2. From R5a (`flightSec 0.9`, ≈ 30 m/s): both lines pass W5 (P1 ≈ 36). Minimum-speed check: re-run
   R5a with the default 1.2 s (23 m/s) — the main line must still pass W5 (5D lip ≈ 30 m/s); the
   fast line is expected to fall short (P1 ≈ 30.5), which shows the 0.9 s launch, not carried
   momentum, is what supplies it.
3. `trace.ts surf-basalt-cathedral a5` (R5a) with P1 releases at depth 0.1 / 0.2 / 0.3 and 34 / 38 /
   42 m/s: only ≤ 0.15 passes W5; main kicker releases at 26 / 30 / 34 m/s all pass W5's north half.
   Size W5 as the union of both envelopes + 1 m (brief §3.4).
4. No path reaches W5 from 5B φ 180–270 or 5C except through 5D; no fast attempt can land on 5D
   (red ceiling); W5's wall is ≥ 2 m thick with no ledge; P5 is only reachable through W5.
5. Manual reset at R5a is never faster than continuing (30 m/s at 5B's landing vs 36–38 clean).

Verification commands (README):

- `npx tsx tools/race/check.ts surf-basalt-cathedral` — clipping, validation, render budget
- `npx tsx tools/race/time-tracks.ts surf-basalt-cathedral --human --sections` — per-act splits,
  every restart bay finishes its section
- `npx tsx tools/race/trace.ts surf-basalt-cathedral 4` and `... a5` — Act 5 envelopes; `... 1`
  (helix band from C1), `... 2` / `... a3` (W3a / W3b windows)
- `npx tsx tools/race/sketch.ts surf-basalt-cathedral --svg I02.svg` — re-derive §2's coordinates

## 7. Clean-run estimate

| Act               | Length (surf + flight) |          Avg speed |                        Estimate | Brief budget |
| ----------------- | ---------------------: | -----------------: | ------------------------------: | -----------: |
| 1 Outer buttress  |                ≈ 670 m | 26 (start from 12) |                          25.7 s |           25 |
| 2 Bell descent    |               ≈ 1080 m |                 34 |                          31.5 s |           30 |
| 3 Transept spines |                ≈ 990 m |  31 (29 on scoops) |                          32.0 s |           30 |
| 4 Choir crossing  |                ≈ 920 m |    30 (26 on pads) |                          30.8 s |           35 |
| 5 Rose window     |               ≈ 1000 m |                 34 |            29.5 s (fast ≈ 20.5) |           35 |
| 6 Bell return     |                ≈ 790 m |                 34 |                          23.5 s |           25 |
| **Total**         |               ≈ 5.4 km |                    | **≈ 173 s** (fast line ≈ 164 s) |      165–195 |

Why: practiced Intermediate humans hold ≈ 29–32 m/s on sustained surf and ≈ 0.8 of that on the
scoops, short faces and pads; the helix (25 m of drop), the rose stair and loop, and the portal-lifted
Act 6 descend continuously, so they run 34–41. If the `--human` proxy holds only ≈ 31 there, the
total rises to ≈ 180 s (still in band). If it lands under 168 s, lengthen the ⇔ legs (1A, the helix
exit straight, 2B, 2C, 3E, 4A, 4E, 5A, 6A, 6C), never empty flights.

## 8. Open questions / to calibrate

1. **Rose window collision is rectangular** (README gap 5): hole [18, 14] inside a Ø 24 m visual
   rose; the circle's corners are solid tracery. If players read the circle, approximate it with
   red-free solid blocks (not red: missing W5 already resets through the wall).
2. **Helix stacking**: 17.5 m measured vs 12 m required, but `findOverlaps` checks only h (gap 7) —
   verify the exit straight under half 1 by hand; keep the cornice's solid overhang thin near φ 360.
3. **A-frame crest behaviour at speed** (1B, 3A, 3C): confirm crossings at 26–34 m/s cost < 5 %
   speed, pop ≤ 0.5 m and land at 0.15–0.3 in both directions.
4. **Portal fixed exit + kept vertical speed** (gap 1): the fast line exits falling ≈ 29 m/s. If it
   slides off 6A's foot, lower the fast flight (P1 lower / flatter release) or raise the exit 4 m
   and lengthen 6A's lead — do not add a contact to the fast line.
5. **Red cornice vs solid overhead** in the helix: red was chosen (no hard stop, no lips). Check with
   humans that a head-height red limit at depth 0.12 reads fairly at 40 m/s; if not, raise it to
   ridge + 0.6 (band 0.09–0.7).
6. **Turn-rate comfort**: tightest main-line pieces are 5C (66°/s) and 5B (61°/s) at 40–41 m/s;
   C(v) is not measured above 35 m/s ("—" in the profile) — measure inside curves at 40 m/s.
7. **Bhop pads [6, 9.5]** exceed README's Intermediate depth range at this bridge's 27 m/s; no
   hold-to-bhop (gap 4) — record miss rates per pad.
8. **R1a heading 120** is 30° off cardinal: its AABB grows to ≈ 17 × 12 × 17 m; nothing else is
   within 40 m, so acceptable for an anchor (gap 3). If `check.ts` objects, end 1A at 90 and give
   1B −90°.
9. **Custom launches** R4a (0.95 s) and R5a (0.9 s): confirm arrival speeds and that each stays
   below the clean arrival. **Short contacts** K1–K8 (0.5 s): check rollback does not change them.
10. **Salvage galleries G2 / G3**: branch offsets are projectile guesses; fit from 0.8 V traces.
11. **Footprint** ≈ 0.7 × 1.5 km with a long transept arm; check the render budget and that fog
    (far 700 m) hides the far arms without hiding the bell.
