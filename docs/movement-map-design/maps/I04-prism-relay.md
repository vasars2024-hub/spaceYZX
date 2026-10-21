# I04 — Prism Relay (as built)

Intermediate surf • MOVEMENT_PROFILE v1 • map id `surf-prism-relay` •
source `packages/shared/src/level/maps/surf-prism-relay.ts` • own tests
`packages/shared/test/surf-prism-relay.test.ts` • brief §10 I04.
Built, tested and timed. The pen sequence in the source is authoritative; the numbers below
come from it and from the tools (`tools/race/*`). The first build spec (written before the
foundation had offset portals, portals in branches, per-portal colours and marks, and anchors
that restart before a portal) is in git history (`c03b4d0`); §9 lists where the build departs
from it and why. Conventions and formulas: [README.md](README.md#conventions-used-in-every-spec).

## 1. Identity

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme              | a light-routing facility: dark optical chambers stacked in three floors, pearl surf faces with ice-blue ridge strips, suspended glass prisms, a thin beam of light into every portal and out of every exit                                                                                                                                                                                                                                              |
| Movement identity  | _Carry your speed through portals that turn the world under you, and arrive already lined up for the next face._                                                                                                                                                                                                                                                                                                                                        |
| Core skills        | momentum through turning portals (turn 0 / ±90°, speed and vertical speed kept, **offset kept**: where you cross the opening is where you come out); diagonal window transfers (W3, W5); catching a receiver after a portal                                                                                                                                                                                                                             |
| Palette            | charcoal #171B25 (sky, fog, frames), pearl #D7DCE4 (every surf face, six shades, one per act; salvage ramps a brighter #EEF1F5), ice blue #7ACFE0 (ridge strips, anchors, bays, pads, the beam, prism halos), portal accents per group: amber #F2B35C (Input), violet #9A86F0 (Quarter), magenta #D46FD6 (Spectrum), spectral blue #5AA2FF (the high portal), green #7FDC9E (Relay), pearl (finish); hazard red #E8242C with hatching on red zones only |
| Portal identifiers | a colour per group, a mark per portal, shown over the portal and over its exit (engine glyph sprites): Input **○** P1, **◎** P2; Quarter **▷** P3 (+90°), **◁** P4 (−90°); Spectrum **◇** P5a, **◈** P5b; high **◆** P6 (blue); Relay **↱** P7 (+90°), **↰** P8 (−90°); finish **✦** PF (pearl). Each frame has a collar of glow bars in its colour 2.6 m outside it, each exit a thin ring in the same colour                                          |
| Landmark           | four suspended glass prisms (diamond columns with pointed ends, a glow bead under the tip, a halo of ice-blue bars): the **Input Prism** over the start, the **Central Prism** over the red core, the **Output Prism** inside Act 6's 180° sweep, the **finish prism** over the calm glass chamber; the beam segments                                                                                                                                   |
| Scenery            | glass is scenery only (`mat: 'glass'`, never collides; kept ≥ 8 m from every line); the calm chamber: four glass walls (92–110 m, 56 m tall) on pearl sills round the finish platform; the red pad basin (a refraction pool); dark cloud floors 25 m under every stretch (`autoFloors`)                                                                                                                                                                 |
| Fog / sky          | fog #171B25 140–650 m, near-black sky with stars, no sun, ambient 0.95                                                                                                                                                                                                                                                                                                                                                                                  |

## 2. Route sketch

Top-down, north up, drawn by `npx tsx tools/race/sketch.ts surf-prism-relay` (SVG:
[I04-prism-relay.svg](I04-prism-relay.svg), `--svg`). Line characters are the racing line's
height in tens of metres (`e` = 140 m … `z` ≥ 350 m); `1`–`5` gates, `R` anchors, `b` restart
bays, `x` red, `O`/`o` portal in/out, `S` start, `F` finish.

```
              :::::::: ::::                                o:zzzzzz:::                       ::o:
         :iiiiihhhhhhhhhhhh O                              :::::: :zzzzzz                    :::z
 Szz:zziiizzzzzz::                                                    ::zzz                  :::z       o
    :iii:: ::::zzzzzz:                                                   :zz:                :::z       ::: :
    ii:            ::zz:                                                  :zz                :::z       x:: :
   ii:                :zz:                                                 :z:                 :z       x:: :
  :i:                  :zz                                                 :z:                 :z       xx: :
  ii                   b zR                                                :z:                b:z       :x: :
  ii                     :z:                                                O                  :1        x:
  :i:                     zzz:                                                                :z:        :x:
   i:                       zzz:                                                               z:         x:
   :ii                        zzzzz:::: :::                                                    zz:        xx:
    :ii:                         ::zzzzzzzz O                                                   zz:        x:
      iiRjj                                                                                      zzz:      xx
        b:jjj                                                                                       zzz :  :x:
           :jj:                                                                                       z:zz: x:
            :jj:                         o                       :zzzzzzzzzzzzzzzzzzzz:o                 zzz:x:
              jj                        :k:                   :zzzz:                                      :z:x:b
              :j:                       :k:                  zzz:                                          :z2:w
               j:                        kk                :Rz b                                           :z :w:
               j:                          k             :zzz                                              :z  w:
               j:                          O       ::::zzzz:                                               :z  w:
               j:                     Ozzzzzzzzzzzzzzzz::                                                  :z  w:
               j:                                                                                          :z  w:
               j:                                                                                          :z  w:
               j:                                                                                          :z  w:
               j:          ::iiiiiiiiiiiiiiiiiiiiiiiiiiiii xx                   b                          :z  w:
               k:        o:ii:::                             :ggggggggggggggggggg5:fffffffffffff:          :z  w:
               k:       b :                                  ::: :::: :::::o:::::             :ffff         O  w:
              4::                                                         :u:                    :ff:          x:
              k: b                                                        :u:                      :ff         x:
              k:                                                          :u:                       :f:       bx:
              k:                                       o                  :u:                        f:        R
              k:                                       F                   uu:                      :f:
              k:                                                            ut::                    :f:         x
              k:                                                             :tttt::::: ::         :ff          x
              l:                                                                :ttttttttt O     :eff     x     x     x
              l:                                               :::::: :::: ::                ::eeee             x
              l:                                          :eeeefffffffffffff: ffffeeeeeeeeeeeeee:                x
              l:                                        :eee::                                                   x
              l:::                                     eee:                                                     ::
              l::::                                   ee:                                                       :x
              l: ::                                  :e:                                                        xx
              l: ::                                  e::                                                       :x:
              l: ::                                  e:                                                        :xx
              l: ::                                  e:                                                     :xxx
              l: ::                                  e:                                                   :xxx
              l: ::                                  e:                                                  wxx
              l: ::                                  e:                                               :www
              l: ::                                  e:                                             :www
              :m:::                                  e:                                          :w:ww
              :m:::                                  e:                                       :www:
     :::: :::::m:::                                  O                                    ::vvww:
   ORssbtttttttm:::::::: ::::: :::: ::::: ::::: :::: :3vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv::
       O:: ::::m::ttttttttttttttttttttuuuuuuuuuuuuuuuu  b
              :m::o
              :o:
x -460..528 (→ east), z -478..460 (↓ south), 8.2 m per column
```

The portals let every stretch sit where it fits the ±490 m network range, in three floors:

- **Upper floor** (y 470 → 390, Acts 1–2): the start in the north-west, 1A/1B east along the north
  edge to P1 (○); P1 puts you in the north-middle for 1C, which turns south into P2 (◎); 1D and
  the S-curve 2A/2B run south down the east side to P3 (▷), which turns you west along the middle
  (2C/2D) into P4 (◁).
- **Middle floor** (y 360 → 285, Acts 3–4): P4 drops you 34 m to the north-east corner; 2E, the
  3A climb, the prism pads over the red basin and 3B run south down the east edge, W3 and 3C turn
  west, 4A runs west along the south edge to the split: the long route (4B, P5a ◇, 4C in the
  middle-east, P5b ◈) or the high line (4H, P6 ◆).
- **Lower floor** (y 230 → 145, Acts 4–6): both split lines come out in the south-west (the
  Spectrum chamber: 4D and 4E side by side, 4E 16 m higher), merge on 4M running north up the
  west edge (C4), 5A1/5A2 loop round to P7 (↱) in the north-west corner; P7 puts you in the
  north-middle (5B, W5, P8 ↰); P8 puts you west of the centre for 5C, the red core, 5D (C5),
  the 180° sweep 6A round the Output Prism and 6B south into PF (✦), which lifts you 300 m into
  the calm chamber over the middle of the map.

Over-unders: E runs 60–90 m under C (east edge), 4A runs 65 m over 4D/4M, G runs 240 m under A,
I runs 100+ m under F and E.

## 3. Phrase graph

```
S ─drop 8─▶ [1A STD right: 70 + +60° R110 + 30] ─R1 Collimator─ (10,−3,+9)
  ▶ [1B STD left: −60° R120 + 30] ─14 m▶ P1 ○ (turn 0, 12×12, offset) ─(14,−7), lead 12▶
  [1C BROAD right: 40 + +90° R90 + 20] ─14 m▶ P2 ◎ (turn 0, offset) ─(14,−7,−3.5), lead 12▶
  [1D WIDE right 110, line at depth 0.3: P2's centre line lands at 0.58] ─▶ C1 Input Collar
       └ 1D-low (salvage): a crossing far right in P2 comes out past 1D's foot onto white 1D-low ▶ launch ▶ 1D
  ─(14,−5,+9)▶ [2A STD left: −50° R100 + 30] ─(14,−5,−9)▶ [2B STD right: +50° R100 + 130]
  ─14 m▶ P3 ▷ (+90°, offset) ─short gap (16,−8), lead 12▶ [2C STD left: 110 + −45° R110 + 30]
  ─R2 Mirror─ (10,−3,−9) ▶ [2D STD right: +45° R110 + 90] ─14 m▶ P4 ◁ (−90°, offset)
  ─longer catch (30,−20), lead 16▶ [2E BROAD left: −12° R200 + 190] ─▶ C2 Quarter-Turn Merge
       └ 2E-low (salvage): a low or left P4 exit falls past 2E's foot onto white 2E-low ▶ launch ▶ 2E
  ─(14,−5,−9)▶ [3A STD right: +12° R150 + 100 + 80 climbing 15] ─R3 Prism Feet─
  ─(15,−1)▶ 7 prism pads F1–F7 over the red basin (18.5–19.8 m, zig-zag −15/+22/−22/+18/−14/+11°),
       L3 low lintel on the hop F6 → F7 ─last hop (22,−2)▶ [3B MID right: 20 + +45° R70 + 120]
  ─(15,−4.6,+5)▶ W3 (diagonal window, heading ≈ 245°, hole 9×6.2) ─(12,−2.4,+4), lead 6▶
  [3C STD left: +45° R130 + 250] ─▶ C3 Lens Frame
  ─(14,−5,−9)▶ [4A STD right: 250 + 30 climbing 2] ── the split ──
    long:  ─(26,−7,+16), lead 8▶ [4B BROAD left 85] ─R4 Prism Bend─ ─14 m▶ P5a ◇ (−90°)
           ─(14,−7), lead 12▶ [4C BROAD left: 40 + −90° R80 + 40] ─14 m▶ P5b ◈ (−90°)
           ─(14,−7), lead 12▶ [4D BROAD left 85] ─(15,−5,−9), lead 12▶ [4M STD right 320]
    high:  ride 4A's ridge band straight on ─(14,−1), lead 6▶ [4H SHORT right 70 climbing 7]
           ─10 m▶ P6 ◆ (blue, +90°, 9×9) ─(14,−4), lead 12▶ [4E STD left: 175 + −20° R120 + 15]
           ─diagonal catch (~45 m on, 17 m left, 22 m down)▶ 4M's upper band
  ─▶ C4 Spectrum Merge
  ─(14,−5,+9)▶ [5A1 STD left: 150 + −45° R120 + 30] ─R5 Relay─ (10,−3,−9)
  ▶ [5A2 STD right: +135° R120 + 60 + 20 climbing 1] ─14 m▶ P7 ↱ (+90°)
  ─(14,−5), lead 10▶ [5B STD left, brief: 8 + −28° R50 + 6 → heading 152°]
  ─14 m▶ W5 (diagonal window, hole 9×7.5) ─14 m▶ P8 ↰ (−90°, crossed 28° off square: out at 62°)
  ─R6 Core (at P8's exit)─ (14,−7), lead 12▶ [5C STD right: +28° R120 + 170 + 25 climbing 2]
  ─the core: straight on off 5C's lip hits the red core; bend right at once (44,−18,+22), lead 10▶
  [5D WIDE left 150] ─▶ C5 Output Entry
  ─(14,−5,−9)▶ [6A STD right: 60 + +180° R95 round the Output Prism + 60 + 40 climbing 8]
  ─rising transfer (28,−4,+8), lead 10▶ [6B WIDE left: 70 + −90° R110 + 120]
  ─14 m▶ PF ✦ (turn 0, 16×16, fixed exit, +300 m) ─(8,−2)▶ F (24×20) in the calm chamber
```

## 4. Numeric parameters

Face shapes (README): SHORT 9 × 65°, MID 12 × 60°, STD 14 × 58°, BROAD 16 × 56°, WIDE 18 × 55°.
Racing depth 0.35 (1D 0.3). Every drop is the spec's × 0.5 (`K`), climbs are not scaled.

| ramp | shape | side  | legs (flat m, drop m)             | length | ramp | shape | side  | legs (flat m, drop m)                   | length |
| ---- | ----- | ----- | --------------------------------- | -----: | ---- | ----- | ----- | --------------------------------------- | -----: |
| 1A   | STD   | right | 70, 3 · +60° R110, 5 · 30, 1      |    220 | 4B   | BROAD | left  | 85, 3.5                                 |     93 |
| 1B   | STD   | left  | −60° R120, 4 · 30, 1.5            |    161 | 4C   | BROAD | left  | 40, 1 · −90° R80, 4.5 · 40, 1           |    218 |
| 1C   | BROAD | right | 40, 1.5 · +90° R90, 4.5 · 20, 1   |    213 | 4D   | BROAD | left  | 85, 3                                   |     97 |
| 1D   | WIDE  | right | 110, 3.5                          |    122 | 4M   | STD   | right | 320, 7                                  |    332 |
| 2A   | STD   | left  | −50° R100, 3.5 · 30, 1            |    122 | 4H   | SHORT | right | 70, −7 (climb)                          |     76 |
| 2B   | STD   | right | +50° R100, 3.5 · 130, 2.5         |    222 | 4E   | STD   | left  | 175, 3.5 · −20° R120, 1 · 15, 0.5       |    244 |
| 2C   | STD   | left  | 110, 2 · −45° R110, 3.5 · 30, 1   |    238 | 5A1  | STD   | left  | 150, 4.5 · −45° R120, 3.5 · 30, 1       |    279 |
| 2D   | STD   | right | +45° R110, 3.5 · 90, 2            |    181 | 5A2  | STD   | right | +135° R120, 7.5 · 60, 1 · 20, −1        |    368 |
| 2E   | BROAD | left  | −12° R200, 1.5 · 190, 4           |    248 | 5B   | STD   | left  | 8, 0.5 · −28° R50, 1.5 · 6, 0.3         |     48 |
| 3A   | STD   | right | +12° R150, 1 · 100, 2.5 · 80, −15 |    216 | 5C   | STD   | right | +28° R120, 2 · 170, 2.5 · 25, −2        |    266 |
| 3B   | MID   | right | 20, 1 · +45° R70, 2.5 · 120, 3.5  |    200 | 5D   | WIDE  | left  | 150, 2.5                                |    160 |
| 3C   | STD   | left  | +45° R130, 3.5 · 250, 5           |    358 | 6A   | STD   | right | 60, 1 · +180° R95, 9 · 60, 0.5 · 40, −8 |    463 |
| 4A   | STD   | right | 250, 8 · 30, −2                   |    285 | 6B   | WIDE  | left  | 70, 1 · −90° R110, 4 · 120, 1.5         |    373 |

Salvage ramps (white, WIDE): 1D-low `[45, 2]` 14 m on / 21 m down / 15 m right of P2's exit;
2E-low `[60, 2]` 30 m on / 36 m down / 24 m left of P4's exit; each ends 12 m before a launch pad
(6 m lower) that throws you back onto the receiver above (1D at s 105 in 1.4 s, 2E at s 150 in
1.7 s). Turn rates: the tightest main-line arcs are 5B (−28° R50, ≈ 40°/s at 35 m/s) and 6A
(180° R95, ≈ 21°/s); everything is under the 90°/s Intermediate comfort limit.

**Portals** (`PortalEl`, all `air`, vertical speed kept). Each opening is placed on the ballistic
flight from the release, its middle 0.8 m over where your body passes (a lower opening makes the
racer air-brake to meet it). "lift" = exit feet − opening middle.

| portal | faces | opening | turn | offset | exit (feet)     | lift | exit catch → receiver          | measured in → out (steady, flat m/s, vy) |
| ------ | ----- | ------- | ---: | ------ | --------------- | ---: | ------------------------------ | ---------------------------------------- |
| P1 ○   | E     | 12 × 12 |    0 | yes    | 30, 452, −462   |  +10 | (14,−7) → 1C BROAD             | 33.3 → 33.3 (vy −9.8)                    |
| P2 ◎   | S     | 12 × 12 |    0 | yes    | 330, 452, −468  |  +15 | (14,−7,−3.5) → 1D WIDE, 1D-low | 36.2 → 36.2 (vy −9.1)                    |
| P3 ▷   | S     | 12 × 12 |  +90 | yes    | 260, 420, −210  |   +2 | (16,−8) → 2C STD               | 34.0 → 34.0 (vy −8.3)                    |
| P4 ◁   | W     | 12 × 12 |  −90 | yes    | 400, 360, −440  |  −34 | (30,−20) → 2E BROAD, 2E-low    | 34.0 → 34.0 (vy −7.7)                    |
| P5a ◇  | W     | 12 × 12 |  −90 | yes    | 160, 310, −10   |  +23 | (14,−7) → 4C BROAD             | 34.4 → 33.8 (vy −9.8)                    |
| P5b ◈  | E     | 12 × 12 |  −90 | yes    | −330, 230, 450  |  −66 | (14,−7) → 4D BROAD             | 35.6 → 32.6 (vy −8.8)                    |
| P6 ◆   | W     | 9 × 9   |  +90 | yes    | −309, 246, 435  |  −61 | (14,−4) → 4E STD (high line)   | fork rider ≈ 33 → 33                     |
| P7 ↱   | E     | 12 × 12 |  +90 | yes    | −120, 215, −200 |  +35 | (14,−5) → 5B STD (brief)       | 33.9 → 33.1 (vy −6.2)                    |
| P8 ↰   | S     | 12 × 12 |  −90 | yes    | −250, 195, −20  |   −6 | (14,−7) → 5C STD, 62° → 90°    | 35.8 → 35.8 (vy −16.5)                   |
| PF ✦   | S     | 16 × 16 |    0 | no     | 0, 440, 60      | +295 | (8,−2) → finish gate           | 34.0 → 34.0 (vy −8.7)                    |

The portals keep speed exactly (the harness in §7); the small drops in the right-hand column
are the racer's own air-braking on that tick, before the teleport, toward its next target.

**Pads** (bhop, `[7, 9]`, F1 `[8, 11]`): F1 19 m past 3A's lip and 2 m lower, then 18.5 · 18.8 ·
19.1 · 19.4 · 19.6 · 19.8 m, turning −15 · +22 · −22 · +18 · −14 · +11° (headings 165–190°), all
level, for a ≈ 27 m/s arrival (3A climbs 15 m). **L3**: a solid lintel (14 × 2.4 m) 4.2 m over
the pad tops half way along the hop F6 → F7, on two posts 12 m apart (a hop's apex is 1.2 m, so
there is ~1 m of head room). **Red zones**: the refraction pool (a red slab 14 m under the pads,
44 × 143 m) and the red core (16 × 60 × 16 m, 21 m past 5C's lip and 5 m left of its line: the
straight chord from the lip to 5D's catch passes 3.5 m right of it; flying straight on along 5C
hits it). **Windows**: W3 (hole 9 × 6.2, wall 21 × 16) and W5 (hole 9 × 7.5, wall 27 × 20),
charcoal with the standard ice-blue rim.

## 5. Checkpoints, anchors and restore states

Every gate and anchor restores the same way: standing in its restart bay (a platform with a back
wall and the recovery glyph), frozen 0.5 s, then its launch pad throws you onto `to`. Default
bays: 26 m back from the landing, 10 m toward its ridge, 12 m up, 1.2 s flight. Short, faster
flights sit lower so the launch never points down (a downward launch lands you back on the bay
floor): C2 `{0.9 s, up 6}`, R3 Prism Feet `{back 20, side 12, 0.8 s, up 4}`, R6 Core
`{0.9 s, up 6, straight behind the landing}`, C5 `{1.0 s, up 7}`. **R4 Prism Bend restarts
before P5a**: its bay launch throws you through the portal again. "clean" = when the steady
racer passes it; "bay → gate" = from the bay to the next gate (`time-tracks --sections`); "carry
on" = the clean run from there to the next gate.

|     | name               | trigger centre  | clean   | bay → gate | carry on |
| --- | ------------------ | --------------- | ------- | ---------- | -------- |
| R1  | Collimator         | −239, 451, −347 | 11.9 s  | 17.9 s     | 15.8 s   |
| C1  | Input Collar       | 333, 440, −338  | 27.7 s  | 35.5 s     | 30.7 s   |
| R2  | Mirror             | 35, 404, −155   | 44.9 s  | 15.8 s     | 13.5 s   |
| C2  | Quarter-Turn Merge | 445, 333, −178  | 58.4 s  | 35.4 s     | 29.6 s   |
| R3  | Prism Feet         | 460, 338, 50    | 65.2 s  | 24.2 s     | 22.7 s   |
| C3  | Lens Frame         | −10, 311, 404   | 88.0 s  | 34.3 s     | 32.1 s   |
| R4  | Prism Bend         | −419, 287, 397  | 99.8 s  | 22.7 s     | 20.2 s   |
| C4  | Spectrum Merge     | −339, 206, 10   | 120.1 s | 38.2 s     | 34.7 s   |
| R5  | Relay              | −388, 190, −260 | 128.2 s | 28.6 s     | 26.7 s   |
| R6  | Core               | −250, 195, −20  | 142.1 s | 15.5 s     | 12.8 s   |
| C5  | Output Entry       | 213, 163, −18   | 154.8 s | 28.3 s     | 25.5 s   |
| F   | finish             | 0, 438, 68      | 180.3 s | —          | —        |

Cadence between recovery points (clean run): 11.9 · 15.8 · 17.2 · 13.5 · 6.8 · 22.8 · 11.8 ·
20.3 · 8.1 · 13.9 · 12.7 · 25.5 s. An anchor or gate precedes every new portal combination: R1
before P1/P2, C1 before P3, R2 before P4, C3 before the split, R4 right before P5a (and P5b),
R5 before P7/P8, C5 before PF. The high line has no anchor (a branch holds none): a fall there
goes back to C3.

## 6. Forks (RaceDef.forks) — `time-tracks --forks`

| name             | kind            | line                                                                               | ridden | racing line | saved         |
| ---------------- | --------------- | ---------------------------------------------------------------------------------- | ------ | ----------- | ------------- |
| High spectrum    | **faster line** | 4A's ridge band (depth 0.12) straight on, 4H, P6 ◆, 4E, the diagonal catch onto 4M | 13.8 s | 22.3 s      | **8.5 s**     |
| 1D-low (salvage) | salvage         | from 1D-low's face, its launch pad, back onto 1D at s 105                          | 3.8 s  | 2.7 s       | −1.0 (slower) |
| 2E-low (salvage) | salvage         | from 2E-low's face, its launch pad, back onto 2E at s 150                          | 5.1 s  | 4.1 s       | −1.0 (slower) |

The high line is ridden (fork rider) from 30, 34, 38 and 41 m/s on 4A; its diagonal catch loses
nothing (34 → 38 m/s from a 36 m/s entry: the 22 m fall turns into speed along 4M's face). It
skips 4B, P5a, 4C, P5b and 4D (≈ 410 m of ramp and two catches) for 4H and 4E (≈ 320 m).

## 7. Measured timings (`time-tracks.ts`)

|                                                            | Act 1 | Act 2 | Act 3 | Act 4  | Act 5 | Act 6 | total       |
| ---------------------------------------------------------- | ----- | ----- | ----- | ------ | ----- | ----- | ----------- |
| brief target                                               | 0:25  | 0:30  | 0:30  | 0:35   | 0:35  | 0:25  | 3:00        |
| steady bot (clean run)                                     | 27.7  | 30.7  | 29.6  | 32.1   | 34.7  | 25.5  | **3:00.27** |
| human 0.75 (`--human=0.75`, the Intermediate design level) | 29.2  | 32.5  | 29.7  | 31.8   | 34.9  | 26.2  | **3:04.32** |
| human 0.6 (`--human`)                                      | 29.3  | 31.8  | 29.7  | 32.6   | 35.1  | 26.1  | 3:04.58     |
| steady, high spectrum                                      |       |       |       | ≈ 23.6 |       |       | ≈ 2:51.8    |

All three clean runs finish with 0 respawns; racing line 6065 m, top speed 39.3 m/s (steady),
par 3:00. Budget (`check.ts` / `budget.ts`): 6409 boxes (1747 colliders), **151.6 k triangles**,
0 overlaps, 0 validation problems. Everything in the scenery that isn't glass is `lowDetail`.

**Critical test** (brief: speed magnitude kept through ordinary portals, direction turned
correctly; grazing entries, edge crossings, high speed, rapid re-entry) —
`surf-prism-relay.test.ts` flies every portal at 7 spots (the middle, 1.4 m inside each edge,
two corners) × 25 / 38 / 48 / 50 m/s × 0° / ±15° off square × vy 0 / −12 / +5: exactly one
teleport, flat speed kept to 0.05 m/s, vertical speed kept (one tick of gravity), heading turned
by the portal's turn to 0.5°, and the offset kept (you come out as far across and up from the
exit as you went in from the opening's middle). A centre 0.3 m outside an opening never
teleports; standing on an exit (and 4 m off it at the offset corners) triggers nothing; braking
straight back out of an exit never re-enters it. The racing line's portal speeds are in §4.

## 8. Brief and spec requirements

Met: six acts in the brief's order with C1–C5 named as the brief; R anchors before each new
portal combination, each restart bay completable on its own and never faster than carrying on;
Act 1 two broad curved ramps (1A, 1B) and an upright portal with no gravity change (P1) whose
exit faces a receiver along the travel direction, then a second, offset catch (P2 keeps your
offset: 1D's lit upper band is 3.5 m left of the exit's centre line — the lesson that where you
cross the opening sets the exit line); Act 2 an S-curve (2A/2B) into a portal that rotates the
travel frame by 90° (P3) across a short gap onto a curved receiver (2C), repeated (P4) with an
exit set higher over its receiver (20 m) and a longer catch (30 m, ≈ 1 s), destinations visible in
the previews; Act 3 bhop over angled prism bases (7 pads), a low architectural opening (L3), a
diagonal surf face (3B), a short ramp-to-window transfer (W3), no new portal rule; Act 4 the
split: a longer two-portal route with broad catches (4B → P5a → 4C → P5b → 4D) or a shorter
portal from a higher ramp line (4A's ridge band → 4H → P6), both arriving in the same chamber at
different heights (4E 16 m above 4D) on distinct receivers, merging on 4M through one gate (C4);
Act 5 a curved ramp (5A2), a portal (P7), a brief receiving face (5B), a diagonal window (W5), a
second portal (P8), ≈ 1.5 s from P7's exit to the first demand (5B's release), a red central
prism (the core) shaping the final air strafe onto a WIDE receiver (5D); Act 6 a long sweep
round the final prism (6A, 180° R95 round the Output Prism), one elevated transfer (6A's lip
climbs 8 m: a rising transfer onto 6B), a broad finish portal (PF, 16 × 16) into a calm light
chamber; the faster line built and measured (8.5 s, target 6–10); a missed rim falls to the
recovery point before the phrase, which replays the portal; small exit errors land on wider
lower receivers (1D-low, 2E-low; 5D WIDE for the core); every portal has a stable mark and a
visible destination (the live preview); the palette; red only on red zones; refraction effects
only on decorative glass (never on collision); sharp frame silhouettes (portal collars).

New foundation features used (replacing the spec's workarounds): offset-preserving portals on
all nine momentum portals (the spec's "fallback A" twin panes for P2 are gone); a colour and a
mark per portal; the high line's portal in a `branch` with a `portal: true` fork line (ridden
by the fork test); an anchor right before a portal restarts before it (R4 → P5a); vertical speed
kept on every portal (the brief's "speed magnitude preserved"); the live exit preview.

Approximated:

- **Beam**: short ice-blue beam segments into every opening (26 m, near its top) and out of
  every exit (28 m), not one continuous line through the building (course blocks turn about the
  vertical only, so a descending beam can't be drawn as one piece).
- **Light**: no localized light pools or bloom control (the course format has no light API);
  the receivers read by contrast (pearl on charcoal), the salvage ramps are a brighter white.
- **Gates and anchors** are the standard fly-through gate and ring, not octagonal lens collars;
  the pads are square plinths with bright tops, not hexagonal; the prisms are diamond columns
  (no triangular prisms: blocks turn about the vertical only).
- **P4's "higher exit"** is higher over its receiver (a 20 m, 1 s catch), not higher than its
  entry: the three-floor layout drops you 34 m through it.
- **Sound**: none (no per-map audio hooks): no portal tones, no hum.
- **Portal views**: the engine draws the previews; the map doesn't limit how many are on screen
  (at the split two are, as the spec wanted).

Missing: the race connector (docking collar) after the finish (no queue connector exists yet).

## 9. Changes from the spec (and why)

1. **Layout.** The spec's sketch spans x −650…620, z −800…575, far outside the network range
   (racing line |x|, |z| < 490). Every portal exit was re-placed: the route is folded into three
   floors (upper Acts 1–2, middle Acts 3–4, lower Acts 4–6, §2) instead of the spec's "portal
   lifts" (P4, P5b and P6 now drop you 34–66 m; PF lifts you 295 m to the calm chamber).
2. **Speeds and length.** Bots keep almost all speed on surf: with the spec's drops (455 m of
   ramp descent) they would hit the 50 m/s cap. Every drop is halved and the spec's ⇔ legs are
   lengthened (1B…6B; 6.07 km vs 5.1 km); the first draft with halved drops and the spec's
   lengths ran 2:34. Speeds are now 33–39 m/s.
3. **Portal openings on the flight path.** The spec's `move(4,-2).airPortal(10, …)` puts the
   opening's middle ~1 m under a flat flight: the racer then air-brakes (34 → 27 m/s) to meet it.
   Every opening sits 0.8 m above the ballistic path from the release (the `portal` helper).
4. **Relay chain.** The spec's out-and-back S-flight through W5 can't be flown by a racer that
   aims straight at the portal, and it is a hidden demand right after a quarter turn. Built
   instead: 5B is a brief face that bends you −28° onto the diagonal (152°), the flight through
   W5 is straight, P8 is crossed 28° off square and its −90° turn sends you out at 62°, onto 5C
   which bends +28° back to east. R6 Core sits right at P8's exit (its ring would cut 5C's
   lead-in 4 m on) with its bay straight behind 5C's landing (a bay on the ridge side launched
   across 5C's ridge).
5. **The core.** Placed so that the straight chord from 5C's lip to 5D passes 3.5 m right of it
   (the spec's chord passed through it, which only a strafing-early line survives; the racer
   flies the chord). Flying straight on along 5C still hits it, so it still shapes the strafe.
6. **Split.** T4b is (26,−7,16) (spec 15,−6,16: a 47° transfer that lost 18 m/s on landing);
   4H climbs 7 m (spec 4); 4E ends with a 20° left bend so the diagonal catch lands on 4M's upper
   band ≈ 45 m on and 17 m across (the spec's 40 m / 30 m / 26 m down catch hit 4M's face from
   below). 4B/4C/4D lengths were tuned until the high line saved 8.5 s. P6 has its own colour
   (spectral blue ◆): with both frames magenta, the two choices looked alike from 4A (checked in
   screenshots).
7. **Pads.** 3A climbs 15 m (spec 10) and F1 is 19 m past the lip (spec 14): the racer braked
   to 17 m/s to land a close first pad and then fell short of 17 m spacings. Spacing is
   18.5–19.8 m for ≈ 27 m/s; the zig-zag is ±11–22° (spec ±20–30°: the 0.6 strafer missed the
   50° swing F3 → F4); pads are [7, 9] (spec [6, 8–9]). L3 is a solid lintel on two posts (route
   `wall`s) rather than a `window`: a window between two pads breaks the racer's hop rhythm.
8. **Salvage ramps** (1D-low, 2E-low) sit further out than the spec's (2E arcs left into the
   spec's 2E-low); both are white and launch you back up.
9. **Bays.** Short restart flights (0.7–1.0 s) with the default 12 m height launch you downward
   into your own bay floor; those bays sit 4–7 m up.
10. **Windows.** W5's hole is 9 × 7.5 m (spec 6.4 × 5.4): the 0.75 human rode lower on 5B and hit
    its sill. W3 is 9 × 6.2 with a smaller wall (the spec's wall cut into 3C).
11. **Marks.** ○ ◎ ▷ ◁ ◇ ◈ ◆ ↱ ↰ ✦ instead of the spec's I/II, △/▽, ◇/◆, ⬡: one distinct mark per
    portal (the engine shows it over the portal and its exit).

## 10. Untested assumptions

- Nobody has played it. The human numbers are bots with 0.75 and 0.6 strafe efficiency; they
  are only 4 s slower than the steady bot (surf and portals barely depend on strafing here), so
  the real Intermediate time is unknown.
- **Offset exits and real catches.** The harness checks the portal maths; only the centre line
  is ridden onto each receiver. A full-edge crossing (±5 m across, ±5 m up) lands up to ±0.5 of
  a face lower or higher: P2 and P4 have salvage ramps, the others (1C BROAD, 2C STD, 4C/4D
  BROAD, 4E STD, 5B STD, 5C STD) rely on lead-ins of 10–16 m — an edge crossing into a STD
  receiver may miss it.
- Comfort of ±90° view turns at 34–36 m/s, and of P7 → P8 (two opposite quarter turns 2.2 s
  apart).
- Readability, checked only in still screenshots (start, P1, P2, P3, the split from 4A, P7, P8
  through W5, the pads over the basin, the core with the Central Prism, PF, the calm chamber):
  collars and marks read in their colours; the glyph sprites are small (3.2 m, readable within
  ~60 m); the previews show their destinations but are dark inside (charcoal scenes); the split's
  two frames are small from 200 m and distinct from ~100 m; other floors' portal collars are
  visible far below some approaches (P5b's under P3) — possibly distracting.
- Manual bhop timing over 18.5–19.8 m with turns; L3 lintel hits.
- Frame rate at the split with two live previews; 151.6 k triangles (budget 180 k).
- Falls: cloud floors 25 m under each stretch end a fall in ≈ 1.6 s; the finish chamber floats
  over the lower floor with nothing under its glass walls but that floor.
