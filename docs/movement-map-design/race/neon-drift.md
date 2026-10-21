# Neon Drift — the night interchange (as built)

Race track 2 (hard) • map id `race-neon` (name and id unchanged) • source
`packages/shared/src/level/maps/race-neon.ts` • plan: [REVAMP.md](REVAMP.md) §3.2 and its
"Owner decisions (2026-09-27)". Built on MOVEMENT_PROFILE v1, **no jetpack**, SURGE kept,
manual bhop (no hold-to-jump), 1.5 s respawn freeze. The pen sequence in the source is
authoritative; the numbers below come from it and from the tools (`tools/race/*`), measured on
2026-09-28 after the race bhop-timing change (jump buffer 0.15 s, land grace 0.1 s).

## 1. Identity

|           |                                                                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Theme     | a maglev interchange floating over violet storm clouds at night: banked violet guideways (the surf), station gantries (the rooms), glass billboards and a billboard drum, parked maglev cars over live rails, red laser gantries                                                                                                           |
| Landmark  | **the Drift Tower** at the map's centre: six lit legs (R 24) with violet rings every 24 m, glass between the legs above the helix, a crown at y 452 and **three magenta halo rings** (R 34 / 44 / 54, y 456–472). Seen from every act; Act 4's helix circles it; the moon (the sky's sun, high in the north-west) behind it                |
| Palette   | night sky #070B1C → #2B1E5C; steel #3A4058 / #2C3146 / #1C2032; **cyan #3FF0FF only on usable edges and ridges**; violet guideway faces (six shades #5B4BD6…#7060EA, one per act); **lime #B6FF3B bhop tops**; amber #FFC23C launches and boosters; pale #D8FCFF anchor rings; finish white-cyan; **hazard red #E8242C only on red zones** |
| Portals   | metro lines, each its own colour and letter (shown over the portal and over its exit): **A** magenta #FF4FD8, **B** mint #2EE6A6, **C** sky #4FB8FF, **D** lavender #C8A8FF, **E** white #F4F4FF, and the fork's express **X** blue #6C7BFF                                                                                                |
| Sky / fog | stars, the moon, fog 160–700 m, ambient 0.8, storm clouds #2A2450 with a violet danger glow #6A3CFF under them (not red), a dark storm sheet #120A30 far below; sodium lamps #FFB347 at the start and every station entry                                                                                                                  |

## 2. Route sketch

Top-down, north up: [neon-drift.svg](neon-drift.svg) (`npx tsx tools/race/sketch.ts race-neon
--svg …`). The acts run anticlockwise round the map's rim and in to the tower:

```
                 Act 2 (north, W→E) ─────────────────────▶ C2 ┐
   C1 ┐                                                        │ Act 3 (east, N→S)
      │ Act 1 (west, S→N)          Act 4: helix round          │
      │                            the Drift Tower ──▶ C4       ▼
   start                                                       C3
      Act 6 (south-west → east, finish at the south-east)
   C5 ◀──────────────── Act 5 (south, E→W) ─────────────
```

Racing line x −462…431, z −386…400 (all < 490), y 330…440 (kill height 318); colliding boxes'
centres ≤ 461; the tallest scenery (city towers, halos) ends at y 473.

## 3. Phrase graph

```
S ─jump▶ 6 bhop pads wrapping left round the billboard drum (R 23, 10.5→14.5 m, −1 m) ─R1 Drum─
  ▶ [G1a MID right: 65 + 90° R60 (banked) + 80] ─R2 Signal Box─ T(14,−5,+9)▶ [G1b MID left: 60 +
  −45° R80 + 130] ─hop▶ 4 pads turning north ─▶ C1 Platform 2 ═A (+90°, level)═▶
  [S-curve MID left: 55 + 60° R45 (outside) + −60° R45 + 55] ─R3 Flyover─ T(14,−5,−9)▶ [F1 MID right]
  ─T(14,−5,+9) under the red laser gantry (3.6 m over the flight's middle)▶ [F2 MID left: −75° R70]
  ─R4 Crossover─ T(14,−5,−9)▶ [F3 MID right: 40° R90 + 90] ─hop▶ 4 pads turning east ─▶ C2 Junction
  ═B (+90°)═▶ 5 zigzag pads (±50°, −2 m, 13→14.5 m) ─R5 Billboards─ 6 pads (15→17 m); three
  billboards between same-side pads (the second low, the booster ring over it) ─R6 Alley End─
  ▶ [C3a MID right: 35° R80] ─window 5.5 × 7.5: red side bars, a red laser across at 4.5 m─▶
  [C3b MID left: −40° R80] ─R7 Roofline─ T(14,−5,−9)▶ [C3c MID right, bend to south, early 3]
  ─16 m speed gap under three red lasers▶ station roof ─▶ C3 Interchange ═C (−90°)═▶
  [helix TIGHT left (outward face): 10 + 140° R55 + 140° R55 (red ≥ 0.75), 38 m down]
      └ faster line: over the ridge at φ 185 onto the core deck, 3 hops (R 40), express portal X
  ─R8 Helix Foot─ T(14,−5,−9)▶ [catch MID right: 30 (−15) + 120° R≈80 round the tower + 130]
  ─R9 Halo Stair─ T(14,−5,+9)▶ [C4b MID left: bend to 20°, R45] ─R10 Gantry Steps─ T(14,−5,−9)▶
  [C4c MID right: bend north] ─▶ roof ─▶ C4 Halo ═D (−90°)═▶ [drop-in MID right: 90 + 20° R100]
  ─R11 Yard Throat─ 4 pads ─R12 Live Rails─ 4 pads (8 in all, ±35°, 18→19.5 m) between two rows
  of parked maglev cars over red live rails 10 m down ─▶ [SHORT 9 × 65° right, −25° R50 kick]
  ─T(18,−11,+10)▶ [far guideway MID left, bend to 250°] ─R13 Car Shed─ T(14,−5,−9)▶ [C5c MID
  right, bend west] ─hop▶ 3 pads ─▶ C5 Terminal ═E (+135°)═▶ [MID right: 80 + 45° R40 + 80]
  ─R14 Last Train─ T(14,−5,+9)▶ [A-frame spin: left face ─crest─ right face ─crest─ left face]
  ─R15 Halo Gate─ hop▶ 6 pads widening 15→17 m, curving 90° left ─17 m gap under two red lasers▶ F
```

## 4. Numbers

|                           |                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| racing line               | 4807 m; top speed 48.5 m/s (the helix); surf 30–48 m/s, bhop 13–25 m/s                                                              |
| rooms / anchors / portals | 5 walled station rooms (C1–C5), 15 recovery anchors, 5 room portals + the express X                                                 |
| ramps                     | 21 curves on the line (+ spine pieces), 1524 hull pieces; no `surf` wedges, no walkways                                             |
| bhop pads                 | 42 on the line (+ 3 on the express)                                                                                                 |
| red zones                 | 16 red blocks (the flick laser, 2 window bars + its laser, 3 speed-gap lasers, 2 finish lasers, 7 live-rail beds) + the helix strip |
| budget (`check.ts`)       | 5828 boxes, **≈ 120 k triangles**, 0 overlaps, 0 validation problems, 12 lights                                                     |
| par                       | 180 s (DNF at twice par)                                                                                                            |

Face shapes: MID 12 × 60°, TIGHT 11 × 63° (the helix), SHORT 9 × 65° (the rail-yard kick), SPINE
12 × 60° A-frames. Every scenery block except the glass is `lowDetail`; the tower legs, rings,
halos, laser posts and city are non-colliding; the drum, billboards and maglev cars are solid
(the walls the hop chains go round) and stop above the kill mist.

## 5. Timings (`time-tracks.ts`, clean runs split per act)

|                          | Act 1 | Act 2 | Act 3 | Act 4 | Act 5 | Act 6 | total       |
| ------------------------ | ----- | ----- | ----- | ----- | ----- | ----- | ----------- |
| plan                     | 24    | 30    | 31    | 35    | 33    | 27    | 3:00        |
| steady bot (clean run)   | 27.1  | 30.0  | 28.7  | 27.6  | 34.8  | 26.8  | **2:55.05** |
| human 0.8 (design level) | 27.0  | 30.4  | 29.3  | 27.5  | 35.1  | 26.6  | **2:55.88** |

Splits (steady): 0:27.08, 0:57.12, 1:25.83, 1:53.45, 2:28.28, finish 2:55.05, 0 respawns. The
human bot at 0.8 also finishes without a fall. At 0.7 it stalls in the rail yard, at 0.6 in the
Billboard Alley zigzag (a hard map: the test asks for 0.8). The race bot lands every hop on the
pad's middle, so its bhop pace is the pads' spacing, and a human who keeps speed through the
rooms (the bot runs each room at 12 m/s) is faster than these numbers.

**Recovery cadence** (room or anchor passed on the clean run, s): 5.6, 9.8, 11.6, 10.1, 10.3,
9.6, 5.3, 5.6, 12.2, 5.6, 12.3, 6.9, 3.9, 4.5, 9.8, 3.6, 11.8, 9.7, 10.4, 10.6, 5.8 — the longest
**12.3 s** (plan: ≤ 13 s).

## 6. Rooms and anchors

A fall after a room puts you back in the room (walled, roof, the line's colour in a band along
its walls, a sodium lamp at the entry, its portal in the exit door). A fall after an anchor
puts you in its open restart bay (a 7 × 9 platform with a launch pad a step ahead) after the
1.5 s freeze. "Bay → next room" = `time-tracks --sections` (the steady bot from standing, the
freeze not counted); every one reaches the next room and is slower than riding on (the test).

| #   | name         | passed at (steady) | bay → next room |
| --- | ------------ | ------------------ | --------------- |
| R1  | Drum         | 5.6 s              | 23.9 s          |
| R2  | Signal Box   | 15.4 s             | 15.5 s          |
| C1  | Platform 2   | 27.1 s             | 32.6 s          |
| R3  | Flyover      | 37.2 s             | 23.9 s          |
| R4  | Crossover    | 47.6 s             | 13.3 s          |
| C2  | Junction     | 57.1 s             | 30.9 s          |
| R5  | Billboards   | 62.4 s             | 25.5 s          |
| R6  | Alley End    | 68.0 s             | 22.9 s          |
| R7  | Roofline     | 80.2 s             | 9.6 s           |
| C3  | Interchange  | 85.8 s             | 28.7 s          |
| R8  | Helix Foot   | 98.1 s             | 22.8 s          |
| R9  | Halo Stair   | 105.0 s            | 14.4 s          |
| R10 | Gantry Steps | 108.9 s            | 19.5 s          |
| C4  | Halo         | 113.5 s            | 36.3 s          |
| R11 | Yard Throat  | 123.3 s            | 27.2 s          |
| R12 | Live Rails   | 126.9 s            | 22.9 s          |
| R13 | Car Shed     | 138.6 s            | 13.5 s          |
| C5  | Terminal     | 148.3 s            | 28.4 s          |
| R14 | Last Train   | 158.7 s            | 21.1 s          |
| R15 | Halo Gate    | 169.3 s            | 8.2 s           |
| F   | finish       | 175.1 s            |                 |

Custom bays: Drum (16 back, 12 out, 5 up, 1.0 s: the default sat inside the drum), Billboards
(6 back, 15 out, 3 up, 0.9 s: the default was in the zigzag), Alley End (6 up: a 12 m drop in
1.1 s lands back on its own bay), Live Rails (16 back, 12 out, 2.5 up, 0.7 s: fast enough that
the pads after it can be hopped from it). Bays that land on a pad land at that pad's pace.

**Falls** (Basalt Cathedral's method: every 6th line node, both sides, 3 m off the line at
30 m/s along it and 8 m/s outward, no input; 6 samples inside rooms land on the floor and are
not falls): 426 falls, **median 1.8 s, 90 % 2.2 s, the slowest 3.6 s** (one sample, off the
helix's east side; none over 4 s). How:

- **Cloud seas** (`autoFloors`, 22 m under each stretch, reaching 25 m past it) catch most falls
  in under 2.5 s.
- **The kill height is y 318**, 12 m under the lowest part of the route (the C4 room, y 330): a
  rider thrown far out, past every cloud sea, is gone after at most a 123 m drop (≈ 3.5 s from
  the highest point, y 441). Before, it was y 200 and 34 of the falls (8 %) took 4–6 s (off the
  helix's outer side and the first half of Act 2, where the cloud seas have to stay above the
  ramps under them). The tower legs and the city now stand on y 319, and a dark storm sheet
  (a `water` plane, y 302) replaces the engine's flat danger glow at the kill height, which the
  lowest cloud seas would cut through.
- **Two hand-placed patches** where the longest falls went: off the helix's east side (x 68…150,
  z 3…80, top y 392) and off Act 2's first bend (x −240…−150, z −290…−190, top y 400). Nothing of
  the route, no bay and nothing you land on lies under or in them (`validateCourse` and the
  track test check it).

## 7. Faster lines (`RaceDef.forks`, ridden by the tests)

| name              | line                                                                                                                                                              | ridden (steady) | racing line | saved     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------- | --------- |
| Billboard skip    | from zigzag pad 5 hop sideways up through the amber booster ring (28 m/s + lift) over the low billboard; land on pad 8                                            | 3.1 s           | 4.1 s       | **1.0 s** |
| Core-deck express | climb to the helix ridge by φ 185, over it onto three bhop pads on the core deck (R 40, 15 m apart), express portal X (level exit) onto the catch's last straight | 5.5 s           | 9.7 s       | **4.1 s** |

Both together: ≈ 2:50.0 for the steady bot. The booster ring's trigger starts 1.2 m above pad 5,
so a run-off from the pad misses it: it needs a real hop (the "upper band").

## 8. Plan items

**Met**

- Six acts on the plan's themes and order; 170–190 s (175.05 steady, 175.88 human 0.8); rooms
  ≤ 36 s apart (the longest 34.8 s); recovery ≤ 13 s (12.3 s).
- Five walled station rooms C1–C5 ~30 s apart, each with its big portal in the exit doorway
  (owner decision); metro-line colour + letter on every portal; level exits (`vertical: 'zero'`);
  every room exits onto a drop-in guideway or a pad chain, so a respawn and a clean run leave the
  same way.
- Open restart anchors (15) with launch-pad run-ups between the rooms.
- Jetpack off (`jetpack: false`); SURGE kept; manual bhop; 1.5 s freeze.
- Source-style bhop that gains speed (chains widen: 10.5→14.5, 13→17, 15→17, 18→19.5 m); curved
  behind-the-wall bhop round the round billboard drum; zigzag between glass billboards; rail-yard
  weave between parked cars.
- Every ramp a curve: banked guideway, S-curve with flicks, the 280° helix, an A-frame spin with
  two spine crossings (the "guideway spin"), a short-face kick into a flick.
- Red zones clearly marked and all reachable by the red test: laser gantry over a flick, window
  bars + laser, laser ceilings over both long gaps, the helix strip, live-rail beds.
- Speed gaps: 16 m onto the station roof, 17 m into the finish.
- No straight running over 12 m (no walkways at all), no surf wedges, pads ≥ 1.5 m from walls.
- The ring tower landmark (seen from every act), night palette with meanings, stars and moon, fog
  far 700 m, lime/amber/cyan/violet each used for one thing, red only on red.
- Budget ≤ 180 k (≈ 120 k); network range kept; 0 overlaps.
- Falls reset within ≈ 3.5 s (median 1.8 s, the slowest 3.6 s; §6).

**Approximated**

- **Portals in every room** (owner decision) instead of the plan's two (Line A in C3, Line B in C5):
  lines A–E; the fork's portal is **X** (the plan's "Line C if the core drop needs one").
- **Act 4 core drop**: a chord across the helix saves little (a circle's chord is barely
  shorter than its arc at bhop speed), so the core drop goes over the ridge onto three pads on
  the core deck and the **express portal X**, which puts you far along the catch (4.1 s, plan
  ≈ 4 s). The pads circle inside the helix rather than crossing the core.
- **Helix 280°** (plan 300°): at 300° its end sat under its own start and the kill mist under
  the start could not fit (it must stay 3 m clear of the catch under it). Its red strip is on
  the second half (depth ≥ 0.75).
- **Billboard skip** is ≈ 1.0 s (plan 1.5 s) and uses the ring over the **second** billboard,
  made low; the ring is beside pad 5 (a hop's apex away), not over the middle of the zigzag.
- **Act lengths**: Act 1 27 s (plan 24) and Act 4 27.6 s (plan 35): the helix is fast (40+ m/s)
  and Act 4's tail had to stay short to keep its room clear of Acts 2 and 3; Act 5 34.8 s (33).
- **Act 4 tail** is two guideways and a roof, not a pad chain: the race bot can't hop a chain
  at guideway speed from a restart bay (it brakes to land on pad middles), so the chain made the
  recovery test fail.
- **Rail-yard cars** stand in two rows either side of the zigzag (between them the chain
  weaves), not between the pads: a car between same-side pads sat in the natural overshoot of a
  hop. The zigzag is ±35° as planned (turns of 35°, headings ±17.5°).
- **Anchors**: 15 (plan 13).
- **Finish**: the finish gantry is ~240 m south-east of the tower (the halos stand high over the
  view), not under it: the tower's surroundings hold the helix and its catch.
- **Station dressing**: the stock room plus a line-colour band and a lamp; no split boards
  (room style is the engine's `stageRoom`).

**Missing / not built**

- Maglev cars in a rail **yard** (tracks, sheds) beyond the car rows; the city is 14 far dark
  towers with neon bands.
- Sound (no per-map audio hooks).

## 9. Changes that bit the build (for Ember)

- The race bot aims every hop at the pad's middle and only counts a pad reached within 3.5 m of
  it; at more speed than the spacing it lands short and brakes. Keep pad spacing ≈ speed × 0.82 s
  (−1 m steps) for the speed the bot actually carries, and let bays land at that pace.
- A curve followed by pads should end `go: 'hop'` (`hopOff`), else the bot runs a tick on the
  first pad.
- `autoFloors` puts one floor under each stretch's bounding box: any ramp or room of another act
  within 25 m of that box and 3–28 m under the floor shrinks or kills it. Keep acts apart in plan
  (or in height by ≥ 32 m); hand-placed `floors` may not have any line node under them.
- A laser 4.2 m over a flight is hit by a rider rising off a ramp's end: lasers stay ≥ 4.6 m up,
  and `early: 3` on a ramp before a gap stops the bot riding up the ramp's end.
- A restart bay whose launch drops more than 10 t² − 1 lands back on its own platform.
- Scenery positions rounded to 0.1 m make 0.05 m gaps disappear (use `r3` for thin layers).

## 10. Untested assumptions

- Nobody has played it. "Human" is a bot with 0.8 strafing that lands on pad middles; real
  players keep speed through rooms and over pads and will be faster, but may find the ±50°
  zigzag and the rail yard harder than the bot does.
- The core-deck express: the bot climbs over the helix ridge at φ 185 and drops onto the core
  deck cleanly; whether people read the X portal from the helix (it is inside the tower's legs).
- Laser heights (3.6 m over the Act 2 flick, 4.6–4.3 m over the gaps) were set from the bot's
  flights; a rider who jumps off a ramp's end may hit them.
- Falls were sampled with one kind of fall (sideways off the line at speed); a rider can still land on a drum, billboard, maglev car or another act's ramp and have to press R.
- Readability was checked in still screenshots only (the drum and start, the Act 2 laser, the
  zigzag with the booster ring, the framed window, the speed-gap lasers and station roof, the
  tower with the helix and halos, the core deck and X portal, the rail yard, the C2 room with
  its portal, the finish): red zones read red, portals show their destination, the tower reads
  from everywhere. The flat billboards were dark slabs at first and now carry lit bands behind
  the glass. The generic race HUD hint still mentions the jetpack and gravity boots.
- Online feel (prediction) of the 1.2 m booster-ring band and of the short-face kick.

## 11. Tests

`packages/shared/test/race-tracks.test.ts`: `race-neon` added to `REVAMPED` (recovery 13 s), so
it runs the rebuilt-track rules (5 rooms, 170–190 s, rooms ≤ 36 s, recovery ≤ 13 s, no jetpack,
no wedges or long walkways, pads clear of walls, bays reach the next room and are never faster,
red zones kill at their surface, forks ride and save time, portal exits clear, the line inside
every room) — 17/17 pass. `tools/race/test/surf-seams.test.ts`: `race-neon` added to
`REVAMPED_TRACKS` (its curves ridden at 0.8 / 1.0 / 1.15 V) — passes.
`packages/server/test/race.test.ts` (three hard bots race Neon Drift in a room) passes.
