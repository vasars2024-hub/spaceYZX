import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  buildLevel,
  compileCustomMap,
  createPlayer,
  createWorld,
  defaultConfig,
  lineOfSight,
  raycast,
  step,
  stepPredict,
  v3,
  TICK_DT,
  type CustomBlock,
  type CustomMapDoc,
  type CustomMover,
  type LevelDef,
  type PlayerState,
  type SimContext,
  type Vec3,
  type WorldState,
} from '../src/index';

// Player-made maps in the sim: kill paint, and moving blocks (collision, riders, timing).

const floor: CustomBlock = {
  id: 1,
  shape: 'box',
  pos: [0, -0.5, 0],
  size: [60, 1, 60],
  mat: 'concrete',
};

const doc = (more: Partial<CustomMapDoc> = {}): CustomMapDoc => ({
  v: 1,
  name: 'Sim test',
  base: '',
  sky: 'day',
  blocks: [floor],
  movers: [],
  spawns: [],
  portals: [],
  launchPads: [],
  ...more,
});

interface Sim {
  ctx: SimContext;
  world: WorldState;
  p: PlayerState;
}

const sim = (def: LevelDef, feet: Vec3): Sim => {
  const config = defaultConfig();
  const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 1);
  const p = addPlayer(world, createPlayer(1, 0, feet, 0, config));
  return { ctx, world, p };
};

const run = (s: Sim, n: number): void => {
  for (let i = 0; i < n; i++)
    step(s.world, { 1: { tick: s.world.tick + 1, buttons: 0, view: s.p.view } }, s.ctx);
};

const feetY = (s: Sim): number => s.p.pos.y - s.ctx.config.movement.standHeight / 2;

const paint: CustomBlock = {
  id: 2,
  shape: 'killpaint',
  pos: [10, 0.05, 0],
  size: [4, 0.1, 4],
  mat: 'killpaint',
};

describe('kill paint', () => {
  it('free roam: standing on it kills you; standing next to it does not', () => {
    const def = compileCustomMap(doc({ blocks: [floor, paint] }));
    const on = sim(def, v3(10, 0.1, 0));
    run(on, 30);
    expect(on.p.alive).toBe(false);
    const off = sim(def, v3(14, 0, 0));
    run(off, 60);
    expect(off.p.alive).toBe(true);
  });

  it('walking into it kills you', () => {
    const def = compileCustomMap(doc({ blocks: [floor, paint] }));
    const s = sim(def, v3(4, 0, 0));
    run(s, 20);
    s.p.vel = v3(6, 0, 0);
    for (let i = 0; i < 120 && s.p.alive; i++) {
      s.p.vel = v3(6, s.p.vel.y, 0);
      run(s, 1);
    }
    expect(s.p.alive).toBe(false);
    expect(s.p.pos.x).toBeLessThan(9);
  });

  it('race: it sends you back to your last checkpoint', () => {
    const def = compileCustomMap(
      doc({
        blocks: [floor, paint],
        race: {
          start: { pos: [-20, 1.5, 0], size: [6, 3, 6], yaw: 90 },
          checkpoints: [{ pos: [0, 1.5, 0], size: [4, 3, 8], yaw: 90 }],
          finish: { pos: [25, 1.5, 0], size: [4, 3, 8], yaw: 90 },
        },
      }),
    );
    expect(def.killVolumes).toBeUndefined();
    const s = sim(def, v3(10, 0.1, 0));
    s.p.raceCp = 1; // racing, checkpoint 1 passed
    run(s, 3);
    expect(s.p.alive).toBe(true);
    expect(s.p.pos.x).toBeCloseTo(0, 3);
    expect(s.p.racePenalty).toBeGreaterThan(0);
  });
});

describe('glass', () => {
  it('is solid (you stand on it, shots stop) but you see through it', () => {
    const glass: CustomBlock = {
      id: 3,
      shape: 'box',
      pos: [0, 5, -10],
      size: [6, 0.5, 6],
      mat: 'glass',
    };
    const wall: CustomBlock = { ...glass, id: 4, pos: [10, 2, 0], size: [0.3, 4, 6] };
    const def = compileCustomMap(doc({ blocks: [floor, glass, wall] }));
    const s = sim(def, v3(0, 5.3, -10));
    run(s, 30);
    expect(feetY(s)).toBeGreaterThan(5.2);
    expect(raycast(s.ctx.level, v3(0, 2, 0), v3(1, 0, 0), 20)?.box).toBe(2);
    expect(lineOfSight(s.ctx.level, v3(0, 2, 0), v3(20, 2, 0))).toBe(true);
  });
});

/** A 4 x 0.5 x 4 platform moving through `points` (its centre). */
const moverDoc = (points: [number, number, number][], speed: number, delay: number) => {
  const block: CustomBlock = {
    id: 5,
    shape: 'box',
    pos: points[0],
    size: [4, 0.5, 4],
    mat: 'metal',
  };
  const mover: CustomMover = { block: 5, points, speed, delay };
  return doc({ blocks: [floor, block], movers: [mover] });
};

describe('moving blocks', () => {
  it('visits 1 → 2 → 3 → 4 → 1 in order, waiting at each point', () => {
    const pts: [number, number, number][] = [
      [0, 5, 0],
      [6, 5, 0],
      [6, 11, 0],
      [0, 11, 0],
    ];
    const def = compileCustomMap(moverDoc(pts, 3, 0.5));
    const s = sim(def, v3(20, 0, 20));
    const at = (): Vec3 => {
      const b = s.ctx.level.boxes[1];
      return v3(b.c.x, b.c.y, b.c.z);
    };
    const wait = 30; // 0.5 s
    const leg = 120; // 6 m at 3 m/s
    // tick 0..wait: at point 1
    run(s, wait - 1);
    expect(at()).toEqual(v3(0, 5, 0));
    run(s, leg / 2 + 1); // halfway to point 2
    expect(at().x).toBeCloseTo(3, 9);
    run(s, leg / 2); // arrived: waiting at point 2
    expect(at()).toEqual(v3(6, 5, 0));
    run(s, wait + leg); // point 3
    expect(at()).toEqual(v3(6, 11, 0));
    run(s, wait + leg); // point 4
    expect(at()).toEqual(v3(0, 11, 0));
    run(s, wait + leg); // back to point 1 (not back through 3)
    expect(at()).toEqual(v3(0, 5, 0));
    expect(s.world.tick).toBe(4 * (wait + leg));
  });

  it('carries a player standing on it (sideways, up and down)', () => {
    const def = compileCustomMap(
      moverDoc(
        [
          [0, 3, 0],
          [8, 3, 0],
          [8, 7, 0],
        ],
        4,
        0.2,
      ),
    );
    const s = sim(def, v3(0.5, 3.25, 0.5));
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.1);
    run(s, 10);
    near(feetY(s), 3.25);
    const start = s.p.pos.x;
    const b = s.ctx.level.boxes[1];
    const bx0 = b.c.x;
    run(s, 12 + 120); // across to point 2
    expect(b.c.x).toBeCloseTo(8, 6);
    near(s.p.pos.x - start, b.c.x - bx0);
    near(feetY(s), 3.25);
    run(s, 12 + 60); // up to point 3
    expect(b.c.y).toBeCloseTo(7, 6);
    near(feetY(s), 7.25);
    expect(s.p.alive).toBe(true);
    run(s, 12 + 60); // back down and across toward point 1
    expect(b.c.y).toBeLessThan(6.5);
    near(feetY(s), b.c.y + 0.25);
  });

  it('is hit by rays where it is now', () => {
    const def = compileCustomMap(
      moverDoc(
        [
          [0, 4, 0],
          [10, 4, 0],
        ],
        5,
        0,
      ),
    );
    const s = sim(def, v3(20, 0, 20));
    const down = v3(0, -1, 0);
    run(s, 60); // 5 m along
    const b = s.ctx.level.boxes[1];
    expect(b.c.x).toBeCloseTo(5, 6);
    const hit = raycast(s.ctx.level, v3(5, 10, 0), down, 20);
    expect(hit?.box).toBe(1);
    expect(hit?.point.y).toBeCloseTo(4.25, 6);
    // its old place is empty: the ray goes on to the floor
    expect(raycast(s.ctx.level, v3(0, 10, 0), down, 20)?.box).toBe(0);
    // a sideways ray (and the grid-free bounding-box path) sees it too
    expect(raycast(s.ctx.level, v3(-20, 4, 0), v3(1, 0, 0), 60)?.box).toBe(1);
    expect(raycast(s.ctx.level, v3(-20, 4, 0), v3(1, 0, 0), 60, 0.2)?.box).toBe(1);
  });

  it('crushes a player it lands on', () => {
    const def = compileCustomMap(
      moverDoc(
        [
          [0, 6, 0],
          [0, 0.25, 0],
        ],
        6,
        0.5,
      ),
    );
    const s = sim(def, v3(0, 0, 0));
    run(s, 120);
    expect(s.p.alive).toBe(false);
  });

  it('the client prediction and the server agree while riding', () => {
    const def = compileCustomMap(
      moverDoc(
        [
          [0, 3, 0],
          [7, 3, 3],
          [7, 8, 3],
          [0, 5, -2],
        ],
        5,
        0.3,
      ),
    );
    const server = sim(def, v3(0.3, 3.3, 0.2));
    // the client: its own level (like another machine), stepping only itself
    const client = sim(def, v3(0.3, 3.3, 0.2));
    for (let t = 1; t <= 600; t++) {
      const buttons = t >= 100 && t < 103 ? 1 : 0; // a small step forward
      const input = { tick: t, buttons, view: server.p.view };
      step(server.world, { 1: input }, server.ctx);
      stepPredict(client.world, 1, input, client.ctx);
      expect([t, client.p.pos, client.p.vel, client.p.move]).toEqual([
        t,
        server.p.pos,
        server.p.vel,
        server.p.move,
      ]);
    }
    // a replay from an older state (a correction) lands on the same spot too
    const replay = sim(def, v3(0.3, 3.3, 0.2));
    replay.world = JSON.parse(JSON.stringify(server.world)) as WorldState;
    replay.p = replay.world.players[0];
    for (let t = 601; t <= 700; t++) {
      const input = { tick: t, buttons: 0, view: server.p.view };
      step(server.world, { 1: input }, server.ctx);
      stepPredict(replay.world, 1, input, replay.ctx);
    }
    expect(replay.p.pos).toEqual(server.p.pos);
    // (still riding: it never fell off)
    expect(server.p.alive).toBe(true);
    expect(feetY(server)).toBeGreaterThan(server.ctx.level.boxes[1].c.y);
  });

  it('maps without movers build no movers', () => {
    const s = sim(compileCustomMap(doc()), v3(0, 0, 0));
    expect(s.ctx.level.movers).toHaveLength(0);
    expect(s.ctx.level.moverBoxes).toHaveLength(0);
  });
});
