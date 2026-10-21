// Antipode's ceiling deck: Orange (team 1) spawns as an upright body under the ceiling and the
// deck's gravity turns it over in 0.3 s. The camera (game/camera.ts) follows the body's up; this
// checks the view ends cleanly upside down with no roll (no "whole map slanted" screen), and that
// Cyan on the floor deck stays upright — also when a slow frame lets the body turn over in one go
// and when the camera still has the last round's view (looking down, upside down or upright).
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  buildLevel,
  createPlayer,
  createWorld,
  cross,
  defaultConfig,
  dot,
  mapDef,
  normalize,
  step,
  TICK_DT,
  v3,
  yawToView,
  type PlayerState,
  type Quat,
  type SimContext,
  type Vec3,
} from '@space-yz/shared';
import { FpsCamera } from '../src/game/camera';

const UP = v3(0, 1, 0);
const DOWN = v3(0, -1, 0);

/**
 * The camera's roll: how far (degrees) its image up leans away from the body's up, seen along
 * the view direction. 0 = level (the horizon is flat on the screen).
 */
const rollDeg = (cam: FpsCamera, up: Vec3): number => {
  const f = cam.forward();
  const right = normalize(cross(f, up));
  const levelUp = cross(right, f); // the image up a level camera has
  const c = cam.camUp();
  return (Math.atan2(dot(c, right), dot(c, levelUp)) * 180) / Math.PI;
};

/**
 * One player spawned at its team's first spawn of antipode-graybox and simulated like the
 * client does it: the camera's view is the input, and the camera follows the body every
 * `ticksPerFrame` ticks (a slow frame runs many ticks before the camera sees the body again).
 * The camera is made `camAfter` ticks after the spawn from the body's state (`view`, `up`) —
 * like joining a running round online, taking over a bot or a teleport (syncCameraToPlayer) —
 * or it is the last round's camera (`start`: a round start does not reset it).
 */
const run = (
  team: 0 | 1,
  opts: { ticksPerFrame: number; start?: { view: Quat; up: Vec3 }; camAfter?: number },
) => {
  const d = mapDef('antipode-graybox');
  const lv = buildLevel(d);
  const config = defaultConfig();
  const ctx: SimContext = { level: lv, config, dt: TICK_DT };
  const world = createWorld(lv, 1);
  const s = d.spawns.find((sp) => sp.team === team)!;
  const p: PlayerState = addPlayer(world, createPlayer(0, team, s.pos, s.yawDeg, config));
  // (no input from the client yet: the body keeps its spawn view while gravity turns it over)
  for (let t = 0; t < (opts.camAfter ?? 0); t++)
    step(world, { [p.id]: { tick: world.tick + 1, buttons: 0, view: p.view } }, ctx);
  const cam = new FpsCamera(opts.start?.view ?? p.view, opts.start?.up ?? p.up);
  cam.followUp(p.up, Infinity, 1 / 60);
  for (let t = 0; t < 180; t++) {
    step(world, { [p.id]: { tick: world.tick + 1, buttons: 0, view: cam.quat } }, ctx);
    if ((t + 1) % opts.ticksPerFrame === 0) cam.followUp(p.up, Infinity, opts.ticksPerFrame / 60);
  }
  cam.followUp(p.up, Infinity, 1 / 60);
  return { p, cam };
};

/** a camera turned over on the ceiling deck, looking up 20° (the last round's, say) */
const ceilingCam = () => {
  const c = new FpsCamera(yawToView(-70, 0), UP);
  c.followUp(DOWN, Infinity, 1);
  c.look(0, -20);
  return { view: c.quat, up: DOWN };
};

describe('Antipode graybox: the camera after a spawn (no tilted screen)', () => {
  const cases: [string, Parameters<typeof run>[1]][] = [
    ['camera from the spawn', { ticksPerFrame: 1 }],
    ['slow frames (30 ticks a frame)', { ticksPerFrame: 30 }],
    [
      'last round looking down 25°',
      { ticksPerFrame: 3, start: { view: yawToView(30, -25), up: UP } },
    ],
    ['last round upside down looking up', { ticksPerFrame: 3, start: ceilingCam() }],
    ['last round upside down, slow frames', { ticksPerFrame: 30, start: ceilingCam() }],
    // the camera made from the body half-way through its turn (or after it): the spawn view is
    // upright while the body is already tilted — this left the screen slanted
    ...[1, 5, 9, 14, 17, 40].map((n): [string, Parameters<typeof run>[1]] => [
      `camera made ${n} ticks after the spawn`,
      { ticksPerFrame: 1, camAfter: n },
    ]),
  ];
  for (const [label, opts] of cases) {
    it(`Orange ends exactly upside down with no roll (${label})`, () => {
      const { p, cam } = run(1, opts);
      expect(p.up.y).toBeCloseTo(-1, 6);
      expect(cam.up.y).toBeCloseTo(-1, 6);
      expect(Math.abs(rollDeg(cam, p.up))).toBeLessThan(0.01);
      // the image itself is upside down (as far as the pitch lets it)
      expect(dot(cam.camUp(), DOWN)).toBeGreaterThan(0.4);
    });
    it(`Cyan stays upright with no roll (${label})`, () => {
      const { p, cam } = run(0, opts);
      expect(p.up.y).toBeCloseTo(1, 6);
      expect(cam.up.y).toBeCloseTo(1, 6);
      expect(Math.abs(rollDeg(cam, p.up))).toBeLessThan(0.01);
      expect(dot(cam.camUp(), UP)).toBeGreaterThan(0.4);
    });
  }
});
