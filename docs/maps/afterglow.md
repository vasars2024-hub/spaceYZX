# Afterglow — the night market district (redesign)

**What it is now.** Afterglow is still the night market on an orbital city's promenade under a
skyglass dome: neon, rain puddles, paper lanterns, stalls and vending machines, the planet's
night side behind the south glass, the monorail and the Koi Plaza with its holographic koi
round the dry fountain. What changed is the layout. The old map was one big open promenade with
stalls on it; the new one is a dense market _district_: tall tenement blocks (9 m, nobody gets
on top of them) with narrow lit alleys between them, shops you walk through, an upper floor and
a metro level under the streets. Every wall is full height, so you fight one alley, one room or
one doorway at a time.

The map is mirror-symmetric across the middle (x = 0): Cyan (team A) spawns west, Orange
(team B) east. Everything below is described for the east half; the west half is its mirror
image.

## Three floors

| Floor  | Height                            | What is there                                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------- |
| Street | 0 m (the plaza basin 1.2 m lower) | alleys, streets, shops, the arcade hall (site A), the Koi Plaza, the Foyer                    |
| Upper  | 4.5 m                             | the teahouse and its balcony over the plaza, the covered monorail track, the station (site B) |
| Metro  | −5 m                              | the base's metro platform, a tunnel from side to side, the metro hall under the station       |

## Plan (east half, from north to south)

```
 z -40  ┌ Lantern Alley (paper screens) ─────────────┐ base N corridor
        │ alley   Noodle Bar (walk-through)          │ NORTH YARD (spawns)
 z -28  ├ corner ─ Arcade Lane ── A: ARCADE HALL ◄───┤   │
        │         │ teahouse stair↑   (x -12..12)    │   │
        │ Noodle Row                                  │   │
 z -12  │ jog ─ Lantern Passage (teahouse above) ─ KOI PLAZA (sunk, 4 mouths)
 z  -6  ├ MARKET STREET ─────────────────────────────┤ TOWER HALL (Tower)
        │ PACHINKO PARLOUR (walk-through, stair ↓ metro)   ramp ↓ METRO PLATFORM (spawns)
 z   6  │                    FOYER (ticket hall) ─ station stair ↑ B, stairs ↓ metro hall
 z  17  ├ TRAM STREET ─ South Alley                  │
 z  24  │   monorail track (upper, covered) ──► B: STATION (upper, x -10..10)
        │ Stair Alley   monorail stair ↑             │ SOUTH YARD (spawns)
 z  38  └ RAIL STREET along the south glass ─────────┘ base S corridor
 metro: platform → tunnel (under Tram Street) → metro hall under the station → other side;
        a branch goes up into the pachinko parlour
```

## Lanes

- **North lane → A.** Base corridor → Lantern Alley (dark, two paper screens across it: players
  and bullets stop, the Boomerang flies through) → the alley's corner → Arcade Lane → A's side
  door. The Noodle Bar is a walk-through shop: front door on the alley, side door on the
  corner, back door onto Noodle Row, which runs down to Market Street.
- **Mid.** Tower hall → Market Street → the jog → Lantern Passage (a covered passage under the
  teahouse) → the Koi Plaza's east mouth. From the plaza, Arcade Row runs north to A's front
  door and the south mouth leads into the Foyer (station stair up to B). The **teahouse** (upper
  floor) is a connector: stairs up from Market Street and from Arcade Lane, and a balcony that
  looks over the plaza (the one strong high spot; its railing is only waist high, so it can be
  shot back). The **pachinko parlour** is a walk-through shop from Market Street to Tram Street,
  with a stair down to the metro.
- **South lane → B.** Base corridor → Rail Street (along the glass) → the monorail stair → the
  covered monorail track (upper floor; a maintenance cart and a signal box break its long line)
  → the station. Or Stair Alley → Tram Street → South Alley → the Foyer.
- **Metro (loop flank).** Metro platform (in the base) → the tunnel under Tram Street → the
  metro hall under the station → stairs up into the Foyer, or on to the other side's tunnel.
  A branch climbs into the pachinko parlour, so the metro also flanks Market Street.

## Sites

- **A — the arcade hall** (street level, indoors, 4 m ceiling). Three entrances: the side doors
  east and west (claw machines just inside each one, so there is no line from one side door to
  the other across the site) and the front door up Arcade Row from the plaza (a kiosk up to the
  ceiling just inside, so the plaza cannot see across the hall). Cover: cabinet banks (full),
  pinball tables and the prize counter (half).
- **B — the station** (upper floor, enclosed). A train stands in it with its doors open on both
  sides and its ends shut (it ends the track's long line). Three entrances: the monorail track
  from the east, from the west, and the station stair up from the Foyer. Platforms: a timetable
  pylon and a kiosk (full), benches (half).

## Spawn groups (each team, 8 spawns)

A round spreads a team over its groups, so in 3v3 everyone starts somewhere different.

| Group | Where                                  | Spawns | Ways out                                                  | Purpose                                               |
| ----- | -------------------------------------- | ------ | --------------------------------------------------------- | ----------------------------------------------------- |
| north | the north yard                         | 3      | the corridor to Lantern Alley; the link to the Tower hall | the A player (north lane)                             |
| metro | the metro platform, 5 m under the base | 2      | the tunnel; the ramp up to the Tower hall                 | the flanker / the mid player (metro or Market Street) |
| south | the south yard                         | 3      | the corridor to Rail Street; the link to the Tower hall   | the B player (monorail, Stair Alley)                  |

No spawn can be seen from anywhere outside the base (the test checks every standing spot on
all floors).

## Openness (report section 12, `npm run map -- afterglow`)

|        | mean watched area | 90th percentile | seen from 6+ directions |
| ------ | ----------------- | --------------- | ----------------------- |
| before | 924 m²            | 1,696 m²        | 44%                     |
| after  | 178 m²            | 320 m²          | 1.8%                    |
| target | ≤ 800 m²          | ≤ 1,500 m²      | ≤ 30%                   |

The Koi Plaza is the most open part (about 300 m² watched), as it should be: it is the centre
fight, entered through four mouths plus the teahouse balcony.

## Where to change things

- Layout: `packages/shared/src/level/maps/afterglow.ts`, function `afterglowPlan()` paints the
  three floors on a 2 m grid (a wall is a painted block, a doorway a gap in it). Cover, stairs,
  neon and lights are placed by hand below it. Bot waypoints are at the end of the file.
- Tests: `packages/shared/test/afterglow.test.ts`.
