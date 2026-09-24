# Space YZ

A free, fast, first-person arena shooter set inside spaceships, where **gravity changes how you
move and shoot**. It runs in Google Chrome. Players never install anything; they open a link.

> Status: in development. See [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) for the full design.

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

To get the newest version later, run `git pull` and then `npm install` again.

## For developers

| Command          | What it does                                                                |
| ---------------- | --------------------------------------------------------------------------- |
| `npm start`      | Builds the client and runs one server (game files + WebSocket) on port 7777 |
| `npm run dev`    | Hot-reload dev mode: Vite on http://localhost:5173 plus the game server     |
| `npm run check`  | Lint + typecheck + tests (run before pushing)                               |
| `npm test`       | Unit tests (Vitest)                                                         |
| `npm run format` | Format all files with Prettier                                              |

Project layout:

```
packages/shared   deterministic simulation, rules, maps, protocol (used by client AND server)
packages/client   browser game (Vite + Three.js)
packages/server   Node.js game server, matchmaking, accounts, host app
tools/            bots, build scripts
docs/             design plan and guides
```
