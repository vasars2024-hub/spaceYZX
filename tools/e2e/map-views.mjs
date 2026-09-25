// Map views: screenshots of Kestrel from a list of named viewpoints (for reviewing the level
// art and layout). Starts an offline Kestrel match, freezes the bots (one stands in each shot
// for scale) and saves one PNG per viewpoint into --out.
//
//   npm start                                  (another window)
//   node tools/e2e/map-views.mjs --url http://localhost:7777 --out map-views
//
// Needs Playwright (see tools/e2e/feature-tour.mjs), or PLAYWRIGHT_PATH to an existing install.
/* global T */ // in-page helpers (window.T), used inside page.evaluate callbacks
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const URL_ = arg('url', 'http://localhost:7777');
const OUT = path.resolve(arg('out', 'map-views'));
const ONLY = arg('only', '');
mkdirSync(OUT, { recursive: true });

const pw = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright').catch(() => {
  console.error(
    'Playwright is not installed: npm i -D playwright && npx playwright install chromium',
  );
  process.exit(1);
});
const { chromium } = pw.default ?? pw;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/**
 * Viewpoints on the cyan (-X) half; yaw 0 looks toward -Z, -90 toward +X (the enemy side),
 * 90 toward -X, 180 toward +Z. `mate` = where the frozen bot stands (for scale).
 */
const VIEWS = [
  {
    name: '01 hangar from the ready deck',
    pos: [-95, 5, -2],
    yaw: -90,
    pitch: -12,
    mate: [-84, 0, 3],
  },
  {
    name: '02 hangar floor to the airlock',
    pos: [-90, 0, 10],
    yaw: -115,
    pitch: 2,
    mate: [-78, 0, 11],
  },
  {
    name: '03 airlock into the atrium',
    pos: [-75.5, 0, 0],
    yaw: -90,
    pitch: 2,
    mate: [-62, 0, -2],
  },
  {
    name: '04 atrium: floor, shelf and ramp',
    pos: [-66, 0, -13],
    yaw: -135,
    pitch: 8,
    mate: [-58, 0, 6],
  },
  {
    name: '05 atrium shelf toward the gallery',
    pos: [-55, 6, 13],
    yaw: -95,
    pitch: -4,
    mate: [-40, 6, 9],
  },
  {
    name: '06 trench toward the reactor',
    pos: [-45, 0, -9],
    yaw: -80,
    pitch: 4,
    mate: [-30, 0, -3],
  },
  { name: '07 gallery colonnade', pos: [-45, 6, 12], yaw: -100, pitch: -8, mate: [-33, 0, -4] },
  {
    name: '08 reactor room from the trench',
    pos: [-19.5, 0, -1],
    yaw: -90,
    pitch: 10,
    mate: [-8, 0, 8],
  },
  {
    name: '09 reactor balcony and zip-rail',
    pos: [-18, 6, 15],
    yaw: -100,
    pitch: -12,
    mate: [-5, 2, -4],
  },
  {
    name: '10 cargo bay from the hangar door',
    pos: [-74, 0, 28],
    yaw: -95,
    pitch: 4,
    mate: [-62, 3, 36],
  },
  { name: '11 loading dock', pos: [-68, 3, 38], yaw: -85, pitch: -4, mate: [-52, 3, 35] },
  { name: '12 conveyor zigzag', pos: [-49, 3, 34], yaw: -90, pitch: 0, mate: [-40.5, 3, 37] },
  { name: '13 cargo shaft (zero-G)', pos: [-27, 3, 36], yaw: -90, pitch: 6, mate: [-14, 3, 30] },
  { name: '14 turbine hall', pos: [-74, 0, -27], yaw: -110, pitch: 6, mate: [-61, 0, -30] },
  { name: '15 engine corridor mouth', pos: [-51, 0, -33], yaw: -90, pitch: 6, mate: [-40, 0, -30] },
  {
    name: '17 reactor window into the cargo shaft',
    pos: [-6, 6, 12],
    yaw: 180,
    pitch: 12,
    mate: [3, 6, 16],
  },
  { name: '16 crawl vent', pos: [-51.5, 0, -14], yaw: 180, pitch: -18, mate: [-56, 0, -22] },
];

const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.addInitScript(() => {
  localStorage.setItem(
    'spaceyz.settings.v1',
    JSON.stringify({ fullscreenOnPlay: false, quality: 'high' }),
  );
  window.T = {
    app: () => window.__spaceyz.app,
    tools: () => window.__spaceyz.tools,
    s: () => window.T.app().client.session,
  };
});
p.on('pageerror', (e) => console.error('page error:', e.message));
await p.goto(`${URL_}/?autotest`);
await p.waitForTimeout(900);
await p.click('text=Practice vs bots');
await p.click('text=Match (Kestrel)');
await p.click('text=Start');
for (let i = 0; i < 100; i++) {
  if (await p.evaluate(() => !!window.T.app().client)) break;
  await p.waitForTimeout(200);
}
await p.waitForTimeout(1500);

for (const v of VIEWS) {
  if (ONLY && !v.name.includes(ONLY)) continue;
  await p.evaluate((v) => {
    const w = T.s().world();
    const me = T.s().local();
    for (const q of w.players) {
      if (q.id === me.id) continue;
      q.frozen = true;
      q.pos = { x: v.mate[0], y: v.mate[1] + 0.9, z: v.mate[2] };
      q.vel = { x: 0, y: 0, z: 0 };
    }
    me.pos = { x: v.pos[0], y: v.pos[1] + 0.9, z: v.pos[2] };
    me.vel = { x: 0, y: 0, z: 0 };
    T.app().client.fps.reset(T.tools().view(v.yaw, v.pitch), me.up);
  }, v);
  await p.waitForTimeout(450);
  await p.screenshot({ path: path.join(OUT, `${v.name.replace(/[^a-z0-9]+/gi, '-')}.png`) });
  console.log('saved', v.name);
}
await browser.close();
