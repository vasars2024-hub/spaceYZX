# Ember Spire — as built (race track 3, very hard)

Built from the revamp plan ([REVAMP.md](REVAMP.md) §3.3 and the owner decisions of 2026-09-27).
Map: `packages/shared/src/level/maps/race-ember.ts` (id `race-ember`, name unchanged). Measured
on 2026-09-28 with the engine's jetpack rules below.

## Identity

An obsidian needle rising out of a lava lake at dusk. It has a glowing crucible crown, a red
sun and a far caldera rim with lava falls. The palette follows "cool colours are safe, hot
colours kill":

| use                            | colour                                                                   |
| ------------------------------ | ------------------------------------------------------------------------ |
| surf faces                     | verdigris-bronze, six shades                                             |
| bhop tops                      | bone                                                                     |
| usable edges                   | ash white                                                                |
| launches, fuel, anchors, rooms | ice blue                                                                 |
| portals                        | ◆ teal, ✦ violet, ▲ white, ◐ green, ▼ blue                               |
| lava orange                    | only the lake, lava falls, the crucible pools, the ash-cloud kill floors |
| hazard red (hatched)           | only red zones                                                           |

Sky: top `#231626`, horizon `#FF7A45`, fog 140–650 m.

## Acts, rooms, anchors

| act             | content                                                                                                                                                                                                    | room (portal)             | anchors                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| 1 Rim Road      | 7 bhop pads (2.8 × 6) curving right past two basalt teeth, a TIGHT 120° bend (9 m × 65°), an opposing flick, 4 pads, a bend into the room                                                                  | C1 Chain Bridge (◆)       | Rim Road, Rim Tooth, Rim Gap                                       |
| 2 Chain Bridge  | launch onto the plates; burn 1 (20 m) under a red ash ceiling 7.5 m up; fuel cell; burn 2 (20 m) past a red side wall; surf, a descending chain, two flicks                                                | C2 Buttress Wrap (✦)      | Fuel Plate, Chain Post, Chain Steps, Chain Posts                   |
| 3 Buttress Wrap | drop-in bend; three 120° wraps of 4 pads round obsidian buttresses (solid band round the pads), a red strip under each; ±60° short flicks                                                                  | C3 Crucible (▲)           | First / Second / Third Buttress                                    |
| 4 Crucible      | a spine crossing onto the pour ledge; **fuel lift** across the crucible to the pipe lip (red hot face under it); forge bars (5 × 4.5 between red bars); pads; two bends; rim steps                         | C4 The Pour (◐)           | Pour Ledge (slow bay), Forge Bars, Crucible Shoulder, Crucible Rim |
| 5 The Pour      | helix ≈ 410° round the needle, two stacked turns spiralling in (R 64 → 46), red strip low on the second turn, red-hot rail outside the first, red roofs over the way out; two flicks; 7 pour steps; a bend | C5 Quench Run (▼, offset) | Pour, Flick Gap, Pour Steps                                        |
| 6 Quench Run    | 8 drop-hop steps (−2 m) under a red ash ceiling 5 m up, a bend, an S of two bends, 5 widening pads, a 17 m gap (−4 m) into the finish                                                                      | finish                    | Ash Steps, Quench Causeway, Quench Pool                            |

Totals: 5 rooms and 20 anchors. Kill floors are ash-cloud banks placed 16–38 m under every
stretch of the line; the course computes them from its own racing line (`coverFloors`), so
every line point has a floor within 45 m below it and 14 m beside it.

Numbers: racing line 3712 m, top speed 36 m/s, 5026 boxes, **99 928 triangles**, 0 overlaps,
0 validation problems. The line stays inside |x|, |z| < 490 and y < 440.

## Measured times (`time-tracks.ts`, steady bot and human 0.85)

| act   | steady (s)  | human 0.85 (s) |
| ----- | ----------- | -------------- |
| 1     | 25.7        | 25.1           |
| 2     | 32.8        | 33.6           |
| 3     | 27.4        | 27.6           |
| 4     | 31.3        | 32.7           |
| 5     | 33.8        | 33.8           |
| 6     | 25.3        | 25.2           |
| total | **2:56.28** | **2:57.97**    |

Both runs have 0 respawns. The longest gap between recovery points (start, room, anchor) on
the clean run is 10.9 s; the plan's limit is 11 s. Every restart bay reaches the next room and
none is faster than riding on; this uses the 1.5 s freeze, and the race-tracks test checks it.

## The jetpack and the fuel tactic

The owner approved two engine changes, and main asked for both:

- **Ignition charge.** Every jetpack ignition on a race track costs `raceJetIgniteSec` (0.15 s)
  on top of the burn. Before this, tapping Space re-ignited the jetpack and each ignition
  stopped your fall. A 1.6 s tank then gave about 6.5 s of level hover, and a scripted glide
  from the helix to the pour steps saved about 15 s. Now the longest hover is about 1.2–1.7 s,
  about 30–40 m of flight.
- **Respawns keep your fuel.** A respawn gives back the fuel you had when you passed that room
  or anchor, never a full tank. The start is a full tank. Before this, pressing R refilled the
  tank.

Tests: `race.test.ts` checks that tapping lasts no longer than holding and that a respawn
restores only the fuel you had.

The fuel economy:

- The bridge burns each need **0.3 s**, charge included.
- The fuel cell after burn 1 refills the tank to 1.6 s.
- The lift needs **0.95 s**. At 0.9 s you come up short and hit the red hot face under the lip;
  there is no mantling over it.
- So only a second bridge burn of at most about 0.6 s leaves enough for the lift.
- The steady bot burns 0.52 s there and reaches the lift with 1.08 s.

**Is the plan's refill worry still a problem?** No. Respawns no longer refill, so the only way
back to a full tank would be restarting the race. A racer with a dry tank takes the dry way
(the salvage fork).

## Optional lines

| line                                                    | kind             | ridden | vs the racing line                               |
| ------------------------------------------------------- | ---------------- | ------ | ------------------------------------------------ |
| Dry tank (the curve round the crucible, launch back up) | salvage (slower) | 6.1 s  | lift line 3.5 s: **the fuel line saves ≈ 2.5 s** |
| Pour skip (ice booster ring from pour step 2 to step 7) | faster           | 4.4 s  | 6.0 s: **saves ≈ 1.5 s**                         |

## Shortcut checks

- **Checked:** a probe tests straight and level-then-drop flights between any two line points
  of a section, with no more than 1.3 s of fuel (the most a racer can bring past C4).
- **Fixed:** it found and I fixed two fuel-free 13–14 s drops in Act 5:
  - the portal ledge down onto the helix's second turn;
  - the first turn down onto the flicks.
- **How they were fixed:**
  - the inward spiral, so the second turn lies 16 m inside the first;
  - a red roof over the second turn's last 80 m and over the flicks;
  - a red-hot rail 4 m outside the first turn.
- **Result:** the probe now finds one candidate. Flown for real, it dies on the red.

## Changes from the plan

- **Fuel line on the racing line.** The fuel line _is_ the racing line, and the outside curve
  round the crucible is the dry-way salvage fork. The bot can't burn on a fork line, and this
  way the clean run itself proves that fuel can be saved. The plan had them the other way
  round.
- **Separate crucible.** The Act 4 crucible stands on its own basalt pillar north-east of the
  needle, not on the needle's crown. Every stretch stacked over another with a 25–48 m gap
  can't have a valid kill floor, and Act 4 would cross over the helix. The needle keeps a
  decorative crucible crown.
- **Five portals.** Every room has its own portal, all in cool colours. The ▲ lift and the ▼
  offset portal are kept, but ▲ is white, not ember gold.
- **Helix.** It spirals inward rather than stacking on one radius, to stop drop shortcuts.
- **Jetpack numbers.** The bridge ceiling is 7.5 m up, not 6: the bot burns in one hold, and
  6 m would kill it. The gaps are 20 m, not 22.
- **Act lengths.** Act 3 runs 27 s against the plan's 32; Act 5 runs 34 s against 32.
- **Budget.** 5026 boxes, 26 over the plan's 5000 guideline; no test enforces it. Triangles
  are well under 180 k.
- **Act 5 faster line.** The plan's "early exit through the lower turn's opening" was replaced
  by the Pour skip booster ring, because the opening would reopen the drop shortcut.

## Untested assumptions

- Nobody has played it. The "human" figures come from a bot that strafes correctly on 85 % of
  air ticks.
- **Fuel budget.** Players read the fuel gauge and plan the 0.6 s budget for the second bridge
  burn. Lighting a burn costs 0.15 s, so a player who taps the jetpack there wastes fuel.
- **Glides.** Glides with curved paths weren't probed; only straight and level-then-drop
  flights were.
- **Readability.** Only four quick stills were taken: start, Act 2 portal exit, pour ledge and
  helix start. The red zones read red and the helix rail reads as clearly deadly but is
  visually heavy. At the start, one basalt tooth stood in the line of sight. I moved and
  shortened it afterwards, and didn't re-screenshot it.
- **Transfers.** Surf-to-pad transfers are fitted to the bot, which rides about 2.4 m under the
  line. Faster or lower riders may clip a pad edge.

## Later

- Screenshot every act and tune the heavy red rail and roofs; dress the rooms as forges.
- Probe curved glide paths; add a fuel check for the dry way.
- Bring Act 3 closer to 32 s and trim boxes below 5000.
