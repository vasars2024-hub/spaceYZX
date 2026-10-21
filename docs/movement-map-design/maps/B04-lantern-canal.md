# B04 — Lantern Canal (as built)

Beginner surf • MOVEMENT_PROFILE v1 • map id `surf-lantern-canal` •
source `packages/shared/src/level/maps/surf-lantern-canal.ts` • brief §9 B04.
Built, tested and timed. The pen sequence in the source is authoritative; the numbers below
come from it and from the tools (`tools/race/*`). The first build spec (written before the
foundation closed its gaps) is in git history (`c03b4d0`); §8 lists where the build departs
from it and why. Conventions and formulas: [README.md](README.md#conventions-used-in-every-spec).

## 1. Identity

|            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme      | a compact canal town at dusk, built as a bowl: the outer quay ring is the highest terrace, the canals step down inward through lock steps to the festival square, where a great paper lantern hangs over the finish                                                                                                                                                                                                                                                                                                                                      |
| Core skill | reading bends and portal exits: bank-to-bank transfers across the canals, two turning doors that realign you                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Palette    | midnight indigo #242F52 (sky, fog, water #2A3760, canal stone #2E3450), weathered timber #725545 (six shades, one per act: the banks), soft teal #518C91 → a brighter #7FE0DA on every usable ridge, anchors, bays, bank-route lamps and Door A (#62B8BC), paper white #F4EEDC (Door B only), lantern amber #F2B85E (lanterns, windows, gate lanterns: never on a usable edge), hazard red #E8242C with black hatching (red zones only)                                                                                                                  |
| Landmark   | the paper festival lantern: a 24 m octagonal paper lantern (glowing tiers) hung from a timber cross frame on four masts over the finish gate in the festival square, the lowest point of the route; seen across the bowl from the outer quay and the upper town                                                                                                                                                                                                                                                                                          |
| Scenery    | shallow canals (78 stretches) under every bank; timber houses with lit windows on stone terraces (placed where they clear the route by 14 m); the high stone Quay Bridge with parapet lanterns over the north-west corner; covered dock roofs and a solid tie beam in Act 2; a moored ferry inside the first stones' curve; a footbridge over 3B; the court fountain; a round teal moon gate round Door A; a pointed white ogee door, balcony and corner house for Door B; the open arcade into the festival square; valley water under the town (y 150) |
| Fog / sky  | fog #242F52 150–700 m, night-blue sky with stars, a low amber sun on the horizon (dusk)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 2. Route sketch

Top-down, north up, drawn by `npx tsx tools/race/sketch.ts surf-lantern-canal` (SVG:
[B04-lantern-canal.svg](B04-lantern-canal.svg), `--svg`). Line characters are the racing line's
height in tens of metres (0–9, then a = 100 m … z = 350 m); `1`–`5` gates, `R` anchors, `b`
restart bays, `x` red zones, `O`/`o` portal in/out, `S` start, `F` finish.

```
                              :::zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzR:: ::: ::: ::: :::: ::: :::::
                          :zzzzzzz:: ::: ::: ::: :::: ::: ::: ::: ::::zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz:::
                       :zzzz::                                     b                                :::zzzzz::
                     zzz::                                                                                :zzz::
                   :zz::                                                                                     :zzz:
                  :zz:                                                                                         :zz:
                 :z::                                                                                            zz::
                 zz:                                                                                              zz:
                :z:                                                                                                zz:
                zz                                                                                                 :z:
                z:                                                                                                  zz:
                z:                        :::: ::::  b                  sssssssssssss::                             :z:
                z:                   :qqqqqqqqqqqq:5rrrrrrrrrrrrrrrrrrr::::o::::: ::sssss:                          :z:b
                z:                :pqq:::                                             ::sss:                         1:
                z:              :pp::                                                    :ss:                        :z
                z:             pp::                                                       ::s:                       :z
                z:           :pp:                                                          :ss                       zz
                z:           pp:                                                            :s                      :z:
                z:          :p:                                                           O:ss                      :z
                z:          :p:                                                            :s:                     :zz
                S           :p:b                                                         :R:s                     :zz
                z           :R:                                                          st:                     :zz
                             :o                                                         :s: b                   :yz
                             :o                                                         ss:                    yy:
    :ssssssss:               :o                                                        :s:                 b :yy
  :sss::::::sss:             :o:                                                       ss:                ::yy:
 :ss:        ::s:            :o:                                                      :s:               :yyRy
 ts:          ::s:           ::o:                                                     ss:              yy:
 t:            :s:            :oo:                                                   :s:             :yy:
 :t:          b:R:             ::oo:                                                 ss:            yy:
 :t:            x  x             :ooo:                                              :s:            :x:
 :t:           :r:                ::oooo::                                          :s:           :x:
 ::3:          :r:                   :::oooooooooonnR                               :s:           xx
 b tt           r:                        :::::: :::x nnnnnnmmm:::                  :s:          :x:
   :t           r:                                 b        ::mmmmm::               :s:          xx
   :t           rr                                               :mmm:              :s:          x:
   :u:          :r:                                                 mmm:            :s:          x:
   :u:          :r:                                                  :mm:           :s:          x:
   :u:          :r:                                                    mm:          :s:          x:
    uu           r:                                                    :mm:         :s:          x:
    :u           r:                                                      mm::       :t:          y:
    :u           rq                                                       mm:       :t:          y: bx
    :u:          :q:                                                        F       :t:          Ry:
    :u:          :q:                                                                :t:          :y:
    :u:           qq:                                                               :t:          :y:
     uu            qqq:                                                             :t:          :y:
     :u             :qqq::        b                                                 :t:          :x:
     :u               :qqqqqqqqqqqqqRpppppppppppppp:                                :o:         :xx
      v                    :::: ::::            ::ppppppp:::: ::: ::                           :xx:
      v                                              ::::ppppppooooo4:ooooooooonnnnnnnnR  O  :xxx
       v                                                          b                   b   ::xxx:
        Rvb                                      :vvwwwwwwwwwwwwwwwwwwwwwwwwwwwwww :b:::xxxxx:
         vvv:                                vvvvvv:::::::: ::: ::: ::: :::: ::: : 2xxxxx:
           vvv::                         :wwvv::
             vvvv:::                  wwwww:
               ::vvvvvv: :          Rww:
                      :vv:v  w  w w   b

x -459..457 (→ east), z -422..453 (↓ south), 7.6 m per column
```

A spiral: Act 1 runs up the west quay from the start (S), round the north-west corner and east
along the north quay; 1B turns south at the north-east corner (C1). Act 2 runs down the east
side (C2 at the south-east corner). Act 3 runs west along the south side over the ferry stones
and north up the west side (C3). Act 4 continues north, turns 180° round the court fountain,
crosses the court and runs south, then east along the second ring's south side (C4). Door A
(bottom right `O`) turns you north and lifts you 60 m: Act 5 runs north up the second ring's
east side, round the bend west (Door B, the second `O`, cuts the bend onto the merge ramp) to
C5. Act 6 turns south into the middle of the bowl and finishes under the lantern (F).

## 3. Phrase graph

```
S ─drop 6─▶ [1A BROAD right, 130 + 90° R150 (banked) + 250] ─R1 Bridge Pier─ T1 (11,−3,+9)
  ▶ [1B WIDE left, 200 + 90° R150 (outside) + 20] ─▶ C1 Quay Bridge
  ─(14,−5,−9)▶ [2A STD right, 10 + 40° R220 + 40] ─R2 Beam Bay─ T2b (11,−3,+9) under the tie beam
  ▶ [2B STD left, 20 + −40° R220 + 20 + climb 8 over 60] ─R3 Open Dock─ T2c rising (12,−1,−9) over DS1
  ▶ [2C WIDE right, 30 + 90° R120] ─▶ C2 Dock Gate
  ─(14,−5,+9)▶ [3A STD left, 200 + −30° R150 + climb 10 over 70] ─R4 Ferry Steps─ (20,−5,−3)
  ▶ 4 ferry stones F1–F4 (20 / 20.5 / 21 m, +15° each, 1 m down) ─(16,−2,−3)▶ [3B BROAD right, 40 + 30° R120 + climb 5]
        └ dockside path 1 (salvage): walk beside F1–F4 ▶ launch ▶ 3B at s 26
  ─R5 Ferry Walk─ (18,−4,+3) ▶ 3 stones F5–F7 (19.5 / 20 m, +20° each) ─(16,−2,+3)▶ [3C BROAD left, 220 straight]
        └ dockside path 2 (salvage): walk beside F5–F7 ▶ launch ▶ 3C at s 34
  ─▶ C3 Ferry Arch
  ─(8,−3,−9)▶ [4A WIDE right, 50 + 180° R60 round the fountain + climb 2] ─R6 Pavilion─
  crossing (36,−10.5,+6) over the red basin ▶ [4B BROAD left, 170 + −85° R90 + 50] ─R7 Colonnade─
  ─(10,−3,−9)▶ [4C STD right, S-bend ±25° R150] ─▶ C4 Fountain Exit
  ─(14,−5,+9)▶ [5L STD left, 130 straight over the lock chamber DS2] ─R8 Door A─
  Door A ☾ (18 ahead, 16 × 16, turn −90°, +60 m, level exit) ▶ [5A WIDE right, lead 14, 190 + 15° R300 + 60 + climb 7]
        └ Door B ◆ (optional): strafe left off 5A's lip into the balcony door (−85°, level exit) ▶ 5C's lead-in
  ─R9 Balcony─ (12,−1,+9) ▶ [5B WIDE left, 20 + −105° R90 (banked) + 70] ─(18,−6,−13)▶ [5C WIDE right, lead 50, 140]
  ─▶ C5 Twin-Door Merge
  ─(14,−5,+9)▶ [6A BROAD left, 30 + −90° R130 + 20] ─R10 Lantern Street─ (11,−3,−9)
  ▶ [6B WIDE right, 30 + −90° R120 (outside) + 40] ─R11 Arcade─ T6c (20,−6,+12) over DS3
  ▶ [6C WIDE left, 20 + 60° R110 (outside) + 80, through the arcade] ─▶ F (under the lantern)
```

## 4. Numeric parameters

Face shapes: BROAD 16 m × 56°, WIDE 18 m × 55°, STD 14 m × 58°. Racing depth 0.35 everywhere.
Every ramp has a 5 m lead-in (Door A's settling ramp 14 m, the merge ramp 5C 50 m: Door B lands
on it). Drops are the spec's scaled to ~0.6 (Acts 1, 2, 4–6) and ~0.8 (Act 3) — beginner
speeds (top 36.5 m/s) and a long enough run (§7).

| #   | ramp (pen)                     | shape | side  | legs (flat m, drop m)                      | length |
| --- | ------------------------------ | ----- | ----- | ------------------------------------------ | ------ |
| 1A  | start `move(12,−6)`            | BROAD | right | 130, 3.5 · 90° R150, 6 · 250, 6            | 621    |
| 1B  | `move(11,−3,9)`                | WIDE  | left  | 200, 5 · 90° R150, 6 · 20, 1               | 461    |
| 2A  | `move(14,−5,−9)`               | STD   | right | 10, 0.5 · 40° R220, 5 · 40, 2              | 209    |
| 2B  | `move(11,−3,9)`                | STD   | left  | 20, 0.5 · −40° R220, 5 · 20, 1 · 60, −8    | 259    |
| 2C  | `move(12,−1,−9)` (rising)      | WIDE  | right | 30, 1 · 90° R120, 7                        | 223    |
| 3A  | `move(14,−5,9)`                | STD   | left  | 200, 5.5 · −30° R150, 2.5 · 70, −10        | 354    |
| 3B  | off F4 `move(16,−2,−3)`        | BROAD | right | 40, 2.5 · 30° R120, 2.5 · 40, −5           | 148    |
| 3C  | off F7 `move(16,−2,3)`         | BROAD | left  | 180, 9.5 · 40, 1.5                         | 225    |
| 4A  | `move(8,−3,−9)`                | WIDE  | right | 50, 2 · 180° R60, 8.5 · 15, −2             | 258    |
| 4B  | crossing `move(36,−10.5,6)`    | BROAD | left  | 170, 4 · −85° R90, 5.5 · 50, 1             | 359    |
| 4C  | `move(10,−3,−9)`               | STD   | right | 40, 1 · 25° R150, 3 · −25° R150, 3 · 60, 2 | 236    |
| 5L  | `move(14,−5,9)`                | STD   | left  | 130, 4                                     | 135    |
| 5A  | Door A, `move(14,−5)`, lead 14 | WIDE  | right | 190, 2 · 15° R300, 1 · 60, 3.5 · 60, −7    | 403    |
| 5B  | `move(12,−1,9)`                | WIDE  | left  | 20, 0.5 · −105° R90, 6 · 70, 2             | 260    |
| 5C  | `move(18,−6,−13)`, lead 50     | WIDE  | right | 140, 4                                     | 190    |
| 6A  | `move(14,−5,9)`                | BROAD | left  | 30, 1 · −90° R130, 8.5 · 20, 1             | 259    |
| 6B  | `move(11,−3,−9)`               | WIDE  | right | 30, 1 · −90° R120, 7 · 40, 1               | 263    |
| 6C  | `move(20,−6,12)`               | WIDE  | left  | 20, 1 · 60° R110, 5 · 80, 2.5              | 220    |

The tightest turn is 4A's 180° at R60 (rider radius ≈ 56 m): ≈ 33°/s at 32 m/s, under the
Beginner 60°/s comfort limit; everything else is under 20°/s.

**Stones**: phrase 1 `bhopPads` [9 × 12] (F1 [10 × 20]), 20 / 20.5 / 21 m, +15° per stone, 1 m
down each; phrase 2 [9 × 14] (F5 [10 × 18]), 19.5 / 20 m, +20°, 1 m down (tightened from the
spec's 21.5 / 22: the 0.6-strafe bot fell short at 18.8 m/s).

**Doors** (portals, `PortalEl`): Door A ☾ teal #62B8BC, 16 × 16, 18 m past 5L, faces east, turn
−90° (you come out heading north), exit 60 m higher and 40 m back-left, `vertical: 'zero'` (out
level, no fall carried through); fixed exit point (no offset: a snap is the forgiving choice on a
Beginner map). Door B ◆ paper white, 16 × 16, 32 m past 5A's lip and 12 m left of it, faces
north, turn −85° (≈ 355° in → 270° out), exit 2.5 m over 5C's lead-in at s 14, `vertical:
'zero'`; built in a `branch` (off the racing line) with a fork line through it.

**Red zones** (canal-level boxes 1.3 m tall, cut to their canal stretch): DS1 dock lock under
T2c 8 × 27 m; the fountain's red basin under the court crossing 26 × 14 m; DS2 the lock chamber
under 5L up to Door A 99 × 20 m; DS3 festival sluice under T6c 20 × 26 m.

**Shallow canals**: 78 axis-aligned stretches (`water` with `shallow: true`), one level per
stretch, 1.5 m under the lowest thing standing over it and never above the stretch before it
(lock steps only go down); a stretch is left out where a lower part of the route passes under
it. The floors render as flat quads (`lowDetail`). **Bank routes**: 24 launch pads on the canal
floors (one per bank, two on banks over 260 m), each 14 m out from the bank's foot with a teal
lamp beside it, throwing you back onto the bank 34 m further on in 1.4 s.

## 5. Checkpoints, anchors and restore states

Every gate and anchor restores the same way: standing in its restart bay (7 × 9 m platform, back
wall and glyph), frozen 0.5 s, then its launch pad throws you onto `to` in 1.2 s (≈ 23 m/s).
Bays sit 26 m back, 10 m toward the landing ramp's ridge and 12 m up (pen defaults) except C2
(`flightSec 1.1, up 10`) and R8 Door A (before the portal: its launch throws you through Door A
again). "Clean" = when the steady bot passes it; "bay → gate" = from the bay to the next gate.

|     | name            | trigger centre | clean   | bay → gate |
| --- | --------------- | -------------- | ------- | ---------- |
| R1  | Bridge Pier     | 70, 377, −408  | 24.8 s  | 16.9 s     |
| C1  | Quay Bridge     | 435, 360, −219 | 39.0 s  | 24.5 s     |
| R2  | Beam Bay        | 365, 345, −22  | 45.1 s  | 18.5 s     |
| R3  | Open Dock       | 288, 343, 220  | 53.5 s  | 9.4 s      |
| C2  | Dock Gate       | 175, 332, 378  | 60.7 s  | 33.2 s     |
| R4  | Ferry Steps     | −177, 328, 426 | 71.5 s  | 21.0 s     |
| R5  | Ferry Walk      | −392, 317, 365 | 80.7 s  | 11.7 s     |
| C3  | Ferry Arch      | −430, 296, 71  | 91.8 s  | 29.3 s     |
| R6  | Pavilion        | −332, 284, 24  | 99.8 s  | 21.3 s     |
| R7  | Colonnade       | −180, 261, 308 | 111.0 s | 10.0 s     |
| C4  | Fountain Exit   | 63, 247, 327   | 118.3 s | 33.3 s     |
| R8  | Door A          | 211, 236, 336  | 122.4 s | 28.9 s     |
| R9  | Balcony         | 233, 291, −105 | 134.8 s | 15.9 s     |
| C5  | Twin-Door Merge | −66, 269, −228 | 148.3 s | 25.9 s     |
| R10 | Lantern Street  | −236, 252, −87 | 156.1 s | 18.0 s     |
| R11 | Arcade          | −59, 238, 78   | 164.4 s | 9.3 s      |
| F   | finish          | 124, 221, 223  | 171.4 s | —          |

Cadence (clean run, between recovery points): 24.8 · 14.2 · 6.1 · 8.4 · 7.2 · 10.8 · 9.2 · 11.1
· 8.0 · 11.2 · 7.3 · 4.1 · 12.4 · 13.5 · 7.8 · 8.3 · 7.0 s. Anchors before both portals (R8
before Door A, R9 before Door B's lip) and between the ferry phrases (R5). The surf-map tests
check that every bay reaches the next gate on its own and is never faster than riding on.

## 6. Forks (RaceDef.forks) — `time-tracks --forks`

| name                                                                      | kind             | line                                                                                  | ridden    | racing line              |
| ------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------- | --------- | ------------------------ |
| Door B (balcony door)                                                     | **faster line**  | 5A's upper band, strafe left off the lip through Door B, level out over 5C's lead-in  | 4.6 s     | 10.4 s (**5.8 s saved**) |
| Dockside path (first stones)                                              | salvage (slower) | walk 11 m beside F1–F4, 2.5 m lower; a launch at its end boards 3B at s 26            | 7.8 s     | 5.5 s                    |
| Dockside path (second stones)                                             | salvage (slower) | walk beside F5–F7; a launch boards 3C at s 34                                         | 7.1 s     | 5.2 s                    |
| Quay / Dock water / Court plaza / Bend canal / Festival canal bank routes | salvage          | land in the shallow canal, wade to the lamp, its launch throws you back onto the bank | 5.2–5.6 s | (from the water)         |

Door B is rideable at 28, 31 and 34 m/s (bot). It is **not** upper-band-only: the bot also makes
it from the main band (depth 0.35) — the 16 m opening plus strong air control accept both; see
§8. The tighter court release (spec: 0.8–1.2 s) was built as a fork and measured **slower**
(−0.7 to −1.9 s over four variants): in this layout 4B runs 170 m straight on from the court, so
an earlier release has no corner to cut. It was removed.

## 7. Measured timings (`time-tracks.ts`)

|                        | Act 1 | Act 2 | Act 3 | Act 4 | Act 5 | Act 6 | total       |
| ---------------------- | ----- | ----- | ----- | ----- | ----- | ----- | ----------- |
| brief target           | 0:25  | 0:30  | 0:30  | 0:35  | 0:35  | 0:25  | 3:00        |
| steady bot (clean run) | 39.0  | 21.7  | 31.1  | 26.5  | 30.1  | 23.0  | **2:51.37** |
| human 0.6 (`--human`)  | 40.6  | 22.0  | 36.3  | 27.2  | 31.0  | 23.8  | **3:00.90** |
| with Door B (steady)   |       |       |       |       | ≈ 24  |       | ≈ 2:45.6    |

Both clean runs finish with 0 respawns; racing line 5478 m, top speed 36.5 m/s, par 3:00.
Budget (`check.ts` / `budget.ts`): 3341 boxes (1672 colliders), ≈ 175 k triangles (B01 ≈ 147 k),
0 overlaps, 0 validation problems. Building the course data takes ≈ 0.3 s (it expands itself
twice to fit the canals and the town round the route).

Act 1 is long (39 s vs 25) and Act 2 short (22 s vs 30): the north quay is the one stretch of
the network range long enough for the warm-up, and the east side leaves room for only two bays
before the corner. Moving C1 would change what the acts are; the total is on target.

## 8. Brief and spec requirements

Met: six acts in the brief's order with C1–C5 named as the brief (Quay Bridge, Dock Gate, Ferry
Arch, Fountain Exit, Twin-Door Merge); a curved quay bank under a high bridge, a first transfer
across the canal, a gentle bend; alternating dock banks, one transfer under a (solid) beam with
≥ 9 m head room, a rising transfer out into the open dock over a red lock; four + three ferry
stones curving round a moored ferry, a short bank under a footbridge, dockside paths for a lost
rhythm; a 180° court curve round the fountain on a broad face, a release across the court over
a red basin onto a second curved wall; a paired portal door into a canal pointing a new way
(Door A, turn −90°, +60 m), a settling ramp, an optional second door on an elevated balcony that
cuts a longer bend (Door B, 5.8 s); three broad curves with two transfers (the last the longer
"graceful" one), an open arcade, the finish under a large paper lantern; R anchors before each
portal and between the ferry phrases; red deep sluices reset to R; ordinary canal water is
shallow and non-lethal with slow bank routes; the two doors differ in colour (teal / paper
white), glyph (☾ / ◆, shown over each door and its exit) and frame (a round stepped moon gate /
a pointed ogee arch); warm lanterns off every lip and landing, the cool teal line on every ridge;
the faster line built and measured (5.8 s, brief 5–8); zero overlaps, seam test passes.

New foundation features used (replacing the spec's workarounds): portal in a `branch` + a
`portal: true` fork line (Door B, bot-ridden); per-portal colour and glyph; `vertical: 'zero'`
exits on both doors (no landing like a 9 m drop); shallow canal floors instead of branch
walkways everywhere; anchors before portals restart before them (R8). Hold-to-bhop stays off.

Approximated / changed from the spec:

- **Layout**: the spec's sketch spans 1400 × 1120 m, outside the ±490 m network range. The route
  is refolded as a spiral bowl (acts 4–6 mirrored so they turn inward), heights are the spec's
  drops scaled down (≈ 0.6) and Door A lifts 60 m (spec 86): with the spec's drops the steady bot
  ran 147 s on 5.1 km (under the 165 s minimum); lower drops and ~400 m more of stretch legs give
  171 s and beginner speeds (top 36.5 m/s).
- **Faster line**: Door B only (5.8 s); the tighter court release was measured slower and left
  out (§6). Door B accepts the main band too (not upper-band-only).
- **Shallow canals**: one level per canal stretch (lock steps), so a canal can lie up to ~25 m
  under the upstream end of its bank; bank routes are launch pads in the water (no stairs or
  towpaths), 24 of them, 5 bot-tested as forks (one per zone; the others are the same helper).
- **First stretch**: 24.8 s from the start to R1 (Beginner cadence 10–15 s). A mid-ramp anchor
  ring can't stand on a face without cutting into it; the 1A canal's two bank launches are the
  second chance there.
- **Door frames**: stepped blocks (course blocks turn about the vertical only), not true arcs.
  No door sounds, no festival percussion or water sounds (no per-map audio hooks).
- The town is houses on floating stone terraces (lowDetail islands), not a continuous hillside;
  the canals float over the valley water like B01's spillways.
- 6B and 6C are outside curves (the spec's are banked): the finish had to turn into the middle
  of the bowl, and the face sides alternate.

## 9. Untested assumptions

- Nobody has played it. The human numbers are the 0.6-strafe bot; its Act 3 is 5 s slower
  (stone timing) — real first-tick hop timing on 19.5–21 m stone spacing is the biggest unknown.
- The shallow-canal bank routes: whether players find the teal lamps (or just press R), and
  whether wading 5 m/s to a pad feels like a second chance or a punishment. Bot racers now hold
  R when they wade under their target for 3 s (`bots/racer.ts`).
- Door identification at speed (the brief's critical test): checked only in still screenshots
  (the ☾ / ◆ glyphs, teal ring vs white ogee, the preview disc); no colour-blind filters or
  first-time players yet. Door B is partly hidden by 5A's own climb until ~90 m before the lip.
- The 60°/s turn-rate comfort limit; the 23 m/s bay launch as a comfortable re-entry; the level
  (`vertical: 'zero'`) door exits feeling natural.
- Readability checked in still screenshots (start, quay, dock transfer with DS1, stones, court
  with the fountain and red basin, Door A, Door B, the lantern): ramps, ridges, red zones and
  both doors read; the canal floors are dark and their lock steps show faint edges; the
  floating house terraces look odd from below.
