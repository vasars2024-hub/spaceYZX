// TEMP
import { mapDef, buildLevel, defaultConfig, TICK_DT, createWorld, addPlayer, createPlayer, createBotMemory, BOT_SKILLS, botThink, step, v3, type SimContext } from '@space-yz/shared';
const [team, group, goalName] = [Number(process.argv[2]) as 0 | 1, process.argv[3], process.argv[4]];
const d = mapDef('afterglow');
const lv = buildLevel(d);
const config = defaultConfig();
const ctx: SimContext = { level: lv, config, dt: TICK_DT };
const world = createWorld(lv, 3);
const s = d.spawns.find((sp) => sp.team === team && sp.group === group)!;
const p = addPlayer(world, createPlayer(1, team, s.pos, s.yawDeg, config));
const mem = createBotMemory(1, BOT_SKILLS.normal, 9);
const goal = d.waypoints!.find((w) => w.name === goalName)!.pos;
mem.objective = v3(goal.x, goal.y - 1, goal.z);
mem.objectiveFirst = true;
for (let t = 0; t < 60 * 40; t++) {
  step(world, { 1: botThink(world, ctx, p, mem) }, ctx);
  if (t % 60 === 0) console.log(t / 60, p.pos.x.toFixed(1), p.pos.y.toFixed(1), p.pos.z.toFixed(1), p.alive, JSON.stringify(mem.path.map((q) => [q.x, q.z])));
  if (Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) < 2.5 && Math.abs(p.pos.y - 0.9 - (goal.y - 1)) < 1) { console.log('reached', t / 60); break; }
}
