// Starts everything `main.ts` runs (game server, accounts/ranked, matchmaking, database backups,
// optional host dashboard) and builds the clean-shutdown handler. Separate from main.ts so a
// test can start and stop a real server.
import path from 'node:path';
import { existsSync } from 'node:fs';
import { startGameServer, type GameServer } from '../app';
import { diskAssets } from '../static';
import { findFreePort } from '../net-info';
import { createServices, type Services } from '../services';
import { quietSqliteWarning, backupDb } from '../services/db';
import { startDashboard, type Dashboard } from '../host/dashboard';
import type { ConnectivityStatus } from '../host/connectivity';
import type { ServerConfig, makeLogger } from './config';
import { makeProxyTrust, forwardedClientIp } from './proxy';
import { createShutdown, delay } from './shutdown';

export type Logger = ReturnType<typeof makeLogger>;

export interface RunningServer {
  server: GameServer;
  services: Services;
  dashboard: Dashboard | null;
  /** Clean stop; resolves after `exit` was called. Safe to call more than once. */
  shutdown: (reason: string) => Promise<void>;
}

export const RESTART_NOTICE =
  'The server is restarting (usually for an update). Rejoin in a minute.';

export const runServer = async (
  cfg: ServerConfig,
  log: Logger,
  opts: { exit?: (code: number) => void; version?: string } = {},
): Promise<RunningServer> => {
  quietSqliteWarning();
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const port = cfg.strictPort ? cfg.port : await findFreePort(cfg.port);
  const assets =
    !cfg.dev && existsSync(path.join(cfg.clientDist, 'index.html'))
      ? diskAssets(cfg.clientDist)
      : null;
  if (!assets && !cfg.dev) log.warn(`Game files not found in ${cfg.clientDist} (build the client)`);

  const services = createServices({
    dbFile: path.join(cfg.dataDir, 'spaceyz.db'),
    log: log.info,
  });
  const trusted = makeProxyTrust(cfg.trustProxy);
  const server = await startGameServer({
    port,
    host: cfg.host,
    assets,
    services: services.hub,
    api: services.api,
    log: log.info,
    clientIp: cfg.trustProxy.length ? (req) => forwardedClientIp(req, trusted) : undefined,
  });
  services.queue.start(server.hub);

  const backupDir = path.join(cfg.dataDir, 'backups');
  let backupRunning: Promise<void> = Promise.resolve();
  const backup = () =>
    (backupRunning = backupDb(services.db, backupDir).then(
      (file) => log.debug(`Backup written: ${file}`),
      (e) => log.error(`Backup failed: ${String(e)}`),
    ));
  void backup();
  const backupTimer = setInterval(backup, cfg.backupHours * 3600_000);
  backupTimer.unref();

  let shutdown: (reason: string) => Promise<void> = async () => {};

  let dashboard: Dashboard | null = null;
  if (cfg.dashboard) {
    const status: ConnectivityStatus = {
      method: 'server',
      publicUrl: cfg.publicUrl,
      lanUrls: [],
      reason: cfg.publicUrl
        ? `Running on a rented server. Players join at ${cfg.publicUrl}. ("Stop server" restarts the game server.)`
        : 'Running on a server (PUBLIC_URL is not set).',
      cleanup: async () => {},
    };
    dashboard = await startDashboard({
      hub: server.hub,
      services,
      gamePort: server.port,
      connectivity: () => status,
      onStop: () => void shutdown('stop button on the dashboard'),
      log: log.info,
      version: opts.version,
      listen: { host: cfg.dashboard.host, port: cfg.dashboard.port },
      token: cfg.dashboard.token || undefined,
      localUrl: cfg.publicUrl ?? undefined,
    });
  }

  shutdown = createShutdown({
    hardTimeoutMs: cfg.shutdownNoticeMs + 8000,
    exit,
    log: log.info,
    steps: [
      {
        name: 'matchmaking',
        run: () => {
          services.queue.enabled = false;
          services.queue.stop();
          clearInterval(backupTimer);
        },
      },
      {
        name: 'tell players',
        run: async () => {
          if (!cfg.shutdownNoticeMs) return;
          let told = 0;
          for (const c of server.hub.conns)
            if (c.helloDone) {
              c.sendJson({ t: 'notice', msg: RESTART_NOTICE });
              told++;
            }
          if (told) await delay(cfg.shutdownNoticeMs);
        },
      },
      { name: 'dashboard', run: () => dashboard?.close() },
      { name: 'game server', run: () => server.close() },
      // closing SQLite folds the write-ahead log into spaceyz.db, so the file alone is complete
      {
        name: 'database',
        run: async () => {
          await backupRunning; // don't close the database under a running backup
          services.close();
        },
      },
    ],
  });

  return { server, services, dashboard, shutdown: (reason) => shutdown(reason) };
};
