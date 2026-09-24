// npm run build:host — builds SpaceYZ-Host(.exe): one file with Node, the server and the game
// client inside (Node "single executable application"). Output: build/host/.
//
// Steps: bundle the host server with esbuild -> list the client files as SEA assets ->
// `node --experimental-sea-config` makes the blob -> copy this Node binary -> inject the blob
// with postject.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'build', 'host');
const clientDist = path.join(root, 'packages', 'client', 'dist');
const exeName = process.platform === 'win32' ? 'SpaceYZ-Host.exe' : 'SpaceYZ-Host';
const version =
  process.env.SPACEYZ_VERSION ??
  (require(path.join(root, 'package.json')) as { version: string }).version;

const listFiles = (dir: string, base = dir): string[] =>
  readdirSync(dir).flatMap((f) => {
    const full = path.join(dir, f);
    return statSync(full).isDirectory()
      ? listFiles(full, base)
      : [path.relative(base, full).split(path.sep).join('/')];
  });

const main = async (): Promise<void> => {
  if (!existsSync(path.join(clientDist, 'index.html'))) {
    console.error('Build the game first: npm run build');
    process.exit(1);
  }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  console.log('1/4 bundling the host server…');
  await build({
    entryPoints: [path.join(root, 'packages/server/src/host/host-main.ts')],
    outfile: path.join(out, 'host.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['bufferutil', 'utf-8-validate'], // optional ws speed-ups
    define: { 'process.env.SPACEYZ_VERSION': JSON.stringify(version) },
    legalComments: 'none',
    logLevel: 'warning',
  });

  console.log('2/4 embedding the game files…');
  const files = listFiles(clientDist);
  writeFileSync(path.join(out, 'files.json'), JSON.stringify(files));
  const assets: Record<string, string> = { 'client/.files': path.join(out, 'files.json') };
  for (const f of files) assets[`client/${f}`] = path.join(clientDist, f);
  const seaConfig = {
    main: path.join(out, 'host.cjs'),
    output: path.join(out, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets,
  };
  writeFileSync(path.join(out, 'sea-config.json'), JSON.stringify(seaConfig, null, 2));
  execFileSync(process.execPath, ['--experimental-sea-config', path.join(out, 'sea-config.json')], {
    stdio: 'inherit',
  });

  console.log('3/4 copying Node…');
  const exe = path.join(out, exeName);
  copyFileSync(process.execPath, exe);
  chmodSync(exe, 0o755);
  if (process.platform === 'darwin') execFileSync('codesign', ['--remove-signature', exe]);

  console.log('4/4 injecting…');
  const { inject } = require('postject') as {
    inject: (
      file: string,
      name: string,
      data: Buffer,
      opts: Record<string, unknown>,
    ) => Promise<void>;
  };
  const { readFileSync } = await import('node:fs');
  await inject(exe, 'NODE_SEA_BLOB', readFileSync(seaConfig.output), {
    sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    machoSegmentName: process.platform === 'darwin' ? 'NODE_SEA' : undefined,
  });
  if (process.platform === 'darwin') execFileSync('codesign', ['--sign', '-', exe]);
  for (const f of ['sea-prep.blob', 'sea-config.json', 'files.json'])
    rmSync(path.join(out, f), { force: true });
  console.log(
    `Done: ${path.relative(root, exe)} (${(statSync(exe).size / 1e6).toFixed(0)} MB, version ${version})`,
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
