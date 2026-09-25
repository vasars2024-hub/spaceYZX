// Name tags & indicators check: plays offline practice matches in a real browser, stages
// situations (teammate in view / behind a wall / near / far, enemies hidden / revealed / under
// the crosshair, the enemy carrier in view, dropped Controllers, the half-time side swap, wall
// gravity, the scoreboard, a sound while looking up/down) and checks what the screen shows
// through the DOM. Writes report.json + one screenshot per check into --out.
//
//   npm start                                   (another window)
//   node tools/e2e/indicators.mjs --url http://localhost:7777 --out screenshots/indicators
//
// Needs Playwright (npm i -D playwright && npx playwright install chromium), or set
// PLAYWRIGHT_PATH to an existing install.
/* global T */ // in-page test helpers (window.T), used inside page.evaluate callbacks
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const URL_ = arg('url', 'http://localhost:7777');
const OUT = path.resolve(arg('out', 'screenshots/indicators'));
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

const results = [];
const errors = [];

/** In-page helpers (window.T). */
const HELPERS = () => {
  const T = {
    app: () => window.__spaceyz.app,
    tools: () => window.__spaceyz.tools,
    s: () => T.app().client.session,
    w: () => T.s().world(),
    me: () => T.s().local(),
    /** offline MatchState (the rules state the local session runs) */
    ms: () => T.s().opts.match,
    combat: () => T.app().client.features.find((f) => f.models && f.hud),
    player: (id) => T.w().players.find((q) => q.id === id),
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
    /** put a player's feet at `feet` (standing still) */
    put(id, feet) {
      const q = T.player(id);
      q.pos = { x: feet.x, y: feet.y + 0.9, z: feet.z };
      q.vel = { x: 0, y: 0, z: 0 };
    },
    chest: (id) => {
      const q = T.player(id);
      return { x: q.pos.x, y: q.pos.y + 0.3, z: q.pos.z };
    },
    /** bots stand still and can't be hurt; no carrier reveal pulses; a long round */
    stage() {
      const ms = T.ms();
      if (ms) {
        ms.rules.carrierRevealEverySec = 1e6;
        ms.roundEnds = T.w().tick + 60 * 600;
      }
      for (const q of T.w().players) if (q.id !== T.s().localId) q.frozen = true;
    },
    /** what the marker layer shows right now */
    tags(sel = '.wm') {
      return [...document.querySelectorAll(sel)].map((e) => {
        const r = e.getBoundingClientRect();
        return {
          key: e.dataset.key,
          text: e.querySelector('.wm-text')?.textContent ?? '',
          cls: e.className,
          opacity: Number(getComputedStyle(e).opacity),
          color: getComputedStyle(e).color,
          fontPx: parseFloat(getComputedStyle(e).fontSize),
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          rect: { l: r.left, r: r.right, t: r.top, b: r.bottom },
        };
      });
    },
    tag: (key) => T.tags(`.wm[data-key="${key}"]`)[0] ?? null,
    /**
     * Clamped marker: does its arrow point the way it sits from the screen centre? Returns
     * the difference in degrees (0 = consistent), or null if it has no visible arrow.
     */
    arrowError(key) {
      const el = document.querySelector(`.wm[data-key="${key}"]`);
      const a = el?.querySelector('.wm-arrow');
      if (!a || getComputedStyle(a).display === 'none') return null;
      const m = /matrix\(([^,]+),\s*([^,]+)/.exec(getComputedStyle(a).transform);
      if (!m) return null;
      const arrow = Math.atan2(Number(m[2]), Number(m[1])); // CSS rotation, clockwise
      const r = el.getBoundingClientRect();
      const fromCentre = Math.atan2(
        r.left + r.width / 2 - innerWidth / 2,
        -(r.top + r.height / 2 - innerHeight / 2),
      );
      const d = Math.atan2(Math.sin(arrow - fromCentre), Math.cos(arrow - fromCentre));
      return Math.abs((d * 180) / Math.PI);
    },
    /** 3D text labels on player models (there should be none: tags are screen-space) */
    sprites() {
      let n = 0;
      T.combat().models.group.traverse((o) => {
        if (o.isSprite) n++;
      });
      return n;
    },
    /** screen elements naming `name` (tags only; hidden scoreboards don't count) */
    named: (name) => T.tags().filter((t) => t.text.includes(name)).length,
  };
  window.T = T;
};

const newPage = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text()))
      errors.push(`${name}: ${m.text()}`);
  });
  await p.addInitScript(() => {
    localStorage.setItem('spaceyz.settings.v1', JSON.stringify({ fullscreenOnPlay: false }));
  });
  await p.addInitScript(HELPERS);
  return p;
};

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

/**
 * Start an offline practice game from the title screen. Matches are staged only once the
 * round is live: the spawn lock's end would unfreeze the bots and reset the round timer.
 * (On a slow machine the simulation runs slower than real time, so wait generously.)
 */
const startPractice = async (p, kind, size) => {
  await p.goto(`${URL_}/?autotest`);
  await p.waitForTimeout(900);
  await p.click('text=Practice vs bots');
  await p.click(kind === 'match' ? 'text=Match (Kestrel)' : 'text=Free fight (Training Bay)');
  await p.click(`button:has-text("${size}v${size}")`);
  await p.click('text=Start');
  const started = await until(p, () => !!window.T.app().client, null, 30000);
  const live =
    started &&
    (kind !== 'match' || (await until(p, () => T.s().match().phase === 'live', null, 60000)));
  if (!live) errors.push(`${kind} ${size}v${size}: the game never got going (not staged)`);
  else await p.evaluate(() => T.stage());
};

const overlapping = (tags) => {
  const out = [];
  for (let i = 0; i < tags.length; i++)
    for (let j = i + 1; j < tags.length; j++) {
      const a = tags[i].rect;
      const b = tags[j].rect;
      if (a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1)
        out.push(`${tags[i].key}/${tags[j].key}`);
    }
  return out;
};

// ==========================================================================================
// 1. Offline 2v2 match on Kestrel: you (1) + Nova (2) vs Vega (3, carrier) + Orion (4)
{
  const p = await newPage('2v2');
  await startPractice(p, 'match', 2);
  // the reactor floor below the north balcony: 40 m of open floor along z 12.5
  const HALL = { x: -18.5, y: 0, z: 12.5 };
  await p.evaluate((h) => T.put(1, h), HALL);

  await check('Name tags', 'Teammate in view: exactly one tag, bright', p, async () => {
    await p.evaluate(() => {
      T.put(2, { x: -8, y: 0, z: 12.5 });
      T.put(3, { x: -31, y: 0, z: -10 }); // enemy in the trench, behind the reactor wall
      T.put(4, { x: 8, y: 0, z: 11.5 }); // enemy across the reactor, in view
    });
    await p.waitForTimeout(300);
    await p.evaluate(() => T.lookAt(T.chest(2)));
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => ({
      tag: T.tag('ally-2'),
      named: T.named('Nova'),
      sprites: T.sprites(),
    }));
    return {
      pass:
        !!r.tag &&
        r.named === 1 &&
        r.sprites === 0 &&
        r.tag.text === 'Nova (ally)' &&
        !r.tag.cls.includes('wm-occluded') &&
        r.tag.opacity > 0.85,
      note: `"${r.tag?.text}" opacity ${r.tag?.opacity}, tags naming Nova: ${r.named}, 3D labels: ${r.sprites}`,
    };
  });

  await check('Name tags', 'Teammate behind a wall: still one tag, dimmed', p, async () => {
    await p.evaluate(() => T.put(2, { x: -84, y: 0, z: 22 })); // in the hangar
    await p.waitForTimeout(300);
    await p.evaluate(() => T.lookAt(T.chest(2)));
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => ({ tag: T.tag('ally-2'), named: T.named('Nova') }));
    return {
      pass: !!r.tag && r.named === 1 && r.tag.cls.includes('wm-occluded') && r.tag.opacity < 0.6,
      note: `opacity ${r.tag?.opacity}, class "${r.tag?.cls}"`,
    };
  });

  await check('Name tags', 'Same size near and far (only a little fainter)', p, async () => {
    const at = async (feet) => {
      await p.evaluate((f) => T.put(2, f), feet);
      await p.waitForTimeout(300);
      await p.evaluate(() => T.lookAt(T.chest(2)));
      await p.waitForTimeout(600);
      return p.evaluate(() => T.tag('ally-2'));
    };
    const near = await at({ x: -12.5, y: 0, z: 12.5 }); // 6 m
    const far = await at({ x: 19.5, y: 0, z: 12.5 }); // 38 m, across the reactor
    const size = (t) => ({ w: t.rect.r - t.rect.l, h: t.rect.b - t.rect.t });
    const a = near && size(near);
    const b = far && size(far);
    const seen = (t) => !!t && !t.cls.includes('wm-occluded');
    return {
      pass:
        seen(near) &&
        seen(far) &&
        Math.abs(a.w - b.w) < 1 &&
        Math.abs(a.h - b.h) < 0.5 &&
        far.opacity < near.opacity &&
        far.opacity > 0.75,
      note: `6 m: ${a?.w.toFixed(1)}×${a?.h.toFixed(1)} px, opacity ${near?.opacity}; 38 m: ${b?.w.toFixed(1)}×${b?.h.toFixed(1)} px, opacity ${far?.opacity}`,
    };
  });

  await check('Name tags', 'Scoreboard held (Tab): tags and markers step aside', p, async () => {
    await p.evaluate(() => T.put(2, { x: -8, y: 0, z: 12.5 }));
    await p.waitForTimeout(300);
    await p.evaluate(() => T.lookAt(T.chest(2)));
    await p.waitForTimeout(500);
    const before = await p.evaluate(() => T.tags().map((t) => t.key));
    await p.keyboard.down('Tab');
    await p.waitForTimeout(400);
    const during = await p.evaluate(() => ({
      tags: T.tags().length,
      board: getComputedStyle(document.querySelector('.scoreboard')).display,
    }));
    await p.screenshot({ path: path.join(OUT, 'name-tags-scoreboard-held.png') });
    await p.keyboard.up('Tab');
    await p.waitForTimeout(400);
    const after = await p.evaluate(() => T.tags().map((t) => t.key));
    return {
      pass:
        before.includes('ally-2') &&
        during.board !== 'none' &&
        during.tags === 0 &&
        [...after].sort().join() === [...before].sort().join(),
      note: `before: ${before.join(', ')}; with the scoreboard: ${during.tags} (board ${during.board}); after: ${after.join(', ')}`,
    };
  });

  await check('Enemies', 'No enemy tags (one behind the wall, one in view)', p, async () => {
    const look = async (target) => {
      await p.evaluate((t) => T.lookAt(t), target);
      await p.waitForTimeout(700);
      return p.evaluate(() => ({
        tags: T.tags().map((t) => t.key),
        names: T.named('Vega') + T.named('Orion'),
        revealed: T.s().match().revealed.length,
      }));
    };
    // Vega stands next to Nova behind the reactor wall (Nova's dim tag shows, Vega's doesn't)
    await p.evaluate(() => T.put(2, { x: -30, y: 0, z: -7.5 }));
    await p.waitForTimeout(300);
    const wall = await look({ x: -31, y: 1.6, z: -10 });
    await p.screenshot({ path: path.join(OUT, 'enemies-behind-wall-no-tag.png') });
    // Orion is across the reactor, in view but not under the crosshair
    const open = await look({ x: 8, y: 1.6, z: 15.5 });
    const enemyTags = [...wall.tags, ...open.tags].filter((k) => /^(enemy|aim)-/.test(k));
    return {
      pass:
        enemyTags.length === 0 &&
        wall.names + open.names === 0 &&
        wall.revealed + open.revealed === 0 &&
        wall.tags.includes('ally-2'),
      note: `behind the wall: ${wall.tags.join(', ') || 'none'}; in view: ${open.tags.join(', ') || 'none'}`,
    };
  });

  await check('Enemies', 'Crosshair on a visible enemy shows its name', p, async () => {
    await p.evaluate(() => T.lookAt(T.chest(4)));
    const ok = await until(p, () => !!T.tag('aim-4'), null, 3000);
    const t = await p.evaluate(() => T.tag('aim-4'));
    return { pass: ok && t.text === 'Orion', note: `"${t?.text}"` };
  });

  await check('Enemies', 'Crosshair on an enemy behind a wall: no name', p, async () => {
    await p.evaluate(() => T.lookAt(T.chest(3)));
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => ({ aim: T.tag('aim-3'), vega: T.named('Vega') }));
    return { pass: !r.aim && r.vega === 0, note: r.aim ? `leaked "${r.aim.text}"` : 'nothing' };
  });

  await check('Enemies', 'Last-seconds reveal: enemies get only ◇/◆ icons', p, async () => {
    await p.evaluate(() => {
      T.lookAt({ x: -31, y: 1.6, z: -10 }); // Vega is behind the reactor wall
      T.ms().roundEnds = T.w().tick + 60 * 8; // inside the last 10 s: everyone revealed
    });
    const ok = await until(p, () => !!T.tag('enemy-3'), null, 3000);
    const r = await p.evaluate(() => ({
      vega: T.tag('enemy-3'),
      names: T.named('Vega') + T.named('Orion'),
      revealed: T.s().match().revealed,
    }));
    await p.screenshot({ path: path.join(OUT, 'enemies-revealed-icons.png') });
    await p.evaluate(() => {
      T.ms().roundEnds = T.w().tick + 60 * 600;
    });
    return {
      // Vega carries the enemy Controller this round: ◆ (big enough to catch in a 1 s pulse)
      pass: ok && r.vega.text === '◆' && r.vega.fontPx >= 24 && r.names === 0,
      note: `enemy-3 "${r.vega?.text}" ${r.vega?.fontPx}px, revealed ${JSON.stringify(r.revealed)}`,
    };
  });

  await check(
    'Carrier',
    "◆ on the carrier's tag; backpack glow only on carriers; enemy carrier in view: ◆ only",
    p,
    async () => {
      await p.evaluate(() => {
        T.ms().controllers[0].carrier = 2; // Nova carries ours now
        T.put(2, { x: -12.5, y: 0, z: 12.5 });
        T.put(3, { x: -4, y: 0, z: 16 }); // enemy carrier in view
      });
      await p.waitForTimeout(300);
      await p.evaluate(() => T.lookAt({ x: -8, y: 1.6, z: 12.5 }));
      await p.waitForTimeout(700);
      const r = await p.evaluate(() => {
        const models = T.combat().models;
        return {
          tag: T.tag('ally-2')?.text,
          vega: T.tag('enemy-3')?.text,
          vegaNamed: T.named('Vega'),
          glow: [2, 3, 4].map((id) => models.showsController(id)),
        };
      });
      await p.screenshot({ path: path.join(OUT, 'carrier-tag-and-glow.png') });
      await p.evaluate(() => {
        T.ms().controllers[0].carrier = 1;
      });
      return {
        pass:
          r.tag === '◆ Nova (ally)' &&
          r.glow.join() === 'true,true,false' &&
          r.vega === '◆' &&
          r.vegaNamed === 0,
        note: `tag "${r.tag}", enemy carrier "${r.vega}", glow Nova/Vega/Orion ${r.glow.join('/')}`,
      };
    },
  );

  await check('Objectives', 'Towers: ATTACK the orange one, DEFEND the cyan one', p, async () => {
    await p.evaluate(() => T.yaw(-90, 5)); // toward +X
    await p.waitForTimeout(600);
    const a = await p.evaluate(() => T.tag('tower-1'));
    await p.screenshot({ path: path.join(OUT, 'objectives-tower-attack.png') });
    await p.evaluate(() => T.yaw(90, 5)); // toward -X
    await p.waitForTimeout(600);
    const d = await p.evaluate(() => T.tag('tower-0'));
    return {
      pass:
        a?.text === 'ATTACK ▼' &&
        a.color === 'rgb(255, 138, 31)' &&
        d?.text === 'DEFEND ▼' &&
        d.color === 'rgb(25, 227, 255)',
      note: `${a?.text} ${a?.color} / ${d?.text} ${d?.color}`,
    };
  });

  await check('Objectives', 'Carrier: ATTACK marker clamps to the correct edge', p, async () => {
    // tower 90° to your right / left / straight behind (stand in line with it, at z = 0)
    await p.evaluate(() => T.put(1, { x: -18.5, y: 0, z: 0 }));
    const at = async (yaw) => {
      await p.evaluate((y) => T.yaw(y, 0), yaw);
      await p.waitForTimeout(500);
      return p.evaluate(() => ({ ...T.tag('tower-1'), err: T.arrowError('tower-1') }));
    };
    const right = await at(0); // facing -Z: +X is on the right
    const left = await at(-180); // facing +Z: +X is on the left
    const behind = await at(90); // facing -X
    await p.evaluate((h) => T.put(1, h), HALL);
    const arrows = [right, left, behind].map((t) => t.err);
    const ok =
      right.cls?.includes('wm-clamped') &&
      right.x > 1000 &&
      Math.abs(right.y - 360) < 60 &&
      left.x < 280 &&
      Math.abs(left.y - 360) < 60 &&
      behind.y > 560 &&
      arrows.every((e) => e !== null && e < 8);
    return {
      pass: !!ok,
      note: `right (${right.x | 0},${right.y | 0}) left (${left.x | 0},${left.y | 0}) behind (${behind.x | 0},${behind.y | 0}); arrow errors ${arrows.map((e) => e?.toFixed(1)).join('/')}°`,
    };
  });

  await check('Objectives', 'Dropped Controller: marker with return countdown', p, async () => {
    await p.evaluate(() => {
      const c = T.ms().controllers[0];
      c.carrier = null;
      c.droppedAt = { x: -10, y: 0.9, z: 12.5 };
      c.droppedTick = T.w().tick;
      T.put(2, { x: -84, y: 0, z: 22 }); // nobody near it
      T.lookAt({ x: -10, y: 1.5, z: 12.5 });
    });
    await p.waitForTimeout(500);
    const t1 = await p.evaluate(() => T.tag('ctl-0')?.text);
    await p.waitForTimeout(2500);
    const t2 = await p.evaluate(() => T.tag('ctl-0')?.text);
    const n1 = Number(/(\d+)s$/.exec(t1 ?? '')?.[1]);
    const n2 = Number(/(\d+)s$/.exec(t2 ?? '')?.[1]);
    return {
      pass: /^◆ YOUR CONTROLLER \d+s$/.test(t1) && n1 >= 7 && n1 <= 8 && n2 < n1,
      note: `"${t1}" → "${t2}"`,
    };
  });

  await check('Objectives', 'Your dropped Controller off-screen: clamped arrow', p, async () => {
    await p.evaluate(() => T.yaw(90, 0)); // turn around: it's behind you now
    await p.waitForTimeout(600);
    const t = await p.evaluate(() => ({ ...T.tag('ctl-0'), err: T.arrowError('ctl-0') }));
    return {
      pass: !!t.cls?.includes('wm-clamped') && t.y > 520 && t.err !== null && t.err < 8,
      note: `"${t.text}" at (${t.x | 0},${t.y | 0}), arrow error ${t.err?.toFixed(1)}°`,
    };
  });

  await check('Objectives', 'Back at base: no countdown any more', p, async () => {
    await p.evaluate(() => {
      const c = T.ms().controllers[0];
      c.droppedTick = T.w().tick - 60 * T.s().config.rules.controllerReturnSec + 20;
      T.yaw(90, 0);
    });
    const ok = await until(p, () => /AT BASE/.test(T.tag('ctl-0')?.text ?? ''), null, 3000);
    const t = await p.evaluate(() => T.tag('ctl-0')?.text);
    await p.waitForTimeout(400);
    return { pass: ok && t === '◆ YOUR CONTROLLER · AT BASE', note: `"${t}"` };
  });

  await check('Objectives', "Enemy's dropped Controller: marker, not clamped", p, async () => {
    await p.evaluate(() => {
      T.ms().controllers[0].carrier = 1;
      T.ms().controllers[0].droppedAt = null;
      const c = T.ms().controllers[1];
      c.carrier = null;
      c.droppedAt = { x: -2, y: 0.9, z: 12.5 };
      c.droppedTick = T.w().tick;
      T.lookAt({ x: -2, y: 1.5, z: 12.5 });
    });
    await p.waitForTimeout(600);
    const on = await p.evaluate(() => T.tag('ctl-1'));
    await p.screenshot({ path: path.join(OUT, 'objectives-enemy-controller-dropped.png') });
    await p.evaluate(() => T.yaw(90, 0));
    await p.waitForTimeout(500);
    const off = await p.evaluate(() => T.tag('ctl-1'));
    await p.evaluate(() => {
      const c = T.ms().controllers[1];
      c.carrier = 3;
      c.droppedAt = null;
    });
    return {
      pass:
        /^◆ ENEMY CONTROLLER \d+s$/.test(on?.text ?? '') &&
        on.color === 'rgb(255, 138, 31)' &&
        !off,
      note: `"${on?.text}", off-screen: ${off ? 'shown' : 'hidden'}`,
    };
  });

  await check('Name tags', 'Dead teammate: no tag', p, async () => {
    await p.evaluate(() => {
      T.put(2, { x: -10, y: 0, z: 12.5 });
      T.lookAt({ x: -10, y: 1.6, z: 12.5 });
    });
    await p.waitForTimeout(500);
    const before = await p.evaluate(() => !!T.tag('ally-2'));
    await p.evaluate(() => {
      const q = T.player(2);
      q.alive = false;
      q.hp = 0;
    });
    await p.waitForTimeout(500);
    const after = await p.evaluate(() => T.named('Nova'));
    return { pass: before && after === 0, note: `before ${before}, after ${after} tags` };
  });

  await check(
    'Sound indicators',
    'Looking up or down: a sound ahead stays at the top, not "above/below"',
    p,
    async () => {
      await p.evaluate(() => T.put(4, { x: -4.5, y: 0, z: 12.5 })); // Orion 14 m ahead, eye level
      await p.waitForTimeout(300);
      const at = async (pitch) => {
        await p.evaluate((pt) => T.yaw(-90, pt), pitch); // facing +X
        await p.waitForTimeout(150);
        await p.evaluate(() => T.s().events.push({ type: 'jump', player: 4 }));
        await p.waitForTimeout(250);
        return p.evaluate(() =>
          [...document.querySelectorAll('.sr-item')].map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: el.textContent };
          }),
        );
      };
      const views = [];
      for (const pitch of [-60, 0, 60]) views.push(await at(pitch));
      await p.screenshot({ path: path.join(OUT, 'sound-indicator-looking-up.png') });
      const ok = views.every(
        (items) =>
          items.length === 1 &&
          /Jump/.test(items[0].text) &&
          !/above|below/.test(items[0].text) &&
          Math.abs(items[0].x - 640) < 30 &&
          items[0].y < 200,
      );
      return {
        pass: ok,
        note: views
          .map((items, i) =>
            items.map((t) => `${[-60, 0, 60][i]}°: "${t.text}" (${t.x | 0},${t.y | 0})`).join(' '),
          )
          .join('; '),
      };
    },
  );

  await check(
    'Gravity',
    'Standing on a wall: clamped marker still on the correct edge',
    p,
    async () => {
      // engine corridor: gravity pulls toward -Z there, so your "up" becomes +Z
      await p.evaluate(() => {
        T.put(1, { x: -24.5, y: 5, z: -38.4 }); // (between a conduit and a coolant tank)
      });
      const ok = await until(p, () => T.app().client.fps.up.z > 0.95, null, 6000);
      await p.evaluate(() => T.lookAt({ x: 90, y: 7.5, z: 0 }));
      await p.waitForTimeout(400);
      await p.evaluate(() => T.app().client.fps.look(90, 0)); // turn right: Tower on the left
      await p.waitForTimeout(600);
      const left = await p.evaluate(() => ({ ...T.tag('tower-1'), err: T.arrowError('tower-1') }));
      await p.screenshot({ path: path.join(OUT, 'gravity-wall-marker-left.png') });
      await p.evaluate(() => T.app().client.fps.look(-180, 0)); // Tower on the right
      await p.waitForTimeout(600);
      const right = await p.evaluate(() => ({ ...T.tag('tower-1'), err: T.arrowError('tower-1') }));
      const up = await p.evaluate(() => T.app().client.fps.camUp());
      return {
        pass:
          ok &&
          left.x < 300 &&
          right.x > 980 &&
          Math.abs(left.y - right.y) < 80 &&
          [left.err, right.err].every((e) => e !== null && e < 8),
        note: `camera up (${up.x.toFixed(2)}, ${up.y.toFixed(2)}, ${up.z.toFixed(2)}); left (${left.x | 0},${left.y | 0}) right (${right.x | 0},${right.y | 0}); arrow errors ${left.err?.toFixed(1)}/${right.err?.toFixed(1)}°`,
      };
    },
  );

  await check('Objectives', 'Half-time side swap: banner, markers and beams flip', p, async () => {
    // win round 5 at the Tower; the rules swap sides before round 6
    await p.evaluate(() => {
      const q = T.player(2);
      q.alive = true;
      q.hp = 100;
      T.ms().round = 5;
      T.put(1, { x: 86.5, y: 0, z: 0 });
    });
    const swapped = await until(p, () => T.s().match().sideSwapped, null, 40000);
    const banner = await until(
      p,
      () => /Sides swapped/.test(document.querySelector('.match-banner-sub')?.textContent ?? ''),
      null,
      3000,
    );
    await p.screenshot({ path: path.join(OUT, 'objectives-side-swap-banner.png') });
    await until(p, () => T.s().match().phase === 'live', null, 40000);
    await p.evaluate(() => {
      T.stage();
      T.put(1, { x: 60, y: 0, z: 0 });
      T.yaw(90, 5); // toward -X: the Tower we attack now
    });
    await p.waitForTimeout(700);
    const west = await p.evaluate(() => T.tag('tower-0'));
    const beams = await p.evaluate(() =>
      T.app().matchFeature.towers.map((t) => `${t.team}:${t.beam.material.color.getHexString()}`),
    );
    await p.screenshot({ path: path.join(OUT, 'objectives-after-swap-attack.png') });
    await p.evaluate(() => T.yaw(-90, 5));
    await p.waitForTimeout(600);
    const east = await p.evaluate(() => T.tag('tower-1'));
    return {
      pass:
        swapped &&
        banner &&
        west?.text === 'ATTACK ▼' &&
        west.color === 'rgb(255, 138, 31)' &&
        east?.text === 'DEFEND ▼' &&
        east.color === 'rgb(25, 227, 255)' &&
        beams.join() === '0:ff8a1f,1:19e3ff',
      note: `banner ${banner}; west ${west?.text} ${west?.color}; east ${east?.text} ${east?.color}; beams ${beams.join(' ')}`,
    };
  });

  await check(
    'Combat HUD',
    'Round-ending kills: kill + round banners apart, feed colors, no tags over the scoreboard',
    p,
    async () => {
      // Nova in view, so there is a tag that has to get out of the scoreboard's way
      await p.evaluate(() => T.put(2, { x: 70, y: 0, z: 2 }));
      await p.waitForTimeout(300);
      const tagBefore = await p.evaluate(() => !!T.tag('ally-2'));
      // you headshot both enemies in the same moment: ACE, and the round ends (elimination)
      await p.evaluate(() => {
        const src = T.eye();
        for (const victim of [3, 4]) {
          const v = T.player(victim);
          const pos = { ...v.pos };
          v.alive = false;
          v.hp = 0;
          T.s().events.push(
            {
              type: 'hit',
              attacker: 1,
              victim,
              damage: 100,
              head: true,
              kind: 'headshot',
              pos,
              src,
            },
            {
              type: 'kill',
              attacker: 1,
              victim,
              kind: 'headshot',
              teamKill: false,
              pos,
              src,
              throwId: 7,
            },
          );
        }
      });
      const both = await until(
        p,
        () =>
          document.querySelector('.banner.show') &&
          document.querySelector('.match-banner')?.textContent === 'ROUND WON' &&
          document.querySelector('.match-banner').style.opacity === '1',
        null,
        3000,
      );
      await p.waitForTimeout(250); // let the banner transitions settle
      const r = await p.evaluate(() => {
        const box = (sel) => document.querySelector(sel).getBoundingClientRect().toJSON();
        const feed = [...document.querySelectorAll('.kill-row')].map((row) =>
          [...row.children].map((c) => `${c.textContent.trim()}:${getComputedStyle(c).color}`),
        );
        return {
          kill: document.querySelector('.banner').textContent,
          killBox: box('.banner'),
          roundBox: box('.match-banner-wrap'),
          hit: document.querySelector('.hitmark').className,
          feed,
          board: getComputedStyle(document.querySelector('.scoreboard')).display,
          tags: T.tags().length,
        };
      });
      const apart = r.killBox.top >= r.roundBox.bottom || r.killBox.bottom <= r.roundBox.top;
      const cyan = 'rgb(25, 227, 255)';
      const orange = 'rgb(255, 138, 31)';
      const feedOk =
        r.feed.length >= 2 &&
        r.feed.slice(0, 2).every((row) => row[0] === `You:${cyan}` && row[2]?.endsWith(orange));
      const boardClear = tagBefore && r.board !== 'none' && r.tags === 0;
      return {
        pass: both && apart && r.kill === 'ACE' && /kill/.test(r.hit) && feedOk && boardClear,
        note: `"${r.kill}" ${r.killBox.top | 0}-${r.killBox.bottom | 0}px vs round banner ${r.roundBox.top | 0}-${r.roundBox.bottom | 0}px; hit marker "${r.hit}"; feed ${JSON.stringify(r.feed[0])}; tag before ${tagBefore}, tags over the scoreboard ${r.tags}`,
      };
    },
  );

  await check(
    'Combat HUD',
    'Eliminated mid-round: "back next round", hidden under the scoreboard',
    p,
    async () => {
      const live = await until(p, () => T.s().match().phase === 'live', null, 40000);
      await p.evaluate(() => {
        T.stage();
        const me = T.me();
        me.alive = false;
        me.hp = 0;
      });
      const death = () => {
        const el = document.querySelector('.death');
        return el.classList.contains('hidden') ? null : el.textContent;
      };
      const shown = await until(p, death, null, 3000);
      const text = await p.evaluate(death);
      await p.screenshot({ path: path.join(OUT, 'combat-hud-eliminated.png') });
      await p.keyboard.down('Tab');
      await p.waitForTimeout(400);
      const withBoard = await p.evaluate(death);
      await p.keyboard.up('Tab');
      await p.waitForTimeout(300);
      const again = await p.evaluate(death);
      return {
        pass:
          live &&
          shown &&
          text === 'ELIMINATED · back next round' &&
          withBoard === null &&
          again === text,
        note: `"${text}"; with the scoreboard: ${withBoard === null ? 'hidden' : `"${withBoard}"`}`,
      };
    },
  );
  await p.context().close();
}

// ==========================================================================================
// 2. Offline 5v5: four teammates bunched up in view
{
  const p = await newPage('5v5');
  await startPractice(p, 'match', 5);
  await check(
    'Name tags',
    '5v5: one tag per teammate, nothing overlapping (Tower + Controller markers in the crowd)',
    p,
    async () => {
      const mates = await p.evaluate(() =>
        T.w()
          .players.filter((q) => q.team === 0 && q.id !== 1)
          .map((q) => q.id),
      );
      await p.evaluate((ids) => {
        T.put(1, { x: -60, y: 0, z: 0 });
        ids.forEach((id, i) => T.put(id, { x: -50 + (i % 2) * 1.2, y: 0, z: -1.5 + i }));
        // our Controller lies just in front of them, out of pickup reach (1.6 m); the ATTACK
        // marker is behind them
        const c = T.ms().controllers[0];
        c.carrier = null;
        c.droppedAt = { x: -53, y: 0.9, z: 0.5 };
        c.droppedTick = T.w().tick;
      }, mates);
      await p.waitForTimeout(300);
      await p.evaluate(() => T.lookAt({ x: -49.5, y: 1.2, z: 0 }));
      await p.waitForTimeout(900);
      const all = await p.evaluate(() => T.tags());
      const tags = all.filter((t) => t.cls.includes('wm-ally'));
      const keys = tags.map((t) => t.key).sort();
      const want = mates.map((id) => `ally-${id}`).sort();
      const bad = overlapping(all);
      return {
        pass:
          keys.join() === want.join() &&
          all.some((t) => t.key === 'tower-1') &&
          all.some((t) => t.key === 'ctl-0') &&
          bad.length === 0,
        note: `${all.map((t) => t.text).join(' | ')}${bad.length ? `; overlapping ${bad.join(' ')}` : ''}`,
      };
    },
  );
  await p.context().close();
}

// ==========================================================================================
// 3. Outside matches: free fight 2v2 (no match rules) and the practice range
{
  const p = await newPage('free-fight');
  await startPractice(p, 'deathmatch', 2);
  await check('Name tags', 'Free fight 2v2 (no match): teammate keeps one tag', p, async () => {
    await p.evaluate(() => {
      const me = T.me();
      T.put(2, { x: me.pos.x + 12, y: me.pos.y - 0.9, z: me.pos.z });
    });
    await p.waitForTimeout(300);
    await p.evaluate(() => T.lookAt(T.chest(2)));
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => ({
      tags: T.tags().map((t) => `${t.key}:${t.text}`),
      sprites: T.sprites(),
      match: !!T.s().match?.(),
    }));
    return {
      pass: !r.match && r.tags.join() === 'ally-2:Nova (ally)' && r.sprites === 0,
      note: `tags ${r.tags.join(', ')}, 3D labels ${r.sprites}`,
    };
  });
  await p.context().close();

  const q = await newPage('range');
  await q.goto(`${URL_}/?autotest`);
  await q.waitForTimeout(900);
  await q.click('text=Practice range');
  await until(q, () => window.T.app().client, null, 20000);
  await q.waitForTimeout(800);
  await check(
    'Name tags',
    'Practice range: dummies get no tags (name only when aimed)',
    q,
    async () => {
      await q.evaluate(() => T.yaw(-90, 25)); // toward the dummies, crosshair above them
      await q.waitForTimeout(700);
      const idle = await q.evaluate(() => T.tags().map((t) => t.key));
      await q.evaluate(() => T.lookAt(T.chest(2)));
      const aimed = await until(q, () => T.tag('aim-2')?.text === 'Dummy', null, 3000);
      return {
        pass: idle.length === 0 && aimed,
        note: `idle tags: ${idle.join(', ') || 'none'}; aimed readout ${aimed}`,
      };
    },
  );
  await q.context().close();
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
