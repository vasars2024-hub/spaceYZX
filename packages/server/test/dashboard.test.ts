import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameHub } from '../src/game/hub';
import { createServices, type Services } from '../src/services';
import { startDashboard, qrSvg, type Dashboard } from '../src/host/dashboard';
import type { ConnectivityStatus } from '../src/host/connectivity';

const rawGet = (port: number, path: string, headers: Record<string, string>): Promise<number> =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });

describe('host dashboard', () => {
  let hub: GameHub;
  let services: Services;
  let dash: Dashboard;
  let stopped = false;
  const conn: ConnectivityStatus = {
    lanUrls: ['http://192.168.1.20:7777'],
    publicUrl: 'https://abc.trycloudflare.com',
    method: 'tunnel',
    reason: 'test',
    cleanup: async () => {},
  };
  beforeAll(async () => {
    services = createServices({ dbFile: ':memory:', log: () => {} });
    hub = new GameHub({ ...services.hub, log: () => {} });
    dash = await startDashboard({
      hub,
      services,
      gamePort: 7777,
      connectivity: () => conn,
      onStop: () => (stopped = true),
      speedTest: async () => 42,
    });
  });
  afterAll(async () => {
    await dash.close();
    hub.close();
    services.close();
  });

  const api = (path: string, body?: unknown, token = dash.token) =>
    fetch(`http://127.0.0.1:${dash.port}/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

  it('only listens on loopback and puts the token in the URL hash', () => {
    expect(dash.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#[A-Za-z0-9_-]{20,}$/);
  });

  it('refuses requests without the token, and from other host names (DNS rebinding)', async () => {
    expect((await api('/status', undefined, 'wrong')).status).toBe(401);
    expect(
      await rawGet(dash.port, '/api/status', {
        Host: `evil.example:${dash.port}`,
        Authorization: `Bearer ${dash.token}`,
      }),
    ).toBe(421);
    expect(await rawGet(dash.port, '/', { Host: `localhost:${dash.port}` })).toBe(200);
  });

  it('reports status, connectivity and a capacity estimate after a speed test', async () => {
    let s = (await (await api('/status')).json()) as {
      connectivity: { publicUrl: string };
      capacity: unknown;
    };
    expect(s.connectivity.publicUrl).toBe('https://abc.trycloudflare.com');
    expect(s.capacity).toBeNull();
    await api('/speedtest', {});
    await new Promise((r) => setTimeout(r, 20));
    s = (await (await api('/status')).json()) as never;
    const st = s as unknown as {
      uploadMbps: number;
      capacity: Record<string, { matches: number }>;
    };
    expect(st.uploadMbps).toBe(42);
    expect(st.capacity['1v1'].matches).toBeGreaterThan(0);
  });

  it('starts a new Premier season only for the season the page confirmed', async () => {
    const st = (await (await api('/status')).json()) as { season: number };
    expect(st.season).toBe(1);
    // a stale page (confirming an older season) is refused
    expect((await api('/season', { from: 0 })).status).toBe(409);
    const r = await api('/season', { from: 1 });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { season: number }).season).toBe(2);
    expect(services.ranked.season()).toBe(2);
    // the page has its own confirm step (no browser confirm() for this)
    const html = await (await fetch(`http://127.0.0.1:${dash.port}/`)).text();
    expect(html).toContain('id="seasonConfirm"');
    expect(html).not.toMatch(/confirm\([^)]*season/i);
  });

  it('switches Premier between always open and opening hours', async () => {
    const status = async () =>
      ((await (await api('/status')).json()) as { premier: { mode: string; hours: string } })
        .premier;
    expect((await status()).mode).toBe('always');
    expect((await api('/premier-hours', { mode: 'scheduled', windows: 'nonsense' })).status).toBe(
      400,
    );
    expect(
      (await api('/premier-hours', { mode: 'scheduled', windows: 'Sat 19:00-22:00' })).status,
    ).toBe(200);
    expect(await status()).toMatchObject({ mode: 'scheduled', hours: 'Sat 19:00–22:00' });
    expect(services.ranked.schedule().mode).toBe('scheduled');
    await api('/premier-hours', { mode: 'always' });
    expect(services.ranked.schedule()).toMatchObject({ mode: 'always' });
    // the hours are kept for the next time it's switched on
    expect(services.ranked.schedule().windows[0].days).toEqual([6]);
  });

  it('toggles ranked, restarts and stops', async () => {
    await api('/ranked', { on: false });
    expect(services.queue.enabled).toBe(false);
    await api('/ranked', { on: true });
    expect(services.queue.enabled).toBe(true);
    expect((await api('/restart', {})).status).toBe(200);
    await api('/stop', {});
    await new Promise((r) => setTimeout(r, 150));
    expect(stopped).toBe(true);
  });

  it('makes QR codes only for plain links', async () => {
    expect(qrSvg('http://1.2.3.4:7777')).toContain('<svg');
    expect(
      (await api('/qr?text=' + encodeURIComponent('https://abc.trycloudflare.com'))).status,
    ).toBe(200);
    expect((await api('/qr?text=' + encodeURIComponent('javascript:alert(1)'))).status).toBe(400);
  });
});
