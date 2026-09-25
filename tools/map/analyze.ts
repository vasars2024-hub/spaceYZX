// npm run map — analyse a map's layout for competitive play and draw its floor plans.
//
//   npm run map -- [map-id] [--out dir] [--png] [--quick] [--spacing 1] [--no-heat]
//                  [--png-scale 2] [--playwright path/to/playwright/index.js]
//
// Defaults: map "kestrel", output folder tools/map/out. Prints a markdown report and writes
// report.md, report.json and SVG plans (open them in a browser). --png also saves PNGs,
// rendered by Playwright's Chromium: pass --playwright (or set PLAYWRIGHT_PATH) when
// playwright is installed somewhere else than this repo's node_modules. --quick uses a
// coarser grid and fewer rays (a few seconds instead of ~15).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildLevel, mapDef, MAPS } from '@space-yz/shared';
import { analyzeMap, defaultOptions, type Analysis } from './metrics';
import { mapConfig } from './maps';
import {
  BANDS,
  chokeHeat,
  coverHeat,
  exposureHeat,
  renderPlan,
  sightlineHeat,
  spawnHeat,
  type PlanOptions,
} from './plan';
import { renderMarkdown } from './report';

const VALUE_FLAGS = ['out', 'spacing', 'png-scale', 'playwright'];
const SWITCHES = ['png', 'quick', 'no-heat', 'help'];

const USAGE = `Usage: npm run map -- [map-id] [options]

  map-id              kestrel (default), or any map id of the game
  --out <folder>      where to write the plans and the report (default tools/map/out)
  --png               also save PNG pictures of the plans (needs Playwright)
  --playwright <path> path to an installed playwright's index.js (or set PLAYWRIGHT_PATH)
  --png-scale <n>     PNG resolution multiplier (default 2)
  --quick             coarser grid and fewer rays: a few seconds instead of ~15
  --spacing <m>       walkable grid spacing in metres (default 1, quick 2)
  --no-heat           only the two plain floor plans, no heat maps`;

/** Options the command line does not know (typos), e.g. ["--pngs"]. */
export const unknownOptions = (argv: string[]): string[] =>
  argv.filter(
    (a) =>
      a.startsWith('--') && !VALUE_FLAGS.includes(a.slice(2)) && !SWITCHES.includes(a.slice(2)),
  );

export interface CliArgs {
  map: string;
  out: string;
  png: boolean;
  quick: boolean;
  heat: boolean;
  spacing: number | null;
  pngScale: number;
  /** module path of an installed playwright (else PLAYWRIGHT_PATH, else "playwright") */
  playwright: string | null;
}

export const parseArgs = (argv: string[]): CliArgs => {
  const val = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')
      ? argv[i + 1]
      : undefined;
  };
  const positional = argv.filter(
    (a, i) =>
      !a.startsWith('--') && !(i > 0 && VALUE_FLAGS.includes(argv[i - 1].replace(/^--/, ''))),
  );
  const spacing = val('spacing');
  return {
    map: positional[0] ?? 'kestrel',
    out: val('out') ?? path.join('tools', 'map', 'out'),
    png: argv.includes('--png'),
    quick: argv.includes('--quick'),
    heat: !argv.includes('--no-heat'),
    spacing: spacing ? Number(spacing) : null,
    pngScale: Number(val('png-scale') ?? '2'),
    playwright: val('playwright') ?? null,
  };
};

/** SVG plans for an analysis: [file name, svg] pairs. */
export const plans = (a: Analysis, heat = true): [string, string][] => {
  const id = a.report.map.id;
  const an = a.analyzer;
  const name = a.report.map.name;
  const out: [string, string][] = [];
  const plan = (file: string, o: PlanOptions) => out.push([`${id}-${file}.svg`, renderPlan(an, o)]);
  plan('ground', { band: BANDS.ground, title: `${name} — floor plan, ground level` });
  plan('upper', { band: BANDS.upper, title: `${name} — floor plan, upper level` });
  if (heat) {
    const L = a.layers;
    const o = a.report.options;
    // the longest sightlines, numbered as in the report, on the plan of the height they start at
    const longest = a.report.sightlines.longest
      .slice(0, 8)
      .map((l, i) => ({ ...l, label: `#${i + 1}` }));
    const ground = longest.filter((l) => Math.min(l.from.y, l.to.y) < BANDS.upper.lo);
    const upper = longest.filter((l) => Math.max(l.from.y, l.to.y) >= BANDS.upper.lo);
    plan('sightlines-ground', {
      band: BANDS.ground,
      title: `${name} — sightline heat map, ground level`,
      heat: sightlineHeat(L.sight, o.sightRays, o.sightPitchDeg, ground.length > 0),
      lines: ground,
    });
    plan('sightlines-upper', {
      band: BANDS.upper,
      title: `${name} — sightline heat map, upper level`,
      heat: sightlineHeat(L.sight, o.sightRays, o.sightPitchDeg, upper.length > 0),
      lines: upper,
    });
    plan('cover-ground', {
      band: BANDS.ground,
      title: `${name} — open ground (distance to cover)`,
      heat: coverHeat(L.cover, a.report.openGround.threshold),
    });
    plan('exposure-ground', {
      band: BANDS.ground,
      title: `${name} — exposure (killing fields)`,
      heat: exposureHeat(L.exposure, a.report.openGround.viewers),
    });
    plan('spawn-exposure-ground', {
      band: BANDS.ground,
      title: `${name} — spawn exposure`,
      heat: spawnHeat(L.spawnView),
    });
    if (a.analyzer.config.chokepoints.length)
      plan('chokepoints-ground', {
        band: BANDS.ground,
        title: `${name} — chokepoint coverage`,
        heat: chokeHeat(L.chokeView),
        chokepoints: true,
      });
  }
  return out;
};

interface PwPage {
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  setContent(html: string): Promise<void>;
  screenshot(o: { path: string; fullPage?: boolean }): Promise<unknown>;
}
interface PwBrowser {
  newPage(o?: { deviceScaleFactor?: number }): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwModule {
  chromium: { launch(o?: object): Promise<PwBrowser> };
}

/** Render SVG files to PNG next to them with Playwright's Chromium. Returns the PNG paths. */
export const writePngs = async (
  svgFiles: string[],
  scale: number,
  playwright: string | null = null,
): Promise<string[]> => {
  const spec = playwright ?? process.env.PLAYWRIGHT_PATH ?? 'playwright';
  let mod: { default?: PwModule } & Partial<PwModule>;
  try {
    mod = await import(path.isAbsolute(spec) ? pathToFileURL(spec).href : spec);
  } catch {
    console.error(
      `Playwright not found (${spec}), so no PNGs were written (the SVG plans are there). Point --playwright or PLAYWRIGHT_PATH at an installed playwright's index.js.`,
    );
    return [];
  }
  const chromium = (mod.default ?? (mod as PwModule)).chromium;
  const browser = await chromium.launch();
  const out: string[] = [];
  try {
    const page = await browser.newPage({ deviceScaleFactor: scale });
    for (const f of svgFiles) {
      const svg = readFileSync(f, 'utf8');
      const m = /width="(\d+)" height="(\d+)"/.exec(svg);
      if (!m) continue;
      await page.setViewportSize({ width: Number(m[1]), height: Number(m[2]) });
      await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
      const png = f.replace(/\.svg$/, '.png');
      await page.screenshot({ path: png, fullPage: true });
      out.push(png);
    }
  } finally {
    await browser.close();
  }
  return out;
};

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    console.log(USAGE);
    return;
  }
  const unknown = unknownOptions(argv);
  if (unknown.length) {
    console.error(`Unknown option ${unknown.join(', ')}.\n\n${USAGE}`);
    process.exit(1);
  }
  const args = parseArgs(argv);
  const info = MAPS.find((m) => m.id === args.map);
  if (!info) {
    console.error(`Unknown map "${args.map}". Maps: ${MAPS.map((m) => m.id).join(', ')}`);
    process.exit(1);
  }
  const outDir = path.resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  const opts = { ...defaultOptions(args.quick), log: (m: string) => console.error(m) };
  if (args.spacing) opts.spacing = args.spacing;
  console.error(`Analysing ${info.name}${args.quick ? ' (quick)' : ''}…`);
  const t0 = performance.now();
  const def = mapDef(info.id);
  const analysis = analyzeMap(buildLevel(def), mapConfig(info.id, def), opts);
  const files: string[] = [];
  for (const [name, svg] of plans(analysis, args.heat)) {
    const f = path.join(outDir, name);
    writeFileSync(f, svg);
    files.push(f);
  }
  if (args.png) files.push(...(await writePngs(files.slice(), args.pngScale, args.playwright)));
  const md = path.join(outDir, 'report.md');
  const json = path.join(outDir, 'report.json');
  files.push(md, json);
  const report = renderMarkdown(
    analysis.report,
    files.map((f) => path.relative(outDir, f)),
  );
  writeFileSync(md, report);
  writeFileSync(json, JSON.stringify(analysis.report, null, 2) + '\n');
  console.log(report);
  console.error(`Done in ${((performance.now() - t0) / 1000).toFixed(1)} s. Files in ${outDir}:`);
  for (const f of files) console.error(`  ${path.relative(outDir, f)}`);
};

if (process.argv[1] && /map[\\/]analyze\.ts$/.test(process.argv[1])) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
