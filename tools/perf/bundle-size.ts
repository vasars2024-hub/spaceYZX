// npm run size — fails if the game's first download (index.html + everything it loads up
// front) is over the budget. Players on slow connections must be able to start quickly.
import { readFileSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

export const BUDGET_BYTES = 5 * 1024 * 1024;

export interface SizeReport {
  files: { file: string; bytes: number; gzip: number }[];
  total: number;
  totalGzip: number;
  ok: boolean;
}

/** Files referenced by index.html (scripts, stylesheets, modulepreloads, icons). */
export const firstDownload = (dist: string): SizeReport => {
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const refs = new Set<string>(['index.html']);
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) continue;
    refs.add(ref.replace(/^\//, '').split('?')[0]);
  }
  const files = [...refs]
    .filter((f) => existsSync(path.join(dist, f)))
    .map((f) => {
      const buf = readFileSync(path.join(dist, f));
      return {
        file: f,
        bytes: statSync(path.join(dist, f)).size,
        gzip: gzipSync(buf, { level: 9 }).length,
      };
    });
  const total = files.reduce((s, f) => s + f.bytes, 0);
  const totalGzip = files.reduce((s, f) => s + f.gzip, 0);
  return { files, total, totalGzip, ok: total <= BUDGET_BYTES };
};

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;

if (process.argv[1]?.endsWith('bundle-size.ts')) {
  const dist = path.resolve(process.argv[2] ?? 'packages/client/dist');
  if (!existsSync(path.join(dist, 'index.html'))) {
    console.error(`No build found in ${dist}. Run "npm run build" first.`);
    process.exit(1);
  }
  const r = firstDownload(dist);
  for (const f of r.files)
    console.log(`  ${f.file.padEnd(40)} ${kb(f.bytes).padStart(9)}  (gzip ${kb(f.gzip)})`);
  console.log(
    `  first download: ${kb(r.total)} (gzip ${kb(r.totalGzip)}), budget ${kb(BUDGET_BYTES)}`,
  );
  if (!r.ok) {
    console.error('  Over budget!');
    process.exit(1);
  }
}
