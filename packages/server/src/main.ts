// `npm start` / `npm run dev` entry point, and the server inside the Docker image on a rented
// server (NODE_ENV=production). Settings come from environment variables: see prod/config.ts
// and docs/DEPLOY.md.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT, GAME_NAME } from '@space-yz/shared';
import { lanAddresses, openBrowser } from './net-info';
import { readServerConfig, makeLogger, ConfigError } from './prod/config';
import { runServer } from './prod/run';

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION = process.env.SPACEYZ_VERSION ?? 'dev';

const main = async (): Promise<void> => {
  const cfg = readServerConfig(process.env, process.argv, {
    // Accounts, ratings and reports live here (override with SPACEYZ_DATA).
    dataDir: path.resolve(here, '../../../data'),
    clientDist: path.resolve(here, '../../client/dist'),
    port: DEFAULT_PORT,
  });
  const log = makeLogger(cfg.logLevel, cfg.production);
  const { server, dashboard, shutdown } = await runServer(cfg, log, { version: VERSION });

  process.on('SIGINT', () => void shutdown('Ctrl+C'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGHUP', () => void shutdown('SIGHUP'));

  if (cfg.production) {
    log.info(
      `${GAME_NAME} ${VERSION} listening on ${cfg.host}:${server.port}` +
        (cfg.publicUrl ? ` (players: ${cfg.publicUrl})` : '') +
        (dashboard ? `; dashboard on ${cfg.dashboard!.host}:${dashboard.port}` : ''),
    );
    return;
  }

  const local = `http://localhost:${server.port}`;
  console.log(`\n  ${GAME_NAME} server is running.\n`);
  if (cfg.dev) {
    console.log(
      `  Dev mode: open the Vite link (http://localhost:5173). Game server on port ${server.port}.`,
    );
  } else {
    console.log(`  Play on this PC:        ${local}`);
    for (const ip of lanAddresses())
      console.log(`  Friends on your Wi-Fi:  http://${ip}:${server.port}`);
    if (server.port !== cfg.port)
      console.log(`  (Port ${cfg.port} was busy, so port ${server.port} is used instead.)`);
  }
  if (dashboard) console.log(`  Host dashboard:         ${dashboard.url}`);
  console.log('\n  Press Ctrl+C to stop.\n');
  if (cfg.openBrowser) openBrowser(local);
};

main().catch((err) => {
  console.error(err instanceof ConfigError ? `Configuration error: ${err.message}` : err);
  process.exit(1);
});
