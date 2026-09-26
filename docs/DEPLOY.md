# Moving Lethal Recoil to a rented server

Today the game runs on your PC and friends join through a Cloudflare link that changes every
time you restart. After this move the game runs on a small rented computer in a data centre
(a "server" or "VPS"), 24 hours a day, at a fixed address like **https://yourgame.com**.

You do the parts that need your name and payment (steps 1–4, about 30 minutes). Claude does the
technical part (step 5).

---

## What it costs (prices checked September 2026, before VAT)

| What                                    | Price                               | Notes                                            |
| --------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| Hetzner **CX23** server (2 CPU, 4 GB)   | **€5.49 / month**                   | Nuremberg, Falkenstein or Helsinki               |
| Its IPv4 address                        | €0.50 / month                       | always needed (players reach the server with it) |
| Hetzner backups (optional, recommended) | +20 % of the server = €1.10 / month | a full copy of the server every day, last 7 kept |
| Domain name **.com**                    | about **$10.50–11 / year**          | Cloudflare Registrar or Porkbun                  |
| Domain name **.gg** or **.io**          | about **$52 / year**                | nice for games, but five times the price of .com |
| **Total with a .com**                   | **about €7 / month + $11 / year**   | roughly $9–10 a month — far below the $50 budget |

- If **CX23 is "not available"** when you order (Hetzner sometimes runs out), pick **CAX11**
  (€5.99, same size, ARM processor — the game works on it) or **CX33** (€8.49, twice as big).
  Avoid CPX22 (€19.49): it costs 3× as much since Hetzner's June 2026 price change, for no
  benefit to this game.
- Hetzner shows prices without VAT; if you live in the EU your country's VAT is added.
- Hetzner bills by the hour, with the monthly price as the maximum. Deleting a server stops
  the cost.

### How many players does one server handle?

The game server does all its work on **one CPU core** (60 updates per second per match).
Measured with `npm run load` (September 2026, on a Ryzen 3 7320U laptop core, which is about as
fast as a Hetzner shared core):

| Match type | CPU per match per update | Matches on one core (70 % load) | Players |
| ---------- | ------------------------ | ------------------------------- | ------- |
| 1v1        | 0.6 ms                   | ~19                             | ~38     |
| 2v2        | 0.8 ms                   | ~14                             | ~56     |
| 5v5        | 1.5 ms                   | ~7                              | ~70     |

So plan with **about 40–70 players playing at the same time** (bots in a match count like
players). Internet traffic is no problem: a full 5v5 match sends about 1.2 Mbit/s, and the
server includes 20 TB per month. The second CPU core is used by the HTTPS front door (Caddy)
and the system. A bigger server type does **not** raise this limit much (one core does the game
work); when you get close to it, ask Claude about running several game processes.

### A second server in America?

Not now. Players in the US East reach Nuremberg with about 90–110 ms ping, which the game's lag
compensation handles (it is tested up to 150 ms). Also, a second server would today have its own
separate accounts and ratings. Hetzner's US servers also became expensive in 2026 (the smallest
in Ashburn, CPX11, is €17.49 a month); if you want one later, cheaper options are Vultr or
DigitalOcean (about $6 a month in New York / New Jersey). Ask Claude first: sharing accounts
between two servers needs some programming.

---

## Step 1 — Buy the domain (10 minutes)

The domain is the address players type. Pick a registrar that charges the same price every
year (no cheap first year followed by an expensive renewal):

- **Cloudflare Registrar** (cloudflare.com → sign up → _Domain Registration → Register
  Domains_) — sells at cost, e.g. .com ≈ $10.50 per year. Includes free DNS.
- **Porkbun** (porkbun.com) — .com $11.08, .gg / .io $51.80 per year. Includes free DNS.
- **Namecheap** — fine too, but the renewal after the first year is higher.

Search for your name, buy it for 1 year (turn on auto-renew), and keep the "WHOIS privacy"
option on (it's free). You don't need any extra like e-mail or website hosting.

## Step 2 — Make an SSH key on your PC (5 minutes)

An SSH key is a pair of files that lets your PC (and Claude working on your PC) log in to the
server safely — no password to steal. Open **PowerShell** (Start menu → type _PowerShell_) and
run:

```
ssh-keygen -t ed25519 -C "lethal-recoil"
```

- "Enter file in which to save the key": just press **Enter**.
- "Enter passphrase": press **Enter** twice (no passphrase), so Claude can use the key for you.
  The key never leaves your PC; keep your PC's Windows login protected.

Now show the public half (the part you may give to others):

```
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

It is one line starting with `ssh-ed25519`. Keep this window open; you'll copy the line in
step 3.

## Step 3 — Rent the server at Hetzner (15 minutes)

1. Go to **hetzner.com/cloud** → **Sign up**. Hetzner checks new customers: you may need to
   confirm your ID or pay a small first amount. That can take from minutes to a day.
2. In the **Hetzner Console**, create a **Project** (name: _Lethal Recoil_), open it and click
   **Add server** (or _Create resource → Server_).
3. Choose:
   - **Location:** _Nuremberg_ or _Falkenstein_ (Germany; best for all of Europe) — Helsinki if
     those are sold out.
   - **Image:** **Ubuntu 24.04**.
   - **Type:** _Shared vCPU_ → **x86 (Intel/AMD)** → **CX23**. (Sold out? **CAX11** under
     _Arm64_, or **CX33**.)
   - **Networking:** keep **Public IPv4** and **Public IPv6** ticked.
   - **SSH keys:** **Add SSH key** → paste the `ssh-ed25519 …` line from step 2 → name it
     _my PC_ → it's selected.
   - **Volumes, Firewalls, Placement groups, Labels, Cloud config:** leave empty (Claude sets up
     a firewall on the server itself).
   - **Backups:** tick it (recommended, +20 %).
   - **Name:** `lethal-recoil`.
4. Click **Create & Buy now**. After about 30 seconds the server shows an **IPv4 address**
   like `203.0.113.10`. Write it down.

## Step 4 — Point the domain to the server (5 minutes)

At the place where you bought the domain, open its **DNS** settings and add two records (delete
any existing "parking" A records for `@` and `www` first):

| Type | Name  | Value / Points to          | TTL  |
| ---- | ----- | -------------------------- | ---- |
| A    | `@`   | your server's IPv4 address | Auto |
| A    | `www` | the same IPv4 address      | Auto |

- On **Cloudflare**: set **Proxy status** to **DNS only** (grey cloud), not "Proxied".
- Optional: an **AAAA** record for `@` with the server's IPv6 address (shown in Hetzner).
- It usually works within minutes, sometimes up to an hour. You can check in PowerShell:
  `Resolve-DnsName yourgame.com` — it should show your server's IP.

## Step 5 — Tell Claude

Send Claude:

- the server's **IP address**, and
- the **domain**.

Claude then (you don't need to type anything):

1. Makes sure the deployment files are pushed to GitHub (branch `claude/new-session-gr9eqy`).
2. Logs in and runs the one-time setup (about 10 minutes):
   `scripts/deploy/setup-server.sh` — updates Ubuntu, turns on automatic security updates,
   creates the login user **lethal**, switches SSH to key-only and root login off, installs
   Docker, turns on the firewall (only ports 22, 80, 443 open), downloads the game, creates a
   random dashboard password, and starts the game with HTTPS.
3. **Moves your players over**: when you're ready, stop the game on your PC; Claude runs
   `scripts\deploy\upload-database.ps1`, which copies `data\spaceyz.db` (all accounts,
   ratings, match history, reports and bans) to the server. The server keeps its own previous
   database as `replaced-<date>.db`, so nothing is ever lost.
4. Checks that **https://yourgame.com** works — that's the new link to give your friends. It
   never changes again.

---

## Everyday use

### Open the Host Dashboard (kick/ban, reports, ranked on/off)

The dashboard is **not on the internet** — it is only reachable from inside the server, through
your SSH key, and it also needs its own long random password. From the game folder on your PC:

```
powershell -ExecutionPolicy Bypass -File scripts\deploy\open-dashboard.ps1 -Server 203.0.113.10
```

(use your IP). It opens the dashboard in your browser; keep the PowerShell window open while you
use it and press Enter there when you're done. "Stop server" on the server's dashboard restarts
the game server (it comes back by itself within seconds).

### Update the game to the newest version

Ask Claude "update the server", or run:

```
ssh lethal@203.0.113.10 /opt/lethal-recoil/scripts/deploy/update.sh
```

The new version is built while the old one keeps running; then players see a "server
restarting" message and the game is gone for about 5 seconds. If the new version doesn't start
properly, the script puts the old one back automatically.

- `update.sh --when-idle` waits (up to an hour) until no match is running.
- `update.sh --rollback` goes back to the version before the last update.

A match that is running during a restart ends without a result (nobody's rating changes).

### Restarts and problems

- The game and HTTPS start automatically when the server starts, and restart by themselves if
  they ever crash.
- The server installs security updates by itself every day and restarts at **05:00 (server
  time, UTC)** only when an update requires it.
- Restart the game by hand: `ssh lethal@<ip> "cd /opt/lethal-recoil/deploy && docker compose restart game"`
- See what the game server is doing: `ssh lethal@<ip> "cd /opt/lethal-recoil/deploy && docker compose logs --tail 100 game"`
- Logs are limited to 50 MB per program, so they can't fill the disk.

### Backups

Two layers:

1. **The game's own backups:** once a day the game copies its database to
   `/var/lib/lethal-recoil/backups/` on the server (the last 7 days are kept).
2. **Hetzner Backups** (if ticked in step 3): a copy of the whole server every day, restorable
   from the Hetzner Console with one click.

To keep a copy on your PC too (e.g. once a month), in PowerShell:

```
scp lethal@203.0.113.10:/var/lib/lethal-recoil/backups/spaceyz-2026-10-01.db .
```

(use a date that exists: `ssh lethal@203.0.113.10 ls /var/lib/lethal-recoil/backups`).

### Where things are on the server

| What                          | Where                                    |
| ----------------------------- | ---------------------------------------- |
| Game code (from GitHub)       | `/opt/lethal-recoil`                     |
| Settings + dashboard password | `/opt/lethal-recoil/deploy/.env`         |
| Player database               | `/var/lib/lethal-recoil/spaceyz.db`      |
| Daily database backups        | `/var/lib/lethal-recoil/backups/`        |
| HTTPS certificates (Caddy)    | Docker volume `lethal-recoil_caddy_data` |

---

## For Claude: technical notes

- Files: `Dockerfile` (+ `.dockerignore`), `deploy/docker-compose.yml`, `deploy/Caddyfile`,
  `deploy/env.example`, `scripts/deploy/setup-server.sh`, `update.sh`, `import-database.sh`,
  `upload-database.ps1`, `open-dashboard.ps1`; bundling `tools/deploy/bundle-server.ts`;
  server settings `packages/server/src/prod/config.ts` (env variables listed at the top).
- The deploy files must be on GitHub (branch `claude/new-session-gr9eqy`) before setup; the
  server clones from `https://github.com/vasars2024-hub/spaceYZX.git` (public; if the repo
  becomes private, add a read-only deploy key on the server and use the SSH clone URL).
- Setup, with the owner's IP and domain (first login is as root; accept the new host key once):

  ```
  ssh -o StrictHostKeyChecking=accept-new root@IP "curl -fsSL https://raw.githubusercontent.com/vasars2024-hub/spaceYZX/claude/new-session-gr9eqy/scripts/deploy/setup-server.sh -o /root/setup-server.sh && bash /root/setup-server.sh DOMAIN"
  ```

  Afterwards log in as `lethal@IP` (root login is off). Database move (owner stopped the PC
  host first): `powershell -ExecutionPolicy Bypass -File scripts\deploy\upload-database.ps1 -Server IP -Force`.
  Check: `curl https://DOMAIN/health`.

- Both containers use `network_mode: host`: Caddy sees real client IPv4/IPv6 addresses; the
  game (127.0.0.1:7777) trusts `X-Forwarded-For` only from loopback (`TRUST_PROXY=loopback`);
  the dashboard listens on 127.0.0.1:7778 with `DASHBOARD_TOKEN`, reached by `ssh -L
7778:127.0.0.1:7778` (the local port must match: the dashboard checks the Host header).
- SIGTERM: matchmaking stops, players get a notice, 2 s later connections close and SQLite is
  closed (WAL folded in); compose gives 20 s. Backups: every `BACKUP_HOURS` (24), last 7 kept.

## Price sources (checked 26 September 2026)

- Hetzner cloud prices after the 15 June 2026 change (CX23 €5.49, CAX11 €5.99, CX33 €8.49,
  CPX22 €19.49, Ashburn CPX11 €17.49; all without VAT):
  <https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/>
- Hetzner IPv4 €0.50/month, IPv6 free:
  <https://docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing/>
- Hetzner backups +20 %, plans and locations: <https://www.hetzner.com/cloud/>,
  <https://costgoat.com/pricing/hetzner>
- Domain prices: <https://porkbun.com/products/domains>,
  <https://domaindetails.com/registrars/cheapest> (Cloudflare Registrar at cost ≈ $10.44–10.46
  for .com; the .com wholesale price rises to $10.97 on 1 November 2026)
- Vultr / DigitalOcean: <https://getdeploying.com/digitalocean-vs-vultr>
