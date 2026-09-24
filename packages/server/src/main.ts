// `npm start` / `npm run dev` entry point.
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT, GAME_NAME } from '@space-yz/shared';
import { startGameServer } from './app';
import { diskAssets } from './static';
import { findFreePort, lanAddresses, openBrowser } from './net-info';
import { createServices } from './services';
import { quietSqliteWarning, backupDb } from './services/db';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');
const dev = process.argv.includes('--dev');
/** Accounts, ratings and reports live here (override with SPACEYZ_DATA). */
const dataDir = process.env.SPACEYZ_DATA ?? path.resolve(here, '../../../data');

const main = async (): Promise<void> => {
  const wanted = Number(process.env.PORT) || DEFAULT_PORT;
  const port = await findFreePort(wanted);
  const assets = !dev && existsSync(clientDist) ? diskAssets(clientDist) : null;
  quietSqliteWarning();
  const services = createServices({ dbFile: path.join(dataDir, 'spaceyz.db') });
  const server = await startGameServer({ port, assets, services: services.hub, api: services.api });
  services.queue.start(server.hub);
  const backup = () =>
    backupDb(services.db, path.join(dataDir, 'backups')).catch((e) =>
      console.error('backup failed', e),
    );
  void backup();
  setInterval(backup, 24 * 3600_000).unref();

  const local = `http://localhost:${server.port}`;
  console.log(`\n  ${GAME_NAME} server is running.\n`);
  if (dev) {
    console.log(
      `  Dev mode: open the Vite link (http://localhost:5173). Game server on port ${port}.`,
    );
  } else {
    console.log(`  Play on this PC:        ${local}`);
    for (const ip of lanAddresses())
      console.log(`  Friends on your Wi-Fi:  http://${ip}:${server.port}`);
    if (port !== wanted)
      console.log(`  (Port ${wanted} was busy, so port ${port} is used instead.)`);
    console.log('\n  Press Ctrl+C to stop.\n');
    openBrowser(local);
  }

  const shutdown = (): void => {
    console.log('\n  Stopping server...');
    server
      .close()
      .then(() => services.close())
      .then(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
