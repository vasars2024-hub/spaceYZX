# I01 — Neon Spillway (build spec)

Intermediate surf • MOVEMENT_PROFILE v1 • map id `surf-neon-spillway` (suggested) • brief §10 I01 + §12
Conventions, symbols and formulas: [README.md](README.md#conventions-used-in-every-spec). Every
number is a first blockout value **to calibrate** unless it quotes the movement profile.

## 1. Identity

|                     |                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode / discipline   | Intermediate / surf                                                                                                                                                                                                                                                                                                           |
| Movement identity   | _Keep your speed through direction change after direction change, then choose how early to leave the pump spiral._                                                                                                                                                                                                            |
| Dominant techniques | 1. linked S-curves of different radii (steering reversals on opposing banked faces); 2. helix line + early high release (§12); 3. window transfer into a short heading-correcting contact                                                                                                                                     |
| Supporting          | bhop pairs between floodgate teeth, a low-to-high elevated catch, one 90° portal, a final rising transfer                                                                                                                                                                                                                     |
| Landmark            | **the pump column**: a 28 m wide dark-steel cylinder in the pump hall (O = 0, 0), y 80→230, cyan light rings every 12 m and a cyan crown on top. Seen through overhead slots and channel ends in Acts 1–3, circled in Act 4, crossed beside in Act 6.                                                                         |
| Palette             | near-black blue `#121D2B` (structure, sky), electric cyan `#53D8E2` (ramp ridges/edges, pump rings, anchors), muted violet `#7563A8` (distant signage, portal P5 frame), wet concrete `#68717B` (surf faces), hazard red `#E8242C` + black hatching (red zones only), sodium lamp `#F2A65A` (maintenance lamps, pump housing) |
| Materials           | surf faces: sealed wet concrete liner, a continuous cyan ridge strip, long reflections along the ramp direction; structure: dark concrete, steel grates, floodgate teeth in painted steel (dark grey + white stencils, never red); pump: dark steel + cyan light bands; glass: none                                           |
| Lighting            | cool cyan edge light on every usable ridge; warm sodium lamps on piers and the pump housing; city neon only above, through dark-framed overhead slots; precision windows (W5, E1) get dark frames + a pale inner rim                                                                                                          |
| Fog                 | `#121D2B`, near 120 m, far 600 m in channels; in the pump hall low spray mist **below y 150 only** (never across E1/E2 or the helix)                                                                                                                                                                                          |
| Sound               | overhead rain in Acts 1–3, enclosed pump bass rising toward Act 4, water roar near the spiral, a pressure hiss at P5                                                                                                                                                                                                          |
| Poetic              | _Let the storm disappear into the machinery, then reveal a single clear way through it._                                                                                                                                                                                                                                      |
| Practical           | _Keep every exit window's silhouette visible from its decision point; shape light and occlusion around those sightlines, and keep neon out of the corridor._                                                                                                                                                                  |

## 2. Route sketch

Top-down, north up (schematic, not to scale; coordinates ≈ ±15 m, pen sequence authoritative):

```
 z                x: -500        -300        -100    0     +100        +250
-800   S(-420,360)═1A═╗(pier)
                  R1a ╚══1B══[W1]══1D══╗
-720                                   1E══C1(-60,290,-700)
                           ╔═══2A══════╝   2A→2B = S1 (generous)
-600          ╔═2D═2C═2B═══╝ ⇠ inside-S1 fork (2A mid-arc → 2B upper band)
              ║ R2a            2C→2D = S2 (tight, early reversal)
-450      2E ═╣ (2E-low salvage below)
            C2═2F
-330         ╚3A (climbing U-turn)═> P1 P2 ‖ P3 P4 ‖ P5 P6 ═3C═[L3]═3D═══╗
               red basin under pads, teeth ‖ between pairs            C3 (-190,215,-150)
-150   Act 5 (y 150→95, runs NW under Acts 2–3)             4A approach slot ══╗
          P5◎(270°, turn +90)                                                  ║
-100     5F══5E══5D◇[W5]══5B══5A═C4                    R4m╗  E2 ┌─── pump hall r 70 ──┐
   0                                        R4 ══(merge)═╝  E1 ─┤  helix H4 (CW) ⊙ O   │
 +40                                                             │ ══ 6C ══ T6 ══ 6B ═══╪══ 6A
                                                 F(-80,236,40)◁══┘ R4a on helix φ≈120 │
+150                                                                          P5'exit(250,270,150) C5
```

Side elevation (ridge height vs. route distance):

```
 y 360 S╮
   330   ╲_1A_
   300        ╲1B_W1_1D_1E  C1
   270                    ╲_2A_2B_  (S1)
   250                            ╲2C_2D╱2E  C2          P5' 270 ──╮C5
   235                                   ╲2F╮3A╱‾P1..P6╲3C_3D  C3     ╲6A_6B╱‾╲T6
   217                                                 ╲4A╮helix        6C  F 236
   195                                                     ╲___E1(high, fork)
   166                                                        ╲E2─R4m╱╲R4  C4 150
   120                                                                ╲5A╲5B╱W5 5D╲5E
    95                                                                              ╲5F P5
       0 m      800        1700            2450         3300           4200       5000
```

## 3. Phrase tables

Speeds are practiced-human (0.6 strafe) estimates; the steady bot runs higher.

### Act 1 — Street intake (target 26 s)

| Beat | Time | Geometry                                                  | Player action                           | Required result                         |
| ---- | ---: | --------------------------------------------------------- | --------------------------------------- | --------------------------------------- |
| 1    |  3 s | start deck, 8 m drop lip                                  | sprint, drop onto 1A                    | board 1A at depth 0.2–0.5, ≥ 20 m/s     |
| 2    |  8 s | 1A right face bending left round the pier (outside curve) | hold into the face, build speed         | leave 1A at 28–32 m/s, depth ≤ 0.4      |
| 3    |  5 s | T1 onto 1B (outside curve right)                          | opposing transfer, align before contact | catch 1B upper band                     |
| 4    |  4 s | T2 through broad window W1 onto 1D                        | release mid-band, fly the opening       | pass W1 without touching the frame      |
| 5    |  6 s | 1D banked right, 1E opposing bend to heading 180          | settle to depth 0.3                     | cross C1 at 30–33 m/s at depth 0.25–0.4 |

### Act 2 — Double switch (target 30 s)

| Beat | Time | Geometry                                                         | Player action                        | Required result                            |
| ---- | ---: | ---------------------------------------------------------------- | ------------------------------------ | ------------------------------------------ |
| 1    |  7 s | S1 bend A: banked right arc R 100, long 45 m transition          | turn right, keep above the red strip | ≥ 30 m/s at the transition                 |
| 2    |  6 s | T onto S1 bend B (banked left) — or the inside fork from mid-arc | reverse steering in the air          | catch B above depth 0.4                    |
| 3    |  7 s | S2: bends C and D, R 50, 18 m transition                         | earlier, sharper reversal            | stay above red (0.78) through both         |
| 4    |  5 s | 2D climbs 3 m, elevated catch 2E                                 | release on the climb                 | catch 2E upper band (slow: 2E-low salvage) |
| 5    |  5 s | 2F broad left face                                               | settle                               | cross C2 at 30–34 m/s                      |

### Act 3 — Flood teeth (target 28 s)

| Beat | Time | Geometry                                       | Player action                          | Required result            |
| ---- | ---: | ---------------------------------------------- | -------------------------------------- | -------------------------- |
| 1    |  7 s | 3A climbing banked U-turn (−160°, climbs 12 m) | trade speed for height                 | leave the lip at 20–26 m/s |
| 2    |  5 s | 6 bhop pads as 3 angled pairs between teeth    | first-tick hops, steer at pads 3 and 5 | reach P6 at 23–27 m/s      |
| 3    |  5 s | hop onto 3C, head-height opening L3            | board mid band, pass under L3          | depth ≥ 0.4 at L3          |
| 4    | 11 s | T onto 3D broad descending face (−21 m)        | rebuild speed                          | cross C3 at 30–33 m/s      |

### Act 4 — Pump spiral (target 29 s; §12 beats)

| Beat | Time | Geometry                                                       | Player action                                                                       | Required result                       |
| ---- | ---: | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------- |
| 1    |  5 s | 4A approach: narrow walled slot, column visible ahead          | settle onto the approach face                                                       | stable contact at 30–34 m/s           |
| 2    |  7 s | helix H4 φ 0–150°, R 52, descending                            | follow the curve, hold the upper band                                               | 34–38 m/s, depth ≤ 0.35 at φ 150      |
| 3    |  5 s | φ 150–235: E1 (high, narrow) and E2 (low, wide) both visible   | **decide**: climb to the ridge and release over it at φ 215–235 (fork), or continue | commit to a visible corridor          |
| 4    |  4 s | main: φ 235–300, tangent exit through E2 onto R4m              | leave the helix end, align in the air                                               | catch R4m without touching E2's frame |
| 5    |  6 s | R4m sweep (−45°), opposing transfer onto R4, R4's gentle curve | preserve speed through the merge                                                    | on R4 after the merge, depth 0.2–0.45 |
| 6    |  2 s | R4 exit straight                                               | cross C4 while moving                                                               | comparable split, heading ≈ 15°       |

### Act 5 — Broken bypass (target 30 s)

| Beat | Time | Geometry                                                            | Player action                            | Required result                 |
| ---- | ---: | ------------------------------------------------------------------- | ---------------------------------------- | ------------------------------- |
| 1    |  8 s | 5A banked left descent                                              | rebuild to 34+                           | pass R5a at ≥ 33 m/s            |
| 2    |  4 s | 5B vertical scoop (−12 m, +6 m)                                     | ride down and up, release on the climb   | vy ≈ +4 at release              |
| 3    |  2 s | diagonal window W5 (red top/sides) → 5D short contact (0.35–0.45 s) | thread W5, touch 5D, let it turn you 25° | leave 5D heading ≈ 318°         |
| 4    |  7 s | long opposing catch 5E, banked right to heading ≈ 0°                | catch, settle                            | 32–36 m/s                       |
| 5    |  9 s | 5F banked left to 270°, portal P5 (turn +90°)                       | fly the portal centre                    | exit heading 0° with speed kept |

### Act 6 — Emergency outfall (target 26 s)

| Beat | Time | Geometry                                                         | Player action              | Required result                                            |
| ---- | ---: | ---------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| 1    |  3 s | P5 exit → 6A settle stretch, C5                                  | settle                     | cross C5 at 32–38 m/s                                      |
| 2    |  9 s | 6A banked left sweep, T onto 6B                                  | two faster sweeping curves | 34–40 m/s                                                  |
| 3    |  5 s | 6B climbs 10 m at 17 %                                           | spend speed for height     | release at 29–33 m/s, vy +5                                |
| 4    |  5 s | T6: 36 m rising transfer across the pump hall, beside the column | fly, air-strafe to align   | catch 6C (forgiving WIDE face) — high catch = shorter line |
| 5    |  4 s | 6C to the west rim, finish gate                                  | coast                      | finish at speed, view back into the spiral                 |

## 4. Element geometry

Face shapes (README): **MID** 12 × 60° (slant 13.9 m, run 6.9), **STD** 14 × 58°, **BROAD**
16 × 56°, **WIDE** 18 × 55°, **SHORT** 9 × 65°, **HELIX** 8.5 × 62° (slant 9.6 m = 12 W, run
4.5 m: the brief's 8–12 W precision face). "b" = banked, "o" = outside. ω = turn rate at the top
of the speed band on the rider radius. ⇔ = a stretch leg to lengthen if the clean run is short.

### Act 1

Pen start: `new Pen([-420, 360, -800], 90)`, `start([14, 16])`, `platform([10, 12], 'strafe')`.

| ID      | Pen                                                                                                                                           | Face / side        | Turn, R, ω                      | Drop | Heading | Band     | Speed |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------- | ---- | ------- | -------- | ----- |
| 1A      | `move(12,-8)` `[straight(140,12)⇔, arc(-50,75,8), straight(40,3)]`                                                                            | MID right          | −50° R 75 (o, rider 77) ω 24°/s | 23   | 90→40   | 0.2–0.5  | 20→31 |
| pier    | round block r 7, h 150, 22 m inside the arc midpoint (left of the ridge)                                                                      | solid, sodium lamp |                                 |      |         |          |       |
| R1a     | `move(4,-2).anchor('Pier', {}, [14,12])`                                                                                                      |                    |                                 |      |         |          |       |
| T1      | `move(15,-5,+9)`                                                                                                                              |                    |                                 |      |         |          | 30    |
| 1B      | `[arc(45,90,6), straight(30,2)]`                                                                                                              | MID left           | +45° R 90 (o) ω 20              | 8    | 40→85   | 0.15–0.4 | 29–32 |
| T2 + W1 | `move(16,-5,-9)`; window across the flight 8 m after release, hole **[16, 9]** (20 W × 5 H), wall [26, 22], hole bottom 5 m below the release | broad, cyan rim    |                                 |      |         |          |       |
| 1D      | `[arc(135,85,12), straight(120,5)⇔]`                                                                                                          | MID right          | +135° R 85 (b, rider 83) ω 23   | 17   | 85→220  | 0.2–0.45 | 30–34 |
| T3      | `move(14,-5,+9)`                                                                                                                              |                    |                                 |      |         |          |       |
| 1E      | `[arc(-40,120,6), straight(60,3)]`                                                                                                            | MID left           | −40° R 120 (b)                  | 9    | 220→180 | 0.2–0.4  | 31–34 |
| C1      | `move(6,-2).gate([22,16],'Intake Seal')` at ≈ (−60, 290, −700), heading 180                                                                   |                    |                                 |      |         |          |       |

Ballistic check T1/T2 at 30 m/s: t ≈ 0.6 s, 10t² = 3.6 → u −5 is a flat release (README window
−6.6 … −2.6) ✓. Red zones in Act 1: none (the channel floor 25 m below is an autoFloor).

### Act 2

| ID     | Pen                                                                                                                                                         | Face / side                | Turn, R, ω                       | Drop                 | Heading | Band     | Speed |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------- | -------------------- | ------- | -------- | ----- |
| 2A     | `move(14,-5)` `[straight(25,2), arc(90,100,9), straight(45,3)]`, `red: 0.78`                                                                                | MID right                  | +90° R 100 (b, rider 98) ω 21    | 14                   | 180→270 | 0.2–0.6  | 31–35 |
| T2a    | `move(15,-5,+9)` from the end of the 45 m transition                                                                                                        |                            |                                  |                      |         |          |       |
| 2B     | `[straight(15,1), arc(-60,100,7), straight(25,2)]`, `red: 0.78`                                                                                             | MID left                   | −60° R 100 (b)                   | 10                   | 270→210 | 0.2–0.6  | 32–36 |
| R2a    | `move(4,-2).anchor('Switch', {}, [14,12])`                                                                                                                  |                            |                                  |                      |         |          |       |
| T2b    | `move(14,-5,-9)`                                                                                                                                            |                            |                                  |                      |         |          |       |
| 2C     | `[arc(55,50,6), straight(18,1)]`, `red: 0.78`                                                                                                               | MID right                  | +55° R 50 (b, rider 48) **ω 43** | 7                    | 210→265 | 0.2–0.55 | 33–36 |
| T2c    | `move(13,-4,+8)` (short: the early reversal)                                                                                                                |                            |                                  |                      |         |          |       |
| 2D     | `[arc(-55,50,6,{red:0.78}), straight(20,1), straight(30,-3)]`                                                                                               | MID left                   | −55° R 50 (b) ω 43               | 4 (climbs 3 at 10 %) | 265→210 | 0.2–0.5  | 33–35 |
| T2d    | `move(16,-2,-9)` elevated catch: at 33 m/s t 0.56, vy0 ≈ +3.3 → lands −1.3 ✓                                                                                |                            |                                  |                      |         |          |       |
| 2E     | `[straight(60,3), arc(30,150,4), straight(40,2)]`, no red                                                                                                   | STD right                  | +30° R 150 (o)                   | 9                    | 210→240 | 0.1–0.4  | 31–34 |
| 2E-low | branch, `alt`: WIDE right, ridge 10 m below 2E's, 6 m further out, `[straight(90,3), arc(30,160,3), straight(40,-5)]`, climbs to throw onto 2F's lower band | salvage                    |                                  |                      |         |          | 24–28 |
| T2e    | `move(14,-5,+9)`                                                                                                                                            |                            |                                  |                      |         |          |       |
| 2F     | `[arc(30,160,4), straight(140,5)⇔]`                                                                                                                         | STD left                   | +30° R 160 (o)                   | 9                    | 240→270 | 0.2–0.45 | 31–34 |
| C2     | `move(6,-2).gate([24,18],'Switch Merge')` ≈ (−560, 245, −420), heading 270                                                                                  | covers main + 2E-low exits |                                  |                      |         |          |       |

**Inside-S1 fork** (`forks`, name "inside S1"): release from 2A at arc 50–60° (heading ≈ 235)
at depth ≤ 0.6 (flies over the red band — the strip only counts on contact), fly ≈ 40 m across
the inside of bend A past a 3 m divider pier (solid, not red), catch 2B's upper band at s 10–25 m
(depth 0.15–0.35). Skips ≈ 90 m of arc + transition. Target saving **1.5–2.5 s**. The
catch zone must be reachable only by a prepared line: an early release from depth > 0.6 falls
short onto 2B's red band.

### Act 3

| ID    | Pen                                                                                                                                     | Face / side                                  | Turn, R, ω                    | Drop      | Heading | Band     | Speed |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------- | --------- | ------- | -------- | ----- |
| 3A    | `move(14,-5)` `[straight(20,1), arc(-160,65,-12), straight(20,-2)]`                                                                     | STD left                                     | −160° R 65 (b, rider 62) ω 30 | climbs 13 | 270→110 | 0.2–0.5  | 33→22 |
| P1–P6 | `move(14,-3)` then `bhopPads([...], [6,8])`: P1 d 0; P2 d 15.5; P3 d 16.0 turn −25; P4 d 16.4; P5 d 16.8 turn +30; P6 d 17.2            | pads [6 across, 8 deep] (7.5 W × 10 W), flat | pairs head 110 / 85 / 115     |           |         |          | 22→26 |
| teeth | 6 floodgate teeth [3, 14, 5] at ±7.5 m either side of each pair's gap (P2→P3, P4→P5)                                                    | solid steel, not red                         |                               |           |         |          |       |
| basin | red block [70, 1, 130] 10 m below the pads (floodwater sluice), R3a restart                                                             | red                                          |                               |           |         |          |       |
| R3a   | anchor before P1, on 3A's lip: `anchor('Teeth', { back: 20 }, [14, 12])`                                                                |                                              |                               |           |         |          |       |
| T3b   | from P6: hop `move(16,-1.5,-6)` onto 3C (bhop-to-surf)                                                                                  |                                              |                               |           |         |          |       |
| 3C    | `[straight(50,3), arc(20,120,2), straight(30,2)]`                                                                                       | MID right                                    | +20° R 120 (b)                | 7         | 115→135 | 0.4–0.7  | 25–28 |
| L3    | window across 3C at s 45 m, heading 135: hole **[9, 6]** covering face depth 0.4–0.85; hole top 3.6 m (2 H) above the face at depth 0.4 | solid lintel (bump, not red)                 |                               |           |         |          |       |
| T3c   | `move(15,-6,-9)`                                                                                                                        |                                              |                               |           |         |          |       |
| 3D    | `[straight(120,10)⇔, arc(-45,100,8), straight(60,5)]`                                                                                   | STD left                                     | −45° R 100 (b)                | 23        | 135→90  | 0.2–0.45 | 26→33 |
| C3    | `move(6,-2).gate([22,16],'Flood Door')` ≈ (−190, 215, −150), heading 90                                                                 |                                              |                               |           |         |          |       |

Pad spacing: design speed 22 m/s, +0.6 m/s per hop (human), t_air 0.69 s (flat). Pad depth 8 ≥
0.4 × 17 + 2 − 0.8 — marginal on the last pair: **grow P5/P6 to [6, 9]** if the bot trace shows
long landings. A missed first tick (−10 %) still lands (0.9 v × 0.69 = 14 m vs pad back edge at
d − 4). 3A's 13 m climb: 33 → ≈ 24 m/s; a weak 28 m/s entry arrives ≈ 17 m/s — the pads accept
15.4–28.6 m/s, so weak entries still hop, visibly slower.

### Act 4 — pump spiral (§12)

Hall: cylinder r 70 round O (0, 0), wall y 80→280, red spray pool y 80 (kill), column r 14 (solid;
red-hatched motor band y 150–156 only, below every legal line).

| ID            | Pen                                                                                                                                                                                                    | Face / side                         | Turn, R, ω                                          | Drop         | Heading | Band                                            | Speed |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | --------------------------------------------------- | ------------ | ------- | ----------------------------------------------- | ----- |
| T4            | `move(14,-5,-9)` (from 3D left face)                                                                                                                                                                   |                                     |                                                     |              |         |                                                 |       |
| 4A+H4         | ONE curve (no seam at the helix entry): `[straight(150,6)⇔, arc(150,52,11), arc(80,52,6,{red:0.8}), arc(70,52,5,{red:0.8}), straight(8,0.5)]`                                                          | HELIX right                         | helix +300° R 52 (b, rider 50.4) **ω 45** at 40 m/s | 28.5         | 90→30   | approach 0.2–0.5; helix **0.1–0.6** (red ≥ 0.8) | 31→40 |
| approach slot | walls either side of 4A's last 60 m (6 m clear of the face edges), enters the hall at bearing ≈ 318, ridge y ≈ 217 at φ 0 (north point (0, −52))                                                       | dark concrete                       |                                                     |              |         |                                                 |       |
| R4a           | fly-through ring on H4 at φ ≈ 120, `anchor('Pump', { flightSec: 0.9 }, [12,10])`: bay outside the hall wall, launch throws onto H4 at φ ≈ 100, arrival ≈ 30 m/s (≤ the ≈ 36 m/s a clean run has there) |                                     |                                                     |              |         |                                                 |       |
| E1 (fork)     | opening in the hall wall at bearing ≈ 262, centre y ≈ 175, **[6.4, 5.4]** (8 W × 3 H) to start; shrink toward [4.8, 4.5] only after launch + landing are shown controllable                            | dark frame, pale rim                |                                                     |              |         |                                                 |       |
| strut         | steel pillar r 1.5 on the straight tangent 25 m after the φ 225 release: the flight bends right of it                                                                                                  | solid                               |                                                     |              |         |                                                 |       |
| E2 (main)     | opening at bearing ≈ 342, centre y ≈ 166, **[6.4, 5.4]** (widen to [8, 6] if > 20 % of human clean attempts clip)                                                                                      | lit rectangle                       |                                                     |              |         |                                                 |       |
| R4m           | main catch after E2, `[straight(80,3)⇔, arc(-45,90,6), straight(80,-3)]`                                                                                                                               | BROAD left                          | −45° R 90 (b)                                       | 6 (climbs 3) | ≈20→335 | 0.2–0.5                                         | 34–38 |
| T4m           | `move(15,-5,-9)` onto R4 at its s ≈ 150 (R4m's last 80 m run within 10° of parallel to R4, 12–14 m ridge to ridge across the valley)                                                                   |                                     |                                                     |              |         |                                                 |       |
| R4            | `lead: 150` (racing line boards at s 150; the early fork catches s 0–35) `[straight(150,10), arc(30,120,5), straight(50,3)]`                                                                           | STD right                           | +30° R 120 (b)                                      | 18           | 345→15  | early catch 0.1–0.35; main 0.2–0.45             | 33–38 |
| C4            | `move(6,-2).gate([24,18],'Pump Exit')` ≈ (−120, 150, −260), heading 15                                                                                                                                 | covers both lines (they are merged) |                                                     |              |         |                                                 |       |

**Exit decision geometry.** The early release is at φ 215–235 (bearing 215–235, heading
305–325): climb to depth ≤ 0.1 by φ 200, go over the **outer ridge** (to the left — the helix
face falls inward, so "high" = outer), air-strafe right past the strut, through E1, onto R4's upper
band. Flight ≈ 47 m / 1.3 s at 36 m/s, drop ≈ 17 m + 3 m from the descending ridge: E1 centre ≈
19 m below the release. The main tangent exit at φ 300 (heading 30) flies ≈ 47 m to E2 and drops
≈ 20 m. E1 sits ≈ 9 m above E2 and 65° round the wall: from φ 150 the player sees a narrow high
slot and a wide low opening. Fit both corridors from `trace.ts` samples at 0.8 V, V, 1.2 V (25, 31,
37 m/s) before fixing E1/E2 (brief §3.4); the numbers above are the projectile first guess.

Helix clearance: 300° < 360°, so no turn stacks over another; the helix end (bearing 300) passes
32 m from the approach straight and 25 m below it. The main exit flight passes under the approach
slot with ≥ 15 m clearance (over-under: the player sees the approach overhead).

### Act 5

| ID       | Pen                                                                                                                                                                      | Face / side                      | Turn, R, ω         | Drop          | Heading | Band     | Speed                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------ | ------------- | ------- | -------- | --------------------------- |
| T5       | `move(14,-5,+9)`                                                                                                                                                         |                                  |                    |               |         |          |                             |
| 5A       | `[straight(90,9)⇔, arc(-60,90,8), straight(40,3)]`                                                                                                                       | STD left                         | −60° R 90 (b)      | 20            | 15→315  | 0.2–0.45 | 32–37                       |
| R5a      | `move(4,-2).anchor('Bypass', { flightSec: 1.0 }, [14,12])` (arrival ≈ 27 m/s)                                                                                            |                                  |                    |               |         |          |                             |
| T5a      | `move(15,-5,-9)`                                                                                                                                                         |                                  |                    |               |         |          |                             |
| 5B       | scoop `[straight(50,12), straight(45,-6)]`                                                                                                                               | MID right                        | —                  | 12 down, 6 up | 315     | 0.2–0.4  | 36→41→38 (restart 27→34→31) |
| T5b + W5 | `move(22,-3,+12)` diagonal (heading ≈ 343), window 2/3 along the flight: hole **[6.4, 5.4]**, heading 343, red bars 1 m wide on top and both sides (hatched), dark frame | window limits departure height   |                    |               |         |          | 31–38                       |
| 5D       | short contact `[arc(-25,40,1)]` (17.5 m ≈ 0.4–0.5 s on the face at 36 m/s; ≥ 8 m / 0.25 s minimum)                                                                       | SHORT left                       | −25° R 40 (b) ω 52 | 1             | 343→318 | 0.25–0.6 | 33–38                       |
| T5d      | `move(26,-7,-12)` long opposing catch: t ≈ 0.82 s at 35 m/s, 10t² = 6.7 ✓ flat release                                                                                   |                                  |                    |               |         |          |                             |
| 5E       | `[straight(90,6), arc(45,110,7), straight(60,4)]`                                                                                                                        | STD right                        | +45° R 110 (b)     | 17            | 318→3   | 0.2–0.45 | 32–36                       |
| T5e      | `move(14,-5,+9)`                                                                                                                                                         |                                  |                    |               |         |          |                             |
| 5F       | `[arc(-93,100,10), straight(80,6)⇔]`                                                                                                                                     | STD left                         | −93° R 100 (b)     | 16            | 3→270   | 0.2–0.45 | 34–38                       |
| P5       | `move(14,-3).airPortal(18, [250,270,150], 90, [12,12])`: faces 270, entry ≈ (−430, 95, −620)                                                                             | violet frame, exit preview of 6A | turn **+90°**      |               | 270→0   |          | kept                        |

Portal rule P5: `v_out = rotY(+90°)·v_in`, |v| and vertical speed kept, view turned +90°, no
gravity/camera roll change. Exit point fixed (README gap 1): the 12 × 12 opening means ≤ 6 m of
sideways snap for an off-centre entry — acceptable here; keep the exit 14 m before 6A's catch
and ≥ 1 s of settle before C5.

### Act 6

| ID  | Pen                                                                                                                                                           | Face / side   | Turn, R, ω     | Drop                 | Heading | Band          | Speed |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------- | -------------------- | ------- | ------------- | ----- |
| 6A  | `move(14,-4).curve({lead:12, ...})` `[straight(60,4), arc(-70,120,10), straight(40,3)]`                                                                       | STD left      | −70° R 120 (b) | 17                   | 0→290   | 0.2–0.45      | 34–39 |
| C5  | gate on 6A's first straight, 40 m after the exit: `gate([24,18],'Bypass Gate')` heading 0                                                                     |               |                |                      |         |               |       |
| R6a | `anchor('Outfall', {}, [14,12])` at 6A's end                                                                                                                  |               |                |                      |         |               |       |
| T6a | `move(15,-5,-9)`                                                                                                                                              |               |                |                      |         |               |       |
| 6B  | `[arc(-20,150,4), straight(90,6)⇔, straight(60,-10)]`                                                                                                         | STD right     | −20° R 150 (o) | 10, climbs 10 (17 %) | 290→270 | 0.2–0.4       | 38→31 |
| T6  | `move(36,-8,+6)`: rising transfer across the hall's south chord (z ≈ +40, 40 m south of the column): at 31 m/s t ≈ 1.18 s, vy0 ≈ +5.1 (apex +0.6 m), lands −8 |               |                |                      |         |               | 29–33 |
| 6C  | `[straight(110,6)]`                                                                                                                                           | WIDE left     | —              | 6                    | 270     | catch 0.1–0.6 | 30–34 |
| F   | `move(8,-2).finishGate([24,20], 30, 10)` at the west rim ≈ (−80, 236, 40), heading 270                                                                        | pressure gate |                |                      |         |               |       |

6C "rewards arriving high": a high catch (depth ≤ 0.25) lands ≈ 10 m further along (the flight
is longer before it meets the face), a weak one catches low and early. Too slow (< 26 m/s at the
release): falls short into the hall → back to R6a. 6C's prism bottom must stay ≥ 15 m above the
helix ridge (≈ 217) and clear of the approach slot (north side): it crosses the **south** chord.

## 5. Checkpoints, splits, recovery

| Gate / anchor   | Where (≈)                           | Clean-run time | Restore state (bay → `to`)                                                                                                                                                        |
| --------------- | ----------------------------------- | -------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C0 start        | (−420, 360, −800), heading 90       |              0 | start deck, standing                                                                                                                                                              |
| R1a Pier        | end of 1A (−265, 320, −815)         |             11 | default bay; re-entry onto 1B (T1 landing), 23 m/s; 1B + 1D descend 25 m before C1 ✓                                                                                              |
| C1 Intake Seal  | (−60, 290, −700), h 180             |             26 | bay throws onto 2A's first straight; 2A drops 14 m before bend A → ≈ 31 m/s ✓                                                                                                     |
| R2a Switch      | end of 2B (−330, 262, −560)         |             40 | default; lands on 2C start at 23 m/s — S2 at 23–28 m/s is easier (larger turn margin), 2D's climb + T2d from 28 m/s lands ≈ 2 m lower (still on 2E, or 2E-low) ✓                  |
| C2 Switch Merge | (−560, 245, −420), h 270            |             56 | onto 3A; 3A's 13 m climb from 23 m/s would leave ≈ 8 m/s at the lip ✗ → **`{ flightSec: 0.9 }`** (≈ 30 m/s arrival) → ≈ 19–20 m/s at the lip, inside the pads' 15–29 m/s window ✓ |
| R3a Teeth       | 3A's lip (−520, 247, −300)          |             63 | `{ back: 20 }` bay beside the lip; launch throws onto P1 directly at ≈ 22 m/s (flightSec 0.7)                                                                                     |
| C3 Flood Door   | (−190, 215, −150), h 90             |             84 | = R4A (§12): onto 4A approach; 4A 6 m + helix 150° 11 m = 17 m ≥ 12.4 m before the decision ✓                                                                                     |
| R4a Pump        | on H4 at φ 120                      |             92 | flightSec 0.9, onto H4 φ 100, ≈ 30 m/s; 1.5 s of helix before the reveal                                                                                                          |
| C4 Pump Exit    | (−120, 150, −260), h 15             |            113 | onto 5A (20 m of descent) ✓                                                                                                                                                       |
| R5a Bypass      | 5A end                              |            121 | flightSec 1.0 onto 5B start, ≈ 27 m/s → 5B scoop gives ≈ 31 at W5 (main line 38): W5 accepts 30–38 ✓                                                                              |
| C5 Bypass Gate  | after P5 on 6A (250, 262, 110), h 0 |            145 | onto 6A (17 m drop)                                                                                                                                                               |
| R6a Outfall     | 6A end                              |            153 | onto 6B; 6B drops 10 m then climbs 10 → release ≈ 25 m/s from a 23 m/s start ✗ → **flightSec 0.9** (≈ 30 m/s) → release ≈ 29 m/s ✓                                                |
| F finish        | (−80, 236, 40), h 270               |          ≈ 171 | —                                                                                                                                                                                 |

Anchor cadence: gaps of 11–15–14–16–7–21–8–21–8–24–8–18 s: every stretch ≤ 25 s ✓. The bays of
C2 and R6a need the non-default launches noted; the principle (brief §7.3): never faster than a
clean arrival at the same point.

Timing splits = C1..C5 (all on merged, stable stretches; the early fork and 2E-low rejoin before
C4 and C2). Gate headings are cardinal or ≤ 15° off (AABB triggers, README gap 3).

## 6. Faster line, failure, critical test

**Faster line** (target **7–9 s** combined; brief 7–12):

- Inside S1 (Act 2): 1.5–2.5 s (≈ 90 m of ramp skipped).
- Early helix release (Act 4): 4.5–6 s — skips φ 235–300 (≈ 60 m), E2's flight, R4m's 230 m sweep
  and T4m, replaced by a 47 m flight onto R4 s 0–35 then R4's own first 150 m (shorter
  overall, ≈ 155 m), and carries ≈ 8 m more height (≈ +2 m/s) into Act 5. If the saving measures under
  4 s, lengthen R4m's sweep (the main line), not the helix.

**Failure treatment**: underpowered Act 2 entries fall short of 2E onto 2E-low (slower, rejoins
before C2). Missing W5 or 5D resets to R5a. Falling off the helix lands in the red spray pool →
R4a. A failed early release falls into the pool below E1 (never onto R4m's line — keep R4m out
from under the E1 corridor) → R4a. Red helix band (≥ 0.8) → R4a.

**Critical test** (brief): _the shortcut must depend on a prepared trajectory, not on clipping a
corner or a portal seam._ Verify:

1. E1 is reachable only from the ridge band (depth ≤ 0.1) over φ 215–235 at 31–40 m/s: run
   `trace.ts` from R4a with releases at depth 0.1/0.3/0.5 — only 0.1 passes E1.
2. No path from the helix to R4 exists by skimming E2's frame or the wall edge: the wall around
   E1/E2 is ≥ 2 m thick solid with no ledge, and R4's first 150 m cannot be caught from E2.
3. A failed early release cannot cross C4 through the pool (C4 is on R4 past the merge, 60 m
   above the pool).
4. Manual reset at R4a is never faster than continuing (R4a's restart arrives ≈ 30 m/s at φ 100,
   slower than a clean arrival).
5. P5 is off the shortcut: the fork ends before C4, P5 is on the only Act 5 line.

## 7. Clean-run estimate

| Act                 |    Length (surf + flight) |          Avg speed |                          Estimate | Brief budget |
| ------------------- | ------------------------: | -----------------: | --------------------------------: | -----------: |
| 1 Street intake     |                   ≈ 750 m | 27 (start from 12) |                              26 s |           25 |
| 2 Double switch     |                   ≈ 900 m |                 31 |                              30 s |           30 |
| 3 Flood teeth       | ≈ 560 m surf + 100 m pads |            29 / 24 |                              26 s |           30 |
| 4 Pump spiral       |                   ≈ 900 m |                 33 |                              29 s |           35 |
| 5 Broken bypass     |                   ≈ 930 m |                 33 |                              30 s |           35 |
| 6 Emergency outfall |                   ≈ 700 m |                 33 |                 22 s + 4 s finish |           25 |
| **Total**           |                  ≈ 4.9 km |                    | **≈ 171 s** (early lines ≈ 163 s) |      165–195 |

Why: Intermediate practiced humans hold near V (30.4 m/s, profile) on sustained descents and ≈
0.8 V on climbs and pads. The helix is shorter in time than §12's 15 s budget because R 52 at
36–40 m/s circles fast; the saved time went to Act 5's longer opposing catch and 5F. If the human
proxy lands under 165 s, lengthen the ⇔ legs (never add empty travel): 1A, 1D, 2F, 3D, 4A, 5A, 5F,
6B.

## 8. Open questions / to calibrate

1. **Turn-rate comfort** (90°/s Intermediate) is an assumption: S2 (ω 43°/s) and 5D (52°/s)
   are the tightest main-line pieces — human check first.
2. **E1/E2 sizes** start at the brief's 8 W × 3 H; fit from trajectory envelopes at 25/31/37 m/s.
3. **Early-flight air-strafe** (≈ 30° right bend past the strut in 1.3 s) — verify humans can
   hold it without losing more than 10 % speed.
4. **Red strip on contact only**: the inside-S1 fork flies over 2A's red band — confirm `red`
   curve strips are thin surface blocks (they kill on contact, not in the air above).
5. **Bays with custom launch speed** (C2, R4a, R5a, R6a): `BayOpts.flightSec` < 1.2 raises
   arrival speed (the pen accepts it for gates and anchors). Confirm with `time-tracks --sections`
   that each restart finishes its section and is slower than a clean arrival.
6. **Short contact 5D** (0.4 s at 36 m/s): check prediction/rollback does not make brief contacts
   feel different online (brief: contact window compatible with latency).
7. **Bhop without hold-to-bhop**: Act 3 is a manual-timing test for Intermediate; acceptable per
   the brief ("setup and execution"), but record miss rates per pad.
8. P5's 90° turn is the map's only portal; keep its preview from competing with E1/E2 (it is in a
   different act and space ✓).
