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
  mirror-symmetric (`map.test.ts` checks maps flagged `symmetric`). Bots must be able to walk
  every route.
- Anti-cheat: server-side work is planned but comes only after the gameplay features; a
  Chrome extension will be required for ranked later (casual play stays install-free).
- Netcode: protocol/codec `packages/shared/src/net/`, prediction `client-core.ts`, server rooms
  `packages/server/src/game/room.ts`, lag compensation `lagcomp.ts`, LOS culling `visibility.ts`.
- Accounts/ranked/matchmaking: `packages/server/src/services/` (SQLite via `node:sqlite`).
- Host app + dashboard: `packages/server/src/host/`; exe build `tools/host/build-exe.ts`.
- Reports/benchmarks: `npm run balance`, `npm run matches`, `npm run load`, `npm run size`,
  `npm run netcheck` (hit registration + Boomerang prediction on a virtual network:
  `tools/netcheck/`; its tests must stay at 100% agreement up to 150 ms ping), `npm run map`
  (layout report + floor plans; its per-map setup `tools/map/maps.ts` must match the map).
- Lag compensation must judge against exactly what the client drew: the client draws others
  with `net/interp.ts` at quarter-tick render ticks, the server rewinds with the same code
  from the same network-rounded state. Change both together.
- Bump `PROTOCOL_VERSION` (`packages/shared/src/version.ts`) whenever the wire format changes.
