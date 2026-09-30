# B02 — Glass Garden (as built)

Beginner surf • MOVEMENT_PROFILE v1 • map id `surf-glass-garden` •
source `packages/shared/src/level/maps/surf-glass-garden.ts` • brief §9 B02.
Built, tested and timed. The pen sequence in the source is authoritative; the numbers below
come from it and from the tools (`tools/race/*`). This page replaces the first build spec (it
was never committed); §8 lists where the build departs from it and why. Conventions and
formulas: [README.md](README.md#conventions-used-in-every-spec).

## 1. Identity

|            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme      | an overgrown glass conservatory: a great tree has outgrown the building that sheltered it and holds the broken roof apart; glazed irrigation troughs spiral clockwise and inward through the halls round it                                                                                                                                                                                                                                                                                                                                                                |
| Core skill | S-curves (changing steering from one bend to the next on one face) and height adjustment (riding the lip to reach a raised catch; not riding so high that you hit a petal window's red top)                                                                                                                                                                                                                                                                                                                                                                                |
| Palette    | fern green #48745A (gate frames, leaf masses, petal walls #2F4A3A), pale glass #C4E2DE (glass, anchor rings, bays' glow, launch pads, caustic lamps), warm ivory #EEE8D9 (ribs, cornices, roof beams, Trunk Bridge, planter tubs, bay tops, a warm ivory **ridge glow** #F6F1E4 on every usable edge), orchid #AA83AA (bhop pad tops, the flower portal and its calyx, orchids), hazard red #E8242C + black hatching (**the petal window borders only**)                                                                                                                   |
| Surfaces   | glazed **celadon** troughs, six shades, one per act (#A7BDA6 #9FB9A8 #9DB8A5 #A9BB9F #A3B3AD #B0BC9E): the spec's own fallback — its warm ivory faces washed out against the gold horizon and the pale mist in screenshots (§8)                                                                                                                                                                                                                                                                                                                                            |
| Landmark   | **the great tree**: a 36 m bark trunk (solid) at the centre of Act 4's half circle, T ≈ (−305, −92), from the conservatory floor (y 150) through the roof to y 520, with eight warm glowing seams, roots over the floor, eight branches above the roof route (y 488–510, out to 190 m) with leaf masses at their tips and a crown; seen over your right shoulder from the start, circled by Act 4, swept round by Act 6                                                                                                                                                    |
| Scenery    | glass walls round the conservatory (15 panes a side, 62 × 300 m, ivory ribs, a cornice at y 470), a broken glass roof on ivory beams (y 470, opened round the tree), the root pool in the Ω (ivory planter rim, dark water, lamps), the glass-walled Trunk Bridge 26 m over C4, the glass flower round the portal (glass petals, an orchid calyx), fern beds (floating ivory planter tubs with broad trees) and orchid beds, two suspended leaf walls in the Petal hall, a thin stream beside each C gate's posts and a pale-glass glow pipe on each lintel, caustic lamps |
| Fog / sky  | fog 220–900 m; sky top #2C5B52, horizon #F0D9A8, ground #22382C, a low west sun [−0.8, 0.22, 0.2] #FFD9A0 4°; the kill floors (`autoFloors`) draw as low garden mist (#CFE3D6) with a warm glow under it; the flooded conservatory floor is a dark water sheet at y 150                                                                                                                                                                                                                                                                                                    |

**Glass is scenery only**: a new scenery material, `block` `mat: 'glass'` (§7), is see-through
and never collides, even when `solid`. Nothing you land on, hit or fly through is glass; every
pane keeps at least 6 m from the racing line (the placement checks it) and none stands between
a lip and its catch. Openings you fly through are opaque-framed (the petal walls, the portal's
orchid frame, the fern gates).

## 2. Route sketch

Top-down, north up, drawn by `npx tsx tools/race/sketch.ts surf-glass-garden` (SVG:
[B02-glass-garden.svg](B02-glass-garden.svg), `--svg`). Line characters are the racing line's
height in tens of metres (0–9, then a = 100 m … z = 350 m, so the upper acts all read `z`); `1`–`5`
gates, `R` anchors, `b` restart bays, `x` red zones (and heights 330–340 m), `O`/`o` portal in/out,
`S` start, `F` finish.

```
                                          Szz:zzzzzzzzzzzzzzzzzz:::
                                             :::: ::: ::: :::::zzzzzzzz:
                                                                    ::zzzzz:
                                                                        ::zR::
                                                                         b :zzzzz::
                                                                              : zzzzzzzzz::::::::zzzzzzzzzzz::
                                                                                    ::::zzzzzzzz         ::zzzzz:
                                                                                                              :zzz:
                                                                                                                :zz:
                                                                                                                  :zz:
                                                                                                                   :zz
                                                                                                                    :z:
                                                                                                                    :z:
                                                                                                                     z:
              ::zzzzzzzzzzzzzzzzzzzzzzzzz:o                                                                          z:
          :zzzzzz:::::::: ::: ::: ::: :::::                                                                          1:b
       :zzzz::wwwwvvvvvvvvv:                                                                                        :z:
     :zzz::wwww::::    :::vvvv:                                                                                     :z:
    :zz:www::               ::vvv                                                                                   :z:
   :zz:ww::                    :vv:                                                                                 :z:
  :z::ww:                       :vv:                                                                                :z
 :z::w::                         ::v:                                                                              :z:
 :z:ww:                           :vv                                                             O               :zz
bzz:w:                             :v                                                             q:            :zzz
 R::w:                             :v                                                             q:          :zzz:
 :z:w:                             :w                                                             q:       ::zzz:
 :z:w:                             :w                                                             q:    ::zzz:
 :z:3:                           b :R                                                             :5: :zzz:
  bzx:                            : :::                                                          b:qzzz:
   zz:                            :v:::                                                          :zqz
   :zz::                          vv:::                                                         :zzq:
   :x:zz::                       :v: ::                                                        :z::q:
   :x: zzz::                   :vv:: ::                                                       :z: :r:
   :x:   :zzzz:::       ::::bvvvv::: :::: ::: ::: ::: ::: :::: :                            b:zz  :r:
   :x:      :zzzzzzzzzzzzzzzzR:zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzF                           z:R   :r:
   :x:            ::uu:::::: :      ::                                                     zz:    :r:
   :x:             uu:              ::                                                    :z:     :r:
   :x:            :u:               ::                                                    zz:     :r:x
   :x:            :u:               ::                                                    z:       :r
   :x:             uu::             ::                                                    z:       :r
   :x:              uuu:::::       ::                                                     zz:      :r
   :x:                :uuuuuuuu::  ::                                                     :z:      :r
   :x:                       ::uuu:::                                                      zz:     :r
   :x:                          :uu::                                                      :z:     :r
   :x:                           :uu:                                                       zz:    :r
   :R:                            :u:                                                       :z:    :r
   bx:                            :u:                                                       :z:    :r
   :y:                            :u:                                                       zz:    :r
    yy:                           :u:                                                      :z:     :R
    :y::                          :u:b                                                    :zz:     :s:
     :y::                         :R:                                                    :zz:      :s:b
      :yy:                         :u                                                   zzz:       :s:
       :yy::                       :u                                                 :zz:         :s:
         :yy::                     bu                                                :R: b         :s:
           :yyy::                  :4:                                              :zz:           :s:
              :yyyyy::              t:                                           ::yz:            :ss
                  :yyyy:y           t::                                        :yyyy             :ss
                          y  yRyby y:tzzzzzyyyyyyyyyyyyyyyyy:           ::::yyyyy:             :sss
                                     ttt::::: :::::: ::::::::2yyyyyyyyyyyyyyy:              ::sss:
                                      :tttt::::: ::: ::: :: ::tbssssssssssssstttxx: :::::ssssss:
                                         ::ttttttttttttttRtttt: ::::::::::::::::xxsssssss:::
                                                       b
x -461..452 (→ east), z -464..470 (↓ south), 7.6 m per column
line digits: height in tens of metres (0-9, then a = 100 m...); : ramps, x red, 1-5 gates, R anchors, b bays, O/o portal in/out
```

The route spirals clockwise and inward. Act 1 runs east along the north side and turns south at
the north-east corner (C1). Act 2 weaves down the east side and ends heading west (C2 at the
south). Act 3 runs west along the south side over the pads, turns north up the west side into
the atrium (C3). Act 4 circles the trunk (the big loop left of middle), drops into the Ω round
the root pool and leaves south under the Trunk Bridge (C4). Act 5 runs east along the south edge
on a lower layer and north up the east-middle (C5). The flower portal (`O`) lifts you 180 m onto
the roof west of the trunk (`o`): Act 6 sweeps round the crown and runs east to the finish (F).

## 3. Phrase graph

```
S ─drop 6─▶ [1A BROAD right, 110 + 25° R170 (banked) + lip climbing 4] ─R1 Planter Lip─ T1a (12,−4,+9)
  ▶ [1B WIDE left, caught deep (0.45): its ridge above 1A's; 30 + −25° R170 + lip climbing 4] ─ T1b (16,−4,−9)
  ▶ [1C BROAD right, caught at 0.5; 30 + 90° R130 (banked corner) + 30] ─▶ C1 Seed Arch
        └ the Seed drainage (shallow) under both raised catches: a launch on each catch's face side
  ─(12,−4,+2)▶ [2A BROAD right, S1: +55° R125 banked · 85 m straight glimpse · −35° R125 outside + 30] ─R2 Fern Bed─
  ─(10,−3,+9)▶ [2B BROAD left, S2: −35° R125 banked · 45 m (shorter) · +55° R125 outside + 30] ─R3 Short Weave─
  ─(10,−3,−9)▶ [2C BROAD right, 20 + 50° R150 + 60] ─▶ C2 Fern Door
  ─(14,−4,+9)▶ [3A STD left, 40 + climb 8 over 80 + climb 5 over 40] ─(22,−6,+2)▶
  P1–P3 orchid pads (16 / 19.3 m, the last 1 m down) ─ +20° ─ R4 Basin (mid-hop) ─ P4–P6 (18.7 / 17.3 m)
        └ Basin perimeter walk (salvage): a rim walk right of the pads, 2.5 m lower ▶ launch ▶ 3B
        └ the service basin (shallow) under the pads: launches up onto the rim walk and onto 3B
  ─(18,−2,−3)▶ [3B BROAD right, 30 + 70° R170] ─R5 Greenhouse Door─ (10,−3,+2)▶ [3C WIDE right, 260 straight] ─▶ C3 Irrigation Frame
  ─(12,−4,+2)▶ [4A BROAD right, 30 + 180° R125 round the trunk + lip climbing 4] ─R6 Trunk Lip─
  drop T4a (30,−9,+10) ▶ [4B WIDE left, the Ω: 10 + 90° R60 + −180° R60 round the root pool + 90° R60 + 30 + lip climbing 4] ─R7 Root Lip─
        └ Root deck (faster): off 4A's lip (24,−9,−14) ▶ [4F deck STD-angle 10 m face, 208 + lip climbing 2 over 40] ▶ (20,−3,+6) ▶ 4B at s 410
  ─ raised catch (12,−1,−9) ▶ [4C WIDE right, 40] ─▶ C4 Trunk Bridge
  ─(12,−4,−2)▶ [5A WIDE left, 10 + −90° R70 (banked) + 90] ─R8 First Petal─ (10,−3,−2)▶
  [5S1 BROAD left scoop: 40 + 70 + climb 6 over 45] ▶ W1 petal window (12 m past the lip) ▶ (26,−7,+2) ▶
  [5B WIDE left, 30 + −90° R110 + 60] ─R9 Second Petal─ (10,−3,−2)▶ [5S2 BROAD left scoop: 30 + 70 + climb 6 over 45] ▶ W2 ▶ (26,−7,−2) ▶
  [5C WIDE left, 30 + 110] ─▶ C5 Flower Gate
  ─(14,−5,−9)▶ [6P STD right, 50] ▶ P6 the glass flower ✿ (18 × 18, turn −90°, +180 m, out level)
  ─(14,−2), lead 12 ▶ [6A WIDE left, 150 settle + −90° R150 round the crown] ─R10 Crown─
  ─(10,−3,−2)▶ [6B WIDE left, −90° R150 + 60] ─R11 Sunset─ short transfer (16,−5,−9) ▶ [6C WIDE right, 240: the wide final catch] ─▶ F
```

## 4. Numeric parameters

Face shapes: BROAD 16 m × 56°, WIDE 18 m × 55°, STD 14 m × 58°. Racing depth 0.35 except the
raised catches (1B 0.45, 1C 0.5). Every ramp has a 5 m lead-in (6A 12 m, after the portal).
**Drops are the spec's × 0.35** (climbs kept as designed): with the spec's drops the steady bot
ran 140 s at 40–50 m/s (§8).

| #   | ramp (pen)                     | shape      | side  | legs (flat m, drop m; − climbs)                                              | length |
| --- | ------------------------------ | ---------- | ----- | ---------------------------------------------------------------------------- | ------ |
| 1A  | start `move(12,−6)`            | BROAD      | right | 110, 1.75 · 25° R170, 3.15 · 45, −4                                          | 234    |
| 1B  | `move(12,−4,9)`, depth 0.45    | WIDE       | left  | 30, 0.35 · −25° R170, 2.45 · 45, −4                                          | 154    |
| 1C  | `move(16,−4,−9)`, depth 0.5    | BROAD      | right | 30, 0.7 · 90° R130, 3.85 · 30, 0.7                                           | 269    |
| 2A  | `move(12,−4,2)`                | BROAD      | right | 30, 0.7 · 55° R125, 3.15 · 85, 1.4 · −35° R125, 2.1 · 30, 0.7                | 346    |
| 2B  | `move(10,−3,9)`                | BROAD      | left  | 20, 0.35 · −35° R125, 2.1 · 45, 0.7 · 55° R125, 3.15 · 30, 0.35              | 296    |
| 2C  | `move(10,−3,−9)`               | BROAD      | right | 20, 0.35 · 50° R150, 2.1 · 60, 1.05                                          | 216    |
| 3A  | `move(14,−4,9)`                | STD        | left  | 40, 0.7 · 80, −8 · 40, −5                                                    | 165    |
| 3B  | off P6 `move(18,−2,−3)`        | BROAD      | right | 30, 0.7 · 70° R170, 3.5                                                      | 243    |
| 3C  | `move(10,−3,2)`                | WIDE       | right | 260, 2.45                                                                    | 265    |
| 4A  | `move(12,−4,2)`                | BROAD      | right | 30, 0.7 · 180° R125, 6.3 · 40, −4                                            | 468    |
| 4B  | T4a `move(30,−9,10)`           | WIDE       | left  | 10, 0.35 · 90° R60, 1.4 · −180° R60, 3.15 · 90° R60, 1.4 · 30, 0.35 · 40, −4 | 462    |
| 4C  | `move(12,−1,−9)`               | WIDE       | right | 40, 0.7                                                                      | 45     |
| 4F  | Root deck (branch)             | 10 m × 58° | right | 208.5, 7.5 · 40, −2 (fitted to its end point)                                | 254    |
| 5A  | `move(12,−4,−2)`               | WIDE       | left  | 10, 0.35 · −90° R70, 2.8 · 90, 1.4                                           | 215    |
| 5S1 | `move(10,−3,−2)`               | BROAD      | left  | 40, 0.7 · 70, 3.5 · 45, −6                                                   | 160    |
| 5B  | `move(26,−7,2)`                | WIDE       | left  | 30, 0.7 · −90° R110, 2.8 · 60, 1.05                                          | 268    |
| 5S2 | `move(10,−3,−2)`               | BROAD      | left  | 30, 0.7 · 70, 2.8 · 45, −6                                                   | 150    |
| 5C  | `move(26,−7,−2)`               | WIDE       | left  | 30, 0.7 · 110, 2.1                                                           | 145    |
| 6P  | `move(14,−5,−9)`               | STD        | right | 50, 1.05                                                                     | 55     |
| 6A  | portal, `move(14,−2)`, lead 12 | WIDE       | left  | 150, 2.1 · −90° R150, 4.2                                                    | 398    |
| 6B  | `move(10,−3,−2)`               | WIDE       | left  | −90° R150, 4.2 · 60, 1.05                                                    | 301    |
| 6C  | `move(16,−5,−9)`               | WIDE       | right | 240, 4.55                                                                    | 245    |

Tightest turns: the Ω's R60 arcs (rider radius ≈ 56–64 m) ≈ 35°/s at 34 m/s, and 5A's R70 ≈
30°/s — under the Beginner 60°/s comfort limit; everything else is under 20°/s.

**Pads** (`bhopPads`, orchid tops [9 × 12], P1 [12 × 20]): 16.0 / 19.3 (−1 m) / 18.7 (−0.5 m) /
17.3 m, the phrase break a +20° turn with the R4 Basin ring in the middle of the P3 → P4 hop.

**Petal windows** W1, W2 (12 m past each scoop's lip, facing the flight): a suspended dark fern
wall (#2F4A3A, solid) 38 × 27 m with a hole 21.2 × 12.6 m from 6 m under the lip line; hatched red
borders 0.6 m thick along the top and the upper 6 m of each side (clear opening 20 × 12 m); the
bottom edge is a plain 1.2 m bar with nothing under it; a thin midrib slit splits the wall above
the top border. Measured at the wall: the steady bot's feet pass 0.7 m over the lip line at W1 and
0.3 m under it at W2 (32 m/s), its head 3.5 / 4.5 m under the red top and 6.7 / 5.7 m over the
bottom bar; the human bot passes within 0.3 m of the same heights.

**Portal P6, the glass flower**: 18 × 18 m, 18 m past 6P, facing north, turn −90° (out heading
west), exit (−137, 440, −239): 180 m higher, fixed exit point, `vertical: 'zero'` (out level),
orchid #AA83AA, glyph ✿. Glass petals and an orchid calyx stand round its frame.

**Shallow drainage** (`water` `shallow: true`): the **Seed drainage** under 1A's lip, 1B and 1C's
start, 291 × 91 m, surface y 374.8 (1.5 m under the lowest ramp over it), with a launch on each
raised catch's face side 14 m out from its foot (→ 1B at s 59, → 1C at s 54; 1.5 s); the
**service basin** under the pads, 116 × 76 m, surface y 331.2 (it stops at x −208, short of the
first pads, so no slab hangs over C4 and Act 5 far below), with two launches up onto the rim walk
(1.2 s) and one on 3B's face side (→ 3B, 1.6 s). Each launch has a caustic lamp beside it.

**Red zones**: W1 and W2's borders only (6 blocks).

## 5. Checkpoints, anchors and restore states

Every gate and anchor restores the same way: standing in its restart bay (7 × 9 m platform, back
wall), frozen 0.5 s, then its launch pad throws you onto `to` in 1.2 s (≈ 23 m/s). Bays sit 26 m
back, 10 m toward the landing ramp's ridge and 12 m up (pen defaults) except: C1 and C3 16 m to
the far side (in-line landings), R8, R9 and R10 16 m to the right (in-line landings), C2 24 m to
the left and 4 m up with a **0.85 s** launch (≈ 30 m/s: enough to climb 3A to the pads), R4 Basin
22 m back, 4 m up, 0.9 s (onto P4). "Clean" = when the steady bot passes it; "bay → gate" = from
the bay to the next gate (the test adds the 0.5 s freeze and checks it is never faster than
carrying on).

|     | name             | trigger centre | clean   | bay → gate |
| --- | ---------------- | -------------- | ------- | ---------- |
| R1  | Planter Lip      | 117, 393, −413 | 13.4 s  | 16.9 s     |
| C1  | Seed Arch        | 437, 379, −221 | 30.4 s  | 30.1 s     |
| R2  | Fern Bed         | 255, 365, 63   | 40.8 s  | 19.3 s     |
| R3  | Short Weave      | 198, 354, 346  | 50.4 s  | 9.7 s      |
| C2  | Fern Door        | 8, 345, 428    | 57.8 s  | 30.4 s     |
| R4  | Basin            | −232, 348, 414 | 66.2 s  | 20.9 s     |
| R5  | Greenhouse Door  | −430, 338, 226 | 78.5 s  | 11.5 s     |
| C3  | Irrigation Frame | −428, 330, −50 | 87.0 s  | 33.0 s     |
| R6  | Trunk Lip        | −184, 321, −48 | 100.5 s | 19.0 s     |
| R7  | Root Lip         | −193, 308, 307 | 115.0 s | 3.7 s      |
| C4  | Trunk Bridge     | −184, 304, 365 | 117.0 s | 32.4 s     |
| R8  | First Petal      | −22, 294, 452  | 123.2 s | 26.2 s     |
| R9  | Second Petal     | 305, 279, 281  | 136.2 s | 12.8 s     |
| C5  | Flower Gate      | 300, 267, −46  | 145.8 s | 33.7 s     |
| R10 | Crown            | −446, 430, −89 | 159.9 s | 19.4 s     |
| R11 | Sunset           | −235, 420, 66  | 168.5 s | 11.1 s     |
| F   | finish           | 29, 408, 57    | 176.5 s | —          |

Cadence between recovery points (clean run): 13.4 · 17.0 · 10.4 · 9.6 · 7.4 · 8.4 · 12.3 · 8.5 ·
13.5 · 14.5 · 2.0 · 6.2 · 13.0 · 9.6 · 14.1 · 8.6 · 8.0 s. Anchors sit before both petal windows
(R8, R9), between the pad phrases (R4) and between every paired phrase. C5 is 2 s before the
portal (no extra anchor needed).

## 6. Forks (RaceDef.forks) — `time-tracks --forks`

| name                                | kind             | line                                                                                                                                                                | ridden | racing line              |
| ----------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------ |
| Root deck                           | **faster line**  | off 4A's lip strafe left (24, −9, −14) onto the deck along the Ω's neck, off its climbing lip right (20, −3, +6) onto 4B's last straight at s 410; still crosses C4 | 11.3 s | 15.4 s (**4.2 s saved**) |
| Seed drainage (first raised catch)  | salvage (slower) | missed catch 1 → wade in the shallow drainage → launch onto 1B                                                                                                      | 5.7 s  | 4.1 s                    |
| Seed drainage (second raised catch) | salvage (slower) | missed catch 2 → wade → launch onto 1C                                                                                                                              | 5.6 s  | 4.0 s                    |
| Basin launch                        | salvage (slower) | missed hop → wade to the lamp north of the pads → launch onto the rim walk → walk → launch onto 3B                                                                  | 8.9 s  | 7.2 s                    |
| Basin perimeter walk                | salvage (slower) | walk the rim beside the pads (2.5 m lower, 10 m to the right) → launch onto 3B                                                                                      | 9.7 s  | 7.9 s                    |

The fork times start from the fork's first point (the salvage ones standing in the water or on
the walk), so the fall before them is not counted.

## 7. Measured timings, budget, engine changes

|                        | Act 1 | Act 2 | Act 3 | Act 4  | Act 5 | Act 6 | total       |
| ---------------------- | ----- | ----- | ----- | ------ | ----- | ----- | ----------- |
| brief target           | 0:25  | 0:30  | 0:30  | 0:35   | 0:35  | 0:25  | 3:00        |
| steady bot (clean run) | 30.4  | 27.4  | 29.2  | 30.0   | 28.8  | 30.7  | **2:56.52** |
| human 0.6 (`--human`)  | 37.0  | 29.0  | 28.0  | 29.2   | 29.3  | 30.4  | **3:02.78** |
| with the Root deck     |       |       |       | ≈ 25.8 |       |       | ≈ 2:52.3    |

Both clean runs finish with 0 respawns; racing line 5505 m, top speed 36.5 m/s (steady) /
37.6 m/s (human), par 3:00. The steady run is 11.5 s over the 165 s floor. Budget (`check.ts` /
`budget.ts`): 6380 boxes (1849 colliders), **≈ 154 k triangles** (B01 ≈ 147 k; the garden mist
floors ≈ 48 k of it, ramps ≈ 80 k), 0 overlaps, 0 validation problems. Building the course takes
two extra expansions (to fit the drainage and the garden round the route).

**Engine changes** (backwards compatible, both approved; `level/course/types.ts`, `expand.ts`,
tested by `packages/shared/test/course-glass.test.ts`): a scenery `block` may be
`mat: 'glass'` — it expands to the see-through `skyglass` box (the existing 13 % tint, no depth
write) with its edges drawn (`trim`), and it **never collides**, even when `solid`; and a
scenery `block` may be `lowDetail: true` (one quad per face: the tree, ribs, beams, planters).
No client change (the client already draws `skyglass` with edges). No protocol change here.

## 8. Brief and spec requirements

Met: six acts in the brief's order, C1–C5 named as the brief (Seed Arch, Fern Door, Irrigation
Frame, Trunk Bridge, Flower Gate); a shallow descent into a broad curve round a planter, two
raised opposing catches from upward (climbing) lips in opposite directions, a lower trough (the
shallow Seed drainage) that catches missed catches and reconnects before the first arch; two
S-curves between fern beds, the second with the shorter transition (85 → 45 m); six irregularly
spaced pads in two three-hop phrases with a +20° turn between them over a shallow service
basin, the last hop boarding a curved ramp into the next hall, a walkable perimeter as the slower
salvage; a half circle round the trunk, a drop one level down into a second arc (the Ω) whose lip
climbs before a raised catch; two scoops into suspended leaf walls with wide openings (20 m)
whose thin hatched red borders constrain excessive height, a forgiving setup before them and an
anchor before each; a portal in a glass flower (level exit, upright), a long settle, a sweeping
curve round the crown, a short transfer, a wide final catch under the opened roof; the faster
line built and measured (4.2 s, brief 3–5, it crosses C4); the tree built from blocks; glass
never collides and never sits within 6 m of the line; red only on the window borders; drainage
as slower returns, other falls to the nearest phrase's anchor; zero overlaps, the seam test
passes; hold-to-bhop off.

Approximated / changed from the spec:

- **Heights and speed.** The level is capped at y 480 (`boundsMax`), so the whole map sits 80 m
  lower than the spec and the portal lifts 180 m (spec 318). The spec's drops ran the steady bot
  at 140 s and 40–50 m/s: every drop is × 0.35 (climbs kept), giving 176.5 s at ≈ 34 m/s. Layers
  are closer than the spec's ≥ 60 m in places: Act 5 runs ≈ 50–60 m under Acts 2–3.
- **Surf colour**: celadon, not ivory (the spec's fallback; ivory washed out). The ridge glow is
  warm ivory (fern green did not read on celadon).
- **Lips**: no shallower racing depth on the lips (a depth step up the face cost the bot 13 m/s);
  the raised catches are made by the catch depth (1B 0.45, 1C 0.5) and the climbing lips.
- **Root deck**: lands 9 m below 4A's lip, level with the Ω (the spec's +7 m deck would have had to
  climb, since the scaled Ω hardly drops), on a low 10 m face; its merge is a short near-parallel
  flight (a 22 m sideways flight lost 24 m/s on landing).
- **Petal windows**: rectangles (course blocks turn about the vertical only), built from solid wall
  blocks + `red` blocks (not the `window` element: its glow rim sits against the red and its line
  node pulls the bot to the hole's bottom). The spec's separate lower faces 5L1 / 5L2 are the
  catch's own lower band: nothing hangs under the wall's bottom bar, so a low release clips the
  bar or passes under it and comes down lower on 5B / 5C. A thin midrib slit over each red top
  keeps the red's top face open (the red-zone test touches it from above).
- **Drainage launches**: on each catch's face side (a launch under the ramp threw the bot into the
  ramp's underside); the basin's middle launches lift you onto the rim walk (a launch straight to
  3B was 2 s faster than hopping).
- **Trunk Bridge**: ivory deck and rails with glass parapets (no glass deck: glass must not look
  like a floor); it is out of reach anyway.
- **Fern beds**: floating ivory planter tubs (a column from the floor cut through the mist).
- Gate styling: fern arch (the standard gate), a pale-glass glow pipe on the lintel and a thin
  stream beside each post; anchors are the standard pale-glass rings (no leaf glyph).
- No ambience audio (drips, insects, glass creaks, roof wind): course data has no audio hooks.

## 9. Untested assumptions

- Nobody has played it. The human numbers are the 0.6-strafe bot; Act 1 is its slowest (37 s:
  the raised catches from a standing start).
- **Glass readability** (the brief's critical test): checked only in still screenshots. The 13 %
  tint is nearly invisible; the panes read by their thin edges and the ivory ribs, as walls and a
  roof far from the route. No pane looks like a surface in the shots taken, but fog, motion and
  other screens are untested.
- The garden mist's glow under the kill floors (an engine look shared by every map with floors)
  shows as dark flat patches when you look **up** at a higher layer's floor from a lower one
  (Acts 4–5 under Acts 2–3 and the roof).
- The raised catches: whether players ride the lips high enough without being told; a missed
  catch lands in the Seed drainage (5.6 s launch back) or they press R.
- The 0.85 s C2 bay launch (≈ 30 m/s) is the only way a restart there reaches the pads with
  speed; the test passes by ≈ 0.7 s.
- Turn-rate comfort (the Ω at ≈ 35°/s), the 23 m/s bay launch as a comfortable re-entry, the level
  (`vertical: 'zero'`) portal exit after a 180 m lift.
- Screenshots checked (start, 1A → 1B, the pads and basin, the atrium half circle with the trunk,
  C4 under the bridge, a petal window, the flower portal, the roof exit with the crown, the
  finish): ramps, ridges, pads, gates, the red borders and the portal read; the tree reads as the
  landmark from everywhere; the lowDetail trunk is flat-shaded but its seams and roots give it
  shape.
