# Canyon Relay — redesign notes

**What it is now:** the same desert mesa at sunset, the same deadly gorge through the middle with
the Relay Rock (power-up) in it, the same launch pads and rock bridges, the same slot canyons with
angled rock fins leading down to the bomb basins. What changed: the two flat mesa tops, where you
could be shot from almost everywhere, are now **adobe relay-station pueblos** — walled yards,
narrow streets, covered rooms with roofs, doors and corners — with an **old mine** under each one
and a **rail tunnel** under the gorge. Same look as before: sunset sky, warm fog, red rock strata,
adobe walls, cacti.

The map is still **mirror-symmetric**: Cyan's half (north) is the same as Orange's half (south),
and the east half is the same as the west half. Bomb site A is in the east basin, B in the west
basin, both exactly on the middle line, so both teams are the same distance from each site.

## Floors

| Floor       | Height     | What is there                                                                                                                |
| ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Streets     | 0 m        | The pueblo: station yard (Tower), two camps (spawns), storehouses, cantinas, the plaza, rim street, lookouts and gatehouses. |
| Mine        | 5 m down   | A hall under the plaza, a gallery east and west under the rim street, and a cave passage that comes out in each basin.       |
| Rail tunnel | 8.5 m down | Under the gorge, from one team's mine hall to the other's, through the foot of the Relay Rock. A covered crossing.           |
| Basins      | 5 m down   | The bomb sites, walled in by cliffs, under a natural rock arch.                                                              |
| Gorge       | 30 m down  | Deadly. Only the Relay Rock (3 m down), the rock bridges and the tunnel are safe.                                            |

## Plan (Cyan's half seen from above, north at the top; Orange's half is the mirror image)

```
 slot   | WEST CAMP  | store- | tower | STATION YARD | tower | store- | EAST CAMP  | slot
 canyon | (spawns)   | house  | alley |  (Tower,     | alley | house  | (spawns)   | canyon
 (fins) | mine house | cantina|       |   spawns)    |       | cantina| mine house | (fins)
   |    |  market st.|        PLAZA (well, stair down to the mine hall)  | market st.|    |
   |    |  rim street / rim houses   | RELAY HOUSE |   rim street / rim houses  |    |
   v    | gatehouse | lookout | TERRACE (launch pads) | lookout | gatehouse |    v
 B BASIN|  bridge   |  ~~~~ GORGE ~~~~ RELAY ROCK ~~~~ GORGE ~~~~  |  bridge   | A BASIN
 (site) |                 (rail tunnel under the gorge)                         | (site)
```

- **Station yard** (the Tower): a walled court with a door east and west into the tower alleys;
  a low wall inside each door keeps the spawns out of sight from the alley.
- **Camps** (east and west): walled caravan camps with three exits each: the canyon gate (to the
  slot canyon), the market gate (to the market street and the mine house) and the storehouse
  (a covered room to the tower alley).
- **Storehouse, cantina, mine house**: covered rooms with doors, a crate stack or a bar inside so
  no door looks straight through to the next.
- **Plaza**: the middle of each pueblo, with a well (half cover) and a stair down into the mine hall.
- **Relay house**: a covered pass from the plaza to the terrace, with offset doors.
- **Terrace**: the overlook on the gorge; the launch pads throw you across onto the enemy terrace;
  walking off the middle drops you onto the Relay Rock.
- **Lookout and gatehouse**: covered rooms on the rim; the gatehouse opens onto the rock bridge.
- **Hoodoos**: rock towers in the gorge between the Relay Rock and the bridges, so nobody sees
  along the whole gorge.

## Lanes

1. **Rock bridges (east and west)**: camp or plaza → rim street → lookout / gatehouse → bridge →
   the enemy gatehouse. Narrow, with waist-high parapets.
2. **Terrace and the Relay Rock (middle)**: relay house → terrace → launch pad across the gorge, or
   drop onto the Relay Rock for the power-up.
3. **Rail tunnel (under the middle)**: plaza stair → mine hall → rail stair → tunnel under the gorge
   → the enemy mine hall. The flank loop: nobody on the surface sees you.
4. **Slot canyons (outside, east and west)**: camp → canyon gate → between the rock fins → down the
   ramp under the rock overhang → basin.
5. **Mine galleries**: mine hall → gallery under the rim street → cave passage → cave mouth into the
   basin.

## Bomb sites

Each basin (A east, B west) is walled in by cliffs, 5 m below the streets, with the site under a
natural rock arch and rock cover (full and half height). **Entrances:** from each half, the slot
canyon ramp (under the overhang) and the cave mouth from the mine — two per team, four in all.
Site to site takes about 14 s through the mine.

## Spawn groups (a round spreads a team over its groups; in 3v3 one player starts in each)

| Group       | Spawns | Where                          | What it is for                                    |
| ----------- | ------ | ------------------------------ | ------------------------------------------------- |
| `station`   | 2      | the station yard, by the Tower | the middle: terrace, relay house, the rail tunnel |
| `east camp` | 3      | the east camp                  | A: the east slot canyon or the east mine gallery  |
| `west camp` | 3      | the west camp                  | B: the west slot canyon or the west mine gallery  |

No spawn can be seen from the enemy half, the gorge, the canyons or the basins (tested).

## Timings (sprint, from the station yard; `npm run map -- canyon-relay`)

| Route                                       | Time       |
| ------------------------------------------- | ---------- |
| Terrace edge (first sight across the gorge) | ~4.8 s     |
| Rail tunnel middle                          | ~6.4 s     |
| Rock bridge middle                          | ~6.6 s     |
| A / B site through the mine                 | ~10–11 s   |
| A / B site down the slot canyon             | ~11.5–13 s |
| Enemy Tower (bridge or tunnel)              | ~13.5 s    |

## Smaller teams

- 3v3 and smaller: the canyon gates close, so the camps reach the basins through the mine only
  (the slot canyons stay open from the basins).
- 1v1 / 2v2: the canyons and basins close; the bomb sites move onto the rock bridges.

## Openness (report section 12)

|                               | Before  | After  | Target |
| ----------------------------- | ------- | ------ | ------ |
| Watched area, mean            | 933 m²  | 252 m² | ≤ 800  |
| Watched area, 90th percentile | 2048 m² | 464 m² | ≤ 1500 |
| Spots seen from 6+ directions | 41 %    | 7.4 %  | ≤ 30 % |

The most open places left are the Relay Rock (on purpose: the power-up is a risk), the basins
and the terraces.
