# I03 — Cyclone Observatory (as built)

Intermediate surf • MOVEMENT_PROFILE v1 • map id `surf-cyclone-observatory` •
source `packages/shared/src/level/maps/surf-cyclone-observatory.ts` • brief §10 I03.
Built, tested and timed. The pen sequence in the source is authoritative; the numbers below
are copied from it and from the tools (`tools/race/*`). It started from a build spec (this
file's first version, never committed): §9 lists what changed from it and why, §11 keeps that
spec's key numbers. Conventions and formulas: [README.md](README.md#conventions-used-in-every-spec).

## 1. Identity

|                   |                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme             | an observatory built round a stationary storm: silver instrument rings with a cyan ridge light circle a cyclone caged in a glass column, at different heights and radii, inside a dark storm-blue shell                                                                                                                                                                             |
| Movement identity | _Circle the storm on rings of different size, match each ring's turn to the speed you carry, then pick the spiral's exit._                                                                                                                                                                                                                                                          |
| Core skills       | changing curve radius ring by ring (each ring sized to its own speed band); controlled spiral exits (a 390° helix with a narrow high exit and a broad low one); tangential ring-to-ring transfers                                                                                                                                                                                   |
| Palette           | storm blue #344A63 (sky, fog, struts, shell), instrument silver #AAB6BE (every surf face, the collar, masts, pillar), pale cyan #9BDCE0 (ridge light, anchors, hoops, E2 edge, collar band), warning amber #DAAA5D (the E1 slot rim, bhop pad tops, the portal, the finish ring), hazard red #E8242C with black hatching (red zones only); darker steel #55677A for the lens screen |
| Landmark          | **the caged cyclone**: a glass column (r 28, 20 panes) round O = (0, 0) from the lit well at y 20 up to a stepped glass dome at y ≈ 294, three dim bands of storm blue turning up inside it (pale cyan flashes only low in the well and under the dome), a silver pressure collar (r 30–46, y 20–54) with a cyan band round its base. Visual only: no forces, never collides        |
| Orbital levels    | I Calibration ring: silver theodolite masts with arms toward the storm and cyan lamps; II Orbit: five armillary hoops that shrink with the orbit; III Outer observatory: a comb-toothed sensor rail outside Ring V; IV Lens: the dark lens screen with its amber slot round the helix; V Base: the collar, and the telescope's circle of amber lights round the finish              |
| Scenery           | storm-blue struts under the rings (every 80 m where nothing passes below), the pillar beside the transfer onto Ring V, the observatory's outer shell (36 panels at r 590 with a cyan band at y 430, outside the route and the network range)                                                                                                                                        |
| Fog / sky         | fog 150–700 m, storm-blue sky (#1E2C3D → #344A63), ambient 0.9; the auto floors are storm-blue mist (#3D5470) with a blue (not red) glow, so red stays for red zones only                                                                                                                                                                                                           |

## 2. Route sketch

Top-down, north up, drawn by `npx tsx tools/race/sketch.ts surf-cyclone-observatory` (SVG:
[I03-cyclone-observatory.svg](I03-cyclone-observatory.svg), `--svg`; every other row here — the
three layers overlap in plan, the SVG separates them better). Line characters are the racing
line's height in tens of metres (0–9, then a = 100 m … z = 350 m); `1`–`5` gates, `R` anchors,
`b` restart bays, `x` red zones, `O`/`o` portal in/out, `S` start, `F` finish.

```
                                                             :::777777777777777777::
                                                      :7777::::                    :::77777:
                                               :6  7 :                                     ::777:
                                           666:                                                ::77:
                                         77:                                                      ::77:
                                        77:                                                          :77
                                        7:                                                            ::7:
                                      : 7:                                                             : 7:
                                        :7:                                           b     :::         :7:
                                      :: ::77::             ::uuuuuuuuuuuuuuu: : : : : :         :::::ttt8:
                                       :: ::  :77::uuuuuu::::           b                               :8::ttt:
                                         :  :uuuu:F:       ::zzzzzzzzz::::: :::::::::yyyyy:             :8:    :tt:
     b:m:                              :uuu::      :zzzz:::                               ::yyy         :8:      ::t:
      m:                           :uu::     :zzz::                                           ::yy      :8:        :t:
      m:                        :uu:     zzz::                                                  :yy     :8:         :t
     :m:                     :uu::   :zz::                                                              :8:        ::t
     m:                    :uu:   :zz::                                                            : x  :8:       ::t:
    :m:                  :u::   :zz:                                   :::bbbbbbbbbbbbbbbbbbbb:o     :x::8:     ::tt
    mm:                 :u:    zz:                             :bbbb::::vvvvvvv:::                    :xx8:   :tt:
    m:                 uu:   :z:                           :bbvvvv::              ::vvvv                :8:::R:
   :m:                :u:   :z:                       vvvRb:  b      :rrRrrrrrrrr:      :vv:           :s5xx
   nn                :u :  :z:                    :vv: bb:       :rr:             :rrr    :vv       sss :9::x
   n:                :u:   :z:                  vv:   :b:       s: b                 :r    :v:   ss     :9::x:
  :n:                :u :  :z:                :w:     :b:      :s                    :q:   :vss:        :9: 1
  nn:                 uu:  :z:               :w:        a:      ss                 :qq   sss :          :9::w:
  n:                  :u : :z:               :w:        :a        ss::       qqqqq:  :ss   :v:         ::9::w:
  :n::                 :uu: z            : : :w: : : ::::a: :::ppppp: :ssssssssssss:       :v:         :99 :w
    :nnn::               uu:z: :ooooooooooooooooo: :  : ::a::                             :vv        ::9::ww
          ::nnnn:  : b :  :uu:                 :w:         :aa:                        ::vv:       :99: :w:
                            :  :                 ww:         :aaa:::              ::vvv       :::999::ww:
                              :v:                   ww::          :99999::::  : 2v b  :::::9999:  :ww:
                                :v:                    :www::          ::uuuu:::99::::::     :www:
                                 x   v      x  b::::::::::uuuuuuuuuuuu:            :::wwwww::
                                                                         :::::::
x -379..213 (→ east), z -461..210 (↓ south), 4.9 m per column (every other row)
```

Three layers circle the storm (the SVG shows them apart). **Upper** (y 370 → 290, clockwise):
Act 1 starts west of the storm at (−240, 370, 82), sweeps round the north on Ring I (R 240
about O) and steps onto Ring II in the east (C1 at (157, 322, 6)); Act 2's orbit spirals round
the storm from the east through south, west and north (R 170 → 75) and leaves south onto 2D
(C2 at (18, 302, 145)); Act 3 climbs to the comb in the south-west, hops west over the red
sensor bed and circles the west and north on Ring V (R ≈ 268 about O) to C3 at (59, 289, −279).
**Middle** (y 300 → 225): Act 4's spoke turns in from the north-east, the chord boards the helix
round the glass (y 288 → 271), both exits leave west (C4 at (−289, 234, 100)); Act 5's tight turn
heads north up the west side to the portal at (−342, 219, −237). **Base** (y 125 → 65,
counter-clockwise): the portal puts you out north-east of the storm, 5C circles west and south of
it (R 110 about O), W5 and 5D in the south-west, 5E circles back north round the east (C5 at
(141, 83, −57)); Act 6 runs north, sweeps west round the north rim (y 84 → 77) and rises
south-east to the telescope's aperture at (−128, 67, −234), heading straight at the storm.

## 3. Phrase graph

```
S ─drop 8─▶ [1A STD right, 50 + 85° R240 (Ring I, about O) + 12] ─R1 Ring One─ T(16,−5)
  ▶ [1B MID right, 75° R100 + 15] ─chord release T(30,−9)▶ [1C STD right, 83 + 20° R163 (Ring II, about O)] ─▶ C1 Calibration Frame
  ─T(20,−6)▶ [orbit MID right: 15 + 180° R170→145 + 70° R145→115 (red 0.8) + seam 35 + 110° R100→75 (red 0.8) + climb 30/4]
        R2 Seam: a ring round the orbit 30 m before the seam (its bay throws you onto the seam)
  ─across the instrument gap T(24,−3)▶ [2D STD right, 15 + 50° R75 + 40] ─▶ C2 Orbit Exit
  ─T▶ [3A MID right, 35° R150 + 10 + climb 60/12 (the lip)] ─R3 Comb─
  ─▶ 4 bhop pads (7×12, then 6×10) 17.5 / 17.8 / 18.1 m apart, each turned 15° right, over the red sensor bed
  ─+25° diagonal hop through S3 (7×5 hole)▶ [3B MID right, lead 7, 30] ─T(22,−6), past the pillar▶
  [Ring V BROAD right, lead 12, 10 + 110° R≈268 (solved: centred 10 m from O) + 80] ─▶ C3 Sensor Door
  ─T▶ [4A STD right, 137° R120 (turn solved) + 10] ─R4 Helix─ T(16,−5)▶
  [4B+H HELIX 8.5×62° right: chord ≈ 100 (solved) + 150° R70→62 + 120° R62→55 + 120° R55→48 (red 0.8) + lip 10/−1.5]
        (the helix is centred on O exactly; the solver sets 4A's turn and the chord's length)
        R4b Spiral: a ring round the helix at φ 210 (its bay inside the helix, beside the glass)
        main (E2): over the lip at φ 390, out under the lens screen ─T(55,−16)▶ [4T STD left, lead 12, 15 + 11° R120 + 170 + 30]
        early (E1): over the outer ridge at φ ≈ 51, through the amber slot in the lens screen ─T(58,−18)▶
              [R4-hi STD left, lead 5, 30 (drop solved) + −10° R150 + 60] ─same-side step down and across▶ 4T at the merge
  ─▶ C4 Instrument Merge
  ─T▶ [5A STD right, 102° R60 (turn solved onto the portal's approach) + 20] ─T(16,−5)▶ [5A2 MID right, 220 straight]
  ─R5 Reversal─ portal P5 (12×12, facing north, turn −90°) ─▶ exit north-east of the storm, heading west
  ─T(14,−4)▶ [5B+5C STD left, lead 12, settle 80 + −90° R110 (about O) + 10] ─W5 (7×5, red lintel)▶
  [5D SHORT right, −20° R50 skim] ─opposing catch T(24,−7,+10)▶ [5E BROAD left, lead 12, 10 + −160° R125 (red 0.8) + 90] ─▶ C5 Telescope Entry
  ─T▶ [6A BROAD left, 200] ─R6 Telescope─ T▶ [6A' BROAD left, −120° R165 + 30]
  ─T(16,−5)▶ [6B MID left, rise 1: −60° R80→68 climbing 7 + 15 climbing 2]
        └ weak first climb: falls onto 6B-low (WIDE, pale) ▶ launch 1.9 s up through the aperture onto the gallery
  ─same-side step T(20,−3)▶ [6C MID left, lead 8, rise 2: −45° R62→52 climbing 6 + 35 climbing 1] ─▶ F (24×24, amber ring of lights)
```

## 4. Numeric parameters

Face shapes: MID 12 × 60°, STD 14 × 58°, BROAD 16 × 56°, WIDE 18 × 55°, SHORT 9 × 65°, HELIX
8.5 × 62° (slant 9.6 m). Racing depth 0.35. Every ramp has a 5 m lead-in unless noted. The
spec's descents are all scaled by **0.4** (`DROP`; climbs kept as specified) except the helix
(2 m over the first turn, 7 m over each of the last two) and 4T/R4-hi (set so R4-hi runs 15 m
above 4T). The ω column is the turn rate at the steady bot's speed there (rider radius =
ridge radius ∓ 0.35 of the face's run).

| #       | shape | side  | legs (flat m, drop m after scaling)                                                                    | length | ring (rider R), speed, ω                                                    |
| ------- | ----- | ----- | ------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------- |
| 1A      | STD   | right | 50, 1.6 · 85° R240, 7.6 · 12, 0.4                                                                      | 423    | Ring I R237, 25–35 m/s: 6–8.5°/s                                            |
| 1B      | MID   | right | 75° R100, 2.4 · 15, 0.4                                                                                | 151    | R98, 35: ≈ 20°/s                                                            |
| 1C      | STD   | right | 83, 2 · 20° R163, 0.8                                                                                  | 145    | Ring II R160, 35: ≈ 12.5°/s                                                 |
| orbit   | MID   | right | 15, 0.4 · 180° R170→145, 5.6 · 70° R145→115, 2.4 · 35, 0.4 · 110° R100→75, 2 · 30, climb 4             | 904    | 36–38: 12 → 14 → 18 → 22–29°/s (the orbit's demand rises ×2.4 at one speed) |
| 2D      | STD   | right | 15, 0.4 · 50° R75, 2 · 40, 1.6                                                                         | 125    | R72, 35: ≈ 28°/s                                                            |
| 3A      | MID   | right | 35° R150, 1.6 · 10, 0.4 · 60, climb 12                                                                 | 167    | ≈ 14°/s; 36 → 26 m/s up the lip                                             |
| 3B      | MID   | right | lead 7 · 30, 3                                                                                         | 37     | —                                                                           |
| Ring V  | BROAD | right | lead 12 · 10, 0.4 · 110° R267.8 (solved), 4.8 · 80, 0.4                                                | 616    | R264, 25–33: 5.5–7°/s                                                       |
| 4A      | STD   | right | 137° R120 (solved), 3.6 · 10, 0.2                                                                      | 302    | R117, 35: ≈ 17°/s                                                           |
| 4B + H  | HELIX | right | chord ≈ 100 (solved), 2.4 · 150° R70→62, 2 · 120° R62→55, 7 · 120° R55→48, 7 (red 0.8) · 10, climb 1.5 | 569    | 35–42 m/s: H1 ≈ 30°/s, H2 ≈ 37°/s, H3 ≈ 45–50°/s                            |
| 4T      | STD   | left  | lead 12 · 15, 0.3 · 11° R120, 0.5 · 170, 5.7 · 30, 0.5                                                 | 250    | —                                                                           |
| R4-hi   | STD   | left  | lead 5 · 30, 0.4 (solved) · −10° R150, 1 · 60, 2 (fork, `alt`)                                         | 121    | —                                                                           |
| 5A      | STD   | right | 102° R60 (solved), 3.2 · 20, 0.4                                                                       | 132    | R57, 38–41: ≈ 40°/s                                                         |
| 5A2     | MID   | right | 220, 2.4                                                                                               | 225    | —                                                                           |
| 5B + 5C | STD   | left  | lead 12 · 80, 1.2 · −90° R110 (about O), 3.2 · 10, 0.4                                                 | 275    | R107, 34–35: ≈ 18°/s                                                        |
| 5D      | SHORT | right | lead 3 · −20° R50, 0.4 (outside curve)                                                                 | 20     | R51.5, 34: ≈ 38°/s for 0.5 s                                                |
| 5E      | BROAD | left  | lead 12 · 10, 0.2 · −160° R125, 7.2 (red 0.8) · 90, 0.8                                                | 461    | R121, 36: ≈ 17°/s                                                           |
| 6A      | BROAD | left  | 200, 4                                                                                                 | 205    | —                                                                           |
| 6A'     | BROAD | left  | −120° R165, 6.4 · 30, 0.8                                                                              | 381    | R161, 36: ≈ 13°/s                                                           |
| 6B      | MID   | left  | −60° R80→68, climb 7 · 15, climb 2                                                                     | 97     | 36 → 30 m/s: ≈ 26°/s                                                        |
| 6C      | MID   | left  | lead 8 · −45° R62→52, climb 6 · 35, climb 1                                                            | 88     | 30 → 25 m/s: ≈ 28°/s                                                        |
| 6B-low  | WIDE  | left  | 20, 1 · −25° R90, 1 · 15, 1 (salvage, `alt`, paler steel)                                              | 79     | —                                                                           |

Every main-line turn stays under the Intermediate 90°/s comfort limit; the tightest are the
helix's last turn (≈ 45–50°/s), 5A (≈ 40°/s) and the 5D skim (≈ 38°/s for half a second). The
critical test (radius suited to the speed band, no uniform compression) holds by construction:
Ring I and Ring V are the lightest turns (6–8°/s) at the slowest speeds, the orbit's radius
falls 170 → 75 at one speed, the helix is the tightest ring at the highest speed.

**Bhop comb** (Act 3): `bhopPads` P1 14 m past the lip (1 m down, 7 × 12), then P2–P4 at 17.5 /
17.8 / 18.1 m, each turned 15° right, all level; S3 is a window (hole 7 × 5, wall 18 × 12) 8 m
past P4 after a further 25° turn; 3B 9 m on, 2.3 m down. The sensor bed is a red block (30 ×
68 m) 14 m under the pads. The pillar: a silver column Ø 3 m, 7.5 m into the transfer onto
Ring V and 5 m left of its straight line (bots pass it without bending).

**Lens screen and exits** (Act 4): the screen is a solid dark-steel wall arc at r 78 about O
spanning 44° of bearing, from 6 m under the slot to 4 m over it (y 268.7–291.2); the slot E1
is 13 m wide and 12.5 m tall, its amber rim on both faces, centred where the early line crosses
the screen (+2°, from traces). The main exit flies out under the screen (≥ 7 m headroom
measured) past its lit cyan lower edge (the "arch" E2) onto 4T.

**Portal P5**: opening 12 × 12 facing north, turn −90° (`v_out = rotY(−90°) · v_in`, speed and
vertical speed kept), amber; the approach heads 5° off north (5A's turn is solved for that);
the exit (93.9, 122, −106.9) is solved so 5C circles O exactly. It drops you ≈ 100 m, from the
middle layer to the base (see §9).

**Red zones**: the orbit's strip from depth 0.8 on its 2B and 2C arcs; the sensor bed; the
helix's strip from depth 0.8 over its last 120°; W5's lintel (a red beam across the top of the
hole, just in front of the wall so its top stays open); 5E's strip from depth 0.8.

## 5. Checkpoints, anchors and restore states

Every gate and anchor restores the same way: standing in its restart bay, velocity 0, frozen
0.5 s, then the bay's launch pad throws you onto `to` in `flightSec`. Defaults: 26 m back,
10 m toward the landing ramp's ridge, 12 m up, 1.2 s. All five gates' bays use `up` 4–5: from
12 m up their launch clipped the gate's own frame.

|     | name              | trigger (bottom middle, heading, size) | bay (feet)               | lands on (`to`)             | flight | clean run passes | bay → next gate (clean) |
| --- | ----------------- | -------------------------------------- | ------------------------ | --------------------------- | ------ | ---------------- | ----------------------- |
| R1  | Ring One          | [−8, 344, −237] 85° 14×12              | [−23, 352, −246]         | [4, 347, −238] 1B           | 1.0    | 19.6 s           | 11.5 s (9.4)            |
| C1  | Calibration Frame | [157, 322, 6] 180° 24×18               | [167, 332, −6] (up 5)    | [157, 327, 20] orbit        | 1.2    | 28.9 s           | 34.0 s (28.7)           |
| R2  | Seam              | ring round the orbit, 18×24            | [−72, 324, −50]          | [−54, 318, −76] the seam    | 0.9    | 46.4 s           | 12.1 s (11.3)           |
| C2  | Orbit Exit        | [18, 302, 145] 230° 24×18              | [34, 311, 145] (up 4)    | [7, 307, 154] 3A            | 0.9    | 57.6 s           | 38.3 s (28.4)           |
| R3  | Comb              | [−149, 311, 195] 265° 14×12            | [−144, 320, 184]         | [−163, 316, 196] P1         | 0.8    | 63.1 s           | 24.1 s (22.9)           |
| C3  | Sensor Door       | [59, 289, −279] 85° 24×18              | [46, 299, −288] (up 5)   | [73, 294, −280] 4A          | 1.2    | 86.0 s           | 36.4 s (32.6)           |
| R4  | Helix             | [160, 282, −75] 222° 14×12             | [177, 289, −79] (up 4)   | [152, 285, −66] the chord   | 0.9    | 94.5 s           | 31.1 s (24.2)           |
| R4b | Spiral            | ring round the helix at φ 210, 18×18.5 | [−48, 280, −16] inside   | [−44, 279, −38] helix φ 185 | 0.9    | 105.8 s          | 16.7 s (12.8)           |
| C4  | Instrument Merge  | [−289, 234, 100] 263° 24×18            | [−276, 244, 108] (up 5)  | [−303, 239, 101] 5A         | 1.2    | 118.6 s          | 36.9 s (32.0)           |
| R5  | Reversal          | [−343, 219, −219] 5° 14×12             | [−354, 222, −208]        | through the portal again    | 1.2    | 127.9 s          | 26.3 s (22.8)           |
| C5  | Telescope Entry   | [141, 83, −57] 0° 24×18                | [151, 93, −45] (up 5)    | [141, 88, −71] 6A           | 1.2    | 150.7 s          | 27.5 s (23.9)           |
| R6  | Telescope         | [141, 76, −275] 0° 14×12               | [151, 83, −261] (up 4)   | [141, 79, −287] 6A'         | 0.9    | 157.0 s          | 20.8 s (17.6)           |
| F   | finish            | [−128, 67, −234] 135° 24×24            | gallery [−107, 69, −213] |                             |        | 174.6 s          |                         |

"bay → next gate" = `time-tracks --sections`: the steady bot from the bay (frozen time not
counted) to the next gate; every one finishes, and every one is slower than riding on from the
same point (the brackets; the surf-map test checks it with the penalty). Recovery gaps on a
clean run: 19.6, 9.4, 17.5, 11.3, 5.5, 22.9, 8.5, 11.3, 12.8, 9.3, 22.8, 6.3, 17.6 s — every
stretch ≤ 25 s. The brief's "R before the helix" is R4 (on 4A's end, before the chord) and "R
before the portal reversal" is R5 (its bay throws you through the portal again, so the settle
and the reversal are replayed whole). R2 and R4b are rings round a ramp (the pen cannot stop
mid-curve); R4b's bay sits inside the helix beside the glass (outside the ridge its launch
landed on the ridge's back).

## 6. Forks (RaceDef.forks) — `time-tracks --forks`

| name                  | kind             | line                                                                                                                                                    | ridden (steady) | racing line | saved     |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------- | --------- |
| Early helix exit (E1) | faster           | climb to the ridge over φ 21–51, go over it at φ ≈ 51, fly ≈ 60 m through the amber slot onto R4-hi, ride it, step down and across onto 4T at the merge | 8.2 s           | 17.5 s      | **9.3 s** |
| Lower rise (6B-low)   | salvage (slower) | a weak first climb falls short onto 6B-low; ride it; its launch (1.9 s) throws you up through the aperture onto the gallery                             | 6.7 s           | 3.7 s       | −3.0 s    |

How the early line works: E1 leaves the helix's first turn about 20° right of where the main
line leaves its last turn, one turn (≈ 13 m) higher. R4-hi bends 10° left and 4T 11° right, so
both end on one heading with R4-hi ≈ 10 m to the right of 4T and 15 m above it (its drop is
solved: 3.5 m in all); the merge is a same-side step down and across (4T and R4-hi are both
left faces: you cross 4T's ridge from above and land on its face). Both lines are on 4T for the
last ≈ 70 m before C4. Speed: the early line lands on R4-hi losing ≈ 4 m/s (33 → 29) and lands
on 4T at ≈ 34 m/s.

Release window (steady bot riding the fork's own line, entry speed at φ 21): passes at 28,
30.8, 33, 35, 37 and 40 m/s; at 26 m/s it clears the slot but falls short of R4-hi and drops
onto 4T's lead-in (a failed attempt ends on the main receiver); at 42 m/s it makes the merge but
lands deep on 4T and misses the harness's last point. The slot is
wide enough for the bot's spread of lines (0–4° round from the straight line) but a release
much before φ 45 or after φ 57 hits the screen (from the geometry; not swept). A mid-band
release passes under the slot and hits the sill (the screen's lower part) — as the spec asked.

The salvage 6B-low: rideable at 25, 30 and 34 m/s entry speeds. 2D-low (the spec's second
salvage ring) is **not built** (§9).

## 7. Measured timings (`time-tracks.ts`)

|                           | Act 1 | Act 2 | Act 3 | Act 4 | Act 5 | Act 6 | total       |
| ------------------------- | ----- | ----- | ----- | ----- | ----- | ----- | ----------- |
| brief target              | 0:25  | 0:30  | 0:30  | 0:35  | 0:35  | 0:25  | 3:00        |
| original spec estimate    | 29.9  | 25.9  | 26.3  | 36.0  | 28.6  | 20.2  | ≈ 2:47      |
| steady bot (clean run)    | 28.9  | 28.7  | 28.4  | 32.6  | 32.0  | 23.9  | **2:54.57** |
| human 0.75 (design level) | 30.1  | 29.6  | 28.4  | 32.5  | 33.8  | 24.0  | **2:58.38** |
| human 0.6 (`--human`)     | 30.5  | 29.7  | 35.8  | 33.2  | 32.2  | 23.6  | 3:04.95     |

All three finish with **0 respawns**. Steady bot with the early helix exit: ≈ 2:45 (9.3 s
saved). Racing line 5923 m; average speeds per act (steady) 27.0 / 35.9 / 32.8 / 36.0 / 36.7 /
33.6 m/s, top 41.6 m/s horizontal (44 m/s at the helix's end); the comb 26–29, the rises 37 → 24.
Par 3:00. Budget (`check.ts`): 5948 boxes, ≈ **133 k triangles** (target ≤ ~180 k): ramps ≈ 82 k,
the auto floors' mist ≈ 22 k plus ≈ 10 k of glow, red strips ≈ 6 k, everything else small (every
scenery block except the glass is `lowDetail`; glass is 12 triangles a pane); 0 overlaps, 0
validation problems. Tests: `surf-maps.test.ts` 12/12 and `surf-seams.test.ts` pass for this map.

## 8. Brief and spec requirements

Met: concentric instrument rings round a contained cyclone behind glass, at different
elevations, linked by framed openings (the lens slot, S3, W5, the aperture), circling without a
repeated lap (three layers, the rotation reverses after the portal). Act 1: a broad arc, a
tangential transfer to a smaller-radius arc, a release to a third face lower down (the storm in
view throughout). Act 2: three connected arcs of decreasing radius with a straight seam
between the second and third, a climb to the upper band and a release across an instrument
gap. Act 3: a surf departure onto four bhop pads along an arc that reward the right heading
(each turned 15°), a diagonal jump through a sensor frame, a short ramp, a transfer past a
pillar onto the outer ring. Act 4: a descending helix with two clearly marked exits (a narrow
high slot needing a prepared high line, a broad low opening under the screen), receivers that
run separately and merge before a common stretch into C4. Act 5: a portal into curves turning
the other way, a settling straight before the reversal, a window, a skim of a short ramp, an
opposing catch round the storm's base. Act 6: two rising arcs spending the speed, a lower
fallback arc for a weak first climb, the finish through a large circle of lights with the storm
column framed straight ahead. C1–C5 with the brief's names, seven anchors (R before the helix
and before the portal), restore states, red zones with hatching, palette, fog, landmark,
faster line 9.3 s (brief 6–11 s), clean run 174.6 s (165–195), the 0.75 human finishes.

Approximated:

- **Concentric rings**: Ring I, Ring II, Ring V (10 m off O), the helix (exactly) and 5C
  (exactly) circle the storm; the orbit's arcs are centred 11–52 m off O, 1B, 2D, 3A, 4A, 5A, 5E
  and the rises are not about O (they are the links between rings).
- **The pillar** stands beside the transfer (5 m off its line), not across it: bots and most
  riders pass it without the spec's ±3 m air-strafe bend (I01 dropped its strut for the same
  reason: a straight flight is what the racing line is).
- **Instrument shell**: the spec's red lattice panels on an r 345 cylinder where outward
  over-releases could reach them are not built; the shell here is a dark wall far outside (r
  590, decoration) and over-releases fall into the auto floors (back to the latest anchor
  within a second or two). The brief's "overshooting beyond the instrument shell resets" holds
  through the floors, not a red panel.
- **The glass floor** (spec: y 0, r 240, showing the well) is not built: the auto floors' mist
  under the base act would cover it. The well is a lit disc at the column's foot.
- **The vortex intake** (a red disc under the helix) is not built: the auto floor under the
  helix catches the same falls.
- **E2** is the opening under the lens screen with a cyan-lit lower edge, not a free-standing
  arch (a separate arch clipped R4-hi, which runs right next to 4T there).
- **The merge**: a same-side step from R4-hi (left face) down and across onto 4T (left face),
  not the spec's opposing T4h (55, −24, −12) — the opposing catch cost the bot 20 m/s.
- **The portal** also drops you a layer (≈ 100 m); the spec's portal only turned you.
- **The rises**: T6 is a same-side step (6B and 6C are both left faces, 6C banked); the spec's
  raised opposing catch onto a right face lost 13 m/s. 6B-low's launch throws you through the
  aperture onto the finish gallery rather than back onto 6C's lip.
- **The finish aperture** is a circle of 20 amber lights round the square 24 × 24 gate (blocks
  cannot tilt, so no round frame); there is no telescope tube.
- **Restart bays** feed launch pads, not authored setup ramps (as every surf map so far).
- **Colours per level**: the rings are one silver (per-act shades were not needed: the levels
  read by height and by their instruments).

Not built / missing: the 2D-low salvage ring (below); the red instrument shell panels, the glass
floor and the red intake disc (above); map sound (air-pressure noise, pings, a tonal layer —
no map audio hooks); an animated storm (the bands are static blocks; no engine animation);
per-sector shuttering of the storm's flashes (the flashes are only placed low in the well and
under the dome, away from every window).

## 9. Changes from the spec (and why)

- **Drops ×0.4.** With the spec's drops the steady bot hit the 50 m/s cap in Act 2 and flew
  over the comb at 43 m/s; the bots keep almost all their speed downhill, so every descent is
  scaled by 0.4 (climbs kept). Speeds now sit at 33–38 m/s (I01: 33–40).
- **Lengthened to time.** At 0.4 the route took 149 s; lengthened where a ring could grow
  without changing its role: the orbit's first arc 130° → 180° and its radii 130/120/90 →
  170/145/100 (seam 20 → 35), Ring V 75° → 110° with an 80 m end straight, 4T's straight
  105 → 170, 5A2 110 → 220, the portal's settle 40 → 80, 5E R110 → R125 with a 90 m end, 6A
  150 → 200, 6A' −75° R140 → −120° R165. The comb's lip is the spec's (60 m climbing 12 m): at
  the scaled speeds it delivers the pads' 26–29 m/s.
- **Solved centres.** The turtle trace of the spec drifts; the build solves Ring V's radius
  (its centre ends 10 m from O), 4A's turn and the chord's length (the helix exactly about O;
  4A's radius 150 → 120 so a solution exists), 5A's turn (the portal approach 5° off north
  whatever comes before it) and the portal's exit (5C exactly about O). The layout therefore
  differs from the spec's sketch: the helix exits head west (the spec's south), the portal
  faces north (spec west) and the whole base act is turned 90° about O to match.
- **The helix's drop** goes on its last two turns (2 / 7 / 7 m) so the early exit leaves one
  turn (≈ 13 m) above the main one and R4-hi can run above 4T; at 0.4 everywhere E1 was only
  10 m above E2 and R4-hi sat in E2's flight.
- **E1 at φ 51, not 60.** At φ 60–90 the early line diverged from 4T by 26–110 m; at φ 51 the
  two receivers end ≈ 10 m apart side by side. The slot is 13 × 12.5 m (spec 6.4 × 5.4 → 8 × 3
  "to start"): sized from traced flights at 30.8–42 m/s. Human tests should shrink it.
- **Speed-bleeding climbs kept, opposing catches replaced**: T4h and T6 became same-side steps
  (above), 3B a MID face (60°, 12 m) instead of SHORT (65°, 9 m): the 0.6 bot slid off the
  SHORT face after the diagonal hop and fell twice.
- **Anchors**: R2 and R4b are rings round a ramp; R4b (Spiral, on the helix) and R5's move
  before the portal were added for the ≤ 25 s cadence (the helix + 4T and the portal + 5C–5E were
  27–30 s without them). R6 (the spec's) is kept; the spec's R3a lip bay became the Comb bay
  with a 0.8 s launch.
- **2D-low not built**: every placement tried either sat under 2D (its launch hit 2D's
  underside), on the ridge side (the launch clipped 2D's ridge or crossed the face too fast to
  hold) or needed the fork test to start below 2D's catch; a missed orbit release now falls to
  the auto floor and restarts at R2 (Seam), 11–12 s back. The failure treatment "missed high
  lines reach a slower outer ring" is met by E1 (a failed early exit stays on the helix or drops
  onto 4T) and 6B-low.
- **killY −5** (spec 15): the auto floors' glow sits 26 m under each floor and must stay clear
  of the kill-height plane; the lowest route point is at y ≈ 60.

## 10. Untested assumptions

- Nobody has played it. "Human" numbers are a bot with 0.75 / 0.6 strafe efficiency.
- The 90°/s comfort limit: the helix's last turn (≈ 45–50°/s at 42 m/s), 5A (≈ 40°/s) and the
  5D skim (≈ 38°/s for 0.5 s) are the tightest.
- The early exit: the bot needs to leave at φ ≈ 45–57 from the ridge band with ≥ 28 m/s; how
  early humans see the slot (from φ ≈ 30 only its upper part shows over the helix's ridge; from
  φ ≈ 40 it reads clearly as an amber frame in the dark screen, screenshots) and whether they can
  repeat the release.
- The comb without hold-to-bhop at 26–29 m/s, and whether the 15° heading step reads.
- The portal's −90° view turn at 38–41 m/s, followed by the reversal of the steering hand.
- The helix's red strip at 42 m/s (the bot rides well above it).
- Readability was checked in still screenshots only (the whole course from above, the comb
  and its red bed, the helix with the slot and the lit arch, the portal approach, W5, the
  finish aperture framing the storm): ridges, red zones and the slot read clearly; the storm's
  bands are dim by design and read mostly from close by; the mist floors are busy from above and
  hide the column's foot from the upper layer.
- Online feel of the 5D skim (prediction / rollback).

## 11. The original spec's key numbers (it was never committed)

Pen start (−240, 370, 82) heading north; route ≈ 5.0 km, estimate **≈ 167 s** (fast line ≈ 157 s),
act estimates 29.9 / 25.9 / 26.3 / 36.0 / 28.6 / 20.2 s for practiced humans at V 30.4 m/s.
Key points: R1a (−5, 337, −240) · C1 (163, 308, 6) · R2a (≈ −85, 287, 50) · C2 (136, 268, 103) ·
R3a (69, 265, 260) · pads P1–P4 17.5 / 17.8 / 18.1 m, 15° per hop, 5.5 × 9 · S3 hole 5 × 4 ·
C3 (−300, 238, −23) · R4 (−34, 221, −133) · helix 106 m chord + 150° R70→62 + 120° R62→55 + 120°
R55→48 (drop 38 m, y 212 → 180), E1 at φ 60 through a slot 6.4 × 5.4 at r 78, R4-hi −30° R120,
T4h (55, −24, −12), E2 through a free-standing arch 10 × 7 · C4 (85, 156, 222) · R5 (−3, 141, 299) · P5 facing 270 at (−143, 132, 287), turn −90°, exit (−104, 122, −62) · W5 7 × 5 with a red
lintel, 5D −20° R50, T5d (24, −7, +10) · C5 (18, 72, −135) · R6 (−150, 56, −135) · rises 6B
−60° R80→68 climbing 9, T6 (26, −4, −9) opposing, 6C −45° R62→52 climbing 7 · F (−192, 44, 125).
Salvages 2D-low (WIDE, R95, launch 1.3 s onto 2D) and 6B-low (WIDE, launch onto 6C's lip);
red zones: orbit strips 0.8, the sensor bed, the helix strip 0.8 + a red intake disc (y 150,
r 20–80), W5's lintel, 5E's strip, red lattice panels on the r 345 instrument shell; killY 15,
glass floor y 0 r 240, fog 150–700 m. Faster line estimated 10–11 s ("move the slot 10° later if
over 11 s").
