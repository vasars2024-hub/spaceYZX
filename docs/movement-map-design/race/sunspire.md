# Sunspire — the Sun Clock (as built)

Race track 1 (medium) • map id `race-sunspire` • source
`packages/shared/src/level/maps/race-sunspire.ts` • plan: [REVAMP.md](REVAMP.md) §3.1 and the owner
decisions of 2026-09-27. Built, tested and timed on the race movement (manual Source-style bhop,
surf ramps; race sprint 12 m/s, strafe soft cap 34 m/s). The pen sequence in the source is
authoritative; the numbers below come from it and from `tools/race/*`. §8 lists where the build
departs from the plan and why.

## 1. Identity

|           |                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme     | a sky observatory temple at sunrise: limestone terraces, colonnades and shrines round a colossal gold-capped gnomon standing on a sundial plaza, over a sea of pink clouds                                                                                                                                                                                                      |
| Landmark  | the Sunspire: a ≈300 m bronze-sandstone gnomon in five drums (gold rings between them, three big gold hour rings round the shaft, a stepped gold cap with a glowing tip) at (−10, 170…474, −86), on a round dial plaza with gold hour marks; the hour-mark pads and the finish room wrap its foot                                                                               |
| Palette   | limestone #E8DCC2 / #D2C3A3 (tops, rooms, columns), sandstone #B89868 and bronze #9C7A50 (bodies, gnomon), gold #F2C14E (usable edges, ridges, capitals, rings), lapis #2F5DA8 in six shades (one per act, surf faces), verdigris #3E9C8C (bhop tops), white-gold #FFF1C9 (launch pads, booster rings), sky blue #9FE3FF (anchors), hazard red #E8242C hatched (red zones only) |
| Portals   | one per room, each its own colour and mark: C1 ✦ dawn pink #FF9FB8, C2 ◎ violet #B08CFF, C3 ☀ the Sun Gate (gold #FFC83A), C4 ◆ emerald #4FE0A8, C5 ◐ the Dial Gate (lapis #3F6FE0)                                                                                                                                                                                             |
| Sky / fog | top #4F86D9, horizon #FFD2A8, low east sun, fog 200–950 m, ambient 1.0                                                                                                                                                                                                                                                                                                          |
| Rules     | `jetpack: false`, SURGE on (3 per race), manual bhop (no hold-to-bhop), 1.5 s respawn freeze, kill height 100 m plus narrow auto cloud floors (22 m under each stretch, 20 m wide margin)                                                                                                                                                                                       |

## 2. Route sketch

Top-down, north up (`npx tsx tools/race/sketch.ts race-sunspire`; SVG: [sunspire.svg](sunspire.svg)).
Line characters are the racing line's height in tens of metres (0–9, then a = 100 m … z = 350 m);
`R` anchors, `b` restart bays, `x` red zones, `O`/`o` portal in/out, `S` start, `F` finish. The
rooms sit at each `O`.

```
                                  :::::                                                         O
                              uuvvvvvvvvvv:                                                     b
                            uuu:        :vvv:                                                   z:
                           uu:            :ww:                                                  z:
                          :u:               ww                                                  z:
                          uu                :w                                                  z:
                          :u:               :o      ::qqqqqqqqqqqqqR:::::::: :: ::: :           z:
 o:                        tt                   ::rrrq:::: ::: ::b ::pppppppppppppppppbO        :z:
 z:                        :tt:b           ssx  x:                                               zz
 z:                          tttRs      xxsx                                                     :z:
 z:                               xsxsxxs                                                         ::z:
 z:                                                                                                 :z
 z:                                                                                                  zz
 zz                                  vvRvwvvvvvvvvvvvvvvvvv:                                         :z:
 :z:                           ::v v     b::::::::::::::::vvvv:                                      :z:
  zz:                       vvvvv:                          ::vv:                                     z:
   zz          :: ::: ::uvvvv :                                :vv                                   :z:
    zz:b   Oubuuuuuuuuuu:::                        ll l l       :vv                                  :z
    :zR:                                        ll      F        :vv                                :z:
     ::yy                                      l                  :v:                              :zz
     :::yy                                    mR                   :v                             :zz
       ::yy                                  mmb                     w                           :zz
         :yy                                :m                       Rw                        :zR:
          :y                               :m:                      b  w                       zz b
          :y:                              mm                                                :zz
          :y:                             mm                           x                     zz:
          :y:                            :m:                           x                    :z:
          :y                             :m                                                 :z
         :y:                             :m                            o                    :z
         :y                              :m:                                                :z:
       :xy:                              :m:                                                 zz
       xx                                 mm                                                 :z:
      :x:                                 :m                                                  :zz:
      x:                                   m:                                                  :zzz:
     :x:                                   :m                                                     zzz:
     :x:                                   R:                                                       z::
     :x:                                   n: b                                                       zzz
     :x:                                   :n:                                                           z Sz
     :x:                                    nn:
     :x:                                     :nn:
     :x:                                       nnn::
    b:R:                                         :nnoo:::
     :w:                                            :oooooooooooo:o
     :w:
     :w:
     :w:                               tt t :t:           b
     :w:                             R      :ttttttt:::: ::: ssssssssssssss:
     :w:                           b t            :tttttttttR          :::ssss:
     :w:                             tt                                      :sss
      v                                t t uo                                   sss
      v                                                                           :ss
     v                                                                              rr:
    v                                                                                :rrr:
   u                                                                                   :rrrr::        b
   u                                                                                      :rrrrrrrrrrrrrrRq q q q q qbO
   b
   O
x -413..467 (→ east), z -394..439 (↓ south), 7.3 m per column
line digits: height in tens of metres (0-9, then a = 100 m...); : ramps, x red, 1-5 gates, R anchors, b bays, O/o portal in/out
```

The acts are separate places joined by the room portals, arranged round the gnomon: Act 1 up the
east side (start at the right, `S`, heading west then north), Act 2 from the gnomon's east side
round its north (the hour rings pass ≈110 m east of the shaft), Act 3 along the south (the tholos
at the bottom middle, then east to C3 at the right edge), Act 4 down the west side (the upper
gallery, the highest stretch after the Sun Gate), Act 5 round the buttress in the north-west and
east along the lower terrace, Act 6 low round the gnomon's foot in the middle (y 250 → 209: the
earlier acts pass 70–170 m overhead).

## 3. Phrase graph

```
S (380, 380, 150) → 4 bhop pads round the first shrine (8.8 / 9.5 / 10.3 / 11 m, +15° each, 7 × 9)
  ─(17, −2.5)▶ [1A STD right, lead 10, 30 + 70° R120 + 40, banked] ─R1 Dawn Stair─
  ─(10, −4, +9)▶ [1B STD left, 40 + −45° R140 + 30] ─(12, −4, −9)▶ [1C STD right, 20 + bend to 0° + 40]
  ─(10, −5)▶ C1 Hour Rings (room, heading N) ✦ portal
✦ ▶ step (10 × 14) ▶ launch (26 m, +6, 1.3 s) ▶ gold hour ring 1 (21 m/s, +5) ▶ ring 2 (19, +4)
  ─(22, −6)▶ pads (−2 m steps, ±25°, 15 m) ─R2 Ring Steps─ pads (16 m)
  ─(18, −2.5)▶ [2A channel STD left, 40 + −65° R90 + 60 + scoop climbing 9 m over 35]
  ─ under the red lintel (4.6 m over the line) ▶ raised terrace (8 × 8) ─R3 Scoop Terrace─
  ▶ 4 pads (−1 m, −10° each, 12.5 / 13 / 13.5 m) ─(15, −3)▶ [2B STD left, lead 8, 40 + bend to 270° R70 + 50]
  ─(10, −5)▶ C2 Colonnade ◎ portal
◎ ▶ step ▶ launch (16 m, −2, 1.16 s) ▶ 9 pads wrapping 186° right round the tholos (R 29,
  11 → 14.1 m, 7 × 8, the inner colonnade solid at R 20.5) ─R4 Tholos (after pad 4)─
        ├ Sun Door (faster): pad 3 ▶ gold booster ring between two columns ▶ tholos door ▶ pad 9
        └ Reflecting pool (salvage): shallow pool 16 m under the pads ▶ lamp + launch ▶ pad 6
  ─ speed gap (19, −3)▶ [3A STD left, lead 7, 30 + bend to 90° R120 + 40] ─R5 Sun Steps─
  ─(10, −4, −9)▶ [3B STD right, 55 + 40° R110 + 55] ─(12, −4, +9)▶ [3C STD left, 30 + bend to 90° + 50]
  ─R6 Gate Steps─ 5 pads (−1 m, ±12°, 15 → 16 m) ─(12, −1)▶ C3 Upper Gallery ☀ portal
☀ Sun Gate (+90°, 261 → 360 m) ─(11, −6)▶ [4A STD left, lead 12, 60 + −25° R150 + 40] ─R7 Gallery Stair─
        └ Lower catch ramp (salvage): a short flick lands on a low 16 m face ▶ launch ▶ 4B at s 75
  ─(10, −4, −9)▶ [4B STD right, 40 + 40° R130 + 40] ─(14, −5, +9)▶ [4C STD left, 30 + −15° R150 + 70]
  ─ the sun window (8 × 7 hole in a 20 × 17 wall, a gold sun disc round it) ─R8 Sun Window─
  ─(7, −2)▶ [4D STD left, lead 6, 90 straight] ─(16, −6)▶ 6 pads on the ledge (−1.5 m, +8°, 15 → 16 m, 7 × 10)
  ─(11, −1.5)▶ C4 Gnomon Descent ◆ portal
◆ (turn 180°) ─(11, −6)▶ [5A helix: 12 m × 60°, left, 240° at R70 dropping 29 m, red strip at depth 0.75 on
  its middle 90°] ─R9 Buttress─ (12, −5, −5)▶ 6 pads curving left round the buttress (R 54, −1 m,
  16 → 17 m, 7 × 9; solid fins between them, red floor slabs 9 m below) ─ turn 30° out ─
  ─(10, −0.5)▶ launch ring (26 m/s, +8) under the red sun shade (11.5 m above it, 24 m long)
  ─(41, −12)▶ [5B STD right, lead 12, 30 + bend to 90° R90 + 70] ─R10 Lower Terrace─
  ─(10, −4, +9)▶ [5C STD left, 30 + bend to 90° R110 + 60] ─(10, −5)▶ C5 The Dial ◐ portal
◐ Dial Gate (turn 180°, 250 m) ─(11, −6)▶ [6A STD right, lead 12, 40 + 80° R120 dropping 9] ─R11 Dial Rim─
  ─(10, −4, +9)▶ [6B STD left, 70 + 30° R140 + 70] ─R12 Hour Marks─
        ├ Hour skip (faster): off 6B at full speed straight onto the second mark
        └ Dial pool (salvage): shallow pool 9 m under the marks ▶ lamp + launch ▶ fourth mark
  ─(16, −6)▶ 7 hour-mark pads round the gnomon (R 58, −1 m, 13 → 15 m, 7 × 10) ─ turn 90° in ─
  ─ speed gap (16, −3)▶ finish room at the gnomon's foot
```

STD = 14 m faces at 58° (the plan's medium shape), racing depth 0.35; the helix is 12 m at 60°.

## 4. Numbers

| item                     | count / value                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| racing line              | 4037 m, top speed 36.8 m/s (surf 25–34 m/s, hop chains 13–21 m/s)                                                       |
| rooms / portals          | 5 walled rooms (12 × 14), each with its portal (8 × 7 opening) filling the exit doorway; the finish room (14 × 16)      |
| recovery anchors         | 12 (sky-blue rings, open 7 × 9 restart bays with a launch pad)                                                          |
| surf ramps (curves)      | 17 on the line + 1 salvage ramp; 0 straight wedges                                                                      |
| bhop pads                | 45 (6 chains + 1 raised terrace), all `bhopPads` (teal tops, arrows)                                                    |
| booster rings / launches | 2 hour rings, the launch ring, the Sun Door ring (fork); 2 launch pads on the line, 3 salvage launches, 12 bay launches |
| red zones                | the scoop lintel (Act 2), the helix strip (Act 5), 5 red floor slabs under the buttress chain, the sun shade (Act 5)    |
| shallow pools            | 2 (tholos pool 70 × 70, dial pool 56 × 56)                                                                              |
| optional lines           | 2 faster (Sun Door, hour skip), 3 salvage (reflecting pool, lower catch ramp, dial pool)                                |
| budget                   | 4642 boxes (1484 colliders), **102.8 k triangles**, 61 strip lights, 0 overlaps, 0 validation problems                  |
| network range            | racing line x −400…457, z −384…429, y 209…380 (inside ±490, y < 480); scenery tops out at y 474 (the gnomon's tip)      |

## 5. Rooms, anchors and restore states

Rooms restart you inside them (frozen 1.5 s), then you run out through the portal. Anchors
restart you on their open bay (frozen 1.5 s); its launch pad throws you onto the landing after the
ring at that landing's design speed. "Clean" = when the steady bot passes it; "back → room" = from
that restart to the next room (the tests check every one gets there on its own and is never
faster than carrying on).

|     | name           | clean   | back → next room | clean from there |
| --- | -------------- | ------- | ---------------- | ---------------- |
| R1  | Dawn Stair     | 13.3 s  | 15.4 s           | 11.6 s           |
| C1  | Hour Rings     | 24.9 s  | 31.8 s           | 30.2 s           |
| R2  | Ring Steps     | 31.3 s  | 26.8 s           | 23.8 s           |
| R3  | Scoop Terrace  | 44.7 s  | 13.7 s           | 10.4 s           |
| C2  | Colonnade      | 55.0 s  | 32.3 s           | 31.8 s           |
| R4  | Tholos         | 60.8 s  | 28.3 s           | 26.0 s           |
| R5  | Sun Steps      | 69.3 s  | 21.1 s           | 17.5 s           |
| R6  | Gate Steps     | 82.2 s  | 7.3 s            | 4.6 s            |
| C3  | Upper Gallery  | 86.8 s  | 34.9 s           | 32.2 s           |
| R7  | Gallery Stair  | 97.3 s  | 24.3 s           | 21.7 s           |
| R8  | Sun Window     | 110.0 s | 13.6 s           | 9.1 s            |
| C4  | Gnomon Descent | 119.0 s | 30.7 s           | 29.2 s           |
| R9  | Buttress       | 131.3 s | 19.4 s           | 16.9 s           |
| R10 | Lower Terrace  | 143.3 s | 8.3 s            | 4.9 s            |
| C5  | The Dial       | 148.3 s | 27.8 s           | 26.2 s           |
| R11 | Dial Rim       | 159.8 s | 18.3 s           | 14.7 s           |
| R12 | Hour Marks     | 168.0 s | 9.2 s            | 6.5 s            |
| F   | finish         | 174.5 s | —                | —                |

Recovery cadence on the clean run (start, rooms, anchors, finish): 13.3 · 11.6 · 6.4 · 13.4 ·
10.4 · 5.8 · 8.4 · 12.9 · 4.6 · 10.5 · 12.6 · 9.1 · 12.3 · 12.0 · 4.9 · 11.6 · 8.1 · 6.5 s — at
most 13.4 s (plan ≤ 14 s). Room splits are 24.9–32.2 s apart (plan ≤ 36 s).

## 6. Optional lines (`time-tracks --forks`)

| name             | kind       | line                                                                                                                                                                                                                                      | ridden | racing line              |
| ---------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------ |
| Sun Door         | **faster** | from the third tholos pad a hard inward hop into a 5 × 5 gold booster ring hung between two inner columns (37 m/s, +12); it throws you through the tholos' door (a 7 m opening in the cella) onto the ninth pad, skipping pads 4–8 and R4 | 7.4 s  | 10.4 s (**3.0 s saved**) |
| Hour skip        | **faster** | leave ramp 6B at full speed (≈30 m/s) and fly 28 m straight onto the second hour mark (the first is 16 m)                                                                                                                                 | 3.4 s  | 4.4 s (**1.1 s saved**)  |
| Reflecting pool  | salvage    | fall off the wrap into the tholos pool, wade to the lamp; the launch throws you onto the sixth pad at the wrap's speed                                                                                                                    | 7.0 s  | (from the water)         |
| Lower catch ramp | salvage    | a short first flick in the gallery lands on a wide low 16 m face; its launch throws you back onto 4B at s 75                                                                                                                              | 4.3 s  | (from the fall)          |
| Dial pool        | salvage    | fall off the hour marks into the dial pool, wade to the lamp; the launch throws you onto the fourth mark                                                                                                                                  | 4.4 s  | (from the water)         |

With the Sun Door the steady clean run is ≈ 2:51.5, with both faster lines ≈ 2:50.4. The
racer bot wades 3 s in a pool and then presses R (`bots/racer.ts`), so the salvage lines are
tested as forks, not by the clean or human runs.

## 7. Measured timings (`time-tracks.ts`, 2026-09-27)

|                          | Act 1 | Act 2 | Act 3 | Act 4 | Act 5 | Act 6 | total                 |
| ------------------------ | ----- | ----- | ----- | ----- | ----- | ----- | --------------------- |
| plan budget              | 24    | 30    | 32    | 34    | 32    | 28    | 3:00                  |
| steady bot (clean run)   | 24.9  | 30.2  | 31.8  | 32.2  | 29.2  | 26.2  | **2:54.50**           |
| human 0.6 (design level) | 26.3  | 33.0  | 32.3  | 34.8  | 29.3  | 27.9  | **3:03.65** (0 falls) |
| human 0.55               | 27.1  | 32.6  | 51.9  | 35.4  | 38.5  | 29.4  | 3:34.77 (2 falls)     |

The steady run has 0 respawns, top speed 36.8 m/s, par 3:00. The 0.6 human is 5 % slower than the
steady bot; 0.65 and 0.7 also finish with no falls (3:04.5 and 3:00.1). The 0.55 human falls once
in Act 3 and once in Act 5 and still finishes.

## 8. Changes from the plan (and why)

- **A portal in every room.** Owner decision: each of the five rooms holds its big portal in the
  exit doorway, so there are five portal pairs (the plan named two: the Sun Gate ☀ in C3 and the
  Dial Gate ◐ in C5). The other three got their own colour and mark (✦, ◎, ◆). The portal is an
  air portal whose opening fills the doorway just past the door (its trigger starts 0.1 m past the
  room's floor): a ground portal brings its own platform, which would cut into the room's floor.
  You leave a room at run speed (≈12 m/s), level (`vertical: 'zero'`), so every act starts
  speed-agnostic: a drop onto a curve (Acts 4–6) or a launch pad (Acts 2–3).
- **Layout.** With portals between all acts the acts are separate places round the gnomon rather
  than two continuous laps: high (y 380–305) on the east, north, south and west, then down round
  the buttress (north-west) and low round the gnomon's foot (y 250–209). The gnomon stands at
  the centre of the hour marks, (−10, −86), not (0, 0). The Sun Gate lifts you 99 m (C3's floor
  261 → 360; plan 60 m) because Act 3 descends further than planned.
- **Speeds and length.** Strafing on a surf face adds speed up to the 34 m/s soft cap whatever
  the drop, so the ramps run at 25–34 m/s (plan ~20 m/s) and the route is 4.0 km (plan 3.5–4) with
  more content per act than the plan lists: an extra flick in Act 1; a raised terrace, a second
  chain and a bend in Act 2; two more ramps and a 5-pad chain in Act 3; a 6th ledge pad in Act 4;
  two lower-terrace ramps in Act 5; a 7th hour mark in Act 6.
- **Hop spacing.** On race tracks the racer bot flies every hop at distance ÷ air time (it carries
  no extra pace), so a chain's speed is set by its spacing; chains were spaced for the 0.6 human
  (+0.65 m/s per hop): the tholos wrap grows 11 → 14.1 m (plan 11 → 16), the hour marks 13 →
  15 m (plan 13 → 18), the finish gap is 16 m (−3 m; plan 17 m); the Act 2 chain after the hour
  rings is 15–16 m (plan 12–14: the ring flight arrives at ≈19 m/s).
- **Hour rings in line.** The two booster rings are nearly in line with the chain's first pad
  (the bot, and a player, aim at the landing past them: rings off that line are missed); the flight
  passes ≈110 m east of the shaft, not round it.
- **Behind-the-wall.** The tholos columns and the buttress fins stand on the inside of their arcs
  (solid, ≥ 1.5 m from every pad edge) and hide the far side of the arc, but at 25° (tholos) and
  17° (buttress) per hop the pad after next stays visible over the next pad: hiding it would need
  ~60° per hop. The walls frame the wrap instead.
- **Faster lines.** The Act 4 "upper-window flick" was not built: a 3–4 s saving needs cutting
  ~100 m of path with a ≤ 40 m flight, and the gallery S-curve has no loop to cut. The big faster line is the **Sun Door** in Act 3 instead
  (3.0 s, through the tholos). The Act 6 hour-mark skip is a 28 m flight off the channel past the
  first mark (1.1 s; plan: a 19 m hop needing ≥ 27 m/s, ≈1.5 s).
- **Launch arc.** Act 5's "launch arc under the red sun shade" is a launch ring at the last pad's
  hop (26 m/s, +8), not a launch pad on a platform: a racer lands hopping and hopped over the pad.
  A booster sets your velocity, so the shade (11.5 m over the ring, 24 m long) is a readable
  "don't touch the sky" rather than a real constraint; the red lintel over Act 2's scoop is the
  ceiling that matters (ride the lower half of the face at the release).
- **Recovery.** 12 anchors (plan 12) at ≤ 13.4 s; Act 1's R1 sits in the transfer between the
  first two ramps (a ring can't stand on a face). Bays are the standard open 7 × 9 restart platform
  with a launch pad (the owner's "open restart platform with a run-up"), not walled.
- **Fog and landmark.** Fog 200–950 m (plan 180–800) and a taller, darker gnomon (≈300 m, bronze
  drums; plan 240 m limestone): at 800 m and in limestone it vanished into the peach haze from the
  start terrace (screenshots). The first shrine was lowered to 10 m so the gnomon shows over it.
- **Speed gap onto ramps.** Act 3's speed gap lands on a ramp with a 7 m lead-in (BUILDING says
  ≥ 12 after pads): the gap itself is the point, and falling short drops you in the reflecting pool.
- Act 6 turns 180° out of C5 (plan −90°): C5 faces east and Act 6 starts heading west.
- Gardens and waterfalls: one garden island beside the start and waterfalls off the east terrace;
  the far background is 12 floating islands and 15 clouds (`scatter`).
- No per-map audio (the course format has none).

## 9. Untested assumptions

- Nobody has played it. "Human" is the racer bot strafing on 60 % of its air ticks.
- The room portals: running out of a room at 12 m/s and dropping onto the next act's first ramp
  (the portal preview shows it) — whether players read the doorway portal as "the way on" and how
  the level exit (`vertical: 'zero'`) feels.
- The Sun Door: whether players spot the gold ring between the columns from pad 3 and can make the
  hard inward hop; the ring resets your velocity every tick you are inside it, so where you enter
  it moves the arc by ~1–2 m (the tholos door is 7 m tall).
- The hour skip needs ≈30 m/s off ramp 6B; the steady bot lands 2 m short of the second mark's
  centre (the pad is 10 deep).
- The launch ring in Act 5 is entered from a hop that turns 30°: the 0.6 bot makes it, sloppier
  players may clip its frame side (they then fall to R9).
- Readability was checked in still screenshots only (start terrace, the first ramp with the
  gnomon, C1 with the ✦ portal and its preview, the hour rings, the scoop's red lintel, the tholos
  wrap and the Sun Door ring, the sun window, the helix's red strip, the sun shade, the hour marks
  with the dial pool, the finish at the gnomon's foot, the gallery overview): pads, ridges, red
  zones, rings and portals read. The lapis faces are dark (they read as "ramp" against the peach
  haze but show little shading); the cloud floors of the high acts hang over Act 6; from the start
  terrace the gnomon is a thin spire in the haze (clear from the first ramp on).
- Personal bests: see REVAMP.md §6 — old Sunspire times (15 splits, a 3.2 km route) stay on the
  boards until the planned reset.
