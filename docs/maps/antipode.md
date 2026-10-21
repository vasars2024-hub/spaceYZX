# Antipode — redesign notes

## What changed, in short

The old Antipode was two big open decks facing each other: from almost anywhere on one deck you
could see (and shoot) most of the other deck across the zero-G Seam. The redesign keeps
everything that makes the map Antipode and builds CS-style rooms around it:

- **Kept:** one hollow hull; Cyan stands on the FLOOR deck, Orange on the CEILING deck (upside
  down); fair by a half-turn (every part of Cyan's side has an exact twin on Orange's side,
  turned over: `(x, y, z) → (-x, 28 - y, z)`); the Seam (zero-G, drift across and fall "up"
  onto the other deck); the Spindle (walk up its grooves, through the Seam, onto the other
  deck); stairwells whose gravity bends floor → wall → ceiling; the colours and lights (cold
  white on the floor deck, amber on the ceiling deck, violet in the Seam).
- **New:** each deck is now rooms and corridors under a 6 m roof. Only the **well** in the
  middle of the hull looks across the Seam, so the Seam is still the open, risky shortcut but
  most of the map is not in view of it.
- **New:** both bomb sites are on the hull's **north side wall** — a third "deck" where gravity
  pulls you sideways into the wall. You reach them through doors and corridors.
- **New:** flank tunnels in the **south side wall** link both decks.
- **New:** two detached spawn rooms per team.

## The floor deck (Cyan's; the ceiling deck is the same, turned end for end)

Top view, west (Cyan's end) on the left:

```
 x: -60 ........ -47 ........ -34 ......... -22 .. -13 ....... 13 .. 22 ......... 36 ...... 42 ... 60
    | BASTION     | north passage | B lobby (door to site B)  | north gallery -> junction door | A lobby (door to site A)
    | (Tower,     |               | HOME HALL                 | THE WELL + Spindle | EAST HALL |
    |  spawns)    | south passage | tunnel lobby (tunnel door)| south gallery      | tunnel lobby (tunnel door)
    | QUARTERS (spawns) -----------'
```

- **Bastion** — Cyan's Tower and 4 spawns, behind blast walls, two corner doors (north and
  south passages).
- **Quarters** — the second spawn room (4 spawns) at the south-west, bunks behind a bulkhead;
  a door north (south passage) and a door east (tunnel lobby).
- **Home hall** — the big room in the middle of Cyan's end; exits to the B lobby, the tunnel
  lobby and the corridor to the well.
- **B lobby / A lobby** — rooms in front of the site doors.
- **North and south galleries** — side corridors with a bulkhead halfway, leading to the
  junction corridor and the well.
- **Tunnel lobbies** — rooms in front of the flank tunnel doors.
- **The well** — the only open place: the hole under the Seam, with the Spindle standing in it
  and a launch pad in two corners (it throws you up through the Seam onto the other deck's well
  floor).

## The side walls (the third "deck")

- **North wall — the sites.** Site B's room (x -40..-22) and site A's room (x 22..40) run up
  the wall from the floor deck to the ceiling deck. Each site room has **three entrances**: a
  door from the floor deck, a door from the ceiling deck, and a side door into the connector
  that joins both sites through the **junction hall** (x -6..6, itself a floor ↔ ceiling way
  with a door on each deck). Defenders rotate A ↔ B along the wall. Site B is at Cyan's end
  (near the bastion: Cyan's home site), site A at Orange's end.
- **South wall — the flank loop.** An "H" of tunnels: the low bar links the floor deck's two
  tunnel lobbies, the high bar links the ceiling deck's, and the rung in the middle joins the
  bars (floor ↔ ceiling). Staggered baffles on each bar mean no 60 m sightline down a tunnel.

## Ways between the decks

1. The Seam: jump or launch pad out of the well, drift, fall "up" onto the other deck.
2. The Spindle: four grooves, a slow but covered walk up the column.
3. Through a site room (floor door → up the wall → ceiling door).
4. The junction hall.
5. The flank tunnels' rung.

## Spawn groups (a round spreads each team over both)

| Group    | Where                                     | Two exits                      | What it is for                                         |
| -------- | ----------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| Bastion  | the Tower room at the deck's end          | north and south passages       | the home site (B for Cyan, A for Orange) and the Tower |
| Quarters | south-west room, next to the tunnel lobby | south passage and tunnel lobby | the flank tunnels and the far site                     |

No spawn can be seen from outside its own room (tested).

## Openness (npm run map, section 12)

|        | Mean watched area | 90th percentile | Seen from 6+ directions |
| ------ | ----------------- | --------------- | ----------------------- |
| Before | 3,534 m²          | 5,536 m²        | 50.1%                   |
| After  | 299 m²            | 576 m²          | 5.3%                    |

Target: ≤ 800 m² / ≤ 1,500 m² / ≤ 30%. The most open places now are the well floors and the
Seam (about 450–600 m²) — on purpose: the crossing is the risky part.
