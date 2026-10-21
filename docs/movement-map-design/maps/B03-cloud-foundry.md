# B03 — Cloud Foundry (as built)

Beginner surf • MOVEMENT_PROFILE v1 • map id `surf-cloud-foundry` •
source `packages/shared/src/level/maps/surf-cloud-foundry.ts` • brief §9 B03.
Built, tested and timed. The pen sequence in the source is authoritative; the numbers below
are copied from it and from the tools (`tools/race/*`). It started from a blockout spec (this
file's first version); §9 lists what changed from it and why. Conventions and formulas:
[README.md](README.md#conventions-used-in-every-spec).

## 1. Identity

|                   |                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Theme             | an industrial weather station above the clouds: blue-gray steel ramps round a huge stopped turbine, porcelain chambers, a cloud bell                                                                                                                                                                   |
| Movement identity | _Ride down into the pressure, let the scoop lift you, and meet each receiving ramp along its tangent._                                                                                                                                                                                                 |
| Core skills       | vertical scoops (a descent turned into a climb whose lip throws you gently upward); broad aerial catches (align with the receiver in the air); a scoop up through a window                                                                                                                             |
| Palette           | porcelain white #E5E8E6 (turbine drum, walkway, the white lower catch, cloud layer), blue-gray steel #657786 (every surf face, six shades, one per act), muted amber #D5A45A (bhop pads, rotor tips, window rims, the low pipe), sky blue #91BDD2 (anchors, sky), hazard red #E8242C (vents only)      |
| Landmark          | the stationary turbine at the centre of Act 2's quarter circles: porcelain drum (80 m across, y 340–440), a steel shell flaring under it, a hub and five stopped blades (120 m) with amber tips at y 444 — seen from the start deck, circled in Act 2, followed half round in Act 6                    |
| Scenery           | the intake gantry over 1C, a porcelain chamber door round 4A (amber strip), the cloud bell (steel skirt panels round 4C, vapor crown), a condensate pool under the pads, the exhaust collar (solid steel drum, red crown) inside the funnel loop, loose cloud heaps far below everything (y ≈ 200–250) |
| Fog / sky         | fog 200–900 m, pale sky (#5F93B3 → #D9E6EA), high sun; no kill floors (their glow would be the only other red-ish surface): red means the vents only                                                                                                                                                   |

## 2. Route sketch

Top-down, north up, drawn by `npx tsx tools/race/sketch.ts surf-cloud-foundry` (height letters:
`z` ≥ 350 m, `y` 340, `x` 330 …, `u` 300; `1`–`5` gates, `R` anchors, `b` restart bays, `x` also
the red vents, `O`/`o` portal in/out, `S` start, `F` finish). The tool writes an SVG with `--svg`.

```
              ::::::::::zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz::       b        :::::::::
          :zzzzzzzzzzzzzz::: :: ::: :: ::: ::: :: ::: ::: ::::z  z zRz z  z z :zzzzzzzzzzz:
       :zzz::                                                                           :zzz:
     :zz::                                                                                :zz:
    :zz:              O                                                                     :z:
   :zz:                                                                                     :zz
   zz:                                                                                       zz
   z:                :w:                                                                    :z:
   z: b              :w:                                                                   :z:
   3:                :ww                                                                   :z
   :z:                :w                                                                 :2:
   :z:                :x:                                                                zzb
   :z:                 :x:                                                             :z:
   :z:                  :x                      :::zzzzzzz:::b:::::::::::::::::::::::::z::::::::::::::::::
   :z:                  :x                  :zzzzzzz::: :::Rzzzzzzzzzzzzzzzzzzzzzzz:Rzbzzzzzzzzzzzzzzzzzzzzz::
   :z:                  :x               :zzzz::                                     zz:                  :zzzz:
   :z:                 :4:b          :zzz:     :vvvvvv::::::::::vvvvvvv:            zz:                         zz:
   :z:                 :y:          :zz:   :wvvv:::                 ::vvvvv:       :z:                           :z:
   :z:                 :y:         :zz:  wwww::                         ::vvv:    b::R                            zz:
   :z:                 :y:        :z::ww:                                    ::vv:::z:                             z:
   :z:                 :y:        zww:                                          ::vv:                              z:
   :z:                 :y:      bww:                                            :zz:v:                             S
   :z:                 :y:      :w1:                                            :z::vv
   :z:                 :y:     5 ::z:                                        :zz     :w
   :z:                 :y:     xx: :zz:                                    :zz:    :: R b
   :R: :               : :      xx:    zzz:                            :zzz        :: v
   :z: :  x  x x  x    :z:        ::y:        :zzzzz::::::  :::zzzzz:              :: :vvv:
   :z:                 :z:          yy:           ::zzzzzzR  zz::                  ::  ::vvvv::
    zz::             ::zz            :y:                                           ::        ::vvvvvvvvvv:
      :zzzz:::::::zzzz:            x  :y                                           ::          x      x :v:
         :zzzzzzzzz:                 :yy                                           ::                   :vv:
                                 x :yy:                                            ::                 ::vv:
         ::zzzzzzzzzzzzR : :::yyyyy:                                               ::        ::::::::vvvv:
      :zzzz::::::: :: b: yyyyyy::                                                  ::    ::vvvvvvvvvvv:
    :zz:::                                                                         ::  ::uuu:
  zz:                                                                              :::uu:
 :z:                                                                               :: u
 z :                                                                                F
 o :
x -410..460 (→ east), z -492..441 (↓ south), 7.3 m per column (rows thinned for this page)
```

The turbine's axis O is at ≈ (9, 1). Act 1 starts on the east side beside the rotor hub
(443, 470, −61) heading north, bends west and runs along z ≈ −227 to the north-west, where 1C
turns south to C1 (−159, −51). Act 2 goes round the drum (R 170, west → south → east) and up the
east side (heading 15°) to C2 (247, −330), passing 57–62 m under Act 1. Act 3 climbs round to
the west along the north edge (pads at z ≈ −473), 3B turns south at the north-west corner to C3
(−384, −335). Act 4 runs down the west side (4A) into the bell chamber, half round the bell and
back north (4D) to C4 (−236, −186). Act 5's duct runs north to the portal (−244, −419), which
throws you to the south-west corner (−396, 431), 40 m higher; the S-curve brings you to C5
(−179, 28) on the turbine's west side. Act 6 goes half round the turbine clockwise (R 200) to its
east side, then south through the finish funnel to F (205, 415). Line heights 470 → 308 m;
racing line 5879 m.

## 3. Phrase graph

```
S ─drop 6─▶ [1A BROAD right: 30 + −90° R100 + 70 down 8 + 60 up 6 = scoop S1] ─R1 Scoop Lip─
  ─in-line (16,−5), lead 15─▶ [1B WIDE right: 30 + 70 down 8 + 60 up 5 = S2] ─R2 Second Lip─
  ─(18,−5,+6), lead 15─▶ [1C WIDE left: 20 + −90° R150 + 30] under the intake gantry ─▶ C1 Intake Gantry
  ─(12,−3,−2)─▶ [2A BROAD left: 40 + −90° R170 round the drum] ─R3 Skirt Gap─
  ─30 m crossing (26,−9,−4), receiver turned 15° left─▶ [2B WIDE left: −60° R170 + 150 down 14 + 50 up 7]
  ─R4 Turbine Lip─ upward transfer (16,−3,−9), lead 15 ─▶ [2C WIDE right 160] ─▶ C2 Turbine Seal
  ─(14,−4,+9)─▶ [3A STD left: 40 down 4 + −105° R80 climbing 10 + 30 climbing 7] ─low release (22,−6.5,−2)▶
  pads P1 [12×20] · P2 15.2 · P3 15.6 (15° left) · P4 15.9 (back) ─R5 Condenser (mid-hop)─
  P5 16.3 · P6 16.7 (15° right) · P7 17.1 (back) ─last hop (24,−2,+3), lead 15─▶
  [3B BROAD left: 240 down 8 + 60 up 5 + −90° R110 + 30] ─▶ C3 Condenser Door
       └ walkway (salvage): white grating 12 m left of the pads, 2.5 m lower, low pipe (crouch) ▶ launch ▶ 3B
  ─(14,−5,−9)─▶ [4A BROAD right: 120 + 180 down 8 (through the chamber door) + 60 + 60 up 10 = the big scoop]
  ─lip ─▶ W4a (hole 16×10, bottom 3.5 m under the lip) ─R6 Bell Skirt─ (22,−7.9,+3.6), lead 20 ─▶
  [4C WIDE left: 30 + −180° R80 round the bell + 30] ─▶ W4b (hole 16×10) ─(22,−5.5,−3)▶ [4D WIDE right 280]
       └ lower catch (salvage): a weak release falls past 4C's foot onto white 4L ▶ launch 1.8 s ▶ 4C
  ─▶ C4 Bell Exit ─(14,−4,+9)─▶ [5A BROAD left duct: 30 + −15°/+15° R250 wiggle + 30]
  ─portal P5 (30 ahead, 5 lower, 16×16, turn 0, exit 40 m higher)▶ ─R7 Upper Duct─ (13,−4), lead 12 ─▶
  [5B WIDE right: 20 + +90° R100 (bend A) + 60] ─R8 S-Bend─ steering reversal (14,−4,+9) ─▶
  [5C BROAD left: 10 + −110° R90 (bend B) + 40] ─diagonal catch (22,−7,−8), lead 20─▶
  [5D WIDE right: 20 + +20° R200 + 20] ─▶ C5 Exhaust Collar
  ─(12,−4,+2)─▶ [6A BROAD right: 10 + +180° R200 round the shell + 50 up 7] ─R9 Exhaust Lip─
  ─(26,−6.5,+2), lead 15─▶ [6B WIDE right: 20 + −90° R70 + 40 + +180° R70 + 40 + −90° R70 + 20: the loop
  round the exhaust collar] ─(8,+2,+8)▶ F (36×26, covers both lines)
       └ upper deck 6H (faster line): off the lip steer 20 m right onto [6H STD left 325 down 18], straight to F
```

## 4. Numeric parameters

Face shapes: BROAD 16 × 56°, WIDE 18 × 55°, STD 14 × 58°. Racing depth 0.35 (pen default).
Every ramp starts with a 5 m lead-in (12 after the portal, 15–20 on the scoop receivers and the
diagonal catch). Turn rates are at the bot's speed there on the rider radius.

| #   | ramp (pen)                               | shape       | side           | legs (flat m, drop m; − climbs)                                                                           | turn rate |
| --- | ---------------------------------------- | ----------- | -------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 1A  | start `move(12,−6)`                      | BROAD       | right          | 30, 3 · −90° R100, 5 · 70, 8 · 60, −6 (S1)                                                                | 8°/s      |
| 1B  | `move(16,−5)` lead 15                    | WIDE        | right          | 30, 2 · 70, 8 · 60, −5 (S2)                                                                               | —         |
| 1C  | `move(18,−5,6)` lead 15                  | WIDE        | left (banked)  | 20, 1 · −90° R150, 6 · 30, 1                                                                              | 14°/s     |
| 2A  | `move(12,−3,−2)`                         | BROAD       | left (banked)  | 40, 2 · −90° R170, 6                                                                                      | 13°/s     |
| 2B  | `move(26,−9,−4).turn(−15)`               | WIDE        | left (banked)  | −60° R170, 4 · 150, 14 · 50, −7                                                                           | 14°/s     |
| 2C  | `move(16,−3,−9)` lead 15                 | WIDE        | right          | 160, 4                                                                                                    | —         |
| 3A  | `move(14,−4,9)`                          | STD         | left (banked)  | 40, 4 · −105° R80, −10 · 30, −7 (climbs 17)                                                               | 25°/s     |
| 3B  | `move(24,−2,3)` off P7, lead 15          | BROAD       | left (banked)  | 240, 8 · 60, −5 · −90° R110, 6 · 30, 1                                                                    | 18°/s     |
| 4A  | `move(14,−5,−9)`                         | BROAD       | right          | 120, 2 · 180, 8 · 60, 2 · 60, −10 (the big scoop)                                                         | —         |
| 4C  | `move(22,−7.9,3.6)` after W4a, lead 20   | WIDE        | left (banked)  | 30, 1 · −180° R80, 4 · 30, 0.5                                                                            | 28°/s     |
| 4D  | `move(22,−5.5,−3)` after W4b, lead 15    | WIDE        | right          | 280, 4                                                                                                    | —         |
| 5A  | `move(14,−4,9)`                          | BROAD       | left           | 30, 1 · −15° R250, 4 · +15° R250, 4 · 30, 1                                                               | 9°/s      |
| 5B  | portal exit, `move(13,−4)`, lead 12      | WIDE        | right (banked) | 20, 0.5 · +90° R100, 3 · 60, 1                                                                            | 22°/s     |
| 5C  | `move(14,−4,9)`                          | BROAD       | left (banked)  | 10, 0.3 · −110° R90, 3 · 40, 1                                                                            | 24°/s     |
| 5D  | `move(22,−7,−8)` lead 20                 | WIDE        | right (banked) | 20, 0.5 · +20° R200, 1.5 · 20, 0.5                                                                        | 10°/s     |
| 6A  | `move(12,−4,2)`                          | BROAD       | right (banked) | 10, 0.5 · +180° R200, 10 · 50, −7                                                                         | 11°/s     |
| 6B  | `move(26,−6.5,2)` lead 15                | WIDE        | right          | 20, 0.5 · −90° R70 (outside), 2 · 40, 1 · +180° R70 (banked), 4 · 40, 1 · −90° R70 (outside), 2 · 20, 0.5 | 31°/s     |
| 6H  | alt: lip `move(20,−4,20)`, lead 5        | STD         | left           | 325, 18                                                                                                   | —         |
| 4L  | alt: 4A's lip `move(20,−33,−7)`, lead 10 | WIDE, white | left           | 40, 2                                                                                                     | —         |

All turns are far under the Beginner 60°/s comfort limit (6B's banked half circle is the
tightest). **Scoops** (climbing legs; lip grade = last leg's slope): S1 6 m (0.10), S2 5 m
(0.083), 2B 7 m (0.14), 3A 17 m (0.23), 4A 10 m (0.167), 6A 7 m (0.14).

**Bhop pads** (Act 3, manual hops): P1 12 × 20, the others 9 × 12 (amber tops), level, spacing
15.2 / 15.6 / 15.9 / 16.3 / 16.7 / 17.1 m; P3 turned 15° left (4 m offset), P6 15° right; the
condensate pool 18 m under them. The **walkway**: 3 m white grating 12 m left of the pads and
2.5 m lower, from beside P1 to 14 m past P7, a **low pipe** across it between P3 and P4 (solid
amber strip light, 5 × 1 × 1 m, bottom 1.4 m over the grating: standing (1.8 m) you are
blocked, a jump (1.2 m) doesn't clear it, crouched (1.1 m) you walk under it at 3.5 m/s — tested
in `packages/shared/test/surf-cloud-foundry.test.ts`); a launch pad at its end boards 3B 30 m
along (1.4 s).

**Windows**: W4a 10 m after 4A's lip, hole 16 × 10 (wall 40 × 30), bottom 3.5 m below the lip,
2 m right; W4b 12 m after 4C's end, hole 16 × 10 (wall 40 × 28), bottom 4.5 m below, 3 m left.
Rectangles with the standard glowing rim (the bell shape is not painted).

**Portal P5**: opening 16 × 16, 30 m past the duct's end and 5 m lower (you fly into it at
speed), facing north; exit at O + (−405, +40 above the opening, +430) = (−396, 362, 431), turn
0, vertical speed kept: `v_out = v_in`. You come out in the higher chamber heading north, 14 m
before 5B's landing (lead 12).

**Red zones** (hazard red, hatched): three bell-floor vents 24 × 6 × 24 m about 45 m under the
white lower catch, three trough vents 10 × 2 × 34 m 40 m under bend B's inside, and the exhaust
collar's crown 50 × 2 × 50 m (8 m under 6B's wedges). Touch → back to your latest anchor.
Falling below the route (under y 250, the kill height: into the clouds) does the same.

## 5. Checkpoints, anchors and restore states

Restore state as B01: standing in the restart bay (7 × 9 m platform), velocity 0, frozen 0.5 s,
then the bay's launch pad throws you onto `to` in `flightSec` (default 1.2 s ≈ 23 m/s). Bays sit
26 m back, 10 m toward the landing ramp's ridge, 12 m up unless noted.

|     | name           | trigger (bottom centre, heading, size)  | bay (override)                                                             | lands on                        | clean run passes | from the bay to the next gate |
| --- | -------------- | --------------------------------------- | -------------------------------------------------------------------------- | ------------------------------- | ---------------: | ----------------------------: |
| R1  | Scoop Lip      | [205, 447, −227] 270° 16×14             | [215, 461, −217]                                                           | 1B [189, 449, −227]             |           14.9 s |                        16.3 s |
| R2  | Second Lip     | [24, 437, −227] 270° 16×14              | [32, 451, −243]                                                            | 1C [6, 439, −233]               |           20.1 s |                        11.3 s |
| C1  | Intake Gantry  | [−159, 420, −51] 180° 24×18             | [−171, 434, −65] (`side 14, up 8`)                                         | 2A [−157, 426, −39]             |           28.6 s |                        27.6 s |
| R3  | Skirt Gap      | [13, 410, 167] 90° 16×14                | [17, 420, 179]                                                             | 2B [39, 408, 163]               |           37.0 s |                        19.3 s |
| R4  | Turbine Lip    | [209, 390, −152] 15° 16×14              | [188, 406, −148]                                                           | 2C [204, 394, −170]             |           47.0 s |                         7.9 s |
| C2  | Turbine Seal   | [247, 379, −330] 15° 24×18              | [256, 388, −315] (`side 4, up 4, 0.75 s`: ≈ 34 m/s, enough for 3A's climb) | 3A [259, 384, −342]             |           51.6 s |                        29.9 s |
| R5  | Condenser      | [87, 386, −471] 270° 10×12 (mid-hop)    | [95, 395, −481] (`back 16, up 4, 0.75 s`)                                  | P5 [79, 391, −471]              |           61.3 s |                        19.7 s |
| C3  | Condenser Door | [−384, 368, −335] 180° 24×18            | [−365, 384, −347]                                                          | 4A [−375, 372, −321]            |           81.0 s |                        35.4 s |
| R6  | Bell Skirt     | [−377, 363, 112] 180° 16×14 (past W4a)  | [−394, 375, 120] (`back 14, side 14`: inside the bell)                     | 4C [−380, 363, 134]             |           93.9 s |                        23.4 s |
| C4  | Bell Exit      | [−236, 332, −186] 0° 24×18              | [−217, 349, −174]                                                          | 5A [−227, 337, −200]            |          112.7 s |                        26.5 s |
| R7  | Upper Duct     | [−396, 355, 430] 0° 16×14 (at the exit) | [−406, 370, 443]                                                           | 5B [−396, 358, 417]             |          119.3 s |                        21.6 s |
| R8  | S-Bend         | [−236, 346, 301] 90° 16×14              | [−249, 361, 320]                                                           | 5C [−223, 349, 310]             |          125.5 s |                        13.8 s |
| C5  | Exhaust Collar | [−179, 324, 28] 0° 30×18                | [−191, 341, 42] (`side −14`)                                               | 6A [−177, 329, 16]              |          135.9 s |                        40.5 s |
| R9  | Exhaust Lip    | [216, 319, 61] 180° 16×14               | [228, 331, 69] (`back 18, side −14`)                                       | 6B (lower mouth) [214, 319, 87] |          154.0 s |                        21.2 s |
| F   | finish         | [205, 297, 415] 180° 36×26              | landing [205, 298, 449]                                                    |                                 |          171.5 s |                               |

A fall before R7 (in the duct) brings you back to C4. Every bay reaches the next gate on its
own and is never faster than riding on (`surf-maps.test.ts`). Anchor gaps on the clean run:
15, 5, 9, 8, 10, 5, 10, 20, 13, 19, 7, 6, 10, 18, 18 s — four are longer than the Beginner
10–15 s cadence (R5→C3, R6→C4, C5→R9, R9→F).

## 6. Forks (RaceDef.forks)

| name              | kind             | line                                                                                                       | ridden (bot) |              racing line |
| ----------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- | -----------: | -----------------------: |
| Condenser walkway | salvage (slower) | walk the white grating from past the pipe (bots don't crouch; the pipe has its own test), launch onto 3B   |        8.6 s |                    6.7 s |
| Bell lower catch  | salvage (slower) | ride white 4L under 4C's first straight, a launch 1.8 s back up onto 4C's half circle (from its face side) |        5.6 s |                    4.2 s |
| Upper deck        | **faster line**  | from 6A's last 30 m, steer 20 m right off the lip onto 6H, straight 325 m to the finish gate               |       12.3 s | 18.1 s (**5.9 s saved**) |

## 7. Measured timings (`time-tracks.ts`)

|                        | Act 1 | Act 2 | Act 3 | Act 4 | Act 5 | Act 6  | total       |
| ---------------------- | ----- | ----- | ----- | ----- | ----- | ------ | ----------- |
| brief target           | 0:25  | 0:30  | 0:30  | 0:35  | 0:35  | 0:25   | 3:00        |
| steady bot (clean run) | 28.6  | 23.0  | 29.4  | 31.8  | 23.1  | 35.7   | **2:51.50** |
| human 0.6 (`--human`)  | 29.3  | 23.1  | 29.1  | 31.8  | 24.0  | 36.5   | **2:53.82** |
| steady, upper deck     |       |       |       |       |       | ≈ 29.8 | ≈ 2:45.6    |

Both finish with 0 respawns; top speed 44.7 m/s (steady), 45.2 (human). Par 3:00. Budget
(`check.ts`): 2763 boxes, ≈ 116 k triangles (B01: 147 k), 0 overlaps, 0 validation problems.
Of them ≈ 91 k are the surf ramps; the scenery blocks (turbine, bell, collar, gantry, door)
are `lowDetail` (one flat quad per face) and the cloud heaps are cheap cloud puffs.

**Speeds** (steady bot, from the clean run): S1 lip 30.9 m/s (vy +1.4), S2 lip 34.0 (+0.8),
C1 35.9, 2B's bottom ≈ 43, its lip 40.3 (+5.8), C2 39.6, 3A lip ≈ 25 → pads 22–24, C3 34.6,
4A's bottom ≈ 41, W4a ≈ 33, C4 34.0, portal exit ≈ 37 (vy −17), C5 35.8, 6A lip 31.0 (+2.1),
finish 34.1. The human bot is within 1–3 m/s of these everywhere.

**Critical test** (the scoops move you by collision and your own control, no hidden boost):
no boosters on the map; launch pads only in restart bays and the two salvage branches
(`surf-cloud-foundry.test.ts` checks it); the portal keeps speed and heading (turn 0). Lip
speeds follow the energy bound √(v² + 40·Δh) within ≈ 1 m/s. Measured on S1 (steady bot):
34.2 m/s at the bottom (y 448.0), 31.0 at the lip 6.3 m higher, vs 30.3 loss-free — the 0.7 m/s
over the bound is strafing below the 34 m/s cap (player control, not a kick); the lip releases
vy +1.4 … +4 (grade 0.10 × 31 ≈ 3.1). The other scoops were not traced one by one. Seams: every curved ramp ridden at
0.8 / 1.0 / 1.15 V without a catch (`surf-seams.test.ts`).

## 8. Brief requirements

Met: a descending ramp into a gentle vertical scoop and a wide receiver, repeated with the
receiver shifted sideways (6 m), a third broad curve under the intake gantry; two quarter
circles round the outside of the turbine housing with a short airborne crossing that asks for
tangent alignment (receiver turned 15°), the second one descending before a modest upward
transfer; a low surf release onto a chain of broad pads whose spacing changes gradually, two of
them offset, a slower walkway with a low pipe that teaches crouching, normal headroom on the
bhop line; a descent into a large chamber, a vertical scoop, an arc up through a wide opening, a
ramp curving round the chamber's far wall, a second, lower opening, a visible lower catch (white)
for weak departures; a portal from the end of a duct to a higher chamber keeping the direction;
a broad S-curve; a diagonal catch instead of a flat stop; a long evolving ramp round the
turbine's outer shell (broad curve, shallow descent, final upward release) into a generous finish
funnel over the open cloud layer. C1–C5 named as in the brief; recovery before each
scoop-to-window phrase (C3 before 4A→W4a, R6 before W4b) and midway through the pads (R5);
faster line by boarding the funnel high (5.9 s: target 4–7 s); white lower catches safe, red
pressure vents the only hazards.

Approximated:

- no amber landing-band strips on the receivers (curves only paint red strips; the ridge glow
  is the palette's pale `surfEdge`);
- the openings are rectangles with the standard rim, not bell-shaped; the pads are rectangular
  amber caps, not ovals;
- the turbine is a drum, one flared shell tier, a hub and five blades (the triangle budget);
  "dense steam in background vents" is a cloud crown over the bell; no daylight shafts, work
  lights or audio (turbine hum, bell resonance, duct rush, wind) were added;
- the red bell vents sit 45 m under the white lower catch (not beside it, but in the same
  chamber);
- the portal lifts 40 m, not 50 (§9).

Not built: the **inside release** in Act 5 (the brief's second faster-line half, ≈ 0.6 s in the
spec) — see §9.

## 9. Changes from the blockout spec (and why)

1. **Layout.** The spec's route spanned x −900…481: outside the network range (racing line
   |x|, |z| < 490). Re-laid as a spiral with the portal as the break: Act 3 runs west along the
   north edge (instead of north-west), Act 4 down the west side, the portal throws you to the
   south-west corner, and Act 6 goes half round the turbine clockwise from its west side, the
   funnel running south. The S-curve is mirrored (bend A right, bend B left) so it arrives west
   of the turbine heading north. Over-unders: 1A/1B pass 57–62 m over 2C, 2B passes 68–69 m over
   6A, Act 3's 3B passes ≈ 70 m over the duct.
2. **Speeds and length.** The measured bots keep almost all their energy on surf (the spec's
   ≈ 36 m/s ceiling came from a 0.6-efficiency lab chain): with the spec's 239 m of descent they
   hit the 50 m/s cap in Act 2 and ran the route in ≈ 120 s. Drops were cut (the route loses
   162 m) and it was lengthened to 5.9 km (spec 4.74): Act 1 starts with a bend beside the hub,
   the Act 2 quarters are R 170, 3B is 240 m before its bend, 4A/4D are longer, 4C is a half
   circle, 6A is a half circle, the funnel loop is a 70 m stadium. Bots ride ≈ 34–41 m/s.
3. **Act 3.** 3A climbs 17 m (spec 15) so the ≈ 38 m/s arrival reaches the pads at ≈ 25;
   C2's bay launches in 0.75 s (≈ 34 m/s) so a recovery clears that climb.
4. **Portal.** 30 m past the duct and 5 m lower (spec 8 m, level): the bot otherwise braked in
   the air to 12 m/s to hit a close opening. Lift 40 m (spec 50) to keep 6A 60+ m under 2B.
5. **Bell.** The lower catch 4L sits inside and below 4C's first straight (the spec put it under
   4C, where 4C shields every launch back up); its launch reaches 4C from the face side.
6. **Funnel.** The upper deck is 20 m right (its face on its left: you arrive from the face
   side), 325 m long, dropping 18 m; the lower mouth's loop has two 40 m straights so the deck
   saves 4–7 s.
7. **Inside release (not built).** Three chute designs were built and ridden: any chute inside
   and below bend B is reached by sliding off bend B's face and a ≈ 40 m flight, so you land on
   it with 20–30 m/s of vertical speed, which the face takes away (the rider arrives at 20 m/s or
   less); rejoining is the second problem (from an inside chute you would cross onto 5D's ridge
   side; back up onto bend B costs the climb). With Beginner radii (≥ 90 m) the geometry saves
   under a second even when it works (the spec predicted ≈ 0.6 s). The faster-line target is met
   by the upper deck alone. Red vents mark the trough inside bend B.
8. **Falls and render budget.** No kill floors: the kill height (y 250) ends a fall, the cloud
   layer is 130 loose heaps of cheap cloud (y ≈ 200–250). The engine's per-section floors (and
   then one map-wide floor) drew cloud heaps and dark glow patches everywhere and cost ≈ 57 k
   triangles; a fall from the high acts takes up to ≈ 5 s. The turbine, the bell panels, the
   collar, the gantry and the door are `lowDetail` blocks: the map went from ≈ 253 k to ≈ 116 k
   triangles.

## 10. Untested assumptions

- Nobody has played it. The human numbers are a bot with 0.6 strafe efficiency; it is only
  2.3 s slower than the steady bot, so the map's real Beginner time is the biggest unknown.
- Beginners on scoop lips at 30–40 m/s (2B's lip at 40 m/s with vy +5.8) and on the upward
  transfers they throw; bots place themselves perfectly on the receivers (lead-ins 15–20 m).
- The pads assume arrivals near 25 m/s: the bots air-brake onto the next pad, a player who
  arrives faster (a strong 3A lip) will overshoot 15–17 m spacings. Manual bhop timing (no
  hold-to-bhop) is untested.
- The crouch pipe is tested in the simulation (standing blocked, crouched through), not by
  people; whether Beginners read the amber strip light as "crouch".
- Portal readability (a plain amber ring with a live preview; no glyph needed with one portal)
  and the 40 m lift; the fixed exit (≤ 8 m sideways snap in the 16 m opening).
- Four anchor gaps of 18–20 s exceed the Beginner 10–15 s cadence.
- ≈ 116 k triangles (B01 147 k): frame rate on low-end machines not measured.
- Readability checked only in still screenshots (start deck with the turbine and rotor, S1's
  lip, 4A's lip through W4a, the portal from the duct, the funnel from the last lip, the red
  collar crown from the loop; re-taken after the budget cut): ramps read dark against the white
  clouds, W4a and the portal show what follows (W4b not checked), both funnel lines are visible
  from the lip, the red vents read red. The flat-shaded (`lowDetail`) turbine and collar look
  plainer than tiled surfaces.
