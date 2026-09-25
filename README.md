# Space YZ

A free, fast, first-person arena shooter set inside spaceships, where **gravity changes how you
move and shoot**. It runs in Google Chrome. Players never install anything; they open a link.

> Status: all 11 build-plan milestones are in (playable, not yet playtested with people).
> Design: [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) · Hosting for friends:
> [`docs/HOSTING.md`](docs/HOSTING.md) · Playing guide: [`docs/PLAYING.md`](docs/PLAYING.md)

## What's in the game

- **Movement:** auto-sprint, slide and slide-jumps, bunny hops, air strafing, tap-strafe,
  wall-jumps, mantling, zip-rails, dash, zero-G push-offs and thrusters, mag-boots, and
  gravity that pulls into walls and ceilings.
- **Combat:** the Boomerang (curving throws, steering, Wind-up one-shot, Lethal Recall,
  slash and deflects), a Laser, and a Gravity Grenade.
- **Modes:** 1v1, 2v2 and 5v5 on **Kestrel**. You win rounds by carrying your Controller to
  the enemy Tower or by eliminating the other team.
- **Online:** private rooms with a 6-letter code, plus ranked matchmaking. Ranks go
  Asteroid → Moon → Planet → Gas Giant → Star → Supergiant → Galaxy, with leaderboards.
- **Offline:** matches vs bots (easy/normal/hard), a practice range with dummies, and a
  movement playground.
- **Weak laptops:** Potato mode and automatic resolution scaling; the first download is about
  0.2 MB of compressed code.

## Play it on your PC (Windows)

You need **Node.js** (version 22.12 or newer; version 24 is recommended) and **Git**. Both are
free installers from their websites.

Open **PowerShell** (press Start, type `powershell`, press Enter) and run these commands one at
a time.

1. Download the game code (only needed once):

   ```
   git clone https://github.com/vasars2024-hub/spaceYZX.git
   ```

2. Go into the folder:

   ```
   cd spaceYZX
   ```

3. Install the building blocks (only needed once, and again after updates):

   ```
   npm install
   ```

4. Start the game:

   ```
   npm start
   ```

Your browser opens the game automatically. The window also prints a **"Friends on your Wi-Fi"**
link that people on the same network can open. Press **Ctrl+C** in the window to stop.

**Want friends outside your house to join?** Use the host app instead. It opens a dashboard
with an invite link and QR code:

```
npm run host
```

Or download **SpaceYZ-Host.exe** from the Releases page — see [`docs/HOSTING.md`](docs/HOSTING.md).

To get the newest version later, run `git pull` and then `npm install` again.

## For developers

| Command              | What it does                                                                        |
| -------------------- | ----------------------------------------------------------------------------------- |
| `npm start`          | Builds the client and runs one server (game files + WebSocket) on port 7777         |
| `npm run dev`        | Hot-reload dev mode: Vite on http://localhost:5173 plus the game server             |
| `npm run host`       | The host app from source: server + Host Dashboard + UPnP / Cloudflare tunnel        |
| `npm run build:host` | Builds `build/host/SpaceYZ-Host(.exe)` (one file, game embedded)                    |
| `npm run check`      | Lint + typecheck + tests (run before pushing)                                       |
| `npm test`           | Unit tests (Vitest)                                                                 |
| `npm run format`     | Format all files with Prettier                                                      |
| `npm run balance`    | Bot-vs-bot combat metrics vs the design targets                                     |
| `npm run matches`    | Full bot matches per mode on Kestrel (round length, how rounds end)                 |
| `npm run netcheck`   | Hit registration + Boomerang consistency at 0–200 ms ping (virtual network)         |
| `npm run map`        | Map report: floor plans, sightlines, lane timings, spawn safety (`tools/map/out`)   |
| `npm run load`       | Server CPU per tick and bandwidth per player, per mode                              |
| `npm run size`       | Fails if the first download is over 5 MB                                            |
| `npm run bench`      | Browser frame-time benchmark with CPU throttling (needs Playwright; see the script) |
| `npm run tour`       | Plays every feature in a browser and saves screenshots (needs Playwright)           |
| `npm run indicators` | Browser check of name tags, markers and HUD indicators (needs Playwright)           |

**Hit registration.** What you hit on your screen counts, and what you miss doesn't: the
server judges every Laser shot, slash, Boomerang and deflect against exactly the frame the
shooter saw (up to 175 ms of ping). `npm run netcheck` plays scripted duels against the real
server over a simulated network and compares, shot by shot, the shooter's screen with the
server's verdict (the same checks run in `npm test`).

In the game, the `` ` `` key opens the live tuning panel (offline modes). **Copy values** there
puts every movement/combat number on the clipboard.

Project layout:

```
packages/shared   deterministic simulation, rules, maps, protocol (used by client AND server)
packages/client   browser game (Vite + Three.js)
packages/server   Node.js game server, rooms, lag compensation, accounts (SQLite), ranked,
                  matchmaking, anti-grief, host app + dashboard
tools/            headless bots, balance/match reports, perf tools, host exe build
docs/             design plan, hosting guide, playing guide
```
