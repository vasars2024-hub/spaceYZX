// Trace a skilled bot racer from a checkpoint of a race track: every few ticks its position,
// speed, the line node it heads for and its keys (for building and debugging tracks).
//
//   npx tsx tools/race/trace.ts <map-id> [checkpoint] [seconds] [every-ticks]
import {
  addPlayer,
  buildLevel,
  createPlayer,
  createRacerMemory,
  createWorld,
  defaultConfig,
  lineNodeForCp,
  mapDef,
  racerThink,
  resetRacer,
  step,
  STEADY_RACER,
  TICK_DT,
} from '@space-yz/shared';

const [id = 'race-sunspire', cpArg = '0', secArg = '20', everyArg = '6'] = process.argv.slice(2);
const def = mapDef(id);
const race = def.race!;
const cp = Number(cpArg);
const config = defaultConfig();
const ctx = { level: buildLevel(def), config, dt: TICK_DT };
const world = createWorld(ctx.level, 1);
const at =
  cp === 0 ? { respawn: race.grid[0].pos, yawDeg: race.grid[0].yawDeg } : race.checkpoints[cp - 1];
const p = addPlayer(world, createPlayer(1, 0, at.respawn, at.yawDeg, config));
resetRacer(p, config.movement, at.respawn, at.yawDeg, cp);
const eff = Number(process.env.HUMAN ?? 1);
const mem = createRacerMemory(1, eff < 1 ? { ...STEADY_RACER, strafeEff: eff } : STEADY_RACER, 7);
mem.node = lineNodeForCp(race.line, cp);
const f = (n: number) => n.toFixed(1).padStart(6);
for (let t = 0; t < Number(secArg) / TICK_DT; t++) {
  const input = racerThink(world, ctx, p, mem);
  step(world, { 1: input }, ctx);
  const ev = world.events.filter((e) => 'player' in e && e.player === 1).map((e) => e.type);
  if (t % Number(everyArg) === 0 || ev.some((e) => e !== 'jump' && e !== 'land')) {
    const n = race.line[mem.node];
    console.log(
      `${(t * TICK_DT).toFixed(2).padStart(6)}s pos${f(p.pos.x)}${f(p.pos.y)}${f(p.pos.z)} v${f(Math.hypot(p.vel.x, p.vel.z))}${f(p.vel.y)} ` +
        `node ${mem.node} →${f(n.pos.x)}${f(n.pos.y)}${f(n.pos.z)}${n.jump ? ' J' : ''}${n.hop ? ' H' : ''}${n.strafe ? ' S' : ''}${n.surf ? ' R' : ''} ` +
        `${p.grounded ? 'G' : '-'} keys ${input.buttons} cp ${p.raceCp} ${ev.join(',')}`,
    );
  }
  if (world.events.some((e) => e.type === 'raceRespawn')) break;
}
