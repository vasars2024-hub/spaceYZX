# The Orrery — redesign notes

**What it is now:** an old observatory built _around_ a giant clockwork orrery. The map used to be
one big open dome floor round the Sun with crates dotted about, so you could be shot from almost
everywhere. Now the orrery sits in a sealed **orbit hall** in the middle, and the rest of the map is
a building of rooms, corridors and doors wrapped round it: map rooms, star-chart libraries, lens
workshops, clock rooms, upper galleries and a gear crypt under the Sun. Same look as before: brass,
velvet red, old gold, star charts, the glowing Sun and the planets you can ride.

The map is still **mirror-symmetric** (Cyan west, Orange east), and the north half is the same as the
south half (bomb site A in the north, B in the south).

## Floors

| Floor                 | Height              | What is there                                                                                                                                                                      |
| --------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gear crypt (basement) | 5 m under the floor | Round the Sun's axle, under the Sun; stairs down from the orbit hall (north and south of the Sun); crawl tunnels east and west that come up by ramp inside each team's Tower room. |
| Ground                | 0 m                 | The orbit hall, the two bomb-site galleries, and per team: clock rooms, the Tower room, lens workshops, star-chart libraries, map rooms, the vestibules and the spawn rooms.       |
| Upper galleries       | 7 m                 | Closed corridors north and south of the orbit hall. Their "docks" are windows into the hall where the planets stop. A balcony ("heaven") looks down into each bomb site.           |

## Plan (seen from above, north at the top)

```
 map room | library A |   A SITE    | library A | map room
 spawn N  |           |  (gallery)  |           | spawn N
 vestibule|  upper gallery + docks (y 7)  over the mid corridor | vestibule
 lens     | clock room |  ORBIT HALL (sealed)  | clock room | lens
 TOWER    |  (tube to  |    planets + SUN      |  (tube to  | TOWER
 room     |   crypt)   |  (crypt underneath)   |   crypt)   | room
 lens     | clock room |                       | clock room | lens
 vestibule|  upper gallery + docks (y 7)  over the mid corridor | vestibule
 spawn S  |           |    B SITE    |           | spawn S
 map room | library B |  (gallery)  | library B | map room
```

- **The orbit hall** (40 × 44 m, glass roof). Entered by six ground doors (two in each side wall
  from the clock rooms, one at each end from the site corridors) and from the crypt stairs. The
  **Sun** stands in the middle: its iron pedestal (7 m high, ramps up its east and west faces) and
  its glowing core on top block every line across the hall — you cannot see from one side of the
  hall to the other. Giant upright gears stand in the hall's corners as cover.
- **The planets** (moving platforms on fixed schedules) glide inside the hall at upper-floor height:
  - _Mercury_ (×2): north upper dock ↔ the Sun's north ledge.
  - _Venus_ (×2): the Sun's south ledge ↔ south upper dock (half a loop behind Mercury).
  - _Saturn_ (×2): north dock ↔ south dock along the hall's side — a fast shortcut between the two
    upper galleries.
    A ride is always a shortcut; every place can also be reached on foot (bots always walk).
- **The crypt** is the flank loop: from your Tower room down the tube, along the crawl tunnel, round
  the Sun's axle, and up the stairs into the hall (or on through the other tunnel into the enemy's
  Tower room).

## Lanes to each bomb site (B shown; A is the same in the north)

1. **Mid:** through the orbit hall and its end door into the mid corridor, straight into the site.
2. **Library (one per team):** spawn → map room → star-chart library → the site's side door.
3. **Upper:** spawn → ramp up to the upper gallery → _heaven_, the balcony over the site (drop in
   or shoot down; it can be shot back from the site).

Connectors: the clock rooms join the hall and the libraries; the upper gallery crosses over the mid
corridor; the crypt links the two Tower rooms and the hall.

**Sites:** each is an enclosed gallery (28 × 14 m, ceiling 12 m) with three ground entrances (mid
door, and a side door from each team's library) plus the heaven balcony above. Cover: two brass
astrolabe plinths (2.4 m), crates by the doors, low cover at the back.

## Spawn groups (detached)

Each team has two separate spawn rooms of 4 spawns each, behind their own vestibule:

| Group   | Where                           | Purpose                                               |
| ------- | ------------------------------- | ----------------------------------------------------- |
| `north` | north corner of the team's wing | nearer A: first to the north library and the A heaven |
| `south` | south corner of the team's wing | nearer B: first to the south library and the B heaven |

A round spreads the team over both groups, so in 2v2 / 3v3 players start in different rooms. Each
vestibule has three exits: the lens-workshop door toward the Tower room, the ramp up to the upper
gallery, and the map-room door toward the site. No spawn can be seen from outside the spawn areas
(tested).

Sprint times along the bot routes (from the south spawn): B site 10 s, A site 13 s, the orbit hall
door 9 s, the crypt 9 s, the enemy Tower 13.5 s.

## Openness (`npm run map -- orrery`, section 12)

|        | Mean watched area | 90th percentile | Seen from 6+ directions |
| ------ | ----------------- | --------------- | ----------------------- |
| Before | 1,879 m²          | 2,544 m²        | 83%                     |
| After  | 334 m²            | 656 m²          | 11%                     |
| Target | ≤ 800 m²          | ≤ 1,500 m²      | ≤ 30%                   |

The only long lines (up to 66 m) are deliberate, narrow AWP-style lanes at upper-floor height: from
one upper gallery's dock windows, across the orbit hall past the Sun's core, to the other gallery or
its heaven balcony. On the ground the Sun blocks every line across the hall.
