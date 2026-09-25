import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  addPlayer,
  buildLevel,
  createMatch,
  createPlayer,
  createWorld,
  defaultConfig,
  lineOfSight,
  mapDef,
  matchView,
  startMatch,
  towerOf,
  updateMatch,
  v3,
  TICK_DT,
  type SimContext,
  type Vec3,
} from '@space-yz/shared';
import {
  EDGE_INSET,
  edgePoint,
  estimateBox,
  layoutMarkers,
  projectMarker,
  screenAngle,
  type MarkerBox,
} from '../src/ui/markers';
import {
  bodyOf,
  fogSightRange,
  playerTag,
  rayHitsBody,
  tagOpacity,
} from '../src/game/world-markers';
import {
  controllerAtHome,
  controllerHome,
  controllerReturnLeft,
  controllerText,
  towerRole,
} from '../src/game/objectives';
import { PlayerModels } from '../src/render/players';
import { gravityArrowAngle } from '../src/ui/hud';
import type { RenderPlayer } from '../src/game/session';

const W = 1280;
const H = 720;
const deg = (r: number) => Math.round((r * 180) / Math.PI);
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => v3(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);

/** A camera like the game's: at `eye`, looking along `fwd`, with `up` as the top of the image. */
const camera = (eye: Vec3, fwd: Vec3, up: Vec3): THREE.PerspectiveCamera => {
  const c = new THREE.PerspectiveCamera(70, W / H, 0.05, 600);
  c.position.set(eye.x, eye.y, eye.z);
  c.up.set(up.x, up.y, up.z);
  c.lookAt(eye.x + fwd.x, eye.y + fwd.y, eye.z + fwd.z);
  c.updateMatrixWorld();
  return c;
};

describe('projectMarker (screen position + edge-arrow direction)', () => {
  const eye = v3(0, 1.6, 0);
  const F = v3(0, 0, -1);
  const R = v3(1, 0, 0);
  const U = v3(0, 1, 0);
  const cam = camera(eye, F, U);
  const at = (p: Vec3) => projectMarker(p, cam, W, H);

  it('puts a point straight ahead in the middle of the screen', () => {
    const m = at(add(eye, F, 10));
    expect(m.onScreen).toBe(true);
    expect(m.x).toBeCloseTo(W / 2, 3);
    expect(m.y).toBeCloseTo(H / 2, 3);
    expect(m.dist).toBeCloseTo(10, 5);
  });

  it('matches three.js projection for visible points', () => {
    const p = v3(3, 2.5, -12);
    const ndc = new THREE.Vector3(p.x, p.y, p.z).project(cam);
    const m = at(p);
    expect(m.onScreen).toBe(true);
    expect(m.x).toBeCloseTo(((ndc.x + 1) / 2) * W, 3);
    expect(m.y).toBeCloseTo(((1 - ndc.y) / 2) * H, 3);
  });

  it('off-screen arrows point right / left / up / down', () => {
    expect(at(add(add(eye, R, 10), F, 1)).onScreen).toBe(false);
    expect(deg(at(add(add(eye, R, 10), F, 1)).angle)).toBe(90);
    expect(deg(at(add(eye, R, -10)).angle)).toBe(-90);
    expect(deg(at(add(add(eye, U, 10), F, 1)).angle)).toBe(0);
    expect(Math.abs(deg(at(add(add(eye, U, -10), F, 1)).angle))).toBe(180);
  });

  it('targets behind you: bottom half, on the side to turn to; straight behind = bottom', () => {
    const behindRight = at(add(add(eye, F, -10), R, 4));
    expect(behindRight.onScreen).toBe(false);
    expect(deg(behindRight.angle)).toBeGreaterThan(90);
    expect(deg(behindRight.angle)).toBeLessThan(180);
    const behindLeft = deg(at(add(add(eye, F, -10), R, -4)).angle);
    expect(behindLeft).toBeLessThan(-90);
    expect(behindLeft).toBeGreaterThan(-180);
    // dead behind: no flicker between directions, always the bottom edge
    for (const wobble of [0, 0.01, -0.01])
      expect(Math.abs(deg(at(add(add(eye, F, -10), R, wobble)).angle))).toBe(180);
    expect(deg(screenAngle(0, 0, 5))).toBe(180);
    // a far Tower behind you and a bit higher: turn around (bottom), not "look up"
    expect(Math.abs(deg(at(v3(0, 7.5, 150)).angle))).toBeGreaterThan(170);
    // but something high above and behind you is found by looking up
    expect(Math.abs(deg(at(add(add(eye, F, -2), U, 10)).angle))).toBeLessThan(10);
    // continuous at your side: exactly to the right is the right edge either way
    expect(deg(screenAngle(10, 0, 0))).toBe(90);
    expect(deg(screenAngle(10, 0, 1e-6))).toBe(90);
  });

  it('stays right when the camera is rolled onto a wall (body up = +X)', () => {
    // standing on a wall: "up" is world +X, so the top of the screen is world +X
    const wall = camera(eye, F, v3(1, 0, 0));
    const above = projectMarker(add(add(eye, v3(1, 0, 0), 10), F, 1), wall, W, H);
    expect(deg(above.angle)).toBe(0);
    // screen right = forward × up = world -Y
    const right = projectMarker(add(add(eye, v3(0, -1, 0), 10), F, 1), wall, W, H);
    expect(deg(right.angle)).toBe(90);
    const visible = projectMarker(add(add(eye, F, 10), v3(0, -1, 0), 2), wall, W, H);
    expect(visible.onScreen).toBe(true);
    expect(visible.x).toBeGreaterThan(W / 2 + 50); // world -Y is on the right
    expect(visible.y).toBeCloseTo(H / 2, 3);
  });

  it('stays right upside down (ceiling gravity, body up = -Y)', () => {
    const ceiling = camera(eye, F, v3(0, -1, 0));
    // world "up" is the bottom of the screen now
    expect(Math.abs(deg(projectMarker(add(add(eye, U, 10), F, 1), ceiling, W, H).angle))).toBe(180);
    // and world +X is on the left
    expect(deg(projectMarker(add(add(eye, R, 10), F, 1), ceiling, W, H).angle)).toBe(-90);
    const vis = projectMarker(add(add(eye, F, 10), U, 2), ceiling, W, H);
    expect(vis.onScreen).toBe(true);
    expect(vis.y).toBeGreaterThan(H / 2 + 50); // above in the world = lower on screen
    // behind you and to world +X (your left now): the bottom edge, on the left side
    const behind = deg(projectMarker(add(add(eye, F, -10), R, 4), ceiling, W, H).angle);
    expect(behind).toBeLessThan(-90);
    expect(behind).toBeGreaterThan(-180);
  });
});

describe('edge clamping', () => {
  it('keeps clamped markers inside the screen, clear of the score bar, in the right direction', () => {
    for (let a = -180; a < 180; a += 15) {
      const r = (a * Math.PI) / 180;
      const p = edgePoint(r, W, H);
      expect(p.x).toBeGreaterThanOrEqual(EDGE_INSET.x - 1e-6);
      expect(p.x).toBeLessThanOrEqual(W - EDGE_INSET.x + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(EDGE_INSET.y - 1e-6);
      expect(p.y).toBeLessThanOrEqual(H - EDGE_INSET.y + 1e-6);
      // same direction from the centre as the arrow
      const back = Math.atan2(p.x - W / 2, -(p.y - H / 2));
      expect(Math.abs(Math.atan2(Math.sin(back - r), Math.cos(back - r)))).toBeLessThan(1e-9);
    }
    expect(edgePoint(0, W, H)).toEqual({ x: W / 2, y: EDGE_INSET.y });
    const right = edgePoint(Math.PI / 2, W, H);
    expect(right.x).toBeCloseTo(W - EDGE_INSET.x, 6);
    expect(right.y).toBeCloseTo(H / 2, 6);
  });
});

describe('marker layout (no overlapping tags)', () => {
  const box = (key: string, x: number, y: number, priority: number, w = 80): MarkerBox => ({
    key,
    x,
    y,
    w,
    h: 17,
    align: 'bottom',
    priority,
  });
  const rect = (b: MarkerBox, y: number) => ({
    x0: b.x - b.w / 2,
    x1: b.x + b.w / 2,
    y0: y - b.h,
    y1: y,
  });
  const overlaps = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) =>
    a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

  it('moves the lower-priority tag above the other; the objective marker stays put', () => {
    const tower = box('tower-1', 640, 330, 80, 70);
    const mate = box('ally-2', 646, 340, 50);
    const ys = layoutMarkers([mate, tower]);
    expect(ys.get('tower-1')).toBe(330);
    expect(ys.get('ally-2')!).toBeLessThan(340);
    expect(overlaps(rect(tower, ys.get('tower-1')!), rect(mate, ys.get('ally-2')!))).toBe(false);
  });

  it('stacks a crowd (e.g. five teammates in the spawn) without overlaps', () => {
    const crowd = [0, 1, 2, 3, 4].map((i) => box(`ally-${i}`, 600 + i * 12, 300 + i, 50 - i));
    const ys = layoutMarkers(crowd);
    for (let i = 0; i < crowd.length; i++)
      for (let j = i + 1; j < crowd.length; j++)
        expect(
          overlaps(rect(crowd[i], ys.get(crowd[i].key)!), rect(crowd[j], ys.get(crowd[j].key)!)),
        ).toBe(false);
  });

  it('leaves separate tags alone and never lifts one further than the limit', () => {
    const a = box('a', 200, 300, 50);
    const b = box('b', 900, 300, 50);
    const ys = layoutMarkers([a, b]);
    expect(ys.get('a')).toBe(300);
    expect(ys.get('b')).toBe(300);
    const pile = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => box(`p${i}`, 640, 300, 50 - i));
    const lifted = layoutMarkers(pile, 2, 60);
    for (const p of pile) expect(300 - lifted.get(p.key)!).toBeLessThanOrEqual(60);
  });

  it('size estimate counts letter spacing and padding (Tower markers are spaced out)', () => {
    // measured in Chrome: "ATTACK ▼" at 12px with 0.08em spacing is 72.6 px wide
    const plain = estimateBox('ATTACK ▼', 12);
    const spaced = estimateBox('ATTACK ▼', 12, { spacingEm: 0.08 });
    expect(spaced.w).toBeGreaterThan(plain.w + 7);
    expect(spaced.w).toBeGreaterThan(70);
    expect(spaced.h).toBe(16); // the .wm-objective line height
    const clamped = estimateBox('ATTACK', 12, { spacingEm: 0.08, padX: 28, padY: 2 });
    expect(clamped.w - estimateBox('ATTACK', 12, { spacingEm: 0.08 }).w).toBeCloseTo(28, 9);
    expect(clamped.h).toBe(18);
  });
});

describe('name tag rules', () => {
  const mate = { team: 0 as const, alive: true, carrier: false, revealed: false, name: 'Nova' };
  const enemy = { team: 1 as const, alive: true, carrier: false, revealed: false, name: 'Vega' };

  it('teammates get their name (◆ = Controller carrier); dead teammates get nothing', () => {
    expect(playerTag(mate, 0, false)).toEqual({ kind: 'ally', text: 'Nova' });
    expect(playerTag({ ...mate, carrier: true }, 0, false)?.text).toBe('◆ Nova');
    expect(playerTag({ ...mate, alive: false }, 0, false)).toBeNull();
    // same player seen from the other team is an enemy
    expect(playerTag(mate, 1, false)).toBeNull();
  });

  it('enemies: no name through walls; reveals show only an icon', () => {
    expect(playerTag(enemy, 0, false)).toBeNull();
    const rev = playerTag({ ...enemy, revealed: true }, 0, false);
    expect(rev).toEqual({ kind: 'icon', text: '◇' });
    expect(playerTag({ ...enemy, revealed: true, carrier: true }, 0, false)?.text).toBe('◆');
    for (const r of [rev, playerTag({ ...enemy, revealed: true, carrier: true }, 0, false)])
      expect(r?.text).not.toContain('Vega');
    expect(playerTag({ ...enemy, revealed: true, alive: false }, 0, false)).toBeNull();
  });

  it('an enemy carrier gets its ◆ only while you can see it (never its name)', () => {
    const carrier = { ...enemy, carrier: true };
    expect(playerTag(carrier, 0, false, true)).toEqual({ kind: 'icon', text: '◆' });
    expect(playerTag(carrier, 0, false, false)).toBeNull(); // behind a wall
    expect(playerTag(enemy, 0, false, true)).toBeNull(); // other enemies: nothing
    expect(playerTag({ ...carrier, alive: false }, 0, false, true)).toBeNull();
    // "in sight" ends where the fog hides players: Kestrel's base-to-base view (~170 m
    // through both doors) is clear of walls but lost in the fog
    const range = fogSightRange(mapDef('kestrel').fog!);
    expect(lineOfSight(buildLevel(mapDef('kestrel')), v3(-85, 1.6, 0), v3(85, 1.6, 0))).toBe(true);
    expect(range).toBeLessThan(150);
    expect(range).toBeGreaterThan(90); // long fights down the main hall still count
    expect(fogSightRange(null)).toBe(Infinity);
  });

  it('enemy name only while aimed at and in sight', () => {
    expect(playerTag(enemy, 0, true)).toEqual({ kind: 'aim', text: 'Vega' });
    expect(playerTag({ ...enemy, carrier: true }, 0, true, true)?.text).toBe('◆ Vega');
    expect(playerTag({ ...enemy, alive: false }, 0, true)).toBeNull();
  });

  it('tags keep their size; a little fainter far away, clearly dimmer behind walls', () => {
    for (const d of [2, 10, 30, 60, 120]) {
      const seen = tagOpacity(d, true);
      const hidden = tagOpacity(d, false);
      expect(hidden).toBeLessThan(seen - 0.3);
      expect(seen).toBeGreaterThanOrEqual(0.75);
      expect(hidden).toBeGreaterThan(0.25);
    }
    expect(tagOpacity(80, true)).toBeLessThan(tagOpacity(5, true));
  });
});

describe('crosshair on an enemy', () => {
  const m = defaultConfig().movement;
  const p = { pos: v3(0, 0.9, -20), up: v3(0, 1, 0), crouched: false };
  const b = bodyOf(p, m);
  const eye = v3(0, 1.6, 0);
  const dir = (to: Vec3) => {
    const d = v3(to.x - eye.x, to.y - eye.y, to.z - eye.z);
    const l = Math.hypot(d.x, d.y, d.z);
    return v3(d.x / l, d.y / l, d.z / l);
  };

  it('hits the body when aimed at it, misses beside it or out of range', () => {
    const t = rayHitsBody(eye, dir(v3(0, 1.2, -20)), b.bottom, b.top, b.radius, 70);
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(20, 0);
    expect(rayHitsBody(eye, dir(v3(1.2, 1.2, -20)), b.bottom, b.top, b.radius, 70)).toBeNull();
    expect(rayHitsBody(eye, dir(v3(0, 1.2, -20)), b.bottom, b.top, b.radius, 10)).toBeNull();
    // crouching lowers the head
    expect(bodyOf({ ...p, crouched: true }, m).head.y).toBeLessThan(b.head.y);
  });

  it("uses the level's line of sight (a wall hides the enemy)", () => {
    const level = buildLevel(mapDef('kestrel'));
    // hall → behind the base wall (the door is at |z| < 8)
    expect(lineOfSight(level, v3(-60, 1.6, 0), v3(-80, 1.6, 20))).toBe(false);
    expect(lineOfSight(level, v3(-60, 1.6, 0), v3(-45, 1.6, 3))).toBe(true);
  });
});

describe('Tower & Controller markers', () => {
  it('ATTACK/DEFEND flips with the half-time side swap, for both teams', () => {
    // map side 0 Tower (cyan base)
    expect(towerRole(0, false, 0)).toEqual({ owner: 0, attack: false });
    expect(towerRole(0, false, 1)).toEqual({ owner: 0, attack: true });
    expect(towerRole(1, false, 0)).toEqual({ owner: 1, attack: true });
    // after the swap cyan (0) plays on side 1: it attacks the side-0 Tower
    expect(towerRole(0, true, 0)).toEqual({ owner: 1, attack: true });
    expect(towerRole(1, true, 0)).toEqual({ owner: 0, attack: false });
    expect(towerRole(0, true, 1)).toEqual({ owner: 1, attack: false });
    expect(towerRole(1, true, 1)).toEqual({ owner: 0, attack: true });
  });

  it('agrees with the rules about who owns which Tower', () => {
    const config = defaultConfig();
    const ctx: SimContext = { level: buildLevel(mapDef('kestrel')), config, dt: TICK_DT };
    const ms = createMatch('2v2');
    for (const swapped of [false, true]) {
      ms.sideSwapped = swapped;
      for (const team of [0, 1] as const) {
        const own = towerOf(ms, ctx, team)!;
        expect(towerRole(own.team, swapped, team).attack).toBe(false);
        const theirs = towerOf(ms, ctx, (1 - team) as 0 | 1)!;
        expect(towerRole(theirs.team, swapped, team).attack).toBe(true);
      }
    }
  });

  it('dropped Controller countdown matches the rules; no countdown once back at base', () => {
    const config = defaultConfig();
    const ctx: SimContext = { level: buildLevel(mapDef('kestrel')), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 3);
    let id = 1;
    for (const team of [0, 1] as const) {
      const s = ctx.level.def.spawns.find((sp) => sp.team === team)!;
      addPlayer(world, createPlayer(id++, team, s.pos, s.yawDeg, config));
    }
    const ms = createMatch('1v1');
    startMatch(ms, world, ctx);
    ms.phase = 'live';
    ms.roundStart = world.tick;
    ms.roundEnds = world.tick + 60 * 600;
    for (const p of world.players) p.frozen = false;
    // team 0's Controller lies in the main hall, nobody near
    const c = ms.controllers[0];
    c.carrier = null;
    c.droppedAt = v3(0, 2.2, 10);
    c.droppedTick = world.tick;
    const secs = config.rules.controllerReturnSec;
    let returnedAt = -1;
    const shown: number[] = [];
    for (let i = 0; i < secs * 60 + 5 && returnedAt < 0; i++) {
      const view = matchView(ms).controllers[0];
      shown.push(controllerReturnLeft(view.returnAt, world.tick, secs));
      world.tick++;
      world.events = [];
      updateMatch(ms, world, ctx);
      if (world.events.some((e) => e.type === 'controllerReturn')) returnedAt = world.tick;
    }
    expect(shown[0]).toBe(secs); // "8s" when it drops
    expect(shown[shown.length - 1]).toBe(1); // "1s" on the last tick before it goes home
    expect(returnedAt).toBeGreaterThan(0);
    // now it sits at its home: the marker says so instead of counting down again
    expect(c.droppedAt).not.toBeNull();
    expect(controllerAtHome(ctx.level.def, 0, ms.sideSwapped, c.droppedAt!)).toBe(true);
    expect(controllerAtHome(ctx.level.def, 0, ms.sideSwapped, v3(0, 2.2, 10))).toBe(false);
    expect(controllerText(true, true, 0)).toBe('◆ YOUR CONTROLLER · AT BASE');
    expect(controllerText(false, false, 5)).toBe('◆ ENEMY CONTROLLER 5s');
    expect(controllerReturnLeft(0, 10_000, secs)).toBe(0); // never negative
  });

  it('Controller homes follow the side swap', () => {
    const def = mapDef('kestrel');
    expect(controllerHome(def, 0, false)!.x).toBeLessThan(0);
    expect(controllerHome(def, 0, true)!.x).toBeGreaterThan(0);
    expect(controllerHome(def, 1, true)!.x).toBeLessThan(0);
  });
});

describe('gravity arrow (HUD, top left)', () => {
  // the arrow points down unrotated; CSS rotate(θ) (clockwise) turns "down" into (−sin θ, cos θ)
  const points = (theta: number) => ({
    x: Math.round(-Math.sin(theta)) + 0, // + 0 turns -0 into 0
    y: Math.round(Math.cos(theta)) + 0,
  });
  const F = v3(0, 0, -1);
  const U = v3(0, 1, 0);

  it('points where gravity pulls on screen', () => {
    expect(points(gravityArrowAngle(v3(0, -20, 0), F, U))).toEqual({ x: 0, y: 1 }); // down
    expect(points(gravityArrowAngle(v3(20, 0, 0), F, U))).toEqual({ x: 1, y: 0 }); // right
    expect(points(gravityArrowAngle(v3(-20, 0, 0), F, U))).toEqual({ x: -1, y: 0 }); // left
    expect(points(gravityArrowAngle(v3(0, 20, 0), F, U))).toEqual({ x: 0, y: -1 }); // up
  });

  it('follows a rolled camera (gravity is "down" once the view has rolled onto the wall)', () => {
    // standing on a wall: camera up +X, gravity pulls toward -X
    expect(points(gravityArrowAngle(v3(-20, 0, 0), F, v3(1, 0, 0)))).toEqual({ x: 0, y: 1 });
  });
});

describe('player models', () => {
  const rp = (id: number, team: 0 | 1, carrier = false, alive = true): RenderPlayer => ({
    id,
    team,
    name: `P${id}`,
    pos: v3(id * 3, 0.9, 0),
    up: v3(0, 1, 0),
    view: { x: 0, y: 0, z: 0, w: 1 },
    vel: v3(),
    crouched: false,
    alive,
    move: 0,
    hp: 100,
    windup: 0,
    aiming: false,
    laserWarn: 0,
    slashTicks: 0,
    carrier,
    revealed: false,
  });

  it('have no 3D name labels (tags are screen-space), Controller only on the carrier', () => {
    const models = new PlayerModels();
    models.update([rp(2, 0, true), rp(3, 0), rp(4, 1)], 1 / 60, 0);
    let sprites = 0;
    models.group.traverse((o) => {
      if ((o as THREE.Sprite).isSprite) sprites++;
    });
    expect(sprites).toBe(0);
    expect(models.showsController(2)).toBe(true);
    expect(models.showsController(3)).toBe(false);
    expect(models.showsController(4)).toBe(false);
    // the carrier dies: nothing left on screen for them
    models.update([rp(2, 0, true, false), rp(3, 0), rp(4, 1)], 1 / 60, 0);
    expect(models.showsController(2)).toBe(false);
    models.dispose();
  });

  it('free every material and geometry when a player leaves', () => {
    const models = new PlayerModels();
    models.update([rp(2, 0, true)], 1 / 60, 0);
    const live = new Set<object>();
    models.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const geo = o.geometry as THREE.BufferGeometry;
      const mat = o.material as THREE.Material;
      live.add(geo).add(mat);
      geo.addEventListener('dispose', () => live.delete(geo));
      mat.addEventListener('dispose', () => live.delete(mat));
    });
    expect(live.size).toBeGreaterThan(3);
    models.update([], 1 / 60, 0);
    expect(live.size).toBe(0);
    expect(models.group.children.length).toBe(0);
  });
});
