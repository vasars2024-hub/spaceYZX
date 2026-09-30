# I02 — Basalt Cathedral (as built)

Intermediate surf • MOVEMENT_PROFILE v1 • map id `surf-basalt-cathedral` •
source `packages/shared/src/level/maps/surf-basalt-cathedral.ts` • brief §10 I02.
Built, tested and timed. The pen sequence in the source is authoritative; the numbers below
are copied from it and from the tools (`tools/race/*`). This page replaced the build spec it
was built from (the original spec is in git history: commit c03b4d0); §8 lists where the build
differs from that spec and why, §9 answers its open questions. Conventions and formulas: [README.md](README.md#conventions-used-in-every-spec).

## 1. Identity

|                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme             | a cathedral carved into volcanic stone: polished stone surf bands with a bronze line on every ridge, dark stone supports and arcades, a suspended bronze bell over the nave, pale light falling in long columns, grey kill mist with a warm glow under the route                                                                                                                                                                                                                                                                  |
| Movement identity | _hold your height band as the cathedral narrows it: round the bell, over the stone ridges, out through the high light_                                                                                                                                                                                                                                                                                                                                                                                                            |
| Palette           | basalt #292D33 (fog, sky ground, the dark stone #3D4249 of the supports), ash stone #8E9296 (window walls, gates, choir columns, the tower; the nave arcades a shade darker #5F6368), old bronze #A48B60 (bell, ridge lines #D2B27A, anchors #C9A66B, rose studs, pads), pale light #E5E2D5 (gate and window glow, light shafts), mist #6E706E with an ember glow #8A5234 under it, hazard red #E8242C with black hatching (red zones only)                                                                                       |
| Landmark          | **the suspended bronze bell** on the helix's axis: seven stepped bronze octagons (mouth Ø 31 m, 34 m tall) with a clapper, a headstock ringed by the red bell wheel, and a 4 m rod rising through the helix to y 520; a red bell frame of eight radial beams below it. Circled from above by the helix (Act 2), swept round at crown height in Act 6                                                                                                                                                                              |
| Architecture      | the nave: an inner arcade (18 piers, a cornice ring at y 440) at the nave arch's radius (≈ 103 m: C1 and the great arch W2 are in it) and an outer arcade (24 piers, cornice at y 455) at the clerestory's (≈ 171 m: W1 is in it), piers left out wherever the route passes (the arcades never collide: they stand 12 m clear of the route, and a fall passes through them into the mist); the south buttress tower (Ø 18) that 1B bends round; supports under the ramps; pale see-through light shafts; seven choir column pairs |
| Fog / sky         | fog 150–700 m, dark basalt sky (top #1B1E22, horizon #3A3D42), a warm key light from the east (sun #F2D9A8) for the bell's highlight; the dark nave floor at y 44 far below; the kill mist (§5b) is the only mist; everything of the route is above y 126                                                                                                                                                                                                                                                                         |

## 2. Route sketch

Top-down, north up, drawn by `npx tsx tools/race/sketch.ts surf-basalt-cathedral` (SVG:
[I02-basalt-cathedral.svg](I02-basalt-cathedral.svg), `--svg`). Line characters are the racing
line's height in tens of metres (0–9, then a = 100 m … z = 350 m and above); `1`–`5` gates,
`R` anchors, `b` restart bays, `x` red zones, `O`/`o` portal in/out, `S` start, `F` finish.

```
                                                                                                 O    :eeee:
                                                                                                    cccccc:ddddd:
                                                                                                   :e:      :ee:dd
               ::xxxxxxxxxxxx: b                    ::zzzz:                                         ee:      :e:dd
           :xx:                                            zzz                                             :ddf
         :x:                                                 :z                                             :R b
        :w                                                    z:                                            :g
       :w                                                    z:                                             :g:
       :ww                               b                   :z:                                             :g:
        :ww:                             :w:                   zz                                              gg:
          wv:                            :w:                    zz: :                                            :g:
           :v:         z:                :w:                     z: :                                              gg:
           :v:         :z:               :w:                     z: :                                               g:
          u:            :z               :w:   :ssssssssssssssssssssstttttt:                                        g:
         uu              zz              :wss::                 b R :        :tt:                                   g:
         u:               z:            ssw:         zzzzzzzzzzzz:z:           :t:                                  g:
         uu:              :z            s:w:      zz:x  xxxxxx  xxzz            t:                                  :g
       :t::                zz           s:w:     :z x xxx x xxxx xz:z          u: b                                 :g
     :u::                   z:          s:wv:     zz:x  xxxxxx  xzz:z         uu:                                   :h
  ::tt                       zz         s: :v::     :zzzzzzzzzzz:  :z     uuuu:                                     :h
 :tt                          :zz       s:   :vvv:                :1::v::                                           :h
 :t::                            zzz    r:        ::vvvvvvvvvvvvvvvz                                                :h
   s:                               :zzz                          :z                                                 :4
   s:                                    :zzzz  ::                 :z:                                               :i
  :s:                                             :zzzzz::        :zz:                                               ii
  r::                                                    ::zzzzzz::                                                iii
  :r::::                                                                                               ::::::iiiii:
    rrr::::::::: :                                                                      ::jjjjjjjj:
        :rrrrrqqqqqqq3:ppppppppppppppR:ooo:oon :nnn :mmm: lll:kkkk:kkj :jjjj  j j  j
x -434..468 (→ east), z -473..362 (↓ south), 7.5 m per column (rows abridged)
```

The nave (the bell's axis O ≈ (12, 17)) is in the middle. Act 1 starts west of it and runs
south round the outside to the south buttress tower, then north through the clerestory into
the nave arch (C1, `1`). The helix circles the bell at y 401 → 387 (the `zzz` ring with its red
cornice `x`); Act 2 leaves north through the great arch and turns west along the north aisle
(C2, `2`). Act 3 runs south down the west aisle (`w`…`r`: the two spine-and-window sequences),
Act 4 east along the south aisle (the choir `q`…`j`), Act 5 north up the east
aisle to the rose loop in the north-east corner (`c`…`e`, the portal `O`). The portal lifts you ≈ 210 m
to the north-west of the nave (`o`, y 330); Act 6 runs south (`w`), sweeps round the south of the
bell at r ≈ 125 (`v`… under the helix's ring `z`), out north-east through W6, north past R6, west
along the north of the nave (`s`/`t`) and south down its west side to the finish (`F`).

## 3. Phrase graph

```
S ─drop 8─▶ [1A MID left, 190 + −50° R230 + 30 (banked)] ─R1 Buttress─ T(15,−5,−9)
  ▶ [1B A-frame, right face: 14 + a 30 m climb to the crest ─ crossing ─ left face: a settle
     + −120° R50 round the buttress tower + 20] ─clerestory W1 (18×12) in the flight─▶
  [1C MID right, 60] ─▶ C1 Nave Arch
  ─T(14,−5,+9)▶ [2A + helix TIGHT left: 70 approach + −180° R70 + −180° R70→60 (red ≥ 0.7,
     red cornice over the top band) + 80 exit straight under the first half]
  ─great arch W2 (20×14, R2 Great Arch in it)─▶ [2B MID right, 70 + S ±25° R160]
        └ salvage: a weak release falls onto G2 (WIDE, 22 m lower) ▶ launch 2.0 s ▶ 2B at s 170
  ─T(14,−5,+9)▶ [2C MID left, 10 + −90° R100 + 140 (west along the north aisle)] ─▶ C2 Transept Door
  ─T(14,−5,−9)▶ [3Z MID right, 40 + −90° R100 (outside) + 10: south down the west aisle]
  ─T(14,−5,+9)▶ [3A A-frame, left face: −20° R120 + climb ─ crossing ─ right face: settle + 30° R110]
  ─T(15,−5,+9)▶ [3B MID left scoop, 32 down 5 / 30 up 4] ─tracery W3a (9×7; R3 Tracery past it)─
  ─▶ [3C A-frame, right face: 20° R120 + climb ─ crossing ─ left face: settle + −30° R110]
  ─T(15,−5,−9)▶ [3D MID right scoop] ─tracery W3b (9×7)─▶
  [3E STD left, 15 + −90° R100 (banked) + 40: east] ─▶ C3 Spine Merge
        └ salvage: a weak W3b flight falls onto G3 (WIDE, inside the bend, 20 m lower) ▶ launch 1.4 s ▶ 3E at s 195
  ─T(14,−5,−9)▶ [4A MID right, 80 + 20] ─R4 Choir Stall─
  ─▶ K1…K8: SHORT (9×65°) faces, 16 m each, alternately left/right, red below depth 0.8;
     gaps T(20,−7,±5) between column pairs; K8 climbs 3 m ─T(18,−1,+6)▶
  3 bhop pads (6×9.5; 18.6, 19.0 m, the last turned −15°) ─hop T(25,−2,−4)▶
  [4E MID left, 120 + 15° R150 + −90° R90 (banked) + 40: north] ─▶ C4 Choir Bridge
  ─T(14,−5,−9)▶ [5A STD right, 270 + S ∓35° R160 + 40: the rose stair north] ─R5 Rose Stair─
  ─T(14,−5,+9)▶ [5B MID left: 60 + −90° R40 (P1: facing the rose) + −180° R40 + 10]
        faster line (rose chord): leave 5B over its outer ridge at φ 66–94, fly ≈ 60 m through W5
  ─T(16,−4,+3)▶ [5C MID left, −180° R38 + 10 (under 5B's quarter turn)]
  ─T(16,−4,0)▶ [5D MID right kicker, 10 + 24 climbing 4, under a red ceiling]
  ─▶ rose W5 (22×17, a ring of bronze studs round it) ─▶ portal P5 (24×24, turn −90°, level exit)
  ▶ (y 330) C5 Rose Gallery ─T(12,−6)▶ [6A WIDE left, lead 8, 240 south + −120° R130 round the bell + 20]
  ─low window W6 (16×9)─▶ [6B STD right, 30 + −60° R60 (outside) + 20] ─R6 East Arcade─
  ─T(15,−5,+9)▶ [6C STD left, 20 + −90° R70 + 150 west + −90° R90 + 160 south] ─▶ F (finish)
```

## 4. Numeric parameters

Face shapes: MID 12 × 60°, TIGHT 11 × 63°, SHORT 9 × 65°, STD 14 × 58°, WIDE 18 × 55°, the
A-frames 12 × 60° both sides. Racing depth 0.35 (the helix's second half 0.4, the scoops 0.3,
the short faces 0.25, 6A 0.5). Every ramp has a 5 m lead-in unless noted (12 on the A-frames, 9
on K2–K8, 8 on 6A after the portal). `len` is the ridge's flat length with the lead-in.

| #       | shape   | side       | legs (flat m, drop m)                                                               | len   | turn rate at the steady bot's speed |
| ------- | ------- | ---------- | ----------------------------------------------------------------------------------- | ----- | ----------------------------------- |
| 1A      | MID     | left       | 190, 10 · −50° R230, 16 · 30, 2                                                     | 426   | ≈ 9°/s                              |
| 1B      | A-frame | right→left | 14, 0.7 · climb 30, 1.5 ─ crossing ─ 8 + 12 + 16 settle, 1.8 · −120° R50, 7 · 20, 1 | 217   | R 48 banked, 34 m/s: ≈ 41°/s        |
| 1C      | MID     | right      | 60, 4                                                                               | 65    | —                                   |
| 2A + H  | TIGHT   | left       | 70, 3 · −180° R70, 7 · −180° R70→60, 7 (red 0.7, depth 0.4) · 80, 2                 | 579   | R 68→58, 35 m/s: 29–35°/s           |
| 2B      | MID     | right      | 70, 2 · −25° R160, 3 · 25° R160, 3                                                  | 215   | ≈ 12°/s                             |
| 2C      | MID     | left       | 10, 1 · −90° R100, 6 · 140, 3                                                       | 312   | ≈ 20°/s                             |
| 3Z      | MID     | right      | 40, 2 · −90° R100, 8 (outside) · 10, 1                                              | 212   | ≈ 20°/s                             |
| 3A      | A-frame | left→right | −20° R120, 3 · climb ─ crossing ─ settle · 30° R110, 4                              | 178   | ≈ 18°/s                             |
| 3B / 3D | MID     | left/right | 32, 5 · 30, −4 (scoop), depth 0.3                                                   | 67    | —                                   |
| 3C      | A-frame | right→left | 20° R120, 3 · climb ─ crossing ─ settle · −30° R110, 4                              | 178   | ≈ 18°/s                             |
| 3E      | STD     | left       | 15, 1 · −90° R100, 10 · 40, 3                                                       | 217   | ≈ 22°/s                             |
| 4A      | MID     | right      | 80, 4 · 20, 1                                                                       | 105   | —                                   |
| K1–K8   | SHORT   | alt.       | 16, 1 (K8: 8, 0.5 · 16, −3), red 0.8, depth 0.25                                    | 21–33 | ≈ 0.4 s per contact at 38–42 m/s    |
| 4E      | MID     | left       | 120, 3 · 15° R150, 2 · −90° R90, 5 · 40, 3                                          | 346   | ≈ 21°/s                             |
| 5A      | STD     | right      | 270, 5 · −35° R160, 3 · 35° R160, 3 · 40, 2                                         | 510   | ≈ 13°/s                             |
| 5B      | MID     | left       | 60, 4 · −90° R40, 3 · −180° R40, 5 · 10, 0.5                                        | 263   | R 37.6 banked, 39 m/s: ≈ 59°/s      |
| 5C      | MID     | left       | −180° R38, 5 · 10, 0.5                                                              | 134   | R 35.6 banked, 39 m/s: ≈ 63°/s      |
| 5D      | MID     | right      | 10, 0.5 · 24, −4 (kicker)                                                           | 39    | —                                   |
| 6A      | WIDE    | left       | lead 8 · 240, 3 · −120° R130, 5 · 20, 1 (depth 0.5)                                 | 540   | R 124 banked, 37 m/s: ≈ 17°/s       |
| 6B      | STD     | right      | 30, 1 · −60° R60, 3 (outside) · 20, 1                                               | 118   | ≈ 33°/s                             |
| 6C      | STD     | left       | 20, 1 · −90° R70, 4 · 150, 3 · −90° R90, 4 · 160, 4                                 | 586   | ≈ 30°/s                             |
| G2      | WIDE    | right      | lead 12 · 110, 4 (salvage, `alt`)                                                   | 122   | —                                   |
| G3      | WIDE    | left       | 10, 1 · −90° R80, 4 · 30, 1 (salvage, `alt`)                                        | 171   | —                                   |

Every main-line turn stays under the Intermediate 90°/s comfort limit; the tightest are the
rose loop (5B ≈ 59°/s, 5C ≈ 63°/s) and the A-frame 1B's bend round the tower (≈ 41°/s).

**Turn rates above 35 m/s** (the profile's C(v) stops at 35; measured with the lab's `rideLine`
on the actual shapes, `tools/race/lab.ts`): the lab's C(v) test (a nearly level 180° curve,
keep 90 % of the speed) gives no answer at 40 or 45 m/s for any radius up to 240 m — above the
34 m/s strafe cap a level curve can't hold the speed, so it isn't a curve limit. On the helix
itself (it descends) steady, 0.75 and 0.6 riders entering at 30, 35, 40 and 45 m/s all hold the
face all the way round (end speed 34–47 m/s, worst one-tick loss ≤ 0.11 m/s; ≈ 46°/s at the
R 58 end at 45 m/s). The rose loop (5B) entered at 35, 40, 45 m/s by steady and 0.75 riders:
held, worst tick loss ≤ 0.09 m/s, 55, 63, 71°/s.

**Spine crossings** (1B, 3A, 3C): each A-frame is two curves joined exactly at the crossing
(one ridge line at one grade, 0.05, through a 30 m climb to depth 0.04, the crest, and a settle
over 36 m to 0.3). The racing line goes over the crest diagonally (the first far-face point is
3 m past it). No cap, bevel or trim is near the crest; a bronze lantern hangs 5 m over each
crossing (never solid). Seam test (0.8 / 1.0 / 1.15 V): no tick loses more than 0.5 m/s.

**Windows**: W1 clerestory (hole 18 × 12 in a 34 × 30 wall, 10 m into the T2 flight, its bottom
5 m under the release), W2 great arch (20 × 14 in 44 × 36, 14 m past the helix's end), W3a /
W3b tracery (9 × 7 in 30 × 24), W5 rose (22 × 17 in 46 × 41, 28 bronze studs in a Ø 30 ring on
its near face), W6 choir screen (16 × 9 in 30 × 22). All rectangles (collision); the rose is a
ring of studs round the rectangle.

**Portal P5**: opening 24 × 24 facing west, right behind W5; turn −90° (west → south), speed
kept, `vertical: 'zero'` (both lines come out level), no offset; exit north-west of the nave at
(O.x − 125, 330, O.z − 258), computed so Act 6's sweep is centred on the bell's axis. Pale bronze
(#D8C08E); the only portal (no glyph). The exit is at y 330 (the rose is at y ≈ 125: a ≈ 210 m
lift), so Act 6 runs ≈ 60 m under the helix and its kill mist is close under the helix too.

**Red zones**: the helix's red strip (depth ≥ 0.7) on the second half; the red cornice over it
(24 strips 2.5 × 1 × ≈ 8.5 m, one per 7.5°, 0.3 m over the ridge from 0.5 m behind it to 2 m
over the face, the first three flared +1.5 / +0.9 / +0.4 m, each under a stone overhang slab):
a head reaches it only above depth ≈ 0.12; the bell hoist grid under the helix (12 radial
beams r 20–64 and a ring at r 30, 14 m under the helix's end, just over its kill mist); red strips
(depth ≥ 0.8) on K1–K8; the red ceiling over the kicker 5D (14 × 22, 6 m over the line); the red
bell frame (8 beams 3 × 3 × 36, r 20–56, under the sweep) and the red bell wheel (8 segments at
r 14 round the headstock). The choir's red floor and the crypt grilles of the first build are
gone: the kill mist under the choir and the tracery windows does their job.

## 5. Checkpoints, anchors and restore states

Every gate and anchor restores the same way: standing in its restart bay, velocity 0, frozen
0.5 s, then the bay's launch pad throws you onto `to` in `flightSec`. Defaults: 26 m back,
10 m toward the landing ramp's ridge, 12 m up, 1.2 s.

|     | name          | where (trigger)                              | bay (feet)                                                  | lands on (`to`) | flight | clean run passes at (speed) | bay → next gate |
| --- | ------------- | -------------------------------------------- | ----------------------------------------------------------- | --------------- | ------ | --------------------------- | --------------- |
| R1  | Buttress      | end of 1A, 14 × 12, heading 120              | (−80, 441, 188)                                             | 1B              | 1.2    | 17.6 s (38.1 m/s)           | 11.4 s          |
| C1  | Nave Arch     | (71, 397, 101) 22 × 16, heading 0            | (90, 412, 113)                                              | 2A approach     | 1.2    | 26.1 s (34.3)               | 36.1 s          |
| R2  | Great Arch    | in W2 (65, 377, −73) 18 × 12                 | (49, 382, −79) (back 14, past the arch)                     | 2B              | 1.2    | 43.2 s (34.8)               | 21.4 s          |
| C2  | Transept Door | (−206, 337, −419) 22 × 16, heading 270       | (−194, 352, −400)                                           | 3Z              | 1.2    | 59.4 s (34.0)               | 33.3 s          |
| R3  | Tracery       | 2 m past W3a, 9 × 7                          | (−343, 304, −26) (back 8, side −13, up 2)                   | 3C              | 0.65   | 73.7 s (33.6)               | 20.1 s          |
| C3  | Spine Merge   | (−272, 257, 348) 22 × 16, heading 90         | (−284, 272, 329)                                            | 4A              | 1.2    | 87.6 s (39.8)               | 27.5 s          |
| R4  | Choir Stall   | end of 4A, 14 × 12                           | (−166, 254, 358) (up 5)                                     | K1              | 0.95   | 90.7 s (38.9)               | 28.1 s          |
| C4  | Choir Bridge  | (456, 169, 162) 22 × 16, heading 0           | (437, 184, 174)                                             | 5A              | 1.2    | 111.5 s (35.7)              | 31.8 s          |
| R5  | Rose Stair    | end of 5A, 14 × 12                           | (403, 157, −339) (back 24, side 8, up 5, east of the stair) | 5B              | 0.9    | 126.8 s (35.0)              | 18.4 s          |
| C5  | Rose Gallery  | in the exit flight (−113, 320, −235) 24 × 20 | (−123, 336, −249) (not before the portal: C5 is after it)   | 6A              | 1.2    | 139.8 s (34.9)              | 40.4 s          |
| R6  | East Arcade   | end of 6B, 14 × 12                           | (184, 308, 12)                                              | 6C              | 1.2    | 159.7 s                     | 20.4 s          |
| F   | finish        | end of 6C 24 × 20, heading 180               | landing 30 m on                                             |                 |        | 176.8 s                     |                 |

"bay → next gate" = `time-tracks --sections`: the steady bot from the bay, frozen time not
counted, to the next gate — every one finishes its section, and every one is slower than riding
on from the same point (the surf-map test checks it). Recovery gaps on a clean run: 17.6, 8.5,
17.1, 16.2, 14.3, 13.9, 3.1, 20.8, 15.3, 13.0, 19.9, 17.1 s — every stretch ≤ 25 s. R anchors
precede both ridge sequences (C2 for the first, R3 Tracery for the second) and the high-window
setup (R5 Rose Stair; C4 before it).

Bays with a custom launch: R3 (0.65 s, back 8 / side −13: past the tracery wall, since a bay
behind it would launch into the wall), R4 (0.95 s, up 5: a launch that drops more than ≈ 10 t² − 1
lands back on its own bay), R5 (0.9 s, back 24 / side 8 / up 5: east of the stair's end, clear
of both the stair and the loop, which curls west), R2 (back 14: past the great arch's wall).

**Critical test** (the high window reachable from the checkpoint's entry setup without momentum
from an earlier act): from C4's bay (a 23 m/s launch onto 5A) the bot finishes the C4 → C5
section on the main line in 31.8 s; from R5's bay (≈ 28 m/s onto 5B) in 18.4 s. The rose chord
from the same entry: ridden from 5B's quarter turn at 26–28 m/s it passes W5 for releases at
φ 66–82 (§6), so both lines are reachable from R5's restart. The rose wall is 1 m thick with no
ledge; a fast attempt that drops toward 5D meets the red ceiling over it; P5 is only reachable
through W5 (the portal is right behind the wall).

### 5b. Falls: the kill mist

A fall resets in seconds, not after the long drop to the kill height (y 60): kill mist
(`floors` — kill volumes 25 m deep, drawn as heaps of grey mist with a warm ember glow in the
gaps, never a sheet) lies under every stretch of the way (`autoFloors`: 25 m under each stretch,
reaching 25 m past it sideways), plus hand-placed patches where a fall at speed carries you
further: a disc under the helix (r ≤ 118, ≤ 96 north of the bell where the lower aisle G2 runs,
19 m strips), strips along the map's north edge (under 2C), west edge (by the second scoop) and
east edge (under the rose stair), one south of Act 1, and two either side of the nave under
Act 6's sweep. Nothing you are meant to land on is in any of it (the galleries G2/G3, the bays,
the pads), and nothing of the route lies under a hand-placed patch (`validateCourse` checks it).
Act 6 was lifted (the portal exit at y 330, its sweep at r ≈ 125) so the helix's mist can be close
under the helix.

Measured (every 6th racing-line point, both sides: the rider set 3 m off the line moving 30 m/s
along it and 8 m/s outward, no input, time until the reset): 600 falls, **median 1.9 s, 90 %
2.4 s**, every one ≤ 3.2 s except four off the helix's north side (4.0–4.8 s: the mist there has
to stop short of G2). Before: up to ≈ 8 s.

## 6. Forks (RaceDef.forks)

| name               | kind             | line                                                                                                                                                   | ridden (steady) | racing line | saved     |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ----------- | --------- |
| Rose chord         | faster           | 5B from φ 30, climbing to the top band by φ 70, over the outer ridge at φ ≈ 82, ≈ 60 m straight through W5 and P5, onto 6A                             | 6.0 s           | 12.4 s      | **6.4 s** |
| Lower aisle (G2)   | salvage (slower) | a weak great-arch release lands on G2 (22 m under 2B, to its right); its launch (2.0 s) throws you up onto 2B's second bend (s 170) from its face side | 6.4 s           | 5.6 s       | −0.8 s    |
| Lower gallery (G3) | salvage (slower) | a weak W3b flight lands on G3 inside 3E's bend (20 m lower); its launch (1.4 s) throws you onto 3E's last straight (s 195)                             | 8.2 s           | 5.1 s       | −3.1 s    |

The rose chord skips 5B's remaining 270°, 5C and the kicker 5D (≈ 330 m of ramp and two
flights) for one ≈ 60 m flight. Measured release window (the fork's line with its release point
moved; ✓ = passes W5 and P5 and lands on 6A):

| entry speed at φ 30 \ release φ | 66  | 70  | 74  | 78  | 82  | 86  | 90  | 94  |
| ------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| 26 / 28 m/s                     | ✓   | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗   |
| 30.8 m/s                        | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✗   |
| 34 / 38 / 42 m/s                | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| 46 m/s                          | ✗   | ✓   | ✓   | ✓   | ✓   | ✓   | ✗   | ✓   |

It crosses W5 at feet y 125–138, 2–3 m north of the rose's middle (the main line crosses at
y ≈ 129, 1 m south of it). **Not a band-only skill**: the bot also gets through releasing from
the normal band (depth 0.35) anywhere in φ 66–94 (strafing lifts you over a banked ridge, as I01
found) — the spec's "only ≤ 0.15 passes W5" is not met; what the line asks for is leaving the
loop on purpose at its quarter turn and flying the gap. A smaller or higher rose can't make it
band-gated: releases from the top band and from depth 0.35 cross W5 at the same heights (feet
y 131–138) and the same place (within 1 m), because the banked face lifts a mid-band rider over
the ridge as well; a rose tight enough to split them would also cut the main line (it crosses at
y ≈ 129). Left broad (brief: "high, broad"); the saving stays 6.4 s.

## 7. Measured timings (`time-tracks.ts`)

|                           | Act 1 | Act 2 | Act 3 | Act 4 | Act 5 | Act 6 | total       |
| ------------------------- | ----- | ----- | ----- | ----- | ----- | ----- | ----------- |
| brief target              | 0:25  | 0:30  | 0:30  | 0:35  | 0:35  | 0:25  | 3:00        |
| steady bot (clean run)    | 26.1  | 33.3  | 28.2  | 23.9  | 28.3  | 37.0  | **2:56.82** |
| human 0.75 (design level) | 27.0  | 33.6  | 30.3  | 26.2  | 28.7  | 36.9  | **3:02.53** |
| human 0.6 (`--human`)     | 27.0  | 33.5  | 29.5  | 31.7  | 30.0  | 36.4  | 3:08.02     |

All three finish with 0 respawns. Steady bot with the rose chord: ≈ 2:50.4 (6.4 s saved).
Racing line 6074 m, top speed 44.5 m/s; typical speeds 34–40 m/s (the helix ≈ 34–35, the choir
38–43, the pads 27–31, the loop ≈ 39), par 3:00. Budget (`check.ts`): 8606 boxes, ≈ 179 k
triangles (the ramps ≈ 94 k, the kill mist's heaps and glow ≈ 50 k; every scenery block
`lowDetail`), 0 overlaps, 0 validation problems. Network range: racing line x −415…456,
z −460…349 (< 490), colliding boxes' centres ≤ 476 (< 500), lowest line point y 126 (killY 60).

**Stacking** (`surf-basalt-cathedral.test.ts`, its own check — `findOverlaps` only checks that
wedges don't intersect): the helix's exit straight passes under its first half with the ridges
**13.6 m** apart at the closest (≥ 12 m, and ≥ the README rule max(h, (1 − d)·h + H + 3) = 11.4 m
for the TIGHT face at depth 0.4); every racing-line point has ≥ 4.2 m of head room under anything
solid (the tightest: the tracery window W3a's lintel), red limits apart. Other stacked pairs: the
loop 5B over 5C 15.1 m and over 5D 15.0 m (rule 12.6), G3 under 3E 18.6 m (rule 18), 6C under the
helix's exit 79 m and under G2 58 m.

Tests (with the engine's corrected red-zone contact and its stricter red test): `surf-maps.test.ts` 12/12, `surf-seams.test.ts` and `surf-basalt-cathedral.test.ts` 3/3
pass for this map.

## 8. Brief and spec requirements

Met: a banked curve along the cathedral wall, a crossing to a freestanding double-sided ramp and
its far face round a support (the buttress tower), a second transfer (the clerestory) into the nave
above the floor; a 360° descending helix round the bell's support rod whose first half sets the
line and whose second half narrows the band (red lower edge from depth 0.7, red overhead cornice
above depth ≈ 0.12), release through a large arched opening (the great arch) toward the transept;
two ridge crossings on A-frames each followed by an opposing face, a shallow scoop and a climb
to a tracery window, the second sequence mirrored (offset to the other side); the crest has no
decorative bevel (two curves joined exactly, one grade through it); a row of eight short faces
alternating with aerial gaps between column pairs, a short bhop bridge and an angled entrance
(4E); a substantial setup curve (the rose stair and loop) to a high, broad rose window, the main
line with two more contacts (5C, the kicker 5D) and the faster one-contact line (6.4 s: target
6–10 s), a portal that rotates horizontal travel (−90°) into a descending gallery; the sweep round
the bell on the opposite side from the helix's opening, a generous low window (W6) and a final
curved gallery. C1–C5 with the brief's names; six anchors (R before both ridge sequences and the
high-window setup); restore states; lower galleries (G2, G3) catch weak transfers and add a long
way round; red bell machinery (hoist grid, cornice, frame, wheel) and missed outer windows (the kill
mist) reset. The critical test is met (§5). Palette, fog, kill mist below the route,
the landmark bell, polished bands distinct from the darker structure.

Approximated:

- **Layout** (spec §2): the spec's transept ran to z −1300 and the choir to x 470, far outside
  the network range. The route is refolded clockwise round the nave: Act 2 turns west along the
  north aisle, Act 3 runs south down the west aisle (its spines mirrored: 3A left→right, 3C
  right→left, 3E a banked left turn, a new outside bend 3Z to turn south), Act 4 runs east along
  the south aisle, Act 5 north up the east aisle; the rose loop is the spec's rotated 180° (so the
  portal turns −90° instead of +90° and Act 6 keeps the spec's heading south).
- **Speeds and heights**: the steady bot keeps almost all its speed on descents, so drops are
  roughly halved (the helix 25 → 19 m, 2B 17 → 8, 5A 30 → 13, Act 6's 6A 25 → 8) and the route
  lengthened to 5.96 km (spec 5.4): 1A +80 m, 5A +30 m straight, 6A +110, 6C +130 (and a second
  bend), 4E +100. Result: 34–40 m/s instead of the spec's 30–41, 173 s.
- **Spine crossings**: the spec's single A-frame with an 18 m crossing leg at depth 0.12 cost the
  bot 6–17 m/s (the racing line stepped 2.8 m up the face at once, and the crossing node pair made
  the seam test's rider brake); built as two exactly joined curves with a 30 m climb to depth
  0.04 and a 36 m settle (§4).
- **Choir**: the spec's gaps T(14, −3.5, ±8) are for ≈ 30 m/s; the bot arrives at 38–42 and a
  rider on a 9 m 65° face falls ≈ 7 m per face-and-gap, so the gaps are T(20, −7, ±5) and K2–K8
  have 9 m lead-ins (a low departure lands on the face, not its end). Pads 6 × 9.5 as specified.
- **Rose window**: 22 × 17 (spec 18 × 14), a rectangle ringed by 28 bronze studs (Ø 30), not a
  round collision shape; P5 24 × 24 right behind it. The fast line releases at φ 66–94 (spec
  85–95) and isn't band-gated (§6).
- **Portal**: exits level (`vertical: 'zero'`), so the fast line (falling off P1) and the main
  line (rising off the kicker) come out the same; the spec expected the fast line to exit falling
  29 m/s (its open question 4). C5 is 6 m after the exit, 6A's ridge starts 10 m after it (the
  spec's 30 m lead-in under the exit clipped the gate).
- **Salvage galleries**: G2 is a straight WIDE gallery 22 m under 2B whose launch throws you back
  onto 2B's second bend (the spec's throw onto 2C would come from behind 2C's ridge in the
  refolded layout); G3 lies inside 3E's bend (not outside) so its throw arrives from 3E's face
  side. Both are launch pads (like B01/I01), not climbing ends.
- **Act 6 is lifted**: the portal exit is at y 330 (spec 175; a ≈ 210 m lift) and the sweep
  round the bell is at r 130 (spec R 75), so the helix's kill mist can lie close under the helix
  without Act 6 under it; the bell hangs at the sweep's height (crown ≈ y 320). Act 6 runs 37 s
  (brief 25).
- **Red choir floor and crypt grilles** (spec) were built and then replaced by the kill mist: a
  flat red top could be stood on (an engine bug since fixed), and the mist does the same job
  more cheaply. The hoist grid and the bell frame stay red.
- **Architecture** is arcades of piers and cornice rings, not solid walls (the bell stays in
  view); no transept/choir/apse walls (a pier "forest" along the aisles was built and removed:
  it hid the ramps). Light "columns" are see-through `glass` blocks. The arcade piers don't
  collide (a fall passes through them into the mist); the tower and the choir columns do.
- Acts 2 and 6 run long (33 s vs 30 / 25) and Act 4 short (24 s vs 35): the south aisle is the
  one stretch the refold leaves for the choir; the total is inside 165–195 s.

Not built / missing: sound (reverberation, bell overtones, choral textures, wind, chain creak:
no per-map audio hooks); a bronze trim line along ridges beyond the renderer's ridge glow (the
palette's `surfEdge` is bronze); light columns "crossing the nave above the route" (they are
vertical, blocks turn about the vertical only); polished-band gloss and streaks (flat shading).

## 9. Changes from the spec's open questions

1. Rose collision rectangular — kept (§8); studs, not red blocks, round the hole.
2. Helix stacking verified by the map's own test (13.6 m, §7).
3. A-frame crests at speed: 1–1.3 m/s crossing losses at first; rebuilt (§4, §8) — the seam
   test now passes at 0.8–1.15 V.
4. Portal fixed exit + vertical speed: `vertical: 'zero'`.
5. Red cornice vs solid overhead: red (as the spec chose), each strip under a non-colliding
   stone overhang.
6. Turn rates above 35 m/s: measured on the helix and loop (§4).
7. Pads 6 × 9.5: kept; hold-to-bhop stays off.
8. R1 heading 120: kept (its trigger's bounding box is larger; nothing is near).
9. Custom launches R4 0.95 s, R5 0.9 s: kept (with `up` 5); both slower than carrying on.
10. Galleries: fitted by riding them (§6), not from projectile guesses.
11. Footprint: 0.9 × 0.84 km, ≈ 179 k triangles (with the kill mist).

## 10. Untested assumptions

- Nobody has played it. "Human" numbers are a bot with 0.75 / 0.6 strafe efficiency; both finish
  without a fall, only 5–12 s slower than the steady bot.
- The spine crossing as a human skill: climbing to the crest over 30 m and crossing at 30–40 m/s
  is smooth for the bot; whether players read the bronze lantern as "cross here".
- The helix's narrowing band: the red cornice (a head-height red limit over depth < 0.12) was
  checked in still screenshots only; whether it reads fairly at 35 m/s.
- The choir's eight 0.4 s contacts at 38–42 m/s (the spec designed them for 30); online feel of
  short contacts (prediction / rollback).
- The rose chord is easy for the bot (a broad release window, not band-gated); how hard it is for
  people is unknown.
- Falls reset in ≤ 3.2 s almost everywhere (§5b), measured with one kind of fall (sideways off
  the line at speed); a rider could still land on the buttress tower's cap, the bell, a choir
  column or another act's ramp and have to press R.
- The 90°/s turn-rate comfort limit (the loop ≈ 59–63°/s is the tightest).
- Readability checked in still screenshots only (start, 1A and the tower, the 1B crossing and
  W1 framing the nave, the helix with the red cornice, the great arch with R2 and G2 below, the
  first spine with its lantern, the choir entry, the rose loop with the rose and the red kicker
  ceiling, the kicker, the bell and its red frame from above; after the kill mist: the helix from above,
  the choir from 4A, the nave from above, the bell from Act 6's height): ramps (light polished stone with a
  bronze ridge line) read against the dark fog and the darker arcades, red zones read red, the
  windows frame what follows. The rose is hidden behind the loop's own face for part of the
  quarter turn. The kill mist reads as loose grey heaps with a warm glow between them, not a
  floor; from Act 6 you see the helix's mist heaps overhead.
