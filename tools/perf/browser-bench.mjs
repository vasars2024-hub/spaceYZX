// Frame-time benchmark in a real browser, simulating a weak laptop: Chrome's CPU throttling
// plus software rendering (SwiftShader), running a scripted 5v5 bot match on the default match
// map (or --map kestrel / --map split-deck).
//
//   npm start                      (in another window)
//   node tools/perf/browser-bench.mjs --url http://localhost:7777 --cpu 4 --quality potato
//
// Needs Playwright:  npm i -D playwright  (then: npx playwright install chromium)
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const url = arg('url', 'http://localhost:7777');
const cpu = Number(arg('cpu', '4'));
const quality = arg('quality', 'medium');
const seconds = Number(arg('seconds', '20'));
const map = arg('map', '');

let playwright;
try {
  playwright = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright');
} catch {
  console.error(
    'Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium',
  );
  process.exit(1);
}
const { chromium } = playwright.default ?? playwright;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript((q) => {
  const key = 'spaceyz.settings.v1';
  const s = JSON.parse(localStorage.getItem(key) ?? '{}');
  localStorage.setItem(key, JSON.stringify({ ...s, quality: q, fullscreenOnPlay: false }));
}, quality);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
await page.goto(`${url}/?autotest&bench=${seconds}${map ? `&map=${encodeURIComponent(map)}` : ''}`);
await page.waitForFunction(() => window.__spaceyz?.bench, null, { timeout: (seconds + 60) * 1000 });
const r = await page.evaluate(() => window.__spaceyz.bench);
console.log(
  `quality ${r.quality}, CPU ${cpu}x slower, software GL: ${r.fps.toFixed(1)} FPS avg, ` +
    `p95 ${r.p95Ms.toFixed(1)} ms, p99 ${r.p99Ms.toFixed(1)} ms, frame code ${r.cpuMs.toFixed(1)} ms, ${r.drawCalls} draw calls, ` +
    `${(r.triangles / 1000).toFixed(0)}k triangles, render scale ${Math.round(r.renderScale * 100)}%`,
);
if (errors.length) console.log('page errors:', errors.slice(0, 5));
await browser.close();
