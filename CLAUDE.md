# Space YZ — notes for Claude sessions

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
