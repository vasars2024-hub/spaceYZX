# Standard surf maps — build specifications

Build specs for the eight standard surf maps of the design brief
(`../Complete-Map-Design-Brief.md` §9–10, worked example §12), fitted to **MOVEMENT_PROFILE v1**
(`../movement-profile.md`, `packages/shared/src/level/course/profile.ts`). B01 is the pilot,
specified and built by the foundation work; the other seven are written so builders can start
right after it, in parallel.

Every number here is a **first blockout value to calibrate** unless it quotes the movement
profile. Nothing in these specs has been playtested.

## Index

| ID  | Map                 | Mode         | Signature                                          | Dominant techniques                                                                      | Landmark                    | Spec                                                                |
| --- | ------------------- | ------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------- |
| B01 | Copper Reef         | Beginner     | Curved aqueducts and a lighthouse helix            | broad curves + contact height; gentle helix; 90° lens portal                             | lighthouse                  | [B01-copper-reef.md](B01-copper-reef.md) (pilot, foundation helper) |
| B02 | Glass Garden        | Beginner     | S-curves through a layered conservatory            | S-curves (steering reversal); height adjustment on raised catches; two 3-hop pad phrases | the great tree              | [B02-glass-garden.md](B02-glass-garden.md)                          |
| B03 | Cloud Foundry       | Beginner     | Vertical scoops and broad aerial catches           | vertical scoops; broad aerial catches (tangent alignment); broad windows                 | the stationary turbine      | [B03-cloud-foundry.md](B03-cloud-foundry.md)                        |
| B04 | Lantern Canal       | Beginner     | Canal bends, underpasses, portal realignment       | reading bends (bank-to-bank transfers); turning portals; under/over departure heights    | the paper festival lantern  | [B04-lantern-canal.md](B04-lantern-canal.md)                        |
| I01 | Neon Spillway       | Intermediate | Consecutive S-curves and an early-release shortcut | linked S-curves of different radii; helix early release; window + short contact          | the pump column             | [I01-neon-spillway.md](I01-neon-spillway.md)                        |
| I02 | Basalt Cathedral    | Intermediate | Helical descent, spines, window transfers          | height band in a helix; spine crossings; window transfers (rose window)                  | the bronze bell             | [I02-basalt-cathedral.md](I02-basalt-cathedral.md)                  |
| I03 | Cyclone Observatory | Intermediate | Concentric arcs and controlled spiral exits        | changing curve radius (concentric rings); helix exits; tangential ring transfers         | the caged cyclone           | [I03-cyclone-observatory.md](I03-cyclone-observatory.md)            |
| I04 | Prism Relay         | Intermediate | Momentum portals and diagonal window lines         | momentum portals (turning); diagonal window transfers; portal-to-ramp catches            | the suspended prisms / beam | [I04-prism-relay.md](I04-prism-relay.md)                            |

## Suggested build order (parallel batches)

Each batch groups maps whose mechanics are already proven by the time the batch starts, so a
builder never waits on an engine change for their main route.

| Batch                   | Maps                                                               | Why together                                                                                                                                                                                                                                                                           | Needs before starting                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** (right after B01) | **B02 Glass Garden**, **B03 Cloud Foundry**, **I01 Neon Spillway** | Curves, S-curves, scoops, opposing transfers, bhop pads, broad windows, one simple portal each — everything B01 already exercises. I01 is also the brief's second prototype (§14.2) and sets the Intermediate calibration (turn rates, window sizes, helix exits) that batch 2 reuses. | B01 built; movement lab + `curve`/`gate`/`anchor`/`red`/air portal in place (they are). B02 wants a see-through `glass` scenery material (see gaps). |
| **2**                   | **I02 Basalt Cathedral**, **I03 Cyclone Observatory**              | Helix-heavy Intermediate maps: stacked helix clearance, red lower edges, overhead limits, multi-exit spirals, spine crossings. Both reuse I01's measured helix and window numbers.                                                                                                     | I01's helix section timed (`time-tracks --sections`); human check of the Intermediate 90°/s turn-rate assumption.                                    |
| **3**                   | **B04 Lantern Canal**, **I04 Prism Relay**                         | Portal-driven maps: several turning portals, an optional portal shortcut, portal chains. I04 wants an offset-preserving portal (see gaps); B04 works with today's portals.                                                                                                             | Portal behaviour checked at edges / high speed / rapid re-entry (brief §15.2 #5); decision on offset-preserving portals.                             |

If only two builders are free: batch 1 as B02+I01 then B03; batch 2 unchanged; B04 can move
into batch 1 or 2 (it needs nothing new), I04 stays last.

## Engine gaps and conflicts found while writing these specs

These are things the brief asks for that the current engine / course format does not do yet
(or does differently). Each spec marks where it depends on one.

1. **Portal exit is a single point.** `sim/devices.ts` puts you exactly at `exit`, velocity and
   view turned about the vertical by `turn`, speed (including vertical speed) kept. Where you
   crossed the opening is lost. I04 Act 1 ("position within the opening affects the exit line")
   needs an **offset-preserving portal** (exit = exitCentre + R·(pos − entryCentre)). Without it,
   off-centre entries snap sideways by up to half the opening width — acceptable with big
   openings on Beginner maps, noticeable in I04's chains.
2. **Portals face a cardinal heading** (validation) and their trigger is an axis-aligned box.
   The approach should be within ±15° of that heading; `turn` itself may be any angle.
3. **Gate and anchor triggers are axis-aligned boxes** (`flyThrough`: the AABB of a 4 m deep
   opening). A gate on a 45° heading gets a much larger trigger; keep gates within ±15° of a
   cardinal heading, and keep other route levels out of the enlarged box.
4. **No hold-to-bhop.** Every hop needs a fresh press within 0.05 s before landing (a late
   jump costs ~10 %). The brief recommends consistent hold-to-bhop in default queues. The
   Beginner pad phrases are sized so a missed first tick still lands (depth covers ±15–30 %
   speed), but whether Beginners enjoy manual timing is an open owner decision.
5. **Windows are rectangular** (`window`: a 1 m thick rock wall, rectangular hole, glowing
   rim, no red). Bell-shaped (B03), leaf-shaped (B02) and rose (I02) openings are visual
   only; collision stays a rectangle (or several red blocks approximating a circle). Red-rimmed
   precision windows are built from `red` blocks round the hole.
6. **See-through glass**: `BoxDef.mat` has `glass` (visual only) and `skyglass` (collides),
   but course scenery blocks (`SceneryElement` `block.mat`) do not offer them. B02 (and glass
   in I03's storm chamber) needs a scenery `glass` option that never collides.
7. **Surf ramps are wedges** (vertical back under the ridge, flat bottom). Stacked helix turns
   need vertical spacing ≥ max(h, (1 − d)·h + H + 3) per full turn (h face height, d racing
   depth) — the clipping check `findOverlaps` enforces the first part only.
8. **No speed-preserving vertical portals** (no pitch rotation) — fine, none of the standard
   maps need one. Portals may lift the route (exit higher than entry) since speed is kept.
9. **Strafe cap 34 m/s horizontal.** Any speed above that comes only from height. Sections that
   ask to "carry speed" above 34 must descend.

## Conventions used in every spec

### Units, axes, headings

- metres, seconds, m/s, degrees. `[x, y, z]` with **y up**, **north = −z**, east = +x.
- Headings are compass degrees: 0 = N, 90 = E, 180 = S, 270 = W. Turns: **+ = right**.
- Coordinates in the specs are sketch-level (±15 m): the **pen sequence is authoritative**;
  re-derive exact positions with `npx tsx tools/race/sketch.ts <map-id>` after building.

### Profile v1 symbols (quoted from `movement-profile.md`)

| Symbol                         | Value                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| H / W                          | 1.8 m (crouched 1.1) / 0.8 m                                                                      |
| g                              | 20 m/s²                                                                                           |
| Z                              | 1.20 m jump apex; jump take-off speed ≈ 6.93 m/s up; flat air time 0.69 s                         |
| J                              | 8.4 m at 12 m/s (no strafe) — comfortable 7.1 m                                                   |
| B(v)                           | steady/human m per hop: 12 m/s 12.2/10.8 · 16 m/s 14.3/13.2 · 20 m/s 16.6/15.6 · 25 m/s 19.7/18.9 |
| V                              | 31.0 m/s steady, 30.4 human (reference chain median; top 38)                                      |
| caps                           | strafe 34 m/s horizontal, total 50 m/s                                                            |
| faces                          | stable 45–75°; **build 55–70°** (validation needs ≥ 50°)                                          |
| recovery                       | 0.5 s frozen in the restart bay                                                                   |
| turn-rate comfort (assumption) | Beginner 60°/s, Intermediate 90°/s, optional lines 120°/s                                         |

### Ramp notation (as in `surf-copper-reef.ts`)

- A ramp is a pen `curve({ legs, height, angle, side, depth?, red?, early?, lead?, alt? })`.
- Legs: `straight(len, drop)`, `arc(turn, radius, drop)`, spiral `arc(turn, r0, drop, { toRadius: r1 })`,
  per-leg extras `{ red: depth | false, depth, ride }`. `drop` < 0 climbs; consecutive legs join
  with matching slopes, so `straight(60, 8), straight(60, -5)` is a smooth vertical **scoop**.
- `radius` is the **ridge** radius. The racing line sits `d × run` off the ridge
  (run = h / tan a). A curve turning toward its face (`side: 'right'` with + turns, `'left'`
  with − turns) is **banked** ("inside": it holds you); the other way is **outside** (you
  hold into it). Rider radius: banked R − d·run, outside R + d·run.
- **Contact band** = the depth range (0 = ridge, 1 = foot) a valid line stays in.

Face shapes used across the specs (slant = h / sin a = usable face width; run = h / tan a):

| name  | h × a    | slant         | run    | use                                          |
| ----- | -------- | ------------- | ------ | -------------------------------------------- |
| WIDE  | 18 × 55° | 22.0 m (27 W) | 12.6 m | Beginner receivers, settling ramps           |
| BROAD | 16 × 56° | 19.3 m (24 W) | 10.8 m | Beginner main faces                          |
| STD   | 14 × 58° | 16.5 m (21 W) | 8.7 m  | Beginner transfers, Intermediate broad faces |
| MID   | 12 × 60° | 13.9 m (17 W) | 6.9 m  | Intermediate main faces                      |
| TIGHT | 11 × 63° | 12.3 m (15 W) | 5.6 m  | Intermediate helix / precise faces           |
| SHORT | 9 × 65°  | 9.9 m (12 W)  | 4.2 m  | short contacts, Intermediate optional lines  |

### Curve radius rule

Rider radius ≥ max(v_max / ω, C(v_max)) with ω in rad/s (60°/s = 1.047, 90°/s = 1.571,
120°/s = 2.094). C(v) from the profile table (outside curves on 65–70° faces are the only
place the bot limit exceeds the comfort limit — avoid them on main lines).

| v   | B 60°/s | I 90°/s | optional 120°/s |
| --- | ------- | ------- | --------------- |
| 25  | 23.9    | 15.9    | 11.9            |
| 30  | 28.6    | 19.1    | 14.3            |
| 35  | 33.4    | 22.3    | 16.7            |
| 40  | 38.2    | 25.5    | 19.1            |

Specs quote the **turn rate at v_max** for each arc: `ω = v / R_rider` (°/s = 57.3 v / R).

### Transfers T(f, u, s)

A transfer is `pen.move(f, u, s)` from where the racing line leaves one ramp to where it lands
on the next one's face: f ahead, u up (negative = down), s right. The pen convention: leaving a
**right** face you cross **right** (s > 0) onto a `left` face; leaving a **left** face s < 0.

- Flight time t ≈ √(f² + s²) / v_h. Free fall over it is 10 t².
- A flat release (vy ≈ 0) lands at u ≈ −10 t². Plan **−(10t² + 3) ≤ u ≤ −(10t² − 1)** for an
  ordinary transfer. Lower u is a high-to-low drop; higher u needs an **upward release**: vy0 =
  (u + 10 t²) / t, which only a climbing ridge supplies (vy0 ≈ v × grade — the end of a scoop).
- Reference: at 25 m/s, T(14, u, ±9): t = 0.67 s, 10t² = 4.4 → u ∈ [−7.4, −3.4].
  At 30 m/s: t = 0.55, 10t² = 3.1 → u ∈ [−6.1, −2.1]. At 35 m/s: t = 0.48, 10t² = 2.3.
- A "raised opposing face" means the receiving **ridge** is higher than the departure ridge
  while the catch point is still below the release point: the player releases from the upper
  band to catch the upper band.
- The lateral part of a transfer is made by air-strafing out and back (align with the
  receiving tangent before contact). Arriving with a large velocity component into the face
  loses that component (clip), so receivers are placed parallel-ish to the flight's end.

### Receivers

Along-track length of the catch zone ≥ v × 0.4 s (timing spread) and then a settle of ≥ 2 s
(Beginner) / 1.2 s (Intermediate) before the next demand. A receiver's face covers the
expected catch depth band ±0.2 with the rest of the face still usable.

### Speed and height

- Loss-free: v1² = v0² + 2 g Δh → **Δh = (v1² − v0²) / 40**. Budget 10–15 % extra height for
  strafe losses on long curves (the polygon joints cost < 2 % per 90°: `curve.ts`).
- Climbs (scoops, ascending arcs) spend speed the same way: 32 m/s climbing 8 m → ≈ 26 m/s.
- The strafe cap is 34 m/s horizontal: speed above it only comes from descending.

### Bhop pads

- Air time of a hop landing Δy higher (+) or lower (−) than take-off:
  t_air = (6.93 + √(48 − 40 Δy)) / 20 → Δy +1: 0.49 s · +0.5: 0.61 · 0: 0.69 · −1: 0.82 ·
  −1.5: 0.87 · −2: 0.91 · −3: 0.99.
- Centre spacing d = v × t_air at the design speed v. You take off where you land, so
  landing errors carry from pad to pad.
- Pad depth (along the hop) ≥ 0.4 d + 2 m (covers 0.8–1.2 v plus carry). Beginner pads
  [8–9 wide, 10–12 deep] (B01 uses [9, 12]); Intermediate [5–6, 7–8]; never below the brief's
  footprints (Beginner 4–6 W across, Intermediate 2.5–4 W).
- Human gain ≈ +0.55–0.8 m/s per hop (steady +0.9–1.2); stretch later spacings by that.
- Pen: `bhopPads([{ d, turn?, rise?, size? }, …], size)`. `turn` is applied before the step.

### Portals

- Pen: `airPortal(f, exit, turn, [w, h])` — a fly-through opening `f` ahead, facing the nearest
  cardinal heading; you come out at `exit` (feet), velocity and view turned by `turn`, speed kept
  (vertical speed too). Exit point fixed (see gap 1).
- Opening ≥ [16, 16] Beginner (B01 uses 16), ≥ [12, 12] Intermediate main, ≥ [9, 9]
  Intermediate optional. The exit must show its destination through the frame (preview) and
  give ≥ 1.0 s (Beginner 1.5 s) of settling before any demand.
- Exit velocity rule, written per portal: `v_out = rotY(turn) · v_in`, |v| kept.

### Checkpoints and recovery

- `gate(size, name, bay)` = a required progress gate + timing split (C1..C5); `finishGate`.
  `anchor(name, bay, size)` = a recovery anchor (R): no progress, it only moves the restart.
  Place C gates **after merges** on a stable stretch; the opening must cover every legal line.
- **Restore state** (what every gate/anchor restores): standing, velocity 0, in its restart
  bay at `bay` facing `bayHeading`, frozen 0.5 s, then the bay's launch pad throws you onto
  `to` (a point on the route) in `flightSec` (default 1.2 s ≈ 23 m/s arrival, mostly along
  the way). Default bay: 26 m back, 10 m toward the ridge, 12 m up from `to` (pen `BayOpts`).
- **Re-entry speed rule**: to reach a demand needing v_d from the 23 m/s bay arrival, the
  re-entry ramp before it needs ≥ 1.15 × (v_d² − 529) / 40 m of descent
  (v_d 28 → 7.3 m; 31 → 12.4 m; 34 → 18 m). Specs state this per anchor.
- Cadence: Beginner an R every 10–15 s of clean movement, Intermediate every 15–25 s.
- Red zones: `red(f, s, u, [w, h, d], turn)` blocks, and `red: depth` strips on a curve face
  (from that depth to the foot). Touch = back to the latest anchor/gate.

### Time estimates

Act time = Σ (segment length / expected speed) for a **practiced human** of the audience
(proxy: `time-tracks --human`; the steady bot is expected ~5–10 % faster — an assumption).
Clean-run target 165–195 s.

### Verifying a built map

- `npx tsx tools/race/check.ts <map-id>` — clipping, validation, render budget.
- `npx tsx tools/race/time-tracks.ts <map-id> [--human] [--sections]` — bot clean run, per-act
  splits, and runs from every restart bay (every recovery state must finish its section).
- `npx tsx tools/race/trace.ts <map-id> [cp | a<anchor>]` — trajectory samples for fitting
  receivers (brief §3.4).
- `npx tsx tools/race/sketch.ts <map-id> --svg <file>` — the route drawing for the spec.
