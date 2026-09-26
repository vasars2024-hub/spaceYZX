// Host Dashboard: a small control page for the person hosting, on 127.0.0.1 only.
// Security: bound to loopback, every API call needs a random token (kept in the URL #hash, so
// it never reaches logs or referrers), and the Host header must be localhost/127.0.0.1
// (blocks DNS-rebinding attacks from web pages). All names are rendered as text.
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import qrcode from 'qrcode-generator';
import type { RankedMode } from '@space-yz/shared';
import { RANKED_MODES } from '@space-yz/shared';
import type { GameHub } from '../game/hub';
import type { Services } from '../services';
import type { ConnectivityStatus } from './connectivity';
import { capacity } from '../perf-budget';
import { MatchRules } from '../game/rules/match';

export interface DashboardOptions {
  hub: GameHub;
  services: Services;
  gamePort: number;
  connectivity: () => ConnectivityStatus | null;
  onStop: () => void;
  log?: (msg: string) => void;
  /** measure upload speed (Mbit/s); injectable for tests */
  speedTest?: () => Promise<number>;
  version?: string;
}

export interface Dashboard {
  url: string;
  token: string;
  port: number;
  close(): Promise<void>;
}

/** Upload ~8 MB to Cloudflare's public speed test endpoint and time it. */
export const cloudflareUploadTest = async (bytes = 8 * 1024 * 1024): Promise<number> => {
  const body = randomBytes(bytes);
  const t0 = performance.now();
  const res = await fetch('https://speed.cloudflare.com/__up', {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(30_000),
  });
  await res.arrayBuffer();
  const sec = (performance.now() - t0) / 1000;
  if (!res.ok) throw new Error(`speed test failed (${res.status})`);
  return (bytes * 8) / 1e6 / sec;
};

export const qrSvg = (text: string): string => {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
};

const readJson = (req: http.IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c: Buffer) => {
      data += c.toString('utf8');
      if (data.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      try {
        const v = JSON.parse(data || '{}') as unknown;
        resolve(v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
  });

export const startDashboard = (opts: DashboardOptions): Promise<Dashboard> => {
  const token = randomBytes(24).toString('base64url');
  const tokenBuf = Buffer.from(token);
  const log = opts.log ?? (() => {});
  const { hub, services } = opts;
  let uploadMbps: number | null = null;
  let speedError: string | null = null;
  let testing = false;
  const startedAt = Date.now();

  const status = () => {
    const conn = opts.connectivity();
    const rooms = [...hub.rooms.values()].map((r) => {
      const rules = r.rules instanceof MatchRules ? r.rules : null;
      return {
        code: r.code,
        mode: r.mode,
        map: r.map,
        ranked: r.ranked,
        phase: rules?.ms.phase ?? 'practice',
        scores: rules?.ms.scores ?? null,
        bots: [...r.members.values()].filter((m) => !m.conn).length,
        kbps: 0,
      };
    });
    // only people who logged in (the title screen's status check also holds a connection)
    const players = [...hub.conns]
      .filter((c) => c.helloDone)
      .map((c) => ({
        id: c.id,
        name: c.name,
        room: c.roomCode,
        ping: Math.round(c.rttMs),
        account: c.accountId,
      }));
    const est =
      uploadMbps === null
        ? null
        : Object.fromEntries(RANKED_MODES.map((m) => [m, capacity(m as RankedMode, uploadMbps!)]));
    return {
      version: opts.version ?? 'dev',
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      gamePort: opts.gamePort,
      localUrl: `http://localhost:${opts.gamePort}`,
      connectivity: conn
        ? {
            method: conn.method,
            publicUrl: conn.publicUrl,
            lanUrls: conn.lanUrls,
            reason: conn.reason,
          }
        : null,
      players,
      rooms,
      matches: rooms.filter((r) => r.phase !== 'warmup' && r.phase !== 'practice').length,
      ranked: services.queue.enabled,
      queued: services.queue.size(),
      uploadMbps,
      speedError,
      testing,
      capacity: est,
      accounts: services.accounts.count(),
      reports: services.ranked.reports(50).filter((r) => !r.handled).length,
    };
  };

  const json = (res: http.ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const host = String(req.headers.host ?? '');
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      res.writeHead(421).end('Wrong host');
      return;
    }
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: 'self'; connect-src 'self'",
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(DASHBOARD_HTML);
      return;
    }
    if (!url.pathname.startsWith('/api/')) {
      res.writeHead(404).end();
      return;
    }
    const auth = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    const given = Buffer.from(auth);
    if (given.length !== tokenBuf.length || !timingSafeEqual(given, tokenBuf)) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }
    try {
      if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, status());
      if (req.method === 'GET' && url.pathname === '/api/reports')
        return json(res, 200, services.ranked.reports(100));
      if (req.method === 'GET' && url.pathname === '/api/qr') {
        const text = url.searchParams.get('text') ?? '';
        if (!/^https?:\/\/[\w.:[\]-]+\/?$/.test(text)) return json(res, 400, { error: 'bad link' });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
        res.end(qrSvg(text));
        return;
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'method' });
      const body = await readJson(req);
      switch (url.pathname) {
        case '/api/kick': {
          const c = [...hub.conns].find((x) => x.id === Number(body.id));
          if (!c) return json(res, 404, { error: 'no such player' });
          log(`Host kicked ${c.name}`);
          hub.kick(c, 'The host removed you from the server.', body.ban ? 30 : 0);
          return json(res, 200, { ok: true });
        }
        case '/api/ranked':
          services.queue.enabled = !!body.on;
          log(`Ranked ${services.queue.enabled ? 'on' : 'off'}`);
          return json(res, 200, { ok: true, ranked: services.queue.enabled });
        case '/api/restart': {
          for (const r of [...hub.rooms.values()]) {
            for (const m of r.humans)
              if (m.conn) hub.removeFromRoom(m.conn, 'The host restarted the matches.');
            if (hub.rooms.has(r.code)) hub.closeRoom(r);
          }
          log('Host restarted all matches');
          return json(res, 200, { ok: true });
        }
        case '/api/stop':
          json(res, 200, { ok: true });
          setTimeout(opts.onStop, 100);
          return;
        case '/api/speedtest': {
          if (typeof body.mbps === 'number' && body.mbps > 0 && body.mbps < 100_000) {
            uploadMbps = body.mbps;
            speedError = null;
            return json(res, 200, { ok: true });
          }
          if (testing) return json(res, 200, { ok: true });
          testing = true;
          speedError = null;
          (opts.speedTest ?? cloudflareUploadTest)()
            .then((v) => (uploadMbps = Math.round(v * 10) / 10))
            .catch((e) => (speedError = `Speed test failed: ${String((e as Error).message ?? e)}`))
            .finally(() => (testing = false));
          return json(res, 200, { ok: true });
        }
        case '/api/report-handled':
          services.ranked.markHandled(Number(body.id));
          return json(res, 200, { ok: true });
        case '/api/unban':
          services.ranked.unban(Number(body.playerId));
          return json(res, 200, { ok: true });
        default:
          return json(res, 404, { error: 'not found' });
      }
    } catch (err) {
      log(`dashboard error: ${String(err)}`);
      if (!res.headersSent) json(res, 500, { error: 'internal' });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/#${token}`,
        token,
        port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            server.closeAllConnections?.();
          }),
      });
    });
  });
};

const DASHBOARD_HTML = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lethal Recoil Host</title>
<style>
:root{--bg:#070b14;--panel:#0e1524;--line:#1f2b44;--text:#e8f1ff;--dim:#8ea3c4;--cyan:#19e3ff;--orange:#ff8a1f;--ok:#3dff9a;--bad:#ff5b5b;--warn:#ffd24a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,Segoe UI,sans-serif}
header{display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--line)}
h1{font-size:20px;margin:0;letter-spacing:.12em}h2{font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin:0 0 10px}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;padding:16px 20px;max-width:1200px}
section{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px 16px}
button{background:#12314a;color:var(--text);border:1px solid var(--cyan);border-radius:6px;padding:8px 14px;font-weight:700;cursor:pointer}
button.big{font-size:18px;padding:14px 28px;background:linear-gradient(#0f5c6b,#0a3a47)}
button.warn{border-color:var(--orange);background:#3a2410}button.small{padding:3px 9px;font-size:12px}
.link{font:14px ui-monospace,Consolas,monospace;background:#050810;border:1px solid var(--line);padding:8px;border-radius:5px;word-break:break-all;flex:1}
.row{display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap}
.light{display:inline-block;width:11px;height:11px;border-radius:50%;background:var(--dim);margin-right:6px}
.light.ok{background:var(--ok)}.light.bad{background:var(--bad)}.light.warn{background:var(--warn)}
.dim{color:var(--dim);font-size:13px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:4px 6px;border-bottom:1px solid var(--line)}
#qr{width:150px;height:150px;background:#fff;border-radius:6px;display:block}
</style></head><body>
<header><h1>LETHAL RECOIL · HOST</h1><span class="dim" id="uptime"></span><span style="flex:1"></span>
<button class="big" id="play">▶ Play</button></header>
<main>
<section><h2>Invite friends</h2><div id="method" class="row"></div><div id="reason" class="dim"></div>
<div class="row"><span class="link" id="invite">checking your connection…</span><button id="copy">Copy</button></div>
<img id="qr" alt="QR code of the invite link"><div class="dim">Same Wi-Fi: <span id="lan"></span></div></section>
<section><h2>Status</h2><div id="lights"></div>
<div class="row"><button id="speed">Measure upload speed</button><input id="mbps" type="number" min="1" placeholder="or type Mbit/s" style="width:120px"></div>
<div id="cap" class="dim"></div></section>
<section><h2>Controls</h2>
<div class="row"><label><input type="checkbox" id="ranked"> Ranked matchmaking on</label></div>
<div class="row"><button class="warn" id="restart">Restart all matches</button><button class="warn" id="stop">Stop server</button></div>
<div class="dim">Closing this window does not stop the server — use Stop, or close the black Lethal Recoil window.</div></section>
<section style="grid-column:1/-1"><h2>Players</h2><table id="players"></table></section>
<section style="grid-column:1/-1"><h2>Matches</h2><table id="rooms"></table></section>
<section style="grid-column:1/-1"><h2>Reports</h2><table id="reports"></table></section>
</main>
<script>
const token = location.hash.slice(1);
history.replaceState(null, '', location.pathname); // keep the token out of the address bar
const api = (p, body) => fetch('/api' + p, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(r => r.ok ? (r.headers.get('content-type')||'').includes('json') ? r.json() : r.text() : Promise.reject(r.status));
const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = String(text); if (cls) e.className = cls; return e; };
const row = (cells) => { const tr = el('tr'); for (const c of cells) { const td = el('td'); if (c instanceof Node) td.append(c); else td.textContent = c ?? ''; tr.append(td); } return tr; };
const head = (cols) => row(cols.map(c => el('b', c)));
let st = null, lastQr = '';
async function refresh() {
  try { st = await api('/status'); } catch (e) { $('invite').textContent = e === 401 ? 'This page is out of date — use the link the Lethal Recoil window printed.' : 'The server is not running.'; return; }
  $('uptime').textContent = 'running ' + Math.floor(st.uptimeSec / 60) + ' min';
  const c = st.connectivity;
  $('method').replaceChildren(el('span', '', 'light ' + (!c ? 'warn' : c.publicUrl ? 'ok' : 'bad')), el('span', !c ? 'Checking…' : c.method === 'upnp' ? 'Direct (router port opened)' : c.method === 'tunnel' ? 'Cloudflare tunnel' : 'Only your network'));
  $('reason').textContent = c ? c.reason : 'Trying automatic port opening, then a Cloudflare tunnel…';
  const invite = c && c.publicUrl ? c.publicUrl : (c && c.lanUrls[0]) || st.localUrl;
  $('invite').textContent = invite;
  $('lan').textContent = c ? c.lanUrls.join('  ') : '';
  if (invite !== lastQr) { lastQr = invite; api('/qr?text=' + encodeURIComponent(invite)).then(svg => { $('qr').src = 'data:image/svg+xml;base64,' + btoa(svg); }).catch(() => {}); }
  const lights = [
    ['Players online', st.players.length, st.players.length ? 'ok' : ''],
    ['Matches running', st.matches, st.matches ? 'ok' : ''],
    ['Searching ranked', st.queued, ''],
    ['Accounts', st.accounts, ''],
    ['Unhandled reports', st.reports, st.reports ? 'warn' : 'ok'],
    ['Upload speed', st.testing ? 'measuring…' : st.uploadMbps ? st.uploadMbps + ' Mbit/s' : (st.speedError || 'not measured'), st.uploadMbps ? (st.uploadMbps >= 10 ? 'ok' : 'warn') : ''],
  ];
  $('lights').replaceChildren(...lights.map(([k, v, cls]) => { const d = el('div', '', 'row'); d.append(el('span', '', 'light ' + cls), el('span', k + ': '), el('b', v)); return d; }));
  $('cap').textContent = st.capacity ? 'Your PC can host about: ' + Object.entries(st.capacity).map(([m, x]) => x.matches + ' × ' + m + ' (' + x.players + ' players)').join(', ') + '. Upload speed is usually the limit.' : 'Measure the upload speed to see how many matches you can host.';
  $('ranked').checked = st.ranked;
  const pt = $('players'); pt.replaceChildren(head(['Name', 'Room', 'Ping', '']));
  for (const p of st.players) { const k = el('button', 'Kick', 'small warn'); k.onclick = () => confirm('Kick ' + p.name + '?') && api('/kick', { id: p.id }).then(refresh); pt.append(row([p.name, p.room || 'menu', p.ping + ' ms', k])); }
  const rt = $('rooms'); rt.replaceChildren(head(['Code', 'Mode', 'Type', 'Phase', 'Score', 'Bots']));
  for (const r of st.rooms) rt.append(row([r.code, r.mode, r.ranked ? 'ranked' : 'private', r.phase, r.scores ? r.scores.join(' – ') : '', r.bots]));
}
async function reports() {
  let list = []; try { list = await api('/reports'); } catch { return; }
  const t = $('reports'); t.replaceChildren(head(['When', 'Player', 'Reason', 'Room', 'Times reported', '']));
  for (const r of list) { const b = el('button', r.handled ? 'Done' : 'Mark done', 'small'); b.disabled = r.handled; b.onclick = () => api('/report-handled', { id: r.id }).then(reports); t.append(row([new Date(r.at).toLocaleString(), r.reportedName, r.reason, r.room, r.count, b])); }
}
$('play').onclick = () => window.open(st ? st.localUrl : '/', '_blank');
$('copy').onclick = () => navigator.clipboard.writeText($('invite').textContent);
$('speed').onclick = () => api('/speedtest', {}).then(refresh);
$('mbps').onchange = () => { const v = Number($('mbps').value); if (v > 0) api('/speedtest', { mbps: v }).then(refresh); };
$('ranked').onchange = () => api('/ranked', { on: $('ranked').checked });
$('restart').onclick = () => confirm('End every match and send players back to the menu?') && api('/restart', {}).then(refresh);
$('stop').onclick = () => confirm('Stop the server? Everyone will be disconnected.') && api('/stop', {}).then(() => { clearInterval(t1); clearInterval(t2); document.body.textContent = 'Server stopped. You can close this tab.'; });
refresh(); reports(); const t1 = setInterval(refresh, 2000); const t2 = setInterval(reports, 15000);
</script></body></html>`;
