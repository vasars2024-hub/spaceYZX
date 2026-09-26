// LethalRecoil-Host: the one-click host app. Starts the game server (client files embedded in the
// .exe), opens the Host Dashboard, and makes the game reachable for friends (LAN link, UPnP
// port forwarding, or a Cloudflare quick tunnel). Also runs from source: `npm run host`.
//
// Flags: --port N   --no-open   --no-tunnel   --smoke (start, self-check, exit)
import path from 'node:path';
import { existsSync } from 'node:fs';
import { DEFAULT_PORT, GAME_NAME, PROTOCOL_VERSION } from '@space-yz/shared';
import { startGameServer } from '../app';
import { diskAssets, type AssetSource } from '../static';
import { findFreePort, openBrowser } from '../net-info';
import { createServices } from '../services';
import { quietSqliteWarning, backupDb } from '../services/db';
import { setupConnectivity, type ConnectivityStatus } from './connectivity';
import { startDashboard } from './dashboard';

export const VERSION = process.env.SPACEYZ_VERSION ?? 'dev';

interface SeaModule {
  isSea(): boolean;
  getAsset(key: string): ArrayBuffer;
}

const seaModule = (): SeaModule | null => {
  try {
    const s = process.getBuiltinModule('node:sea') as SeaModule | undefined;
    return s?.isSea() ? s : null;
  } catch {
    return null;
  }
};

/** Client files embedded in the executable (keys "client/<path>", listed in client/.files). */
export const seaAssets = (sea: SeaModule): AssetSource => {
  let files: Set<string>;
  try {
    files = new Set(
      (JSON.parse(Buffer.from(sea.getAsset('client/.files')).toString('utf8')) as string[]).map(
        (f) => f.replace(/^\/+/, ''),
      ),
    );
  } catch {
    files = new Set();
  }
  return {
    async read(urlPath) {
      const key = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
      if (!files.has(key)) return null;
      return Buffer.from(sea.getAsset(`client/${key}`));
    },
    describe: () => 'embedded files',
  };
};

/** Folder layout when running from source: find the repo root above this script. */
const findRepoRoot = (): string | null => {
  let dir = path.dirname(path.resolve(process.argv[1] ?? '.'));
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, 'packages', 'client'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
};

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

/** Start, check HTTP + WebSocket, exit (CI smoke test of the built .exe). */
const smoke = async (assets: AssetSource | null): Promise<void> => {
  const services = createServices({ dbFile: ':memory:', log: () => {} });
  const port = await findFreePort(47777);
  const server = await startGameServer({
    port,
    assets,
    services: services.hub,
    api: services.api,
    log: () => {},
  });
  const fail = (msg: string): never => {
    console.error(`SMOKE FAIL: ${msg}`);
    process.exit(1);
  };
  const health = (await (await fetch(`http://127.0.0.1:${server.port}/health`)).json()) as {
    ok: boolean;
    protocol: number;
  };
  if (!health.ok || health.protocol !== PROTOCOL_VERSION) fail('bad /health');
  if (assets) {
    const page = await fetch(`http://127.0.0.1:${server.port}/`);
    if (!page.ok || !(await page.text()).includes('<script')) fail('client page missing');
  }
  const hello = await new Promise<string>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    const t = setTimeout(() => reject(new Error('websocket timeout')), 5000);
    ws.onmessage = (ev) => {
      clearTimeout(t);
      ws.close();
      resolve(String(ev.data));
    };
    ws.onerror = () => reject(new Error('websocket error'));
  }).catch((e: Error) => fail(e.message));
  if (!hello.includes('"hello"')) fail('no hello from the game server');
  console.log(
    `SMOKE OK (${GAME_NAME} ${VERSION}, port ${server.port}, ${assets ? assets.describe() : 'no client'})`,
  );
  await server.close();
  services.close();
  process.exit(0);
};

const main = async (): Promise<void> => {
  quietSqliteWarning();
  const sea = seaModule();
  const root = sea ? null : findRepoRoot();
  const baseDir = sea ? path.dirname(process.execPath) : (root ?? process.cwd());
  const dataDir = process.env.SPACEYZ_DATA ?? path.join(baseDir, 'data');
  const clientDist = root ? path.join(root, 'packages', 'client', 'dist') : null;
  const assets: AssetSource | null = sea
    ? seaAssets(sea)
    : clientDist && existsSync(path.join(clientDist, 'index.html'))
      ? diskAssets(clientDist)
      : null;

  if (flag('smoke')) return smoke(assets);

  console.log(`\n  ${GAME_NAME} Host ${VERSION}\n`);
  if (!assets)
    console.log('  (The game files are missing. From source, run "npm run build" first.)\n');

  const services = createServices({ dbFile: path.join(dataDir, 'spaceyz.db') });
  const port = await findFreePort(Number(arg('port')) || DEFAULT_PORT);
  const server = await startGameServer({
    port,
    assets,
    services: services.hub,
    api: services.api,
    log: (m) => console.log(`  ${m}`),
  });
  services.queue.start(server.hub);
  const backup = () =>
    backupDb(services.db, path.join(dataDir, 'backups')).catch((e) =>
      console.error('  Backup failed:', e),
    );
  void backup();
  setInterval(backup, 24 * 3600_000).unref();

  let connectivity: ConnectivityStatus | null = null;
  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log('\n  Stopping… (closing the router port / tunnel)');
    setTimeout(() => process.exit(0), 5000).unref();
    await connectivity?.cleanup().catch(() => {});
    await dashboard.close().catch(() => {});
    await server.close().catch(() => {});
    services.close();
    process.exit(0);
  };

  const dashboard = await startDashboard({
    hub: server.hub,
    services,
    gamePort: server.port,
    connectivity: () => connectivity,
    onStop: () => void stop(),
    log: (m) => console.log(`  ${m}`),
    version: VERSION,
  });

  console.log(`  Play on this PC:    http://localhost:${server.port}`);
  console.log(`  Host dashboard:     ${dashboard.url}`);
  console.log('  (Keep this window open while people play. Close it or press Ctrl+C to stop.)\n');
  if (!flag('no-open')) openBrowser(dashboard.url);

  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
  process.on('SIGHUP', () => void stop()); // Windows: console window closed

  console.log('  Checking how friends can reach you…');
  connectivity = await setupConnectivity({
    port: server.port,
    dataDir,
    allowTunnel: !flag('no-tunnel'),
    log: (m) => console.log(`  ${m}`),
  });
  console.log(`\n  ${connectivity.reason}`);
  if (connectivity.publicUrl) console.log(`  Invite link for friends: ${connectivity.publicUrl}\n`);
  for (const u of connectivity.lanUrls) console.log(`  Same Wi-Fi: ${u}`);
};

main().catch((err) => {
  console.error(
    '\n  Lethal Recoil Host could not start:',
    err instanceof Error ? err.message : err,
  );
  console.error('  Press Ctrl+C to close this window.');
  setTimeout(() => process.exit(1), 60_000);
});
