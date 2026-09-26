// npm run balance — headless bot-vs-bot matches in the Training Bay, reporting the combat
// metrics from the build plan against their targets. Usage:
//   npm run balance -- [--minutes 3] [--matches 4] [--skill normal] [--size 2]
import {
  buildTrainingBay,
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  step,
  botThink,
  createBotMemory,
  BOT_SKILLS,
  StatsTracker,
  createPractice,
  updatePractice,
  TICK_DT,
  type BotSkill,
  type PlayerInput,
  type SimContext,
  type BalanceReport,
} from '@space-yz/shared';

const arg = (name: string, def: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

export const runBalance = (opts: {
  minutes: number;
  matches: number;
  skill: BotSkill['name'];
  size: number;
  seed?: number;
}): BalanceReport => {
  const tracker = new StatsTracker();
  for (let m = 0; m < opts.matches; m++) {
    const def = buildTrainingBay();
    const ctx: SimContext = { level: buildLevel(def), config: defaultConfig(), dt: TICK_DT };
    const world = createWorld(ctx.level, (opts.seed ?? 1) * 100 + m);
    const mems = [];
    let id = 1;
    for (const team of [0, 1] as const) {
      const spawns = def.spawns.filter((s) => s.team === team);
      for (let i = 0; i < opts.size; i++) {
        const s = spawns[i % spawns.length];
        addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, ctx.config));
        mems.push(createBotMemory(id, BOT_SKILLS[opts.skill], m + 1));
        id++;
      }
    }
    const practice = createPractice(2);
    const ticks = Math.round((opts.minutes * 60) / TICK_DT);
    for (let t = 0; t < ticks; t++) {
      const inputs: Record<number, PlayerInput> = {};
      for (const mem of mems) {
        const p = world.players.find((pp) => pp.id === mem.id)!;
        inputs[p.id] = botThink(world, ctx, p, mem);
      }
      step(world, inputs, ctx);
      tracker.observe(world);
      for (const rid of updatePractice(practice, world, ctx)) tracker.onRespawn(rid);
    }
  }
  return tracker.report();
};

const fmt = (v: number, unit = '%'): string => `${v.toFixed(1)}${unit}`;

const main = (): void => {
  const minutes = Number(arg('minutes', '3'));
  const matches = Number(arg('matches', '4'));
  const skill = arg('skill', 'normal') as BotSkill['name'];
  const size = Number(arg('size', '2'));
  const t0 = performance.now();
  const r = runBalance({ minutes, matches, skill, size });
  const secs = (performance.now() - t0) / 1000;
  const rows: [string, string, string, boolean][] = [
    [
      'Boomerang hit %',
      fmt(r.boomerangHitPct),
      '30–40%',
      r.boomerangHitPct >= 30 && r.boomerangHitPct <= 40,
    ],
    [
      'Average fight length',
      fmt(r.avgFightSec, ' s'),
      '1.5–3 s',
      r.avgFightSec >= 1.5 && r.avgFightSec <= 3,
    ],
    ['Off-screen deaths', fmt(r.offscreenDeathPct), '< 20%', r.offscreenDeathPct < 20],
    [
      'Wind-up kills',
      fmt(r.windupKillPct),
      '10–20%',
      r.windupKillPct >= 10 && r.windupKillPct <= 20,
    ],
    ['Lethal Recall kills', fmt(r.recallKillPct), '≤ 25–30%', r.recallKillPct <= 30],
    ['Deflect success', fmt(r.deflectPct), 'single digits', r.deflectPct < 10],
    ['Headshot kills', fmt(r.headshotKillPct), 'not most kills', r.headshotKillPct < 50],
    ['Laser hit %', fmt(r.laserHitPct), '(info)', true],
  ];
  console.log(
    `\nLethal Recoil balance report — ${matches} × ${minutes} min, ${size}v${size}, ${skill} bots (${secs.toFixed(1)} s)\n`,
  );
  const w = Math.max(...rows.map((x) => x[0].length));
  for (const [name, val, target, ok] of rows)
    console.log(`  ${ok ? '✓' : '·'} ${name.padEnd(w)}  ${val.padStart(8)}   target ${target}`);
  console.log(
    `\n  Kills: ${r.totalKills} — ${Object.entries(r.killsByKind)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}\n`,
  );
  console.log('  Note: bots only approximate human players; use this to spot big imbalances,');
  console.log('  then fine-tune with real playtests and the tuning panel.\n');
};

if (process.argv[1] && /balance[\\/]run\.ts$/.test(process.argv[1])) main();
