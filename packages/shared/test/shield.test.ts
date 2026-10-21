import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  applyDamage,
  buildLevel,
  createMatch,
  createPlayer,
  createWorld,
  defaultConfig,
  mapDef,
  startMatch,
  step,
  updateMatch,
  v3,
  TICK_DT,
  type SimContext,
} from '../src/index';

// The round-start shield: soaks up one whole hit (not a Wind-up), then it's gone.

const setup = () => {
  const config = defaultConfig();
  const ctx: SimContext = { level: buildLevel(mapDef('kestrel')), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 3);
  const a = addPlayer(world, createPlayer(1, 0, v3(0, 0, 0), 0, config));
  const b = addPlayer(world, createPlayer(2, 1, v3(0, 0, -10), 180, config));
  return { ctx, world, a, b };
};

describe('round-start shield', () => {
  it('soaks up a whole headshot, then the next hit is for real', () => {
    const { ctx, world, b } = setup();
    b.shield = true;
    world.events = [];
    applyDamage(world, ctx, 1, b, 100, 'headshot', true, b.pos, v3());
    expect(b.alive).toBe(true);
    expect(b.hp).toBe(100);
    expect(b.shield).toBe(false);
    expect(world.events.some((e) => e.type === 'shieldBreak' && e.victim === 2)).toBe(true);
    expect(world.events.some((e) => e.type === 'hit')).toBe(false);
    applyDamage(world, ctx, 1, b, 100, 'headshot', true, b.pos, v3());
    expect(b.alive).toBe(false);
  });

  it('a small Laser shot breaks it too', () => {
    const { ctx, world, b } = setup();
    b.shield = true;
    applyDamage(world, ctx, 1, b, 20, 'laser', false, b.pos, v3());
    expect(b.shield).toBe(false);
    expect(b.hp).toBe(100);
  });

  it('a charged Wind-up Throw goes straight through; the map and the bomb ignore it', () => {
    const { ctx, world, b } = setup();
    b.shield = true;
    applyDamage(world, ctx, 1, b, 10000, 'windup', false, b.pos, v3());
    expect(b.alive).toBe(false);
    const w2 = setup();
    w2.b.shield = true;
    applyDamage(w2.world, w2.ctx, 2, w2.b, 9999, 'world', false, w2.b.pos, w2.b.pos);
    expect(w2.b.alive).toBe(false);
  });

  it('everyone gets one at the start of each round (Boomerang modes, not CS)', () => {
    for (const loadout of ['lethal', 'cs'] as const) {
      const { ctx, world, a, b } = setup();
      const ms = createMatch('1v1', 'tower', loadout);
      startMatch(ms, world, ctx);
      for (let i = 0; i < 5; i++) {
        step(world, {}, ctx);
        updateMatch(ms, world, ctx);
      }
      expect(a.shield).toBe(loadout === 'lethal');
      expect(b.shield).toBe(loadout === 'lethal');
    }
  });
});
