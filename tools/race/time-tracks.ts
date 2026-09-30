// Race track timing: drives a skilled bot racer through every race track and surf map in the
// real simulation (bots/racer.ts: sprinting, bunny-hopping with first-tick jumps and perfect
// air-strafes, surfing, strafed flights that land on target; no SURGE, no hesitation) and
// prints its time (the practiced clean run), its splits (per act on surf maps) and where it
// fell. The track tests (packages/shared/test/race-tracks.test.ts, surf-maps.test.ts) check
// the same runs.
//
//   npx tsx tools/race/time-tracks.ts                   every race track and surf map
//   npx tsx tools/race/time-tracks.ts surf-copper-reef  one map
//   ... --human[=0.6]                                   a human's strafing instead
//   ... --sections                                      also from every restart bay (gates' and
//                                                       anchors') to the next gate: time, falls
//   ... --forks                                         also every optional line (RaceDef.forks):
//                                                       ridden? how long vs the racing line
import {
  addPlayer,
  buildLevel,
  createPlayer,
  createRacerMemory,
  createWorld,
  defaultConfig,
  driveNodes,
  driveRaceLine,
  formatRaceTime,
  getMap,
  mapDef,
  raceMaps,
  racerThink,
  resetRacer,
  sendRacerBack,
  step,
  v3,
  HUMAN_RACER,
  STEADY_RACER,
  TICK_DT,
  type RaceRunReport,
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
export const timeTrack = (id: string, human: boolean | number = false) => {
  const def = mapDef(id);
  const race = def.race!;
  const config = defaultConfig();
  const ctx = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 1);
  const g = race.grid[0];
  const p = addPlayer(world, createPlayer(1, 0, g.pos, g.yawDeg, config));
  resetRacer(p, config.movement, g.pos, g.yawDeg, 0);
  const skill =
    human === false ? STEADY_RACER : { ...HUMAN_RACER, strafeEff: human === true ? 0.6 : human };
  return driveRaceLine(ctx, world, p, step, skill, race.parSec * 2.5);
};

/**
 * From a restart bay (gate `cp`'s, or anchor `anchor`'s when ≥ 0) to the next gate: a fall
 * brings the racer back there, then it drives on (as bots do after a fall in a race).
 */
export const timeFromBay = (id: string, cp: number, anchor: number, maxSec = 90) => {
  const def = mapDef(id);
  const race = def.race!;
  const config = defaultConfig();
  const ctx = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 1);
  const at = anchor >= 0 ? race.anchors![anchor] : race.checkpoints[cp - 1];
  const p = addPlayer(world, createPlayer(1, 0, at.respawn, at.yawDeg, config));
  resetRacer(p, config.movement, at.respawn, at.yawDeg, cp);
  p.raceAnchor = anchor;
  const mem = createRacerMemory(1, STEADY_RACER, 7);
  p.pos = v3(at.respawn.x + 30, at.respawn.y + 30, at.respawn.z);
  racerThink(world, ctx, p, mem);
  sendRacerBack(world, ctx, p, 'key');
  let sec = -1;
  const start = world.tick;
  const r = driveRaceLine(
    ctx,
    world,
    p,
    (w, i, c) => {
      step(w, i, c);
      if (sec < 0 && w.events.some((e) => e.type === 'raceCp' && e.player === 1))
        sec = (w.tick - start) * TICK_DT;
    },
    STEADY_RACER,
    maxSec,
    mem,
  );
  return { sec, falls: r.falls.filter((f) => f.cp === cp) };
};

/**
 * Ride each optional line (RaceDef.forks) from its first point at the clean run's speed there;
 * compare with the clean run's time between the same two points.
 */
export const timeForks = (id: string) => {
  const def = mapDef(id);
  const race = def.race!;
  const config = defaultConfig();
  // the clean run's positions each tick (to time the racing line between two points)
  const track: { x: number; y: number; z: number; v: number }[] = [];
  {
    const ctx = { level: buildLevel(def), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 1);
    const g = race.grid[0];
    const p = addPlayer(world, createPlayer(1, 0, g.pos, g.yawDeg, config));
    resetRacer(p, config.movement, g.pos, g.yawDeg, 0);
    driveRaceLine(
      ctx,
      world,
      p,
      (w, i, c) => {
        step(w, i, c);
        track.push({ x: p.pos.x, y: p.pos.y - 0.9, z: p.pos.z, v: Math.hypot(p.vel.x, p.vel.z) });
      },
      STEADY_RACER,
      race.parSec * 2,
    );
  }
  const nearest = (q: { x: number; y: number; z: number }): number => {
    let best = 0;
    let bd = Infinity;
    track.forEach((t, i) => {
      const d = Math.hypot(t.x - q.x, t.y - q.y, t.z - q.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  return (race.forks ?? []).map((f) => {
    const ctx = { level: buildLevel(def), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 1);
    const a = f.riskyLine[0].pos;
    const b = f.riskyLine[1].pos;
    const i0 = nearest(a);
    const yaw = -((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI);
    const p = addPlayer(world, createPlayer(1, 0, a, yaw, config));
    resetRacer(p, config.movement, a, yaw, f.cp);
    const d = v3(b.x - a.x, 0, b.z - a.z);
    const l = Math.hypot(d.x, d.z) || 1;
    const speed = f.riskyLine[0].surf || f.riskyLine[0].air ? track[i0].v : 0;
    p.pos = v3(a.x, a.y + 0.92, a.z);
    p.vel = v3((d.x / l) * speed, 0, (d.z / l) * speed);
    const r = driveNodes(ctx, world, p, f.riskyLine, step, 60);
    const i1 = nearest(f.riskyLine[f.riskyLine.length - 1].pos);
    return {
      name: f.name,
      reached: r.reached,
      sec: r.timeSec,
      lineSec: (i1 - i0) * TICK_DT,
      respawns: r.respawns,
    };
  });
};

const printFalls = (falls: RaceRunReport['falls']): void => {
  for (const f of falls.slice(0, 8)) {
    const n = f.target;
    console.log(
      `  fell at ${f.pos.x.toFixed(1)}, ${f.pos.y.toFixed(1)}, ${f.pos.z.toFixed(1)} (after gate ${f.cp},` +
        ` heading for ${n ? `${n.x.toFixed(1)}, ${n.y.toFixed(1)}, ${n.z.toFixed(1)}` : '?'})`,
    );
  }
};

const main = (): void => {
  const want = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const h = process.argv.find((a) => a.startsWith('--human'));
  const human = h ? (h.includes('=') ? Number(h.split('=')[1]) : true) : false;
  const ids = raceMaps(true) // (retired tracks too: they come back when redone)
    .map((m) => m.id)
    .filter((id) => !want || id === want);
  for (const id of ids) {
    const def = mapDef(id);
    const race = def.race!;
    const t0 = Date.now();
    const r = timeTrack(id, human);
    console.log(
      `${def.name} (${id}): ${r.finished ? formatRaceTime(r.timeSec * 1000) : 'DID NOT FINISH'}` +
        ` · par ${formatRaceTime(race.parSec * 1000)} · line ${Math.round(lineLength(id))} m` +
        ` · ${race.checkpoints.length} checkpoints · ${def.boxes.length} boxes` +
        ` · top speed ${r.topSpeed.toFixed(1)} m/s` +
        ` · ${r.respawns} respawns · simulated in ${Date.now() - t0} ms`,
    );
    console.log(`  splits: ${r.splitsSec.map((s) => formatRaceTime(s * 1000)).join('  ')}`);
    if (getMap(id).surf) {
      // per act: gate to gate, with the gates' names
      const acts = r.splitsSec.map((s, i) => s - (i ? r.splitsSec[i - 1] : 0));
      const names = [...race.checkpoints.map((g, i) => g.name ?? `C${i + 1}`), 'Finish'];
      console.log(
        `  acts: ${acts.map((a, i) => `${i + 1} ${a.toFixed(1)} s → ${names[i]}`).join(' · ')}`,
      );
    }
    printFalls(r.falls);
    if (process.argv.includes('--forks'))
      for (const f of timeForks(id))
        console.log(
          `  line "${f.name}": ${f.reached ? `${f.sec.toFixed(1)} s (the racing line: ${f.lineSec.toFixed(1)} s, ${(f.lineSec - f.sec).toFixed(1)} s saved)` : `NOT RIDDEN (${f.respawns} falls)`}`,
        );
    if (process.argv.includes('--sections')) {
      race.checkpoints.forEach((g, i) => {
        const b = timeFromBay(id, i + 1, -1);
        console.log(
          `  from ${g.name ?? `C${i + 1}`}'s bay: ${b.sec >= 0 ? `${b.sec.toFixed(1)} s to the next gate` : 'NEVER REACHES the next gate'}`,
        );
        printFalls(b.falls);
      });
      (race.anchors ?? []).forEach((a, i) => {
        const b = timeFromBay(id, a.cp, i);
        console.log(
          `  from anchor ${a.name ?? `R${i + 1}`}'s bay: ${b.sec >= 0 ? `${b.sec.toFixed(1)} s to the next gate` : 'NEVER REACHES the next gate'}`,
        );
        printFalls(b.falls);
      });
    }
  }
};

if (process.argv[1]?.replace(/\\/g, '/').endsWith('race/time-tracks.ts')) main();
