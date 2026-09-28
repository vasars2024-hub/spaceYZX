# Building a standard surf map

For the next helpers. Read the brief (`Complete-Map-Design-Brief.md`) for _what_ to build,
`movement-profile.md` for the numbers, `maps/README.md` for the spec conventions and formulas,
and `maps/B01-copper-reef.md` + `packages/shared/src/level/maps/surf-copper-reef.ts` for a
finished example. This page is _how_.

## 1. Where things live

| what             | where                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| the map          | `packages/shared/src/level/maps/surf-<name>.ts`: a function returning `CourseData` (plain JSON)                                                                                                              |
| registration     | `maps/index.ts`: `courseMap('surf-<name>', '<Name>', <name>Course, 'beginner' \| 'intermediate')`; export it from `packages/shared/src/index.ts`; a blurb in `packages/client/src/ui/flow.ts` (`MAP_BLURBS`) |
| course format    | `level/course/types.ts` (elements), `expand.ts` (data → boxes, racing line, gates), `pen.ts` (the authoring helper)                                                                                          |
| curved ramps     | `level/course/curve.ts`: legs → exactly-joined `BoxDef.hull` pieces + racing-line nodes                                                                                                                      |
| movement numbers | `level/course/profile.ts` (`SURF_PROFILE`), `movement-profile.md`                                                                                                                                            |
| race rules       | `sim/race.ts` (gates, anchors, red zones, respawns), `sim/devices.ts` (portals), `bots/racer.ts` (the bot that times maps)                                                                                   |

Menus, Map Maker, ranked bests and tests pick a registered surf map up by itself
(`surfMaps()`: grouped by mode, Beginner first).

## 2. Writing the route with the pen

```ts
const p = new Pen([x, y, z], heading);            // heading: 0 = north (−z), 90 = east
p.start([16, 16]);
p.platform([10, 12], 'strafe');
p.move(12, -6).curve({ legs: [straight(240, 8), arc(45, 260, 8)], height: 16, angle: 56, side: 'left' });
p.move(4, -2).anchor('Intake Gap', {}, [16, 14]);  // recovery anchor R (no progress)
p.move(14, -6, -9).curve({ ... side: 'right' });    // opposing transfer: cross toward its face
p.move(6, -2).gate([24, 18], 'Intake Arch', {});   // progress gate C1 (also a split)
...
p.move(8, -2).finishGate([24, 20], 34, 12);
return p.course({ name, kind: 'surf', mode: 'beginner', profile: 'MOVEMENT_PROFILE v1', ... });
```

- `move(f, up, side)` is a flight: where the next element is _landed on_. `curve` builds the
  ramp so its racing line (depth 0.35 down the face by default) passes through the pen, with a
  5 m lead-in (`lead`) before it; the pen ends at the line's end, heading along the ridge.
- Legs: `{ len, drop }` straights, `{ turn, radius, drop }` arcs (ridge radius, + = right),
  `toRadius` for spirals; consecutive slopes blend smoothly (a `drop` < 0 leg climbs: scoops).
  Per leg: `red: depth` (a red strip from that depth to the foot), `depth`, `ride`.
  Keep angles 55–70°, the grade ≤ 0.58, turns under the mode's turn-rate limit
  (`maps/README.md` "Curve radius rule").
- `gate` / `anchor` bays are placed at the **next landing** (26 m back, 10 m toward its ridge,
  12 m up; override with `{ back, side, up, flightSec }`, or author them outright with
  `{ at, heading, to }` — `to` may be a re-entry ramp of your own drawn with `branch`). A gate
  or anchor followed by an `airPortal` gets its bay **before the portal**: 30 m back, 3 m below
  the opening's middle, its launch throws you through the portal again. A gate or anchor must
  be followed by something landed on, or `course()` throws.
- `bhopPads(steps, size)`: `{ d, turn?, rise?, size? }` per pad. Pads 18–20 m apart at
  bhop speed, level or stepping **down** (a jump rises only 1.2 m), first pad bigger.
- `airPortal(f, exit, turn, size, look)`: a fly-through portal; the pen continues at `exit`
  turned. Follow it with `curve({ lead: 12, ... })` so the landing is well inside the ramp.
  `look`: `color` and `glyph` (a mark shown over the portal and over its exit: tell pairs
  apart), `offset: true` (you come out as far off `exit`, across and up, as you went in off
  the opening's middle — keep half the opening clear round the exit), `vertical: 'zero'`
  (you come out level: no fall carried through). Speed is always kept; turns are about the
  vertical only (no pitch). The disc shows a live view from the exit. The course check
  rejects exits inside a portal; the surf-map test checks exits are clear of geometry.
- `red(f, s, u, size, turn)`: a red block. `branch(b => ...)`: an off-line stretch (salvage
  ramp, walkway, launch back) that produces no racing-line nodes; describe it as a
  `CourseFork` (`forks: [{ name, safe, risky, salvage?, line: [{ at, surf? }] }]`) so the
  tests ride it. A branch may hold portals (an optional portal line); mark the opening's point
  on the fork line `portal: true` and follow it with a point past the exit.
- Scenery (`SceneryElement`): `block`, `water`, `lighthouse`, `lamp`, `scatter`, ... never
  collides unless `solid`. A `water` plane is exempt from the clipping check. `water` with
  `shallow: true` is a canal floor `depth` (1 m) under the surface: ground you land on (not a
  kill) where you wade at `speedMul` (0.6) × sprint speed until you jump out — a Beginner
  second-chance channel; its floor must stay 2 m above `killY`.
- `holdToBhop: true` on the course: holding Space re-jumps on every landing (off by default;
  see `movement-profile.md`).

## 3. The loop

Build a bit, then (from the repo root, one map at a time on this low-RAM PC):

```
npx tsx tools/race/check.ts surf-<name>                 # overlaps, validation, triangle budget
npx tsx tools/race/time-tracks.ts surf-<name>           # the steady bot's run, acts, falls
npx tsx tools/race/time-tracks.ts surf-<name> --sections --forks   # every bay, every fork
npx tsx tools/race/time-tracks.ts surf-<name> --human   # 0.6-efficiency strafing
npx tsx tools/race/trace.ts surf-<name> 2 8             # trace the bot from C2 for 8 s
npx tsx tools/race/trace.ts surf-<name> a3              # ... from anchor 3's bay
npx tsx tools/race/sketch.ts surf-<name> [--svg f.svg]  # top-down route sketch
npx tsx tools/race/plan.ts surf-<name>                  # every route element with its position
npx vitest run packages/shared/test/surf-maps.test.ts --maxWorkers=1
npx vitest run tools/race/test/surf-seams.test.ts --maxWorkers=1
```

`surf-maps.test.ts` runs every surf map through the release checks: JSON round trip,
validation, no overlaps, C1–C5 in order, gates wide enough, every bay reaches the next gate
and is never faster than riding on, red zones kill exactly, clean run 165–195 s (steady bot),
the human bot finishes, forks rideable. `surf-seams.test.ts` rides every curved ramp at
0.8 / 1.0 / 1.15 V.

When the bot falls, `time-tracks` prints where; `trace` shows why (speed, node, keys).
Most falls are geometry, not the bot: a transfer too long/short for the speed (see
`maps/README.md` "Transfers"), a landing on a ramp's end, a pad too far.

## 4. Looking at it

The Vite dev server's `/ws` proxies the live server: never create accounts, save or publish
there; local practice is fine. Mute audio first.

```
cd packages/client && npx vite --port 5392 --strictPort     # your own server only
```

Open `http://localhost:5392/?autotest`, run in the page `AudioContext.prototype.resume =
async () => {}` and `window.__spaceyz.app.audio.setVolume('master', 0)`, then Practice → Race
→ the map → Start. To look from anywhere, freeze the player and set the camera (the view is
the client's `fps.quat`, not the player's):

```js
const c = __spaceyz.app.client,
  t = __spaceyz.tools;
const place = (from, yaw, pitch) => {
  // yaw is the negative of the course heading: 0 = north, -90 = east, 90 = west
  const q = t.view(yaw, pitch);
  Object.assign(c.fps.quat, q);
  for (const p of Object.values(c.session.w.players))
    Object.assign(p, {
      pos: { x: from[0], y: from[1], z: from[2] },
      vel: { x: 0, y: 0, z: 0 },
      frozen: true,
      view: q,
    });
};
```

Set `c.session.race.phase` to anything but the countdown first, or the race countdown puts
the player back on the start grid. Use your own Browser tab: other builders share the pane.
`c.session.level.def.race.line` holds the racing line (walk it to find spots). Wait ~1 s
before each screenshot. Check: the next landing is visible before each release, ramp edges
and ridges read, red zones read as red (not copper), portals show their destination, gates
frame the way on. Stop the dev server afterwards (check the PID's command line first).

## 5. Rules that bit B01

- Land on a ramp's face, never its end: keep `lead` ≥ 5 (12 after portals and pads).
- Bays go on the ridge side of the landing ramp and must not overlap the route; if the
  clipping check complains, move the bay (`side`, `back`) rather than the route.
- The racing line of a helix or of stacked ramps must clear the ramp above by H + 3 m.
- Pads: level or stepping down; spacing ≈ B(v) at the arrival speed; the last hop's `move`
  to the next ramp should equal a normal hop's flight (≈ 16 m, −2 m).
- A salvage ramp or walkway must be slower than the line (the fork test checks) and must
  deliver enough speed to board what follows (use a launch with `flightSec` 1.1–2.2).
- The map must fit the network range (racing line |x|, |z| < 490, colliding boxes' centres
  < 500 — B01 keeps ~30 m of margin) and stay 10 m above `killY`.
- Keep everything data: no code in the course beyond helpers that compute points.

## 6. When physics change

`tools/race/test/movement-profile.test.ts` fails if movement no longer matches
`SURF_PROFILE`. Then: bump the profile version, `npm run race:lab` (rewrites
`movement-profile.md`), update `profile.ts`, and re-run every surf map's tests and timings.
