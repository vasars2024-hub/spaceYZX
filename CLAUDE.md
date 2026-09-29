# Lethal Recoil (formerly Space YZ) — notes for Claude sessions

- Full design and milestones: `docs/BUILD-PLAN.md`. The owner is not a professional developer:
  explain in plain language, one command per code block, Windows-friendly steps.
- Monorepo (npm workspaces): `packages/shared` (sim + rules + protocol), `packages/client`
  (Vite + Three.js), `packages/server` (Node + ws), `tools/`.
- Before pushing, run `npm run check` (lint + typecheck + tests) and `npm run format:check`.
  CI runs on ubuntu **and windows**; keep npm scripts cross-platform (no bash-only syntax).

## Simulation rules (packages/shared)

- `step()` runs at a fixed 60 Hz and must be **deterministic**: no `Math.random`, `Date.now`,
  `performance.now`, DOM or Node APIs (ESLint enforces this). Use the seeded RNG in world state.
- World state is plain JSON-serializable data (clone/hash/snapshot/rollback). No classes with
  hidden state.
- Every gameplay number lives in the config (`packages/shared/src/config/`). Weapons stay
  data-driven because the owner expects to change them after playtests.
- The client predicts with the same code the server runs; never fork simulation logic between
  them.

## Dependencies

- Pure JS/WASM only for anything the server ships (it is packaged as a single-file exe with Node
  SEA). No native modules. Pin exact versions (`.npmrc` has `save-exact`).
- TypeScript is pinned to 6.0.x because typescript-eslint does not support TS 7 yet.

## Where things are

- Match rules (Controller & Tower, rounds, collapse / sky-duel overtime):
  `packages/shared/src/rules/match.ts`; bomb mode `rules/bomb.ts`; loadouts (Boomerang kit vs
  CS guns) `config/loadout.ts`; server plug-in `packages/server/src/game/rules/match.ts`
  (anti-grief lives there too).
- Maps: `packages/shared/src/level/maps/`. `split-deck.ts` is the default competitive map and is
  **asymmetric** — its route timings are measured and must stay balanced
  (`tools/map/test/split-deck-timing.test.ts`, `npm run map -- split-deck`). `kestrel.ts` is
  mirror-symmetric (`map.test.ts` checks maps flagged `symmetric`). `orbital-ring.ts` is
  built from the owner's approved plan (map drafts, Layout 3), mirrored north ↔ south around
  z = 60 (its own test checks it), with launch pads, portals (`sim/devices.ts`) and zip-rails;
  its route timings have targets (`tools/map/test/orbital-ring-timing.test.ts`). Modes never
  mix: Tower mode has no plants, Bomb mode no Tower touches, Elimination neither. Bots must be
  able to walk every route.
- **Openness** (owner's rule): competitive maps play like CS maps — rooms, corridors, floors and
  partitions that isolate duels, never a flat hall with crates. `tools/map/openness.ts` measures
  it (watched floor area, directions a spot is seen from; report section 12 of `npm run map`)
  and `tools/map/test/openness.test.ts` holds every competitive map to `OPENNESS_TARGET`.
  Design notes per redesigned map: `docs/maps/`. Detached spawns: `SpawnDef.group` (a round
  spreads a team over its groups, `spawnOrder` in `rules/match.ts`).
- Anti-cheat: server-side work is planned but comes only after the gameplay features; a
  Chrome extension will be required for ranked later (casual play stays install-free).
- Netcode: protocol/codec `packages/shared/src/net/`, prediction `client-core.ts`, server rooms
  `packages/server/src/game/room.ts`, lag compensation `lagcomp.ts`, LOS culling `visibility.ts`.
- Accounts/ranked/matchmaking: `packages/server/src/services/` (SQLite via `node:sqlite`).
  Accounts (`accounts.ts`): guests by default; "secured" accounts add a username + password.
  **Security**: passwords are hashed with scrypt (`passwords.ts`, per-user salt, async so the
  game loop never waits, constant-time compare), and are **never logged, sent back or stored
  in plain text** (the same for recovery codes and session tokens: only hashes are stored).
  Auth runs over the game WebSocket (`account-handler.ts`, WSS behind Caddy in production);
  failed logins are rate-limited per address and per username (`limiter.ts`) and never say
  whether a username exists. The public JSON API (`/api/profile`, `/api/match`,
  `/api/players`) must only ever return public fields (tests check it). Friends / presence /
  invites / blocks: `social.ts`; profile stats: `profiles.ts` (+ `game/match-stats.ts`).
  Ranked is **Premier (Bomb, Boomerang kit, 3v3 default → 4v4/5v5 when enough search, map
  veto, seasons) + Premier CS (same with the CS kit, own rating, mode vote Bomb/Elimination
  before the veto) + Duels (1v1/2v2, one rating) + Race (parkour, 2–8 racers, seasons)
  only**, defined in `packages/shared/src/rating/ladders.ts`; no new ladders without the
  owner. Queues (`services/queue.ts`): multi-search, parties as one unit (`services/party.ts`,
  in memory), players-online thresholds + opening hours (`RankedStore.queueOpen`), the casual
  queue (`modes/casual-queue.ts`, bots fill casual only), live counts (`queueCounts`).
  Smaller teams play a smaller map: `LevelDef.sizeWalls` (`level/size-walls.ts`); rooms and
  clients build the level with `mapDefForSize(map, teamSize)`.
- Parkour races (owner-requested, race tracks `level/maps/race-*.ts` and surf maps
  `level/maps/surf-*.ts`, `rules/race.ts`, body logic `sim/race.ts`): Race ladder maths
  `rating/race.ts`; the Race queue, ranked race rooms, race results and server-side personal
  bests are in `services/` (`queue.ts`, `ranked.ts` `recordRace`, fed by `HubServices.onRaceEnd`).
  Race maps are **course data** (plain JSON, `level/course/`: element format in `types.ts`,
  `expandCourse`, the clipping check `findOverlaps`), written with the pen (`course/pen.ts`).
  Race movement (Source-style air-strafe, bhop, surf ramps = `BoxDef.prism` + `surf`) is gated
  on `LevelDef.race` in `sim/movement.ts` (`race*` config numbers); combat maps are untouched.
  Check a map with `npx tsx tools/race/time-tracks.ts` (bot runs) and `tools/race/check.ts`.
  Surf maps (Beginner/Intermediate, `MapInfo.mode`) are built on the measured movement profile
  (`npm run race:lab` → `docs/movement-map-design/movement-profile.md`, `course/profile.ts`)
  from curved ramps (`course/curve.ts`, exactly-joined `BoxDef.hull` prisms), gates, recovery
  anchors, red zones and turning portals: how-to in `docs/movement-map-design/BUILDING.md`.
- Transition cards + announcer: plans `packages/client/src/game/transitions.ts`, overlay
  `ui/transitions.ts` (`showTransition(kind, info)` for other HUDs), clips
  `packages/client/public/audio/announcer/*.ogg` played by `audio/announcer.ts` (own volume bus).
  The clips are **TTS placeholders** (Windows "Microsoft David" voice, rendered + processed by
  `npm run announcer` = `tools/audio/announcer.ts`); that voice's licence for commercial
  redistribution is unclear, so replace them with a recorded or licensed voice (same ids,
  `audio/announcer-lines.ts`) before a commercial launch.
- Ranked versus screen: `rating/versus.ts` (odds = the ladders' own expected-score maths),
  sent by `services/queue.ts` (`buildVersus`, read-only `RankedStore.versusLine`) as
  `{ t: 'versus' }` when a ranked room forms; client `ui/versus.ts`.
- Host app + dashboard: `packages/server/src/host/`; exe build `tools/host/build-exe.ts`.
- Rented server (Hetzner VPS, Docker + Caddy HTTPS, fixed domain; setup/update/DB-move scripts in
  `scripts/deploy/`, env settings `packages/server/src/prod/config.ts`): `docs/DEPLOY.md`.
- Reports/benchmarks: `npm run balance`, `npm run matches`, `npm run load`, `npm run size`,
  `npm run netcheck` (hit registration + Boomerang prediction on a virtual network:
  `tools/netcheck/`; its tests must stay at 100% agreement up to 150 ms ping), `npm run map`
  (layout report + floor plans; its per-map setup `tools/map/maps.ts` must match the map).
- Lag compensation must judge against exactly what the client drew: the client draws others
  with `net/interp.ts` at quarter-tick render ticks, the server rewinds with the same code
  from the same network-rounded state. Change both together.
- Bump `PROTOCOL_VERSION` (`packages/shared/src/version.ts`) whenever the wire format changes.
