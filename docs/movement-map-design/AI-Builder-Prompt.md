# Map-building AI prompt

Use this prompt with the selected map brief and the shared systems sections. For a project with existing code, attach or expose the relevant repository and map assets.

> Redesign the game's movement maps using the attached design brief. The game has two standard difficulty modes, Beginner and Intermediate, plus a separate hard Experimental mode. The engine is custom.
>
> Inspect the actual movement controller, map format, physics settings, ability systems, checkpoint system, and race manager before implementing geometry. Calibrate movement capabilities in the real engine. Keep the core physics consistent and versioned; fit obstacles to measured player trajectories.
>
> Build deliberate three-minute courses with enclosed or clearly bounded routes, distinctive architecture, and connected movement phrases. A phrase must specify entry speed/height/heading, the player's action, the visible target, the receiving geometry, the exit state, and the recovery behavior.
>
> For surf maps, use functional horizontal and vertical curves, S-curves, opposing-ramp transfers, height management, carefully designed spiral exits, windows, air strafes, and selected short contacts. Give each map a small set of dominant techniques and develop them through variations. Separate detailed visual geometry from smooth reliable collision.
>
> For parkour maps, vary landing shapes, elevations, approach directions, and the next takeoff. Use diagonal landings, bhop chains, corner wraps, slides, and supported abilities in connected sequences. Make landings prepare the following move.
>
> Implement portals with explicit position, orientation, velocity, gravity, and camera behavior. Introduce gravity and jetpack changes visibly before demanding difficult combinations. Restore the full authored state at recovery anchors.
>
> Use the selected map's poetic description to guide composition and atmosphere. Follow its practical instructions for palette, materials, light, sound, landmarks, and enclosure. Keep next landings, ramp edges, portal destinations, and red-zone boundaries readable at gameplay speed.
>
> Target approximately 165–195 seconds for a practiced clean main-route run by the intended audience. Treat the supplied timestamps as initial pacing budgets. Let optimized routes be faster and retries take longer. Do not add forced waiting or empty travel to reach the target.
>
> Build required progress gates, comparable timing splits, and additional recovery anchors as separate concepts. A clean route should flow through them without stopping. Every recovery state must be independently completable.
>
> In race mode, every player receives the same randomized sequence of validated maps. Normalize velocity, gravity, abilities, fuel, and progress at inter-map connectors. The lowest sum of elapsed map times wins. Failed attempts and ordinary respawn time count; engine-controlled loading and neutral connectors do not. Validate ordered progress and keep racers physically nonblocking.
>
> Work through movement graybox, state systems, timing tests, architecture, atmosphere, and race integration. Produce route sketches, a phrase graph, numeric geometry parameters, portal/state definitions, and playtest evidence. Report untested assumptions honestly. Continue revising weak phrases until the map meets the acceptance criteria.
>
> Start with the specified map and complete its playable route before expanding to the remaining library. Preserve the distinct movement identity and art direction of each map.

## Final design principle

**The map's beauty should help the player understand its movement, and its movement should make the architecture memorable.**

A player should remember Copper Reef by its lighthouse curve, Basalt Cathedral by the bell and rose-window transfer, and Gravity Freight by the cargo walls becoming floors. That connection is what gives the library identity beyond a collection of obstacles.


