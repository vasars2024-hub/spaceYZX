# B01 — Copper Reef (as built)

Beginner surf • MOVEMENT_PROFILE v1 • map id `surf-copper-reef` •
source `packages/shared/src/level/maps/surf-copper-reef.ts` • brief §9 B01.
The pilot map: it is built, tested and timed. The pen sequence in the source is authoritative;
the numbers below are copied from it and from the tools (`tools/race/*`). Conventions and
formulas: [README.md](README.md#conventions-used-in-every-spec).

## 1. Identity

|            |                                                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme      | an abandoned coastal waterworks: copper spillways on limestone piers over a turquoise inlet, a lighthouse on its rock in the middle                                                                 |
| Core skill | following curves and choosing contact height                                                                                                                                                        |
| Palette    | copper #A96C45 (six shades, one per act), turquoise #287F82 (bhop pads, trim), limestone #DED8C9 (piers, bays, towers), deep water #102F3C, hazard red #E8242C with black hatching (red strip only) |
| Landmark   | the lighthouse (striped tower, lamp room, a static beam) inside the Act 4 coil, visible from most of the route                                                                                      |
| Scenery    | sea plane at y 2 (`water`, never collides), limestone piers every ~70 m under the ramps with warm lamps, an intake tower in Act 1, a solid support column in Act 2, 14 scattered rock islands       |
| Fog / sky  | fog 180–820 m, teal sky, low warm sun                                                                                                                                                               |

## 2. Route sketch

Top-down, north up, drawn by `npx tsx tools/race/sketch.ts surf-copper-reef` (SVG:
[B01-copper-reef.svg](B01-copper-reef.svg), `--svg`). Line characters are the racing line's
height in tens of metres (0–9, then a = 100 m, b = 110 m …); `1`–`5` gates, `R` anchors, `b` restart bays, `x` the red strip,
`O`/`o` portal in/out, `S` start, `F` finish.

```
                   zSzzzzzzzzzzzzzzzzzzzzzzzzzzzzyyyyyyyyyyyyyyyyyyy::
                                                                 ::yyyyyy::
                                                                       :yyyyy:                                    b
                                       :::::::: :: ::Riiiiiiiiiiihiiiiiiiiiiiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj:o
                               ::iiiiiiiiiiiiiiiiiiii::b:::::::::::::::::::::::yyy:b: ::: ::: ::: :: ::: ::: ::::
                           ::hhhhi::                                            :yR:xx
                        :hhhh:                                                     ::xx:
                     ::hhh:                                                          ::xw:
                   :hhh:                                                               ::ww:
                  hhh                                                                    :www:
                :hh:                   :eeeefffff:                                         :ww:
               hhh                   :eee::   ::fff:                                        :ww:
              hh:                   :ee:         ::ff                                        :ww:
             hh:                   :e:             :f:                                        :ww:
            :h:                    :d:             :g:                                         :ww
           :h:                    : :              :g:                                          :w:
          :hh                     :d:             :gg                                           ::w
        :jjhjjR::: :: ::: ::: :: ::d:::: ::    ::ggg                                             :w:
     :jjjj:h:b :iiiiiiiiiiiiiiiiiiidihhhhhhRhhhggg:                                              :w:
    jjj:  hh                      :d:   b  :::                                                  b:w:  F :
   jj:    h:                      :d:                                                            :1:  8 :
  jj:     h:                      :d:                                                            v:   8 :
 :j:      h:                      :d:                                                            v:   8 :
 :j:      g:                      :c:                                                            v:   8 :
 :j:      g:                     ::c:                                                            v:   8 :
 :j:    b g:                     :c                                                              v:   8 :
 :j:      5:                     :c                                                              v:   8 :
 :j:     f:                      :c                                                              vv   8 :
 :k:     f:                      :c                                                              :u:  9 :
 :k:     f:                      :c                                                               uu  9 :
 :k:     f:                      :c                                                               :u: b :
 :k:     f:                      :c b                                                              :R:::9
 :3:     ff:                     :4                                                                  :ta9
b k      :f:                      :b                                                                  :at
  k       ff:                     :b                                                                 ::at:
 l        :f:                     :b                                                                 :a::t:
           :f:                    :b                                                                :aa  :t:
 :R         ff::                  :b                                                               :aa    tt:
b:m          :fe:                 :R                                                             ::aa     :t:
 :m:           eee:                O                                                            :aa:       tt
 :m:            :eee:                                                                        ::aaa          tt
  mm              :eee::                                                                  :::aaa             tt
  :mm                eeeee::                                                          :::aaaa:               :tt
   :m:                  :eeeeee:::::b::dddddddddcccccccccccccccccccc:::: ::: :::::::baaaaa:                   :ss b
    :m:                     ::eeeeeeeeR:: :: ::: ::: ::: :: ::: ::: :bbbbbbbbbbbbbbbb::                         s:
    ::mm                                                                                                        :Rss
      :mm:                                                                                                        :ss
       :mmm                                                                                                        :s:
         :mmm:                                                                                                      :r:
           :mmmm                                                                                                    :r:
             ::mmmm                                                                                                 :rr
                 :mmmm                                                                                               :r
                   ::mmmn:                                                                                          :rr
                       :nnnn:                                                                                       :r:
                          ::n                                                                                      :rr
                              n                                                                                   ::r:
                                n                                                                                ::r:
                                  n  :                                                                          :rr:
                                     ooo:                                                                     :rrr:
                                      :ooo::                                                               ::rrr:
                                         :oooo::                                                       :::rrrr:
                                            :ooooooooo:::: ::: :: ::: :2pppppppppppppppqqqqqqqq::::qqqqqqr::
                                                   :::ooooooooooooooooo :b::: :: ::: ::: ::: :::qqq:::
x -463..415 (→ east), z -457..479 (↓ south), 7.3 m per column
```

Acts 1–3 run clockwise round the outer ring (north side east, east side south, south side
west); Act 4 comes up the west side and east along the middle into the lighthouse coil (centre
x −142, z −228), leaving it southward; the lens portal (`O`) throws you to the north-east
(`o`, [360, 196, −390]), and Acts 5–6 run west along the north side, down the west side, east
across the south-middle and north to the finish on the east side.

## 3. Phrase graph

```
S ─drop 6─▶ [1a BROAD left, 240 straight + 45° R260] ─R1 Intake Gap─ gap(14,−6,−9)
  ▶ [1b WIDE right, 40 + 45° R260] ─▶ C1 Intake Arch
  ─gap─▶ [2a STD left, 60 + −25° R200] ─R2 Splitter─ gap ▶ [2b STD right 95] ─gap▶ [2c STD left 95]
  ─R3 Twin Sluice─ gap ▶ [2d BROAD right, 20 + 115° R160 (banked)] ─gap past the column▶
  [2e WIDE left 160 (receiver)] ─▶ C2 Splitter Bridge
  ─gap─▶ [3a STD right, 100 + 45° R200] ─drop 7▶ 4 bhop pads (L-R-L) ─▶ [3b BROAD left, 100 + 57° R210]
        └ walkway fork (salvage): walk beside the pads ▶ launch ▶ boards 3b at s 24
  ─R4 Service Walk─▶ 3 bhop pads stepping down ─▶ C3 Service Arch
  ─gap─▶ [4a STD right, 120 + 90° R90] ─R5 Coil Stair─ gap ▶ [4b STD left 190] ─R6 Lamp Room─ gap
  ▶ [4c helix 16 m × 60° left, −270° at R64, 32 m down, red strip from depth 0.74 in the middle 100°]
  ─gap(22,−6,6)▶ [4d WIDE right 120] ─gap▶ [4e STD left 100] ─▶ C4 Lighthouse Window
  ─gap─▶ [5a STD right 70] ─R7 Lens─ air portal (18 ahead, 16×16, turn +90°)
  ▶ [5b WIDE left, lead 12, 250 settle + 80 down 9 + 80 up 6 (scoop)] ─R8 Scoop─
  ─raised gap(12,+1,−9)▶ [5c STD right, 60 + −90° R240 + 80] ─▶ C5 Lens Outfall
        └ salvage fork: a weak departure falls 16 m onto [5s BROAD right 70] ▶ launch 2.2 s ▶ 5c at s 140
  ─gap─▶ [6a BROAD left, 40 + −90° R210] ─R9 Outfall─ gap ▶ [6b BROAD right 200]
  ─gap▶ [6c WIDE left, 60 + −90° R200] ─gap▶ [6d WIDE right 150] ─▶ F (landing 34 ahead, 12 down)
```

## 4. Numeric parameters

Face shapes: BROAD 16 m × 56°, WIDE 18 m × 55°, STD 14 m × 58°, helix 16 m × 60° (all inside
the profile's 55–70° build range). Racing depth 0.35 of the face everywhere (pen default).
Every ramp starts with a 5 m lead-in (12 m on the post-portal ramp) at its first leg's slope.
Ordinary transfers are `move(14–16, −5…−6, ±9)`; the Act 1 anchor gap is `move(14, −6, −9)`.

| #     | ramp (pen)                          | shape    | side           | legs (flat m, drop m)                                  | length   | fastest turn at V (57.3 v/R) |
| ----- | ----------------------------------- | -------- | -------------- | ------------------------------------------------------ | -------- | ---------------------------- |
| 1a    | start `move(12,−6)`                 | BROAD    | left           | 240, 8 · 45° R260, 8                                   | 449      | 7°/s                         |
| 1b    | `move(14,−6,−9)`                    | WIDE     | right          | 40, 2 · 45° R260, 8                                    | 249      | 7°/s                         |
| 2a    | `move(14,−5,9)`                     | STD      | left           | 60, 3 · −25° R200, 5                                   | 152      | 9°/s                         |
| 2b/2c | `move(14,−5,∓9)`                    | STD      | right/left     | 95, 3                                                  | 100 each | —                            |
| 2d    | `move(10,−5,−9)`                    | BROAD    | right (banked) | 20, 1 · 115° R160, 14                                  | 346      | 11°/s                        |
| 2e    | `move(16,−5,9)`                     | WIDE     | left           | 160, 6                                                 | 165      | —                            |
| 3a    | `move(14,−5,−9)`                    | STD      | right          | 100, 4 · 45° R200, 5                                   | 262      | 9°/s                         |
| 3b    | `move(16,−2,3)` off the last pad    | BROAD    | left           | 100, 4 · 57° R210, 7                                   | 314      | 8°/s                         |
| 4a    | `move(14,−6)`                       | STD      | right          | 120, 4 · 90° R90, 6                                    | 266      | 20°/s                        |
| 4b    | `move(14,−5,9)`                     | STD      | left           | 190, 6                                                 | 195      | —                            |
| 4c    | helix `move(10,−5,9)`               | 16 × 60° | left (banked)  | −90° R64, 10 · −100° R64, 12 (red 0.74) · −80° R64, 10 | 307      | 28°/s                        |
| 4d    | `move(22,−6,6)`                     | WIDE     | right          | 120, 5                                                 | 125      | —                            |
| 4e    | `move(14,−5,9)`                     | STD      | left           | 100, 4                                                 | 105      | —                            |
| 5a    | `move(14,−5,−9)`                    | STD      | right          | 70, 3                                                  | 75       | —                            |
| 5b    | portal exit, `move(14,−4)`, lead 12 | WIDE     | left           | 250, 3 · 80, 9 · 80, −6 (scoop)                        | 422      | —                            |
| 5c    | `move(12,+1,−9)` raised             | STD      | right          | 60, 3 · −90° R240, 12 · 80, 3                          | 522      | 7°/s                         |
| 5s    | salvage (alt) `move(12,−16)`        | BROAD    | right          | 70, 4                                                  | 75       | —                            |
| 6a    | `move(14,−6,9)`                     | BROAD    | left           | 40, 3 · −90° R210, 16                                  | 375      | 8°/s                         |
| 6b    | `move(10,−6,−9)`                    | BROAD    | right          | 200, 10                                                | 205      | —                            |
| 6c    | `move(16,−6,9)`                     | WIDE     | left           | 60, 4 · −90° R200, 14                                  | 379      | 9°/s                         |
| 6d    | `move(16,−6,−9)`                    | WIDE     | right          | 150, 12                                                | 155      | —                            |

Every turn is far under the Beginner 60°/s comfort limit (the helix is the tightest, ~28°/s
at 31 m/s on a 64 m ridge radius; the rider radius is a little smaller on its banked face).

**Bhop phrase 1** (`move(26,−7,−3)`, pads 9 × 12, first pad 10 × 20): centre spacing 20 / 18 /
18 m, turns −14° / +24° / −22° (left-right-left), all level; the last hop boards 3b
`move(16,−2,3)`. **Bhop phrase 2** (`move(24,−8,−4)`): 20 m (turn +12°, 1.5 m down), 19 m
(turn −12°, 2 m down); stepping down, because a jump's apex is only 1.2 m.

**Red zone**: one strip on the helix's middle 100° from face depth 0.74 to the foot (kill
slivers 2 cm above the face). Touch → back to the latest anchor (Lamp Room).

**Portal (Lens)**: opening 16 × 16 m, 18 m past the end of 5a, facing south (180°); exit
[360, 196, −390] (feet), `turn` +90°: `v_out = rotY(+90°) · v_in`, |v| kept (vertical speed too),
view turned the same way; you come out heading west onto 5b, which starts 12 m before the exit
landing. The disc shows a live render of the exit view (client `render/portal-preview.ts`).
It keeps the default fixed exit (no `offset`: the exit is only 2 m before 5b starts, so a kept
offset of up to 7 m could put you inside the ramp) and keeps vertical speed (`vertical`
'keep'); no glyph (it is the map's only portal).

## 5. Checkpoints, anchors and restore states

Every gate and anchor restores the same way: standing in its restart bay (a plain 7 × 9 m
limestone platform with a back wall and a glyph), velocity 0, facing the launch direction,
frozen 0.5 s, then the bay's launch pad throws you onto `to` (a point on the next ramp's
racing line) in 1.2 s (≈ 23 m/s arrival, mostly along the ramp). Bays sit 26 m back, 10 m
toward the landing ramp's ridge and 12 m above `to` (pen `BayOpts` defaults) unless noted.

|     | name              | trigger (centre bottom, heading, size) | bay                                  | facing | lands on                                        | from the bay to the next gate |
| --- | ----------------- | -------------------------------------- | ------------------------------------ | ------ | ----------------------------------------------- | ----------------------------- |
| R1  | Intake Gap        | [141, 331, −360] 135° 16×14            | [146, 344, −382]                     | 156°   | [157, 332, −357] (1b)                           | 10.1 s                        |
| C1  | Intake Arch       | [261, 311, −142] 180° 24×18            | [242, 327, −154]                     | 159°   | [252, 315, −128] (2a)                           | 29.9 s                        |
| R2  | Splitter          | [272, 298, 19] 155°                    | [284, 312, 0]                        | 176°   | [286, 300, 28] (2b)                             | 25.0 s                        |
| R3  | Twin Sluice       | [365, 280, 220] 155°                   | [376, 294, 197]                      | 176°   | [378, 282, 225] (2d)                            | 18.0 s                        |
| C2  | Splitter Bridge   | [63, 245, 456] 270° 24×18              | [75, 261, 475]                       | 291°   | [49, 249, 465] (3a)                             | 27.5 s                        |
| R4  | Service Walk      | [−446, 211, 108] 0°                    | [−460, 222, 116] (`back: 32`)        | 17°    | [−450, 210, 84] (pad phrase 2)                  | 4.3 s                         |
| C3  | Service Arch      | [−446, 200, 35] 0° 22×16               | [−456, 214, 47]                      | 21°    | [−446, 202, 21] (4a)                            | 32.0 s                        |
| R5  | Coil Stair        | [−355, 183, −185] 90°                  | [−367, 197, −166]                    | 69°    | [−341, 185, −176] (4b)                          | 24.1 s                        |
| R6  | Lamp Room         | [−147, 170, −176] 90°                  | [−163, 184, −157]                    | 69°    | [−137, 172, −167] (helix)                       | 17.2 s                        |
| C4  | Lighthouse Window | [−213, 109, 33] 180° 24×18             | [−194, 125, 21]                      | 201°   | [−204, 113, 47] (5a)                            | 34.0 s                        |
| R7  | Lens              | [−204, 101, 121] 180°                  | [−214, 105, 109] (before the portal) | 162°   | the Lens portal's opening [−204, 108, 139] → 5b | 32.3 s                        |
| R8  | Scoop             | [−68, 178, −390] 270°                  | [−54, 198, −371]                     | 291°   | [−80, 186, −381] (5c)                           | 18.2 s                        |
| C5  | Lens Outfall      | [−384, 157, −52] 180° 24×18            | [−403, 172, −64]                     | 159°   | [−393, 160, −38] (6a)                           | 34.3 s                        |
| R9  | Outfall           | [−183, 132, 208] 90°                   | [−199, 145, 189]                     | 111°   | [−173, 133, 199] (6b)                           | 24.6 s                        |
| F   | finish            | [290, 69, −161] 0° 24×20               | landing [290, 67, −195]              |        |                                                 |                               |

Anchors are 16 × 14 glow rings (no collision), 4 m past the end of a ramp; gates are brass
arches with a C-number label, 6 m past a ramp. R7 is the anchor before the portal: its bay
(30 m back, 3 m below the opening's middle) throws you through the portal again in 1.2 s
(`Pen.airPortal` places bays waiting at a portal that way), so you come out at ≈ 25 m/s and
land on the settling ramp at ≈ 27 m/s. The surf-map tests check that every restore reaches
the next gate, that none is faster than riding on, and that a recovery just before a portal
restarts you before it.

## 6. Forks (RaceDef.forks)

| name               | kind             | line                                                                                                                              | ridden | racing line |
| ------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- |
| Service walkway    | salvage (slower) | walk 10 m left of the pads, 2.5 m lower (3 m wide paths); a launch pad at its end boards 3b 24 m along, depth 0.35 (1.1 s flight) | 7.7 s  | 4.7 s       |
| Lower salvage ramp | salvage (slower) | a weak departure from the scoop falls onto 5s (16 m below); a launch past its end throws you 2.2 s up onto 5c 140 m along         | 7.1 s  | 6.2 s       |

The brief's critical test (walkway users still get enough approach to board the next ramp)
holds: the walkway's launch puts them on 3b's racing line (1.1 s flight) and the bot rides on
from there (`time-tracks --forks`).

## 7. Measured timings (`time-tracks.ts`)

|                        | Act 1 | Act 2 | Act 3 | Act 4 | Act 5 | Act 6 | total       |
| ---------------------- | ----- | ----- | ----- | ----- | ----- | ----- | ----------- |
| brief target           | 0:25  | 0:30  | 0:30  | 0:35  | 0:35  | 0:25  | 3:00        |
| steady bot (clean run) | 26.6  | 26.5  | 24.5  | 31.9  | 30.9  | 29.1  | **2:49.40** |
| human 0.6 (`--human`)  | 28.2  | 27.6  | 25.2  | 40.3  | 31.4  | 29.5  | **3:02.15** |

Both finish with 0 respawns; racing line 5740 m, top speed 43 m/s. Par 3:00. Budget
(`check.ts`): 2178 boxes, ≈ 147 k triangles, 0 overlaps, 0 validation problems.

## 8. Brief requirements

Met: broad left-facing first ramp round an intake tower; a small gap to an opposing, lower,
wider catch; left bend + setup + right bend with a visible support column and a wide
receiver; four staggered left-right-left pads over a basin with a slower walkway beside
them, the last pad boarding a broad face; a second pad phrase varying elevation; a 270°
descending helix round the lighthouse with a red strip low in its middle; two offset
receivers; a 90° speed-keeping portal with a destination preview, a generous settling ramp,
a shallow scoop, a modest elevated transfer with a lower salvage ramp; two sweeping curves,
an opposing transfer and a generous finish; C1–C5 names; R anchors in Acts 2–5 and before
the portal; restore states; seamless curves; red hatching distinct from copper.

Approximated:

- the portal frame is the standard portal ring (no brass lens model);
- the helix has no tower walls, so there is no "large side opening": you leave from its end
  and the receivers are visible the whole way round;
- restart bays feed a launch pad, not a short entry ramp;
- the lighthouse beam is static; no audio (surf, pipes, buoy bells) was added;
- "corrosion strongest off the contact path" is only a darker copper shade per act.

Not built: the **faster lines** (the inside channel in Act 2, the higher early helix exit in
Act 4; target 5–9 s). An inside channel past the column could not be fitted without the two
channels crossing or catching each other; the early exit needs a second receiver above 4d.
Both are the first things to add.

## 9. Untested assumptions

- Nobody has played it. The human numbers are a bot with 0.6 strafe efficiency; Act 4 is
  8 s slower for it (where it loses time there was not traced) — the real human helix time
  is the biggest unknown.
- Beginners' manual bhop timing (no hold-to-bhop) on 18–20 m pad spacing.
- The 60°/s turn-rate comfort limit; the 23 m/s bay launch as a comfortable re-entry.
- The portal preview's readability at speed; the 16 m opening being easy to hit from 5a.
- Readability checked only in still screenshots (start, C1, pads, helix red strip, portal,
  finish): ramps, pads and the red strip read clearly; the pier forest is busy in some
  directions.
