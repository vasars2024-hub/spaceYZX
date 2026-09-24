# Space YZ — Build Plan (handoff for a Claude Code session)

You are building **Space YZ**: a free-to-play, fast-paced, competitive **first-person** arena shooter set **inside spaceships**, where **gravity changes how you move and shoot**. It is played in Google Chrome. Read this whole document before writing code. Work milestone by milestone; at the end of each milestone, show the owner something playable and ask before moving on.

## About the owner and their machine

- The owner is not a professional developer. Explain things in plain language, keep setup steps short, and give one command per code block.
- Windows 11, Node.js v24 and Git are installed. GitHub CLI (`gh`) is **not** installed.
- A GitHub repository named **`space-YZ`** is planned but may not exist yet. Ask the owner before pushing anything.
- For now the game server runs **on the owner's own PC** for them and their friends, at zero cost.

## Requirements (from the owner)

| Area | Requirement |
|---|---|
| Genre | Fast-paced competitive **first-person** arena shooter |
| Setting | Arenas are **spaceship interiors** |
| Core mechanic | **Movement is affected by gravity** (gravity zones, zero-G, wall gravity) |
| Weapons | **"Boomerang Fu, but first person"**, with extra features for FPS balance. Same kit for everyone at the start: Boomerang (throw, curve, catch, slash, deflect), Laser (straight, low ammo), a throwable that can be shot down. **No recoil.** |
| Objective | One player per team carries the **Controller**. Win a round by **touching the enemy Tower with the Controller**, or by **eliminating the whole enemy team** |
| Graphics | **Simple but good-looking** |
| Price | Completely free to play |
| Platform | Runs in Google Chrome on *any* computer, including old/weak laptops |
| Modes | 1v1, 2v2, 5v5 (5v5 is the largest) |
| Round length | 1v1: 40 s per round, max 8 rounds. 2v2: 1:00 per round. 5v5: 1:30 per round |
| Match length | A full match should take **at most ~10–15 minutes** (see Match structure) |
| Ranked | A rank per mode (1v1, 2v2, 5v5) that combine into one overall global rank |
| Skill | Very high skill ceiling |
| Netcode | "Smart ping equalization" so higher-ping players are not badly disadvantaged |
| Hosting | Free, on the owner's PC for now. **Hosting must be very easy for anyone — close to 1-click** (double-click, share a link). Architecture should allow moving to real hosting later |

### Assumptions to confirm with the owner (ask early, don't block on them)

**Already decided by the owner:** all modes are round-based (one life per round, no respawns); round lengths are per round; the kit is Boomerang + Laser + Gravity Grenade + Dash; fast Boomerang; 1-hit headshot / 2-hit body; mid-flight steering for everyone; R = fast, lethal recall; no power-ups; matches at most ~10–15 minutes (1v1's ~6.5 min max is fine); **friendly fire on for everything**; **throw path preview** visible to the thrower; **hard deflects** (must face the Boomerang, small angle); **one map for all modes**, spacious, 3 main paths to each Tower; **5 s spawn lock at random spawns**; clear Controller indicators; high-but-not-too-high visibility; very satisfying kill/multi-kill feedback; **no peeking/lean mechanics**; slight zoom when aiming; **two throw modes: Quick Throw and 3 s Wind-up Throw** (one-hit kill, path visible to everyone).

1. **Rounds per match** (see Match structure) were chosen by the planner to fit the 10–15 minute cap — confirm.
2. **"3 ranks → 1 global rank":** one rank each for 1v1, 2v2 and 5v5, combined into a global rank.
3. **Keyboard + mouse only** at launch.
4. The owner is still exploring the weapon ideas — expect changes after the first playtests, and keep weapons data-driven.

## Game design proposal (tune with the owner through playtesting)

### Setting & the first map (owner decisions)
- **One map at first, used for all modes (1v1, 2v2, 5v5).** It's the interior of a large spaceship.
- **It must not feel cramped:** lots of **horizontal width and vertical height** — big open bays, tall shafts, multi-level rooms, balconies and catwalks — because movement is fast and has to work for 10 players. Corridors are wide.
- **Exactly 3 main paths to each Tower**, each with a different character, for example:
  1. **Main hall** — normal gravity, wide, some long sightlines (where Wind-up Throws are strong).
  2. **Zero-G cargo shaft** — big open vertical space, floating cover, thruster play.
  3. **Wall-gravity engine corridor** — walk on walls/ceiling, tight angles, curving throws shine.
  - Small side connectors between paths are OK for rotations, but the 3 main paths must be obvious.
- **Every long sightline must have cover options and an alternative route,** so a single Wind-up Throw player can't lock down a whole path.
- **Mirror-symmetric** for fairness. Built from simple blocks (boxes, ramps, pillars) so it's cheap to render and easy to collide against.
- Each team has a **Tower** at the end of its half.
- **Watch in playtests:** a 5v5-sized map can feel empty in 1v1 (40 s rounds). If 1v1 rounds often time out, make the carrier reveal more frequent in 1v1 (e.g. every 3 s) before considering map changes.

### Round start: spawn lock (owner decision)
- Each team has ~8 mirrored spawn points on its side. Every round, each player is placed at a **random** spawn point on their side.
- Players are **locked in place for 5 seconds** before the round starts: they can look around (and see their team's positions and who has the Controller), but can't move, throw or use abilities. A big countdown shows on screen.
- Random spawns stop teams from pre-planning the exact same play every round and keep rounds fresh.

### Objective: Controller & Tower
Simple rules, deep strategy:
- At round start, **one player per team holds the Controller** (in 1v1, each player holds their own). By default it's assigned automatically; later the team can choose before the round.
- **Win the round** by either:
  1. **touching the enemy Tower while carrying the Controller**, or
  2. **eliminating every player on the enemy team.**
- **Controller drop:** if the carrier dies, the Controller drops where they died. Any **teammate** can pick it up (0.5 s pickup). Enemies can't pick it up, but they can camp it. If it's untouched for 8 s, it returns to the team's spawn.
- **Carrier reveal:** the carrier's position is shown to enemies through walls for 1 s every 5 s, so they can't hide all round. The carrier keeps all weapons (no speed penalty at first; tune in playtests).
- **Anti-camping, last 10 seconds:** every player is revealed through walls, so hiding to run out the clock doesn't work.
- **Timer runs out:** team with more players alive wins; if equal, higher total health wins; if still equal, the round is a draw (nobody scores).
- **Strategy this creates:** protect the carrier vs. hunt the carrier, fake pushes, splitting routes, sneaky solo Controller runs, and deciding when to go for the Tower vs. just win the fight.
- **Controller indicators (owner decision — always clear who has it):**
  - The carrier has a big glowing Controller on their back, in team color — anyone who sees them knows instantly.
  - A Controller icon floats above your teammate carrier at all times (through walls), and their name is marked on the HUD team list.
  - Enemy carrier: marked when in view, plus the reveal pulse through walls every 5 s.
  - Dropped Controller: icon through walls for its team, "Controller dropped" alert, and a return countdown.
- Tower touch effect ends the round instantly (big flash + sound).

### Match structure (fits the 10–15 minute cap)
Between rounds: ~5 s results + 5 s spawn lock = ~10 s. A round ends early on a Tower touch or full elimination, so most rounds are shorter than the timer.

| Mode | Round timer | Win the match | Max rounds | Worst-case length | Expected typical length |
|---|---|---|---|---|---|
| 1v1 | 40 s | First to 5 round wins | 8 | ~6.7 min | ~4 min |
| 2v2 | 1:00 | First to 6 round wins | 11 | ~13 min | ~7–9 min |
| 5v5 | 1:30 | First to 5 round wins | 9 | ~15 min | ~8–10 min |

- **Tied after max rounds** (possible because rounds can be draws): one **sudden-death round** — half the normal timer, both Towers' touch zones are twice as big, everyone is revealed from the start. If that is also a draw, the team with more total kills across the match wins.
- **Hard cap:** a match never runs past 15 minutes; if it somehow would, it ends by total round wins, then total kills.
- **Side swap** at the halfway point (even though maps are mirrored) so any small map unfairness evens out.
- The 1v1 cap is shorter than the others because of its 8-round max; the owner confirmed that's fine (10–15 min is a maximum, not a target).

### Fast, Apex-style movement (base layer)
Movement must feel **fast, fluid and momentum-based, like Apex Legends**. The owner explicitly asked for this, so it is a top priority to get right in milestone 2.
- **Sprint** by default-toggle (or hold), high base speed.
- **Slide:** crouch while sprinting → slide that keeps momentum; sliding down ramps **gains** speed; low friction.
- **Slide-jump:** jumping out of a slide keeps the slide speed.
- **Bunny hopping / momentum chaining:** landing and immediately jumping or sliding preserves most of your speed; little speed loss on well-timed landings.
- **Air strafing:** meaningful air control — steering with strafe keys + mouse can bend your path mid-air without losing speed (Source/Apex-style air acceleration). A **tap-strafe**-style sharp turn is a high-skill technique; keep it, but tune so it's not a free win.
- **Mantle & climb:** automatically vault over waist-high cover; short wall-climb up taller ledges.
- **Wall-bounce / wall-jump:** jump off walls to redirect momentum (limited per airtime).
- **Zip-rails** on maps for fast rotations (a ship's cargo rails).
- **Movement tech must work in all gravity directions** — e.g. slide along a wall in a wall-gravity corridor.
- All weapons can be used while sliding, jumping and wall-running — movement and shooting go together.
- Tune with numbers in one config file (speeds, friction, air accel, slide boost, jump height) and add a live tuning panel in dev mode so the owner can adjust feel while playing.

### Gravity movement (the core identity)
Every part of the ship has a **gravity vector** that affects players *and* slow projectiles:
- **Normal decks:** gravity pulls toward the floor (the Apex-style movement above).
- **Zero-G zones** (e.g. a central cargo bay with broken gravity generators): you float and keep momentum. You can push off walls and use short **suit-thruster bursts** (limited charges) to change direction.
- **Wall-gravity corridors:** gravity points into a wall or ceiling, so you walk on walls and fight upside-down enemies.
- **Gravity switches / pads:** shooting or stepping on them flips gravity in a room for a few seconds (map control).
- **Mag-boots:** in zero-G, press a key to stick to the nearest surface and re-orient onto it.
- Camera smoothly re-orients when gravity direction changes (fast, but not nauseating — include a "rotation speed" setting).

Skill ceiling comes from: Apex-style momentum tech (slide-hops, air strafing, wall-jumps), zero-G thruster control, wall-walking angles and gravity-flip timing.

Because players move very fast, maps need **wider corridors and more vertical space** than a slow shooter, and the netcode must handle fast-moving targets well (see Netcode).

### Combat: "Boomerang Fu, but first person"
The owner's reference is the party game **Boomerang Fu** (top-down; everyone has one boomerang; throw it, it comes back; slash up close; deflect incoming boomerangs; dash). Space YZ takes that core and adapts it to **first person + fast Apex-style movement + competitive ranked play**. **No recoil and no random spread** anywhere — every miss is the shooter's mistake or the target's outplay.

Everyone has **the same kit** every round — no loadouts, no economy:

| Slot | Item | Role |
|---|---|---|
| Main | **Boomerang** (one per player) | Throw, catch, slash, deflect — the heart of the game |
| Backup | **Laser** | Weak, limited sidearm for when your Boomerang is away |
| Throwable | **Gravity Grenade** | Utility; can be shot out of the air |
| Movement | **Dash** (+ Apex-style movement) | Dodge boomerangs, close gaps |

#### 1. The Boomerang (the signature weapon)
**Speed (owner decision): faster than Boomerang Fu.** The Boomerang is a fast, aggressive weapon — roughly **4–5× top sprint speed** (starting values: ~45 m/s Quick Throw, vs. ~9 m/s sprint and ~15 m/s peak slide-hop; the Wind-up Throw is much faster). The return trip is just as fast. It should feel like a weapon, not a lob. Dodging it relies on reading the thrower, the throw sound and the threat indicators, not on reacting once it's close.

**Two throw modes (owner decision)**

**A. Quick Throw** (the everyday throw)
- **Hold left mouse to aim, release to throw.** While aiming, the view **zooms in slightly** (e.g. FOV 100° → 90°) and the private path preview shows. You can move at full speed while aiming.
- **Curve:** the strafe key held on release sets the curve (A = left, D = right, none = straight out and back).
- It flies out, turns, and **homes back to your current position** (so where you move while it's out matters).
- It's affected by the **gravity zone** it flies through — bend it around corners using wall-gravity corridors or zero-G.
- Damage: headshot = kill, body = 50 (2 hits kill).

**B. Wind-up Throw** ("1 shot 1 kill" sniper throw)
- **Hold right mouse** (with the Boomerang in hand) to wind up. It takes **3 seconds** to fully wind up; the view **zooms in more** (e.g. FOV → 70°) and the Boomerang visibly spins faster and glows.
- While winding up you are **automatically slowed to a slow walk**. Sprinting, jumping, sliding, dashing, being airborne or **taking any damage cancels** the wind-up (start over).
- **Once fully wound**, press **left mouse** to throw: a **near-instant, straight, very fast** throw (~150 m/s) that **kills in one hit anywhere on the body**. Release right mouse to cancel.
- **The whole path is visible to ALL players** from the moment the wind-up starts: a bright line from the thrower along their aim, in their team color, that moves as they aim — like a sniper laser sight. Everyone knows where the sniper is and what they're covering. Loud charging sound in 3D audio.
- **Hold limit:** once fully wound you can hold it for **4 seconds max**; then it winds down and you must start again (stops endless corner-camping).
- After the shot, the Boomerang drops where it hits a wall, or returns normally if it doesn't hit anything; Lethal Recall works as usual.
- **Counterplay (built into the design):**
  - The visible line shows exactly which angle is held → take another of the 3 paths, or wait it out (4 s hold limit).
  - **Jump or slide over/under the line** when peeking — the sniper has to adjust aim in time.
  - **Curve a Quick Throw around the corner** into the sniper (they're slow and predictable while winding) — use the preview to line it up.
  - Any damage (Laser chip, grenade) cancels the wind-up.
- Friendly fire applies: the line is also visible to teammates so they don't walk through it.

**Throw path preview (owner decision — curving is too hard without it)**
- While you're aiming a Quick Throw, a **thin dotted line shows the predicted flight path** — out, the curve, and the return — including the A/D curve and gravity zones along the way. It updates live as you move, aim and change curve. (The Wind-up Throw instead shows its public straight line to everyone.)
- **Only the thrower sees it.** Enemies never see your preview (they get the normal threat indicators once it's actually thrown).
- Where the path hits a wall, show a small marker (that's where it would drop).
- While **steering** in flight, the preview updates to show the new path from the Boomerang's current position.
- It's computed with the same shared simulation code as the real throw, so the preview is exactly accurate (except for players moving into it).
- Settings: preview on/off, opacity. Keep it on by default in all modes, ranked included — the skill is in reading enemies, not doing geometry in your head.

**Steering (first-person feature, confirmed by owner — everyone always has it):** while your Boomerang is in flight, hold **right mouse** to steer it toward your crosshair. It turns at a limited rate and you have a small **steer meter** per throw (~0.5 s of steering). This is where aim skill lives — curving a disc around a pillar into someone's back. Tune the turn rate so it assists skilled throws but can't track a dodging player perfectly.

**Catching & retrieving (Boomerang Fu-style)**
- Catch it on its way back → ready to throw again instantly.
- If it **hits a wall or is deflected**, it **drops** where it landed. Walk over it to pick it up, or recall it (below).
- **While your Boomerang is away, you're vulnerable** — you can only use the Laser, grenade and dash. Throwing is always a risk/reward decision.

**Lethal Recall — R (owner's design, a signature mechanic)**
- Press **R** any time your Boomerang is away (in flight or dropped) and it **flies straight back to you, very fast** (faster than a throw), in a **straight line** from where it is to where you are.
- **It kills every enemy in that straight path instantly**, no matter where it hits them. This enables big outplays: throw past enemies (or leave it dropped behind them) and recall it through them.
- **Counterplay / balance (needed because it's a one-shot line):**
  - **Telegraph:** when you press R, the Boomerang glows and a bright line showing the recall path appears for **~0.3 s** before it launches — visible to everyone, with a loud distinct sound. Enemies get a moment to dash, jump or slide out of the line.
  - **Deflectable:** a well-timed slash stops it and drops it at the deflector's feet.
  - **Walls:** it passes through walls so you always get it back, but it **only kills players it passes with no wall in between** (no killing through walls).
  - **Teammates:** friendly fire is on — the recall **kills teammates in its path too**. Check the line before you press R.
  - **One recall per throw:** after recalling, the Boomerang is in your hand; no chaining.
  - The recall path is a straight line — no curve, no steering during recall.
- The telegraph length is the main tuning knob. If lethal recall kills are more than ~25–30% of all kills in playtests, make the telegraph longer; if nobody uses it, make it shorter.

**Slash & deflect (melee)**
- With the Boomerang **in hand**, press **melee** for a quick forward slash (short lunge, ~2 m range, 0.8 s cooldown).
- A slash that meets an incoming enemy Boomerang **deflects it** back the way it came (it becomes *yours* until it hits something or drops).
- **Deflecting is hard on purpose (owner decision)** — a skill play, not a routine defense:
  - You must be **facing the Boomerang**: it only counts if the Boomerang is within a **small angle of your crosshair** (starting value ±20°; tune between ~15° and ~25° — small, but not impossible).
  - **Tight timing:** the slash's active deflect window is short (~0.12 s), and the Boomerang must be within slash range during it.
  - **Whiffing costs you:** a slash that doesn't hit anything has its full 0.8 s cooldown, leaving you open.
  - Works on Quick Throws, Lethal Recalls and (in theory) Wind-up Throws — deflecting a Wind-up Throw is a highlight-reel read.
  - Netcode gives only a very small ping allowance so it stays hard but fair at 100 ms+.

**Clashes:** two Boomerangs that collide mid-air both drop. Shooting down a throw with your own throw is a skill play.

**Hits:** Boomerangs hit on the way out **and** on the way back.

#### 2. Laser (backup weapon)
- Straight beam, perfectly accurate, **low damage** — it exists so you're not helpless while your Boomerang is away, and for finishing weakened players. It must never outshine the Boomerang.
- **Visible warning:** pressing fire shows a thin targeting line (visible to everyone) for ~0.2 s, then fires along wherever you're aiming. The target gets a cue to juke.
- **3 charges**, each recharges slowly (~4 s). Headshot bonus.
- Can shoot down grenades.

#### 3. Gravity Grenade (throwable)
- Thrown in an arc (affected by gravity zones). Creates a **short gravity pull** (1.5 s) that drags players to its center, then pops for damage. 1 per round.
- **Can be shot or slashed out of the air**; it detonates where it's hit — hitting it near the thrower punishes them.
- Combo: pull an enemy → they can't juke → Boomerang them.

#### 4. Dash (confirmed by owner)
- Short, fast burst in your movement direction, ~3 s cooldown. Works in the air and in zero-G. No invulnerability — it's a dodge by moving out of the way.

#### Default controls (all rebindable)
| Input | Action |
|---|---|
| Left mouse | Hold to aim a Quick Throw (slight zoom + preview), release to throw. After a full Wind-up, press to fire the Wind-up Throw. **When the Boomerang is away, left mouse fires the Laser** — no weapon switching |
| Right mouse (hold) | Boomerang in hand: **Wind-up Throw** (3 s). Boomerang in flight: **steer** it |
| E | Slash / deflect |
| Q | Gravity Grenade |
| R | Lethal Recall (fast straight-line return that kills enemies in its path) |
| Shift | Dash |
| WASD / Space / Ctrl | Move / jump / crouch-slide (A/D on throw release also sets the curve) |

#### Damage & hits-to-kill (owner decision)
- **100 HP**, no regen during a round.
- **Boomerang headshot = 100 → one-hit kill** (any throw).
- **Wind-up Throw = instant kill** anywhere on the body.
- **Lethal Recall = instant kill** on any enemy in its path (see Lethal Recall).
- **Boomerang body hit = 50 → 2 hits kill** (e.g. out + back on the same throw).
- **Laser = 20 body / 35 head.** Slash = 50. Grenade = up to 40.
- Starting numbers only; all in one config file.
- Because a fast Boomerang can one-shot, the **head hitbox must be honest and not oversized**, and the awareness tools below are essential — a headshot kill should feel earned, never cheap.

#### Friendly fire (owner decision: ON for everything)
- Every damage source hurts teammates exactly like enemies: Boomerang (out, return, headshots), Lethal Recall, Laser, slash, grenade. A teammate killed by you counts as dead for the round (it can decide an elimination win).
- This adds strategy (spacing, not throwing through your own team, careful recalls) and it must be supported with good information:
  - Teammates always have a clear outline + name tag, visible through walls.
  - The thrower's path preview highlights a teammate in orange if the path passes through them; the recall telegraph line does the same.
  - Kill feed shows team kills clearly.
- **Anti-griefing (needed with friendly fire in ranked):**
  - A team kill never counts as a kill for the killer; it counts as a **team kill** stat.
  - Team kills in ranked cost the killer extra rating.
  - Automatic detection: e.g. 2 team kills in one match, or damaging your own Controller carrier repeatedly → warning; more → kicked from the match (counts as a loss) and a temporary ranked ban that grows with repeat offenses.
  - Report button on the scoreboard (reports saved for the owner to review).

#### No power-ups (owner decision)
Unlike Boomerang Fu, there are **no power-ups** in any mode. Every player always has exactly the same kit; the only differences are skill and teamwork.

#### First-person awareness (the main FPS adaptations)
Top-down games show you everything; first person doesn't. To keep deaths fair:
- **Threat indicators:** HUD arcs around the crosshair showing the direction of any enemy Boomerang heading toward you (including behind you), brightening as it gets closer.
- **3D audio:** every Boomerang has a loud, distinct spinning whistle that gets louder and higher-pitched as it approaches; the Laser warning has its own sound.
- **Glowing trails** on all Boomerangs in team colors.
- Wide default FOV (100°), adjustable.
- **"Your Boomerang" indicator:** always show where your own Boomerang is (in flight or on the ground).

#### No peeking mechanics (owner decision)
- **No lean / peek buttons** (no Q/E leaning like Rainbow Six) and no third-person camera. What you see is what your body sees.
- Netcode also keeps **"peeker's advantage"** small (capped lag compensation + ping equalization) so fast peeks around corners don't beat players holding an angle just because of network delay.

#### Visibility (owner decision: high, but not too high)
- Players are **easy to spot when in line of sight**: bright rim-light outline on enemies (team color), strong contrast against the darker ship walls, no camouflage.
- **But not a wallhack:** enemies are **not** visible through walls (except the Controller reveal pulses and the last-10-seconds reveal). Darker areas and cover exist so positioning and sneaking still matter.
- No pitch-black corners, no blinding lights, no heavy fog or particle clouds that hide players.
- **Fairness:** gameplay visuals are identical on every quality setting — low settings may remove decoration, but never anything that hides or reveals players differently. Brightness/gamma settings can't make dark areas brighter than a fixed limit.

#### Kill feedback (owner decision: very responsive and satisfying)
- **Instant hit feedback:** hit marker + hit sound play immediately on your screen when your Boomerang touches someone (client-predicted), then the kill is **confirmed by the server** within your ping.
- **Kill confirm:** a punchy, satisfying kill sound (distinct sounds for headshot, Wind-up kill, Lethal Recall kill, deflect kill), a crosshair flash, and the victim **shatters into glowing team-colored fragments**.
- **Multi-kills** (kills within ~3 s, or in one throw/recall): escalating sound + big on-screen text and effect — **DOUBLE**, **TRIPLE**, **QUAD**, **ACE** (whole enemy team in 5v5). A Lethal Recall that kills several players in one line gets its own special sound.
- Small screen shake on kills (toggleable). Kill feed with icons per kill type.
- Sound design is a priority: all effects must be short, crisp and never delayed.

### Combat balance: accuracy vs. fast movement (not a "CoD simulator")
**The problem:** with very fast movement, two things can go wrong:
- **"CoD simulator":** weapons hit instantly and kill in a fraction of a second. Whoever sees the other first wins, movement doesn't matter, players camp corners.
- **"Nobody can hit anything":** movement is so strong fights feel random and aim stops mattering.

**The goal:** *movement is your defense, prediction/steering is your offense, and both players get to play during a fight.*

| | CoD-style | Space YZ |
|---|---|---|
| Main damage | Instant hitscan | **Boomerang projectile** — predict, curve and steer |
| Instant weapon | Unlimited, strong | **Laser: weak, 3 charges, 0.2 s visible warning** |
| Kill speed | ~0.2–0.4 s, first to see wins | **2 body hits or 1 headshot** — from a projectile you can read, dodge or deflect |
| One-shot sniper | Invisible, instant | **Wind-up Throw: 3 s wind-up, slowed, path visible to everyone, 4 s hold limit** |
| Defense | Cover only | **Dodge, dash, deflect (hard), clash** |
| Accuracy | Recoil, spread, ADS | **Zero randomness** |
| Moving vs. standing | Standing/ADS is best | **Moving is better** — the only standing play (Wind-up) announces itself to everyone |
| Camping | Strong | **Weak**: curves/steering hit behind cover, grenades flush, objective forces pushes |

**Balancing rules:**
1. **Speed has a cost: predictability.** At top speed you can't stop instantly (momentum), so a player who reads your line can hit you. Air strafing bends your path but can't snap-turn at full speed.
2. **Throwing has a cost: vulnerability.** A missed throw means you're on the weak Laser until you catch, pick up or recall it. This is the central risk/reward decision, straight from Boomerang Fu.
3. **Shots are always readable.** Trails, whistle sounds, threat indicators, Laser warning line.
4. **Hitboxes stay honest.** Sliding shrinks your hitbox only slightly, so movement isn't a free dodge.
5. **No slow-on-hit.** Getting hit never slows you down.
6. **No shooter penalties for moving.** Equal accuracy while sliding, jumping or wall-running.
7. **Main tuning knobs:** steering turn rate and meter, head hitbox size, deflect window, max movement speed. The owner wants the Boomerang **fast**, so keep speed high and balance with the other knobs first — only lower speed as a last resort.
8. **No aim assist** (mouse-only game).

**How to tune it (part of milestones 3 and 6):**
- Record per-player stats in playtests: Boomerang hit %, deflect %, Laser hit %, average fight length, % of deaths from off-screen threats.
- Targets (average vs. average): Boomerang ~30–40% hits, average fight 1.5–3 s, off-screen deaths under ~20%.
- Track **Wind-up Throw kill %**. Target: roughly 10–20% of kills. Too high → longer wind-up, shorter hold limit, brighter line. Nobody uses it → shorter wind-up or longer hold.
- Track **deflect success %** — it should be a rare skill play (single-digit % of incoming Boomerangs for average players).
- Also track **headshot kill %**. If most kills are one-shot headshots, the game becomes "first to headshot wins" → shrink the head hitbox or reduce steering near heads.
- Hit % too low → stronger steering or slightly bigger body hitbox. Too high / fights under 1 s → weaker steering, smaller head hitbox, bigger deflect window (slower Boomerang only as a last resort). Too many off-screen deaths → stronger threat indicators or louder audio.
- The dev tuning panel exposes all of these values live.

## Technical architecture

**Language:** TypeScript everywhere. Monorepo using npm workspaces:

```
space-YZ/
  packages/
    shared/   # simulation: movement, gravity, collision, weapons, rules, network message types — used by BOTH client and server
    client/   # browser game (Vite + Three.js)
    server/   # Node.js game + matchmaking server
  tools/
    bots/     # headless bot clients for testing and load tests
```

**Shared deterministic simulation (most important design decision):**
- One simulation step `step(state, inputs, dt)` in `shared`, used by the server (authoritative) and the client (prediction).
- Fixed **60 Hz** tick. No `Math.random()` in the simulation (use a seeded RNG in the state).
- **Custom character controller:** capsule vs. level geometry (boxes/ramps), with a per-zone gravity vector. Keep the level collision simple (axis-aligned and oriented boxes) so it is fast and identical on client and server. Use a spatial grid or BVH for lookups.
- Laser = ray vs. player hitboxes (head + body capsules) and level boxes.
- Boomerangs and grenades are **simulated projectiles** in the shared sim, with swept-sphere collision so fast Boomerangs never pass through thin walls or players. Boomerang state machine: `held → flying-out → returning → dropped → recalling`, plus steer input, current owner (changes on deflect), gravity zone. Also simulate slash hit/deflect cones, Boomerang-vs-Boomerang clashes, and shootable grenade hitboxes.

**Client (simple but good graphics, runs on weak PCs):**
- **Three.js** (WebGL). Pointer Lock API with `unadjustedMovement: true` for raw mouse input.
- Art style: **low-poly, flat-shaded sci-fi** with strong colors — dark metal walls, bright emissive trim lines, team colors (e.g. cyan vs. orange) that are always easy to read. Lighting baked into vertex colors; no real-time shadows by default.
- Looks good cheaply via: emissive materials, subtle fog, optional bloom, glowing disc trails for the Boomerang (so everyone can read its curve), a crisp laser beam line, hit sparks.
- The Towers and the Controller must be instantly readable: bright team-colored glow, visible from far away.
- Performance: instanced meshes, very few draw calls, tiny textures (or none), **dynamic resolution scaling** to hold the frame rate, and a **"potato mode"** (50% render scale, no bloom, fewer particles).
- Budget: 60 FPS at 720p on a ~2015 laptop with integrated graphics; initial download under 5 MB.
- Rendering decoupled from simulation: render at display refresh rate, interpolate between sim ticks.
- Settings: mouse sensitivity, FOV, keybinds, volume, quality, camera rotation speed, crosshair customization.

**Server (on the owner's PC):**
- Node.js with WebSockets (`ws` to start; `uWebSockets.js` later if needed). The same server serves the built client files, so friends only need one URL.
- **Authoritative:** clients send only inputs (buttons, look angles, weapon actions, tick number). The server runs the simulation and decides hits, damage, kills and round results. Never trust the client.
- **60 Hz server tick**, snapshots at 30–60 Hz (configurable), compact binary encoding with delta compression.
- One Node process hosts many matches; design so matches can later be split across processes/machines.

**Storage:** SQLite for players, ratings and match history, stored in a `data/` folder next to the host app. **Avoid native npm modules** (e.g. `better-sqlite3`) because they break single-file packaging (see Hosting) — use Node's built-in `node:sqlite` if it's stable enough in the Node version used, otherwise a WebAssembly SQLite build. Same rule for every server dependency: pure JavaScript/WASM only.

**Accounts (keep simple for friends):** pick a nickname → server issues a random secret token stored in the browser. Offer "copy my login code" to move to another PC. No passwords, emails or personal data at this stage.

## Netcode and "smart ping equalization"

Critical for a competitive FPS. Build in this order:

1. **Client-side prediction + reconciliation** for your own movement, including gravity changes (your movement always feels instant). Also predict your own Boomerang throw and catch locally so it feels instant.
2. **Entity interpolation** for other players (~2 snapshots behind).
3. **Lag compensation:**
   - **Laser (hitscan):** the server keeps ~250 ms of hitbox history and rewinds to what the shooter saw. **Cap** rewind at ~150–200 ms so low-ping players aren't hit "behind cover" too often. The same rewind applies when a Laser shot targets a grenade.
   - **Boomerang & grenades (projectiles):** simulated by the server. When a player fires, the server spawns the projectile slightly "fast-forwarded" by part of that player's latency so it lines up with what they saw; everyone else sees it via interpolation. The catch check uses the server's position of the thrower, with a small forgiveness radius. **Deflects** are judged with the same rewind as the Laser (what the slasher saw), with a slightly generous window so parries still feel good at 100+ ms. Steering inputs are part of the normal input stream. **Lethal Recall** is simulated on the server as a very fast projectile with swept collision; the 0.3 s telegraph also hides network delay, so everyone sees the warning line before it can hit them. The **Wind-up Throw's public aim line** is sent to all clients every snapshot (it's part of the game state, not a cosmetic), and the 3 s wind-up means everyone sees it long before it can fire. **Kill feedback:** hit markers/sounds are predicted instantly on the shooter's client; kill effects play on server confirmation.
4. **Ping equalization (the "smart" part):**
   - Continuously measure each player's round-trip time and jitter.
   - Add a small **input delay buffer** to low-ping players so effective latency within a match is closer together — **capped** (e.g. max +30 ms) so it never feels sluggish.
   - Adaptive jitter buffer per client.
   - Show every player's ping on the scoreboard; matchmaking prefers similar ping when possible.
5. **Network simulator** in dev mode: latency, jitter and packet loss sliders to test 20 ms vs. 150 ms players on one PC.

Target: fair-feeling up to ~120 ms ping; playable up to ~200 ms.

## Ranked system

**Important consequence of "anyone can host":** each host's server keeps its **own** accounts, ranks and leaderboard (stored in its `data/` folder). A host controls their own database, so ranks from player-hosted servers can't be trusted as one worldwide ranking. For now that's fine (friends' servers). A true **global** ranked ladder later requires one central, trusted server run by the owner (paid hosting) — design the rating code so it can move there unchanged.

- **Rating math:** Glicko-2 per player per mode (1v1, 2v2, 5v5), hidden rating + rating deviation.
- **Teams:** team rating = team average; each player updated individually against the enemy team's average.
- **Visible tiers** (example, confirm names with owner): Cadet → Pilot → Lieutenant → Commander → Captain → Admiral → **Fleet Admiral** (top N players). 3 divisions per tier except the top.
- **Placement:** first 5 matches per mode are placements with larger rating changes.
- **Global rank:** weighted combination of the three mode ratings, weighted by games played in each mode. Shown as the headline rank on the profile.
- **Leaderboards:** per mode and global.
- **Anti-abuse:** leaving mid-match = loss; rating decay only for top tiers after inactivity; no rating changes in private matches.
- **Matchmaking:** queue per mode; closest rating first, widen the window over time; wide windows while the player base is just friends. Also **private rooms with a join code** (unranked).

## Hosting: close to 1-click (owner requirement)

Anyone — not just the owner — should be able to host a Space YZ server on their own PC **without installing Node, typing commands or touching router settings.** Players never install anything: they just open a link in Chrome.

**The host experience (target):**
1. Download **`SpaceYZ-Host.exe`** (one file) and double-click it.
2. First run only: Windows asks to allow it through the firewall → click **Allow**. (Unsigned app: Windows SmartScreen may show "More info → Run anyway"; code signing costs money, so skip it for now and explain this in the guide.)
3. The host app opens a **Host Dashboard** in the browser automatically, showing:
   - **"Play"** button (opens the game locally).
   - **Invite link** with a **Copy** button (and a QR code) — send it to friends, they click it and they're in.
   - Status lights: server running, players online, matches running, the host's measured upload speed, and a "how many players can this PC handle" estimate.
   - Simple controls: kick player, restart, stop server, toggle ranked on/off for this server.
4. Close the window / click Stop → server shuts down cleanly.

**How friends reach the host (automatic, in this order):**
1. **Same network (LAN):** the dashboard also shows a LAN link (`http://192.168.x.x:port`) — best ping.
2. **Automatic port forwarding via UPnP** (most home routers support it): the host app asks the router to open the port by itself and shows a direct `http://<public-ip>:port` invite link. Direct connection = lowest ping, best for a competitive game.
3. **Fallback: automatic Cloudflare quick tunnel** if UPnP isn't available: the host app runs `cloudflared` in "quick tunnel" mode (no account needed) and shows the `https://….trycloudflare.com` link. Adds some latency and is meant for small/casual use — show a note that ping may be a bit higher. Bundle `cloudflared` with the host app, or download it from its official GitHub release with checksum verification — **ask the owner** which before implementing.
- The dashboard clearly shows which method is active and why.

**How to build it:**
- The server + the built browser client are packaged into a **single executable** using Node's official **Single Executable Applications (SEA)** feature. This is why all server dependencies must be pure JS/WASM (no native modules).
- The client files are embedded in the executable and served by the same server (one port for game + website + WebSocket).
- `data/` folder (database, logs, settings) is created next to the exe. Auto-backup the database daily.
- **Host Dashboard** is a local web page, only reachable from the host PC (bound to `127.0.0.1`) and protected by a random token in its URL — never exposed to the internet.
- A GitHub Actions workflow builds `SpaceYZ-Host.exe` automatically for each release and attaches it to a GitHub Release (free). Windows first; Mac/Linux builds later.
- For development, `npm start` still works as before.

**Tell the host (in the dashboard and a 1-page guide):** the PC must stay on during games, and upload speed limits how many players it can serve. Measure real bandwidth per 1v1/2v2/5v5 match with the bot load test and put the numbers in the dashboard's estimate.

## Security basics

- Validate every input (rate limits, allowed ranges, one input per tick; Laser charges, steer meter, Wind-up timer/hold limit/movement limit, slash/dash cooldowns and grenade counts enforced server-side).
- Rate-limit connections/messages per IP; kick misbehaving clients.
- Don't send clients info they shouldn't have (e.g. enemy positions far outside view, when feasible).
- Keep dependencies minimal and pinned.
- Hosts open a port to the internet: the public server only exposes the game (static files + game WebSocket). The Host Dashboard and admin actions are localhost-only. Remove the UPnP port mapping when the host app closes.

## Milestones

Each milestone ends with something the owner can play. Commit to git after each.

1. **Scaffold** — monorepo, TypeScript, Vite + Three.js client, Node server, lint/format, README with "how to run". One command starts everything.
2. **Offline movement prototype** — first-person controller in a small test ship with **Apex-style movement**: sprint, slide, slide-jump, bunny-hop momentum, air strafing, mantle, wall-jump, zip-rail; plus normal gravity, zero-G room, wall-gravity corridor, mag-boots. Include a speedometer and the live tuning panel. **Tune feel with the owner** — this decides if the game is fun.
3. **Combat offline** — Boomerang first (Quick Throw with zoom + preview, Wind-up Throw with public line + hold limit, curve, steering, out-and-back hits, catch, drop/pick-up, **Lethal Recall with its telegraph line**, slash, deflect, clashes, gravity bending), plus threat indicators and 3D whistle audio. Then Dash, Laser (warning line, 3 charges, headshots), Gravity Grenade (arc, pull, shoot-down). No power-ups. Test against **bots that move fast using the real movement system** (slide-hopping, air strafing), not standing dummies — accuracy vs. movement is the key balance question. Show hit % and fight-length stats on screen. **Tune with the owner** — the Boomerang is the game's signature and may take several iterations.
4. **Online 1v1** — authoritative server, prediction, interpolation, private room with join code. Owner and a friend play over the local network.
5. **Objective, modes & rounds** — Controller & Tower rules (carrier, drop/pickup, return, reveal, Tower touch win, elimination win, time-out tiebreak), match structure from the Match structure table (round timers, first-to-N, max rounds, side swap, sudden death, 15-minute hard cap), scoreboard, results screen.
6. **Netcode quality** — lag compensation, ping equalization, network simulator, ping display.
7. **First real map** — one large, spacious spaceship map for all modes: all gravity zone types, two Towers, **3 main paths to each Tower**, mirrored random spawn points, cover on every long sightline, art pass in the low-poly style with the visibility rules. Test it in 1v1, 2v2 and 5v5.
8. **Accounts, ranked & matchmaking** — nickname + token, SQLite, Glicko-2 per mode, tiers, global rank, leaderboards, ranked queue.
9. **Low-end performance pass** — test on the weakest available PC, dynamic resolution, potato mode, bundle size check.
10. **1-click hosting** — single-file `SpaceYZ-Host.exe`, Host Dashboard (invite link, copy button, QR, status, controls), automatic LAN → UPnP → Cloudflare quick tunnel, GitHub Actions build, and a one-page "how to host" guide. **Test it on a clean Windows PC with nothing installed** and have the owner host a real session with friends.
11. **Polish** — sounds, hit effects, kill feed, settings screen, practice range, bots for practice.

## Testing

- Unit tests (Vitest) for movement, gravity zones, collision, combat (Boomerang curve/steer paths, catch, drop, Lethal Recall path kills (open line kills enemies and teammates, through-wall doesn't), friendly fire on all damage sources, throw preview matches the real flight path exactly, Wind-up Throw (3 s timer, slow-walk limit, cancel on damage/jump/slide, 4 s hold limit, one-hit kill), deflect angle/timing window and ownership change, spawn lock and random spawns, clashes, Laser charges and headshots, grenade shoot-down), Controller/Tower rules, round/match rules and rating math.
- **Determinism test:** same inputs replayed → same final state.
- **Bot clients** (headless) that join and play — used for full 5v5 tests and to measure how many matches the owner's PC can host.
- Manual playtests at simulated 20 / 80 / 150 / 200 ms ping.

## Out of scope for now (future options to mention to the owner)

- Paid hosting / multiple regions, real accounts with email/passwords, controller or mobile support, multiple characters/abilities, cosmetics, anti-cheat beyond server authority, voice chat, map editor.
