# Hosting Space YZ on your PC

Your PC can be the game server for you and your friends. There is nothing to install.

## 1. Get the host app

1. Open the repository on GitHub and click **Releases** (on the right).
2. Download **SpaceYZ-Host.exe** from the newest release.
   (No release yet? Open **Actions → Host app**, click the newest green run, and download
   **SpaceYZ-Host-Windows** at the bottom. It's a zip with the .exe inside.)
3. Put it in its own folder, for example `Documents\SpaceYZ`. It will create a `data`
   folder next to itself for accounts, ranks and backups.

## 2. Start it

Double-click **SpaceYZ-Host.exe**.

- **"Windows protected your PC"** (SmartScreen) appears because the app isn't signed with a
  paid certificate. Click **More info → Run anyway**.
- **The firewall asks "Allow access?"** Tick **Private networks** (and **Public** if you
  want) and click **Allow**. Without this, friends can't connect.

A black window opens and your browser shows the **Host Dashboard**.

## 3. Invite friends

The dashboard's **Invite friends** box shows your invite link and a QR code. Click **Copy**
and send the link to your friends. They open it in Chrome — that's all.

The dashboard tells you how friends reach you:

| Light                              | Meaning                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🟢 **Direct (router port opened)** | Your router opened the port automatically. Best ping.                                                                                            |
| 🟢 **Cloudflare tunnel**           | Your router couldn't, so a free Cloudflare tunnel is used. Works everywhere; ping a little higher. The link changes each time you start the app. |
| 🔴 **Only your network**           | Only people on the same Wi-Fi can join (the "Same Wi-Fi" link).                                                                                  |

The Cloudflare helper (`cloudflared`) is downloaded automatically the first time it's
needed, from Cloudflare's official GitHub page, and its checksum is checked before it runs.

## 4. Play

Click **▶ Play** on the dashboard (or open `http://localhost:7777`).

## Good to know

- **Keep the PC on and the black window open** while people play. Closing the window (or
  **Stop server** on the dashboard) shuts everything down cleanly and closes the router port.
- **Upload speed matters most.** Click **Measure upload speed** on the dashboard to see how
  many matches your PC can host. Rough needs: 1v1 ≈ 0.2 Mbit/s, 2v2 ≈ 0.4 Mbit/s,
  5v5 ≈ 1.6 Mbit/s per match.
- **Ranked** can be switched off on the dashboard (private rooms still work).
- **Reports** from players show up on the dashboard. Accounts, ratings and reports live in
  `data\spaceyz.db`; a daily backup goes to `data\backups` (the last 7 days are kept).
- **Moving to another PC:** copy the whole folder, including `data`.

## Running from the source code instead

If you have the repository and Node.js installed:

```
npm install
```

```
npm run host
```

To build the .exe yourself (on Windows, it makes `build\host\SpaceYZ-Host.exe`):

```
npm run build:host
```

Useful switches for the .exe or `npm run host --`:
`--port 7777` (choose the port), `--no-tunnel` (never use Cloudflare), `--no-open` (don't open
the browser), `--smoke` (start, self-check and quit — used by the automatic tests).
