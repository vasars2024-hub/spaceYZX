// The rented-server entry point: environment settings, trusted proxy addresses, clean shutdown.
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { readServerConfig, makeLogger, ConfigError, type ServerConfig } from '../src/prod/config';
import { makeProxyTrust, forwardedClientIp, normalizeIp } from '../src/prod/proxy';
import { createShutdown } from '../src/prod/shutdown';
import { runServer, RESTART_NOTICE } from '../src/prod/run';

const defaults = { dataDir: '/repo/data', clientDist: '/repo/client/dist', port: 7777 };
const TOKEN = 'a'.repeat(40);

describe('readServerConfig', () => {
  it('keeps the desktop defaults when nothing is set', () => {
    const c = readServerConfig({}, [], defaults);
    expect(c).toMatchObject({
      production: false,
      port: 7777,
      host: '0.0.0.0',
      strictPort: false,
      openBrowser: true,
      dataDir: '/repo/data',
      logLevel: 'info',
      trustProxy: [],
      dashboard: null,
      backupHours: 24,
      shutdownNoticeMs: 0,
    });
  });

  it('reads the production settings', () => {
    const c = readServerConfig(
      {
        NODE_ENV: 'production',
        PORT: '8080',
        HOST: '127.0.0.1',
        SPACEYZ_DATA: '/data',
        CLIENT_DIST: '/app/client',
        PUBLIC_URL: 'https://lethalrecoil.com/',
        LOG_LEVEL: 'WARN',
        TRUST_PROXY: 'loopback, 10.0.0.0/8',
        DASHBOARD_PORT: '7778',
        DASHBOARD_TOKEN: TOKEN,
        BACKUP_HOURS: '6',
      },
      [],
      defaults,
    );
    expect(c).toMatchObject({
      production: true,
      port: 8080,
      host: '127.0.0.1',
      strictPort: true,
      openBrowser: false,
      dataDir: '/data',
      clientDist: '/app/client',
      publicUrl: 'https://lethalrecoil.com',
      logLevel: 'warn',
      trustProxy: ['loopback', '10.0.0.0/8'],
      dashboard: { host: '127.0.0.1', port: 7778, token: TOKEN },
      backupHours: 6,
      shutdownNoticeMs: 2000,
    });
  });

  it('refuses unsafe or broken settings with a plain message', () => {
    const bad: Record<string, string>[] = [
      { PORT: 'abc' },
      { PORT: '70000' },
      { LOG_LEVEL: 'loud' },
      { PUBLIC_URL: 'lethalrecoil.com' },
      { DASHBOARD_PORT: '7777' }, // same as the game port
      { DASHBOARD_PORT: '7778', DASHBOARD_TOKEN: 'short' },
      { NODE_ENV: 'production', DASHBOARD_PORT: '7778' }, // no token in production
    ];
    for (const env of bad) expect(() => readServerConfig(env, [], defaults)).toThrow(ConfigError);
  });

  it('allows a random dashboard token outside production', () => {
    expect(readServerConfig({ DASHBOARD_PORT: '7778' }, [], defaults).dashboard?.token).toBe('');
  });
});

describe('makeLogger', () => {
  it('drops messages below the level and timestamps production lines', () => {
    const out = { log: vi.fn(), error: vi.fn() };
    const log = makeLogger('warn', true, out);
    log.info('hidden');
    log.warn('shown');
    expect(out.log).not.toHaveBeenCalled();
    expect(out.error).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d\d-\d\dT.* WARN shown$/),
    );
  });
});

describe('trusted proxy', () => {
  const req = (remote: string, xff?: string | string[]) =>
    ({
      socket: { remoteAddress: remote },
      headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    }) as unknown as http.IncomingMessage;

  it('believes X-Forwarded-For only from the trusted proxy', () => {
    const t = makeProxyTrust(['loopback']);
    expect(forwardedClientIp(req('127.0.0.1', '203.0.113.9'), t)).toBe('203.0.113.9');
    expect(forwardedClientIp(req('::ffff:127.0.0.1', '203.0.113.9'), t)).toBe('203.0.113.9');
    expect(forwardedClientIp(req('198.51.100.7', '203.0.113.9'), t)).toBe('');
  });

  it('uses the right-most entry (the one our proxy added) and ignores junk', () => {
    const t = makeProxyTrust(['loopback']);
    expect(forwardedClientIp(req('127.0.0.1', '1.1.1.1, 203.0.113.9'), t)).toBe('203.0.113.9');
    expect(forwardedClientIp(req('127.0.0.1', ['1.1.1.1', '2001:db8::1']), t)).toBe('2001:db8::1');
    expect(forwardedClientIp(req('127.0.0.1', 'not-an-ip'), t)).toBe('');
    expect(forwardedClientIp(req('127.0.0.1'), t)).toBe('');
  });

  it('supports single addresses and ranges, and rejects typos', () => {
    const t = makeProxyTrust(['172.29.77.10', '10.0.0.0/8', 'fd00::/8']);
    expect(t('172.29.77.10')).toBe(true);
    expect(t('::ffff:172.29.77.10')).toBe(true);
    expect(t('172.29.77.11')).toBe(false);
    expect(t('10.200.1.1')).toBe(true);
    expect(t('fd12::1')).toBe(true);
    expect(t('127.0.0.1')).toBe(false);
    expect(makeProxyTrust([])('127.0.0.1')).toBe(false);
    expect(() => makeProxyTrust(['caddy'])).toThrow();
    expect(() => makeProxyTrust(['10.0.0.0/40'])).toThrow();
    expect(normalizeIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
  });
});

describe('createShutdown', () => {
  it('runs every step once, in order, even if one fails', async () => {
    const order: string[] = [];
    const exit = vi.fn();
    const stop = createShutdown({
      hardTimeoutMs: 5000,
      exit,
      steps: [
        { name: 'a', run: () => void order.push('a') },
        {
          name: 'b',
          run: () => {
            order.push('b');
            throw new Error('boom');
          },
        },
        { name: 'c', run: async () => void order.push('c') },
      ],
    });
    await Promise.all([stop('SIGTERM'), stop('SIGINT')]);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1); // a step failed
  });

  it('exits anyway when a step hangs', async () => {
    const exit = vi.fn();
    void createShutdown({
      hardTimeoutMs: 50,
      exit,
      steps: [{ name: 'hang', run: () => new Promise(() => {}) }],
    })('SIGTERM');
    await new Promise((r) => setTimeout(r, 150));
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('runServer (production mode)', () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'lr-prod-'));
  afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

  it('starts, trusts only the proxy, tells players on shutdown and closes the database', async () => {
    const cfg: ServerConfig = {
      production: true,
      dev: false,
      port: 0,
      host: '127.0.0.1',
      strictPort: true,
      openBrowser: false,
      dataDir,
      clientDist: path.join(dataDir, 'no-client'),
      publicUrl: 'https://example.com',
      logLevel: 'error',
      trustProxy: ['loopback'],
      dashboard: { host: '127.0.0.1', port: 0, token: TOKEN },
      backupHours: 24,
      shutdownNoticeMs: 100,
    };
    const exit = vi.fn();
    const quiet = makeLogger('error', false, { log: () => {}, error: () => {} });
    const run = await runServer(cfg, quiet, { exit });
    const port = run.server.port;

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.ok).toBe(true);

    // dashboard: fixed token works, and it reports the rented-server address
    const status = await fetch(`http://127.0.0.1:${run.dashboard!.port}/api/status`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(status.status).toBe(200);
    const st = (await status.json()) as { connectivity: { method: string; publicUrl: string } };
    expect(st.connectivity).toMatchObject({ method: 'server', publicUrl: 'https://example.com' });

    // a player behind the proxy: the real address comes from X-Forwarded-For
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { 'X-Forwarded-For': '203.0.113.50' },
    });
    const msgs: string[] = [];
    ws.on('message', (d) => msgs.push(String(d)));
    await new Promise((r) => ws.once('open', r));
    await vi.waitFor(() => expect(msgs.some((m) => m.includes('"hello"'))).toBe(true));
    const conn = [...run.server.hub.conns][0];
    expect(conn.ip).toBe('203.0.113.50');
    conn.helloDone = true; // as if logged in

    await run.shutdown('SIGTERM');
    expect(msgs.some((m) => m.includes(RESTART_NOTICE))).toBe(true);
    expect(exit).toHaveBeenCalledWith(0);
    expect(() => run.services.db.prepare('SELECT 1').get()).toThrow(); // database closed
    expect(existsSync(path.join(dataDir, 'spaceyz.db'))).toBe(true);
    expect(readdirSync(path.join(dataDir, 'backups')).length).toBe(1);
    ws.terminate();
  });
});
