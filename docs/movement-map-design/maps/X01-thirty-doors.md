# X01 — Thirty Doors (as built, rebuild 2)

Stage surf map, mode **Expert** • MOVEMENT_PROFILE v1 • map id `surf-thirty-doors` • source
`packages/shared/src/level/maps/surf-thirty-doors.ts` (`thirtyDoorsCourse`) • own tests
`packages/shared/test/surf-thirty-doors.test.ts`. Built, tested and timed by bots; not yet played
by a human after this rebuild. Personal bests from the first version are dropped
(`TRACK_REVISIONS['surf-thirty-doors'] = 2` in `rating/race.ts`): it is a different map now.

The owner's first brief: _"a sectioned off clear room to get to next room surf map with each room
having its own challenge unique gimmick and such, total 30 rooms or so maybe, it needs to start
easy and go to extra challenging extreme."_

Why it was rebuilt (the owner, after playing it): _"everything is the same — reused multiple
portal gimmicks, same curved ramps, no actual jumps or flicks that require skill, nowhere is it
necessary to land in one specific spot … There's no flying like jumper maps in Minecraft. There
are no mid-air rotations, no mouse flicks, nothing."_ and _"I want more than I asked for."_

So the frame stayed (rooms, doors, speed rings, restart bays, gates, wing colours, room numbers)
and **everything inside the rooms is new**: every room is a different skill test.

## 1. Identity

|                   |                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Theme             | thirty sealed halls open to a twilight sky, stacked in three floors; each hall walled in its wing's colour, glowing pilasters up the walls, a glowing band along their tops, the hall's number in giant glowing digits on its far wall                                                                 |
| Movement identity | _Clear the room, take the door._ Every room is one skill test: taught with big targets, then combined, then chained with small targets.                                                                                                                                                                |
| Structure         | 30 rooms = 30 progress gates (named `n · NAME`) + the finish. Each room ends in a **door**: a portal marked with the next room's number                                                                                                                                                                |
| Wings (look)      | 1–5 Dawn Terraces (sea-green faces, limestone walls, warm glow) · 6–10 Amber Halls (amber, sandstone) · 11–15 Glacier Vaults (ice blue, white) · 16–20 Neon Foundry (violet, dark walls, cyan glow) · 21–25 Basalt Forge (basalt, charcoal, orange glow) · 26–30 Void Crown (pearl, near-black, lilac) |
| Hazards           | hazard red #E8242C only on red zones (decks, floors under blocks, strips on faces, ceilings, a post); cloud floors under every room                                                                                                                                                                    |

## 2. How a room works (unchanged)

1. You come out of the previous room's door (level, heading south) inside a **speed ring** that
   sets your speed to the room's level: **teach 24, medium 27, hard 30, extreme 33 m/s**,
   whatever you carried in. Every room starts the same way.
2. 6 m on you fly through the room's **gate** (its split).
3. You clear the room and leave through its **door** (openings shrink: 18 → 16 → 14 → 12 m).
   Room 30 ends at the finish gate.
4. **A fall anywhere in a room brings you back to that room's start** (its restart bay behind the
   door); the bay's launch throws you back through the speed ring, so a restart replays the
   room's start exactly.

The building: three floors of ten rooms (5 columns × 2 rows), every room starting south. Rooms
that turn (5, 13, 21, 23, 24, 29, 30) are laid out so they stay inside their own cell: all 120
walls are placed.

## 3. How the gaps were sized

Every jump, gap and landing comes from the measured movement (gravity 20 m/s², a jump is 6.9 m/s
up) and from the real simulation: the steady bot flies each room from its restart bay and the
release speed, rise and landing of every flight are read off
(`tools/race/trace.ts`-style traces). The two formulas used:

- **how far a flight goes** before it has come down `h` metres, leaving at `v` m/s with `vy` up:
  `v × (vy + √(vy² + 2·20·h)) / 20` (`reach()` in the map source);
- **passing through a deck**: a 1.8 m body through a 0.6 m slab at a descent slope `k = |vy| / v`
  takes `2.4 / k` metres along; a hole is that plus the window a clean line gets.

Each key gap has a `sized:` comment in the source with its numbers. The owner's pains were fixed
at the source: blocks sit where the clean line comes **down onto their middle** (room 21's block
was lowered 0.6 m so the line clears the front edge by 0.9 m instead of clipping it), ramps start
far enough out that you land on the face and not on the end (room 26), and turns go the way the
face drops (room 30), never back up over your own ridge.

## 4. The thirty rooms

Clean = the steady bot's time for the room (s).

| #   | Room           | Mechanics                                                                                                           | Why it's hard                                                                                          | Level   | How the key gaps were sized                                                                                               | Clean |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | First Light    | one long wide ramp banking into a broad 60° turn                                                                    | it isn't: it teaches holding into a face through a bank                                                | teach   | 18 m faces, a 90 m bend                                                                                                   | 8.7   |
| 2   | Stepping Block | **surf → block**: off the ramp onto a 10 m block, jump the moment you land, catch the next ramp                     | first landing on a spot; miss the jump tick and friction eats your speed                               | teach   | release 31 m/s falling 3: block where the line has come down 6 m (20 m on); the jump off it 40 m on, 8 m down             | 7.5   |
| 3   | The Lip        | **lip kicker** over a wall                                                                                          | leave the ramp before the lip and you come down flat into the wall                                     | teach   | lip 27 m/s, 10 up: 1.5 s, 42 m on; the wall's top 4 m under the release, cleared by 5 m                                   | 7.7   |
| 4   | Big Air        | **jumper flight**: a booster ring throws you high; steer onto a ramp 18 m off to the side                           | first steering in a long flight                                                                        | teach   | ring 26 m/s, 12 up: 1.85 s, 50 m on, 13 down; 18 m across = a 20° steer                                                   | 7.7   |
| 5   | Quarter Turn   | **mid-air rotation 90°** off a lip onto a ramp running across                                                       | first rotation: turn too early or late and you miss the face                                           | teach   | lip 28 m/s, 8 up: 1.3 s in the air, 36 m flat, the ramp 22 on and 22 across                                               | 6.9   |
| 6   | Crossways      | **mouse flicks**: ramps set 25–50° across your path, one way then the other                                         | every landing needs a sharp look change on the landing tick                                            | medium  | transfers 14 m on, 9 across at 32–36 m/s: 0.5–0.6 s flights, 4–5 m down                                                   | 8.7   |
| 7   | Upsurf         | **upsurf**: climb a rising ramp, keep your speed to its top, fly onto a raised 7 m block                            | lose speed on the climb and you fall short                                                             | medium  | released at the top at 21.5 m/s, 8.5 up: 18 m to the block; the jump off it 32 m on                                       | 8.2   |
| 8   | Pinball        | **tech surf**: five short steep faces (9 m at 65°, 4.2 m across) left, right, left                                  | one touch per face, straight across to the next; a metre wide and you miss                             | medium  | 20 m on, 5–7 across at 32–40 m/s: 0.55–0.6 s flights, 5 m down                                                            | 9.2   |
| 9   | Waterfall      | **long down-transfers**: three 18 m drops onto alternating faces                                                    | land a long drop cleanly on a face 10 m off to the side                                                | medium  | reach(30, −2, 18) = 42 m on; traced 38–46 m in 1.2–1.3 s                                                                  | 9.3   |
| 10  | Over the Top   | **reverse board**: a lip throws you over an A-frame's ridge onto its far face                                       | the face you want faces away from you: land past the ridge, not on it                                  | medium  | lip 30 m/s, 9 up: lands 25 m on and 11 across at release height, clearing the ridge by 2 m                                | 7.9   |
| 11  | Pad Pillars    | **chained pad flights with target switches** onto 5 m pillars; stop on the last one, its pad fires you on           | each pad throws you straight on, the next pillar is 7 m to the side: switch target mid-air three times | hard    | a pad throws 25 m/s, 15 up: the next pillar where that comes down (38–40 m on); traced 40.5–41 m                          | 11.5  |
| 12  | Halfpipe       | **V-pipe surf under a low red ceiling**: ride low on one wall, cross to the other and back                          | ride higher than 0.45 of the face and the ceiling takes you                                            | hard    | a crossing is 6.5 m across in 26 m on; the ceiling 1.6 m over your head                                                   | 9.2   |
| 13  | Round the Post | **air-strafe curve 180°** round a red post onto a ramp heading back                                                 | pure air strafing: a half circle 32 m across in 2 s; cut it short and you hit the post                 | hard    | lip 31 m/s, 9.5 up: 2.0 s in the air; the half circle is 50 m of flight (1.6 s)                                           | 7.6   |
| 14  | Trapdoor       | **drop-through**: fly over a red deck and drop through its one hole onto the ramp underneath                        | the hole is 9 × 7 m; drop early or late and you land on red                                            | hard    | release 34.4 m/s falling 3.3; deck 8 m down, hole centred where the body is half through it (27.8 m on), ±2.2 m of window | 5.2   |
| 15  | Needlework     | **needle ramps**: three 2.7 m faces with red strips below 0.75, left, right, left                                   | the landing window across is the face itself                                                           | hard    | 21–25 m on at 34–40 m/s, 0.62 s flights, 6 m down                                                                         | 7.9   |
| 16  | Staircase      | **up-transfers**: each lip throws you onto a ramp higher than you left                                              | a speed check: only a rider who kept the speed reaches the next face                                   | hard    | lips 29–31 m/s, 11.5 up: 1.0 s, 29–32 m on, landing 1–1.6 m higher                                                        | 10.1  |
| 17  | Blind Crest    | **blind board with a hint**: a crest throws you over a wall; the ramp is hidden far below; steer by a beacon        | you can't see the landing until late: read the beacon                                                  | hard    | lip 31 m/s, 9.5 up: 2.0 s, 65 m on, 22 m down                                                                             | 6.2   |
| 18  | Drop-In        | **precision stop + drop-in**: land on a 6 × 7 m ledge, bleed the speed, run off its end onto a steep ramp far below | land late or fast and you overshoot the drop                                                           | hard    | you land at 34 m/s; the ledge bleeds it to 11 m/s by its end; the fall is 19 m in 1.1 s, 13.5 m on                        | 7.0   |
| 19  | Mirror         | **portal U-turn**: a portal turns you right round; where you enter it is where you come out, over a needle          | enter off-centre and you come out beside the needle                                                    | hard    | portal 14 m on (0.4 s); exit 10 behind, 40 left, 8 down                                                                   | 6.4   |
| 20  | Speed Trap     | **speed check with scoops**: pump through dips; the gap after the lip only carries a rider who kept the speed       | riding the scoops high bleeds speed: 3 m/s lost is 4 m short                                           | hard    | lip 29 m/s, 9.4 up: 1.4 s, 41.5 m; the landing 44 m on                                                                    | 7.4   |
| 21  | Flick Block    | **surf → small block over red + flick**: land on a 5 m block, jump, flick 90° onto a ramp to the side               | small block, red floor under it, then a rotation on the jump                                           | extreme | release 37 m/s falling 2.7: block where the line has come down 6 m, top 0.6 m lower so you land on its middle             | 5.2   |
| 22  | Ridge Hops     | **ridge hops**: three A-frames in a staircase; each lip throws you over the next ridge onto its far face            | come down late (too far across) and you land in the red; early and you hit the near face               | extreme | lips 31 m/s, 9 up: 1.4 s, 42–47 m on, clearing each ridge by 2 m; faces 10 m at 63° (5.1 m across), red from 0.7          | 9.8   |
| 23  | Corkscrew      | **mid-air rotation 180°** off a steep lip onto a needle behind and below you                                        | a full half turn with a narrow target, 28 m below                                                      | extreme | lip 32 m/s, 12 up: 2.4 s, 28 m down; the half circle 38 m across is 60 m of flight (1.9 s)                                | 7.6   |
| 24  | Pinwheel       | **three rotations in a row**: kickers round a square, each lip throws a quarter turn right onto the next            | chained 90° turns: one late turn ruins the next                                                        | extreme | lips 29–33 m/s, 9–10 up: 1.35–1.4 s, 40–43 m flat; each kicker 30 on, 26 across                                           | 11.0  |
| 25  | Pinball Tunnel | **tech surf under low ceilings**: six wedges (2.7 m across) left and right, red ceilings 4.2 m over the line        | tight faces, fast (35–44 m/s), and no room to fly high                                                 | extreme | as Pinball (20 m on, 4 across, 0.5–0.55 s flights) with the ceilings over each wedge                                      | 9.2   |
| 26  | Freefall       | **long drop + up-transfer**: fall 35 m onto a needle, then its lip throws you up onto a higher ramp                 | the drop has to land on 2.7 m; the up-transfer only works with the speed from the drop                 | extreme | drop 55 m in 1.5 s; needle lip 35 m/s, 17 up: 1.5 s, 52 m on, 3 m higher                                                  | 7.2   |
| 27  | Blind Flick    | **blind board + flick**: over a crest wall onto a hidden ramp crossing your path at 60°, by the beacon              | a flick you have to time without seeing the ramp                                                       | extreme | lip 32 m/s, 11 up: 2.0 s, 65 m on, 18 down                                                                                | 6.4   |
| 28  | Sky Steps      | **two small blocks over red, a rotation each**: land, jump, turn 90° left, land, jump, turn 90° right               | two 4 m blocks, each with a red floor, each a rotation from the last                                   | extreme | first block where the line has come down 6 m (−3 m); jump at 37 m/s: the second 27 m on, 3 down (0.97 s); then 42 m on    | 6.8   |
| 29  | Portal Relay   | **portal quarter turn mid-flight + tiny pillar + pad redirect**: brake onto a 4 m pillar; its pad fires you back    | land on 4 m after a portal turned you; the pad then turns you 90° again onto a needle                  | extreme | out of the portal level at 34 m/s: the pillar 28 m on, 8 down (0.9 s of fall carries 30 m: brake a little)                | 8.2   |
| 30  | The Last Door  | **upsurf onto a tiny block, flick through a trapdoor, a second rotation, needle, home**                             | three mechanics chained, each with a small target                                                      | extreme | the flick's hole (8 m) centred where the traced flicks pass the deck, 9 m down: a clean flick has a metre either way      | 13.0  |

## 5. The mechanics and how often each is used

| Mechanic                                                      | Rooms                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| Banked sweep                                                  | 1                                                         |
| Surf → block (land on a specific block, jump on the landing)  | 2, 7, 21, 28 (×2), 30 — 5 rooms, 10 → 7 → 5 → 4 m         |
| Lip kicker (a ramp that throws you up)                        | building block in 3, 5, 10, 13, 16, 17, 20, 22–24, 26, 27 |
| Clear a wall                                                  | 3, 17, 27                                                 |
| Jumper flight off a booster ring                              | 4                                                         |
| Mid-air rotation 90°                                          | 5, 21, 24 (×3), 28 (×2), 30 (×2)                          |
| Mid-air rotation / air-strafe 180°                            | 13 (round a post), 23 (onto a needle)                     |
| Mouse flick onto a ramp across your path                      | 6 (25–50°), 21, 27 (60°, blind), 30                       |
| Upsurf (climb, release at the top onto a target)              | 7, 30                                                     |
| Tech-surf pinball (short steep faces left/right)              | 8, 25                                                     |
| Long down-transfers / drops                                   | 9, 26                                                     |
| Reverse board over an A-frame ridge                           | 10                                                        |
| Ridge hops between A-frames onto a specific face              | 22                                                        |
| Chained launch-pad flights with target switches, tiny pillars | 11, 29                                                    |
| V-pipe (halfpipe) surf                                        | 12                                                        |
| Surf under a low ceiling (forced low line)                    | 12, 25                                                    |
| Drop-through a trapdoor                                       | 14, 30                                                    |
| Needle ramps (2.7 m faces)                                    | 15, 19, 23, 26, 29, 30                                    |
| Up-transfers (speed checks)                                   | 16, 26                                                    |
| Blind board with a beacon                                     | 17, 27                                                    |
| Precision stop, then drop-in                                  | 18 (ledge), 11 and 29 (pillar tops)                       |
| Portal U-turn (enter off-centre = come out off-centre)        | 19                                                        |
| Portal quarter turn mid-flight                                | 29                                                        |
| Speed check through pumping scoops                            | 20                                                        |
| Red under the target (floors, strips)                         | 15, 21, 22, 28, 29                                        |

The owner's hard rules, as the tests hold them: **no bunny-hop pads** (every block is one block),
**portals in 2 rooms** (19, 29; the doors apart), **no fly-through windows** and **trapdoors in 2
rooms** (14, 30), no two rooms with the same test. Ramps: 18 m wide sweeps down to 5 m needles and
6 m wedges, straight faces, banked turns, climbing lips, scoops, A-frames, a V-pipe; met from
the side (5, 24, 28, 30), from behind the ridge (10, 22) and heading back (13, 19, 23).

## 6. The difficulty ramp (what the tests hold)

- entry speed rises every level (24 → 27 → 30 → 33 m/s); doors shrink (18 → 16 → 14 → 12 m);
- the smallest face per room shrinks on average; tightest bends: teach ≥ 80 m, then tighter;
- blocks shrink: teach 10 m, medium 7 m, extreme 4 m;
- red: none in rooms 1–10, four hard rooms, six extreme rooms.

## 7. Measured timings and budget

- Steady bot, clean run: **4:06** (246 s), 0 falls, every room 5–13 s; par **245 s**.
- Human bot strafing at 0.8: 250 s, finishes. At 0.6 it clears rooms 1–12 and then stalls at
  13 Round the Post (a half circle in the air needs real air strafing): it is an Expert map.
- From every restart bay the steady bot clears its room, never faster than riding on.
- Budget: **6 658 boxes**, **≈ 157 k triangles**, 0 overlaps, 0 validation problems (the first
  version was 9 948 boxes, 223 k triangles).

## 8. Not possible today (would need an engine change)

- **Moving targets** (ramps or blocks on movers): the engine has movers (`LevelDef.movers`), but
  the course format that surf maps are written in has no mover element, and the racing bot
  can't time one. Adding it is an engine change.
- **Crouch-under gaps mid-flight**: crouching works in the air, but the racing bot never crouches,
  so no test could drive such a room. Rooms 12 and 25 force a low line with red ceilings instead.
- **Sideways gravity / wall deflects**: race movement switches gravity shifts off
  (`sim/movement.ts`: "no gravity shift on race tracks"), so they are skipped.
- **Per-room sky**: one sky per course; rooms differ by wall and face colours only.

## 9. Untested assumptions

- Nobody has played the rebuild. The bots fly each room's racing line; how hard the flicks,
  rotations and small blocks feel with a mouse is unknown — sizes may need a playtest pass (the
  `sized:` comments say which number to change).
- The bots' "sloppiness" is weaker strafing, not a wrong direction or a late flick, so the
  windows were sized from the spread between runs (bay and chained) and the formulas above.
