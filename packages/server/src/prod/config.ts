// Settings for `main.ts` (npm start / the Docker server), read from environment variables so a
// rented server can be configured without code changes. Pure function: easy to test.
//
//   NODE_ENV=production   fixed port (no "next free port"), no browser, timestamped logs
//   PORT                  game port (default 7777)
//   HOST                  address to listen on (default 0.0.0.0; 127.0.0.1 behind a proxy)
//   SPACEYZ_DATA          folder for spaceyz.db and backups/ (default: <repo>/data)
//   CLIENT_DIST           folder with the built game files (default: packages/client/dist)
//   PUBLIC_URL            the address players use, e.g. https://lethalrecoil.com (dashboard)
//   LOG_LEVEL             debug | info | warn | error (default info)
//   TRUST_PROXY           who may tell us a player's real address in X-Forwarded-For:
//                         "loopback" or a comma list of IPs / CIDRs (default: nobody)
//   DASHBOARD_PORT        start the host dashboard on this port (default: off; the desktop
//                         host app has its own). DASHBOARD_HOST defaults to 127.0.0.1.
//   DASHBOARD_TOKEN       the dashboard password (at least 32 characters). Required with
//                         DASHBOARD_PORT in production.
//   BACKUP_HOURS          how often the database is backed up (default 24)
//   SHUTDOWN_NOTICE_MS    after SIGTERM, how long players see "restarting" before the server
//                         closes (default 2000 in production, 0 otherwise)

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export interface ServerConfig {
  production: boolean;
  dev: boolean;
  port: number;
  host: string;
  /** production: fail if the port is busy instead of trying the next one */
  strictPort: boolean;
  openBrowser: boolean;
  dataDir: string;
  clientDist: string;
  publicUrl: string | null;
  logLevel: LogLevel;
  trustProxy: string[];
  dashboard: { host: string; port: number; token: string } | null;
  backupHours: number;
  shutdownNoticeMs: number;
}

export class ConfigError extends Error {}

const MIN_TOKEN_LENGTH = 32;

const int = (
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number => {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new ConfigError(`${name} must be a whole number from ${min} to ${max} (got "${raw}")`);
  return n;
};

export const readServerConfig = (
  env: Record<string, string | undefined>,
  argv: string[],
  defaults: { dataDir: string; clientDist: string; port: number },
): ServerConfig => {
  const production = env.NODE_ENV === 'production';
  const dev = argv.includes('--dev');
  const port = int(env, 'PORT', defaults.port, 1, 65535);

  const logLevel = (env.LOG_LEVEL?.trim().toLowerCase() || 'info') as LogLevel;
  if (!LEVELS.includes(logLevel))
    throw new ConfigError(`LOG_LEVEL must be one of ${LEVELS.join(', ')} (got "${env.LOG_LEVEL}")`);

  let publicUrl = env.PUBLIC_URL?.trim() || null;
  if (publicUrl) {
    if (!/^https?:\/\/[\w.:[\]-]+\/?$/.test(publicUrl))
      throw new ConfigError(`PUBLIC_URL must look like https://example.com (got "${publicUrl}")`);
    publicUrl = publicUrl.replace(/\/$/, '');
  }

  const trustProxy = (env.TRUST_PROXY ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let dashboard: ServerConfig['dashboard'] = null;
  if (env.DASHBOARD_PORT?.trim()) {
    const dport = int(env, 'DASHBOARD_PORT', 0, 1, 65535);
    if (dport === port) throw new ConfigError('DASHBOARD_PORT must differ from PORT');
    const token = env.DASHBOARD_TOKEN?.trim() ?? '';
    if (token && (token.length < MIN_TOKEN_LENGTH || !/^[\w-]+$/.test(token)))
      throw new ConfigError(
        `DASHBOARD_TOKEN must be at least ${MIN_TOKEN_LENGTH} letters/digits (- and _ allowed)`,
      );
    if (!token && production)
      throw new ConfigError('DASHBOARD_TOKEN is required when DASHBOARD_PORT is set');
    dashboard = { host: env.DASHBOARD_HOST?.trim() || '127.0.0.1', port: dport, token };
  }

  return {
    production,
    dev,
    port,
    host: env.HOST?.trim() || '0.0.0.0',
    strictPort: production,
    openBrowser: !production && !dev,
    dataDir: env.SPACEYZ_DATA?.trim() || defaults.dataDir,
    clientDist: env.CLIENT_DIST?.trim() || defaults.clientDist,
    publicUrl,
    logLevel,
    trustProxy,
    dashboard,
    backupHours: int(env, 'BACKUP_HOURS', 24, 1, 24 * 7),
    shutdownNoticeMs: int(env, 'SHUTDOWN_NOTICE_MS', production ? 2000 : 0, 0, 60_000),
  };
};

/** A logger that drops messages below `level`; production lines get an ISO timestamp. */
export const makeLogger = (
  level: LogLevel,
  timestamps: boolean,
  out: { log: (s: string) => void; error: (s: string) => void } = console,
) => {
  const min = LEVELS.indexOf(level);
  const line = (lvl: LogLevel, msg: string) =>
    timestamps ? `${new Date().toISOString()} ${lvl.toUpperCase()} ${msg}` : msg;
  const at =
    (lvl: LogLevel) =>
    (msg: string): void => {
      if (LEVELS.indexOf(lvl) < min) return;
      (lvl === 'error' || lvl === 'warn' ? out.error : out.log)(line(lvl, msg));
    };
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
};
