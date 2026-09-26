import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { firstDownload, BUDGET_BYTES } from '../bundle-size';
import { capacity } from '../../../packages/server/src/perf-budget';

describe('bundle size check', () => {
  it('counts index.html and the files it loads, not lazy chunks', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'syz-size-'));
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(
      path.join(dir, 'index.html'),
      '<script type="module" src="/assets/a.js"></script><link rel="stylesheet" href="/assets/a.css">',
    );
    writeFileSync(path.join(dir, 'assets/a.js'), 'x'.repeat(1000));
    writeFileSync(path.join(dir, 'assets/a.css'), 'y'.repeat(200));
    writeFileSync(path.join(dir, 'assets/lazy.js'), 'z'.repeat(9_000_000));
    const r = firstDownload(dir);
    expect(r.files.map((f) => f.file).sort()).toEqual([
      'assets/a.css',
      'assets/a.js',
      'index.html',
    ]);
    expect(r.ok).toBe(true);
    writeFileSync(path.join(dir, 'assets/a.js'), 'x'.repeat(BUDGET_BYTES + 1));
    expect(firstDownload(dir).ok).toBe(false);
  });
});

describe('capacity estimate', () => {
  it('is limited by upload on home internet and by CPU on fast lines', () => {
    const home = capacity('5v5', 10);
    expect(home.limit).toBe('upload');
    expect(home.matches).toBeGreaterThanOrEqual(1);
    const fibre = capacity('1v1', 1000);
    expect(fibre.limit).toBe('cpu');
    expect(fibre.players).toBe(fibre.matches * 2);
    expect(capacity('5v5', 0.5).matches).toBe(0);
  });
});
