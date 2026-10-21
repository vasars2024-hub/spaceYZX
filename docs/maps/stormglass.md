# Stormglass: the redesign

The idea is the same: a storm observatory with the floor ripped out, high in a gas giant's
violet dusk. The Eye, the huge void between the two bastions, is still there, and falling in
still kills you. What changed is everything around it. The bastions used to be open terraces.
Now they are **buildings on three floors**, and under the bridges runs a **maze of maintenance
tunnels** (your "second floor or a maze at the bottom" idea, and it has both). The Eye is still
chaotic, but you only fight in it when you choose to cross it.

The map is still mirror-symmetric across the middle line (Cyan west, Orange east). Everything
below describes the east (Orange) side. The west side is its mirror image.

## Floors

| Floor            | Height | What is there                                                                                                                        |
| ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Instrument floor | 5 m    | Dome gallery (north) and radio room (south) over the halls, an upper corridor on each side, the instrument deck over the front hall  |
| Deck             | 0 m    | Bridgeheads, halls, corridors, pad bays, gate bay, front hall, keep courtyard, the Glass Bridge, the Broken Span, the Lens (A)       |
| Undercroft       | -4 m   | Vaults, tunnels, the cistern, the keep cellar, the hatch room, the Cable Duct, the crypt, the Pipe Gallery, the floor of the Sag (B) |

The Anemometer still floats over the middle at 6 m, with the perch on top at 10 m. The bastion
roof is flat at 9.5 m everywhere, and the open bays are walled up to it, so nobody can climb
onto a roof.

## Plan of one bastion (east side, from the Eye outward)

```
 z -40 ┌ BRIDGEHEAD ──┬── NORTH HALL (stair up to the DOME GALLERY) ─┐
       │ Glass Bridge │                                              │
       │ door, pit ↓  │        NORTH CORRIDOR (upper corridor above)  │
 z -20 ├ PAD BAY (sky)┤─ passage ─┘        └─ side passage ─┐        │
       │ lookout, pad │                                      │ KEEP   │
 z  -6 ├ GATE BAY ────┤ corner doors ─ FRONT HALL ─ door (S) ─ COURTYARD
       │ catwalk,rails│               (instrument deck above)  │ Tower  │
 z  20 ├ PAD BAY (sky)┤─ passage ─┐        ┌─ side passage ─┘        │
       │              │        SOUTH CORRIDOR                         │
 z  40 └ SPANHEAD ────┴── SOUTH HALL (stair up to the RADIO ROOM) ───┘
        x 37          x 47                                    x 58   x 70
```

Under it (the undercroft): a **vault** under each bridgehead or spanhead, with a stair pit up.
From each vault a tunnel runs to the **cistern** under the front, and on to the **keep cellar**
under the courtyard. The north vault also has a tunnel straight to the cellar. The south vault
has a tunnel with a dog-leg into the **hatch room** (a spawn), which also opens into the cellar.

## The ways across the Eye (the lanes)

1. **Glass Bridge** (north, deck): fast and straight, a glass deck with handrails and no cover.
   It leads into the Lens (A).
2. **Cable Duct** (north, under the Glass Bridge): a cramped brass tunnel from the north vault
   to the crypt under the Lens. It has pipe-bank chicanes, so there is no straight view down it.
   It also has glass floor panels over the storm and lightning at its windows. It is slower and
   covered, with short duel ranges.
3. **Anemometer** (centre, high): a caged catwalk from each gate bay (bots use it), plus launch
   pads (in the pad bays) and zip-rails (in the gate bay). The perch is the highest ground and
   holds the power-up. The hop shards and drop shards are still there.
4. **Broken Span** (south, deck): covered, with guard walls, cabinets and a roofed stretch. It
   runs into the Sag as a balcony that snaps in the middle: jump the 3.6 m gap, or take the ramp
   down.
5. **Pipe Gallery** (south, under the Broken Span): the Undercroft route from the south vault
   into the floor of the Sag, with chicanes like the Cable Duct.

Each team gets to its lanes through its own rooms: halls, corridors, pad bays, the gate bay or
the undercroft.

## Bomb sites

- **A: the Lens Dome.** A shattered observatory dome on the middle line of the north crossing,
  roofed with cracked glass. There are 3 entrances: the east bridge door, the west bridge door,
  and the stair pit up from the crypt. Through the crypt it connects to both Cable Ducts.
  Inside are a telescope housing, cabinets and crates.
- **B: the Sag.** A tall roofed hall on the middle line of the south crossing, whose floor fell
  4 m. There are 4 entrances: from each Broken Span (along the balcony, then down its ramp) and
  from each Pipe Gallery (straight onto the floor). Cover is a fallen gear housing, cabinets and
  crates.

## Spawns (8 per team, three detached groups)

| Group   | Where                                    | Spawns | What it's for                                          | Exits                                     |
| ------- | ---------------------------------------- | ------ | ------------------------------------------------------ | ----------------------------------------- |
| gallery | Dome gallery, upstairs in the north hall | 3      | North play: the Glass Bridge, A, the upper rotation    | stair down, upper corridor                |
| keep    | Keep courtyard, beside the Tower         | 2      | Middle: the gate bay, the Anemometer, the pads         | front door, two side passages             |
| hatch   | Hatch room in the undercroft, south-east | 3      | Underground and south: the Pipe Gallery, B, the cellar | dog-leg tunnel west, tunnel to the cellar |

In 3v3, each player starts in a different group. A test checks that no spawn can be seen from
the Eye, from the enemy half, or from its own bastion's front rooms (bridgeheads, pad bays,
gate bay, vaults), and that every group still has a way out when either exit is blocked.

## Openness (the owner's "one duel at a time" measure)

|        | Mean watched area | 90th percentile | Seen from 6+ directions |
| ------ | ----------------- | --------------- | ----------------------- |
| Before | 1172 m²           | 1824 m²         | 72%                     |
| After  | 303 m²            | 624 m²          | 10%                     |
| Target | ≤ 800 m²          | ≤ 1500 m²       | ≤ 30%                   |

The Eye is still the one open place. You are exposed on the Glass Bridge, the catwalks, the
Anemometer and the shards. Everywhere else is rooms, corridors and tunnels.
