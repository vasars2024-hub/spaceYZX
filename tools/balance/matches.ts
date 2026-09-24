// npm run matches — full bot matches on Kestrel in every mode (rules, Controller & Tower),
// reporting round length, timeout rate and how rounds were won. Usage:
//   npm run matches -- [--matches 3] [--skill normal] [--modes 1v1,2v2,5v5]
import {
  buildLevel,
  mapDef,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  step,
  botThink,
  createBotMemory,
  BOT_SKILLS,
  createMatch,
  startMatch,
  updateMatch,
  applyBotObjectives,
  MODE_RULES,
  TICK_DT,
  type BotMemory,
  type BotSkill,
  type PlayerInput,
  type RankedMode,
  type SimContext,
} from '@space-yz/shared';

export interface ModeReport {
  mode: RankedMode;
  matches: number;
  rounds: number;
  avgRoundSec: number;
  avgMatchSec: number;
  timeoutPct: number;
  reasons: Record<string, number>; // % of rounds
  suddenDeathPct: number; // % of matches
  hardCapPct: number;
  drawPct: number; // % of matches
}

export const runMatches = (opts: {
  mode: RankedMode;
  matches: number;
  skill: BotSkill['name'];
  seed?: number;
}): ModeReport => {
  const size = MODE_RULES[opts.mode].teamSize;
  const reasons: Record<string, number> = {};
  let rounds = 0;
  let roundTicks = 0;
  let matchTicks = 0;
  let sudden = 0;
  let capped = 0;
  let draws = 0;
  for (let m = 0; m < opts.matches; m++) {
    const ctx: SimContext = {
      level: buildLevel(mapDef('kestrel')),
      config: defaultConfig(),
      dt: TICK_DT,
    };
    const world = createWorld(ctx.level, (opts.seed ?? 1) * 1000 + m);
    const mems: BotMemory[] = [];
    let id = 1;
    for (const team of [0, 1] as const)
      for (let i = 0; i < size; i++) {
        const s = ctx.level.def.spawns.find((sp) => sp.team === team)!;
        addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, ctx.config));
        mems.push(createBotMemory(id, BOT_SKILLS[opts.skill], id * 7 + m));
        id++;
      }
    const ms = createMatch(opts.mode);
    startMatch(ms, world, ctx);
    let liveStart = 0;
    while (ms.phase !== 'matchEnd') {
      applyBotObjectives(ms, world, ctx, mems);
      const inputs: Record<number, PlayerInput> = {};
      for (const mem of mems) {
        const p = world.players.find((q) => q.id === mem.id)!;
        inputs[p.id] = botThink(world, ctx, p, mem);
      }
      const before = ms.phase;
      step(world, inputs, ctx);
      updateMatch(ms, world, ctx);
      if (before !== 'live' && ms.phase === 'live') liveStart = world.tick;
      if (before === 'live' && ms.phase !== 'live') roundTicks += world.tick - liveStart;
    }
    for (const r of ms.rounds) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    rounds += ms.rounds.length;
    matchTicks += world.tick - ms.matchStartTick;
    if (ms.suddenDeath) sudden++;
    if (ms.endReason === 'time limit') capped++;
    if (ms.winner === null) draws++;
  }
  const pct = (n: number, d: number) => (d ? (100 * n) / d : 0);
  return {
    mode: opts.mode,
    matches: opts.matches,
    rounds,
    avgRoundSec: roundTicks / Math.max(1, rounds) / 60,
    avgMatchSec: matchTicks / opts.matches / 60,
    timeoutPct: pct((reasons.time ?? 0) + (reasons.draw ?? 0), rounds),
    reasons: Object.fromEntries(Object.entries(reasons).map(([k, v]) => [k, pct(v, rounds)])),
    suddenDeathPct: pct(sudden, opts.matches),
    hardCapPct: pct(capped, opts.matches),
    drawPct: pct(draws, opts.matches),
  };
};

const arg = (name: string, def: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const main = (): void => {
  const matches = Number(arg('matches', '3'));
  const skill = arg('skill', 'normal') as BotSkill['name'];
  const modes = arg('modes', '1v1,2v2,5v5').split(',') as RankedMode[];
  console.log(`\n  Kestrel bot matches (${skill} bots, ${matches} per mode)\n`);
  for (const mode of modes) {
    const t0 = performance.now();
    const r = runMatches({ mode, matches, skill });
    const reasons = Object.entries(r.reasons)
      .map(([k, v]) => `${k} ${v.toFixed(0)}%`)
      .join(', ');
    console.log(
      `  ${mode}: ${r.rounds} rounds · round ${r.avgRoundSec.toFixed(1)} s (limit ${MODE_RULES[mode].roundSec} s)` +
        ` · match ${(r.avgMatchSec / 60).toFixed(1)} min · timeouts ${r.timeoutPct.toFixed(0)}%` +
        ` · sudden death ${r.suddenDeathPct.toFixed(0)}% · hard cap ${r.hardCapPct.toFixed(0)}%` +
        `\n        won by: ${reasons}   (${((performance.now() - t0) / 1000).toFixed(1)} s)`,
    );
  }
  console.log('');
};

if (process.argv[1]?.endsWith('matches.ts')) main();
