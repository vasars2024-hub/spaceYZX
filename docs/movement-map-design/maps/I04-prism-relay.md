# I04 — Prism Relay (build spec)

Intermediate surf • MOVEMENT_PROFILE v1 • map id `surf-prism-relay` (suggested) • brief §10 I04, §4, §13.3, §15.2
Conventions, symbols and formulas: [README.md](README.md#conventions-used-in-every-spec). Every
number is a first blockout value **to calibrate** unless it quotes the movement profile. This map
depends on README gaps 1 (portal exit is a fixed point), 2 (cardinal portals) and 3 (AABB gates),
and on a course-format change for portals inside an alternative route (Act 4).

## 1. Identity

|                     |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode / discipline   | Intermediate / surf                                                                                                                                                                                                                                                                                                                                                                                                                |
| Movement identity   | _Carry your speed through portals that turn the world under you, and arrive already lined up for the next face._                                                                                                                                                                                                                                                                                                                   |
| Dominant techniques | 1. momentum through turning portals (turn 0, ±90) with `v_out = rotY(turn)·v_in`; 2. diagonal window transfers (W3, W5); 3. portal-to-ramp catches where exit heading and height set up the receiver                                                                                                                                                                                                                               |
| Supporting          | S-curves into portals, a 7-pad bhop phrase over prism plinths, a high/low portal split, a pillar air strafe round a red core, a rising transfer                                                                                                                                                                                                                                                                                    |
| Landmark            | **the suspended prisms and the beam**: the Input Prism above the start, the Central Prism above the red core at O (0, 225–300, 0), the Output Prism at Q (163, 170–240, 104). A thin ice-blue beam (decorative, no collision) enters every portal frame and leaves every exit, so the route is always drawn in light; PF lifts it into the calm chamber above O.                                                                   |
| Palette             | charcoal `#171B25` (structure, sky), pearl `#D7DCE4` (surf faces, frame inner rims), ice blue `#7ACFE0` (ridge strips, beam, anchors), portal accents: amber `#F2B35C` (Input), violet `#9A86F0` (Quarter), magenta `#D46FD6` (Spectrum), spring green `#7FDC9E` (Relay); hazard red `#E8242C` + charcoal hatching (red zones only, never an accent)                                                                               |
| Portal identifiers  | stable symbol + colour + tone per group: Input ○ amber (P1 "I", P2 "II"); Quarter △ violet, the triangle points the turn (P3 right, P4 left); Spectrum ◇ magenta outline (P5a, P5b) / ◆ filled (P6, high); Relay ⬡ green with a turn arrow (P7, P8); finish PF = pearl ring with four accent ticks. The race connector (§13.3) is a different object: a square docking collar, pearl on charcoal, double chevron, no accent colour |
| Materials           | faces: matte pearl composite, brushed along the ramp, ice-blue ridge strip; structure: charcoal steel, sharp chamfered frames; portal frames: black anodized, accent strip on the inner faces only; decorative prisms: glass with refraction/dispersion (**never** on collision); red core: opaque charcoal box with red hatched panels whose edges are the collision box                                                          |
| Lighting            | localized light pools on every catch zone (the brightest thing in view is the next receiver); portals lit only by their inner strip and the destination preview; bloom only on the beam core and decorative prisms, never on frames, rims or red edges                                                                                                                                                                             |
| Fog                 | `#171B25`, near 140 m, far 650 m; none within 60 m in front of an opening (preview readable)                                                                                                                                                                                                                                                                                                                                       |
| Portal views        | ≤ 2 live previews on screen at once (only the Act 4 split shows two: P5a + P6); previews only within 250 m and in the frustum                                                                                                                                                                                                                                                                                                      |
| Sound               | low optical hum; each crossing plays its group tone: turn 0 = one pure tone, +90 = rising fifth, −90 = falling fifth, Spectrum adds a split shimmer, PF resolves all four into one chord; rim hit = dull glass knock; red = the standard failure cue                                                                                                                                                                               |
| Poetic              | _Follow one line of light through rooms that refuse to stay continuous, and let the scattered colours gather into one clear opening._                                                                                                                                                                                                                                                                                              |
| Practical           | _From every decision point keep the next frame's symbol, turn arrow and destination preview readable; light the receiver, not the frame._                                                                                                                                                                                                                                                                                          |

## 2. Route sketch

Top-down, north up, schematic (not to scale; ≈ ±15 m; the pen sequence is authoritative). The
route uses two floor bands; where it crosses itself the floors are ≥ 150 m apart.

```
 UPPER LEVELS  y 400 -> 231      x: -650      -420       -130    0   150  255        435        620
 z -800                                                      P2'o v (150,378)
   -740                                                         ║ 1D  offset receiver (1D-low below, west)
   -700            S (-480,400) ═1A══╗                          C1 Input Collar (154,362) h180
   -620                          R1a ╚T1═1B══>P1o t0 (-121,356)   ╲2A
   -540                                                             ╲2B   (S-curve)
   -440            P1'o (-420,380) >1C═╗                              ║
   -370                                ║                              v P3△ +90 (255,329)
   -330                          P2o v t0 (-276,357)                          <══2C═════════<P3'△ (620,346)
   -228                                                    <P4▽ -90 ═2D════R2╝ (280,307)
   -130                                                                                  P4'▽ v (520,342)
    -40..80                                                                              ║2E (2E-low below)
     80                                                                                  C2 Quarter-Turn Merge (562,309) h168
    150..260                                                                             ║3A climb, R3a (579,307)
    270..380                                                           F1..F7 prism feet, L3 before F7, red basin below
    400..520                                                                        ╲3B ── W3◇ (hdg 245)
    566            <P5a◇═R4b═4B═╗ ═══4A═══ C3 Lens Frame (247,265) h270 ════3C═══╝
    575            <P6◆═4H(high)╝  P5a (-106,231,559) / P6 (-61,249,575)

 LOWER LEVELS  y 265 -> 125      x: -650      -420   -330 -300  -150    0     120     163       260
 z -363                   5A2══>P7⬡ +90 (-247,171)            P7'⬡ v (60,200,-250)
   -228..-185                    ║                              5B brief face, W5◇ (hdg 152)
   -168                          ║                              v P8⬡ -90 (70,184)
   -155                   R5a ═══╝ 5A1                 [calm chamber above O, y 330: PF'o (0,330,-60) > F]
    -80    P5a'◇ v (-640,262)      ║
     -4                            ║        P8'⬡ (-150,197) >5C═R5b═ ■ O ═5D═C5 Output Entry (119,162) h90
     34    ╚═4C══>P5b◇ (-526,240)  ║
     95                   C4 Spectrum Merge (-330,216) h0    red core [16,60,16]     ╚T6a═6A╗
    104                            ║                                        6A sweep R95 round ⊙Q (163,104)
    200..241                     4M<─╮ T4e diagonal (high line, lands s 40-70)   <══6A═══╝ (93,143)
    281..420                  4D ║   ║ 4E (+16 m)                      T6 ╲6B (raised output gallery)
    355                            ║   ║                         v PFo t0 (-85,125) [16,16]
    420                   P5b'◇^(-321,250)  P6'◆^(-300,263)
```

Side elevation (ridge height vs route distance; `┃` = a portal lift at the same distance, speed kept):

```
  400 S
  385  ╲            P1'        P2'
  370   ╲_1A_       ┃ ╲_1C_    ┃ ╲_1D_
  355        ╲_1B_P1┃     ╲_P2_┃      ╲_C1
  340                                     ╲_2A_       P3'              P4'
  325                                          ╲_2B_P3┃ ╲_2C_R2_       ┃ ╲
  310                                                           ╲_2D_P4┃  ╲_2E_C2_    _R3a_F1..F7_
  295                                                                            ╲_3A_╱            ╲_3B
  280                                                                                                  ╲W3
  265                                                                                                    ╲_3C_C3
      0 m                   600                     1200                    1800                    2400

  265 C3                P5a'
  250   ╲_4A_            ┃ ╲_4C_P5b┃P5b'
  235        ╲_4B_R4b_P5a┃         ╲_4D_T4d                     (high line: 4H 249 ┃ P6' 263 ╲ 4E ╲ T4e -> 4M 228)
  220                                     ╲_4M_C4
  205                                            ╲_5A1_R5a         P7'        P8'
  190                                                     ╲        ┃ ╲_5B_W5_P8┃╲_5C_R5b
  175                                                      ╲_5A2_P7┃                  ╲ ■ core
  160                                                                                   ╲_5D_C5
  145                                                                                          ╲_6A
  130                                                                                              ╲___╱T6╲_6B_PF ┃ +205 -> F (y 328)
      2480 m                3080                    3680                    4280                    4880
```

Height budget: ridges descend 400 → 125 (275 m) plus portal lifts P1 +24, P2 +21, P3 +17, P4 +35,
P5a +31, P5b +10, P7 +29, P8 +13 (= 180 m) → ≈ 455 m of ramp descent over ≈ 5.1 km (≈ 9 %). The
lifts cost nothing (speed kept); they are how a 180 s route fits a 275 m tall building.

## 3. Phrase tables

Speeds are practiced-human (0.6 strafe) estimates; the steady bot runs higher.

### Act 1 — Input lens (target 25 s; estimate 31 s)

| Beat | Time | Geometry                                                                             | Player action                       | Required result                         |
| ---- | ---: | ------------------------------------------------------------------------------------ | ----------------------------------- | --------------------------------------- |
| 1    |  2 s | start deck, 8 m lip                                                                  | sprint, drop onto 1A                | board 1A at depth 0.2–0.5, ≥ 18 m/s     |
| 2    | 10 s | 1A broad banked curve (+60°) round the Input Prism's pier                            | build speed                         | leave 1A at 29–31 m/s                   |
| 3    |  6 s | T1 onto 1B, banked back to heading 90; P1 (amber ○ I, turn 0) ahead with its preview | align, release centred              | cross P1 within ±3 m of centre          |
| 4    |  7 s | P1 lifts 24 m, same heading; 1C broad banked +90° to heading 180                     | settle 1.7 s, then choose 1C's band | ride high (≤ 0.15) for the good P2 line |
| 5    |  1 s | P2 (amber ○ II, turn 0)                                                              | cross left (east) of centre         | the exit line sets the 1D catch band    |
| 6    |  5 s | 1D: WIDE receiver whose lit upper band is 3.5 m left of the exit line; C1            | catch, settle                       | C1 at 32–35 m/s                         |

### Act 2 — Quarter turn (target 30 s; estimate 30 s)

| Beat | Time | Geometry                                                | Player action                     | Required result                   |
| ---- | ---: | ------------------------------------------------------- | --------------------------------- | --------------------------------- |
| 1    | 10 s | S-curve: 2A (−50°) then 2B (+50°) back to heading 180   | reverse steering, finish straight | heading 180 ± 5° at P3, 32–35 m/s |
| 2    |  1 s | P3 violet △ turn **+90**                                | fly the centre                    | exit heading 270, \|v\| kept      |
| 3    |  7 s | short gap (16 m) onto the curved receiver 2C (−45°), R2 | catch, follow the curve           | 2C at depth 0.2–0.45              |
| 4    |  5 s | T2c onto 2D (+45°) back to heading 270                  | opposing transfer                 | heading 270 ± 5° at P4            |
| 5    |  1 s | P4 violet ▽ turn **−90**, higher exit (+35 m)           | fly the centre                    | exit heading 180                  |
| 6    |  6 s | longer catch: 30 m / 1.0 s flight onto BROAD 2E, C2     | align in the air, catch, settle   | C2 at 31–34 m/s                   |

### Act 3 — Lens feet (target 30 s; estimate 27 s)

| Beat | Time | Geometry                                                                    | Player action                      | Required result            |
| ---- | ---: | --------------------------------------------------------------------------- | ---------------------------------- | -------------------------- |
| 1    |  7 s | T3 onto 3A: descends 7 m, climbs 10 m to a lip                              | trade speed for height             | leave the lip at 24–27 m/s |
| 2    |  5 s | F1–F6: flat prism plinths zig-zagging ±20–30° over a red basin              | first-tick hops, steer on each pad | reach F6 at 26–28 m/s      |
| 3    |  1 s | L3: low opening (4.2 m) between F6 and F7                                   | keep the hop low and centred       | pass under the lintel      |
| 4    |  6 s | hop F7 → 3B, a diagonal MID face turning +45° to 225                        | board mid band, descend            | 31–33 m/s at the release   |
| 5    |  1 s | T3b through the diagonal window W3 (heading 245)                            | shape the flight through the hole  | no frame contact           |
| 6    |  7 s | 3C outside curve to 270, long rebuild; both Act 4 frames come into view; C3 | settle, rebuild                    | C3 at 32–35 m/s            |

### Act 4 — Split spectrum (target 35 s; estimate 28 s main, ≈ 20 s high)

| Beat | Time | Geometry                                                                                               | Player action                                                            | Required result                                |
| ---- | ---: | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------- |
| 1    |  7 s | 4A long straight; P5a (◇ [12,12], low right) and P6 (◆ [9,9], 8 m higher, straight ahead) both visible | **decide**: mid band → transfer right; ridge band (≤ 0.15) → straight on | commit to a visible frame                      |
| L2   |  4 s | long: T4b onto 4B, R4b, P5a (−90)                                                                      | fly the centre                                                           | exit heading 180                               |
| L3   |  6 s | 4C broad banked bend 180 → 90, P5b (−90)                                                               | settle, align to 90                                                      | exit heading 0 into the Spectrum Chamber (low) |
| L4   |  4 s | 4D low receiver, T4d onto 4M s 0–20                                                                    | opposing transfer                                                        | catch 4M at 0.2–0.45                           |
| H2   |  3 s | high: 4H narrow climbing ridge ramp, P6 (+90)                                                          | hold ≤ 0.3 on 4H, fly P6's centre                                        | exit heading 0 into the chamber, 16 m above 4D |
| H3   |  5 s | 4E high receiver, then the **direct diagonal catch** T4e (40 m on, 30 m left, 26 m down)               | release, bend 37° back to 4M's tangent                                   | catch 4M's upper band at s 40–70               |
| 5    |  6 s | 4M merge ramp, C4                                                                                      | settle                                                                   | C4 at 33–37 m/s                                |

### Act 5 — Relay chain (target 35 s; estimate 31.5 s)

| Beat |  Time | Geometry                                                                                            | Player action             | Required result             |
| ---- | ----: | --------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------- |
| 1    |   8 s | T5 onto 5A1, banked left 0 → 315, R5a                                                               | build speed               | ≥ 34 m/s                    |
| 2    |  10 s | 5A2 curved ramp, banked +135° to heading 90, 1 m end kick                                           | hold 0.2–0.45             | heading 90 ± 5°, 33–37 m/s  |
| 3    |   1 s | P7 green ⬡ **+90**                                                                                  | centre                    | exit heading 180            |
| 4    |   2 s | 0.7 s flight onto 5B, a **brief** 25 m receiving face                                               | catch, prepare            | leave 5B's kick heading 180 |
| 5    |   1 s | T5b: S-flight left through diagonal W5 (heading 152) straight into P8 (**−90**) at the flight's end | out-and-back air strafe   | enter P8 heading 180 ± 10°  |
| 6    |   4 s | P8 exit → 5C (3.7 s of settle), R5b; the red core visible ahead                                     | settle, read the core     | 33–37 m/s at 5C's kick      |
| 7    | 1.5 s | T5c: pillar air strafe south of the red core                                                        | bend right early, realign | catch lit WIDE 5D           |
| 8    |   3 s | 5D settle, C5                                                                                       |                           | C5 at 33–37 m/s             |

### Act 6 — Output beam (target 25 s; estimate 24.5 s)

| Beat | Time | Geometry                                                                                      | Player action        | Required result               |
| ---- | ---: | --------------------------------------------------------------------------------------------- | -------------------- | ----------------------------- |
| 1    | 13 s | T6a onto 6A: 180° banked sweep round the Output Prism (R 95), −21 m, then a 20 % climb (+8 m) | hold 0.2–0.45, climb | release at 29–32 m/s, vy ≈ +6 |
| 2    |  1 s | T6: rising transfer onto the raised output gallery 6B                                         | fly, align           | catch 6B's upper band         |
| 3    |  8 s | 6B WIDE, banked −90° to heading 180                                                           | settle               | 32–35 m/s                     |
| 4    |  1 s | PF broad finish portal (turn 0) into the calm chamber; finish gate 8 m after the exit         | fly through          | finish, view down the beam    |

## 4. Element geometry

Face shapes (README): **SHORT** 9 × 65°, **MID** 12 × 60°, **STD** 14 × 58°, **BROAD** 16 × 56°,
**WIDE** 18 × 55°. "b" = banked, "o" = outside. ω = turn rate at the top of the speed band on the
rider radius (every ramp ≤ 28°/s; the Intermediate difficulty here is portals and air work, not
tight arcs). ⇔ = a stretch leg to lengthen if the clean run is short.

### 4.0 Portal rules (all portals)

- **Approach**: release, `move(4,-2)` (+ anchor where listed), `airPortal(10, exit, turn, size)`.
  The plane is 14 m after the release, the opening centred 2 m below it; a flat release at 29–38
  m/s crosses 2.1–3.6 m below the release (≤ 1.6 m under the centre). Vertical speed at the plane
  vy_in ≈ −(v·grade + 20·14/v) ≈ **−9 to −12 m/s** (P6 −4, P7 −6, P8 −18: listed).
- **Exit velocity rule**: `v_out = rotY(turn) · v_in`, \|v\| and vy kept (falling continues), view
  turned by the same angle, nothing else changes (`sim/devices.ts`).
- **Exit catch**: `move(f, u)` with u = −(\|vy_in\|·t + 10 t²), t = f / v: f 14 → u ≈ −7.
- **Heading**: the exit heading is the _actual_ approach heading + turn (not facing + turn), so
  every feeding curve ends on the cardinal and every receiver after a turned portal accepts ±10°
  (lead ≥ 12 m, STD or wider).
- **Setup**: ≥ 1.0 s from each exit to the next demand; a broad catch straight along the exit,
  previewed through the frame, is not a demand; a brief face (5B) is.
- **Rim**: frames are solid posts (1.4 m) and a lintel, no sill; the trigger is [w, h] × 3 m deep
  starting 1.5 m before the plane, so a centre inside the opening always teleports before the
  capsule meets a post. A "rim miss" is a centre outside the opening: bump or fall → the anchor
  before the phrase (§5).
- **Edge entry today (gap 1)**: the exit is a fixed point: up to w/2 sideways and **h/2 vertical**
  snap. The vertical snap is free or lost height: crossing 5 m low exits 5 m "too high" (≈ +3 m/s
  once spent at 31 m/s). With designed crossings ±2 m this is ±1 m/s; see §8 for the fix.
- **With an offset-preserving portal**: exit = exitCentre + rotY(turn)·(pos − entryCentre): up stays
  up, right-of-travel stays right-of-travel. On the receiver that becomes depth (column below); the
  whole exit rectangle (w × h round the exit) must then lie outside every trigger and geometry.

### Portal table

| ID / symbol             | Entry centre (≈)             | Faces | Opening                        |    Turn | Exit (feet)       | Exit hdg | v_in, vy_in    | Exit catch → receiver                                         | Setup to next demand              | Speed | Edge entry today                                                                      | Offset portal                      |
| ----------------------- | ---------------------------- | ----- | ------------------------------ | ------: | ----------------- | -------: | -------------- | ------------------------------------------------------------- | --------------------------------- | ----- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| P1 amber ○ I            | (−121, 355, −542)            | 90    | [12,12]                        |       0 | (−420, 380, −440) |       90 | 30–33, −11     | `move(14,-7)` → 1C BROAD right, lead 12                       | 0.45 s air + 40 m ≈ 1.7 s         | 30–36 | snap ≤ 6 m; lands 1C at 0.35                                                          | right → lower on 1C (±6 m = ±0.55) |
| P2 amber ○ II           | (−276, 356, −316)            | 180   | [12,12] (fallback: twin panes) |       0 | (150, 378, −780)  |      180 | 32–35, −11     | `move(14,-7,-3.5)` → 1D WIDE right                            | 3.5 s                             | 32–35 | see P2 block                                                                          | **the Act 1 lesson** (P2 block)    |
| P3 violet △             | (255, 329, −367)             | 180   | [12,12]                        | **+90** | (620, 346, −330)  |      270 | 32–35, −11     | `move(16,-8)` (short gap) → 2C STD left, lead 12              | 0.5 s + 70 m ≈ 2.7 s              | 32–36 | snap ≤ 6 m                                                                            | right (N) → higher on 2C           |
| P4 violet ▽             | (280, 307, −228)             | 270   | [12,12]                        | **−90** | (520, 342, −130)  |      180 | 32–35, −11     | `move(30,-20)` (longer catch, 1.0 s) → 2E BROAD left, lead 16 | 1.0 s air + 60 m ≈ 2.9 s          | 31–36 | snap ≤ 6 m; a 6 m vertical snap moves the catch ≈ ±6.5 m along 2E (lead 16 covers it) | right (W) → higher on 2E           |
| P5a magenta ◇           | (−106, 231, 559)             | 270   | [12,12]                        | **−90** | (−640, 262, −80)  |      180 | 34–36, −11     | `move(14,-7)` → 4C BROAD left, lead 12                        | 0.45 s + 20 m ≈ 1.1 s             | 34–38 | snap                                                                                  | right (W) → higher on 4C           |
| P5b magenta ◇           | (−526, 240, 34)              | 90    | [12,12]                        | **−90** | (−321, 250, 420)  |        0 | 35–38, −11     | `move(14,-7)` → 4D BROAD left, lead 12                        | 3.3 s                             | 34–38 | snap                                                                                  | right (E) → higher on 4D           |
| P6 magenta ◆ (optional) | (−61, 249, 575)              | 270   | **[9,9]**                      | **+90** | (−300, 263, 405)  |        0 | 31–34, −4      | `move(14,-4)` → 4E STD left, lead 12                          | 0.45 s + 110 m ≈ 3.8 s            | 31–35 | snap ≤ 4.5 m                                                                          | right (E) → higher on 4E           |
| P7 green ⬡ 1            | (−247, 171, −363)            | 90    | [12,12]                        | **+90** | (60, 200, −250)   |      180 | 33–37, −6      | `move(22,-10)` → 5B STD left (brief)                          | 0.7 s air + 0.8 s contact = 1.5 s | 33–36 | snap                                                                                  | right (W) → higher on 5B           |
| P8 green ⬡ 2            | (70, 184, −168) (end of T5b) | 180   | [12,12]                        | **−90** | (−150, 197, −4)   |       90 | 33–37, **−18** | `move(4,-2)` R5b + `move(10,-8)` → 5C STD right               | 0.45 s + 115 m ≈ 3.8 s            | 33–38 | snap                                                                                  | right (S) → lower on 5C            |
| PF pearl ring           | (−85, 125, 355)              | 180   | **[16,16]**                    |       0 | (0, 330, −60)     |      180 | 32–35, −11     | `move(8,-2)` finish gate [24,20]                              | —                                 | 32–35 | snap ≤ 8 m, harmless (gate covers it)                                                 | same                               |

No exit lies within 150 m of another portal's trigger; `validate.ts` rejects an exit inside a
portal for custom levels — confirm `check.ts` applies it to course maps (§6).

### Act 1

Pen start: `new Pen([-480, 400, -700], 90)`, `start([14, 16])`, `platform([10, 12], 'strafe')`.

| ID     | Pen                                                                                                        | Face / side | Turn, R, ω                     | Drop     | Heading | Band                          | Speed |
| ------ | ---------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------ | -------- | ------- | ----------------------------- | ----- |
| 1A     | `move(12,-8)` `[straight(70,6)⇔, arc(60,110,10), straight(30,2)]`                                          | STD right   | +60° R 110 (b, rider 107) ω 17 | 18       | 90→150  | 0.2–0.5                       | 12→31 |
| R1a    | `move(4,-2).anchor('Collimator', {}, [14,12])` → restart onto 1B                                           |             |                                |          |         |                               |       |
| T1     | `move(10,-3,+9)` (with the anchor's 4/−2: T(14,−5,+9))                                                     |             |                                |          |         |                               | 30    |
| 1B     | `[arc(-60,120,8), straight(30,3)⇔]`                                                                        | STD left    | −60° R 120 (b, rider 117) ω 16 | 11       | 150→90  | 0.2–0.45                      | 30–33 |
| P1     | `move(4,-2).airPortal(10, [-420,380,-440], 0, [12,12])`                                                    | amber ○ I   | turn 0                         | lift +24 | 90→90   |                               | kept  |
| 1C     | `move(14,-7).curve({ lead: 12, … })` `[straight(40,3), arc(90,90,9), straight(20,2)⇔]`                     | BROAD right | +90° R 90 (b, rider 86) ω 24   | 14       | 90→180  | catch 0.2–0.6; ride 0.1–0.45  | 30–36 |
| P2     | `move(4,-2).airPortal(10, [150,378,-780], 0, [12,12])`                                                     | amber ○ II  | turn 0                         | lift +21 | 180→180 |                               | kept  |
| 1D     | `move(14,-7,-3.5).curve({ lead: 12, depth: 0.3, … })` `[straight(110,7)⇔]`                                 | WIDE right  | —                              | 7        | 180     | catch 0.1–0.85; ride 0.2–0.45 | 32–35 |
| 1D-low | `branch`: `move(14,-16,+12)` WIDE right `[straight(70,3)]` + `launch` back onto 1D at s 95 (flightSec 1.1) | salvage     |                                |          |         |                               | 20–24 |
| C1     | `move(6,-2).gate([24,18],'Input Collar')` ≈ (154, 362, −650), heading 180                                  |             |                                |          |         |                               |       |

T1 at 30 m/s: t 0.56 s, 10t² 3.1 → u −5 inside [−6.1, −2.1] ✓. Input Prism: suspended glass
prism over 1A's pier (decorative), its beam enters P1.

**P2 rule block — "position in the opening sets the exit line"** (brief Act 1; needs gap 1).

- _Exit rule_: `v_out = rotY(0)·v_in = v_in`. 1C is a right face heading 180 with its ridge on the
  east (left): riding 1C at depth ≤ 0.15 puts the release 2.2 m further east and 2.8 m higher than
  the 0.35 line; 1 m of east strafe on the approach adds the rest.
- _Intended (offset-preserving portal)_: exit = (150, 378, −780) + (pos − entryCentre). 1D (WIDE,
  run 12.6) sits so the opening's centre line lands at depth 0.58; a crossing o m right (west) of
  centre lands at **0.58 + o / 12.6** (± 0.08 from air strafe). High line (o ≈ −3.5) → 0.30, the lit
  upper band, the better line into Act 2; centre → 0.58 (valid, climbs back); o = −6 → 0.10; o >
  +5.3 → past 1D's foot onto 1D-low (slower, rejoins before C1). Height offsets carry 1 : 1.
- _Fallback A (today's engine, recommended until gap 1 is closed)_: two air portals side by side,
  both facing 180, pane centres 14.3 m apart: **P2-W** [12,12] centred 3.5 m right of the 0.35
  line, exit at the intended centre-line point (→ 1D 0.58); **P2-E** [12,12] centred 10.8 m left,
  exit 3.5 m further east (→ 1D 0.30). The two frames merge into a 2.3 m solid mullion 2.5–4.8 m
  left of the 0.35 line (dark, pale-edged, not red). Approach 24 m instead of 14 (`airPortal(20…)`,
  centre 7 m below the release) so the high line steers ≈ 6 m east at ≈ 14°. P2-E is written as a
  raw `alt` PortalEl (`airPortal` moves the pen). The lesson becomes "which pane" (discrete).
- _Fallback C (minimum)_: one [12,12] pane, fixed exit 2 m left of centre (everyone lands 0.42);
  the offset receiver is only shown, not learned. Use only if A's mullion fails playtest.

### Act 2

| ID     | Pen                                                                                                                        | Face / side                 | Turn, R, ω                     | Drop     | Heading | Band                          | Speed |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------ | -------- | ------- | ----------------------------- | ----- |
| T2     | `move(14,-5,+9)`                                                                                                           |                             |                                |          |         |                               | 33    |
| 2A     | `[arc(-50,100,7), straight(30,2)]`                                                                                         | STD left                    | −50° R 100 (b, rider 97) ω 20  | 9        | 180→130 | 0.2–0.45                      | 32–34 |
| T2a    | `move(14,-5,-9)`                                                                                                           |                             |                                |          |         |                               |       |
| 2B     | `[arc(50,100,7), straight(80,5)⇔]`                                                                                         | STD right                   | +50° R 100 (b) ω 20            | 12       | 130→180 | 0.2–0.45                      | 32–35 |
| P3     | `move(4,-2).airPortal(10, [620,346,-330], 90, [12,12])`                                                                    | violet △ →                  | **+90**                        | lift +17 | 180→270 |                               | kept  |
| 2C     | `move(16,-8).curve({ lead: 12, … })` `[straight(70,4)⇔, arc(-45,110,7), straight(30,2)]`                                   | STD left                    | −45° R 110 (b, rider 107) ω 19 | 13       | 270→225 | catch 0.15–0.6; ride 0.2–0.45 | 31–35 |
| R2     | `move(4,-2).anchor('Mirror', {}, [14,12])` → restart onto 2D                                                               |                             |                                |          |         |                               |       |
| T2c    | `move(10,-3,-9)`                                                                                                           |                             |                                |          |         |                               |       |
| 2D     | `[arc(45,110,7), straight(60,4)⇔]`                                                                                         | STD right                   | +45° R 110 (b) ω 19            | 11       | 225→270 | 0.2–0.45                      | 32–35 |
| P4     | `move(4,-2).airPortal(10, [520,342,-130], -90, [12,12])`                                                                   | violet ▽ ← + "high" chevron | **−90**                        | lift +35 | 270→180 |                               | kept  |
| 2E     | `move(30,-20).curve({ lead: 16, … })` `[arc(-12,200,3), straight(130,8)⇔]`                                                 | BROAD left                  | −12° R 200 (b)                 | 11       | 180→168 | catch 0.1–0.7; ride 0.2–0.45  | 31–35 |
| 2E-low | `branch`: WIDE left, ridge 12 m under 2E's catch, 8 m east, `[straight(80,3)]` + `launch` onto 2E at s 110 (flightSec 1.2) | salvage                     |                                |          |         |                               | 22–26 |
| C2     | `move(6,-2).gate([24,18],'Quarter-Turn Merge')` ≈ (562, 309, 79), heading 168                                              |                             |                                |          |         |                               |       |

P3 gap: exit vy −11, t 0.5 s → drop 5.5 + 2.5 = 8 ✓ `move(16,-8)`. P4 longer catch: t 0.94 s at 32
m/s → drop 10.3 + 8.8 = 19 (window −17…−22) ✓ `move(30,-20)`; a 25 m/s exit drops ≈ 25 m and
lands 2E's lead-in lower (lead 16) or 2E-low. Both destinations are in the frame's preview.

### Act 3

| ID       | Pen                                                                                                                                                              | Face / side                                                                                | Turn, R, ω                       | Drop                | Heading | Band                          | Speed |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------- | ------------------- | ------- | ----------------------------- | ----- |
| T3       | `move(14,-5,-9)`                                                                                                                                                 |                                                                                            |                                  |                     |         |                               |       |
| 3A       | `[arc(12,150,2), straight(60,5)⇔, straight(70,-10)]`                                                                                                             | STD right                                                                                  | +12° R 150 (b)                   | 7, climbs 10 (14 %) | 168→180 | 0.2–0.5                       | 33→26 |
| R3a      | `move(4,-1).anchor('Prism Feet', { back: 20, flightSec: 0.7 }, [14,12])` → restart onto F1                                                                       |                                                                                            |                                  |                     |         |                               |       |
| F1–F6    | `move(10,-1).bhopPads([{d:0,size:[7,10]},{d:16.6,turn:-20},{d:17.0,turn:30},{d:17.4,turn:-30},{d:17.8,turn:20,size:[6,9]},{d:18.2,turn:-15,size:[6,9]}], [6,8])` | hexagonal prism plinths, flat tops turned to each hop                                      | headings 180/160/190/160/180/165 |                     |         |                               | 25→28 |
| L3       | `turn(15).window(9.3, [8,4.2], [30,16])`: hole bottom at pad-top level, top 4.2 m (hop apex 1.2 + H 1.8 + 1.2)                                                   | solid lintel (bump, not red)                                                               | heading 180                      |                     |         |                               |       |
| F7       | `bhopPads([{ d: 9.3, size: [6,9] }], [6,8])`                                                                                                                     |                                                                                            |                                  |                     | 180     |                               | 28    |
| basin    | `red` slab [40, 1, 140] 12 m below the pads (refraction pool, hatched)                                                                                           | red                                                                                        |                                  |                     |         |                               |       |
| T3a      | hop F7 → 3B: `move(22,-2)` (t_air at Δy −2 = 0.91 s × 26 m/s ≈ 24 m)                                                                                             |                                                                                            |                                  |                     |         |                               |       |
| 3B       | `[straight(20,1), arc(45,70,5), straight(80,7)⇔]`                                                                                                                | MID right                                                                                  | +45° R 70 (b, rider 67.6) ω 26   | 13                  | 180→225 | board 0.3–0.55; ride 0.2–0.45 | 26→32 |
| T3b + W3 | `move(15,-4,+5).turn(20).window(0,[8,5.4],[26,20]).turn(-20).move(7,-2,+3)` = T(22,−6,+8)                                                                        | W3: hole 10 W × 3 H, heading 245 (≈ 30° to the gallery grid), dark frame, pale rim, no red |                                  |                     |         |                               | 31–33 |
| 3C       | `.curve({ lead: 8, … })` `[arc(45,130,7), straight(150,10)⇔]`                                                                                                    | STD left                                                                                   | +45° R 130 (o, rider 133) ω 15   | 17                  | 225→270 | 0.2–0.45                      | 31–35 |
| C3       | `move(6,-2).gate([22,16],'Lens Frame')` ≈ (247, 265, 566), heading 270                                                                                           |                                                                                            |                                  |                     |         |                               |       |

Pads: design 25 m/s, human +0.6 m/s per hop, flat t_air 0.69 s. A missed first tick (−10 %) still
lands (22.5 × 0.69 = 15.5 m vs back edge d − 4). F5–F7 are [6, 9] because 0.4 d + 2 ≈ 9.3 m
exceeds the README's Intermediate [5–6, 7–8] (to calibrate from landing spread). T3b at 31 m/s: t
0.75 s, 10t² 5.6 → u −6 in [−8.6, −4.6] ✓; at 68 % of the flight the feet are ≈ 2.6 m below the
release, the hole spans −4…+1.4 → 1.4 m under the feet, 2.2 m over the head. 3C's outside curve
(C at 35 m/s ≤ 24 m) is far inside comfort.

### Act 4 — split spectrum

| ID         | Pen                                                                                                           | Face / side                  | Turn, R, ω                   | Drop           | Heading | Band                                                       | Speed |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------- | -------------- | ------- | ---------------------------------------------------------- | ----- |
| T4         | `move(14,-5,-9)`                                                                                              |                              |                              |                |         |                                                            |       |
| 4A         | `[straight(190,16)⇔, straight(30,-2)]`                                                                        | STD right                    | —                            | 16, climbs 2   | 270     | main 0.25–0.5; high ≤ 0.15                                 | 32→36 |
| T4b (long) | `move(15,-6,+16)`: at 35 m/s t 0.63, 10t² 4.0 → [−7, −3] ✓                                                    |                              |                              |                |         |                                                            |       |
| 4B         | `.curve({ lead: 8, … })` `[straight(90,7)⇔]`                                                                  | BROAD left                   | —                            | 7              | 270     | 0.2–0.5                                                    | 34–36 |
| R4b        | `move(4,-2).anchor('Prism Bend', {}, [14,12])` → restart onto 4C                                              |                              |                              |                |         |                                                            |       |
| P5a        | `airPortal(10, [-640,262,-80], -90, [12,12])`                                                                 | magenta ◇ 1                  | **−90**                      | lift +31       | 270→180 |                                                            | kept  |
| 4C         | `move(14,-7).curve({ lead: 12, … })` `[straight(20,2), arc(-90,80,9), straight(20,2)]`                        | BROAD left                   | −90° R 80 (b, rider 76) ω 28 | 13             | 180→90  | 0.2–0.5                                                    | 34–38 |
| P5b        | `move(4,-2).airPortal(10, [-321,250,420], -90, [12,12])`                                                      | magenta ◇ 2                  | **−90**                      | lift +10       | 90→0    |                                                            | kept  |
| 4D         | `move(14,-7).curve({ lead: 12, … })` `[straight(90,6)⇔]`                                                      | BROAD left                   | —                            | 6              | 0       | 0.2–0.5                                                    | 34–37 |
| T4d        | `move(15,-5,-9)`                                                                                              |                              |                              |                |         |                                                            |       |
| 4M         | `.curve({ lead: 12, … })` `[straight(200,14)⇔]`                                                               | STD right                    | —                            | 14             | 0       | T4d catch 0.2–0.45 (s 0–20); high catch 0.1–0.35 (s 40–70) | 33–38 |
| C4         | `move(6,-2).gate([24,18],'Spectrum Merge')` ≈ (−330, 216, 95), heading 0                                      | covers both lines (one face) |                              |                |         |                                                            |       |
| 4H (high)  | from 4A's end: `move(14,-1)` SHORT right `{ lead: 6 }` `[straight(50,-4)]`                                    | SHORT right                  | —                            | climbs 4 (8 %) | 270     | 0.1–0.4                                                    | 36→33 |
| P6 (high)  | `airPortal(10, [-300,263,405], 90, [9,9])` (no `move`: lip vy +2.6 → −3.9 at the plane, centre at lip height) | magenta ◆                    | **+90**                      | lift +14       | 270→0   |                                                            | kept  |
| 4E (high)  | `move(14,-4).curve({ lead: 12, … })` `[straight(110,7)⇔]`                                                     | STD left                     | —                            | 7              | 0       | 0.15–0.4                                                   | 32–35 |
| T4e (high) | `move(40,-26,-30)` diagonal (chord heading ≈ 323)                                                             | lands 4M s 40–70             |                              |                |         |                                                            | 34–40 |

**Split geometry.** 4B's line is 16 m north of 4A's; 4B's foot and 4H's foot are ≥ 6 m apart and
P5a's frame sits 45 m west of P6's, so no line can graze one frame into the other. The Spectrum
Chamber (x −340…−290, z 95…420) receives both: P5b' (−321, 250, 420) and P6' (−300, 263, 405) are 25
m apart, visible to each other; 4D and 4E run parallel north, 4E 16 m higher and 21 m east (4E's
foot to 4D's ridge 11.5 m). T4d lands 4M at s 0–20; T4e at 33 m/s: t 1.52 s, 10t² 23, vy0 −2.1 →
u window [−29, −25] ✓ −26; the flight starts after 4D has ended (z 316 vs 301) so it crosses no ramp.
The player bends 37° back to 4M's heading in 1.5 s (≈ 25°/s). Both lines are on 4M by s 70; C4 at s 200. A slow high line (< 30 m/s) lands 4M lower and earlier (still on the face).

**Format support (new).** `pen.branch` rejects portals ("a branch holds ramps, platforms, launches,
walls and red zones only"), so the high line (4H, P6, 4E) cannot be written as a branch today.
Proposal, smallest first: (1) allow `t: 'portal'` inside `branch` as `alt` — the pen already
restores pos/heading after a branch; `expand` builds the PortalDef (the sim trigger works as is)
and no race-line nodes; (2) add a `CourseFork` "High spectrum" with points on 4A (depth 0.1), 4H,
P6's centre (`air: true`) plus a new `portal: true` flag so tools never interpolate across the jump,
4E, and the 4M catch — `time-tracks --forks` then times it; (3) no branch tokens are needed because
both lines merge before C4 (brief §7.2); if a later revision gates inside the split, add
`requires` tokens to C4 set by fly-through token rings on each line. The long route stays the pen's
main line so the bot and par follow the safe route.

### Act 5 — relay chain

| ID       | Pen                                                                                                                 | Face / side                                                                 | Turn, R, ω                      | Drop           | Heading | Band                         | Speed |
| -------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------- | -------------- | ------- | ---------------------------- | ----- |
| T5       | `move(14,-5,+9)`                                                                                                    |                                                                             |                                 |                |         |                              |       |
| 5A1      | `[straight(130,9)⇔, arc(-45,120,7), straight(30,2)]`                                                                | STD left                                                                    | −45° R 120 (b, rider 117) ω 17  | 18             | 0→315   | 0.2–0.45                     | 32–36 |
| R5a      | `move(4,-2).anchor('Relay', {}, [14,12])` → restart onto 5A2                                                        |                                                                             |                                 |                |         |                              |       |
| T5a      | `move(10,-3,-9)`                                                                                                    |                                                                             |                                 |                |         |                              |       |
| 5A2      | `[arc(135,120,15), straight(30,2), straight(20,-1)]`                                                                | STD right                                                                   | +135° R 120 (b, rider 117) ω 18 | 17, kick +1    | 315→90  | 0.2–0.45                     | 33–37 |
| P7       | `move(4,-1).airPortal(8, [60,200,-250], 90, [12,12])`                                                               | green ⬡ 1 →                                                                 | **+90**                         | lift +29       | 90→180  |                              | kept  |
| 5B       | `move(22,-10).curve({ lead: 8, … })` `[straight(25,-2)]` (brief: 0.8 s of contact)                                  | STD left                                                                    | —                               | climbs 2 (8 %) | 180     | catch 0.15–0.6               | 33–35 |
| T5b + W5 | `move(14,-3,-5).turn(-28).window(0,[6.4,5.4],[24,18]).turn(28).move(16,-5,-5)` = T(30,−8,−10)                       | W5: 8 W × 3 H, heading 152 (the flight's mid-heading), dark frame, pale rim |                                 |                |         |                              | 33–35 |
| P8       | `airPortal(0, [-150,197,-4], -90, [12,12])` at the flight's end                                                     | green ⬡ 2 ←                                                                 | **−90**                         | lift +13       | 180→90  |                              | kept  |
| R5b      | `move(4,-2).anchor('Core', { flightSec: 0.9 }, [14,12])` → restart onto 5C                                          |                                                                             |                                 |                |         |                              |       |
| 5C       | `move(10,-8).curve({ lead: 12, … })` `[straight(90,5)⇔, straight(25,-2)]`                                           | STD right                                                                   | —                               | 5, kick +2     | 90      | catch 0.1–0.6; ride 0.2–0.45 | 33–37 |
| core     | `red(21, 4, -36, [16,60,16])` after 5C: x −8…8, z −8…8, y 150–210 at O; Central Prism (decorative glass) from y 225 | red, hatched, opaque                                                        |                                 |                |         |                              |       |
| T5c      | `move(44,-18,+22)` pillar air strafe south of the core                                                              |                                                                             |                                 |                |         |                              | 31–35 |
| 5D       | `.curve({ lead: 10, … })` `[straight(90,5)⇔]`                                                                       | WIDE left, brightly lit                                                     | —                               | 5              | 90      | catch 0.1–0.65               | 34–38 |
| C5       | `move(6,-2).gate([24,18],'Output Entry')` ≈ (119, 162, 18), heading 90                                              |                                                                             |                                 |                |         |                              |       |

**Relay timeline** (clean run): P7 136.2 s → 5B catch 136.9 → 5B release 137.7 (first demand 1.5 s
after P7) → W5 138.1 → P8 138.7 → 5C catch 139.1 → core flight 142.6 (3.9 s after P8) → 5D 144.1.
T5b at 33 m/s: t 0.96 s, 10t² 9.2, vy0 +2.6 → u window [−9.7, −5.7] ✓ −8; it is an out-and-back S
(peak ≈ 28° off 180 at W5, ≈ 60°/s of air turn — the chain's tightest demand), ending aligned into
P8 at vy ≈ −18 m/s (listed; P8's exit catch uses it: 0.45 s → −10 ✓). **Core shaping**: the chord
from 5C's lip to 5D's catch passes x 0 at z ≈ 6.5, inside the core (z ≤ 8): aiming straight at 5D
touches red. The prepared line strafes right on release, passes the core's south face at 3–5 m,
then aligns to 5D. Over or under is impossible (the flight stays at y 169–188). T5c at 33 m/s: t
1.49 s, 10t² 22, vy0 +2.6 → u window [−21, −17] ✓ −18; 29–35 m/s all land on WIDE 5D.

### Act 6

| ID  | Pen                                                                                                                        | Face / side                       | Turn, R, ω                          | Drop                | Heading | Band                         | Speed    |
| --- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------- | ------------------- | ------- | ---------------------------- | -------- |
| T6a | `move(14,-5,-9)`                                                                                                           |                                   |                                     |                     |         |                              |          |
| 6A  | `[straight(30,2), arc(180,95,18), straight(30,1)⇔, straight(40,-8)]`                                                       | STD right                         | +180° R 95 (b, rider 92) ω 24 at 38 | 21, climbs 8 (20 %) | 90→270  | 0.2–0.45                     | 33→38→30 |
| T6  | `move(28,-4,+8)` rising: at 30 m/s vy0 ≈ 5.9, t 0.97 s, apex +0.9 m, lands −3.7 ✓ (a flat release would land ≈ 10 m lower) |                                   |                                     |                     |         |                              | 29–32    |
| 6B  | `.curve({ lead: 10, … })` `[straight(40,2), arc(-90,110,8), straight(40,3)⇔]`                                              | WIDE left (raised output gallery) | −90° R 110 (b, rider 105.6) ω 19    | 13                  | 270→180 | catch 0.1–0.5; ride 0.2–0.45 | 30→35    |
| PF  | `move(4,-2).airPortal(10, [0,330,-60], 0, [16,16])`                                                                        | pearl ring + four accent ticks    | turn 0                              | lift +205           | 180     |                              | kept     |
| F   | `move(8,-2).finishGate([24,20], 30, 18)` ≈ (0, 328, −52), heading 180; calm deck ≥ [60, 80] 18 m below                     |                                   |                                     |                     |         |                              |          |

Output Prism at Q (163, 170–240, 104), inside the sweep (≥ 80 m from the line). Too slow at T6 (<
27 m/s) falls under 6B → C5.

**Finish portal: a real portal, then the finish gate** (not a gate inside a portal-styled frame).
PF is the momentum portal the beam leaves through, so the landmark ends as a real transformation;
its fixed exit funnels every finish trajectory through one point 8 m before the [24, 20] gate, which
therefore covers every legal finish line (§13.3 exit contract); the timer stops at the gate, after
the teleport, identically for everyone. Its symbol (pearl ring, four accent ticks, resolving chord)
is a momentum-portal symbol. The race connector that follows in a queue is the separate square
docking collar at the calm chamber's far wall (pearl on charcoal, double chevron, no accent, a
neutral reset tone), which restores the next map's start state (§13.3); the two never share a glyph.

## 5. Checkpoints, splits, recovery

Anchors sit on the transfer _into the ramp that feeds_ each new portal combination, so the
restart replays the portal (the pen places a bay at the next landing, which for an anchor right
before `airPortal` would be after the portal).

| Gate / anchor         | Where (≈)                           | Clean-run time | Restore state (bay → `to`, arrival) and re-entry check                                                                 |
| --------------------- | ----------------------------------- | -------------: | ---------------------------------------------------------------------------------------------------------------------- |
| C0 start              | (−480, 400, −700), heading 90       |              0 | start deck, standing                                                                                                   |
| R1a Collimator        | end of 1A (−268, 372, −619)         |             14 | default bay onto 1B, 23 m/s; 11 m before P1 → ≈ 29 m/s; P1/P2 catches are broad (no minimum) ✓                         |
| C1 Input Collar       | (154, 362, −650), h 180             |             31 | onto 2A; 2A + 2B drop 21 m ≥ 12.4 m before P3 ✓                                                                        |
| R2 Mirror             | end of 2C (435, 323, −277)          |           48.5 | onto 2D; 11 m ≥ 7.3 m (P4's catch needs ≥ 28 m/s) ✓                                                                    |
| C2 Quarter-Turn Merge | (562, 309, 79), h 168               |             61 | onto 3A; default (23) would leave ≈ 16 m/s at the lip ✗ → **`{ flightSec: 0.9 }`** (≈ 30; clean ≈ 33) → lip ≈ 24 m/s ✓ |
| R3a Prism Feet        | 3A's lip (579, 307, 259)            |             68 | `{ back: 20, flightSec: 0.7 }` onto F1, ≈ 23 m/s (pads accept 18–31) ✓                                                 |
| C3 Lens Frame         | (247, 265, 566), h 270              |             88 | onto 4A: 16 m ≥ 12.4 ✓ → ≈ 31 at the split; high line after 4H's climb ≈ 29 at P6 ✓                                    |
| R4b Prism Bend        | end of 4B (−92, 231, 559)           |             99 | onto 4C (past P5a): 13 m → ≈ 30 at P5b (clean ≈ 37) ✓                                                                  |
| C4 Spectrum Merge     | (−330, 216, 95), h 0                |            116 | onto 5A1: 18 m ✓                                                                                                       |
| R5a Relay             | end of 5A1 (−377, 191, −155)        |            125 | onto 5A2: 17 m ≥ 12.4 before P7 ✓                                                                                      |
| R5b Core              | 4 m after P8's exit (−146, 195, −4) |            139 | **`{ flightSec: 0.9 }`** onto 5C (≈ 30; clean ≈ 36); 5C nets 3 m → ≈ 31 at the lip; 29 m/s still lands WIDE 5D ✓       |
| C5 Output Entry       | (119, 162, 18), h 90                |            147 | **`{ flightSec: 1.0 }`** onto 6A (≈ 27; clean ≈ 34): −21 m, +8 m → ≈ 30 at T6 ✓ (default 23 → ≈ 28, marginal)          |
| F finish              | (0, 328, −52), h 180                |          ≈ 172 | —                                                                                                                      |

Cadence: 14–17–17.5–12.5–7–20–11–17–9–14–8–24.5 s: every stretch ≤ 25 s ✓, and an anchor or gate
precedes every new portal combination (P1/P2 R1a, P3 C1, P4 R2, split C3, P5b R4b, P7/P8 R5a, PF
C5). Custom `flightSec` bays are never faster than a clean arrival (§7.3). No anchor can sit
inside the high line (branches hold no anchors); a failed high line returns to C3 (≈ 12 s).
Timing splits = C1..C5, all on merged single-face stretches. Gate headings are cardinal (C2 12°
off, inside ±15°; README gap 3). C gates are "lens collars": charcoal octagonal frames with an
ice-blue inner rim and a split panel; R anchors are thin pearl rings with the recovery glyph —
neither uses a portal accent or the arch shape.

## 6. Faster line, failure, critical test

**Faster line** (brief: high spectrum portal and a direct diagonal catch; target 6–10 s): ride 4A's
ridge band, stay straight onto 4H, P6 (+90, [9,9]), 4E, the diagonal T4e onto 4M s 40–70. It skips
T4b, 4B, P5a, 4C, P5b, 4D and T4d (≈ 520 m of the long route) for ≈ 290 m: **≈ 8 s** (6.5–9 s with
human execution). It needs a prepared line twice: depth ≤ 0.15 on 4A (else 4H is caught too low to
line up with P6's 9 m opening) and the early right-to-left realignment on T4e.

**Failure treatment**: a rim miss or a fall under any frame hits the kill floor → the anchor before
that phrase (§5), whose restart replays the portal. Small exit errors land on wider lower receivers:
1D-low (P2 right-edge or weak exits), 2E-low (short P4 catches), 5D WIDE (every T5c from 29–35 m/s),
4M (both spectrum lines), 6B WIDE. Red: only the pad basin and the core.

**Critical test** (brief): _speed magnitude preserved through ordinary portals, direction
transformed correctly; grazing entries, edge crossings, high speed, rapid re-entry._ Verify:

1. **|v| through every portal on the real route**: `npx tsx tools/race/trace.ts surf-prism-relay <cp> 40 1 | grep -B1 portal`
   for cp 0–5 and a1…a6 (trace prints the tick before and the tick of each portal event; `v` = vh,
   vy): √(vh² + vy²) equal within one tick of gravity/strafe, vy continuous, heading change = turn.
2. **Scripted portal harness** (new, e.g. `tools/race/portal-check.ts`): for every PortalDef, spawn a
   player 4 m before the opening moving along its facing and step the sim. Entries: centre; each edge
   at w/2 − 0.5 and h/2 − 0.5; the four corners; yaw ±15° (legal) and ±30°, ±60° (grazing); speeds
   25 / 31 / 38 / **50** m/s with vy 0, −12, −18 and +5. Assert per entry: exactly one portal event;
   \|v_out\| = \|v_in\| (±0.01) and vy_out = vy_in; yaw_out = yaw_in + turn (±0.5°) and the view turned
   by the same angle; pos = exit (offset mode: exit + rotY(turn)·offset); a centre 0.1 m outside the
   opening gives no event (frame hit or miss). Log the landing depth on the receiver for each offset
   to fill the portal table's last column.
3. **Rapid re-entry**: after each exit, brake (hold S) and reverse for 0.5 s — no event; P7 → P8 at
   38 and 45 m/s — exactly two events, in order, ≥ 1.0 s apart; restart from R5b and R4b immediately
   — no event; spawn standing on each exit point — no event on the first tick (every exit outside
   every trigger: the `validate.ts` "exit is inside a portal" rule — make `check.ts` apply it to
   course maps if it does not).
4. **Heading through turns**: enter P3 at 170° and 190°, P4 at 260° and 280°: exits at 260/280 and
   170/190 still catch 2C / 2E (lead ≥ 12 m). Enter P6 at 255° (−15°): exit 345° still lands 4E.
5. **Fixed-exit height exploit**: cross P1 and P4 at the bottom and at the top of the opening; the
   difference in time to the next gate must stay < 0.3 s, else apply the §8 vertical-offset fix.
6. **Split integrity**: no path reaches 4E or the 4M upper band from the long route without P6; P6
   is not reachable from 4B; C4 cannot be crossed from the chamber floor; both lines finish C4 in
   `time-tracks --forks`.
7. Commands: `npx tsx tools/race/check.ts surf-prism-relay` (clipping, validation, render budget);
   `npx tsx tools/race/time-tracks.ts surf-prism-relay --human --sections` (splits and every restart
   bay finishing its section); `… --forks` (high spectrum); `npx tsx tools/race/sketch.ts
surf-prism-relay --svg <file>` (re-derive the coordinates in this spec).

## 7. Clean-run estimate

| Act              |      Length (surf + flight) |          Avg speed |                          Estimate | Brief budget |
| ---------------- | --------------------------: | -----------------: | --------------------------------: | -----------: |
| 1 Input lens     |                     ≈ 790 m | 25 (start from 12) |                              31 s |           25 |
| 2 Quarter turn   |                     ≈ 930 m |                 31 |                              30 s |           30 |
| 3 Lens feet      |   ≈ 650 m surf + 110 m pads |          30 / 24.5 |                              27 s |           30 |
| 4 Split spectrum | ≈ 880 m long (≈ 650 m high) |               31.5 |                28 s (high ≈ 20 s) |           35 |
| 5 Relay chain    |                     ≈ 990 m |               31.5 |                            31.5 s |           35 |
| 6 Output beam    |                     ≈ 730 m |                 31 |                            24.5 s |           25 |
| **Total**        |                    ≈ 5.1 km |                    | **≈ 172 s** (faster line ≈ 164 s) |      165–195 |

Why: practiced Intermediate humans hold 29–32 m/s on sustained surf (V = 30.4 human) and ≈ 0.8 of
that on climbs and pads (3A, F1–F7, 4H, 6A's climb); portals add no time (instant) and the lifts
let the route keep descending at ≈ 9 %. Act 1 runs over budget because it introduces two portals;
trim 1A's ⇔ first if the human proxy lands above 180 s. If it lands under 165 s, lengthen ⇔ legs
(never empty travel): 1B, 2B, 2C, 2E, 3C, 4A, 4M, 5A1, 5C, 6B.

## 8. Open questions / to calibrate

1. **Offset-preserving portal (gap 1)** — decide before batch 3. Spec: exit = exitCentre +
   rotY(turn)·(pos − entryCentre), velocity rule unchanged; the exit rectangle must be clear of every
   trigger and solid. With it, a full-edge entry moves ±0.5–0.7 of a STD face on the receiver, so
   receivers after 12 m openings stay BROAD/WIDE with the salvages listed; an `offsetScale` (0–1) knob
   would let other maps soften it. Cheapest partial fix: **vertical-only offset** (exit.y += pos.y −
   centre.y), which removes the free-height exploit of §4.0 without changing any receiver.
2. **Portals inside alternative routes** (Act 4): the §4 proposal (alt portals in `branch`, a
   `portal` flag on fork points, optional `requires` tokens). Check that the fork rider in
   `time-tracks --forks` advances past a teleport.
3. **Camera on ±90° turns at 33–38 m/s**: the view turns instantly with the velocity. Check client
   interpolation snaps across the teleport (no lerp across 300–700 m), prediction/rollback near a
   portal, mouse input on the portal tick, and comfort (P7 → P8 is two opposite quarter-turns 2.5 s
   apart). A 0.1 s edge flash may help readability.
4. **Portal preview cost**: does the renderer support live destination views? If not, a static
   destination diorama in each frame is the fallback (the brief requires a visible destination).
   Budget ≤ 2 live views; the split (P5a + P6) is the worst case; measure frame time there (§15.2 #14).
5. **Falling through portals**: vy_in −9…−18 m/s is kept, so exit catches sit 7–20 m below their
   exits; confirm steep arrivals (P8 → 5C at vy ≈ −26) do not scrub too much speed; the end kicks on
   5A2 and 5B exist to keep vy small at P7/P8.
6. **Heading tolerance**: human approach error at P3/P4 (S-curve then portal) — if > ±10°, widen the
   receivers' leads or add a gentle aligning curve before each frame.
7. **Air-turn demands**: T5b (≈ 60°/s S-flight) and T4e (37° in 1.5 s) are the tightest; the ramp
   ω stays ≤ 28°/s. Check against the 90°/s Intermediate comfort assumption.
8. **P2 fallback A mullion**: if > 5 % of mid-line runs hit the 2.3 m mullion, widen the pane gap or
   fall back to C; P2-E needs a raw `alt` PortalEl.
9. **Pads** (gap 4, manual timing; F5–F7 [6, 9]): record per-pad misses and L3 lintel hits.
10. **Finish landing** (18 m drop at ≈ 33 m/s onto the calm deck): confirm no fall damage on race
    surf maps. **Stacked floors** (1C/P2 ≈ 185 m above 5A2/P7): check `autoFloors` kill heights per
    floor. **Act 1** runs 31 s vs 25 s: do not cut its teaching beats to fix it.
