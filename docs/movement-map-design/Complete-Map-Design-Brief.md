# SURF + PARKOUR: COMPLETE MAP DESIGN BRIEF
## 24 original courses for a custom movement engine
### Beginner, Intermediate, and Experimental • Three-minute clean-run target • Randomized cumulative-time races

**Purpose:** Give a map-building AI enough direction to produce deliberate movement courses: curved ramps, planned transfers, momentum challenges, memorable architecture, meaningful checkpoints, and repeatable racing. This is a design specification, not a claim that the courses have already been built or playtested.

**Mode interpretation:** Two standard modes, Beginner and Intermediate, plus a separate hard Experimental mode. Each has eight original maps. Across the library there are twelve surf maps, eight parkour maps, and four hybrids.

**Timing interpretation:** Approximately three minutes for a successful main-route run by a practiced player in the intended audience. A first attempt with retries can take longer. Faster routes should produce faster times. Never add forced waiting to make everyone finish at exactly three minutes.

**Engine assumption:** The engine is custom. All geometry must be fitted to measured movement capabilities. Source-engine values are references, not settings to copy blindly. Additional abilities named below are requirements to implement and calibrate where absent.

---

# 1. What the research actually supports

These are the researched foundations. The numeric tuning targets, race rules, and 24 map designs that follow are original recommendations for this project.

- **Surf is a relationship between slope contact, strafing, speed, and height.** Momentum Mod's surf documentation explains the Source behavior behind sliding on steep ramps and exchanging height and speed. Its exact slope threshold belongs to Source; your engine needs its own tested equivalent. [Momentum Mod: Surf](https://docs.momentum-mod.org/guide/gamemodes/surf/)
- **Ramp collision deserves its own design pass.** Momentum's ramp-building guide discusses steepness, size, and separating detailed visual geometry from simple collision. A decorated surface that catches the player at seams can ruin an otherwise good route. [Momentum Mod: Creating Surf Ramps](https://docs.momentum-mod.org/guide/mapping/create_surf_ramps/)
- **Established surf obstacles have distinct purposes.** Chent's mapping guide describes spins, direction-changing spins, windows, and air-strafe obstacles. It also documents ramp bugs. Parts of that guide are unfinished, so its headings should not be mistaken for validated prescriptions. [Chent: CS2 Surf Mapping](https://github.com/Chent-AU/CS2-Surf-Mapping)
- **Bhop needs momentum continuity.** Momentum's bhop guide explains chaining jumps and air strafing to retain or build speed. Its support for autobhop illustrates that route execution can remain demanding without making every jump a manual timing test. [Momentum Mod: Bhop](https://docs.momentum-mod.org/guide/gamemodes/bhop/)
- **Timing checkpoints and stages serve different jobs.** Momentum's zoning guide distinguishes linear checkpoints, staged courses, and staged-linear setups. Place comparison splits where routes have reconverged and the crossing is consistent. Its checkpoints generally measure timing; the recovery anchors proposed here are a separate system. [Momentum Mod: Map Zoning](https://docs.momentum-mod.org/guide/map_submission/map_zoning/)
- **Required progress must be difficult to bypass accidentally or deliberately.** Momentum's review checklist calls for appropriate zone coverage, ordered checkpoints, sensible restart positions, and checks against missing triggers at speed. [Momentum Mod: Map Review Checklist](https://docs.momentum-mod.org/guide/map_submission/review_checklist/)
- **Readable shortcuts and mechanic combinations reward replay.** Neon White senior level designer Carter Piccillo describes building levels around specific abilities, making encounters readable, teaching abilities before demanding combinations, and giving memorable shortcuts. These are useful design principles for this project, not evidence that Neon White uses surf physics. [Carter Piccillo: Level Design](https://www.carterpiccillo.com/leveldesign)
- **Portals can connect impossible architecture, with technical costs.** Momentum's portal documentation demonstrates linked spaces and notes rendering and placement constraints. Your custom engine needs independent collision, camera, and performance validation. [Momentum Mod: World Portals](https://docs.momentum-mod.org/guide/mapping/using_portals/)

**The central design rule:** Build each obstacle around the player's entry state, required action, and exit state. A curve is useful when its radius, elevation, or exit angle changes the line the player must take. A portal is useful when it changes the next movement problem. A platform is useful when its position and shape affect the landing and following takeoff.

---

# 2. The three modes

| Design choice | Beginner | Intermediate | Experimental — hard |
|---|---|---|---|
| Main objective | Learn satisfying movement with room to recover | Link techniques while preserving speed | Master unusual but consistent mechanic combinations |
| Main-route demands | One dominant challenge at a time | Usually two linked demands | Two or three interacting demands after introduction |
| Surf character | Wide faces, gentle changes of curvature, visible catches | Tighter transfers, deliberate height management, alternate lines | Compound curves, gravity-relative surfing, precision portal transfers |
| Parkour character | Varied shapes and directions; generous landings | Linked jumps, bhop turns, controlled slides, resource choices | Gravity changes, constrained thrust, unusual spatial connections |
| Failure | Nearby recovery and slower salvage routes | Recovery at the last completed movement phrase | Frequent practice recovery; difficult execution remains |
| Hazards | Static, previewed, outside generous safe corridors | Static hazards that shape approach and exit | Layered hazards and selected deterministic moving obstacles |
| Portals | Clear exit preview, forgiving orientation | Momentum and heading matter | Orientation, gravity, and momentum may interact |
| Jetpack | Simple lift assistance with reserve fuel | Pulse control and fuel planning | Different explicit thrust profiles and tight energy budgets |
| Target clean main route | 165–195 seconds | 165–195 seconds | 165–195 seconds after learning |
| Leaderboard | Separate Beginner board | Separate Intermediate board | Separate Experimental board |

These time bands are production targets, not observed results.

## 2.1 Beginner should still be interesting

Keep the same architectural ambition: spirals, tunnels, elevated transfers, portals, changing silhouettes, and striking spaces. Make the safe landing area larger, the launch window longer, and the recovery less punishing.

Example: the main route can use a broad 180-degree curved ramp with a lower catch. An optional inside line uses an earlier release and a smaller catch. Both routes look and feel like surfing.

## 2.2 Intermediate should require decisions

Ask players to choose a high or low line, preserve speed through a direction change, arrive at a bhop pad facing the following pad, or save thrust for a later ascent. Difficulty should come from setup and execution.

## 2.3 Experimental should have a clear rule

Every experimental map needs one sentence explaining its unusual behavior:

- “Gravity points toward the currently lit wall.”
- “Portals preserve speed but rotate your travel direction.”
- “This jetpack supplies sideways acceleration instead of lift.”
- “The route passes through the same chamber in three gravity orientations.”

Introduce that rule in a forgiving space, then combine it with familiar movement. A hard map should remain understandable.

## 2.4 Keep the core physics stable

Use one versioned base movement profile across the standard modes wherever possible. Change geometry and route demands to set difficulty. Explicit ability zones can change documented properties, but entering a new map should not secretly change air control or friction.

Recommend consistent hold-to-bhop assistance in the default queues. If manual bhop is a desired competitive style, give it an explicit ruleset and separate records. Do not silently switch input timing behavior between rooms.

---

# 3. Calibrate the custom engine before generating final geometry

## 3.1 Build a small movement laboratory

Measure the following in the actual game:

| Symbol | Meaning | How to obtain it |
|---|---|---|
| H | Standing player collision height | Read from the controller |
| W | Player collision width | Read from the controller |
| J | Comfortable repeatable horizontal jump distance | Measure representative successful jumps at the specified approach speed |
| Z | Comfortable jump height | Measure apex above takeoff at normal gravity |
| B(v) | Bhop travel per hop at approach speed v | Test the actual auto/manual hop settings and air steering |
| V | Reference surf speed | Median speed on a representative sustained ramp sequence |
| C(v) | Comfortable steering/curve capability at speed v | Test several radii and ramp inclinations |
| F | Jetpack fuel capacity | Express also as seconds of full thrust |
| A | Jetpack thrust acceleration and direction | Measure vertical and lateral behavior under the current gravity |
| G | Gravity vector | Record direction and magnitude per ability zone |

Also measure standing versus crouching clearance, wallrun duration if supported, coyote time, jump buffering, drag, contact friction, velocity limits, and simulation-step behavior.

J is not a universal constant. A running jump, a standing jump, and a high-speed bhop have different feasible landings. Each obstacle must identify the approach state used for its dimensions.

## 3.2 Initial dimensions to test

Use these as blockout starting points, then replace them with playtest results:

- Beginner conventional jump gaps: roughly 0.45–0.70 J.
- Intermediate conventional jump gaps: roughly 0.65–0.85 J.
- Experimental precision jumps: roughly 0.80–0.95 J, with a clearly established approach.
- Beginner bhop landing footprints: start around 4–6 W across the required landing direction.
- Intermediate bhop footprints: start around 2.5–4 W.
- Experimental precision footprints: start around 1.5–3 W.

The relevant measurement is the usable landing region after accounting for collision shape, approach angle, and next takeoff. A long thin landing can be generous in one direction and demanding in another.

Do not use these ordinary-jump gap ratios for surf launches or jetpack transfers. Validate those with recorded trajectories.

## 3.3 Describe surf dimensions by function

Specify:

1. Surf-face inclination relative to current gravity.
2. Face width measured along the usable slope.
3. Longitudinal path and curvature.
4. Vertical rise or drop along that path.
5. Entry and exit tangent directions.
6. Expected contact-height band.
7. Expected speed range.
8. Landing corridor after release.

A proposed 55-degree face is only meaningful after the engine's standing/surfing classification is known. Begin clearly within the engine's stable surf range, then test steeper and shallower faces deliberately.

At higher speed, a fixed radius demands a faster turn. Therefore, a curve must be tested at both the slow valid entry and the fast valid entry. A line that is possible at one speed can become awkward at another.

## 3.4 Base geometry on a playable trajectory

For every substantial transfer:

1. Build the takeoff surface.
2. Produce several successful departure trajectories using the real controller.
3. Record a range of position, velocity, orientation, and input.
4. Place the receiving surface across a useful portion of that range.
5. Verify slow, typical, and fast entries.
6. Adjust the upstream approach if the player cannot reliably create the required state.

A simple projectile estimate can help with the first blockout under constant gravity. Air control, ramp contact, portals, thrust, and drag require simulation. A sampled successful trajectory is evidence of feasibility; it does not prove that the obstacle is comfortable or fair for human players.

---

# 4. Surf design: build movement phrases

A movement phrase is a short chain whose exit prepares the next chain. For example:

**Bank around the tower → descend to build speed → rise toward the lip → release across the gap → air-strafe past the support → catch the opposing ramp high enough to continue.**

The ramps are connected by movement requirements, even when they are physically separated.

## 4.1 Essential ramp and transfer patterns

| Pattern | Player task | What makes it work |
|---|---|---|
| Horizontal curve | Follow a changing heading while holding a useful line | Smooth curvature, enough correction space, visible exit |
| Vertical scoop | Turn a descending approach into a controlled climb | Continuous collision and a reachable next surface |
| S-curve | Reverse steering while preserving momentum | A readable transition and room to settle before the next bend |
| Descending helix | Maintain contact while circling and losing height | Meaningful exit choice and adequate clearance between turns |
| Ascending arc | Spend speed to gain height | Upstream speed supply and a valid lower-speed fallback |
| Opposing-ramp transfer | Leave one face and catch the other | Receiver aligned to a feasible departure corridor |
| High-to-low transfer | Trade height for forward progress | Receiver visible before commitment; no blind underside collision |
| Low-to-high transfer | Preserve enough speed for an elevated catch | Clear setup and feedback when the approach is too slow |
| Spine crossing | Move across a double-sided ramp's ridge | Predictable collision at the crest and enough room to recover |
| Window transfer | Shape flight through an opening | Opening tests a known trajectory; it does not conceal the target |
| Pillar air strafe | Bend around a physical obstruction during flight | Both sides legible where route choice is allowed |
| Short ramp contact | Touch a brief face to redirect into a second transfer | Contact window compatible with physics and latency |
| Surf-to-bhop | Land while retaining a usable hopping direction | First pad aligned to arrival; subsequent pads change the rhythm |
| Bhop-to-surf | Use a hop to board a face at useful height | Broad enough entry and a marked preferred landing band |
| Portal-to-ramp | Exit with useful velocity relative to a receiver | Portal transform, camera, and receiver designed together |

Do not force the entire table into every map. Give each map two or three dominant patterns, then introduce supporting variations.

## 4.2 What a “creative flick” should mean here

A flick is a deliberately sharper steering/release action near a takeoff or short contact. It is not a magic vertical boost granted by moving the camera.

Describe the actual geometry:

- Where on the face the player approaches.
- What velocity and heading they should have.
- Which part of the lip they leave.
- How far they must redirect.
- Where the next catch is.
- What a slightly early or late release does.

A useful intermediate example: approach a convex exit while carrying speed, climb toward its upper third, leave earlier than the safe route, air-strafe around a pillar, then catch the far face of a split ramp. The challenge is preparing and controlling the trajectory.

## 4.3 How to make spirals worth playing

A spiral should change the problem as the player travels:

- An outer entry gives room to settle.
- The middle introduces a height or line choice.
- A visible opening establishes the upcoming release.
- The exit leads into a different type of movement.

A two-turn helix with no decisions may be duller than a 270-degree arc with a well-designed transfer. Long spirals need evolving curvature, elevation, views, or exits.

A twisting decorative ribbon is not automatically a surfable ribbon. With normal gravity, some orientations will cease to support ordinary surfing. Split those areas into deliberate airborne transfers, or use an explicitly introduced gravity mechanic.

## 4.4 Curved collision requirements

- Generate visual surfaces and gameplay collision separately.
- Maintain matching positions and tangents across intended smooth joins.
- Keep decorative trim, bolts, ribs, and windows out of the collision path.
- Test seams in both intended travel directions and at extreme valid speeds.
- Check that tessellation does not create unintended micro-ledges or kicks.
- Ensure the player cannot catch an invisible edge beneath a visually smooth surface.
- Use enough simulation/collision precision to prevent tunneling through thin surfaces.
- Do not assume “smooth shading” means smooth collision.

Collision continuity is a release requirement, not a later cosmetic fix.

## 4.5 Red zones should shape a line

Define **red zones** as consistent failure hazards in this game. Touching one returns the player to the latest valid recovery anchor. They are marked with red color, a hazard pattern, and a distinct boundary.

Good uses:

- A red strip low on a curved face requires maintaining some contact height.
- A red ceiling above a transfer prevents an excessively high departure.
- Red floor regions turn a bhop section into a continuous movement sequence.
- A red pillar makes the player choose and commit to a side.
- A red band in a drop shaft requires entering through a visible safe opening.

Avoid making every miss instantly fatal. Lower recovery ramps and slower detours give Beginner and selected Intermediate sections useful second chances.

Keep the safe corridor visually dominant. A player should be able to read it at their actual arrival speed. Put hazard visuals at the collision boundary; excessive glow must not conceal it.

---

# 5. Parkour design: make landings matter

The problem with repeated large platforms is usually that they erase the consequences of the previous jump. The player lands anywhere, recenters, and repeats the same action.

Build sequences where the landing position and facing prepare the next move.

## 5.1 A useful parkour vocabulary

- Offset ledges that require diagonal approaches.
- L-shaped landings that reward arriving on the outside corner.
- Narrow bridges entered from the side.
- Alternating high and low takeoffs.
- Arched paths with varying gaps.
- Descending bhop chains.
- A low beam that changes the jump or crouch timing.
- A corner wrap where the next landing becomes visible before takeoff.
- A slide under machinery followed by a diagonal jump.
- A short wallrun leading to a hop, if wallrun exists.
- A drop onto a slope followed by a momentum-preserving exit.
- A portal entered during a jump and exited toward a visible landing.
- A low-gravity leap followed by a short normal-gravity landing sequence.
- A jetpack pulse that corrects height while air steering controls direction.
- A resource-saving route that becomes faster only if fuel is retained.

Platforms can be large when they serve a purpose: teaching, establishing a new gravity frame, previewing a route, or providing a recovery. Their size should be intentional.

## 5.2 Example of a strong eight-move sequence

1. Run along a narrow terrace with the next three surfaces visible.
2. Jump diagonally to the outside corner of an L-shaped awning.
3. Bhop off that corner onto a descending ledge.
4. Crouch-slide below a suspended beam.
5. Exit the slide into a rightward jump.
6. Touch a small pad positioned to launch toward a portal.
7. Emerge from the portal with momentum redirected toward a curved balcony.
8. Land on the balcony's near edge and continue into the next phrase.

The gaps need not be extreme. The challenge comes from the connections.

## 5.3 Gravity changes

Every gravity field needs:

- An unmistakable boundary.
- A preview of which surface will become the floor.
- A gravity-direction icon or local “down” marker.
- A defined magnitude.
- A defined activation and exit rule.
- A defined camera transition.
- Space to understand the new frame before a precision obstacle.

For ordinary gravity changes, keep velocity continuous at the boundary and change acceleration according to the new field. If a special gate also rotates velocity, label it as a different mechanic.

Do not add or remove speed accidentally because the player crossed a trigger twice. Resolve overlapping fields with an explicit priority/state rule.

Suggested initial magnitudes: 0.65 G for gentle low gravity, 0.4 G for a pronounced experimental field, and 1.25 G for heavier movement. These are tuning candidates. Their jump distances must be measured independently.

Keep forced camera roll minimal in standard modes. Experimental orientation changes need a stable horizon cue and a camera-comfort option that preserves the same collision and timing rules.

## 5.4 Jetpack changes

Give each jetpack profile a visible identity:

| Profile | Behavior | Appropriate challenge |
|---|---|---|
| Lift | Upward thrust relative to local gravity | Pulse to cross a gap or reach a ledge |
| Vector | Thrust in an explicitly defined aim direction | Route through openings while controlling drift |
| Lateral | Strong sideways assistance, limited lift | Weave around obstacles while conserving altitude |
| Heavy | Greater gravity or mass-like response with clearly tuned thrust | Plan early braking and shorter boosts |

Avoid invisible profile changes. A labeled gate, icon, color pattern, and short teaching action introduce each profile.

Jetpack sections need ceilings, lateral obstacles, fuel limits, or landing requirements that make controlled use interesting. Unlimited thrust over an empty gap is weak course design.

Specify fuel at entry, burn rate, allowed refill locations, whether landing refills, and checkpoint restoration. A player must not permanently softlock a section by spending fuel. Recovery restores the section's authored starting state.

## 5.5 Moving platforms and hazards

Use moving elements sparingly in the standard queues. They can make raw time depend on lucky arrival phase.

Preferred race implementation: an obstacle starts a deterministic personal sequence when the player crosses its approach trigger. Other racers are ghosts, and their triggers cannot alter your sequence. On retry, the sequence resets with the recovery state.

If the engine cannot support personal obstacle state, use static competitive layouts. Shared cosmetic machinery can still move in the background.

---

# 6. Atmosphere, architecture, and readability

## 6.1 Give every map an architectural reason to exist

A hydroelectric dam suggests spillways, maintenance galleries, turbine halls, and a pressure shaft. A conservatory suggests curved planting beds, irrigation channels, glass roofs, and a central atrium. These should shape the course.

For each map, choose:

1. One dominant architectural form.
2. One material family.
3. One environmental condition.
4. One landmark visible from multiple locations.
5. One recurring motion or sound.
6. One signature movement that belongs in that space.

Examples:

- A bell tower: circular galleries, bronze and stone, sea fog, a central bell, distant chimes, surf around the bell's outer support.
- A reactor: concentric chambers, dark metal and ceramic, suspended dust, a bright core, low electrical hum, controlled helical descent.
- A flooded archive: stacked shelves and waterways, weathered stone and paper, reflected caustics, a suspended index globe, water drips, alternating high and low routes through shelves.

## 6.2 Use an intentional sequence of spaces

A three-minute map can progress through:

**Low entrance → enclosed approach → landmark reveal → winding middle → vertical signature chamber → faster exit.**

Keep the playable route bounded by architecture, cliffs, channels, or clearly defined course edges. A distant landscape can create scale without making the actual course an empty open world.

Use crossings at different heights to show progress. A player should sometimes see a previous route below or a future route overhead. Separate their collision and progress zones carefully.

## 6.3 Consistent gameplay language

- Surf faces: continuous material with readable borders and directional texture.
- Bhop pads: distinct top material and clear edges.
- Recovery anchors: recognizable arch or marker with a consistent symbol.
- Portals: paired identifiers and readable exit preview or orientation diagram.
- Gravity gates: arrow pattern indicating local down and magnitude.
- Jetpack gates: thrust icon and fuel display.
- Red zones: red plus hazard hatching and an audible failure cue.
- Optional faster route: repeated shortcut symbol, distinct from mandatory guidance.

Do not rely on color alone. Shapes, icons, patterns, and placement must convey the same information.

Place fog and particles behind the important silhouette or outside the movement corridor. Keep the next landing visible. Use speed-dependent sound and material changes to communicate contact; avoid camera shake that obscures precise movement.

## 6.4 Checkpoint styling

Checkpoint art should belong to the map while keeping the same functional language:

- Copper reef: a brass pressure arch with a green-white recovery glyph.
- Glass garden: an illuminated irrigation frame.
- Neon transit: a station gantry with a split-time panel.
- Lunar facility: a docking collar with a gravity arrow.
- Frozen archive: a carved stone threshold rimmed with frost.

Crossing a checkpoint must not force a stop, open a menu, or wait for an animation.

---

# 7. Three-minute pacing and checkpoint rules

## 7.1 A six-act design scaffold

All 24 concepts use this initial timing plan:

| Act | Target time | Purpose |
|---|---|---|
| 1 | 0:00–0:25 | Establish the movement identity and landmark |
| 2 | 0:25–0:55 | Develop the first pattern |
| 3 | 0:55–1:25 | Introduce a complementary movement pattern |
| 4 | 1:25–2:00 | Combine patterns in the signature space |
| 5 | 2:00–2:35 | Main execution test or meaningful route choice |
| 6 | 2:35–3:00 | Payoff using familiar mechanics |

These timestamps are pacing budgets. They are not gates that hold players until a clock reaches a value. Each act contains multiple movements. A single turn described in an act must not be stretched into thirty seconds of uneventful travel.

After testing, move time between acts if it improves the route. Preserve roughly three minutes of purposeful movement.

## 7.2 Three different checkpoint concepts

**Progress gate:** Proves that the player completed the required portion of the route.

**Timing split:** Records a comparable time at a stable crossing.

**Recovery anchor:** Defines where and in what state the player resumes after failure.

They can share a location, but the engine should treat their roles separately.

For every map:

- C0 is the map start.
- C1–C5 are required macro progress/split gates between the six acts.
- C6 is the finish.
- R anchors supply extra recovery inside long or difficult acts.

Put C gates after route branches have merged, on a stable segment with enough trigger coverage for all legal trajectories. Use explicit required branch tokens if routes remain separate. Do not let a faster route bypass validation.

Initial recovery targets:

- Beginner: roughly every 10–15 seconds of successful movement.
- Intermediate: roughly every 15–25 seconds.
- Experimental: roughly every 15–30 seconds, plus an anchor before a novel mechanic combination.

These are recovery targets, not a requirement to clutter the world with repeated giant platforms. Many anchors can be unobtrusive fly-through gates with an off-line restart bay.

## 7.3 Recovery state must be authored

Each anchor defines position, facing, velocity or launch setup, gravity, active ability profile, fuel, progress state, and personal obstacle phase.

Prefer a safe restart bay and a short re-entry route that reliably supplies the necessary speed. For continuity-sensitive phrases, a tested fixed airborne restart can work, but the player needs enough time to orient and take control.

Do not save arbitrary entry velocity if that can trap a slower player in an impossible next section. Do not grant a faster-than-normal restart that makes intentional failure a shortcut.

Check every anchor from its restored state independently. A map that can be completed from the start but cannot be completed from one of its checkpoints is broken.

## 7.4 Failure and timing

For the default cumulative-time race:

- The timer continues through failed attempts and normal respawn delay.
- Failed movement and time spent replaying are already a penalty.
- Add no arbitrary death penalty by default.
- A manual reset uses the same recovery behavior and keeps the timer running.
- Practice mode permits free section selection and pause; those runs do not enter the race leaderboard.
- Recovery never grants future progress or resets a completed elapsed-time segment.

A visible 0.5–1.0-second recovery transition is a reasonable starting target, subject to usability testing. Validate that intentional death cannot beat the intended continuation.

## 7.5 Expected time is a measurement

Record clean-run time separately from first-completion time. Also record failed attempts per anchor and the amount of repeated movement.

If the intended audience takes six minutes with many retries, a three-minute clean-run label does not mean the actual race lasts three minutes per map. Shorten the route, ease the troublesome phrases, or accept a longer match after testing.

---

# 8. Map library index

| ID | Name | Mode | Discipline | Signature |
|---|---|---|---|---|
| B01 | Copper Reef | Beginner | Surf | Curved aqueducts and a lighthouse helix |
| B02 | Glass Garden | Beginner | Surf | S-curves through a layered conservatory |
| B03 | Cloud Foundry | Beginner | Surf | Vertical scoops and broad aerial catches |
| B04 | Lantern Canal | Beginner | Surf | Canal bends, underpasses, and portal realignment |
| B05 | Rooftop Post | Beginner | Parkour | Diagonal rooftops and readable bhop rhythm |
| B06 | Moonseed Nursery | Beginner | Parkour | Gentle low gravity and lift-jetpack pulses |
| B07 | Clockwork Orchard | Beginner | Parkour | Curved terraces and deterministic moving bridges |
| B08 | Tideglass Exchange | Beginner | Hybrid | Short surf, bhop, and portal phrases |
| I01 | Neon Spillway | Intermediate | Surf | Consecutive S-curves and an early-release shortcut |
| I02 | Basalt Cathedral | Intermediate | Surf | Helical descent, spines, and window transfers |
| I03 | Cyclone Observatory | Intermediate | Surf | Concentric arcs and controlled spiral exits |
| I04 | Prism Relay | Intermediate | Surf | Momentum portals and diagonal window lines |
| I05 | Monsoon Market | Intermediate | Parkour | Roof edges, slides, and corner-to-corner landings |
| I06 | Gravity Freight | Intermediate | Parkour | Local gravity rotation through a cargo depot |
| I07 | Ember Courier | Intermediate | Parkour | Fuel planning and jetpack pulse accuracy |
| I08 | Aquifer Switchback | Intermediate | Hybrid | Surf-to-bhop transitions through dam machinery |
| X01 | Möbius Engine | Experimental | Surf | Gravity-relative ramps around a twisted circuit |
| X02 | Singularity Choir | Experimental | Surf | Radial gravity and orbital ramp transfers |
| X03 | Razor Bloom | Experimental | Surf | Short contacts, petal transfers, and narrow corridors |
| X04 | Parallax Vault | Experimental | Surf | The same chamber crossed through portal-linked routes |
| X05 | Inversion Archive | Experimental | Parkour | Floor, wall, and ceiling routes with clear local down |
| X06 | Thrust Labyrinth | Experimental | Parkour | Lift, lateral, and vector jetpack profiles |
| X07 | Blackwater Reactor | Experimental | Hybrid | Heavy-gravity bhop into surf and constrained thrust |
| X08 | Dream Circuit | Experimental | Hybrid | A visible chamber revisited through three movement states |

## How to read the map briefs

Each numbered act uses the six-act time budget above. Its movements form a phrase sequence; add only connective geometry that serves the next action. Each map includes checkpoint styling and placement, a faster route, a failure treatment, and a validation concern.

The numerical shortcut savings are **targets to test**, not measured claims. Experimental mechanisms must be prototyped before their surrounding maps are committed to production.


# 9. Beginner maps

## B01 — Copper Reef
**Surf • Theme: abandoned coastal waterworks • Core skill: following curves and choosing contact height**

A turquoise inlet surrounds a compact complex of copper spillways, pale limestone towers, and submerged machinery. The playable route winds through its architecture. A lighthouse lens remains visible through successive openings. Water stays outside the collision surfaces; spray never hides ramp edges.

### Poetic description

The sea has taken the lower rooms, but the waterworks still remembers its purpose. Copper ribs bend above black-green pools; salt gathers along every seam. You move through channels once built to guide the tide, climbing briefly into the lighthouse beam before dropping back into the cool blue machinery below.

### Art instructions

Use oxidized turquoise #287F82, aged copper #A96C45, chalk limestone #DED8C9, and deep water #102F3C. Light the route with warm maintenance lamps and one slow lighthouse sweep confined mainly to background surfaces. Make ramps resemble continuous spillway liners, with corrosion strongest off the contact path. Use distant surf, hollow pipe resonance, and occasional buoy bells. The mood is weathered, spacious, and quietly alive. Red hazard hatching must stay distinct from copper.

### Route and challenges

1. **0:00–0:25 — Intake.** A short drop boards a broad left-facing ramp. Follow a shallow rightward curve around an intake tower, cross a small gap to an opposing face, then descend along a second curve. The second catch is lower and wider so players can recognize how departure direction affects boarding. End beneath the first pressure arch.
2. **0:25–0:55 — Twin channels.** Link a left bend, a short straight setup, and a right bend through adjacent spillways. A visible support column divides the transfer. The outer route is broad; the inside route leaves earlier and saves distance. Both merge onto a wide receiving ramp before C2.
3. **0:55–1:25 — Service crossing.** Leave a low ramp onto four staggered bhop pads, with a gentle left-right-left rhythm. A narrow maintenance walkway provides a slower recovery path alongside them. The last pad launches toward a broad surf face. A second short hop sequence varies pad elevation before the next arch.
4. **1:25–2:00 — Lighthouse coil.** Enter a descending 270-degree helix wrapped around the lighthouse. The first portion is unobstructed. A red strip marks the lowest unusable edge in the middle, encouraging a higher line. Exit through a large side opening onto two offset receiving ramps. The next catch is visible through the opening before release.
5. **2:00–2:35 — Lens passage.** A portal inside a brass lens frame rotates horizontal heading by 90 degrees while preserving speed. Show the destination channel through the frame. The exit offers a generous settling ramp, then a shallow scoop and one modest elevated transfer. A lower recovery ramp catches underpowered departures.
6. **2:35–3:00 — Outfall.** Link two sweeping curves toward the sea, make a familiar opposing-ramp transfer, and coast through the finish arch in the lighthouse's reflected beam. The final catch is generous; the payoff is sustained flow and the view of the route above.

**Checkpoints:** C1 Intake Arch; C2 Splitter Bridge; C3 Service Arch; C4 Lighthouse Window; C5 Lens Outfall. Add R anchors midway through Acts 2–5 and before the first portal. Restart bays feed short entry ramps.

**Faster line:** Take the inside channel in Act 2 and the higher early helix exit in Act 4; target 5–9 seconds combined.

**Failure treatment:** Lower channels return players to the current phrase with extra travel. Red contact or falling beyond those channels resets to R.

**Critical test:** Players who take the slow service walkway must still receive enough approach distance to board the following ramp.

---

## B02 — Glass Garden
**Surf • Theme: overgrown glass conservatory • Core skill: S-curves and height adjustment**

The course spirals through three connected greenhouse halls around a huge illuminated tree. Curved irrigation troughs supply the ramp shapes. Glass ribs frame views of future sections but remain outside the player's movement corridor. Each hall changes vegetation and light without changing gameplay materials.

### Poetic description

A tree has outgrown the building that was meant to shelter it. Its branches hold the shattered roof apart while afternoon light settles on water and leaves. The course winds through the garden like a remembered stream: bending around roots, lifting toward glass, then returning to the green hush beneath the canopy.

### Art instructions

Use fern green #48745A, pale glass #C4E2DE, warm ivory #EEE8D9, and restrained orchid accents #AA83AA. Give each greenhouse a different density of vegetation while keeping the next ramp silhouette clear. Put caustic light on walls and undersides, with soft gold daylight above. Scatter vines across noncolliding architecture rather than landing edges. Layer dripping water, distant insects, and gentle glass creaks. The atmosphere should feel sheltered and luminous, with increasing openness toward the roof.

### Route and challenges

1. **0:00–0:25 — Seed channel.** Start with a shallow descent into a broad curve around a planter. Transfer to a slightly raised opposing face using a gentle upward release. Repeat the relationship with the opposite direction. A lower trough catches missed elevated entries and reconnects before the first arch.
2. **0:25–0:55 — Fern weave.** Two S-shaped ramp sequences pass between large fern beds. The first gives a long transition between bends; the second shortens that transition slightly. Clear straight glimpses reveal each exit. The task is changing steering without diving off the bottom edge or turning too sharply.
3. **0:55–1:25 — Irrigation steps.** A surf exit feeds six irregularly spaced pads across a shallow service basin. Organize them as two three-hop phrases with a small direction change between them. The final pad boards a curved ramp entering the next greenhouse. A walkable perimeter remains available as a slower salvage route.
4. **1:25–2:00 — Tree atrium.** Follow a broad half-circle around the trunk, then transfer across the atrium into another half-circle one level below. A transparent bridge shows the later route overhead. The second arc climbs slightly near its exit, teaching the player to arrive with enough speed for the next catch.
5. **2:00–2:35 — Petal windows.** Alternate two vertical scoops with wide openings in suspended leaf-shaped walls. The openings constrain excessive height but leave substantial lateral room. Put the challenge after a forgiving setup and give a lower receiving face behind each opening. Red borders are thin, precise, and clearly separated from decoration.
6. **2:35–3:00 — Roof bloom.** A portal inside a glass flower connects to the upper greenhouse roof. It preserves upright orientation and sends players toward a broad sunset-lit ramp. Finish with a sweeping curve, a short aerial transfer, and a wide final catch beneath the opening roof.

**Checkpoints:** C1 Seed Arch; C2 Fern Door; C3 Irrigation Frame; C4 Trunk Bridge; C5 Flower Gate. Place R anchors between paired phrases, especially before the two petal windows.

**Faster line:** A higher Act 4 departure boards the second arc farther along; target 3–5 seconds. It must still cross C4.

**Failure treatment:** Drainage channels act as slower returns. A full fall resets to the nearest phrase.

**Critical test:** Transparent glass must not make collidable walls, openings, and background architecture visually ambiguous.

---

## B03 — Cloud Foundry
**Surf • Theme: an industrial weather station • Core skill: vertical scoops and broad transfers**

Enclosed furnace-like chambers manufacture clouds inside suspended machinery. White vapor and distant sky appear through windows, while ducts and structural shells keep the course spatially bounded. A huge inactive turbine serves as the recurring landmark. There is no wind force on the standard route.

### Poetic description

Above the weather, an old factory teaches clouds how to form. Pale vapor gathers inside enormous bells and escapes through seams in the steel. Your path follows the breath of the building—down into pressure chambers, up through bright openings, and finally toward a sky that seems to have been waiting behind the walls.

### Art instructions

Use porcelain white #E5E8E6, blue-gray steel #657786, muted amber #D5A45A, and sky blue #91BDD2. Keep the playable surfaces slightly darker than the vapor so their borders remain readable. Use strong shafts of daylight in reveal chambers and close industrial lighting in ducts. Confine dense steam to background vents. Sound should shift from enclosed turbine hum to open high-altitude wind. The mood is airy industrial wonder, with machinery large enough to feel architectural.

### Route and challenges

1. **0:00–0:25 — Pressure intake.** A descending ramp feeds a gentle vertical scoop and a wide receiving face. Repeat with the receiver shifted slightly sideways. The landing band is marked with a clean material strip. A third broad curve leads beneath the intake gantry.
2. **0:25–0:55 — Turbine skirts.** Follow two quarter-circle ramps around the outside of the stationary turbine housing. A short airborne crossing between them teaches aligning with the receiving tangent. The second quarter-circle descends enough to recover speed before a modest upward transfer.
3. **0:55–1:25 — Condenser path.** A low surf release lands on a chain of broad oval bhop pads. Their spacing changes gradually, and two pads are offset to encourage steering. A low pipe over the slower walkway teaches crouching safely. The primary bhop line retains normal headroom.
4. **1:25–2:00 — Cloud bell.** Descend into a large chamber, sweep through a vertical scoop, and arc through a wide bell-shaped opening. Catch a ramp curving around the chamber's far wall, then take a second, lower opening. Visible lower catches make weak departures recoverable.
5. **2:00–2:35 — Upper ducts.** A portal connects the end of a duct to a higher chamber while preserving the intended travel direction. Players settle onto a broad S-curve and choose an outside safe line or a shorter inside release. The act ends with a diagonal catch rather than a flat stopping platform.
6. **2:35–3:00 — Sky exhaust.** Follow the turbine's outer shell along a long but evolving ramp: broad curve, shallow descent, and a final upward release into a generous finish funnel. The machinery opens to reveal the cloud layer below.

**Checkpoints:** C1 Intake Gantry; C2 Turbine Seal; C3 Condenser Door; C4 Bell Exit; C5 Exhaust Collar. Add recovery before each scoop-to-window phrase and midway through the condenser pads.

**Faster line:** Use the inside release in Act 5 and board the finish funnel high; target 4–7 seconds.

**Failure treatment:** White-painted lower catch ramps are safe. Red pressure vents are hazards. Keep those two surface classes unmistakable.

**Critical test:** The scoops must redirect motion through collision and player control; the map cannot rely on an unexplained hidden boost.

---

## B04 — Lantern Canal
**Surf • Theme: a compact canal town at dusk • Core skill: reading bends and portal exits**

The route follows narrow waterways through timber houses, stone bridges, covered docks, and a central festival courtyard. Lanterns mark architectural rhythm. The gameplay path has a brighter continuous edge than the surrounding reflections. Noninteractive boats and hanging signs never intrude into the collision corridor.

### Poetic description

Evening gathers in the canal before it reaches the roofs. Lanterns tremble in the water, turning each bend into a small procession of light. The town feels awake just beyond the route: a door sliding shut, dishes somewhere above, a festival carried across the water. You pass through it all like a message moving between windows.

### Art instructions

Use midnight indigo #242F52, lantern amber #F2B85E, weathered timber #725545, and soft teal #518C91. Keep lanterns warm and the usable ramp edges cool. Vary enclosure between low dock passages and open courtyards. Reflections should be blurred enough to avoid false platform edges. Use restrained festival percussion, water against stone, and distant domestic sounds. The mood is intimate and celebratory. Reserve bright red patterned surfaces for hazards; ordinary lantern warmth must not look lethal.

### Route and challenges

1. **0:00–0:25 — Outer quay.** Ride a curved canal bank beneath a high bridge, transfer across the channel, and continue around a gentle bend. Introduce the safe ramp material on both banks. The next receiving face remains visible past the bridge supports.
2. **0:25–0:55 — Covered docks.** Alternate two ramp sides through covered storage bays. One transfer goes below a beam with generous clearance; the following one rises into an open dock. This establishes that different departure heights lead to different routes without demanding a tight window.
3. **0:55–1:25 — Ferry stones.** Bhop across curved stepping surfaces around a moored ferry, then board a short ramp beneath a walkway. A second three-hop phrase turns toward the courtyard entrance. A dockside path offers recovery for players who lose their hopping rhythm.
4. **1:25–2:00 — Lantern court.** Surf a 180-degree curve around the courtyard fountain, release across the center, and catch a second curved wall. A red strip covers the fountain's central basin, creating an obvious reason to maintain the transfer. The outside face remains broad and forgiving.
5. **2:00–2:35 — Twin doors.** Pass through a clearly paired portal doorway into a canal pointing in a new horizontal direction. Follow a settling ramp, then take a second doorway whose exit is visible through an elevated balcony. The second portal is optional on the safe route and cuts a longer canal bend.
6. **2:35–3:00 — Festival run.** Link three familiar broad curves with two increasingly graceful transfers. Pass the festival square through an open arcade and finish beneath a large paper lantern. The final twenty-five seconds reward momentum without adding a new mechanic.

**Checkpoints:** C1 Quay Bridge; C2 Dock Gate; C3 Ferry Arch; C4 Fountain Exit; C5 Twin-Door Merge. R anchors sit before each portal and between the two ferry phrases.

**Faster line:** Use the second portal and a tighter courtyard release; target 5–8 seconds.

**Failure treatment:** Falling into ordinary shallow canal water returns through a nearby slow bank route. Red-marked deep sluices reset to R.

**Critical test:** Portal identifiers must be understandable while moving; players should never need to stop and decode matching symbols.

---

## B05 — Rooftop Post
**Parkour • Theme: delivering a letter across a hillside town • Core skill: diagonal landing and bhop rhythm**

Build a connected cluster of buildings around a postal clock tower. Roofs, awnings, balconies, and service bridges provide recognizable traversal surfaces. The route climbs gradually before descending toward the post office. The skyline gives direction; the playable path remains compact and legible.

### Poetic description

The city is still making breakfast when the first letter leaves the sorting room. Sunlight touches chimneys before it reaches the streets, and every awning becomes a possible bridge. The clock tower keeps appearing between roofs, a patient destination above the morning bustle. The route should feel like knowing a secret way through a familiar neighborhood.

### Art instructions

Use terracotta #BD7557, cream plaster #EADBC2, dusty blue #6B93AA, and postal yellow #E7BC55. Create varied roof silhouettes, worn landing corners, and recognizable street landmarks. Let laundry and flags move beside the route without blocking it. Shift sound from distant market activity to clock mechanisms inside the tower, then paper and conveyors at the finish. The mood is warm, brisk, and human. Give every terrace a believable use rather than making the town a stack of identical boxes.

### Route and challenges

1. **0:00–0:25 — Sorting roofs.** Cross three roof terraces with different shapes: a broad rectangle, an L-shaped awning, and a narrow balcony. Mark the intended landing corners through material wear and edge lights. Each gap is comfortable, but the next jump rewards arriving on the correct side.
2. **0:25–0:55 — Awning bend.** Link five awnings along a curving street. Alternate diagonal and forward jumps, with one lower landing that preserves speed. A final broad corner gives time to see the next sequence. Misses land on a street-level recovery stair rather than ending the entire section.
3. **0:55–1:25 — Parcel rhythm.** Three small roof pads feed a descending bhop chain across loading platforms. Break the rhythm with a low beam and a clearly marked crouch passage, then resume with three pads curving right. Provide enough normal headroom where a hop is intended.
4. **1:25–2:00 — Clock passage.** Jump through an open clock-tower window, cross offset interior ledges, and use a portal in the postal lift to emerge onto an upper balcony. The exit is upright and broad. Continue over two diagonal bridge landings that preview the tower roof.
5. **2:00–2:35 — Ridge crossing.** Run along a roof ridge, hop to its far-side awning, cross a short descending set of ledges, then jump into a narrow but generous roof passage. The optional fast route takes a direct diagonal roof gap; the main route makes two easier jumps.
6. **2:35–3:00 — Delivery chute.** Descend through staggered terraces, slide beneath a hanging mail conveyor, then make two familiar corner landings into the post office courtyard. The finish is the illuminated delivery arch, visible throughout the final approach.

**Checkpoints:** C1 Sorting Sign; C2 Awning Corner; C3 Loading Door; C4 Clock Balcony; C5 Ridge Gate. R anchors occur about every three to five connected actions.

**Faster line:** The ridge diagonal and a direct Act 2 awning transfer; target 5–9 seconds.

**Failure treatment:** Street stairs and lower balconies return the player with a time cost. Out-of-bounds alleys reset to R.

**Critical test:** A novice can finish each phrase without expert speed buildup; skilled players still gain time by preserving motion through landings.

---

## B06 — Moonseed Nursery
**Parkour • Theme: a lunar greenhouse • Core skill: gentle gravity changes and short jetpack pulses**

A sealed nursery looks out over a lunar crater. Circular growing beds, pressure doors, and gravity generators define the spaces. Standard-gravity floors use one pattern; low-gravity rooms add downward-arrow rings and a numeric gravity indicator. The central seed tree is the landmark.

### Poetic description

Beyond the glass, the moon is silent. Inside, leaves turn slowly beneath artificial suns, and water hangs for a moment longer than it should. The nursery makes gravity feel negotiable: a careful jump becomes a drift, a small flame becomes a promise of height. At its center, one impossible tree grows toward a world that has never known a forest.

### Art instructions

Use lunar gray #B7BEC8, deep space #10192A, leaf green #80B99B, and grow-light lavender #A8A0D3. Place warm light close to plants and cooler light on pressure structures. Mark gravity fields with patterns and arrows in addition to color. Keep the crater view dark enough to frame the interior. Use air circulation, soft pump sounds, and delicate foliage movement. The mood is tender scientific optimism. Jetpack exhaust should be clear and brief without filling the landing view.

### Route and challenges

1. **0:00–0:25 — Arrival trays.** Begin in normal gravity with short diagonal jumps between growing beds. Add one lower landing and one mild upward step. The final approach faces a large low-gravity doorway, allowing players to see the wider spacing beyond it.
2. **0:25–0:55 — Light chamber.** Enter approximately 0.65 G and practice two generous jumps whose landing shapes allow overshoot correction. Follow with a three-pad arc that uses the longer airtime. Gravity stays constant through each flight; the normal-gravity exit sits on a stable landing.
3. **0:55–1:25 — Lift lesson.** Receive a lift jetpack with enough fuel for several forgiving pulses. Cross a gap using one short boost, land, and repeat with a sideways offset. A ceiling discourages holding thrust continuously. Clear refill pads restore fuel before each teaching phrase.
4. **1:25–2:00 — Root channels.** Combine low-gravity hopping with two short jetpack-assisted rises through root-like supports. The safe line has broad shelves and a fuel refill midway. The faster line skips one shelf if the player controls thrust precisely. The destination remains visible through the supports.
5. **2:00–2:35 — Pressure return.** A doorway returns gravity to normal on a large landing. Traverse a short normal-gravity sequence, pass through an upright portal, then make a jetpack pulse toward a balcony with normal gravity. This teaches that the same boost feels different under the two fields.
6. **2:35–3:00 — Seed canopy.** Finish in low gravity with a graceful arc of broad pads around the seed tree. One final, optional jetpack correction can rescue a weak jump. Restore normal gravity in the finish vestibule before the map connector.

**Checkpoints:** C1 Light Door; C2 Gravity Return; C3 Lift Gantry; C4 Root Shelf; C5 Canopy Collar. Save gravity and fuel explicitly at each R.

**Faster line:** Skip the middle root shelf and take the inside canopy arc; target 4–7 seconds.

**Failure treatment:** Soft catch floors return to nearby entry ramps. Red machinery cores remain hazards.

**Critical test:** Every mandatory jetpack phrase is completable with a comfortable fuel reserve from its recovery state.

---

## B07 — Clockwork Orchard
**Parkour • Theme: an indoor mechanical orchard • Core skill: curved routes and readable moving geometry**

Fruit trees grow inside brass rings suspended from an enormous clock mechanism. Static tree platforms and curved maintenance paths form most of the course. Only selected bridges move. Decorative gears remain separate from collidable traversal surfaces.

### Poetic description

The orchard ripens to the rhythm of a clock. Brass branches turn far overhead, carrying baskets through shafts of dust-lit morning. Beneath them, old trees push roots through careful machinery. The course circles this gentle contradiction: living growth inside measured motion, small leaps between terraces while the great pendulum keeps time beyond the glass.

### Art instructions

Use moss green #687D4D, honey brass #C19A56, bark brown #655044, and soft cream #E8DCC3. Keep moving traversal bridges visually distinct from decorative gears. Light the early route through low orchard windows, then reveal the clock face in the upper gallery. Use a slow clock pulse, leaf rustle, and occasional mechanical clicks. The mood is curious and reassuring. Preserve stillness around precise landings so movement in the background does not confuse the player.

### Route and challenges

1. **0:00–0:25 — Root terraces.** Follow three offset stone terraces around a tree base, jump diagonally to a brass ledge, and cross a short crescent-shaped platform. The changing shapes establish an arc around the clock's central pendulum.
2. **0:25–0:55 — Orchard rhythm.** Bhop through two groups of curved planting beds. The first uses equal spacing to teach the rhythm; the second varies lateral offset and height. A broad landing between groups permits recovery without erasing the entire sequence.
3. **0:55–1:25 — First bridge.** Crossing the approach marker starts a personal bridge sweep from a known position. Its broad deck is reachable throughout a generous portion of the sweep. Land, move across, and jump to a fixed balcony. Repeat with a stationary alternative visible alongside the second bridge.
4. **1:25–2:00 — Inner branches.** Traverse diagonal branch-like walkways, crouch under a horizontal support, and hop through a half-circle of small terraces. The gaps are moderate. Success depends on arriving facing the next segment instead of recentering on every landing.
5. **2:00–2:35 — Pendulum gallery.** Use a short portal to cross behind the clock face, then traverse two staggered ledges and another personal moving bridge. A direct static beam offers a faster but narrower route. Both merge before the final gravity-neutral doorway.
6. **2:35–3:00 — Harvest descent.** Descend through three linked terrace-and-hop phrases toward the central tree. The pendulum swings in the distant background. Finish under a brass harvesting arch after a broad diagonal leap.

**Checkpoints:** C1 Root Arch; C2 Planter Gate; C3 Bridge Balcony; C4 Branch Collar; C5 Clock Door. R anchors immediately precede moving-bridge approach triggers.

**Faster line:** Take the static beam and preserve bhop speed through the second orchard group; target 4–8 seconds.

**Failure treatment:** Lower walkways feed the current phrase. Bridge phase resets consistently on recovery.

**Critical test:** Personal bridge timing must be isolated per player. If that feature is unavailable, ship the race version with stationary bridges.

---

## B08 — Tideglass Exchange
**Hybrid • Theme: a coastal transit museum • Core skill: switching between surf and parkour without losing direction**

Curved glass water tanks, tiled pedestrian galleries, and copper transit tubes surround a central tidal clock. The route alternates short movement styles while maintaining one visual destination. Each change is announced through surface material and a preview of the next landing.

### Poetic description

The station was built to measure the tide, then learned to carry people with it. Glass tanks rise beside tiled concourses, and each doorway holds a different shade of sea. Your route passes between the calm order of a museum and the old motion of water: slide, step, leap, and return to the curve as the tidal clock turns above you.

### Art instructions

Use sea-glass green #79AAA1, cream tile #E2DED0, dark copper #8E6650, and deep marine blue #284858. Alternate compressed tiled galleries with taller tank chambers. Put moving water behind glass and keep gameplay surfaces dry-looking. Use museum-like pool lighting, copper arch details, and readable transit symbols. Sound should combine soft public-address tones, water pressure, and footsteps on tile. The mood is calm discovery with a growing sense of motion.

### Route and challenges

1. **0:00–0:25 — Arrival rail.** Board a short curved surf face, transfer to the opposite side of a shallow channel, then leave onto a wide tiled ledge. The ledge is positioned so a clean surf exit naturally faces the first jump.
2. **0:25–0:55 — Ticket balconies.** Jump across L-shaped balconies around a tank, bhop across three narrow ticket platforms, and pass under a low beam. The last landing lines up with a broad entry ramp, turning the parkour phrase back into surf.
3. **0:55–1:25 — Watercoil.** Follow a 180-degree descending curve around the tank. Release across a gap into a gentle scoop, then catch a second face at a slightly higher level. A safe lower face lets less confident players continue.
4. **1:25–2:00 — Glass doors.** An upright portal moves the player into a small parkour gallery. Cross diagonal steps, take a short low-gravity jump in a clearly marked chamber, and return to normal gravity on a broad floor before the next surf entry.
5. **2:00–2:35 — Exchange crossing.** Link a surf exit, four bhop pads, an angled landing, and a second surf ramp. The phrase repeats with reversed direction and a slightly longer middle hop. This is the map's main test, built entirely from earlier actions.
6. **2:35–3:00 — Tidal release.** Ride a broad S-curve past the tidal clock, hop across two final ledges, and take a generous portal-aligned catch into the finish gallery. The last transition should feel continuous.

**Checkpoints:** C1 Arrival Ledge; C2 Ticket Gate; C3 Watercoil Arch; C4 Gravity Door; C5 Exchange Merge. Add R anchors before each mixed phrase in Act 5.

**Faster line:** A higher watercoil release skips a lower wrap, and a direct diagonal jump shortens the ticket balconies; target 5–8 seconds.

**Failure treatment:** Slow tiled walkways reconnect within the current act. Hazard water is explicitly red-marked.

**Critical test:** Each movement-mode boundary retains only the intended velocity and assistance rules. There must be no hidden friction spike at surf-to-bhop landings.


# 10. Intermediate maps

## I01 — Neon Spillway
**Surf • Theme: stormwater infrastructure beneath a neon city • Core skill: maintaining speed through consecutive direction changes**

The course descends through three storm channels into an enclosed pump station, then rises along an emergency spillway. The city appears through narrow overhead openings. Bright signage is kept behind dark framing so the white-blue ramp edges and red hazard boundaries remain legible.

### Poetic description

The city pours its weather into the dark. Above, neon dissolves in rain; below, the spillways carry that borrowed color through concrete and steel. You descend beneath the streets until the storm becomes a low, continuous roar, then rise along the emergency channel as if the building itself is exhaling you back toward the night.

### Art instructions

Use near-black blue #121D2B, electric cyan #53D8E2, muted violet #7563A8, and wet concrete #68717B. Keep bright advertising outside the movement corridor. Shape light into long reflections that reinforce ramp direction without hiding edges. Use enclosed pump bass, overhead rain, and a stronger water roar near the spiral. The mood is urgent and sleek. Precision windows need dark framing, and red hazards require distinct hatching so they cannot be mistaken for city signage.

### Route and challenges

1. **0:00–0:25 — Street intake.** A descending entry boards a right-facing ramp that bends left around a support pier. Release onto an opposing curved face, then cross back through a broad opening. The final curve establishes the speed and contact height needed for Act 2.
2. **0:25–0:55 — Double switch.** Link two S-curves with different radii. The first has a generous transition; the second asks for an earlier steering reversal. A low red strip discourages sinking too far down the face. The following receiver is elevated enough that poor speed retention becomes visible without instantly ending the run.
3. **0:55–1:25 — Flood teeth.** Exit onto a six-pad bhop chain between static floodgate teeth. Organize it as three angled pairs, each setting up the next direction. Re-enter a short ramp, pass beneath a head-height opening with appropriate clearance, and board a broad descending face.
4. **1:25–2:00 — Pump spiral.** Descend around a pump column on a 300-degree helix. Midway through, a visible exit window offers a difficult early release; the main route follows the helix farther to a wider opening. Both routes catch the same far ramp and merge before the split.
5. **2:00–2:35 — Broken bypass.** Combine a vertical scoop, a diagonal window transfer, a brief ramp contact, and a longer opposing catch. The window limits departure height; the short contact adjusts heading. A portal then redirects the completed line into the upper spillway without altering its speed.
6. **2:35–3:00 — Emergency outfall.** Two faster sweeping curves lead to a final rising transfer across the pump hall. The receiver is forgiving but rewards arriving high. Finish through a pressure gate with a view back into the spiral.

**Checkpoints:** C1 Intake Seal; C2 Switch Merge; C3 Flood Door; C4 Pump Exit; C5 Bypass Gate. Place R before the helix exit decision and before the short-contact phrase.

**Faster line:** Early helix release plus an inside first S-curve; target 7–12 seconds combined.

**Failure treatment:** Underpowered Act 2 entries land on a slower lower line. Missing the bypass window resets to its R.

**Critical test:** The shortcut must depend on a well-prepared trajectory, not on clipping a corner or exploiting a portal collision seam.

---

## I02 — Basalt Cathedral
**Surf • Theme: a cathedral carved into volcanic stone • Core skill: height management through spirals, spines, and windows**

A circular nave surrounds a suspended bronze bell. Dark basalt creates a strong silhouette against pale floor mist. Surf surfaces are polished stone bands integrated into galleries and buttresses. Openings reveal the bell repeatedly as the route changes height and direction.

### Poetic description

The cathedral has no congregation, only a bell suspended over the depth. Pale light enters through broken stone and falls in long, patient columns. Every ramp traces a part of the architecture's old intention: a buttress, a gallery, the curve around the bell. Speed becomes a kind of reverence as you cross the empty nave.

### Art instructions

Use basalt #292D33, ash stone #8E9296, old bronze #A48B60, and pale light #E5E2D5. Give the bell a strong silhouette and consistent warm highlight. Put low mist beneath the active route, never across window targets. Use long reverberation, sparse bell overtones, and restrained low choral textures without masking contact sounds. The mood is solemn and immense. Polished surf bands should be visibly distinct from rough structural stone.

### Route and challenges

1. **0:00–0:25 — Outer buttress.** Follow a banked curve along the cathedral wall, cross to a freestanding double-sided ramp, and take its far face around a support. A second transfer brings the player into the nave above the main floor.
2. **0:25–0:55 — Bell descent.** Enter a 360-degree descending helix around the bell's support shaft. The first half sets the line; the second narrows the usable height band with a red lower edge and an architectural overhead limit. Release through a large arched opening into the transept.
3. **0:55–1:25 — Transept spines.** Cross a double-sided ramp's ridge, leave onto an opposing face, then use a shallow scoop to climb toward a window. Repeat the sequence with a sideways offset. The ridge collision must be deliberate and consistent; a decorative bevel cannot supply an accidental launch.
4. **1:25–2:00 — Choir crossing.** A row of short ramp faces alternates with aerial gaps between columns. Players shape each departure to arrive high enough on the next face. A short bhop bridge provides a change in rhythm before an angled ramp entrance.
5. **2:00–2:35 — Rose window.** Build a substantial setup curve leading to a high, broad rose-window opening. The main line uses two ramp contacts to reach it. A harder line preserves more speed and uses one longer transfer. Beyond the window, a portal rotates horizontal travel into a descending gallery.
6. **2:35–3:00 — Bell return.** Sweep around the bell on the opposite side from the opening route, cross the nave through a generous low window, and finish along a final curved gallery. The ending echoes earlier shapes at a more relaxed precision demand.

**Checkpoints:** C1 Nave Arch; C2 Transept Door; C3 Spine Merge; C4 Choir Bridge; C5 Rose Gallery. R anchors precede the ridge sequence and high-window setup.

**Faster line:** One-contact rose-window route; target 6–10 seconds.

**Failure treatment:** Selected lower galleries catch weak transfers but add a long bend. Red bell machinery and missed outer windows reset.

**Critical test:** The high window must be reachable from the checkpoint's entry setup without requiring momentum carried from an earlier act.

---

## I03 — Cyclone Observatory
**Surf • Theme: an observatory built around a stationary storm chamber • Core skill: controlled spiral exits and changing curve radius**

Concentric instrument rings surround a contained cyclone behind glass. The storm supplies atmosphere, not random physical force. Ramp rings sit at different elevations and are linked by carefully framed openings. The route circles the chamber without becoming a repetitive lap.

### Poetic description

A storm turns behind glass, endlessly arriving at the same place. Around it, the observatory holds rings of quiet machinery and thin paths of light. You circle the weather, first at a distance, then closer, until the spiral opens and sends you outward again. The route should feel like learning the shape of a force that never quite touches you.

### Art instructions

Use storm blue #344A63, instrument silver #AAB6BE, pale cyan #9BDCE0, and warning amber #DAAA5D. Make each orbital level recognizable through framing and instrument geometry. Keep the cyclone's brightest flashes subdued and away from precision windows. Use steady air-pressure noise, soft instrument pings, and a rising tonal layer near inner rings. The mood is controlled awe. The storm stays physically inert in this ruleset; movement difficulty comes from ramps and transfers.

### Route and challenges

1. **0:00–0:25 — Calibration ring.** Traverse a broad arc, make a tangential transfer to a smaller-radius arc, and release toward a third face at a lower level. The player sees the central storm and learns that each ring has a different turning demand.
2. **0:25–0:55 — Narrowing orbit.** Follow three connected arcs whose radius decreases gradually. A brief straight seam between the second and third gives a readable chance to reset the line. The exit requires climbing toward the face's upper band and releasing across an instrument gap.
3. **0:55–1:25 — Sensor comb.** A surf departure feeds four small bhop surfaces arranged along an arc, then a diagonal jump through a sensor frame. Board a short ramp, transfer around a pillar, and land on the outer observatory ring. The pads reward entering with the correct heading.
4. **1:25–2:00 — Open helix.** Ride a descending helix with two clearly marked exits. The first is narrower and requires a prepared high line; the second is broader and lower. Their receiver ramps run separately for a short distance, then merge into a common instrument tunnel.
5. **2:00–2:35 — Counter-rotation.** A portal sends the player into a curve turning in the opposite direction. Provide a short settling face before asking for the reversal. Continue through a window, skim a short ramp, and make an opposing catch around the storm's base.
6. **2:35–3:00 — Telescope rise.** Spend retained speed on two rising arcs leading to the telescope chamber. A lower fallback arc exists for a weak first climb. Finish through a large circular aperture as the storm chamber becomes visible below.

**Checkpoints:** C1 Calibration Frame; C2 Orbit Exit; C3 Sensor Door; C4 Instrument Merge; C5 Telescope Entry. Put R before the helix and before the portal reversal.

**Faster line:** First helix exit and direct second-ring transfer; target 6–11 seconds.

**Failure treatment:** Missed high lines often reach a slower outer ring. Overshooting beyond the instrument shell resets.

**Critical test:** Ring radius must be appropriate for the tested speed band. Do not increase difficulty merely by compressing all curves uniformly.

---

## I04 — Prism Relay
**Surf • Theme: a light-routing facility • Core skill: preserving useful momentum through portals**

Rooms resemble dark optical chambers with luminous prisms and broad mechanical frames. Each portal has an identifier and an exit preview. Light beams are decorative unless explicitly red-marked; their visual path helps explain how the route connects through the building.

### Poetic description

Light enters the relay as a single line and leaves as a journey. Dark chambers open around suspended prisms, each doorway holding a view that belongs somewhere else. You follow the beam through its impossible turns, carrying motion where the architecture refuses to remain continuous. At the end, the scattered colors gather into one clear opening.

### Art instructions

Use charcoal #171B25, pearl #D7DCE4, ice blue #7ACFE0, and restrained spectral accents. Give every portal a stable symbol and visible destination. Keep refractive effects on decorative prisms rather than on critical collision boundaries. Use sharp frame silhouettes, localized light pools, and brief portal tones that identify transformations. The mood is precise and otherworldly. Limit simultaneous portal views and bloom so optical spectacle does not obscure route information.

### Route and challenges

1. **0:00–0:25 — Input lens.** Ride two broad curved ramps and pass through an upright portal with no gravity change. The exit faces a receiving ramp along the expected travel direction. A second, slightly offset catch teaches that portal position within the opening affects the exit line.
2. **0:25–0:55 — Quarter turn.** Approach a portal after an S-curve. It rotates the travel frame by 90 degrees horizontally, sending the player across a short gap onto a curved receiver. Repeat with a higher exit and a longer catch, keeping the destination visible beforehand.
3. **0:55–1:25 — Lens feet.** Bhop across angled prism bases, pass through a low architectural opening, and launch into a diagonal surf face. A short ramp-to-window transfer follows. This section establishes position and heading control without adding another portal rule.
4. **1:25–2:00 — Split spectrum.** Choose between a longer two-portal route with broad catches and a shorter portal entered from a higher ramp line. Both arrive in the same chamber at different elevations, follow distinct receiving ramps, and merge through one progress gate.
5. **2:00–2:35 — Relay chain.** Link a curved ramp, a portal, a brief receiving face, a diagonal window, and a second portal. Provide at least a readable setup interval after each transformation. A red central prism shapes the final air strafe, while the safe receiving face stays well lit.
6. **2:35–3:00 — Output beam.** Follow a longer sweep around the final prism, make one elevated transfer, then pass through a broad finish portal into a calm light chamber. The final portal completes the visual beam path through the facility.

**Checkpoints:** C1 Input Collar; C2 Quarter-Turn Merge; C3 Lens Frame; C4 Spectrum Merge; C5 Output Entry. R anchors sit before each new portal combination.

**Faster line:** High spectrum portal and a direct diagonal catch; target 6–10 seconds.

**Failure treatment:** Missing a portal rim returns to the phrase. Small exit errors land on wider lower receivers where practical.

**Critical test:** Preserve speed magnitude through ordinary portals and transform direction correctly. Test grazing entries, edge crossings, high speed, and rapid re-entry.

---

## I05 — Monsoon Market
**Parkour • Theme: a dense market under heavy rain • Core skill: landing position, slides, and chained direction changes**

Build narrow streets with layered canopies, rooftop kitchens, bridges, and a central water tower. Rain creates atmosphere but does not introduce random slipperiness. Collision materials remain consistent. Warm stalls illuminate the lower city while the route uses clear cool edge highlights.

### Poetic description

Rain turns the market into a thousand small roofs of sound. Steam rises from kitchens while colored awnings pull tight above the alleys. The water tower appears and vanishes between buildings, guiding a route known only to someone in a hurry. Each landing belongs to a city that keeps working beneath your feet.

### Art instructions

Use rain blue #3E6173, faded saffron #C5A157, dark teal #2E7777, and warm window light #EDC58B. Build dense background detail around a clean movement corridor. Let rain collect on noninteractive edges and keep landing highlights stable. Use canopy drumming, distant vendors, kitchen fans, and gutter water. The mood is lively urgency. Fabric, cables, and signs must remain clear of playable headroom and never create surprise collision.

### Route and challenges

1. **0:00–0:25 — Canopy climb.** Jump diagonally between three awnings, land near the corner of a balcony, and use that corner to reach a narrow roof. Continue through an L-shaped landing and a short step-up. The tower appears at the end of the street.
2. **0:25–0:55 — Sign alley.** Link two short wallruns and offset balcony catches if the engine supports wallrunning; otherwise implement equivalent tested ledge transfers. A static sign interrupts the direct line, making players choose the correct side before takeoff. Finish with a descending bhop pair.
3. **0:55–1:25 — Kitchen passage.** Slide under a service shutter, exit into a diagonal jump, bhop across three ventilation bases, then crouch through a low opening onto a sloped roof. The slide exit must carry enough predictable speed for the following jump.
4. **1:25–2:00 — Water-tower loop.** Traverse a curved series of balconies around the tower. Alternate a long-low jump with a short-high one. A portal inside a maintenance door connects to the opposite upper balcony, where the landing immediately sets up a roof-edge transfer.
5. **2:00–2:35 — Night-market cut.** Choose a safer zigzag over large awnings or a direct line using a smaller diagonal catch, a slide, and a longer jump. Both routes pass around the same tower support and merge before the final roof descent.
6. **2:35–3:00 — Rain run.** Descend through a fast sequence of sloped roofs, two bhop pads, an open window, and a broad final balcony. The finish sits inside the dry transit arcade. Familiar moves arrive in a satisfying chain.

**Checkpoints:** C1 Canopy Gate; C2 Sign Balcony; C3 Kitchen Door; C4 Tower Collar; C5 Market Merge. R anchors precede wallrun/ledge pairs and the slide-to-jump phrase.

**Faster line:** Direct night-market cut; target 7–12 seconds.

**Failure treatment:** Lower awnings give selected salvage routes. Falling to inaccessible streets resets to R.

**Critical test:** Rain, reflections, signs, and hanging fabric must never conceal the next landing or alter collision unpredictably.

---

## I06 — Gravity Freight
**Parkour • Theme: a cargo station with rotating local gravity • Core skill: reorienting while preserving a planned route**

Freight containers form corridors around a large central cargo cylinder. Three gravity zones point toward different structural faces. Each transition chamber prominently shows the next floor through lights, arrows, and container orientation. Gravity changes are fixed and repeatable.

### Poetic description

The freight station has more than one idea of the floor. Containers cling to walls that become streets, and bridges hang beneath ceilings that will soon carry your footsteps. The great cargo cylinder remains at the center of every view, a familiar shape while the world quietly changes its terms around you.

### Art instructions

Use industrial blue #48647A, pale concrete #BAC1C2, safety gold #D2AF5B, and deep graphite #252E37. Give each gravity orientation a different arrangement of structural lights, backed by explicit down arrows. Keep text and container doors aligned to their local floor. Use magnetic hums at gates and solid mechanical ambience elsewhere. The mood is practical machinery made strange. Camera transitions should be deliberate and legible, with a stable landmark visible before and after.

### Route and challenges

1. **0:00–0:25 — Loading line.** Traverse diagonal cargo tops, hop through a broken conveyor, and cross two narrow maintenance bridges under normal gravity. The final corridor frames a wall that will become the next floor.
2. **0:25–0:55 — Side dock.** Enter a 90-degree gravity transition in a generous chamber. Preserve velocity while gravity changes according to the defined gate behavior. Land on the new floor, then perform three straightforward jumps and one curved bhop phrase to establish the new orientation.
3. **0:55–1:25 — Cargo ribs.** Cross offset support ribs, slide beneath a container overhang, and jump around an L-shaped obstruction. A portal preserves the local movement frame while connecting to another portion of the same side dock. Its exit provides room before the next precise action.
4. **1:25–2:00 — Inverted bay.** Transition to a ceiling-facing gravity zone on a broad catch area. Use alternating long-low and short-high jumps through suspended cargo frames. Red machinery forms a visible central obstacle, while the safe perimeter remains continuous.
5. **2:00–2:35 — Freight transfer.** Chain a side-floor jump, a portal, an orientation-stable landing, and a normal-gravity return chamber. A shorter route uses a narrower portal approach and skips two cargo ledges. Both routes normalize gravity before their common progress gate.
6. **2:35–3:00 — Departure belts.** Finish with a normal-gravity bhop descent and diagonal ledge sequence. Cargo movement remains decorative. The final view shows the three previously traversed floor orientations around the cylinder.

**Checkpoints:** C1 Loading Seal; C2 Side-Dock Frame; C3 Rib Exit; C4 Inverted Bay Door; C5 Gravity Return. Each gravity transition gets an R before activation and a validated recovery after a stable landing.

**Faster line:** Narrow portal approach in Act 5; target 5–9 seconds.

**Failure treatment:** Gravity-relative catch floors recover small misses. Falling into red central machinery resets.

**Critical test:** Checkpoint gravity, camera orientation, velocity, and control frame must agree. No player should respawn sideways with controls interpreted in the old frame.

---

## I07 — Ember Courier
**Parkour • Theme: transporting a power cell through a geothermal station • Core skill: fuel planning and controlled thrust**

A compact station climbs around a glowing geothermal shaft. Ceramic ledges, insulated pipes, and red-hot machinery establish the route. The jetpack supplies lift relative to local gravity; lateral movement comes mainly from player steering. The next refill is always visible or signposted.

### Poetic description

Heat lives below every floor. Ceramic walls glow at their seams, and the station's narrow shelves climb around a furnace too large to see all at once. Your jetpack is a small, deliberate flame against that greater fire. Each pulse should feel chosen: enough to rise, enough to cross, enough left for the ledge still waiting above.

### Art instructions

Use charcoal ceramic #303035, ember orange #E28B42, pale insulation #D8D0B9, and cool service blue #6B9CA9. Separate environmental orange from red hazard markings with clear patterns and boundaries. Use heat distortion only beyond the route or at low intensity. Place cool light around refills and warm light around the shaft. Sound should emphasize fuel pulses, ceramic echoes, and deep geothermal pressure. The mood is focused, hot, and purposeful.

### Route and challenges

1. **0:00–0:25 — Cool entry.** Begin with ordinary diagonal jumps and a descending bhop trio. Collect the lift pack at a marked gate, then use one short pulse to reach a broad shelf. Fuel is displayed in seconds of available full thrust as well as a bar.
2. **0:25–0:55 — Furnace ribs.** Cross two gaps with different height requirements. The first needs a brief early boost; the second rewards coasting before a later correction. A ceiling limits continuous thrust. Refill at a fixed pad after both challenges.
3. **0:55–1:25 — Service braid.** Alternate normal jumps, a slide beneath a pipe, and a jetpack-assisted diagonal landing. A second phrase starts with a downward drop, so the player must use thrust to control the catch rather than gain maximum height.
4. **1:25–2:00 — Shaft ascent.** Climb through three shelves arranged around the shaft. Each shelf changes the direction of the next move. The main route has a mid-climb refill; the faster route skips that shelf but requires retaining enough fuel for the final rise.
5. **2:00–2:35 — Heat exchange.** Pass through an upright portal onto an elevated ledge, then cross a low-ceiling chamber with two precise thrust pulses and a short bhop finish. Red hanging heat sinks create a readable lateral path. Fuel starvation must remain recoverable through R.
6. **2:35–3:00 — Vent release.** Descend across a series of ledges with one optional correction boost, then make a final controlled ascent into the exit station. The final refill is generous; the ending rewards clean movement rather than hiding a surprise fuel test.

**Checkpoints:** C1 Pack Gate; C2 Rib Refill; C3 Service Door; C4 Shaft Merge; C5 Exchange Exit. R states include exact fuel and pack profile.

**Faster line:** Skip the middle shaft refill shelf; target 6–10 seconds.

**Failure treatment:** Safe thermal shields catch selected underpowered jumps. Touching a red heat sink or falling into the shaft resets.

**Critical test:** Measure the minimum fuel cost of every valid main-route phrase, then add an audience-appropriate reserve. Never tune from theoretical thrust duration alone.

---

## I08 — Aquifer Switchback
**Hybrid • Theme: a dam's internal water-routing system • Core skill: carrying a useful line across movement styles**

The route alternates sloped spillways, narrow service galleries, circular valve chambers, and dry maintenance bridges. Water appears behind grates and glass. The playable surfaces stay dry and mechanically consistent. A huge valve wheel ties the spaces together.

### Poetic description

Inside the dam, the river becomes architecture. It waits behind gates, turns beneath floors, and speaks through the walls in a voice too low to locate. The route follows the hidden labor of that water: down a channel, across a service bridge, around the great valve, then suddenly outside where the whole valley opens below.

### Art instructions

Use deep aquifer blue #254B5C, aged concrete #919891, oxidized metal #618D85, and service amber #D5B56D. Keep the interior compact and directional, then save the widest vista for the finale. Use damp wall staining, dry gameplay surfaces, and strong valve silhouettes. Build sound from distant pressure to close machinery, followed by open-air water roar. The mood is contained power becoming release. Red machinery zones need exact, readable borders.

### Route and challenges

1. **0:00–0:25 — Upper channel.** Follow a descending S-curve, release across a support gap, and catch a slightly elevated face. The final ramp exit points diagonally toward the first service pad, making the upcoming movement change visible.
2. **0:25–0:55 — Service zigzag.** Bhop across six pads in two angled groups, land on an L-shaped platform, slide below a pipe, and jump onto a broad surf entry. A slower walkway offers a lower-speed approach with enough run-up to remain valid.
3. **0:55–1:25 — Valve helix.** Descend around the valve on a 270-degree curved ramp. Leave through a side opening, pass a red support pillar, and catch an opposing face. A higher early exit provides the optional route but requires a well-prepared contact height.
4. **1:25–2:00 — Pressure gallery.** A portal connects to an upper parkour gallery. Cross offset ledges, take a short 0.65 G jump through a pressure ring, then land in normal gravity before the next bhop pair. A clear boundary prevents the field from changing halfway through an ordinary landing.
5. **2:00–2:35 — Triple exchange.** Execute surf → bhop → surf twice. The first chain uses broad catches; the second rotates the bhop pads and raises the final ramp entry slightly. Each phrase's last landing must prepare the next departure.
6. **2:35–3:00 — Dam face.** Emerge onto the dam's exterior for a broad curve and a long visible transfer back into the exit gallery. The landscape opens for the finale while the actual route remains clearly bounded.

**Checkpoints:** C1 Upper Gate; C2 Service Arch; C3 Valve Exit; C4 Pressure Door; C5 Exchange Merge. Add R before both triple-exchange phrases.

**Faster line:** High valve exit and a direct service zigzag transfer; target 7–11 seconds.

**Failure treatment:** Lower channels and maintenance walkways salvage weak entries. Red machinery and exterior falls reset.

**Critical test:** Validate every surf-to-bhop transition at the full range of legal entry speeds, including the slower walkway route.


# 11. Experimental maps — hard

These courses use explicitly introduced custom mechanics. Their unusual physics need dedicated prototypes. Keep their race records separate from standard-mode records.

## X01 — Möbius Engine
**Surf • Theme: an impossible industrial ribbon • Core rule: gravity changes at marked gates so the next ribbon face becomes surfable**

A massive ribbon twists around a central engine. Its apparent continuity is supported by fixed gravity gates and portal connections. The route can resemble a Möbius strip without pretending that ordinary gravity can keep a surfer attached to every orientation. The engine core stays visible as an orientation landmark.

### Poetic description

The engine folds its own path back through itself. A ribbon of metal turns above the core, showing a surface that seems to become its own underside. You follow it until down belongs to another wall and the beginning appears overhead. The impossible shape should feel like a machine with a rule you can learn, even while it refuses ordinary space.

### Art instructions

Use graphite #20242C, pale alloy #C5CDD2, muted ultraviolet #8069B7, and core cyan #70D5DC. Give each gravity gate a distinct frame and persistent local-down markings. Keep the core visible through controlled gaps as an orientation anchor. Use low mechanical tones that shift at state changes without startling the player. The mood is cerebral and monumental. The ribbon's decorative twist must never conceal an unsupported surf orientation.

### Route and challenges

1. **0:00–0:25 — First face.** Begin with normal-gravity curves and an opposing transfer along the ribbon's outer surface. Approach the first gravity gate through a broad settling section. The next face and its local-down markers are visible before crossing.
2. **0:25–0:55 — Quarter rotation.** A gate changes gravity toward the ribbon's side structure. A generous catch establishes the new frame, followed by a curved ramp and a precision transfer. A second phrase narrows the catch while retaining the same gravity rule.
3. **0:55–1:25 — Underside.** Pass through a portal into an inverted-looking chamber with a consistent local gravity field. Surf along two linked underside faces, cross a short spine, and release through a visible opening. Red edges define the usable ribbon without concealing its collision surface.
4. **1:25–2:00 — Twist crossing.** Combine a curved approach, gravity gate, airborne correction, and diagonal receiving ramp. The gate changes acceleration according to its defined rule; it does not secretly snap velocity onto the target. A short settling arc leads into a second crossing with reversed direction.
5. **2:00–2:35 — Narrow return.** A portal folds the ribbon back above the opening section. Take a short ramp contact, pass through a tilted window, and catch a compound curve. The main route uses an extra receiving face; the shortcut makes a longer direct transfer.
6. **2:35–3:00 — Closure.** Restore normal gravity in a broad chamber, then complete a fast sequence of familiar curves around the engine. The finish sits near the visible starting structure at a different elevation, completing the apparent loop.

**Checkpoints:** C1 First-Face Gate; C2 Side Collar; C3 Underside Window; C4 Twist Merge; C5 Return Frame. Add R before each gravity combination and after the stable catch that establishes its frame.

**Faster line:** Direct narrow-return transfer; target 7–12 seconds.

**Failure treatment:** Red ribbon edges reset locally. Carefully placed secondary faces recover small errors in the first two acts.

**Critical test:** Each surf surface must be classified relative to the active gravity vector. Visual ribbon continuity cannot conceal a non-surfable interval.

---

## X02 — Singularity Choir
**Surf • Theme: a ceremonial machine around a dark star • Core rule: gravity points toward a defined central source inside marked chambers**

Concentric stone and metal arcs hang inside a spherical chamber. A dark central sphere is surrounded by a thin bright ring. Radial gravity creates changing local down, while a clamped field avoids runaway acceleration near the center. The playable route stays in a bounded annular region.

### Poetic description

At the center of the chamber, a dark star wears a narrow crown of light. Rings of stone hang around it like the remains of an instrument too large to hear. Your path bends inward, circles, and rises away again, tracing a brief orbit through the silence. The final corridor should feel like leaving the pull of a thought.

### Art instructions

Use cosmic navy #101626, pale stone #C0C2CB, cold gold #C7B985, and halo blue #799BCD. Keep the central halo bright but small; avoid lens effects that wash out receivers. Give orbital ramps strong light-dark separation and stable local-down glyphs. Use a deep continuous drone with sparse harmonic layers and clear contact audio. The mood is ceremonial, remote, and immense. Keep camera motion controlled even when the architecture feels disorienting.

### Route and challenges

1. **0:00–0:25 — Outer hymn.** Enter a broad radial-gravity chamber on a generous curved face. Follow a shallow arc around the central source, release to a nearby receiver, and settle on a second ramp. Use persistent local-down markers to make the field readable.
2. **0:25–0:55 — Inner descent.** Transfer between three concentric ramps at decreasing radius. Each receiver is tilted appropriately to the local gravity field. The task is controlling inward drift while maintaining useful tangential speed. Red central machinery makes the lower boundary obvious.
3. **0:55–1:25 — Choir gaps.** Leave a ramp, pass through a wide instrument ring, make a brief contact on an angled face, and catch the next orbital arc. Repeat with a changed exit angle. The camera follows a tested orientation rule rather than rapidly snapping to every field variation.
4. **1:25–2:00 — Broken orbit.** Link a descending spiral section to an outward transfer. Players who preserve enough speed reach a higher outer arc; the main route uses an intermediate catch. A portal then connects to the far hemisphere while mapping the travel frame deliberately.
5. **2:00–2:35 — Opposed voices.** Navigate two curved ramps whose paths cross at different heights. A red structural rib requires an airborne side choice. Follow with a narrow ring opening and a short ramp contact that sets up the final outward movement.
6. **2:35–3:00 — Escape cadence.** Reach an outer transfer corridor, pass through a clearly marked gravity-normalization gate, and finish with two conventional sweeping ramps. The final view frames the entire orbital course around the star.

**Checkpoints:** C1 Outer Ring; C2 Inner Frame; C3 Choir Merge; C4 Hemisphere Door; C5 Escape Collar. R anchors restore exact field membership and a safe local orientation.

**Faster line:** Direct outward transfer in Act 4; target 6–11 seconds.

**Failure treatment:** Leaving the allowed annulus resets. Early teaching arcs include wider receivers.

**Critical test:** Define the radial field mathematically and clamp its magnitude. Test camera comfort and control stability throughout the full orbit before building precision obstacles.

---

## X03 — Razor Bloom
**Surf • Theme: a giant mechanical flower • Core skill: short contacts and precise release lines**

Layered metal petals unfold around an illuminated central stem. The petals used for gameplay are stationary. Their shapes provide compound curves, short redirecting faces, and windows between layers. Red markings indicate lethal edges; thin decorative petal veins are noncolliding.

### Poetic description

The flower is made of sharpened metal, but it opens with the patience of something alive. Petals overlap above a luminous stem, leaving narrow passages between shadow and reflected light. Your movement passes from edge to edge until the inner spiral releases you into the bloom. Precision should feel like threading a path through a structure caught halfway between machine and growth.

### Art instructions

Use dark plum #302638, brushed silver #BBC0C8, pale rose #CDA7B6, and stem green #7EC7A6. Make usable petal faces continuous and slightly satin, with brighter borders only where helpful. Keep thorn silhouettes crisp. Use delicate metallic resonances over a restrained mechanical pulse. The mood is beautiful and exacting. Red hazard edges need hatching and clear separation from rose accents; avoid showering the route with distracting petals or sparks.

### Route and challenges

1. **0:00–0:25 — Outer petals.** Follow a medium-width curved petal, transfer to its opposing partner, and leave through a broad gap into the next layer. The first short-contact face is forgiving and clearly aligned with its receiver.
2. **0:25–0:55 — Alternating cuts.** Link three short ramp contacts around the stem. Each changes heading slightly, and each receiver is visible before departure. A broader face between the second and third provides a moment to stabilize. Difficulty comes from preparing the contact angle.
3. **0:55–1:25 — Thorn rhythm.** A brief bhop chain crosses static stem supports, then boards a narrow but long surf face. A red overhead thorn limits excessive launch height. Leave through a diagonal petal window and catch the opposite face high enough to continue.
4. **1:25–2:00 — Inner spiral.** Descend around the stem on a 270-degree compound curve whose usable width changes gradually. A visible early exit offers a fast release onto a small receiver. The main route continues to a larger catch below and reconnects at the stem collar.
5. **2:00–2:35 — Bloom transfer.** Execute a long curve, a deliberate sharp release, a brief ramp skim, and a second airborne transfer between petal layers. The skim must be achievable over a human-sized input window. A portal returns the completed line to the upper petals.
6. **2:35–3:00 — Open flower.** Sweep outward through broader petal arcs, make two familiar transfers, and finish in the central bloom as the surrounding decorative petals open. The animation begins behind the player and cannot change the route.

**Checkpoints:** C1 Petal Seam; C2 Stem Shelf; C3 Thorn Window; C4 Inner Collar; C5 Upper Bloom. R anchors sit immediately before the difficult short-contact chains.

**Faster line:** Early inner-spiral exit; target 6–9 seconds.

**Failure treatment:** Local reset after missed precision contacts. The first two acts include some wider backup catches.

**Critical test:** Reject contacts that require collision glitches, a single lucky simulation step, or input precision beyond the intended audience.

---

## X04 — Parallax Vault
**Surf • Theme: a sealed vault that repeatedly rearranges apparent space • Core rule: portals connect fixed routes through the same landmark chamber**

A suspended golden cube marks the center of a dark vault. Portals return the player to different elevations and directions around it. Every visit has distinct architectural framing and a numbered route symbol. The space feels impossible, but the route remains learnable.

### Poetic description

The cube never moves, yet every doorway changes what it means to stand before it. The vault repeats in fragments: a bridge now overhead, a window now beneath you, a curve remembered from another height. Gold light gathers on the same silent object while your route redraws the room around it. Familiarity becomes the thread through impossible space.

### Art instructions

Use vault black #16191F, old gold #BFA36A, pale stone #C6C6BD, and cool portal blue #8AAECC. Give each visit a distinct numbered frame and lighting composition. Keep the central cube's material and highlight direction recognizable. Use a consistent low vault tone plus a short unique cue for each route instance. The mood is uncanny but ordered. Limit mirrors and recursive portal views; the player needs a clear distinction between a view and a traversable opening.

### Route and challenges

1. **0:00–0:25 — Lower approach.** Ride a broad outer curve, transfer beneath the cube, and catch a ramp leading into the first portal. The destination preview shows the same cube from above, establishing the map's spatial rule.
2. **0:25–0:55 — Upper crossing.** Exit onto a high curved face, release through a rectangular opening, and catch a diagonally oriented ramp. A red suspension cable shapes the air strafe. The next portal is visible from the receiver, but cannot be reached by bypassing the required gate.
3. **0:55–1:25 — Side chamber.** Pass through two portal-linked rooms with short ramp contacts between them. The first portal changes horizontal heading; the second changes the travel plane through an explicitly defined frame transform. Each exit has a visible settling surface before precision is required.
4. **1:25–2:00 — Three windows.** Traverse three differently oriented windows using a curved approach, an elevated release, and a low controlled transfer. The route passes the central cube twice at different heights. Landmark lighting and route numbers distinguish the two passages.
5. **2:00–2:35 — Vault shortcut.** Choose a longer chain of two broad ramps and a portal, or a direct precision portal entered from a high line. Both emerge in separate lanes of the final chamber and merge before C5. The fast route requires better alignment, not guessing the correct doorway.
6. **2:35–3:00 — Final perspective.** Return to the lower vault on a different side, sweep around the cube, and climb into the finish aperture. Through the final window, the player sees several earlier route layers without confusing them for alternate exits.

**Checkpoints:** C1 Lower Portal; C2 Upper Frame; C3 Side-Chamber Merge; C4 Third Window; C5 Final-Vault Merge. Each repeated chamber visit has a unique progress identity.

**Faster line:** Direct precision portal in Act 5; target 7–11 seconds.

**Failure treatment:** Reset to the last validated route instance, never to an ambiguous identical-looking portal.

**Critical test:** Prevent portal loops, unintended progress acquisition, recursive rendering overload, and ambiguous trigger ownership where route layers overlap.

---

## X05 — Inversion Archive
**Parkour • Theme: an archive catalogued across floors, walls, and ceilings • Core rule: marked gates define which surface is down**

Bookshelves, stone ribs, and suspended index desks form three interlocking routes through a single vast archive. A luminous hanging catalog globe remains recognizable in every orientation. Letters and arrows near gravity gates rotate to match the upcoming floor, explaining the transition.

### Poetic description

The archive has filed the world in every direction. Shelves climb the walls, reading desks wait on the ceiling, and the catalog globe glows at the center like a patient moon. You pass from one arrangement of gravity to another while the books remain perfectly at home. The place should feel less chaotic than impossibly well organized.

### Art instructions

Use ink blue #273044, parchment #D7CEB8, dark walnut #665246, and index gold #C9B36C. Light each local floor with consistent shelf lamps and readable gravity arrows. Keep the central globe visible at major transitions. Use paper rustle, distant shelf mechanisms, and quiet architectural reverberation. The mood is scholarly and uncanny. Reduce small text and decorative clutter near jumps; the route should read through shelf shapes, edges, and light.

### Route and challenges

1. **0:00–0:25 — Ground index.** Traverse offset reading desks, a narrow shelf bridge, and a descending bhop phrase in normal gravity. The final approach frames a side wall populated with obviously walkable shelves.
2. **0:25–0:55 — Wall catalog.** Cross a 90-degree gravity gate onto a wide wall-floor. Make two teaching jumps, then link a diagonal ledge, a low slide, and a short upward hop. The old floor remains visible through a grate as a spatial reference.
3. **0:55–1:25 — Ceiling stacks.** Transition into ceiling-oriented gravity on a stable catch. Jump between shelf ends, wrap around an L-shaped column, and bhop through three offset catalog trays. A portal connects to a second stack aisle without changing the current gravity rule.
4. **1:25–2:00 — Falling index.** Leave a ledge into a large transition volume where gravity changes to the next fixed direction. Steer toward a clearly previewed receiving shelf, land, and continue through a short precision sequence. An R sits before the transition so players can practice its trajectory.
5. **2:00–2:35 — Restricted collection.** Combine a slide, diagonal jump, portal, and gravity-relative wallrun or equivalent ledge transfer. The main route uses an extra shelf. A shorter route skips it by preserving speed and using a narrower portal approach.
6. **2:35–3:00 — Return to ground.** Normalize gravity in a broad chamber, then descend through familiar shelf landings around the catalog globe. Finish at the archive's main desk, now seen from the conventional orientation.

**Checkpoints:** C1 Index Door; C2 Wall Seal; C3 Ceiling Aisle; C4 Falling-Index Shelf; C5 Collection Merge. R restores local down, camera frame, and the exact ability state.

**Faster line:** Skip the extra restricted-collection shelf; target 6–10 seconds.

**Failure treatment:** Some lower shelves provide slow recovery, interpreted relative to local gravity. Red gaps between structural layers reset.

**Critical test:** Ordinary gravity gates change acceleration consistently. If a special gate rotates velocity too, it must use a distinct icon and teaching sequence.

---

## X06 — Thrust Labyrinth
**Parkour • Theme: an aeronautical test facility • Core rule: clearly marked gates exchange jetpack thrust profiles**

The course threads through nested wind-tunnel shells. Three strong material identities mark lift, lateral, and vector thrust zones. The physical route is compact, with windows revealing previous chambers. Airflow visuals are decorative unless the test chamber explicitly introduces a force.

### Poetic description

The laboratory is a sequence of rooms that ask a different question of the same flame. In one, it lifts you; in another, it pulls sideways; in the next, it follows your chosen direction into the dark. White shells hold the air still around each test. Progress feels like learning a new instrument one chamber at a time.

### Art instructions

Use off-white #DDE2DF, deep blue-gray #344652, lift amber #D3B369, lateral teal #65B9B0, and vector violet #A595C7. Associate each profile with a shape and icon as well as color. Keep test baffles simple and their openings high-contrast. Use distinct thrust sounds for each profile and a clear gate confirmation. The mood is clinical curiosity becoming controlled intensity. Avoid constant alarms, random steam bursts, or moving scenery inside precision flight corridors.

### Route and challenges

1. **0:00–0:25 — Lift calibration.** Use the lift profile to cross a short gap, rise to a shelf, and control a descent beneath a ceiling. The available fuel comfortably covers the teaching phrase. A labeled gate previews the next profile.
2. **0:25–0:55 — Lateral slalom.** The pack now supplies strong sideways acceleration with limited lift. Enter with forward momentum, weave between broad static baffles, and land on offset shelves. Two early catches are forgiving; later openings require planning the next sideways pulse.
3. **0:55–1:25 — Vector chamber.** Thrust follows the explicitly defined aim direction. Practice one upward-forward boost, then coast through a frame and brake toward a landing using the supported control scheme. A second phrase adds a diagonal opening without changing the profile.
4. **1:25–2:00 — Exchange route.** Move through a lift gate, climb to a shelf, cross a lateral zone, and enter a vector corridor. Each profile switch occurs on a stable landing or a generously previewed gate. The task is using the correct thrust behavior, not memorizing invisible changes.
5. **2:00–2:35 — Fuel decision.** Choose a longer route with two refills or a shorter sequence with one refill and tighter pulse control. The shorter route combines a diagonal ascent, a low-ceiling crossing, and a controlled landing. Both routes end with the same declared profile.
6. **2:35–3:00 — Flight certificate.** Return to lift thrust for a familiar sequence of ledges and one final rise. Remove the pack in a broad finish vestibule after the finish crossing. The test tunnels are visible through the exit glass.

**Checkpoints:** C1 Lift Door; C2 Lateral Frame; C3 Vector Landing; C4 Exchange Gate; C5 Fuel Merge. R stores profile, fuel, gravity, and any cooldowns.

**Faster line:** Single-refill route; target 8–13 seconds.

**Failure treatment:** Fuel exhaustion resets locally or lands on a clearly marked recovery shelf. No section leaves the player stranded indefinitely.

**Critical test:** Specify whether vector thrust follows camera aim, body facing, or movement input. Use one rule consistently and teach it explicitly.

---

## X07 — Blackwater Reactor
**Hybrid • Theme: a submerged reactor with a cracked containment core • Core rule: different rooms impose explicit gravity and movement states**

Heavy black water presses against thick observation windows. The route moves through ceramic surf channels, dense service machinery, and a central reactor ring. Red heat and hazard markings remain distinct from amber architectural lighting. A low pulse from the core marks spatial proximity.

### Poetic description

The ocean presses against the windows like a second night. Beyond it, the reactor pulses through black water, lighting pipes and suspended dust in slow breaths. Your route moves between weight and release: heavy steps through service rooms, a swift descent around the core, then a small flame carrying you toward the last dry corridor.

### Art instructions

Use blackwater blue #102833, ceramic gray #737F82, reactor amber #D5A255, and cold emergency white #D1E5E8. Keep the core's pulse subtle enough to preserve stable visibility. Show water pressure through distant structural movement and sound, with gameplay geometry fixed. Use deep groans, muffled water, and tight machinery echoes. The mood is tense and submerged. Red hazards must stay separate from the reactor's amber glow and always align with their actual collision.

### Route and challenges

1. **0:00–0:25 — Cold channel.** Begin with a curved surf descent and two opposing transfers around coolant pipes. Finish on a broad service ledge that previews a heavy-gravity chamber. No gravity change occurs during the final surf catch.
2. **0:25–0:55 — Heavy service.** Enter approximately 1.25 G and traverse a short, tightly composed bhop route. Gaps and pad spacing are calibrated for the heavier field. Slide below a pipe, make an angled jump, and reach a normal-gravity landing before continuing.
3. **0:55–1:25 — Core spiral.** Surf a descending helix around the reactor, release through a window between structural ribs, and catch a short face leading to an elevated receiver. The main route uses a lower extra ramp; the direct line requires preserving more speed.
4. **1:25–2:00 — Vent climb.** A portal delivers the player to a ledge with a limited lift pack. Pulse upward through staggered shelves, then stop thrust to pass beneath a red heat exchanger. Land before the pack is removed at a marked gate.
5. **2:00–2:35 — Containment chain.** Link surf → diagonal bhop pair → portal → short surf catch → ordinary jump. A second phrase varies the headings. The section is difficult because of its connected setups, with normal gravity throughout to keep the rule manageable.
6. **2:35–3:00 — Emergency release.** Ride two broad curves through the outer containment shell, make a long visible transfer, and land in the extraction corridor. Water thunders behind the glass as the final door frames the core far below.

**Checkpoints:** C1 Heavy Door; C2 Gravity Return; C3 Core Window; C4 Vent Exit; C5 Containment Merge. Add R before every distinct movement-state change.

**Faster line:** Direct core transfer and a tighter containment diagonal; target 7–12 seconds.

**Failure treatment:** Red heat sinks and water outside the safe shell reset. Lower ceramic catches salvage selected surf misses.

**Critical test:** Ability removal occurs on safe ground after its required movement is complete. Heavy gravity must not leak into later surf sections.

---

## X08 — Dream Circuit
**Hybrid • Theme: a rain-filled station suspended in a pale dawn • Core rule: portal doors revisit one chamber with three explicit movement states**

The central station contains a tilted clock, a shallow reflecting pool, and a suspended tram. Players see these landmarks repeatedly through different doors. Geometry remains fixed; portal routing and declared movement states change how the chamber is traversed. The dreamlike presentation never changes the rules unpredictably.

### Poetic description

It is always almost morning at the station. Rain hangs beyond the glass, the tram waits without passengers, and a tilted clock watches you arrive from doors you have already left. Each return changes the meaning of the same room: water becomes a curve, a wall becomes a path, a sign becomes a landing. At the final platform, dawn finally reaches the floor.

### Art instructions

Use dawn lavender #B6AAC9, rain blue #648796, faded cream #DDD4C4, and soft apricot #E6B79C. Keep three landmarks identical across visits, then change framing and state symbols to explain the current route. Use distant station announcements without intelligible urgent instructions, gentle rain, and a recurring soft chime. The mood is wistful and lucid. Save the warmest light for the finish; avoid visual effects that make portals, water, and collision boundaries ambiguous.

### Route and challenges

1. **0:00–0:25 — First arrival.** Traverse normal-gravity ledges around the station pool, slide beneath the tram, and bhop onto a departure platform. A portal previews the same station from a high balcony, establishing the return structure.
2. **0:25–0:55 — Waterline surf.** Return with the route entering a curved surf channel around the pool. Link an S-curve, a diagonal window, and an opposing catch beneath the tilted clock. The channel is a dedicated surf surface, clearly distinct from decorative water.
3. **0:55–1:25 — Light departure.** Enter a marked low-gravity state on a stable balcony. Make long diagonal jumps between suspended station signs, then use a short lift-pack pulse to reach a tram-roof landing. Fuel and gravity remain fixed throughout this phrase.
4. **1:25–2:00 — Sideways station.** A portal and a separately signaled gravity gate lead into a wall-oriented route around the same chamber. Cross offset ledges, board a short surf face relative to local gravity, and exit through a familiar doorway seen from a new angle.
5. **2:00–2:35 — Three doors.** Choose a clearly labeled safe return through two broad surfaces or a shorter precision portal route. Both restore normal gravity and remove the pack on a stable landing. Continue with a surf-to-bhop chain that combines the station's earlier movements.
6. **2:35–3:00 — Dawn platform.** Follow a broad final curve, jump to the tram platform, and cross the finish as the station opens toward dawn. The clock stops turning decoratively, but the gameplay clock remains precise. The last view reveals the layered route through the chamber.

**Checkpoints:** C1 Departure Platform; C2 Clock Gate; C3 Tram Roof; C4 Side-Door Landing; C5 Three-Door Merge. Distinct route-instance IDs prevent the repeated room from confusing progress validation.

**Faster line:** Precision return door and direct waterline catch; target 7–12 seconds.

**Failure treatment:** Restore the current visit's state and location. Never send a player to the right-looking room in the wrong gravity or progression state.

**Critical test:** The three states must remain instantly recognizable through geometry framing, symbols, and sound. Repeated landmarks should create recognition, not uncertainty about the current route.


# 12. A worked section specification: Neon Spillway's pump spiral

This example shows the detail the building AI should produce before committing a section to final geometry. Its numbers are initial test targets.

## 12.1 Intended experience

The player sees a pump column through a narrow approach, enters a descending curved ramp, and gradually reveals an exit window across the chamber. A high early release offers a shorter route. Continuing around the column reaches a wider, lower opening. Both routes reconnect on a visible receiving ramp.

The decision is made through the player's line and departure timing. No menu or arbitrary switch is involved.

## 12.2 Geometry and action sequence

| Beat | Initial time budget | Geometry | Player action | Required result |
|---|---:|---|---|---|
| 1 | 4 s | Approach face and broad board area | Settle onto the ramp | Stable contact in the validated speed band |
| 2 | 8 s | First descending arc around the pump | Follow the curve and manage contact height | Enough speed and height to choose an exit |
| 3 | 7 s | Arc revealing both exit openings | Prepare a high early release or continue lower | Commit to a visible receiving corridor |
| 4 | 6 s | Airborne transfer and receiver | Air-strafe past a support and catch the face | Valid arrival without seam impact |
| 5 | 6 s | Opposing ramp followed by a gentler curve | Preserve motion through the merge | Both branches converge before validation |
| 6 | 4 s | Short stable exit corridor | Cross C4 while moving | Comparable split and safe next-section setup |

The time distribution must change if playtesting shows uneventful travel. Never lengthen an empty arc merely to fill its budget.

## 12.3 Initial parameters to calibrate

- Let V be the measured reference entry speed.
- Test the main route with initial speeds around 0.8 V, V, and 1.2 V, then expand to the actual permitted range.
- Choose helix radius from successful steering tests at those speeds. The approximate turn rate v/r is a useful geometric sanity check, not a surf-physics model.
- Begin with a usable surf-face width around 8–12 W, then tune from landing distributions.
- Begin with a main-route exit opening around 6–8 W wide and 2–3 H high, adjusted to the actual trajectory envelope.
- Make the optional opening smaller only after both launch and landing are demonstrably controllable.
- Give the receiving ramp enough length that a valid low catch can stabilize before its next challenge.
- Set separation between turns from the full player collision volume plus trajectory clearance, not from the rendered character's appearance.

These values do not establish feasibility by themselves. Inclination, radius, vertical drop, entry tangent, and air control interact.

## 12.4 Recovery and validation

- R4A sits before the approach and provides an authored setup ramp.
- R4B may sit after the receiving catch if the remaining phrase is substantial.
- The optional early exit and main opening both lead through C4 after merging.
- The central pump is visibly solid; its red dangerous portions have exact collision boundaries.
- A failed early release cannot activate C4 through the floor.
- A manual reset cannot provide a faster line than completing the current phrase.
- Test the restart at minimum guaranteed entry speed, not only from a perfect full-map run.

## 12.5 Art direction for this section

Use a dark cylindrical chamber with cool spillway light and warm maintenance lamps around the pump. Reveal the exit window as a clear pale rectangle while the player rounds the first arc. Put water spray below the route. The portal after the following section should not visually compete with this window.

The poetic instruction is: **“Let the storm disappear into the machinery, then reveal a single clear way through it.”**

The practical instruction is: **Keep the window silhouette visible from the decision point; shape the lighting and occlusion around that sightline.**

---

# 13. Race mode: randomized connected maps, lowest cumulative time wins

## 13.1 Recommended structure

Use these as independent menu choices:

- **Difficulty:** Beginner, Intermediate, or Experimental.
- **Course type:** Surf, Parkour, or Mixed.
- **Session:** Practice, individual time trial, or Race.

Mixed draws from all compatible disciplines in the chosen difficulty. Hybrid maps appear in Mixed by default. Do not insert an Experimental map into a standard queue without explicitly selecting an event that does so.

For a first race format, use three maps. At approximately three minutes per clean run, that produces about nine minutes of clean movement plus transitions and retries. A five-map event produces about fifteen minutes before retries. Match duration needs its own testing.

## 13.2 Random order must be shared

At match creation:

1. Select an eligible pool by difficulty, course type, physics version, and validated map version.
2. Choose a map count.
3. Generate one server-owned seed.
4. Sample a sequence without repeats for that match, unless repeats are an explicit event rule.
5. Give every racer the identical sequence.
6. Preload the next map where practical.
7. Keep the chosen sequence fixed for the entire match.

For longer Mixed events, constrain the shuffle to avoid an unwanted concentration of one discipline. This changes selection, not the authored obstacle layout.

**Randomize the order of tested maps.** Runtime generation of arbitrary ramps, portals, and gaps requires a separate validation system and should not be treated as automatically race-ready.

## 13.3 Standard map connectors

Each map exposes an entry connector and exit connector:

| Entry contract | Exit contract |
|---|---|
| Fixed spawn position and facing in local coordinates | Finish trigger covering every legal finish trajectory |
| Declared starting velocity, normally zero before launch | Required progress validated before completion |
| Declared gravity and ability profile | Run result committed exactly once |
| Declared fuel and cooldown state | Old map's temporary physics state cleared |
| No inherited speed or resources from the prior map | Next entry state applied deliberately |
| Same launch procedure for every racer | Short automatic transition to the next map |

The visual connection can be a portal, docking collar, transit door, or similar frame. Keep its functional behavior consistent.

Within a map, ordinary momentum portals preserve the intended velocity transform. **Between maps, the competitive connector deliberately restores the next map's fixed starting state.** Give these two portal types distinct symbols.

This allows any compatible map to follow any other without inheriting extreme speed, inverted gravity, or surplus fuel.

If continuous momentum between maps is later desired, treat that as a separate ruleset. Then map-order pairs need compatibility testing and sequence-specific records, because the previous map changes the next map's entry conditions.

## 13.4 Timing rules

Use:

**Match time = the sum of each map's elapsed scored time.**

For each map:

- Start timing at the defined start event.
- Keep timing active through failed attempts, normal respawns, and manual recovery resets.
- Stop only at a valid finish crossing.
- Exclude engine-controlled loading and the neutral inter-map connector.
- Make connectors automatic so a player cannot take unlimited unscored breaks.
- Record map time, cumulative time, recovery count, and checkpoint splits.
- Validate each result against the active map and physics versions.

Example:

| Racer | Map A | Map B | Map C | Total |
|---|---:|---:|---:|---:|
| Player 1 | 2:51.420 | 3:09.810 | 2:58.300 | 8:59.530 |
| Player 2 | 2:47.900 | 3:22.410 | 2:54.600 | 9:04.910 |

Player 1 wins because the cumulative time is lower, even though Player 2 wins two individual maps.

Use the server's authoritative simulation clock and a consistent trigger-crossing method. High-speed players must not skip a thin finish or checkpoint trigger between simulation steps. Compare full stored precision; if results are genuinely equal, award a shared placement rather than inventing an unrelated tiebreaker.

## 13.5 Recovery and branch integrity

Progress should be an ordered graph, with explicit legal alternatives:

START → C1 → C2 → branch A or B → C3 → C4 → C5 → FINISH

A branch can contain its own required tokens where needed. Both branches eventually satisfy the same milestone.

- Crossing a late gate out of order does not finish the map.
- Falling through a neighboring route cannot grant future progress.
- Portals carry route-instance identity, especially in repeated chambers.
- Recovery restores the last valid progress state.
- A checkpoint does not reset elapsed map time.
- A player cannot return to a stage selector during a scored race and keep a valid result.
- Finishing and teleporting must be processed so that the next map cannot inherit a stale timer or progress event.

## 13.6 Multiplayer fairness

Recommend ghost racers: visible when useful, without physical collision, pushing, blocking, or shared fuel pickups.

Use personal deterministic states for moving obstacles and refill logic. A leading player cannot change a later player's obstacle timing.

Loading delays are excluded from score but should be bounded operationally so matches do not hang. A disconnected or unfinished racer is marked DNF. Completed racers are ranked by cumulative time. DNF players can be displayed by progress for spectator clarity, without placing ahead of a valid finisher because they spent less time racing.

Keep optional practice ghosts and reference routes visually faint. They should never obscure red boundaries or small receivers.

## 13.7 Race interface

During a run, show:

- Current map name and position in the sequence, such as 2/3.
- Current map elapsed time.
- Cumulative scored time.
- Brief split delta against a personal best or chosen reference.
- Current gravity/jetpack state only where relevant.

After finishing, show each map time and the total. Also show recovery count as useful feedback, while preserving lowest cumulative time as the win condition.

Use a clearly labeled live lead only when comparing equivalent progress or a known completed result. Physical distance between racers in different maps is not a meaningful time lead.

---

# 14. Production process for the map-building AI

## 14.1 Inspect existing work first

If redesigning an existing project:

1. Locate the movement controller, ability definitions, map format, checkpoint system, timer, and race manager.
2. Identify which systems actually work and which are visual placeholders.
3. Record the current physics profile and dimensions.
4. Inventory existing maps and preserve useful assets.
5. Replace weak layouts with named movement sequences from this brief.
6. Treat missing movement capabilities as explicit implementation work.

A custom engine gives flexibility, but changing physics to rescue each bad obstacle makes the game inconsistent. Calibrate the movement system, version it, and fit maps to it.

## 14.2 Build three representative prototypes first

Start with:

1. **Copper Reef:** verifies curved surf, a helix, bhop integration, forgiving recovery, and a momentum portal.
2. **Neon Spillway:** verifies linked curves, a meaningful faster route, precision transfers, and checkpoint pacing.
3. **Inversion Archive:** verifies gravity state, camera behavior, checkpoint restoration, and route readability.

These are recommended production priorities, not a restriction on the full library. They expose different technical risks before all 24 maps are built.

## 14.3 Required design packet for each map

Before final art, produce:

- One-sentence movement identity.
- Poetic description and practical art direction.
- Top-down route sketch.
- Side-elevation sketch.
- Six-act route graph and approximate time budgets.
- A list of movement phrases, including entry and exit states.
- Curved ramp parameters or control points where applicable.
- Jump/transfer feasibility evidence from the real controller.
- Checkpoint, progress, recovery, and hazard locations.
- Safe/main route and optional faster routes.
- Portal transforms and destination clearances.
- Gravity and jetpack state boundaries.
- Race entry and exit contracts.
- Known risks and planned playtests.

A screenshot of attractive geometry is not sufficient evidence that the course works.

## 14.4 A useful engine-neutral map record

Use the actual project's schema if one already exists. Otherwise begin with a record shaped like this:

```json
{
  "id": "I01",
  "name": "Neon Spillway",
  "difficulty": "intermediate",
  "discipline": "surf",
  "mapVersion": 1,
  "physicsProfile": "core_movement_v1",
  "targetCleanMainRouteSeconds": [165, 195],
  "entry": {
    "connector": "race_entry",
    "statePreset": "normal_gravity_no_pack_fixed_start"
  },
  "sections": [
    {
      "id": "pump_spiral",
      "targetSeconds": 35,
      "entryStateRange": "validated_approach_band",
      "phrases": ["board", "descend_curve", "choose_exit", "catch", "merge"],
      "requiredProgress": ["pump_spiral_entry", "pump_spiral_merge"],
      "recoveryAnchors": ["R4A", "R4B"],
      "routes": ["main_lower_exit", "optional_high_exit"],
      "hazards": ["pump_core", "red_lower_edge"],
      "exitStateRange": "validated_bypass_entry_band"
    }
  ],
  "exit": {
    "connector": "race_exit",
    "requiresOrderedProgress": true
  }
}
```

The example contains one section to illustrate structure; a full map record includes all six acts and their detailed phrase data. Names such as “validated_approach_band” must resolve to measured numeric ranges in implementation.

## 14.5 Movement phrase specification

Every meaningful obstacle chain should answer:

- Where does the player enter?
- What speed range, height, heading, gravity, and resources are expected?
- What should the player see before committing?
- Which inputs/actions make the route work?
- Where can a slightly imperfect attempt land?
- What state is needed for the next phrase?
- Where does failure recover?
- How is progress validated?
- What makes the optimized line faster?
- What evidence shows the chain is feasible and enjoyable?

If these questions are unanswered, the AI is still describing scenery.

## 14.6 Build order

**Pass 1 — Movement:** Graybox the route with simple materials. Implement and test actual curved collision.

**Pass 2 — State:** Add progress gates, recovery anchors, red zones, portals, gravity fields, and jetpack behavior.

**Pass 3 — Timing:** Collect clean runs, recovery runs, and shortcut runs from the intended audience.

**Pass 4 — Architecture:** Give the route meaningful rooms, support structures, landmarks, and enclosure.

**Pass 5 — Atmosphere:** Apply the map's palette, light, sound, weather, and poetic direction.

**Pass 6 — Race integration:** Test the map before and after different compatible maps with normalized entry states.

**Pass 7 — Polish:** Remove collision snags, confusing silhouettes, unnecessary travel, and exploit routes.

Do not postpone basic art readability until the very end; graybox materials and lighting should already distinguish playable surfaces and hazards. Final decorative detail comes after the movement is sound.

---

# 15. Acceptance tests and playtest questions

## 15.1 Reject these common failures

- The surf course is mostly straight wedges separated by empty space.
- Curves exist visually but use broken or stair-like collision.
- Long spirals repeat the same input without changing the route problem.
- Most parkour landings allow a full stop and recenter before an identical next jump.
- Difficulty comes mainly from shrinking everything.
- A portal exists only to disguise a loading screen, while all movement stays repetitive.
- Red zones are scattered without shaping a readable line.
- Gravity or jetpack changes occur without clear boundaries and state indicators.
- The map contains long empty approaches added solely to reach three minutes.
- A checkpoint restores an impossible speed, gravity, or fuel state.
- A shortcut saves time only through an unintended collision exploit.
- The atmosphere obscures landings or makes hazards ambiguous.
- Random map order changes starting resources or makes the race unfair.
- Successful play depends on frame rate, unstable contact resolution, or inconsistent triggers.

## 15.2 Functional tests

Run meaningful checks against actual movement and race systems:

1. Complete every main-route phrase from its authored recovery state.
2. Complete each faster route and verify that all required progress is satisfied.
3. Test low, typical, and high valid entry speeds.
4. Check curved seams for unexplained velocity loss or deflection.
5. Test portals at center, near edges, and at maximum permitted speed.
6. Test gravity fields from every intended approach and after recovery.
7. Exhaust jetpack fuel, recover, and verify the restored profile and fuel.
8. Attempt to cross gates out of order and enter finish from unintended directions.
9. Confirm consistent timing across supported frame rates and network conditions.
10. Run the same match seed for multiple racers and verify identical map order.
11. Connect every map to the standard connector and test representative cross-discipline transitions.
12. Confirm that loading and neutral transitions cannot be manipulated to pause an active map.
13. Verify that moving obstacles and pickups are isolated per racer where required.
14. Check visibility and frame time in the heaviest portal and atmospheric scenes.

## 15.3 Human playtesting

Use players from the intended audience, not only the developer or a movement expert.

For each map, record:

- First-completion time.
- Clean main-route time after familiarization.
- Best optimized time.
- Failures per phrase and recovery anchor.
- Common landing locations and missed receivers.
- Places players stop because they cannot read the route.
- Places players stop because the next action is too repetitive.
- Whether players remember the map's landmark and signature movement.
- Whether faster routes are understandable after discovery.
- Whether gravity transitions feel controllable and comfortable.

Ask: “What were you trying to do when you failed?” If the answer repeatedly differs from the intended action, improve communication or geometry.

## 15.4 Tuning priorities

- If a sequence is unclear, improve visibility and setup before making it wider.
- If it is physically unreliable, fix collision or state handling before changing decoration.
- If it is too easy, connect decisions more tightly or add a meaningful alternate line.
- If it is too punishing, improve recovery spacing or provide a slower salvage route.
- If it is too long, remove repeated movement that teaches nothing new.
- If it is too short, add a new variation or complementary phrase.
- If it feels generic, change architectural relationships and movement identity together.

**Release criterion:** The map delivers its stated movement identity, remains readable at speed, works from all recovery states, and fits the intended timing band in actual tests. Do not report these as passed until they have been observed.

---

# 16. Master instruction to give the map-building AI

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

