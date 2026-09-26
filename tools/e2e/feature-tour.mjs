// Feature tour: plays every feature of the game in a real browser (scripted inputs through
// the game's own input system) and checks what happened in the simulation. Writes
// report.json + one screenshot per check into --out.
//
//   npm start                                   (another window)
//   node tools/e2e/feature-tour.mjs --url http://localhost:7777 --out tour
//
// Needs Playwright (npm i -D playwright && npx playwright install chromium), or set
// PLAYWRIGHT_PATH to an existing install. Optional: --host path/to/LethalRecoil-Host to also test
// the host app and its dashboard.
/* global T */ // in-page test helpers (window.T), used inside page.evaluate callbacks
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const URL_ = arg('url', 'http://localhost:7777');
const OUT = path.resolve(arg('out', 'tour'));
const HOST = arg('host', '');
mkdirSync(OUT, { recursive: true });

const pw = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright').catch(() => {
  console.error(
    'Playwright is not installed: npm i -D playwright && npx playwright install chromium',
  );
  process.exit(1);
});
const { chromium } = pw.default ?? pw;
const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

// ------------------------------------------------------------------------------------------
const B = {
  F: 1,
  Back: 2,
  L: 4,
  R: 8,
  Jump: 16,
  Crouch: 32,
  Dash: 64,
  Fire: 128,
  Alt: 256,
  Melee: 512,
  Grenade: 1024,
  Recall: 2048,
  Mag: 4096,
};
const results = [];
const errors = [];

/** In-page helpers (window.T) available on every page. */
const HELPERS = () => {
  const T = {
    ev: [],
    app: () => window.__spaceyz.app,
    tools: () => window.__spaceyz.tools,
    s: () => T.app().client.session,
    w: () => T.s().world(),
    me: () => T.s().local(),
    hook() {
      T.ev = [];
      T.app().client.addFeature({ events: (_c, e) => T.ev.push(...e) });
    },
    has: (type, pred = () => true) => T.ev.some((e) => e.type === type && pred(e)),
    count: (type) => T.ev.filter((e) => e.type === type).length,
    btn: (mask) => {
      T.app().input.debugButtons = mask;
    },
    view(q) {
      const me = T.me();
      T.app().client.fps.reset(q, me ? me.up : { x: 0, y: 1, z: 0 });
    },
    yaw: (y, p = 0) => T.view(T.tools().view(y, p)),
    eye() {
      const e = T.s().localEye();
      return { x: e.x, y: e.y, z: e.z };
    },
    lookAt: (p) => T.view(T.tools().lookAt(T.eye(), p, T.me().up)),
    place(pos, yaw) {
      const me = T.me();
      me.pos = { x: pos.x, y: pos.y + 0.9, z: pos.z };
      me.vel = { x: 0, y: 0, z: 0 };
      if (yaw !== undefined) T.yaw(yaw);
    },
    speed: () => {
      const v = T.me().vel;
      return Math.hypot(v.x, v.z);
    },
    myB: () => T.w().boomerangs.find((b) => b.owner === T.s().localId),
    /** if the Boomerang is lying somewhere, walk over it (test helper) */
    recover() {
      const b = T.myB();
      if (b && b.phase === 3) T.me().pos = { ...b.pos, y: b.pos.y + 0.9 };
    },
  };
  window.T = T;
};

const newPage = async (name, settings = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text()))
      errors.push(`${name}: ${m.text()}`);
  });
  await p.addInitScript(
    (s) => {
      localStorage.setItem(
        'spaceyz.settings.v1',
        JSON.stringify({ fullscreenOnPlay: false, ...s }),
      );
    },
    { ...settings },
  );
  await p.addInitScript(HELPERS);
  return p;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shotName = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') + '.png';

/** Run one check: fn returns { pass, note } (or throws). Screenshot of `page` afterwards. */
const check = async (area, name, page, fn) => {
  const t0 = Date.now();
  let pass = false;
  let note;
  try {
    const r = await fn();
    pass = !!r.pass;
    note = r.note ?? '';
  } catch (e) {
    note = `error: ${String(e.message ?? e).split('\n')[0]}`;
  }
  let shot = null;
  if (page) {
    shot = shotName(`${area}-${name}`);
    await page.screenshot({ path: path.join(OUT, shot) }).catch(() => (shot = null));
  }
  results.push({ area, name, pass, note, ms: Date.now() - t0, shot });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${area} · ${name}${note ? `  (${note})` : ''}`);
};

const until = async (page, fn, arg, ms = 5000) => {
  try {
    await page.waitForFunction(fn, arg, { timeout: ms, polling: 50 });
    return true;
  } catch {
    return false;
  }
};

// ==========================================================================================
// 1. Menus & settings
{
  const p = await newPage('menus');
  await p.goto(`${URL_}/?autotest`);
  await p.waitForTimeout(1200);
  await check('Menus', 'Title screen and server connection', p, async () => {
    const title = await p.locator('h1.title').innerText();
    const ok = await until(
      p,
      () => /connected/i.test(document.querySelector('.title-screen .status')?.textContent ?? ''),
      null,
      4000,
    );
    return { pass: /LETHAL RECOIL/.test(title) && ok, note: title };
  });
  await check('Menus', 'Settings: tabs, rebinding a key, crosshair editor', p, async () => {
    await p.click('text=Settings');
    for (const t of ['Video', 'Audio', 'Controls']) await p.click(`button:has-text("${t}")`);
    await p.click('table.binds tr:nth-child(12) button >> nth=1'); // Grenade, 2nd slot
    await p.keyboard.press('KeyG');
    const grenade = await p.evaluate(() => T.app().settings.keybinds.grenade);
    await p.click('button:has-text("Crosshair")');
    await p.selectOption('.settings-list select', 'circle');
    const style = await p.evaluate(() => T.app().settings.crosshair.style);
    await p.click('button:has-text("Audio")');
    const sv = await p.evaluate(() => T.app().settings.soundVisualizer);
    await p.click('text=Back');
    return {
      pass: grenade.includes('KeyG') && style === 'circle' && sv === true,
      note: `grenade=${grenade.join('+')}, crosshair=${style}`,
    };
  });
  await check('Menus', 'Controls help, leaderboards and profile screens open', p, async () => {
    await p.click('text=Controls');
    const rows = await p.locator('table.controls tr').count();
    await p.click('text=Back');
    await p.click('text=Leaderboards');
    await p.waitForTimeout(700);
    const lb = await p.locator('.leaderboard').innerText();
    await p.click('text=Back');
    await p.click('text=Profile');
    await p.waitForTimeout(1200);
    const prof = await p.locator('.profile-name').count();
    await p.click('text=Back');
    return { pass: rows > 8 && lb.length > 0 && prof === 1, note: `${rows} control rows` };
  });
  await p.context().close();
}

// ==========================================================================================
// 2. Movement & gravity (Proving Grounds)
{
  const p = await newPage('movement', { quality: 'medium' });
  await p.goto(`${URL_}/?autotest`);
  await p.waitForTimeout(900);
  await p.click('text=Movement playground');
  await until(p, () => window.T.app().client, null, 20000);
  await p.waitForTimeout(800);
  await p.evaluate(() => T.hook());
  const reset = (pos, yaw) =>
    p.evaluate(
      ([pos, yaw]) => {
        T.btn(0);
        T.place(pos, yaw);
        T.ev = [];
      },
      [pos, yaw],
    );

  await check('Movement', 'Auto-sprint to ~9 m/s', p, async () => {
    await reset({ x: 0, y: 0, z: 14 }, 0);
    await p.waitForTimeout(300);
    await p.evaluate((b) => T.btn(b), B.F);
    await p.waitForTimeout(1300);
    const v = await p.evaluate(() => T.speed());
    await p.evaluate(() => T.btn(0));
    return { pass: v > 8, note: `${v.toFixed(1)} m/s` };
  });
  await check('Movement', 'Jump', p, async () => {
    await reset({ x: 0, y: 0, z: 14 }, 0);
    await p.waitForTimeout(400);
    const y0 = await p.evaluate(() => T.me().pos.y);
    await p.evaluate((b) => T.btn(b), B.Jump);
    await p.waitForTimeout(120);
    await p.evaluate(() => T.btn(0));
    await p.waitForTimeout(200);
    const y1 = await p.evaluate(() => T.me().pos.y);
    const j = await p.evaluate(() => T.has('jump'));
    return { pass: j && y1 > y0 + 0.3, note: `rose ${(y1 - y0).toFixed(2)} m` };
  });
  await check('Movement', 'Slide, then slide-jump keeps speed', p, async () => {
    await reset({ x: 0, y: 0, z: 14 }, 0);
    await p.waitForTimeout(300);
    await p.evaluate((b) => T.btn(b), B.F);
    await p.waitForTimeout(900);
    await p.evaluate((b) => T.btn(b), B.F | B.Crouch);
    await p.waitForTimeout(250);
    const slid = await p.evaluate(() => T.has('slide'));
    const vs = await p.evaluate(() => T.speed());
    await p.evaluate((b) => T.btn(b), B.F | B.Jump);
    await p.waitForTimeout(150);
    const vj = await p.evaluate(() => T.speed());
    await p.evaluate(() => T.btn(0));
    return {
      pass: slid && vs > 9 && vj > 8.5,
      note: `slide ${vs.toFixed(1)} m/s, after jump ${vj.toFixed(1)} m/s`,
    };
  });
  await check('Movement', 'Dash', p, async () => {
    await reset({ x: 0, y: 0, z: 14 }, 0);
    await p.waitForTimeout(400);
    await p.evaluate((b) => T.btn(b), B.Dash);
    await p.waitForTimeout(100);
    const v = await p.evaluate(() => T.speed());
    await p.evaluate(() => T.btn(0));
    return { pass: (await p.evaluate(() => T.has('dash'))) && v > 10, note: `${v.toFixed(1)} m/s` };
  });
  await check('Movement', 'Mantle onto a crate', p, async () => {
    await reset({ x: 8, y: 0, z: 2 }, 0); // crate (8, 0..1.1, -3..-1) straight ahead
    await p.waitForTimeout(300);
    await p.evaluate((b) => T.btn(b), B.F);
    const ok = await until(p, () => T.has('mantle'), null, 2500);
    await p.waitForTimeout(500);
    const y = await p.evaluate(() => T.me().pos.y);
    await p.evaluate(() => T.btn(0));
    return { pass: ok && y > 1.8, note: `on top at y=${y.toFixed(2)}` };
  });
  await check('Movement', 'Wall-jump in the chimney', p, async () => {
    await reset({ x: 26.45, y: 0, z: 14 }, -90); // right next to the +X wall (x=27.2)
    await p.waitForTimeout(300);
    await p.evaluate((b) => T.btn(b), B.F | B.Jump);
    await p.waitForTimeout(150);
    await p.evaluate((b) => T.btn(b), B.F);
    await p.waitForTimeout(250);
    await p.evaluate((b) => T.btn(b), B.F | B.Jump);
    const ok = await until(p, () => T.has('wallJump'), null, 1500);
    await p.evaluate(() => T.btn(0));
    return { pass: ok, note: ok ? 'wall-jump event' : 'no wall-jump' };
  });
  await check('Movement', 'Zip-rail grab and ride', p, async () => {
    await reset({ x: -21.8, y: 4, z: -8.2 }, 180);
    await p.waitForTimeout(300);
    await p.evaluate((b) => T.btn(b), B.Jump);
    const ok = await until(p, () => T.has('railGrab'), null, 1500);
    await p.evaluate(() => T.btn(0));
    await p.waitForTimeout(700);
    const onRail = await p.evaluate(() => !!T.me().rail || T.has('railRelease'));
    return { pass: ok && onRail, note: ok ? 'grabbed the rail' : 'did not reach the rail' };
  });
  await check('Gravity', 'Zero-G: float, push off, thruster, mag-boots', p, async () => {
    await p.evaluate(() => {
      T.s().teleport(4);
      T.app().client.syncCameraToPlayer();
      T.ev = [];
    });
    await p.evaluate((b) => T.btn(b), B.F);
    const floated = await until(p, () => T.me().move === 5, null, 4000);
    await p.evaluate((b) => T.btn(b), B.Jump);
    await p.waitForTimeout(150);
    await p.evaluate(() => T.btn(0));
    await p.waitForTimeout(400);
    await p.evaluate((b) => T.btn(b), B.Jump);
    await p.waitForTimeout(150);
    await p.evaluate((b) => T.btn(b), B.Mag);
    await p.waitForTimeout(150);
    await p.evaluate(() => T.btn(0));
    const r = await p.evaluate(() => ({
      push: T.has('pushOff') || T.has('thruster'),
      thr: T.count('thruster') + T.count('pushOff'),
      mag: T.has('mag'),
    }));
    return {
      pass: floated && r.push && r.mag,
      note: `float ${floated}, push/thruster ×${r.thr}, mag-boots ${r.mag}`,
    };
  });
  await check('Gravity', 'Wall-gravity corridor turns you onto the wall', p, async () => {
    await p.evaluate(() => {
      T.s().teleport(5);
      T.app().client.syncCameraToPlayer();
    });
    await p.evaluate((b) => T.btn(b), B.F);
    const ok = await until(p, () => Math.abs(T.me().up.y) < 0.4, null, 5000);
    await p.waitForTimeout(400);
    const up = await p.evaluate(() => T.me().up);
    await p.evaluate(() => T.btn(0));
    return {
      pass: ok,
      note: `body up (${up.x.toFixed(1)}, ${up.y.toFixed(1)}, ${up.z.toFixed(1)})`,
    };
  });
  await check('Gravity', 'Gravity pad flips the room', p, async () => {
    await p.evaluate(() => {
      T.s().teleport(6);
      T.app().client.syncCameraToPlayer();
      T.ev = [];
    });
    await reset({ x: -76, y: 0, z: 0 }, 90);
    await p.evaluate((b) => T.btn(b), B.F);
    const ok = await until(p, () => T.has('padFlip'), null, 4000);
    await p.evaluate(() => T.btn(0));
    await p.waitForTimeout(900);
    const up = await p.evaluate(() => T.me().up.y);
    return { pass: ok, note: ok ? `flipped (body up y=${up.toFixed(1)})` : 'no flip' };
  });
  await check('Visual', 'Proving Grounds hangar (textures + lights)', p, async () => {
    await p.evaluate(() => {
      T.s().teleport(0);
      T.app().client.syncCameraToPlayer();
    });
    await p.waitForTimeout(600);
    return { pass: true };
  });
  await p.context().close();
}

// ==========================================================================================
// 3. Combat (practice range with dummies)
{
  const p = await newPage('combat', { quality: 'medium' });
  await p.goto(`${URL_}/?autotest`);
  await p.waitForTimeout(900);
  await p.click('text=Practice range');
  await until(p, () => window.T.app().client, null, 20000);
  await p.waitForTimeout(800);
  await p.evaluate(() => T.hook());
  const dummy = (id) => p.evaluate((id) => T.w().players.find((q) => q.id === id), id);
  const aimAtDummy = (id, head = false) =>
    p.evaluate(
      ([id, head]) => {
        const d = T.w().players.find((q) => q.id === id);
        T.lookAt({ x: d.pos.x, y: d.pos.y + (head ? 0.75 : 0.25), z: d.pos.z });
      },
      [id, head],
    );
  const home = () =>
    p.evaluate(() => {
      T.btn(0);
      T.place({ x: -31, y: 0, z: 0 }, -90);
      T.ev = [];
    });
  const waitHeld = async () => {
    if (await until(p, () => T.myB().phase === 0, null, 4000)) return true;
    await p.evaluate(() => T.recover());
    return until(p, () => T.myB().phase === 0, null, 3000);
  };

  await check('Combat', 'Aim shows the throw path; Quick Throw hits a dummy', p, async () => {
    await home();
    await p.waitForTimeout(300);
    await aimAtDummy(2);
    await p.evaluate((b) => T.btn(b), B.Fire);
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, 'combat-aim-preview.png') });
    await p.evaluate(() => T.btn(0));
    await until(p, () => T.has('hit', (e) => e.victim === 2) || T.has('wallHit'), null, 3000);
    const r = await p.evaluate(() => ({
      thrown: T.has('throw'),
      hit: T.has('hit', (e) => e.victim === 2),
      kill: T.has('kill', (e) => e.victim === 2),
    }));
    return { pass: r.thrown && r.hit, note: `throw ${r.thrown}, hit ${r.hit}, kill ${r.kill}` };
  });
  await check('Combat', 'Boomerang comes back and is caught', p, async () => {
    await waitHeld();
    await home();
    await p.evaluate(() => {
      T.yaw(-90, 12);
      T.ev = [];
    }); // into open space
    await p.evaluate((b) => T.btn(b), B.Fire);
    await p.waitForTimeout(300);
    await p.evaluate(() => T.btn(0));
    const ok = await until(p, () => T.has('catch'), null, 6000);
    return {
      pass: ok,
      note: ok
        ? 'caught on the way back'
        : await p.evaluate(() => T.ev.map((e) => e.type).join(',')),
    };
  });
  await check('Combat', 'Killed dummy pops back up', p, async () => {
    await p.evaluate(() => {
      const d = T.w().players.find((q) => q.id === 2);
      d.alive = false;
      d.hp = 0;
    });
    await p.waitForTimeout(1600);
    const d = await dummy(2);
    return { pass: d.alive && d.hp === 100 };
  });
  await check('Combat', 'Curving throw (A/D on release)', p, async () => {
    await waitHeld();
    await home();
    await p.evaluate(() => T.yaw(-90));
    await p.evaluate((b) => T.btn(b), B.Fire);
    await p.waitForTimeout(400);
    await p.evaluate((b) => T.btn(b), B.L);
    await p.waitForTimeout(450);
    const z = await p.evaluate(() => T.myB().pos.z);
    await p.evaluate(() => T.btn(0));
    return { pass: Math.abs(z) > 0.8, note: `sideways drift ${z.toFixed(1)} m` };
  });
  await check('Combat', 'Steering a Boomerang in flight (RMB)', p, async () => {
    await waitHeld();
    await home();
    await p.evaluate(() => T.yaw(-90, 12)); // over the centre platform
    await p.evaluate((b) => T.btn(b), B.Fire);
    await p.waitForTimeout(300);
    await p.evaluate(() => T.btn(0));
    await p.waitForTimeout(60);
    const s0 = await p.evaluate(() => T.myB().steerLeft);
    await p.evaluate(() => T.yaw(-70, 12));
    await p.evaluate((b) => T.btn(b), B.Alt);
    await p.waitForTimeout(250);
    const s1 = await p.evaluate(() => T.myB().steerLeft);
    await p.evaluate(() => T.btn(0));
    return {
      pass: s1 < s0,
      note: `steer meter ${Number(s0).toFixed(0)} → ${Number(s1).toFixed(0)}`,
    };
  });
  await check('Combat', 'Laser (warning line, then the shot)', p, async () => {
    await p.evaluate(() => {
      T.ev = [];
    });
    const away = await p.evaluate(() => T.myB().phase !== 0);
    if (!away) {
      await p.evaluate((b) => T.btn(b), B.Fire);
      await p.waitForTimeout(250);
      await p.evaluate(() => T.btn(0));
      await p.waitForTimeout(100);
    }
    await aimAtDummy(3);
    await p.evaluate((b) => T.btn(b), B.Fire);
    await p.waitForTimeout(80);
    await p.evaluate(() => T.btn(0));
    const ok = await until(p, () => T.has('laserFire'), null, 1500);
    return { pass: (await p.evaluate(() => T.has('laserWarn'))) && ok };
  });
  await check('Combat', 'Lethal Recall (telegraph, then the line)', p, async () => {
    await p.evaluate(() => {
      T.ev = [];
    });
    await p.evaluate((b) => T.btn(b), B.Recall);
    await p.waitForTimeout(100);
    await p.evaluate(() => T.btn(0));
    const ok = await until(p, () => T.has('recallGo'), null, 2000);
    return { pass: (await p.evaluate(() => T.has('recallStart'))) && ok };
  });
  await check('Combat', 'Wind-up Throw: 3 s charge, one-hit kill', p, async () => {
    await waitHeld();
    await home();
    await p.waitForTimeout(300);
    await aimAtDummy(2);
    await p.evaluate((b) => T.btn(b), B.Alt);
    const ready = await until(p, () => T.has('windupReady'), null, 4500);
    await p.screenshot({ path: path.join(OUT, 'combat-windup-line.png') });
    await aimAtDummy(2);
    await p.evaluate((b) => T.btn(b), B.Alt | B.Fire);
    await p.waitForTimeout(120);
    await p.evaluate(() => T.btn(0));
    const kill = await until(p, () => T.has('kill', (e) => e.victim === 2), null, 2000);
    return { pass: ready && kill, note: `ready ${ready}, kill ${kill}` };
  });
  await check('Combat', 'Slash (E)', p, async () => {
    await waitHeld();
    await p.evaluate(() => {
      T.ev = [];
    });
    await p.evaluate((b) => T.btn(b), B.Melee);
    await p.waitForTimeout(100);
    await p.evaluate(() => T.btn(0));
    return { pass: await p.evaluate(() => T.has('slash')) };
  });
  await check('Combat', 'Hard deflect of an incoming Boomerang', p, async () => {
    await p.waitForTimeout(900); // slash cooldown
    await home();
    await p.waitForTimeout(200);
    await p.evaluate(() => {
      const me = T.me();
      const e = T.eye();
      const b = T.w().boomerangs.find((x) => x.owner === 3);
      b.phase = 1;
      b.t = 10;
      b.controller = 3;
      b.pos = { x: e.x + 3.2, y: e.y, z: e.z };
      b.vel = { x: -30, y: 0, z: 0 };
      b.hitIds = [];
      T.lookAt(b.pos);
      T.btn(512);
      void me;
    });
    await p.waitForTimeout(120);
    await p.evaluate(() => T.btn(0));
    return { pass: await p.evaluate(() => T.has('deflect')) };
  });
  await check('Combat', 'Gravity Grenade: throw, pull, pop', p, async () => {
    await home();
    await p.evaluate(() => T.yaw(-90, -10));
    await p.evaluate((b) => T.btn(b), B.Grenade);
    await p.waitForTimeout(100);
    await p.evaluate(() => T.btn(0));
    const act = await until(p, () => T.has('grenadeActivate'), null, 4000);
    const pop = await until(p, () => T.has('grenadePop'), null, 4000);
    return { pass: (await p.evaluate(() => T.has('grenadeThrow'))) && act && pop };
  });
  await check('Combat', 'Picking up a dropped Boomerang', p, async () => {
    await waitHeld();
    await p.evaluate(() => {
      T.ev = [];
      const b = T.myB();
      b.phase = 3;
      b.vel = { x: 0, y: 0, z: 0 };
      b.pos = { ...T.me().pos };
    });
    return { pass: await until(p, () => T.has('pickup'), null, 1500) };
  });
  await p.context().close();
}

// ==========================================================================================
// 4. Bots, sound indicators, offline match (Kestrel)
{
  const p = await newPage('bots');
  await p.goto(`${URL_}/?autotest`);
  await p.waitForTimeout(900);
  await check('Bots', 'Practice vs 5v5 bots; sound indicators show nearby action', p, async () => {
    await p.click('text=Practice vs bots');
    await p.click('text=Free fight (Training Bay)');
    await p.click('button:has-text("5v5")');
    await p.click('text=Start');
    await until(p, () => window.T.app().client, null, 20000);
    let best = [];
    for (let i = 0; i < 16 && best.length < 3; i++) {
      await p.waitForTimeout(500);
      const vis = await p.evaluate(() =>
        [...document.querySelectorAll('.sr-item')].map((e) => e.innerText.replace(/\n/g, ' ')),
      );
      if (vis.length > best.length) best = vis;
    }
    const fights = await p.evaluate(() => T.w().players.reduce((s, q) => s + q.kills, 0));
    return {
      pass: best.length > 0,
      note: `indicators: ${best.slice(0, 4).join(' | ')}; kills so far ${fights}`,
    };
  });
  await check('Bots', 'Sound indicators can be switched off', p, async () => {
    await p.evaluate(() => {
      T.app().settings.soundVisualizer = false;
    });
    await p.waitForTimeout(400);
    const hidden = await p.evaluate(
      () => getComputedStyle(document.querySelector('.sound-radar')).display === 'none',
    );
    await p.evaluate(() => {
      T.app().settings.soundVisualizer = true;
    });
    return { pass: hidden };
  });
  await p.evaluate(() => {
    T.app().stopGame();
    T.app().showTitle();
  });
  await check('Match', 'Offline 1v1 on Kestrel: spawn lock, then live', p, async () => {
    await p.click('text=Practice vs bots');
    await p.click('text=Match (Kestrel)');
    await p.click('button:has-text("1v1")');
    await p.click('text=Start');
    await until(p, () => window.T.app().client, null, 20000);
    await p.evaluate(() => T.hook());
    const lock = await p.evaluate(() => T.s().match().phase === 'spawnLock' && T.me().frozen);
    const live = await until(p, () => T.s().match().phase === 'live', null, 8000);
    const carrier = await p.evaluate(() => T.s().match().carriers.includes(T.s().localId));
    return {
      pass: lock && live && carrier,
      note: `spawn lock ${lock}, live ${live}, you carry the Controller ${carrier}`,
    };
  });
  await check('Match', 'Carrying the Controller to the enemy Tower wins the round', p, async () => {
    const tower = await p.evaluate(() => {
      const m = T.s().match();
      const t = T.s().level.def.towers.find((x) => x.team !== (m.sideSwapped ? 1 : 0));
      return t.pos;
    });
    await p.evaluate((t) => {
      T.place({ x: t.x - Math.sign(t.x) * 3.5, y: 0, z: 0 }, Math.sign(t.x) > 0 ? -90 : 90);
    }, tower);
    const ok = await until(p, () => T.s().match().phase === 'roundEnd', null, 3000);
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => T.s().match().rounds[0]);
    return { pass: ok && r?.reason === 'tower' && r?.winner === 0, note: JSON.stringify(r) };
  });
  await check('Match', 'Scoreboard (Tab)', p, async () => {
    await p.keyboard.down('Tab');
    await p.waitForTimeout(400);
    const visible = await p.evaluate(
      () => getComputedStyle(document.querySelector('.scoreboard')).display !== 'none',
    );
    await p.screenshot({ path: path.join(OUT, 'match-scoreboard-tab.png') });
    await p.keyboard.up('Tab');
    return { pass: visible };
  });
  await check('Match', 'Next round starts; match results screen', p, async () => {
    const r2 = await until(p, () => T.s().match().round === 2, null, 8000);
    await p.evaluate(() => {
      const ms = T.s().opts.match;
      ms.scores = [4, 1];
      const me = T.me();
      void me;
    });
    await until(p, () => T.s().match().phase === 'live', null, 8000);
    const tower = await p.evaluate(() => {
      const m = T.s().match();
      return T.s().level.def.towers.find((x) => x.team !== (m.sideSwapped ? 1 : 0)).pos;
    });
    await p.evaluate((t) => {
      T.place({ x: t.x - Math.sign(t.x) * 3.5, y: 0, z: 0 });
    }, tower);
    const end = await until(p, () => T.s().match().phase === 'matchEnd', null, 10000);
    await p.waitForTimeout(500);
    const title = await p.evaluate(() => document.querySelector('.mr-title')?.textContent);
    return { pass: r2 && end && title === 'VICTORY', note: `results: ${title}` };
  });
  await p.context().close();
}

// ==========================================================================================
// 5. Online: private room, prediction, network panel, report
{
  const a = await newPage('online-A');
  const b = await newPage('online-B');
  await a.goto(`${URL_}/?autotest`);
  await a.waitForTimeout(900);
  await a.click('text=Play online');
  await a.fill('input[placeholder="Your nickname"]', 'TourA');
  await a.press('input[placeholder="Your nickname"]', 'Tab');
  await check('Online', 'Create a private room (code) and a friend joins it', a, async () => {
    await a.click('text=Create room');
    await until(a, () => window.T.app().net?.state === 'room', null, 5000);
    const code = await a.evaluate(() => T.app().net.code);
    await b.goto(`${URL_}/?autotest&join=${code}`);
    await b.waitForTimeout(900);
    await b.fill('input[placeholder="Your nickname"]', 'TourB');
    await b.click('text=Join room');
    const joined = await until(b, () => window.T.app().net?.state === 'room', null, 5000);
    await until(a, () => window.T.app().client && T.app().net.roster.length === 2, null, 5000);
    const roster = await a.evaluate(() => T.app().net.roster.map((r) => r.name));
    return { pass: joined && roster.includes('TourB'), note: `room ${code}: ${roster.join(', ')}` };
  });
  await check('Online', 'Match starts for both players (same round state)', a, async () => {
    const ok = await until(
      a,
      () => ['spawnLock', 'live'].includes(T.app().net.extra?.phase),
      null,
      8000,
    );
    const pb = await b.evaluate(() => T.app().net.extra?.phase);
    return {
      pass: ok && !!pb,
      note: `A: ${await a.evaluate(() => T.app().net.extra?.phase)}, B: ${pb}`,
    };
  });
  await check('Online', 'Throw is predicted instantly and confirmed by the server', a, async () => {
    await until(a, () => T.app().net.extra?.phase === 'live', null, 9000);
    await a.evaluate(() => T.hook());
    await a.evaluate((m) => T.btn(m), B.Fire);
    await a.waitForTimeout(300);
    await a.evaluate(() => T.btn(0));
    const predicted = await until(a, () => T.has('throw'), null, 1500);
    const dbg = await a.evaluate(() => {
      const n = T.app().net;
      const me = n.localPredicted();
      return `phase ${n.extra?.phase}, frozen ${me?.frozen}, input delay ${n.inputDelay}, lead ${n.lastLead}`;
    });
    const confirmed = await until(
      a,
      () => {
        const snap = T.app().net.latest;
        const mine = snap && snap.boomerangs.get(T.app().net.localId);
        return mine && mine.phase !== 0;
      },
      null,
      2000,
    );
    return {
      pass: predicted && confirmed,
      note: `${dbg}, corrections ${await a.evaluate(() => T.app().net.corrections)}`,
    };
  });
  await check('Online', 'Network panel: simulated 150 ms ping still plays', b, async () => {
    await b.evaluate(() => {
      T.app().netSim.delayMs = 150;
      T.app().pause(true);
      document.querySelector('details.net-panel').open = true;
    });
    await b.waitForTimeout(8000); // ping is averaged over a few seconds
    const rtt = await b.evaluate(() => T.app().net.rttMs);
    const stats = await b.evaluate(() => document.querySelector('.net-stats')?.textContent ?? '');
    await b.evaluate(() => {
      T.app().netSim.delayMs = 0;
    });
    return { pass: rtt > 100 && /Ping/.test(stats), note: stats.split('\n')[0] };
  });
  await check('Online', 'Menu scoreboard: report a player', b, async () => {
    await b.evaluate(() => T.app().pause(true));
    const btn = b.locator('.pause-board button:has-text("Report")').first();
    await btn.click();
    const t = await btn.innerText();
    return { pass: /Reported/i.test(t) };
  });
  await a.context().close();
  await b.context().close();
}

// ==========================================================================================
// 6. Ranked: queue, ranked room, forfeit, rating, profile, leaderboard
{
  const c = await newPage('ranked-C');
  const d = await newPage('ranked-D');
  for (const [pg, name] of [
    [c, 'RankC'],
    [d, 'RankD'],
  ]) {
    await pg.goto(`${URL_}/?autotest`);
    await pg.waitForTimeout(900);
    await pg.click('text=Play online');
    await pg.fill('input[placeholder="Your nickname"]', name);
    await pg.press('input[placeholder="Your nickname"]', 'Tab');
    await pg.waitForTimeout(300);
  }
  await check('Ranked', 'Two players queue Ranked 1v1 and are matched', c, async () => {
    await c.click('text=Ranked 1v1');
    await d.click('text=Ranked 1v1');
    const ok = await until(
      c,
      () => window.T.app().net?.state === 'room' && T.app().net.ranked,
      null,
      8000,
    );
    const same =
      (await c.evaluate(() => T.app().net.code)) === (await d.evaluate(() => T.app().net.code));
    return { pass: ok && same, note: `ranked room ${await c.evaluate(() => T.app().net.code)}` };
  });
  await check('Ranked', 'Leaving a ranked match = forfeit; winner gains rating', c, async () => {
    await until(c, () => ['spawnLock', 'live'].includes(T.app().net.extra?.phase), null, 8000);
    await d.evaluate(() => {
      T.app().stopGame();
      T.app().net.leaveRoom();
    });
    const toast = await until(
      c,
      () => [...document.querySelectorAll('.toast')].some((t) => /Rating \+/.test(t.textContent)),
      null,
      5000,
    );
    const text = await c.evaluate(() =>
      [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '),
    );
    return { pass: toast, note: text };
  });
  await check('Ranked', 'Profile shows the ranked game and a login code', c, async () => {
    await c.evaluate(() => {
      T.app().stopGame();
      T.app().net.leaveRoom();
      T.app().showProfile();
    });
    const ok = await until(
      c,
      () => /1\/1 won|1 won|won/.test(document.querySelector('.rank-list')?.textContent ?? ''),
      null,
      4000,
    );
    const code = await c.evaluate(() => document.querySelector('input.login-code')?.value ?? '');
    return {
      pass: ok && /^syz_/.test(code),
      note: (await c.evaluate(() => document.querySelector('.rank-list')?.textContent ?? '')).slice(
        0,
        80,
      ),
    };
  });
  await check('Ranked', 'Leaderboards load from the server', c, async () => {
    await c.evaluate(() => T.app().showTitle());
    await c.click('text=Leaderboards');
    await c.waitForTimeout(800);
    const txt = await c.locator('.leaderboard').innerText();
    return { pass: txt.length > 0 && !/need the game server/.test(txt), note: txt.slice(0, 60) };
  });
  await c.context().close();
  await d.context().close();
}

// ==========================================================================================
// 7. Graphics quality
{
  const p = await newPage('potato', { quality: 'potato' });
  await p.goto(`${URL_}/?autotest`);
  await p.waitForTimeout(900);
  await check('Graphics', 'Potato mode runs (50% resolution, no extras)', p, async () => {
    await p.click('text=Practice range');
    await until(p, () => window.T.app().client, null, 20000);
    await p.waitForTimeout(1500);
    const s = await p.evaluate(() => T.app().dynRes.scale);
    return { pass: s <= 0.5, note: `render scale ${s}` };
  });
  await p.context().close();
  const q = await newPage('high', { quality: 'high' });
  await q.goto(`${URL_}/?autotest`);
  await q.waitForTimeout(900);
  await q.click('text=Practice vs bots');
  await q.click('text=Match (Kestrel)');
  await q.click('text=Start');
  await until(q, () => window.T.app().client, null, 20000);
  await q.waitForTimeout(1200);
  for (const [i, name] of [
    'Cyan hangar',
    'Orange hangar',
    'Atrium',
    'Gallery',
    'Reactor (mid)',
    'Cargo bay',
    'Cargo shaft',
    'Turbine hall',
    'Engine corridor',
  ].entries()) {
    await check('Visual', `Kestrel: ${name}`, q, async () => {
      await q.evaluate((i) => {
        T.s().teleport(i);
        T.app().client.syncCameraToPlayer();
        T.app().client.fps.look(0, -8);
      }, i);
      await q.waitForTimeout(700);
      return { pass: true };
    });
  }
  await q.context().close();
}

// ==========================================================================================
// 8. Host app (optional: --host path/to/LethalRecoil-Host)
if (HOST) {
  const proc = spawn(HOST, ['--no-open', '--no-tunnel', '--port', '7890'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (x) => (log += x));
  proc.stderr.on('data', (x) => (log += x));
  for (let i = 0; i < 60 && !/Host dashboard:/.test(log); i++) await wait(200);
  const dash = /Host dashboard:\s+(\S+)/.exec(log)?.[1];
  const player = await newPage('host-player');
  await player.goto('http://localhost:7890/?autotest');
  await player.waitForTimeout(900);
  await player.click('text=Play online');
  await player.fill('input[placeholder="Your nickname"]', 'Kickme');
  await player.press('input[placeholder="Your nickname"]', 'Tab');
  await player.click('text=Create room');
  await player.waitForTimeout(1500);
  const dp = await newPage('dashboard');
  dp.on('dialog', (dl) => dl.accept());
  await check(
    'Host',
    'Host app serves the game; dashboard lists the player and the room',
    dp,
    async () => {
      await dp.goto(dash);
      await dp.waitForTimeout(2500);
      const players = await dp.locator('#players').innerText();
      const rooms = await dp.locator('#rooms').innerText();
      return { pass: /Kickme/.test(players) && /1v1/.test(rooms), note: 'dashboard ok' };
    },
  );
  await check('Host', 'Dashboard: kick a player', dp, async () => {
    await dp.click('#players button:has-text("Kick")');
    const kicked = await until(player, () => window.T.app().net?.state === 'closed', null, 4000);
    return { pass: kicked };
  });
  await check('Host', 'Dashboard: stop the server cleanly', dp, async () => {
    const exited = new Promise((r) => proc.on('exit', (code) => r(code)));
    await dp.click('#stop');
    const code = await Promise.race([exited, wait(8000).then(() => 'timeout')]);
    return { pass: code === 0, note: `exit code ${code}` };
  });
  await player.context().close();
  await dp.context().close();
  if (proc.exitCode === null) proc.kill();
}

await browser.close();
const passed = results.filter((r) => r.pass).length;
writeFileSync(
  path.join(OUT, 'report.json'),
  JSON.stringify(
    { when: new Date().toISOString(), url: URL_, passed, total: results.length, results, errors },
    null,
    2,
  ),
);
console.log(`\n${passed}/${results.length} checks passed. Page errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
process.exit(passed === results.length && errors.length === 0 ? 0 : 1);
