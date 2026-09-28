# Race tracks revamp plan (Sunspire, Neon Drift, Ember Spire)

A plan only. No code changes yet. It covers the three parkour race tracks
(`packages/shared/src/level/maps/race-*.ts`, ranked Race pool `raceTracks()`), rebuilt to the
standard of the finished surf maps (`surf-copper-reef.ts` / [B01](../maps/B01-copper-reef.md),
`surf-lantern-canal.ts` / [B04](../maps/B04-lantern-canal.md)) while staying **parkour races**:
Source-style bhop that gains speed, with surf ramps and flicks as parts of the race.

Sources: the brief (`Complete-Map-Design-Brief.md` §2, §3.2, §4.1–4.5, §5, §6, §7, §13, §15),
`BUILDING.md`, `movement-profile.md` (MOVEMENT_PROFILE v1), `maps/README.md` (formulas), the
course engine (`level/course/*`), `sim/race.ts`, `bots/racer.ts`, `race-tracks.test.ts`,
`docs/PLAYING.md` (Parkour races) and `packages/server/src/services/ranked.ts`.

**Owner requirements kept by every part of this plan:** tracks of about 3 minutes; tactical and
actually hard; Source-style bhop that gains speed, with surf ramps and flicks inside the race;
curved behind-the-wall bhop, interesting mechanics, challenging platforming, **no long straight
running**; walled checkpoint rooms, big portals between sections, sky courses where the floor
(and, new here, a red "sky" ceiling) means death; **no gravity boots, no zip-rails**;
semi-transparent racers (already in: see-through, no collision); clipping-free geometry.

## 1. What is dated today, and why

Measured on 2026-09-27 (`time-tracks.ts`, steady bot) and with a scratch script over
`mapDef` + `tools/race/budget.ts` (triangles as the level mesh draws them):

|                            | Sunspire         | Neon Drift       | Ember Spire       | Copper Reef (B01) | Lantern Canal (B04) |
| -------------------------- | ---------------- | ---------------- | ----------------- | ----------------- | ------------------- |
| steady clean run           | 2:51.7           | 2:51.5           | 2:48.5 (par 3:30) | 2:51              | 2:51.4              |
| racing line                | 3240 m           | 3177 m           | 3100 m            | 5740 m            | 5478 m              |
| checkpoints (rooms)        | 15               | 16               | 15                | 5 gates           | 5 gates             |
| recovery anchors           | 0                | 0                | 0                 | 9                 | 11                  |
| surf ramps                 | 19 flat wedges   | 19 flat wedges   | 17 flat wedges    | 21 curves         | 18 curves           |
| curved pieces (`hull`)     | 0                | 0                | 0                 | 1358              | 1431                |
| hop / jump pads            | 60               | 61               | 68                | 7 bhop pads       | 7 bhop pads         |
| red zones                  | 0                | 0                | 0                 | 1 strip           | 4 blocks + strips   |
| portals (colour / glyph)   | 4, one colour, – | 4, one colour, – | 3, one colour, –  | 1                 | 2, ☾ / ◆            |
| forks (faster / salvage)   | 0                | 0                | 0                 | 2                 | 8                   |
| boxes (of which cloud sea) | 4655 (1548)      | 4783 (1408)      | 4344 (1276)       | 2178              | 3341                |
| triangles                  | ≈ 101 k          | ≈ 99 k           | ≈ 89 k            | ≈ 147 k           | ≈ 175 k             |
| lights                     | 35               | 68               | 38                | 42                | 46                  |

**Shared problems (all three were written from one template in `course/sections.ts`):**

- **Geometry is from before the foundation.** Every surf section is `surfRun` (flat `surf`
  wedge prisms dropped in with `entry`), so every ramp is a straight wedge. Nothing uses `curve`
  (bends, scoops, spirals, spines), `gate`/`anchor` with authored bays, `red`, `bhopPads`
  (bhop tops + arrows), `airPortal` (turn, `offset`, `vertical: 'zero'`, colour, glyph),
  `branch` + `forks`, solid/`glass`/`lowDetail` scenery blocks, `lamp`, `water`/`shallow`, or
  the palette slots `bhop`, `hazard`, `anchor`. Brief §15.1's first reject ("mostly straight
  wedges separated by empty space") describes all three.
- **The same act loop, three times.** Hop chain → wedge surf run → pillar weave
  (`wallBeside` 2.5 m posts) → launch pad → rectangular window → "drop strafes" (pads 4 m down
  with ±40–80° turns) → portal → repeat. Neon and Ember are Sunspire's loop with smaller pads
  (6 → 5 → 4.5 m) and steeper faces (55° → 60–64° → 62–66°): brief §15.1 "difficulty comes
  mainly from shrinking everything".
- **Rooms without meaning.** 15–16 identical `stageRoom`s (one per stretch). 3–4 of them are
  portal arrival rooms whose split is 1.5 s (e.g. Sunspire 0:28.45 → 0:29.98): a checkpoint
  with no content. The exit usually drops you onto a 9 m first pad sized for a standing start,
  so the clean run and the respawn want different things.
- **Landmarks are a rotation, not a place.** `landmark()` puts a generic 20 × 20 island with a
  tower, arch or two waterfalls 60 m beside every room, alternating sides and kinds, 15 times per
  map, identical in all three maps except the colour. No single landmark is seen from several
  acts (brief §6.1); the rest is seeded `scatter` islands, clouds and spires.
- **Straight running.** Beams (`path` 16–26 m, 0.8–1.2 m wide) and run-ups are walked in a
  straight line; launch landings are big flat platforms (brief §5: "land anywhere, recenter").
- **Palette and light.** One sun, ambient 0.85–1.05, short fog (110–140 near, 480–560 far) that
  eats the distant architecture; rooms supply most lights. Colour carries no meaning:
  `surfColors` cycles three hues per room, orange/red is used on usable things, so red zones
  could not be added without repainting.
- **Jetpack everywhere.** No track sets `jetpack: false`, so every track (Sunspire too) gives a
  1.6 s race tank refilled at every respawn: anyone can burn across any gap we build.

**Per map:**

| map                   | geometry                                                                                                                                                        | palette / light                                                                                                                                                  | what it should have used                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sunspire (medium)     | 19 wedges (55–58°), 60 pads 5–6 m, 10 walls, 4 launches, 3 boosters (2 air rings), 2 windows, 3 beam walks; `garden()` islands with trees, lanterns, waterfalls | cream ground, gold edges, sky-blue/teal/lavender ramps; **orange pads, red finish and red accent** next to the danger colour; sunrise sky, fog 140–560           | a real temple to race round, curved channels, colonnades for behind-the-wall hops, a lower salvage (medium map), glyph portals                              |
| Neon Drift (hard)     | 19 wedges (60–64°), 61 pads 5 m, 18 walls/posts, 2 jetpack gaps over empty air (brief §5.4: "unlimited thrust over an empty gap is weak"), 2 broken beams       | slate + cyan edges on everything, magenta ramps, **danger #FF2A6D, portal #FF4FD8, finish #FF3B6B all pink-red**; 68 lights, all equally bright: no hierarchy    | red zones (none possible with this palette), glass for the city, a transit identity (rooms as station gantries: brief §6.4), a spiral that is really curved |
| Ember Spire (v. hard) | 17 wedges (62–66°), 68 pads 4.5 m, 18 walls/posts, 3 jetpack gaps (two on one cell), 2 booster rings, 3 windows 3.2 m                                           | **red surf ramps (#C9432C)**, orange edges, orange "water", orange crystals, danger #FF4A12: every usable surface is in the hazard family; dusk sky, fog 110–480 | "cool usable, hot deadly" colours, red ceilings that make the jetpack a skill, fuel that is a route choice, a spire you actually climb and descend          |

## 2. The race standard

Everything below exists in the engine today unless §4 says otherwise. Course expansion is
kind-agnostic: `curve`, `gate`, `anchor`, `red`, `bhopPads`, `airPortal` and `forks` all work
in a `kind: 'race'` course (only `surf`, `noJetpack`, `noSurge` and the 0.5 s penalty depend on
`kind: 'surf'`).

### 2.1 Adopt from the surf foundation

| feature                | race-track rule                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| curves (`pen.curve`)   | every ramp is a `curve`: bends, scoops (`drop` < 0 legs), S-curves, helices, A-frame spines (`ride` per leg). `lead` ≥ 5, ≥ 12 after pads and portals. Stacked helix turns ≥ max(h, (1 − d)h + H + 3) apart. No `surfRun`/`surf` wedges left.                                                                                                                                                                          |
| checkpoints            | **C1–C5 stay walled rooms** (`stage`, owner requirement) at the act boundaries, cardinal ±15° (their trigger is an AABB). No arrival rooms after portals.                                                                                                                                                                                                                                                              |
| anchors (`pen.anchor`) | fly-through rings between rooms, each with an authored bay (`BayOpts`: `back/side/up/flightSec`, or `at/heading/to`). Cadence §2.2. The bay's launch must arrive at the **design speed of what it lands on** (for a pad: `flightSec` so v_h is within ±10 % of that pad's design speed; `to` = the middle of a long pad).                                                                                              |
| portals                | the "big portals between sections" go **in a room's exit doorway** (`stage` then ground `portal`, or `airPortal` just past the door): passing the room counts, the portal throws you into the next act at speed. Every pair has its own `color` + `glyph` (shown over it and its exit), the exit preview disc is automatic, `vertical: 'zero'` on lifts, `offset` only where half the opening is clear round the exit. |
| red zones              | `red` blocks and curve `red` strips shape lines: red floors under hard chains, red strips low on helix faces, red bars in windows, **red ceilings above launches and jet gaps** (the sky that kills). Hazard red (#E8242C, hatched) is used on nothing else: no red/orange pads, finishes, ramps or edges.                                                                                                             |
| bhop pads              | `bhopPads` (own top colour `palette.bhop`, arrows to the next pad) for every hop chain; `hopChain`/`vary` pads retired.                                                                                                                                                                                                                                                                                                |
| forks                  | 1–2 bot-ridden faster lines per map (`branch` + `CourseFork`, 3–6 s), salvage lines only on Sunspire; the tests ride them.                                                                                                                                                                                                                                                                                             |
| scenery                | bespoke architecture from `block` (round columns, `solid` where it is part of the challenge, `glass` panes, `glow`/`trim` strips, `lowDetail` for everything never seen up close), `lamp`, `arch`, `lighthouse`-style towers; `scatter` only as far background (≤ 15). One landmark seen from ≥ 4 acts.                                                                                                                |
| water                  | a `water` sea/lake plane for scale; `shallow` pools only as Sunspire's second chances (floor ≥ 2 m above `killY`).                                                                                                                                                                                                                                                                                                     |
| palettes and skies     | one meaning per colour (usable edge, surf face, bhop top, launch/booster, each portal pair, anchor ring, hazard); ramp colour per act via `curve.color` (six shades of one family, not `surfColors` cycling); fog far ≥ 600 m so the landmark reads; lamps along landings.                                                                                                                                             |
| budget                 | ≤ 180 k triangles, ≤ 5000 boxes (`check.ts`); 0 overlaps; everything inside ±490 m; stays 10 m above `killY`.                                                                                                                                                                                                                                                                                                          |

### 2.2 Parkour rules that differ from surf

- **Pacing.** A surf map is ~5.5–5.8 km at ~32 m/s; a race track is ~3.5–4 km at ~20 m/s, so it
  needs **a new decision every 3–5 s**. Mix per map: ~45 % parkour (bhop, jumps, launches),
  ~40 % surf, ~15 % portals, rings, rooms. Six acts of 24–35 s (brief §7.1); C1–C5 rooms between
  them; anchors inside. Recovery cadence (clean run, room or anchor): Sunspire ≤ 14 s, Neon ≤ 13 s,
  Ember ≤ 11 s. Respawn freeze stays 1.5 s (`racePenaltySec`).
- **No straight running.** No `path` longer than 12 m on the main line, no beam walks, no run-up
  longer than a room's floor; landings are shaped (offset, L-shaped, narrow-side entries,
  high/low alternation: brief §5.1), never a big square to recenter on.
- **Bhop spacing (profile v1).** Air time t = (6.93 + √(48 − 40Δy)) / 20: level 0.69 s, −1 m
  0.82, −2 m 0.91, −4 m 1.07; a hop rises only 1.2 m, so chains go level or **down**. Centre
  spacing d_k = v_k × t, with v_k = v_0 + k × gain at the map's design strafing: human 0.6 gains
  0.8 / 0.65 / 0.55 / 0.45 m/s per hop at 12 / 16 / 20 / 25 m/s, steady 1.22 / 1.02 / 0.87 /
  0.73. Level spacing: 12 m/s 8.3 m · 16 → 11.0 · 20 → 13.8 · 25 → 17.3 · 30 → 20.7. Pad depth
  along the hop ≥ 0.4 d + 2 (Sunspire), ≥ 0.3 d + 2 (Neon, Ember); width across by difficulty:
  Sunspire 6–8 m, Neon 4–5 m, Ember 2.4–3.2 m (3–4 W). Difficulty comes from turns, walls, red
  floors and speed demands; Ember's pads are narrow across but never short along.
- **Curved behind-the-wall chains.** Turn per hop ≤ 60° (≤ 87°/s at level air time; strafe turns
  at 179°/s are possible at 15 m/s, so this is comfort, not physics); the wall stands on the
  inside of the arc and hides pad k + 2 until you take off from pad k (brief §5.1 corner wrap:
  the **next** landing is always visible before take-off). Keep every pad edge ≥ 1.5 m from a
  wall face: an early jump press within 0.35 m of a wall fires a **wall-jump** instead of a
  buffered bhop (`sim/movement.ts`).
- **Jump distances.** From a standing respawn you run at 12 m/s: J = 8.4 m (comfortable 7.1).
  Gaps taken from a run: Sunspire ≤ 0.7 J (5.9 m), Neon ≤ 0.85 J (7.1 m), Ember ≤ 0.95 J (8.0 m).
  **Speed gaps** (only carried speed clears them): required speed = gap / t ≤ 0.9 × the design
  speed there (a 15 m level gap needs 21.7 m/s; 17 m needs 24.6).
- **Room exits are speed-agnostic.** A clean run passes a room at 20–30 m/s, a respawn starts at
  0: every room exits onto a drop-in curve, a launch pad, or a first pad long enough for both
  (depth ≥ 0.69 × (v_clean − 12) + 4 m). SURGE (3 per race, +60 % for 1 s) off a room floor is a
  tactical choice, never required.
- **Surf inside a race.** Sunspire: STD 14 × 58° / MID 12 × 60°, turn rate ≤ 90°/s. Neon: MID /
  TIGHT 11 × 63°, ≤ 90°/s main, 120°/s on forks. Ember: TIGHT / SHORT 9 × 65°, ≤ 120°/s in Acts
  4–5 (hard map, stated per arc). Rider radius ≥ max(v / ω, C(v)). Transfers T(f, u, s) with
  −(10t² + 3) ≤ u ≤ −(10t² − 1). Surf-to-bhop: the first pad is aligned with the ramp's exit
  tangent; bhop-to-surf: the last hop boards the upper band with `lead` ≥ 12.
- **Readability at race speed.** Next landing visible ≥ 1.5 s before take-off; pad tops in the
  bhop colour with arrows; usable edges in the edge colour; nothing decorative within 3 m of a
  flight path; landing zone along the track ≥ v × 0.4 s; glass and see-through racers never in
  front of a red boundary (brief §13.6).
- **Jetpack** only where designed (Ember): Sunspire and Neon set `jetpack: false`. Where it
  stays, every gap has a red ceiling, side walls or a landing requirement (brief §5.4), and fuel
  is a route choice. SURGE stays on all three.

## 3. The three maps

Times are steady-bot budgets (the human 0.6/0.8/0.85 bot is expected 5–10 % slower). "R" =
anchor. All three keep their map ids and names (queue, leaderboards, tests).

### 3.1 Sunspire — "the Sun Clock" (medium, design strafing 0.6)

|           |                                                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme     | a sky observatory temple at sunrise: limestone terraces and colonnades ringing a colossal sundial gnomon; the route circles the gnomon twice, high then low, so you see your earlier route below you (§6.2)                                             |
| Landmark  | the Sunspire itself: a 240 m gold-capped gnomon at the map centre with three gold hour rings round its shaft (the Act 2 booster rings), visible from every act                                                                                          |
| Palette   | limestone #E8DCC2 / #D2C3A3, sandstone #B89868, gold #F2C14E (usable edges, ridges), lapis #2F5DA8 (surf faces, six shades), verdigris #3E9C8C (bhop tops), white-gold #FFF1C9 (launches, boosters), sky-blue #9FE3FF (anchors), hazard red only on red |
| Sky       | top #4F86D9, horizon #FFD2A8, low east sun, fog 180–800, ambient 1.0; gardens and waterfalls kept, but on the terraces the route uses                                                                                                                   |
| Signature | colonnade wraps (curved bhop inside ring colonnades of solid round columns), lapis channel surf with scoops and flicks, the Sun Gate portal                                                                                                             |

| act              | s   | outline                                                                                                                                                                                                                                                                                   | ends           |
| ---------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1 Dawn Terrace   | 24  | start on the east terrace; 4 bhop pads curving right round the first shrine (8.3 → 11 m, 7 × 9); the last hop boards a broad lapis curve (STD, 70° right, R 120); an opposing transfer; R1 mid-curve                                                                                      | C1 East Shrine |
| 2 Hour Rings     | 30  | launch off the shrine door through two gold hour rings (air boosters) round the gnomon; land on a descending chain (4 pads, −2 m steps, ±25°, 12–14 m); a channel with a scoop that releases upward onto a raised pad; R2, R3                                                             | C2 Ring Shrine |
| 3 Colonnade Wrap | 32  | the signature: 9 bhop pads curving 200° right inside the ring colonnade (columns between pads hide pad k + 2), spacing growing 11 → 16 m (16 → 23 m/s); a 15 m speed gap onto a lapis ramp; salvage: the reflecting pool below (`shallow`) with a lamp and a launch back to pad 6; R4, R5 | C3 Sun Gate    |
| 4 Upper Gallery  | 34  | the Sun Gate (gold ☀, in C3's exit door, +90°, lifts 60 m, `vertical: 'zero'`); an S-curve along the gallery (two opposing curves, two flicks), a window transfer through the sun window (8 × 7), surf-to-bhop onto 5 pads on the gallery's outer ledge; R6, R7, R8                       | C4 Gallery     |
| 5 Gnomon Descent | 32  | a 240° descending helix round a gnomon buttress (60° faces, R 70, red strip at depth 0.75), out onto a behind-the-wall chain curving left round the buttress (6 pads, −1 m steps), a launch arc under a red "sun shade" ceiling to the lower terrace; R9, R10, R11                        | C5 Dial Gate   |
| 6 The Dial       | 28  | the Dial Gate (lapis ◐, −90°) out over the sundial plaza; two sweeping curves; the last chain of 6 pads across the hour marks (13 → 18 m); a 17 m speed gap into the finish room at the gnomon's foot; the plaza pool (`shallow`) catches a missed hop; R12                               | finish         |

Total 180 s. **Faster lines:** Act 4 upper-window flick (release early off the first S-curve lip
through a smaller 5 × 5 window, ≈ 3–4 s); Act 6 hour-mark skip (one 19 m hop over the dial's
centre, needs ≥ 27 m/s, ≈ 1.5 s). **Recovery:** 12 anchors, 2 shallow pools and a lower catch
ramp in Act 4 (salvage forks, slower by the fork test). **Keep:** name, sunrise sky, cream/gold
family, gardens/waterfalls, the booster air rings, the speed-gap finish, medium difficulty.
**Scrap:** all wedges, the 15 rooms and 4 arrival rooms, `landmark()` rotation, beam walks,
flat launch landings, orange pads/red finish, `surfColors` cycling; set `jetpack: false`.

### 3.2 Neon Drift — "the night interchange" (hard, design strafing 0.8)

|           |                                                                                                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme     | a maglev interchange floating over storm clouds at night: banked guideways (the surf), station gantries (the rooms, with split boards: brief §6.4 "neon transit"), glass billboards, maglev cars parked in a rail yard                                                                                  |
| Landmark  | the Drift Tower: a 200 m tower crowned by three magenta halo rings, the route's hub (Act 4 spirals round it); the moon behind it                                                                                                                                                                        |
| Palette   | night #070B1C → #2B1E5C, steel #3A4058 / #2C3146, electric cyan #3FF0FF (usable edges only), violet #5B4BD6 (surf faces, six shades), lime #B6FF3B (bhop tops), amber #FFC23C (launches), portals as metro lines: A magenta #FF4FD8, B lime, C amber; finish white-cyan chequer; hazard red only on red |
| Sky       | stars, a big moon high in the north-west, fog 160–700, ambient 0.8; billboards as `glass` blocks (magenta/cyan tints) with `glow` frames; amber sodium lamps on landings for warmth                                                                                                                     |
| Signature | billboard wraps (curved behind-the-wall bhop round solid billboard backs), guideway spins (a real 270° curved spin), red laser gantries (ceilings and window bars), metro portals whose exit heading matters                                                                                            |

| act               | s   | outline                                                                                                                                                                                                                                              | ends           |
| ----------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1 Platform 1      | 24  | 6 bhop pads (4.5 × 7) curving left round the first billboard (12 → 18 m/s); the last hop boards a banked guideway (MID, 90° right, R 60); R1                                                                                                         | C1 Platform 2  |
| 2 Flyover         | 30  | a guideway S-curve (R 45 / −45 at ~30 m/s ≈ 38°/s) with two flicks between parallel flyovers; a red laser gantry over the second transfer punishes a high release; R2, R3                                                                            | C2 Junction    |
| 3 Billboard Alley | 31  | drop-hop zigzag between three billboards (pads 4 × 6, −2 m steps, ±50°, 13–15 m), each billboard hides the next pad until the turn; a window through a billboard frame with red bars (5 × 4); a 16 m speed gap onto a station roof; R4, R5, R6       | C3 Interchange |
| 4 Drift Tower     | 35  | Line A (magenta "A", in C3's door, +90°, `offset`) onto the tower's outer guideway: a 300° descending helix (TIGHT, R 55, red strip at 0.75); the main line leaves at its end onto a long catch; R7, R8, R9                                          | C4 Halo        |
| 5 Rail Yard       | 33  | surf-to-bhop onto an 8-pad chain alternating ±35° between rows of parked maglev cars (solid), a red live-rail floor below (no salvage); bhop-to-surf onto a SHORT face whose short contact redirects into a flick to the far guideway; R10, R11, R12 | C5 Terminal    |
| 6 Terminal Run    | 27  | Line B (lime "B", −90°, `vertical: 'zero'`); a fast guideway bending 120° (R 40), a spine crossing on an A-frame spin (left, right, left), 5 widening pads (15 → 19 m) and a 17 m gap into the finish gantry under the halos; R13                    | finish         |

Total 180 s. **Faster lines:** Act 4 "core drop": leave the helix over its ridge at ~220°, hop 4
small pads across the tower's core deck, rejoin the catch (≈ 4 s); Act 3 billboard skip: an air
booster ring over the second billboard's top (needs the upper band of the jump, ≈ 1.5 s). Line C
(amber) is the fork's portal if the core drop needs one. **Recovery:** 13 anchors, no salvage;
red zones do the teaching. **Keep:** name, night + stars + moon, magenta/cyan identity (with
meaning now), steep faces, the speed gate and royal-spin ideas (as real curves). **Scrap:** both
jetpack gaps and the fuel cells (`jetpack: false`), the `block()` islands, broken beams, pillar
weave clones, pink-red danger/portal/finish colours, 16 identical rooms.

### 3.3 Ember Spire — "the forge needle" (very hard, design strafing 0.85)

|           |                                                                                                                                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Theme     | an obsidian needle rising out of a lava lake in a caldera at dusk; bronze forge platforms and chain bridges cling to it; an ash storm hangs overhead. The race works along the rim, lifts to the crucible at the top and pours down round the needle                                                                                 |
| Landmark  | the needle (300 m) with the glowing crucible on top; lava falls off the rim (kept from today), the red sun on the horizon                                                                                                                                                                                                            |
| Palette   | "cool usable, hot deadly": obsidian #2A2630 / basalt #3B3540, ash-white edges #E8E2D6, verdigris-bronze surf faces #3F8F86 (six shades), bone bhop tops #D9CBB0, ice-blue launches and fuel #5CC8FF, portals ember gold ▲ and ice blue ▼; lava orange #FF6A1A only on the lake, falls and kill floor; hazard red hatched only on red |
| Sky       | top #231626, horizon #FF7A45, low red sun, fog 140–650, ambient 0.9; the ash ceiling drawn as a low dark cloud band above the red ceiling blocks                                                                                                                                                                                     |
| Signature | fuel budgets under red ash ceilings (the sky kills), buttress wraps (curved behind-the-wall bhop round the needle's buttresses with short-contact flicks between them), the Pour (a stacked 420° helix down the needle)                                                                                                              |

| act             | s   | outline                                                                                                                                                                                                                                             | ends             |
| --------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1 Rim Road      | 25  | 7 bhop pads (2.8 × 6) curving right behind two basalt teeth; a drop onto a TIGHT curve (120° left, R 40); R1, R2                                                                                                                                    | C1 Rim Forge     |
| 2 Chain Bridge  | 30  | the fuel lesson: a launch onto a bridge pad; a 22 m jet gap under a red ash ceiling 6 m above the pads (pulse, don't climb); the fuel cell; a 20 m gap past a side wall (lateral steering); surf-to-bhop onto 4 descending pads; R3, R4, R5         | C2 Chain Forge   |
| 3 Buttress Wrap | 32  | three arcs of 4 pads, each 120° round a 40 m buttress (solid), a red floor strip under every arc; each arc ends on a SHORT face whose short contact flicks you to the next buttress; R6, R7, R8                                                     | C3 Crucible Lift |
| 4 Crucible      | 35  | the ▲ portal (ember gold, in C3's door, lifts 120 m, `vertical: 'zero'`); a spine crossing into a 180° TIGHT outside curve over the crucible mouth (red; R 30 at 28 m/s ≈ 53°/s), a window through red forge bars (5 × 4.5); R9, R10, R11           | C4 Crucible Rim  |
| 5 The Pour      | 32  | a 420° helix down round the needle in two stacked turns (≥ 16 m apart), a red strip low on the middle turn, out between two buttresses onto a pair of SHORT-face flicks; R12, R13, R14                                                              | C5 Quench Gate   |
| 6 Quench Run    | 26  | the ▼ portal (ice blue, −90°, `offset`) onto the lake causeway: a drop-hop chain of 6 pads (−2 m steps) under a low red ash ceiling (5 m above the pads), a last curve, 5 widening pads and a 17 m gap into the finish room at the quench pool; R15 | finish           |

Total 180 s (par stays 3:30 for the DNF limit). **Faster lines:** Act 4 "saved fuel": a player
who kept fuel from Act 2 burns up to the crucible's upper pipe lip and skips the outside curve
(≈ 4–5 s; the tactical choice the brief asks for: faster only if fuel was retained); Act 5 early
exit through the lower turn's opening onto the flick pair (≈ 3 s). **Recovery:** 15 anchors, no
salvage. **Keep:** name, dusk + red sun, lava falls, fuel management (two burns, one cell), very
hard identity, the spire. **Scrap:** red ramps and orange edges, jet gaps without ceilings, the
80° drop-turns in open air, 4.5 m square pads, the Sunspire template.

## 4. Engine gaps

| gap                                                                                                                                                                                                                                      | needed for                           | fix (size)                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Personal bests never reset.** `race_bests` is keyed `(player_id, track)` and only ever improves (`ranked.ts` `recordRace`); the client keeps `lethalrecoil.race.pb.v1` and `…ghost.v1.<track>`, and split deltas compare by gate index | release of any rebuilt track         | a DB migration that moves the three tracks' rows to an archive table (or deletes them) + client keys bumped for those tracks; or a `CourseData.version` in the PB key (small, server + client) |
| race-tracks.test has none of the surf recovery checks                                                                                                                                                                                    | anchors, red zones, forks            | port from `surf-maps.test.ts` (test only): bays reach the next room and are never faster, red zones kill at their surface, forks ride, portal exits clear                                      |
| `surf-seams.test.ts` only rides `surfMaps()`                                                                                                                                                                                             | curves on tracks                     | include `raceTracks()` (test only)                                                                                                                                                             |
| anchors respawn with a **full tank** (`placeRacer`)                                                                                                                                                                                      | Ember's fuel budgets                 | optional per-bay `fuel` in `RestartBay`; otherwise the "never faster" test must hold with a full tank (small)                                                                                  |
| rooms have one look (`stageRoom`: `roomMat` + palette only)                                                                                                                                                                              | themed rooms (shrine, gantry, forge) | dress with scenery blocks round the room (works now), or a `roomStyle` option (small); a walled restart bay if the owner wants every respawn in a room                                         |
| the bot racer cannot wall-jump, crouch-tuck or slide (all active in race movement)                                                                                                                                                       | only if we want those mechanics      | line flags + bot inputs (medium); **not needed** for this plan                                                                                                                                 |
| respawn freeze 1.5 s on tracks (0.5 s on surf)                                                                                                                                                                                           | anchor feel                          | owner decision; keep 1.5 s unless playtests say otherwise                                                                                                                                      |

No gap blocks the plan: everything in §3 can be authored with today's course format.

## 5. Tests and timing

**`race-tracks.test.ts` changes** (ids stay, so the first `raceTracks()` expectation stays):

- `checkpoints.length >= 4` → exactly 5 rooms (C1–C5); the walls-and-roof room check stays.
- Clean run: 160–200 s → **170–190 s**; room splits ≤ 25 s → **≤ 36 s** (acts of 24–35 s);
  new: on the clean run, recovery points (room or `raceAnchor` event) ≤ 14 / 13 / 11 s apart
  (Sunspire / Neon / Ember); `respawns === 0` and top speed > 3 × sprint stay.
- `DESIGN_EFF` stays 0.6 / 0.8 / 0.85; the human run must finish.
- New, ported from the surf test: every bay reaches the next room on its own and is never faster
  than riding on; every red zone kills at its surface; every fork rides and rejoins; portal
  exits are clear of geometry; the racing line crosses every room door well inside it.
- New: no main-line `path` longer than 12 m; no `surf` wedge elements; every pad edge ≥ 1.5 m
  from a wall face.
- "Needs air-strafing" and "fall → back in the room" stay; the jetpack test applies to Ember
  only; Sunspire and Neon assert `race.noJetpack`.
- `PLAYING.md` must change with it (rooms every ~30 s, rings in between).

**Loop per map** (one map at a time, low RAM): `check.ts` → `time-tracks.ts` (steady,
`--human=<eff>`, `--sections`, `--forks`) → `trace.ts` on falls → `sketch.ts --svg` → the two
test files with `--maxWorkers=1`. Each map gets an as-built doc
`docs/movement-map-design/race/R0n-<name>.md` in the B01/B04 format (identity, sketch, phrase
graph, numbers, rooms and anchors table, forks, timings per act, untested assumptions), plus
still screenshots per BUILDING.md §4.

## 6. Build order and side effects

1. **Shared prep** (small, separate commits; other builders are editing shared files, so rebase
   often and keep these tiny): the ported tests behind a flag until the first map is ready; the
   PB reset mechanism; optional `RestartBay.fuel`.
2. **Sunspire first**: it sets the race standard (portal rooms, anchors on bhop chains,
   speed-agnostic exits, salvage pools) at the easiest difficulty.
3. **Neon Drift**: adds dense red zones, glass architecture and the faster-line work.
4. **Ember Spire** last: jetpack under ceilings, fuel forks, the stacked helix.
5. Ship all three in **one release** so the Race season's leaderboards reset once.

**Side effects to handle at release:**

- **Personal bests reset — but not by themselves.** Server bests are improve-only per map id,
  so old times (on a 3.2 km route) would stay on the new boards: run the migration (§4) for
  `race-sunspire`, `race-neon`, `race-ember` only (surf maps keep theirs). Clients: bump the PB
  and ghost keys for those tracks, or the HUD compares 5 new splits with 15 old ones and the old
  ghost flies through the air. Past races in `races` / `race_players` stay as history.
- **Ladder ratings are unaffected (verified).** `rating/race.ts` `updateRaceRatings` takes only
  each racer's rating, placement count, place and leaver flag; `recordRace` never passes a track
  or a time to it. Ratings, seasons and placements carry over; the Race queue's pool is
  `raceTracks()` by id, which does not change.
- Map Maker official edits (`map_overrides`, `registerMap`) replace a built-in map in new rooms:
  check the live DB has none for the three ids before release.
- Deploy client and server together (both build the level from the id); consider a
  `PROTOCOL_VERSION` bump so stale tabs reconnect instead of predicting on old geometry.
- Update `PLAYING.md` (race section and the three track blurbs), `MAP_BLURBS` in
  `packages/client/src/ui/flow.ts`, and CLAUDE.md's race line if the room rule changes.

**Owner decisions needed:** rooms every ~30 s with anchors between (versus today's 15–25 s);
jetpack off on Sunspire and Neon; red ceilings as "the sky means death"; whether anchor bays may
be open platforms or must be walled rooms; the 1.5 s freeze; hold-to-bhop stays off (manual,
Source-style).

## Owner decisions (2026-09-27)

- **Rooms:** five walled checkpoint rooms per map, about 30 s apart, one between each act. The big portal sits in each room's exit doorway. Recovery anchors (open restart platforms with a run-up) fill the gaps between rooms.
- **Jetpack:** off on Sunspire and Neon Drift. It stays on only on Ember Spire, where saving fuel opens the fastest line.
- **Deadly ceilings:** yes. Red ceilings (laser or ash) where they fit the theme, clearly marked, as the "sky means death" rule.
- **Personal bests:** reset for the three rebuilt tracks. That means new server records (a database migration) and new browser keys for bests and ghosts. Ladder ratings are unaffected.
- **Defaults kept:** the 1.5 s respawn freeze, and manual bhop (no hold-to-jump).
