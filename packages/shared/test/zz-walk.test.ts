import { it } from 'vitest';
import {
  addPlayer,
  BOT_SKILLS,
  botThink,
  buildLevel,
  createBotMemory,
  createPlayer,
  createWorld,
  defaultConfig,
  step,
  TICK_DT,
  v3,
  withSkyArena,
} from '../src/index';
import { buildLeviathan } from '../src/level/maps/leviathan';

it('trace', () => {
  const d = withSkyArena(buildLeviathan());
  const goalName = process.env.GOAL ?? 'balN';
  const team = Number(process.env.TEAM ?? 1) as 0 | 1;
  const group = process.env.GROUP ?? 'heart';
  const lv = buildLevel(d);
  const config = defaultConfig();
  const ctx = { level: lv, config, dt: TICK_DT };
  const world = createWorld(lv, 3);
  const s = d.spawns.find((sp) => sp.team === team && sp.group === group)!;
  const p = addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
  const mem = createBotMemory(1, BOT_SKILLS.normal, 9);
  const goal = d.waypoints!.find((w) => w.name === goalName)!.pos;
  mem.objective = v3(goal.x, goal.y - 1, goal.z);
  mem.objectiveFirst = true;
  const out: string[] = [];
  for (let t = 0; t < 60 * 40; t++) {
    step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
    if (t % 60 === 0)
      out.push([t / 60, p.pos.x.toFixed(1), p.pos.y.toFixed(1), p.pos.z.toFixed(1), p.alive].join(' '));
  }
  throw new Error(out.join('\n'));
});
