// The game server: one HTTP port serving the client files plus the game WebSocket at /ws.
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { PROTOCOL_VERSION, GAME_NAME } from '@space-yz/shared';
import { serveStatic, type AssetSource } from './static';
import { GameHub, type HubServices } from './game/hub';

export interface GameServerOptions {
  port: number;
  host?: string;
  assets: AssetSource | null;
  log?: (msg: string) => void;
  services?: HubServices;
  /** Extra HTTP routes (JSON API); return true if handled. */
  api?: (req: http.IncomingMessage, res: http.ServerResponse) => boolean | Promise<boolean>;
}

export interface GameServer {
  http: http.Server;
  wss: WebSocketServer;
  hub: GameHub;
  port: number;
  close(): Promise<void>;
}

const MAX_MESSAGE_BYTES = 16 * 1024;

export const startGameServer = (opts: GameServerOptions): Promise<GameServer> => {
  const log = opts.log ?? ((m: string) => console.log(m));
  const hub = new GameHub({ log, ...opts.services });
  const httpServer = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, game: GAME_NAME, protocol: PROTOCOL_VERSION }));
      return;
    }
    try {
      if (opts.api && (await opts.api(req, res))) return;
    } catch (err) {
      log(`api error: ${String(err)}`);
      if (!res.headersSent) res.writeHead(500).end();
      return;
    }
    if (!opts.assets) {
      res.writeHead(404).end('Client not built. Run "npm start".');
      return;
    }
    serveStatic(opts.assets, req, res).catch((err) => {
      log(`static error: ${String(err)}`);
      if (!res.headersSent) res.writeHead(500).end();
    });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  httpServer.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const fwd = String(req.headers['cf-connecting-ip'] ?? '');
    const ip = fwd || req.socket.remoteAddress || 'unknown';
    hub.accept(ws, ip);
  });

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      const addr = httpServer.address();
      const port = typeof addr === 'object' && addr ? addr.port : opts.port;
      resolve({
        http: httpServer,
        wss,
        hub,
        port,
        close: () =>
          new Promise<void>((done) => {
            hub.close();
            for (const c of wss.clients) c.terminate();
            wss.close();
            httpServer.close(() => done());
            httpServer.closeAllConnections?.();
          }),
      });
    });
  });
};
