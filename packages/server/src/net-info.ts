// Helpers for finding addresses/ports and opening the browser.
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';

/** IPv4 LAN addresses of this PC (skips loopback, link-local and virtual adapters where obvious). */
export const lanAddresses = (): string[] => {
  const out: string[] = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    if (!infos) continue;
    if (/vEthernet|VirtualBox|VMware|docker|br-|veth|WSL/i.test(name)) continue;
    for (const info of infos) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('169.254.')) continue;
      out.push(info.address);
    }
  }
  return out;
};

/** Is this TCP port free on all interfaces? */
export const isPortFree = (port: number, host = '0.0.0.0'): Promise<boolean> =>
  new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });

/** First free port at or after `start`. */
export const findFreePort = async (
  start: number,
  tries = 20,
  host = '0.0.0.0',
): Promise<number> => {
  for (let p = start; p < start + tries; p++) if (await isPortFree(p, host)) return p;
  throw new Error(`No free port found between ${start} and ${start + tries - 1}`);
};

/** Open a URL in the default browser (best effort, never throws). */
export const openBrowser = (url: string): void => {
  if (process.env.NO_OPEN || process.env.CI) return;
  try {
    const opts = { stdio: 'ignore' as const, detached: true };
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', url], opts).unref();
    else if (process.platform === 'darwin') spawn('open', [url], opts).unref();
    else
      spawn('xdg-open', [url], opts)
        .on('error', () => {})
        .unref();
  } catch {
    /* ignore */
  }
};
