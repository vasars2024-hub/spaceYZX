import { describe, expect, it } from 'vitest';
import {
  buildTestShip,
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  step,
  hashWorld,
  cloneWorld,
  rngFromSeed,
  rngNextU32,
  rngFloat,
  yawToView,
  TICK_DT,
  ALL_BUTTONS,
  type PlayerInput,
  type SimContext,
  type WorldState,
} from '../src/index';

const makeInputs = (
  seed: number,
  ticks: number,
  players: number[],
): Record<number, PlayerInput>[] => {
  const rng = rngFromSeed(seed);
  const out: Record<number, PlayerInput>[] = [];
  const yaw: Record<number, number> = {};
  const pitch: Record<number, number> = {};
  let held: Record<number, number> = {};
  for (let t = 0; t < ticks; t++) {
    const frame: Record<number, PlayerInput> = {};
    for (const id of players) {
      yaw[id] = (yaw[id] ?? 0) + (rngFloat(rng) - 0.5) * 12;
      pitch[id] = Math.max(-80, Math.min(80, (pitch[id] ?? 0) + (rngFloat(rng) - 0.5) * 6));
      if (t % 12 === 0) held = { ...held, [id]: rngNextU32(rng) & ALL_BUTTONS };
      frame[id] = { tick: t + 1, buttons: held[id], view: yawToView(yaw[id], pitch[id]) };
    }
    out.push(frame);
  }
  return out;
};

const setup = (): { ctx: SimContext; world: WorldState } => {
  const def = buildTestShip();
  const ctx: SimContext = { level: buildLevel(def), config: defaultConfig(), dt: TICK_DT };
  const world = createWorld(ctx.level, 99);
  const areas = def.areas ?? [];
  for (let i = 0; i < 4; i++) {
    const a = areas[i % areas.length];
    addPlayer(world, createPlayer(i + 1, (i % 2) as 0 | 1, a.pos, a.yawDeg, ctx.config));
  }
  return { ctx, world };
};

describe('determinism', () => {
  const inputs = makeInputs(1234, 600, [1, 2, 3, 4]);

  it('same inputs give the same final state', () => {
    const a = setup();
    const b = setup();
    for (const f of inputs) step(a.world, f, a.ctx);
    for (const f of inputs) step(b.world, f, b.ctx);
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    // players actually moved around
    const moved = a.world.players.some((p) => Math.abs(p.pos.x) + Math.abs(p.pos.z) > 1);
    expect(moved).toBe(true);
  });

  it('cloning mid-run and resuming matches a straight run', () => {
    const a = setup();
    for (const f of inputs) step(a.world, f, a.ctx);
    const b = setup();
    for (let i = 0; i < 300; i++) step(b.world, inputs[i], b.ctx);
    const c = { ctx: b.ctx, world: cloneWorld(b.world) };
    for (let i = 300; i < inputs.length; i++) step(c.world, inputs[i], c.ctx);
    expect(hashWorld(c.world)).toBe(hashWorld(a.world));
  });
});
