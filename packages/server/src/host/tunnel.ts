// Cloudflare quick tunnel fallback: download a pinned, checksum-verified `cloudflared` when
// needed and run `cloudflared tunnel --url ...` (no Cloudflare account required).
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { chmod, mkdir, rename, rm } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';

/** Pinned cloudflared release. Bump together with the SHA-256 values below. */
export const CLOUDFLARED_VERSION = '2026.9.3';

export interface CloudflaredAsset {
  /** File name on the GitHub release. */
  asset: string;
  /** Lower-case hex SHA-256 of that file. */
  sha256: string;
}

/**
 * Per-platform assets (key: `${process.platform}-${process.arch}`), hashed from the official
 * release downloads of CLOUDFLARED_VERSION.
 *
 * macOS is not supported yet: Cloudflare ships it only as .tgz, which would need a tar reader.
 * For reference (2026.9.3): cloudflared-darwin-arm64.tgz
 * 587c2cfb1c230fe36c7fa7727da78be459dae028cabe8c001291999350f07095, cloudflared-darwin-amd64.tgz
 * d1155d0837487f261183b15c1eab6c4ebcad9dc49b94675f1524c3564cea3977.
 */
export const CLOUDFLARED_ASSETS: Readonly<Record<string, CloudflaredAsset>> = {
  'win32-x64': {
    asset: 'cloudflared-windows-amd64.exe',
    sha256: 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2',
  },
  'linux-x64': {
    asset: 'cloudflared-linux-amd64',
    sha256: '77e26d8d900e0b8469f416239d14b5f296525fdf79fee6f511ef55609e3fbac2',
  },
  'linux-arm64': {
    asset: 'cloudflared-linux-arm64',
    sha256: 'aaeb2d7d0da3614634c7e03ab13487a1522c2e79165ed2929cfe23d5e95b326d',
  },
};

export const cloudflaredDownloadUrl = (asset: string, version = CLOUDFLARED_VERSION): string =>
  `https://github.com/cloudflare/cloudflared/releases/download/${version}/${asset}`;

/** The pinned asset for this platform, or null if unsupported. */
export const cloudflaredAssetFor = (
  platform: string = process.platform,
  arch: string = process.arch,
): CloudflaredAsset | null => CLOUDFLARED_ASSETS[`${platform}-${arch}`] ?? null;

const isSha256Hex = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);

/** SHA-256 (lower-case hex) of a file, streamed. */
export const sha256File = async (file: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
};

/** Does the file exist and match the expected SHA-256? */
export const verifyFileSha256 = async (file: string, expected: string): Promise<boolean> => {
  if (!existsSync(file)) return false;
  return (await sha256File(file)) === expected.toLowerCase();
};

export type FetchLike = (url: string) => Promise<Response>;

export interface EnsureCloudflaredOptions {
  fetchImpl?: FetchLike;
  log?: (msg: string) => void;
  platform?: string;
  arch?: string;
  /** Override the pinned asset (tests). */
  asset?: CloudflaredAsset | null;
  version?: string;
}

/**
 * Path to a verified cloudflared binary in `<dataDir>/bin/`, downloading it if missing.
 * Throws if the platform is unsupported, the download fails, or the checksum does not match
 * (the bad file is deleted and never run).
 */
export const ensureCloudflared = async (
  dataDir: string,
  opts: EnsureCloudflaredOptions = {},
): Promise<string> => {
  const log = opts.log ?? (() => {});
  const platform = opts.platform ?? process.platform;
  const version = opts.version ?? CLOUDFLARED_VERSION;
  const asset = opts.asset !== undefined ? opts.asset : cloudflaredAssetFor(platform, opts.arch);
  if (!asset) {
    throw new Error(
      `Cloudflare tunnel is not supported on this system yet (${platform}-${opts.arch ?? process.arch})`,
    );
  }
  if (!isSha256Hex(asset.sha256)) {
    throw new Error(`No verified checksum for ${asset.asset}; refusing to download and run it`);
  }

  const binDir = path.join(dataDir, 'bin');
  const exe = platform === 'win32' ? '.exe' : '';
  const target = path.join(binDir, `cloudflared-${version}${exe}`);
  if (await verifyFileSha256(target, asset.sha256)) return target;
  if (existsSync(target)) {
    log('cloudflared: existing file failed its checksum, downloading again');
    await rm(target, { force: true });
  }

  await mkdir(binDir, { recursive: true });
  const url = cloudflaredDownloadUrl(asset.asset, version);
  log(`cloudflared: downloading ${version} from GitHub...`);
  const fetchImpl = opts.fetchImpl ?? ((u: string) => fetch(u, { redirect: 'follow' }));
  const res = await fetchImpl(url);
  if (!res.ok || !res.body) throw new Error(`Downloading cloudflared failed: HTTP ${res.status}`);

  const tmp = `${target}.${randomBytes(4).toString('hex')}.download`;
  const hash = createHash('sha256');
  const out = createWriteStream(tmp);
  try {
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      if (!out.write(value)) await once(out, 'drain');
    }
    out.end();
    await once(out, 'finish');
    const actual = hash.digest('hex');
    if (actual !== asset.sha256) {
      throw new Error(
        `cloudflared download failed its checksum (expected ${asset.sha256}, got ${actual}); deleted it`,
      );
    }
    if (platform !== 'win32') await chmod(tmp, 0o755);
    await rename(tmp, target);
  } catch (err) {
    out.destroy();
    await rm(tmp, { force: true });
    throw err;
  }
  log('cloudflared: download verified');
  return target;
};

// ---------------------------------------------------------------------------------------------
// Running a quick tunnel

const TUNNEL_URL_RE = /https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com\b/i;

/** The public quick-tunnel URL in a cloudflared log line, or null (ignores api.trycloudflare.com). */
export const parseTunnelUrl = (line: string): string | null => {
  const m = TUNNEL_URL_RE.exec(line);
  return m ? m[0].toLowerCase() : null;
};

export interface QuickTunnel {
  /** Resolves with the https://….trycloudflare.com URL; rejects on timeout or early exit. */
  url: Promise<string>;
  /** Kill cloudflared (and its children). Safe to call more than once. */
  stop(): void;
}

export interface QuickTunnelOptions {
  log?: (msg: string) => void;
  timeoutMs?: number;
  spawnImpl?: (cmd: string, args: string[]) => ChildProcess;
  platform?: string;
}

const defaultSpawn = (cmd: string, args: string[]): ChildProcess =>
  spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

/** Kill a process and its children (taskkill /T on Windows). */
export const killProcessTree = (child: ChildProcess, platform: string = process.platform): void => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (platform === 'win32' && child.pid !== undefined) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    }).on('error', () => child.kill());
  } else {
    child.kill('SIGTERM');
  }
};

export const quickTunnelArgs = (localPort: number): string[] => [
  'tunnel',
  '--url',
  `http://127.0.0.1:${localPort}`,
  '--no-autoupdate',
];

/** Start `cloudflared tunnel --url http://127.0.0.1:<port>` and wait for its public URL. */
export const startQuickTunnel = (
  binPath: string,
  localPort: number,
  opts: QuickTunnelOptions = {},
): QuickTunnel => {
  const log = opts.log ?? (() => {});
  const child = (opts.spawnImpl ?? defaultSpawn)(binPath, quickTunnelArgs(localPort));
  const recent: string[] = [];
  let stopped = false;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    killProcessTree(child, opts.platform);
  };

  const url = new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (err: Error | null, value?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value as string);
    };
    const withLog = (msg: string): Error =>
      new Error(recent.length ? `${msg}. Last output:\n${recent.join('\n')}` : msg);

    const timer = setTimeout(() => {
      stop();
      settle(withLog('Cloudflare tunnel did not start within 30 seconds'));
    }, opts.timeoutMs ?? 30_000);

    const onLine = (line: string): void => {
      if (!line.trim()) return;
      recent.push(line);
      if (recent.length > 10) recent.shift();
      if (/\bERR\b/.test(line)) log(`cloudflared: ${line}`);
      const found = parseTunnelUrl(line);
      if (found) settle(null, found);
    };
    const watch = (stream: NodeJS.ReadableStream | null): void => {
      if (!stream) return;
      let buf = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        buf += chunk;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';
        lines.forEach(onLine);
      });
    };
    watch(child.stdout);
    watch(child.stderr);

    child.on('error', (err) => settle(new Error(`Could not start cloudflared: ${err.message}`)));
    child.on('exit', (code, signal) => {
      if (!stopped) log(`cloudflared exited (${signal ?? `code ${code}`})`);
      settle(
        withLog(`cloudflared exited before the tunnel was ready (${signal ?? `code ${code}`})`),
      );
    });
  });
  // Avoid unhandled rejections if the caller only uses stop().
  url.catch(() => {});

  return { url, stop };
};
