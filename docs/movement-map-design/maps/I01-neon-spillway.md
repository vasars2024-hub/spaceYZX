# I01 — Neon Spillway (as built)

Intermediate surf • MOVEMENT_PROFILE v1 • map id `surf-neon-spillway` •
source `packages/shared/src/level/maps/surf-neon-spillway.ts` • brief §10 I01 + §12.
Built, tested and timed. The pen sequence in the source is authoritative; the numbers below
are copied from it and from the tools (`tools/race/*`). This page replaced the build spec it
was built from (the original spec is in git history: commit c03b4d0); §8 lists where the build
differs from that spec and why. Conventions and formulas: [README.md](README.md#conventions-used-in-every-spec).

## 1. Identity

|                   |                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme             | stormwater infrastructure under a neon city: wet-concrete spillways with a cyan ridge light, dark concrete piers, an enclosed pump hall with a lit column                                                                                                                                                                     |
| Movement identity | _keep your speed through direction change after direction change, then choose how early to leave the pump spiral_                                                                                                                                                                                                             |
| Palette           | near-black blue #121D2B (sky, structure shadows), electric cyan #53D8E2 (ridge light, column bands, anchors, gate glow), muted violet #7563A8 / #9A86D8 (portal, distant neon), wet concrete #68717B (six shades, one per act), sodium #F2A65A (lamps, pads, finish), hazard red #E8242C with black hatching (red zones only) |
| Landmark          | **the pump column**: a 28 m wide dark-steel drum column in the pump hall, cyan light band every 12 m, a cyan crown; the hall wall (r 70) has sodium lamps on its rim. Seen from Act 3's approach slot, circled in Act 4, flown past in Act 6                                                                                  |
| Scenery           | dark concrete piers under the ramps (every ~70 m where nothing passes below), sodium lamps on every third pier, the support pier Act 1 bends round, floodgate teeth, the walled approach slot, the spray pool at the hall's foot, 8 dark towers outside the map with neon bands only near their tops                          |
| Fog / sky         | fog 120–600 m (as specified), dark blue sky with a violet city glow at the horizon; the cloud floors (auto floors) are drawn as dark mist with a blue (not red) glow so red stays for red zones only                                                                                                                          |

## 2. Route sketch

Top-down, north up, drawn by `npx tsx tools/race/sketch.ts surf-neon-spillway` (SVG:
[I01-neon-spillway.svg](I01-neon-spillway.svg), `--svg`). Line characters are the racing
line's height in tens of metres (0–9, then a = 100 m … z = 350 m and above); `1`–`5` gates,
`R` anchors, `b` restart bays, `x` red zones, `O`/`o` portal in/out, `S` start, `F` finish.

```
                                                                                                          zzzzz:
                                                                                                ::zzzzzzzzz:::zzzzz:
              :iiiiiiiii                                                                 zzR :                       zz
            iii::    ::iii:                                                             zz  b                        :z
           ii:           iij:                                                        :zzz                            :z
          ii:             :j:  b                  zSzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz:                              zz
          i:                4j:                       :: ::: :::: :::: :::: ::: ::::                               :zz
          R:                    kk:                                                                              zz
          g:                         :::kk:                            ::llllllll::                       zzz
          g:                             :::kkk::        :llllllll:::              :lll:                :z:
          xg                                    :::                                     ll              z:
            gf                                          :::                           :ll:              1z:
                ffff:                                           :::        xxxxxxxxll                  :zz
                  :ffffff::: :::eee:                            b::::  :xxxx::    m:yyy:              :zz
                      ::fffffff:::eeeee:          :qqqqqqqqqppp3 ppppppppppppppppppppoooyyyy::    ::zzz:
                                     :eee:     qqqqq::              xxx:       nn      ooooyyyyzzzzzz
                                         :eqqq:                    R: b  :::  o           :o
                                       rrr:e           :vvv:vvvvvww           oo:       :Ro
                                     rrr: :e         :uu::  Fsssssssssssssssssstttttttooouttttttttttttt:
            ::: :::: :::: :ssss::eeeeee          uu::                                                    :tt
         O  dddddddddddeeeeeeeeeee:            :uu:                                                    ::tt
          x s s s s sx::                       uu:            :vvvvvvvvvvvvvvvvvvvvvvvvvvvuuuuuuR:uuutttt:
     :sttRs                                  :uu:           :vvv::                             b :::::
 ss                                ::ttuu:               b 5:
     :rrrrrrr2ssssssssssstt::                              w:
x -475..471 (→ east), z -380..442 (↓ south), 7.9 m per column (rows abridged)
```

The upper channels circle the map clockwise high up: Act 1 east along the north edge and back
south-west (C1 on the east side), Act 2 south-west across the middle (C2 in the south-west),
Act 3 up the west side and east along the middle into the walled approach. The pump hall
(centre O ≈ (193, 121)) is in the middle-east. Act 4 leaves it north-west (the main line
sweeps round the north of the hall first); Act 5 runs low (y 190 → 130) in the north-west,
under Act 1's start, and back south under the flood teeth to the portal (`O`, west). The portal
lifts you to the south (`o`, (−4, 333, 432)); Act 6 sweeps east, U-turns back west and crosses
the hall's south chord to the finish in the middle.

## 3. Phrase graph

```
S ─drop 8─▶ [1A MID right, 200 + −50° R75 + 40 (outside, round the pier)] ─R1 Pier─ T(15,−5,+9)
  ▶ [1B MID left, 45° R90 + 30] ─window W1 (16×9) in the flight─▶ [1D MID right, 135° R85 (banked) + 70]
  ─T(14,−5,+9)▶ [1E MID left, −40° R120 + 60] ─▶ C1 Intake Seal
  ─T▶ [2A MID right, 25 + 110° R80 + 45, red 0.78] ─T▶ [2B MID left, 15 − 80° R100 + 25, red 0.78] (S1)
  ─R2 Switch─ T▶ [2C MID right, 55° R50 + 18, red] ─T(13,−4,+8)▶ [2D MID left, −55° R50 (red) + 20 + climb 30 m / 3 m] (S2)
  ─elevated catch T(16,−2,−9)▶ [2E STD right, 100 + 30° R150 + 40]
        └ salvage: a weak release falls onto 2E-low (WIDE, 24 m below) ▶ launch 2.6 s ▶ 2F at s 80
  ─T▶ [2F STD left, 30° R160 + 50] ─▶ C2 Switch Merge
  ─gap▶ [3A STD right, 20 + 160° R65 climbing 12 + climb 20 (banked U-turn)] ─R3 Teeth─
  ─▶ 6 bhop pads (6×8, last two 6×9) in angled pairs (+25°, −30°) between floodgate teeth, over the red sluice
  ─hop(16,−1.5,+6)▶ [3C MID left, depth 0.55; lintel L3 at s 45] ─T▶ [3D STD right, 120 + 45° R100 + 60] ─▶ C3 Flood Door
  ─▶ [4A+H4 HELIX 8.5×62° right: 150 approach (walled slot) + 300° spiral R52 (red ≥ 0.8 on φ150–300) + 20]
        R4 Pump ring on the spiral at φ 120
        main: helix end ─▶ E2 (16×12, wall bearing 344°) ─▶ [R4m BROAD left, lead 16: 60 + −135° R100 + 155 + 60° R90 + 80]
              ─T(15,−5,−11)▶ R4 at the merge
        early line: over the ridge at φ≈225 ─▶ E1 (9×11, bearing 267°) ─▶ R4's lead-in (the same far ramp)
  ─[R4 STD right, lead-in 456 (the early line's), + 60] ─▶ C4 Pump Exit
  ─T▶ [5A STD left, 30 − 135° R70 + 30] ─R5 Bypass─ gap▶ [5B MID left scoop 50 down 12 / 45 up 6]
  ─diagonal window W5 (9×7, red bars top and sides) in the flight─▶ [5D SHORT right, −25° R40: 20 m contact]
  ─long opposing catch T(26,−7,+12)▶ [5E STD left, lead 12, 40 − 60° R110 + 40] ─R6 Culvert─
  ─T▶ [5F STD right, 175° R100 + 150 (the wide U-turn)] ─▶ portal P5 (12×12, heading 270°, turn +90°)
  ▶ [6S STD left, lead 12, 50 (settle)] ─▶ C5 Bypass Gate ─T▶ [6A STD right, 90° R80 + 220] ─R7 Outfall─
  ─T▶ [6B STD left, 10 − 180° R60 + 20 + climb 60 m / 10 m] ─rising T6(36,−8,+6) across the hall▶
  [6C WIDE left, depth 0.3, 190] ─▶ F (finish gate, landing 30 ahead 10 down)
```

## 4. Numeric parameters

Face shapes: MID 12 × 60°, STD 14 × 58°, BROAD 16 × 56°, WIDE 18 × 55°, SHORT 9 × 65°, HELIX
8.5 × 62° (slant 9.6 m). Racing depth 0.35 (3C 0.55 under the lintel, 6C 0.3). Every ramp has
a 5 m lead-in unless noted (12–16 m where catches arrive from long or fast flights).

| #       | shape | side  | legs (flat m, drop m)                                                             | length | tightest turn (rider R, ω at the steady bot's speed) |
| ------- | ----- | ----- | --------------------------------------------------------------------------------- | ------ | ---------------------------------------------------- |
| 1A      | MID   | right | 200, 14 · −50° R75, 8 · 40, 3                                                     | 310    | R77 outside, ≈ 27°/s                                 |
| 1B      | MID   | left  | 45° R90, 6 · 30, 2                                                                | 106    | ≈ 23°/s                                              |
| 1D      | MID   | right | 135° R85, 12 · 70, 4                                                              | 275    | R83 banked, ≈ 25°/s                                  |
| 1E      | MID   | left  | −40° R120, 6 · 60, 3                                                              | 149    | ≈ 17°/s                                              |
| 2A      | MID   | right | 25, 2 · 110° R80, 9 · 45, 3 (red 0.78)                                            | 229    | R78 banked, ≈ 27°/s                                  |
| 2B      | MID   | left  | 15, 1 · −80° R100, 7 · 25, 2 (red 0.78)                                           | 185    | ≈ 21°/s                                              |
| 2C      | MID   | right | 55° R50, 6 · 18, 1 (red 0.78)                                                     | 71     | R48 banked, ≈ 43°/s                                  |
| 2D      | MID   | left  | −55° R50, 6 (red) · 20, 1 · 30, −3 (climb)                                        | 103    | R48 banked, ≈ 43°/s                                  |
| 2E      | STD   | right | 100, 4 · 30° R150, 4 · 40, 2                                                      | 224    | —                                                    |
| 2E-low  | WIDE  | right | 100, 3 · 30° R150, 3 · 60, 2 (salvage, `alt`)                                     | 244    | —                                                    |
| 2F      | STD   | left  | 30° R160, 4 · 50, 3                                                               | 139    | —                                                    |
| 3A      | STD   | right | 20, 1 · 160° R65, −12 · 20, −2 (climbs 13)                                        | 227    | R62 banked, 22–35 m/s: ≈ 30°/s                       |
| 3C      | MID   | left  | 50, 3 · −20° R120, 2 · 30, 2 (depth 0.55)                                         | 127    | —                                                    |
| 3D      | STD   | right | 120, 7 · 45° R100, 5 · 60, 3                                                      | 264    | —                                                    |
| 4A + H4 | HELIX | right | 150, 2 · 150° R52, 5 · 80° R52, 3 · 70° R52, 2 (red 0.8 on the last 150°) · 20, 1 | 447    | R50.4 banked, 37 m/s: ≈ 42°/s                        |
| R4m     | BROAD | left  | lead 16 · 60, 2 · −135° R100, 3 · 155, 1 (solved) · 60° R90, 3 · 80, 2            | 640    | ≈ 22°/s                                              |
| R4      | STD   | right | lead-in 456 (drops 20) · 60, 3                                                    | 516    | —                                                    |
| 5A      | STD   | left  | 30, 2 · −135° R70, 4 · 30, 2                                                      | 230    | R67 banked, ≈ 33°/s                                  |
| 5B      | MID   | left  | lead 10 · 50, 12 · 45, −6 (scoop)                                                 | 105    | —                                                    |
| 5D      | SHORT | right | lead 3 · −25° R40, 1 (short contact)                                              | 20     | R41 outside, ≈ 50°/s for ≈ 0.5 s                     |
| 5E      | STD   | left  | lead 12 · 40, 2 · −60° R110, 3 · 40, 2                                            | 207    | —                                                    |
| 5F      | STD   | right | 175° R100, 7 · 150, 4                                                             | 460    | ≈ 20°/s                                              |
| 6S      | STD   | left  | lead 12 · 50, 3 (settle after the portal)                                         | 62     | —                                                    |
| 6A      | STD   | right | 90° R80, 5 · 220, 5                                                               | 351    | ≈ 27°/s                                              |
| 6B      | STD   | left  | 10, 1 · −180° R60, 9 · 20, 2 · 60, −10 (climb)                                    | 283    | R57 banked, ≈ 37°/s                                  |
| 6C      | WIDE  | left  | 190, 8 (depth 0.3)                                                                | 195    | —                                                    |

Every main-line turn stays under the Intermediate 90°/s comfort limit; the tightest are S2
(≈ 43°/s), the spiral (≈ 42°/s) and the 5D short contact (≈ 50°/s for half a second).

**Windows**: W1 (Act 1, hole 16 × 9, wall 26 × 22, 8 m into the T2 flight, its bottom 5 m
below the release). W5 (Act 5, hole 9 × 7 with 0.9 m red bars along its top and both sides —
7.2 × 6 clear —, turned 28° to the diagonal flight, 12.5 m into it). L3 (Act 3): a stepped
dark hood over 3C's upper band 45 m along (three steps, each ≤ 1.8 m above the face: riding
above depth 0.4 hits it) and a lintel 3.6 m (2 H) above the face at depth 0.4 over the rest;
the racing line passes at depth 0.55 with 5.4 m clear.

**Bhop phrase** (Act 3): `bhopPads` P1 0, P2 15.5, P3 16 (turn +25°), P4 16.4, P5 16.8 (turn
−30°, 6 × 9), P6 17.2 (6 × 9), all level, 3 m below 3A's lip; floodgate teeth (3 × 14 × 5, painted
steel, solid, not red) ±7.5 m either side of the gaps P2→P3, P3→P4, P4→P5; a red sluice basin
(44 × 110 m) 24 m below the pads.

**Pump hall**: wall r 70 (2 m thick, solid, flat pieces ≤ 12°, top 9 m below the spiral's top
so the approach comes in over it), openings E2 (main: hole 16 × 12 in a 26 × 16 panel facing
bearing 344°, centred on the main exit's flight) and E1 (early: 9 × 11 in a 19 × 15 panel at
bearing 267°, 17.5 m below the spiral's ridge at φ 225, on the tangent from there). Column r 14
(solid), cyan bands every 12 m, crown 13 m above the spiral's top. The approach slot: dark walls
5 m outside the ridge and 5 m beyond the face's foot along the approach's last 56 m.

**Portal P5**: opening 12 × 12, facing west (270°), 12 m past a 10 m / −6 m move off 5F's end;
turn +90°: `v_out = rotY(+90°) · v_in`, |v| and vertical speed kept, violet (#9A86D8); exit
(−4, 333, 432) computed so that Act 6's climb release lands 46 m south and 40 m east of the column
(the rising transfer then crosses the hall's south chord). No offset, no glyph (the only portal).

**Red zones**: S1 and S2 strips from depth 0.78 (2A, 2B, 2C, 2D's arc); the spiral's strip from
depth 0.8 over its last 150°; the sluice basin under the pads; W5's three bars.

## 5. Checkpoints, anchors and restore states

Every gate and anchor restores the same way: standing in its restart bay, velocity 0, frozen
0.5 s, then the bay's launch pad throws you onto `to` in `flightSec`. Defaults: 26 m back,
10 m toward the landing ramp's ridge, 12 m up, 1.2 s.

|     | name         | trigger (bottom middle, heading, size) | bay (feet)                                      | lands on (`to`)              | flight | clean run passes at | bay → next gate |
| --- | ------------ | -------------------------------------- | ----------------------------------------------- | ---------------------------- | ------ | ------------------- | --------------- |
| R1  | Pier         | [244, 409, −316] 40° 14×12             | [252, 422, −296]                                | [261, 410, −322] 1B          | 1.2    | 14.0 s              | 18.6 s          |
| C1  | Intake Seal  | [351, 357, −33] 180° 22×16             | [370, 372, −45]                                 | [360, 360, −19] 2A           | 1.2    | 30.1 s              | 32.3 s          |
| R2  | Switch       | [56, 323, 113] 210°                    | [79, 336, 112]                                  | [57, 324, 130] 2C            | 1.2    | 41.6 s              | 21.5 s          |
| C2  | Switch Merge | [−366, 274, 415] 270° 24×18            | [−354, 283, 403] (face side, up 5)              | [−380, 278, 415] 3A          | 0.9    | 58.5 s              | 26.2 s          |
| R3  | Teeth        | [−398, 285, 286] 70°                   | [−404, 292, 299] (back 20, up 4)                | [−388, 288, 283] P1          | 0.8    | 65.3 s              | 18.1 s          |
| C3  | Flood Door   | [29, 249, 70] 90° 22×16                | [33, 264, 54] (back 10, side −16)               | [43, 252, 70] approach       | 1.2    | 82.6 s              | 39.5 s          |
| R4  | Pump         | ring round the spiral at φ 120, 16×11  | [257, 252, 106] (outside the ridge, up 5)       | [243, 247, 130] spiral φ 100 | 0.9    | 89.7 s              | 27.2 s          |
| C4  | Pump Exit    | [−252, 187, −253] 315° 24×18           | [−230, 203, −258]                               | [−255, 191, −269] 5A         | 1.2    | 114.2 s             | 38.2 s          |
| R5  | Bypass       | [−391, 175, −210] 180°                 | [−379, 182, −225] (back 30, face side 12, up 6) | [−391, 176, −195] 5B         | 1.0    | 121.7 s             | 34.4 s          |
| R6  | Culvert      | [−231, 146, 66] 95°                    | default                                         | 5F                           | 1.2    | 131.8 s             | 18.9 s          |
| C5  | Bypass Gate  | [−4, 315, 362] 0° 24×18                | [−23, 331, 374]                                 | [−13, 319, 348] 6A           | 1.2    | 149.3 s             | 28.1 s          |
| R7  | Outfall      | [288, 301, 271] 90°                    | [277, 314, 290]                                 | [303, 302, 280] 6B           | 1.2    | 160.9 s             | 18.7 s          |
| F   | finish       | [−2, 272, 160] 270° 24×20              | landing [−32, 272, 160]                         |                              |        | 175.8 s             |                 |

"bay → next gate" = `time-tracks --sections`: the steady bot from the bay, frozen time not
counted, to the next gate — every one finishes its section, and every one is slower than riding
on from the same point (the surf-map test checks it). Recovery gaps on a clean run: 14, 16, 12,
17, 7, 17, 7, 25, 7, 10, 18, 12, 15 s — every stretch ≤ 25 s (the Intermediate cadence). The
brief's "R before the helix exit decision" is R4 (φ 120, the decision is at φ 200–235) and "R
before the short-contact phrase" is R5 (before the scoop, W5 and 5D).

Bays with a quicker launch (spec §5): C2 0.9 s (3A's 13 m climb still leaves the pads' speed),
Teeth 0.8 s onto P1, Pump 0.9 s onto the spiral (≈ 29 m/s, slower than the clean ≈ 36), Bypass
1.0 s onto the scoop. A launch that must drop more than ≈ 10 t² − 1 m starts downward and lands
back on its own bay, so these use `up` 4–6 instead of 12; a bay on the ridge side needs its
flight to clear the ridge, so the low ones sit on the face side (and clear of the ramp the rider
arrives from). R7 (Outfall) keeps the default 1.2 s: 6B's U-turn gets the bot back to strafe
speed before the climb.

## 6. Forks (RaceDef.forks)

| name                 | kind             | line                                                                                                                                                                      | ridden (steady) | racing line | saved     |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------- | --------- |
| Early spiral release | faster           | climb to the ridge over φ 195–225, go over it at φ≈225 (the banked face lifts you over), fly the tangent ≈ 47 m through E1, land on R4's lead-in and ride it to the merge | 13.6 s          | 21.5 s      | **7.9 s** |
| Lower catch (2E-low) | salvage (slower) | a weak release off 2D's climb falls onto 2E-low (24 m below 2E); ride it; its launch (2.6 s) throws you onto 2F at s 80                                                   | 12.4 s          | 11.3 s      | −1.1 s    |

How the early line works: R4 is one ramp whose racing line (the main line's) boards 456 m along
it; its first 456 m are a straight lead-in lying exactly on the tangent off the spiral's ridge at
φ 225 (the main sweep's straight is solved in the source so it does). The main line leaves the
spiral at its end (φ 300), through E2, onto R4m, whose sweep (round the north of the hall and
back) is what the early line skips; R4m's last 80 m run alongside R4 and T4m crosses onto it.
Both lines are on R4 before C4.

Measured release window (steady bot riding the fork, `ftrace`, entry speed at φ 195):

| release φ at depth ≤ 0.1 | 205 | 215 | 220 | 225 | 230 | 235 | 245 |
| ------------------------ | --- | --- | --- | --- | --- | --- | --- |
| 31 / 36 / 40 m/s         | ✗✗✗ | ✗✗✗ | ✓✓✓ | ✗✗✓ | ✗✓✓ | ✗✓✗ | ✓✗✗ |

With the fork's own line (climbing over φ 213–225) it passes at every entry speed from 31 to
40 m/s (✗ at 28 and 43). Releasing before φ 215 always hits the wall. It is a prepared
trajectory — where you leave and how you are moving decide it — but **not** a band-only
skill: the bot also gets through when it starts climbing from depth 0.35–0.6 inside the window
(strafing lifts you over a banked ridge). The spec's critical test 1 ("only from the ridge
band") is therefore not met as worded; the timing window and the 9 m slot are what gate it.
Critical tests 2–5: the hall wall round E1/E2 is a solid 2 m wall with no ledge; the main exit
flies from E2 onto R4m, heading away from R4's lead-in (not tried: forcing a way from E2 onto the
lead-in); a failed early release hits the wall or falls outside it, hundreds of metres from C4
(which is on R4 past the merge); manual resets are slower than riding on (the tests); P5 is off
both lines.

**Inside-S1 fork: not built.** The spec's "release from 2A mid-arc, fly ≈ 40 m across the inside
of bend A onto 2B's upper band, skipping ≈ 90 m" does not exist geometrically: with the S1 radii
(80–100 m) a chord from bend A's middle to 2B's start is only 2–4 m shorter than the path, and
2B lies far off bend A's tangent (the tangent passes ≈ 75 m to the side). A short flight across
an S-curve cannot save time when jumps stay under ~45 m; savings need a detour on the main line
(as the spiral exit has). The faster-line target (brief 7–12 s combined) is met by the spiral
exit alone (7.9 s).

## 7. Measured timings (`time-tracks.ts`)

|                           | Act 1 | Act 2 | Act 3 | Act 4 | Act 5 | Act 6 | total            |
| ------------------------- | ----- | ----- | ----- | ----- | ----- | ----- | ---------------- |
| brief target              | 0:25  | 0:30  | 0:30  | 0:35  | 0:35  | 0:25  | 3:00             |
| steady bot (clean run)    | 30.1  | 28.4  | 24.1  | 31.6  | 35.1  | 26.5  | **2:55.83**      |
| human 0.75 (design level) | 30.7  | 29.4  | 25.6  | 32.6  | 37.3  | 31.6  | **3:07.30**      |
| human 0.6 (`--human`)     | 30.9  | 29.8  | 24.3  | 32.3  | 50.8  | 32.6  | 3:20.80 (1 fall) |

Steady bot with the early spiral release: ≈ 2:48 (7.9 s saved). Both the steady and the 0.75
runs finish with 0 respawns; the 0.6 run falls once at the long opposing catch (5D → 5E) and
recovers at R5. Racing line 5949 m, top speed 43.6 m/s; typical speeds 33–40 m/s, the pads 18–24.
Par 3:00. Budget (`check.ts`): 6818 boxes, ≈ 158 k triangles (target ≤ ~180 k; B01 ≈ 147 k),
0 overlaps, 0 validation problems. It was 308 k: every scenery block (hall wall, column, piers,
towers, teeth, lintel, slot walls) is now `lowDetail` (one flat quad per face; the column still
reads as the landmark in screenshots), and the auto floors are tighter (`pad` 40 → 25 m: their
mist puffs were ≈ 53 k with the glow under them). The biggest items left are the ramps
(≈ 93 k) and the floor puffs (≈ 28 k). Tests:
`surf-maps.test.ts` 12/12 and `surf-seams.test.ts` pass for this map.

## 8. Brief and spec requirements

Met: a descending entry onto a right-facing ramp that bends left round a (solid) support pier;
an opposing curved face; a broad window (W1); a final curve into C1. Two linked S-curves of
different radii (S1 110°/−80° at R 80–100 with a 45 m transition; S2 ±55° at R 50 with an 18 m
transition: the earlier reversal) over a low red strip; an elevated catch (2E) after a climbing
release, with a slower lower line (2E-low) for underpowered entries. A climbing banked U-turn,
six bhop pads in three angled pairs between floodgate teeth, a short ramp under a head-height
opening (L3), a broad descending face. A walled approach to a 300° spiral round the pump column,
an early release through a high narrow opening and the main line through a wider lower one,
both catching the same far ramp and merging before C4; R before the exit decision. A vertical
scoop, a diagonal window with red top/sides, a short heading-correcting contact, a longer
opposing catch, a portal that turns the line 90° keeping speed (R before the short contact).
Two faster sweeping curves, a final rising transfer across the pump hall beside the column onto a
forgiving WIDE receiver, the finish gate. C1–C5 with the brief's names; 7 anchors; restore
states; red hatching distinct from the concrete; seamless curves; palette, fog and landmark.

Approximated:

- **Layout** differs from the spec's sketch (its coordinates reached z −800, outside the
  network range): the whole route was re-laid in the ±470 m square. Act 3's U-turn, Act 5
  and Act 6 were re-turned (mirrored or re-ordered bends) to fit; Act 5 ends heading west and
  Act 6 starts north so the portal still turns +90°.
- **Act 4 geometry**: E1 at bearing 267° / E2 at 344° as specified, but R4m is a much longer
  sweep than the spec's 230 m (the spec's R4m could not reach R4: the two exits diverge by 75°);
  the early line lands on R4's lead-in at ≈ s 20 instead of the spec's "s 0–35 then R4's first
  150 m" (the lead-in is 456 m long). E1 is 9 × 11 and E2 16 × 12 (spec 6.4 × 5.4 to start):
  sized from traced flights at 31–40 m/s; shrink after human tests.
- **No strut** beside the early flight (spec: "air-strafe right past the strut"): the early line
  is a straight tangent flight; the timing window is the difficulty.
- **Pads** are not "angled pairs" in the strict sense: a +25° turn before P3 and −30° before P5;
  teeth flank three gaps (6 teeth).
- **C5** is on a short settle ramp right after the portal exit (not "on 6A's first straight"), so
  the gate is on its own stable stretch with a transfer after it.
- **6B** is a left U-turn (−180°) and a climb, not "−20° then a straight": it keeps Act 6 inside
  the map while adding the brief's second sweeping curve.
- **Restart bays** feed launch pads, not authored setup ramps (same as B01); "R4A before the
  approach" is C3's bay.
- Acts 1 and 5 run long (30 s, 35 s) and Act 3 short (24 s) against the brief's budget; the
  total is inside 165–195 s.

Not built / missing: the inside-S1 faster line (§6, geometrically impossible as specified);
rain, pump bass and water sound (no map audio hooks); city neon through overhead slots (the
neon is on distant towers only); reflections along the ramps (flat shading); spray mist below
y 150 only in the hall (the auto floors' dark mist is under every stretch instead).

## 9. Untested assumptions

- Nobody has played it. "Human" numbers are a bot with 0.75 / 0.6 strafe efficiency.
- The 90°/s turn-rate comfort limit (S2 ≈ 43°/s, spiral ≈ 42°/s, 5D ≈ 50°/s are the tightest).
- The early release: the bot needs to leave between φ ≈ 215° and 235°; how readable E1 is from
  φ 150–200 was only checked in still screenshots (it is visible as a cyan-rimmed dark slot in
  the wall behind the spiral's ridge light); whether humans find and can repeat the release.
- The long opposing catch 5D → 5E (26 m, −7, +12) is where the 0.6 bot falls: the hardest
  single catch on the map.
- The bhop section without hold-to-bhop at 18–24 m/s (Intermediate manual timing).
- Online feel of the 0.5 s short contact 5D (prediction / rollback).
- Readability checked in still screenshots only (start, Act 1 ramps, pads and teeth, the
  approach slot, the spiral with its red strip and the E1/E2 openings, W5, the portal, the hall
  crossing, the finish): edges and red zones read clearly; the dark-mist floors are busy from
  high up; the piers under the upper channels form a dense forest in some directions.
