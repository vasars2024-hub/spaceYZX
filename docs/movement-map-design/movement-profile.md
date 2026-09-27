# Movement profile — MOVEMENT_PROFILE v1

Measured by `npm run race:lab` (tools/race/movement-lab.ts, measurements in tools/race/lab.ts) in the real
simulation with the surf-map movement rules (race movement: `LevelDef.race`, surf maps: no jetpack, no SURGE).
Every surf map is fitted to these numbers. The key ones are also in `packages/shared/src/level/course/profile.ts`
(`SURF_PROFILE`), checked against the simulation by `tools/race/test/movement-profile.test.ts`: if movement
physics change, that test fails until the profile version is bumped and the maps re-checked.

Riders: **steady** = perfect strafing (the bot racer, `STEADY_RACER`); **human** = strafe efficiency
0.6 (misses keys/mouse on 40 % of air ticks in a fixed pattern, `HUMAN_RACER`). Units m, s, m/s.

## Body and caps (config, `packages/shared/src/config/movement.ts`)

| Symbol           | Value                    | Meaning                                                                   |
| ---------------- | ------------------------ | ------------------------------------------------------------------------- |
| H                | 1.8 m (crouched 1.1 m)   | standing collision height                                                 |
| W                | 0.8 m                    | collision width (capsule radius 0.4 m)                                    |
| step             | 0.4 m                    | step-up height                                                            |
| g                | 20 m/s²                  | gravity                                                                   |
| sprint           | 12 m/s                   | race / surf sprint speed                                                  |
| strafe cap       | 34 m/s                   | strafing cannot push horizontal speed past this                           |
| max speed        | 50 m/s                   | total speed cap (surfing down, falling)                                   |
| walkable         | < 50°                    | steeper plain slopes are not ground; surf ramps (`surf`) are never ground |
| jump buffer      | 0.05 s                   | a jump pressed this early fires on landing                                |
| coyote           | 0.1 s                    | jump after running off an edge                                            |
| landing friction | from the 1st ground tick | jump on the landing tick or lose ~10 %                                    |
| recovery         | 0.5 s                    | frozen in the restart bay after a fall (surf maps)                        |

## Jumps (flat ground)

- **Z** (jump apex, standing): **1.20 m**
- **J** (running jump, take-off to the same height):

| approach | no strafe | perfect strafe | comfortable (0.85 × no strafe) |
| -------- | --------- | -------------- | ------------------------------ |
| 12 m/s   | 8.4 m     | 9.0 m          | 7.1 m                          |
| 16 m/s   | 11.2 m    | 11.6 m         | 9.5 m                          |
| 20 m/s   | 14.0 m    | 14.3 m         | 11.9 m                         |
| 25 m/s   | 17.5 m    | 17.8 m         | 14.9 m                         |

## Bunny hops (B(v)) — first-tick jumps, strafing toward the way on

| approach | steady: m/hop | steady: +m/s per hop | human 0.6: m/hop | human: +m/s per hop |
| -------- | ------------- | -------------------- | ---------------- | ------------------- |
| 12 m/s   | 12.2          | 1.22                 | 10.8             | 0.80                |
| 16 m/s   | 14.3          | 1.02                 | 13.2             | 0.65                |
| 20 m/s   | 16.6          | 0.87                 | 15.6             | 0.55                |
| 25 m/s   | 19.7          | 0.73                 | 18.9             | 0.45                |

- **Hold-to-bhop: off by default.** Holding Space from the first jump gives 1 hop(s): every hop needs a
  fresh press within 0.05 s before landing (scroll-wheel jumping works). The brief recommends
  consistent hold-to-bhop assistance in the default queues: it exists as a **map option**
  (`CourseData.holdToBhop` → `RaceDef.holdToBhop`): a held jump fires on every landing — 7 hops at
  13.6 m/hop from 16 m/s (steady strafing). No map turns it on yet (an owner decision).

## Air control

- perfect strafe turn at 15 m/s: **178.6°/s** without losing speed
- perfect strafe turn at 25 m/s: **135.9°/s** without losing speed
- perfect strafe turn at 35 m/s: **98.2°/s** without losing speed
- holding S (back) in the air at 30 m/s: 10.0 m/s after ONE tick (air braking is very strong)
- free fall: 20.0 m/s after 1 s, 40.0 after 2 s, 50.0 after 4 s (the 50 m/s cap)

## Surf faces (straight level ramp, 14 m faces)

| face angle | steady holds 20 m/s for 4 s | holds 30 m/s | slide speed letting go (after 1 s) |
| ---------- | --------------------------- | ------------ | ---------------------------------- |
| 45°        | yes                         | yes          | 10.0 m/s                           |
| 50°        | yes                         | yes          | 11.7 m/s                           |
| 55°        | yes                         | yes          | 13.4 m/s                           |
| 60°        | yes                         | yes          | 15.0 m/s                           |
| 65°        | yes                         | yes          | 16.4 m/s                           |
| 70°        | yes                         | yes          | 17.7 m/s                           |
| 75°        | yes                         | yes          | 18.7 m/s                           |
| 80°        | no                          | no           | 19.4 m/s                           |
| 85°        | no                          | no           | 19.9 m/s                           |

- stable surf range (steady holds both speeds): **45°–75°**. Course data allows 50°–85°; build standard maps at 55°–70°.

## Reference surf speed (V)

- The reference chain (tools/race/movement-lab.ts `referenceChain`: a 70 m straight, a 90° curve, a straight, an S-bend; 60° faces, 12 m tall, ~50 m of drop):
  - steady: median **V = 30.8 m/s** (top 38.2, 16.9 s)
  - human 0.6: median **30.2 m/s** (top 37.3, 17.1 s)
- Test curves at 0.8 V, V and 1.2 V (brief §12.3).

## Curve capability C(v)

The tightest ridge radius a rider holds over a nearly level 180° curve on 12 m faces, riding
a third of the way down: following it round, never leaving the face, keeping 90 % of the
speed. **Inside** = the curve turns toward the face (it holds you like a banked track; too
fast and it lifts you over the ridge). **Outside** = it turns away from the face (you hold
into it with the strafe key). Bots measured with steady and 0.7-efficiency strafing.

| face | entry speed | inside, steady | inside, 0.7 | outside, steady | outside, 0.7 |
| ---- | ----------- | -------------- | ----------- | --------------- | ------------ |
| 55°  | 15 m/s      | 8.0 m          | 8.0 m       | 8.0 m           | 8.0 m        |
| 55°  | 20 m/s      | 8.0 m          | 8.0 m       | 8.0 m           | 8.0 m        |
| 55°  | 25 m/s      | 8.0 m          | 8.0 m       | 8.0 m           | 9.9 m        |
| 55°  | 30 m/s      | 9.1 m          | 9.6 m       | 12.2 m          | 13.6 m       |
| 55°  | 35 m/s      | 13.3 m         | 13.6 m      | 15.5 m          | 20.3 m       |
| 60°  | 15 m/s      | 8.0 m          | 8.0 m       | 8.0 m           | 8.0 m        |
| 60°  | 20 m/s      | 8.0 m          | 8.0 m       | 8.0 m           | 8.0 m        |
| 60°  | 25 m/s      | 8.0 m          | 8.0 m       | 9.9 m           | 13.3 m       |
| 60°  | 30 m/s      | 8.4 m          | 9.1 m       | 14.4 m          | 16.8 m       |
| 60°  | 35 m/s      | 12.6 m         | 12.9 m      | 18.2 m          | 23.8 m       |
| 65°  | 15 m/s      | 8.0 m          | 8.0 m       | 8.0 m           | 8.0 m        |
| 65°  | 20 m/s      | 8.0 m          | 8.0 m       | 8.0 m           | 13.6 m       |
| 65°  | 25 m/s      | 8.0 m          | 8.0 m       | 12.9 m          | 18.2 m       |
| 65°  | 30 m/s      | 8.2 m          | 8.4 m       | 17.3 m          | 22.6 m       |
| 65°  | 35 m/s      | 10.7 m         | 11.3 m      | 22.6 m          | 27.2 m       |
| 70°  | 15 m/s      | 8.0 m          | 8.0 m       | 14.0 m          | 18.7 m       |
| 70°  | 20 m/s      | 8.0 m          | 8.0 m       | 22.6 m          | 23.2 m       |
| 70°  | 25 m/s      | 8.0 m          | 8.0 m       | 25.1 m          | 25.1 m       |
| 70°  | 30 m/s      | 8.0 m          | 8.0 m       | 27.9 m          | 27.2 m       |
| 70°  | 35 m/s      | 8.7 m          | 8.9 m       | 31.0 m          | 30.2 m       |

The air control (Source-style, air acceleration 100) is strong enough that the physics
allows very tight curves; what limits a human is turning the mouse smoothly. The design
rule therefore adds a **turn-rate comfort limit** (an assumption until human playtests):
radius ≥ v / ω with ω = **60°/s for Beginner** and **90°/s for Intermediate** main lines
(optional faster lines may go to 120°/s), and never below the bot limits above:

| speed  | Beginner min radius (60°/s) | Intermediate min radius (90°/s) |
| ------ | --------------------------- | ------------------------------- |
| 15 m/s | 14.3 m                      | 9.5 m                           |
| 20 m/s | 19.1 m                      | 12.7 m                          |
| 25 m/s | 23.9 m                      | 15.9 m                          |
| 30 m/s | 28.6 m                      | 19.1 m                          |
| 35 m/s | 33.4 m                      | 22.3 m                          |
| 40 m/s | 38.2 m                      | 25.5 m                          |

_Measured in 37 s._
