// Race track timing: drives a steady bot racer (sprinting on the racing line: no slides, no
// surges, no shortcuts, no bunny hops) through every race track in the real simulation and
// prints its time, its splits and where it fell. The track tests
// (packages/shared/test/race-tracks.test.ts) check the same run lands in 2:30–3:30.
//
//   npx tsx tools/race/time-tracks.ts               every race track
//   npx tsx tools/race/time-tracks.ts race-canopy   one track
import {
  addPlayer,
  buildLevel,
  createPlayer,
  createWorld,
  defaultConfig,
  driveRaceLine,
  formatRaceTime,
  mapDef,
  raceMaps,
  resetRacer,
  step,
  TICK_DT,
} from '@space-yz/shared';

/** Length of a track's racing line (m, straight between nodes: rails, pads and portals too). */
const lineLength = (id: string): number => {
  const line = mapDef(id).race!.line;
  let l = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1].pos;
    const b = line[i].pos;
    if (!line[i - 1].portal) l += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return l;
};

/** Time a steady racer needs on a track (seconds), with the run report. */
export const timeTrack = (id: string) => {
  const def = mapDef(id);
  const race = def.race!;
  const config = defaultConfig();
  const ctx = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 1);
  const g = race.grid[0];
  const p = addPlayer(world, createPlayer(1, 0, g.pos, g.yawDeg, config));
  resetRacer(p, config.movement, g.pos, g.yawDeg, 0);
  return driveRaceLine(ctx, world, p, step, undefined, race.parSec * 2.5);
};

const main = (): void => {
  const want = process.argv[2];
  const ids = raceMaps()
    .map((m) => m.id)
    .filter((id) => !want || id === want);
  for (const id of ids) {
    const def = mapDef(id);
    const race = def.race!;
    const t0 = Date.now();
    const r = timeTrack(id);
    console.log(
      `${def.name} (${id}): ${r.finished ? formatRaceTime(r.timeSec * 1000) : 'DID NOT FINISH'}` +
        ` · par ${formatRaceTime(race.parSec * 1000)} · line ${Math.round(lineLength(id))} m` +
        ` · ${race.checkpoints.length} checkpoints · ${def.boxes.length} boxes` +
        ` · ${r.respawns} respawns · simulated in ${Date.now() - t0} ms`,
    );
    console.log(`  splits: ${r.splitsSec.map((s) => formatRaceTime(s * 1000)).join('  ')}`);
    for (const f of r.falls.slice(0, 8)) {
      const n = race.line[f.node];
      console.log(
        `  fell at ${f.pos.x.toFixed(1)}, ${f.pos.y.toFixed(1)}, ${f.pos.z.toFixed(1)} (after gate ${f.cp},` +
          ` heading for node ${f.node}${n ? ` at ${n.pos.x.toFixed(1)}, ${n.pos.y.toFixed(1)}, ${n.pos.z.toFixed(1)}${n.jump ? ' jump' : ''}` : ''})`,
      );
    }
  }
};

if (process.argv[1]?.replace(/\\/g, '/').endsWith('race/time-tracks.ts')) main();
