// Network check: hit registration and Boomerang consistency, measured on a virtual network
// (the real server and real clients in one process, with exact, repeatable latency).
//   npm run netcheck                 (all scenarios at 0–200 ms ping)
//   npm run netcheck -- --quick      (shorter)
//   npm run netcheck -- --no-lagcomp (what it would be like without lag compensation)
import { agreement, SCENARIOS, type ScenarioReport } from './scenarios';

const quick = process.argv.includes('--quick');
const lagComp = !process.argv.includes('--no-lagcomp');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const seconds = quick ? 8 : 20;
const pings = [0, 50, 100, 150, 200];

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const print = (rtt: number, r: ScenarioReport): void => {
  const s = r.stats;
  console.log(
    `${`${r.name} @${rtt} ms`.padEnd(36)} ${String(s.shots).padStart(4)} shots  agree ${pct(agreement(s)).padStart(6)}  ` +
      `(hit/hit ${s.bothHit}, miss/miss ${s.bothMiss}, hit on screen but not counted ${s.falseNegative}, ` +
      `missed on screen but counted ${s.falsePositive})  view lag ${r.viewLagMs.toFixed(0)} ms`,
  );
  for (const [k, v] of Object.entries(r.events))
    if (v.shown !== v.real) console.log(`    ! ${k}: shown ${v.shown}×, really ${v.real}×`);
  for (const [k, v] of Object.entries(r.extra))
    console.log(`    ${k}: ${Number.isInteger(v) ? v : v.toFixed(3)}`);
};

for (const [name, run] of Object.entries(SCENARIOS)) {
  if (only && !name.startsWith(only)) continue;
  for (const rtt of pings)
    print(rtt, run({ link: { rttMs: rtt, jitterMs: rtt * 0.1 }, seconds, lagComp }));
  console.log('');
}
