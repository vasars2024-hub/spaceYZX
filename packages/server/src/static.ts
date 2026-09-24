// Minimal static file serving for the built client (no framework).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export const mimeFor = (file: string): string =>
  MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

/** Where the game's files come from: a folder on disk, or (in the host exe) embedded assets. */
export interface AssetSource {
  /** Returns file contents for a URL path like "/assets/x.js", or null if missing. */
  read(urlPath: string): Promise<Buffer | null>;
  describe(): string;
}

/** Resolve a URL path safely inside `root`; null if it escapes. */
export const safeJoin = (root: string, urlPath: string): string | null => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const rel = path.normalize(decoded).replace(/^([/\\])+/, '');
  const full = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) return null;
  return full;
};

export const diskAssets = (root: string): AssetSource => ({
  async read(urlPath) {
    const full = safeJoin(root, urlPath);
    if (!full) return null;
    try {
      const st = await fs.stat(full);
      if (!st.isFile()) return null;
      return await fs.readFile(full);
    } catch {
      return null;
    }
  },
  describe: () => root,
});

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
};

/** Serve a GET/HEAD request from an AssetSource; SPA fallback to index.html. */
export const serveStatic = async (
  assets: AssetSource,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let urlPath = (req.url ?? '/').split('?')[0];
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  let body = await assets.read(urlPath);
  let file = urlPath;
  if (!body && !path.extname(urlPath)) {
    body = await assets.read('/index.html');
    file = '/index.html';
  }
  if (!body) {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS }).end('Not found');
    return;
  }
  const hashed = /\/assets\//.test(file);
  res.writeHead(200, {
    'Content-Type': mimeFor(file),
    'Content-Length': body.length,
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...SECURITY_HEADERS,
  });
  if (req.method === 'HEAD') res.end();
  else res.end(body);
};
