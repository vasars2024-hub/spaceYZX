// Bundles the game server (packages/server/src/main.ts plus the shared code and the ws library)
// into ONE JavaScript file, so the Docker image only needs Node — no node_modules, no tsx.
// Used by the Dockerfile. Output: build/server/server.mjs (or --out <file>).
//
//   npx tsx tools/deploy/bundle-server.ts [--out <file>]
import { build } from 'esbuild';
import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const outArg = process.argv.indexOf('--out');
const outfile =
  outArg >= 0 ? path.resolve(process.argv[outArg + 1]) : path.join(root, 'build/server/server.mjs');
const version =
  process.env.SPACEYZ_VERSION ??
  (createRequire(import.meta.url)(path.join(root, 'package.json')) as { version: string }).version;

await build({
  entryPoints: [path.join(root, 'packages/server/src/main.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['bufferutil', 'utf-8-validate'], // optional ws speed-ups (not installed)
  // the shared package straight from this checkout (no reliance on the workspace symlink)
  alias: { '@space-yz/shared': path.join(root, 'packages/shared/src/index.ts') },
  // ws is CommonJS and calls require() for Node's own modules; give the ES module a require()
  banner: {
    js: "import { createRequire as __lrCreateRequire } from 'node:module'; const require = __lrCreateRequire(import.meta.url);",
  },
  define: { 'process.env.SPACEYZ_VERSION': JSON.stringify(version) },
  legalComments: 'none',
  logLevel: 'warning',
});
console.log(`Bundled server: ${outfile} (${(statSync(outfile).size / 1024).toFixed(0)} KB)`);
