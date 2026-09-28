import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  buildLevel,
  Btn,
  createPlayer,
  createRace,
  createWorld,
  defaultConfig,
  driveRaceLine,
  hashWorld,
  raceJoin,
  raceLeave,
  raceView,
  requestRaceStart,
  resetRacer,
  step,
  TICK_DT,
  updateRace,
  v3,
  yawToView,
  type LevelDef,
  type PlayerInput,
  type PlayerState,
  type RaceState,
  type SimContext,
  type WorldState,
} from '../src/index';

/** A gate across the track at z (heading north): the respawn just past it. */
const gateAt = (z: number) => ({
  min: v3(-5, 48.5, z - 5),
  max: v3(5, 56, z + 5),
  respawn: v3(0, 50, z - 2.5),
  yawDeg: 0,
});

/**
 * A short straight track high in the air: start, gate 1 at 30 m, gate 2 at 60 m, the finish at
 * 90 m (all heading north, -z); a fuel cell 10 m in. Falling off: below y 40.
 */
const testTrack = (): LevelDef => {
  const grid = Array.from({ length: 8 }, (_, i) => ({
    pos: v3(((i % 4) - 1.5) * 1.4, 50, -2.5 + Math.floor(i / 4) * 2.5),
    yawDeg: 0,
  }));
  const line = [0, -14, -30, -45, -60, -75, -90, -100].map((z) => ({
    pos: v3(0, 50, z),
    cp: z > -30 ? 0 : z > -60 ? 1 : z > -90 ? 2 : 3,
  }));
  return {
    name: 'test track',
    boundsMin: v3(-60, 0, -160),
    boundsMax: v3(60, 100, 40),
    defaultGravity: v3(0, -1, 0),
    // one straight walkway, 6 m wide
    boxes: [{ c: v3(0, 49.5, -50), h: v3(3, 0.5, 56), mat: 'rock', color: 0x888888 }],
    zones: [],
    rails: [],
    pads: [],
    spawns: grid,
    towers: [],
    race: {
      parSec: 20,
      start: { respawn: v3(0, 50, -4), yawDeg: 0 },
      grid,
      checkpoints: [gateAt(-30), gateAt(-60)],
      finish: gateAt(-90),
      killY: 40,
      killVolumes: [],
      fuelCells: [v3(0, 51.1, -14)],
      line,
      forks: [],
    },
  };
};

interface RaceSim {
  ctx: SimContext;
  world: WorldState;
  st: RaceState;
  players: PlayerState[];
}

const makeRace = (n = 2, settings: Parameters<typeof createRace>[1] = {}): RaceSim => {
  const config = defaultConfig();
  const def = testTrack();
  const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 3);
  const st = createRace('test', { lobbySec: 1, resultsSec: 2, ...settings });
  const players: PlayerState[] = [];
  for (let i = 0; i < n; i++) {
    const s = def.race!.grid[i];
    players.push(addPlayer(world, createPlayer(i + 1, (i % 2) as 0 | 1, s.pos, s.yawDeg, config)));
    raceJoin(st, world, ctx, i + 1);
  }
  return { ctx, world, st, players };
};

/** One tick: everyone's inputs (default: nothing pressed, looking north), then the rules. */
const tick = (r: RaceSim, inputs: Record<number, Partial<PlayerInput>> = {}): void => {
  const all: Record<number, PlayerInput> = {};
  for (const p of r.players)
    all[p.id] = { tick: r.world.tick + 1, buttons: 0, view: yawToView(0), ...inputs[p.id] };
  step(r.world, all, r.ctx);
  updateRace(r.st, r.world, r.ctx);
};

const ticks = (r: RaceSim, n: number, inputs: Record<number, Partial<PlayerInput>> = {}) => {
  for (let i = 0; i < n; i++) tick(r, inputs);
};

/** Lobby → countdown → GO. */
const toGo = (r: RaceSim): void => {
  requestRaceStart(r.st, r.world);
  for (let i = 0; i < 60 * 10 && r.st.phase !== 'racing'; i++) tick(r);
};

describe('race rules: start', () => {
  it('counts down 3-2-1 with everyone frozen on the grid, then starts the clock', () => {
    const r = makeRace(2);
    expect(r.st.phase).toBe('lobby');
    // lobby: free running, gates don't count
    ticks(r, 30, { 1: { buttons: Btn.Forward } });
    expect(r.players[0].raceCp).toBe(-1);
    ticks(r, 40);
    expect(r.st.phase).toBe('countdown');
    const grid = r.ctx.level.def.race!.grid;
    for (const [i, p] of r.players.entries()) {
      expect(p.frozen).toBe(true);
      expect(p.raceCp).toBe(0);
      expect(p.pos.x).toBeCloseTo(grid[i].pos.x, 5);
      expect(p.pos.z).toBeCloseTo(grid[i].pos.z, 5);
    }
    // frozen: pressing forward during the countdown doesn't move you
    const z0 = r.players[0].pos.z;
    ticks(r, 60, { 1: { buttons: Btn.Forward } });
    expect(r.players[0].pos.z).toBeCloseTo(z0, 5);
    expect(r.st.phase).toBe('countdown');
    ticks(r, 125);
    expect(r.st.phase).toBe('racing');
    expect(r.players.every((p) => !p.frozen)).toBe(true);
    expect(r.st.startTick).toBeGreaterThan(0);
  });

  it('works solo (a time trial)', () => {
    const r = makeRace(1);
    toGo(r);
    expect(r.st.racers).toEqual([1]);
    expect(r.st.phase).toBe('racing');
  });
});

describe('race rules: no combat', () => {
  it('racers pass through each other and nobody can hurt anybody', () => {
    const r = makeRace(2);
    toGo(r);
    const [a, b] = r.players;
    // both on the very same spot, running the same way, one attacking with everything
    b.pos = { ...a.pos };
    const attack = Btn.Forward | Btn.Fire | Btn.Alt | Btn.Melee | Btn.Grenade;
    const events: string[] = [];
    for (let i = 0; i < 120; i++) {
      tick(r, {
        1: { buttons: i % 2 ? attack : Btn.Forward },
        2: { buttons: Btn.Forward },
      });
      events.push(...r.world.events.map((e) => e.type));
    }
    expect(a.hp).toBe(r.ctx.config.combat.maxHp);
    expect(b.hp).toBe(r.ctx.config.combat.maxHp);
    expect(a.alive && b.alive).toBe(true);
    for (const t of ['hit', 'kill', 'throw', 'slash', 'grenadeThrow', 'laserFire'])
      expect(events).not.toContain(t);
    // they ran through each other: still in the same place
    expect(Math.abs(a.pos.z - b.pos.z)).toBeLessThan(1e-6);
    expect(r.world.grenades).toEqual([]);
  });
});

describe('race rules: checkpoints', () => {
  it('a fall puts you back at your last checkpoint, frozen for the penalty', () => {
    const r = makeRace(1);
    toGo(r);
    const p = r.players[0];
    const race = r.ctx.level.def.race!;
    // run through gate 1
    for (let i = 0; i < 60 * 6 && p.raceCp < 1; i++) tick(r, { 1: { buttons: Btn.Forward } });
    expect(p.raceCp).toBe(1);
    // then walk off the side
    const side = yawToView(-90); // facing +x
    let respawn = null as null | { penalty: boolean; cp: number };
    for (let i = 0; i < 60 * 5 && !respawn; i++) {
      tick(r, { 1: { buttons: Btn.Forward, view: side } });
      for (const e of r.world.events) if (e.type === 'raceRespawn') respawn = e;
    }
    expect(respawn).toEqual(expect.objectContaining({ cp: 1, penalty: true, reason: 'fall' }));
    const at = race.checkpoints[0].respawn;
    expect(p.pos.x).toBeCloseTo(at.x, 5);
    expect(p.pos.z).toBeCloseTo(at.z, 5);
    expect(p.frozen).toBe(true);
    const penalty = Math.round(r.ctx.config.movement.racePenaltySec / TICK_DT);
    expect(p.racePenalty).toBe(penalty);
    ticks(r, penalty - 2, { 1: { buttons: Btn.Forward } });
    expect(p.frozen).toBe(true);
    expect(p.pos.z).toBeCloseTo(at.z, 5);
    ticks(r, 3, { 1: { buttons: Btn.Forward } });
    expect(p.frozen).toBe(false);
    expect(r.st.entries[0].respawns).toBe(1);
  });

  it('holding the respawn key does the same (a tap does nothing)', () => {
    const r = makeRace(1);
    toGo(r);
    const p = r.players[0];
    ticks(r, 60, { 1: { buttons: Btn.Forward } });
    const z = p.pos.z;
    ticks(r, 3, { 1: { buttons: Btn.Recall } });
    ticks(r, 2);
    expect(p.frozen).toBe(false);
    expect(p.pos.z).toBeLessThan(z + 0.5);
    let back = false;
    for (let i = 0; i < 30 && !back; i++) {
      tick(r, { 1: { buttons: Btn.Recall } });
      back = r.world.events.some((e) => e.type === 'raceRespawn' && e.reason === 'key');
    }
    expect(back).toBe(true);
    expect(p.pos.z).toBeCloseTo(r.ctx.level.def.race!.start.respawn.z, 5);
    expect(p.frozen).toBe(true);
    // still holding: no second respawn once the penalty is over
    ticks(r, 120, { 1: { buttons: Btn.Recall } });
    expect(r.st.entries[0].respawns).toBe(1);
  });

  it('gates only count in order', () => {
    const r = makeRace(1);
    toGo(r);
    const p = r.players[0];
    const race = r.ctx.level.def.race!;
    // teleport straight past gate 1 into gate 2: nothing counts
    const g2 = race.checkpoints[1];
    p.pos = v3((g2.min.x + g2.max.x) / 2, g2.min.y + 2.4, (g2.min.z + g2.max.z) / 2);
    ticks(r, 5);
    expect(p.raceCp).toBe(0);
  });
});

describe('race rules: surge and fuel', () => {
  it('three SURGE charges: +60 % of sprint speed at once, none outside a race', () => {
    const r = makeRace(1);
    const p = r.players[0];
    const m = r.ctx.config.movement;
    // lobby: the dash key does nothing
    ticks(r, 40, { 1: { buttons: Btn.Forward } });
    tick(r, { 1: { buttons: Btn.Forward | Btn.Dash } });
    expect(p.surgeLeft).toBe(3);
    toGo(r);
    ticks(r, 60, { 1: { buttons: Btn.Forward } });
    const before = Math.hypot(p.vel.x, p.vel.z);
    expect(before).toBeCloseTo(m.raceSprintSpeed, 0);
    tick(r, { 1: { buttons: Btn.Forward | Btn.Dash } });
    expect(p.surgeLeft).toBe(2);
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeGreaterThan(m.raceSprintSpeed * m.raceSurgeMul - 0.6);
    // it lasts about a second, then running speed is back to normal
    ticks(r, 40, { 1: { buttons: Btn.Forward } });
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeGreaterThan(m.raceSprintSpeed * 1.4);
    ticks(r, 60, { 1: { buttons: Btn.Forward } });
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeLessThan(m.raceSprintSpeed + 0.5);
    // (the rest facing back the way you came: the test track is short at race speed)
    for (let i = 0; i < 4; i++) {
      tick(r, { 1: { buttons: Btn.Dash, view: yawToView(180) } });
      ticks(r, 70, { 1: { view: yawToView(180) } });
    }
    expect(p.surgeLeft).toBe(0);
    expect(r.st.entries[0].surges).toBe(3);
  });

  it('the race tank never refills by itself; a fuel cell fills it once per race', () => {
    const r = makeRace(1);
    toGo(r);
    const p = r.players[0];
    const m = r.ctx.config.movement;
    expect(p.jetFuel).toBeCloseTo(m.raceJetpackFuelSec, 5);
    // burn some fuel: jump, then hold Space in the air
    tick(r, { 1: { buttons: Btn.Jump } });
    ticks(r, 5);
    ticks(r, 40, { 1: { buttons: Btn.Jump } });
    ticks(r, 120);
    const left = p.jetFuel;
    expect(left).toBeLessThan(m.raceJetpackFuelSec - 0.3);
    ticks(r, 180);
    expect(p.jetFuel).toBe(left);
    // run through the fuel cell (on the middle of the track, 10 m in)
    p.pos.x = r.ctx.level.def.race!.fuelCells![0].x;
    let used = false;
    for (let i = 0; i < 120 && !used; i++) {
      tick(r, { 1: { buttons: Btn.Forward } });
      used = r.world.events.some((e) => e.type === 'raceFuel');
    }
    expect(used).toBe(true);
    expect(p.jetFuel).toBeCloseTo(m.raceJetpackFuelSec, 5);
    expect(p.raceFuel).toBe(1);
  });

  it('every ignition costs fuel: tapping the jetpack to hover lasts no longer than holding it', () => {
    const r = makeRace(1);
    toGo(r);
    const p = r.players[0];
    const m = r.ctx.config.movement;
    // high over the track, still: pulse Space (held 7 ticks, let go 1) until the tank is dry;
    // each ignition catches the fall, but costs raceJetIgniteSec on top of the burn
    p.pos = v3(0, 90, -10);
    p.vel = v3();
    let t = 0;
    for (; t < 60 * 10 && p.jetFuel > 0; t++) tick(r, { 1: { buttons: t % 8 < 7 ? Btn.Jump : 0 } });
    expect(t * TICK_DT).toBeLessThan(1.5);
    expect(t * TICK_DT).toBeLessThan(m.raceJetpackFuelSec);
  });

  it('a respawn gives back the fuel you had when you passed the checkpoint, never a full tank', () => {
    const r = makeRace(1);
    toGo(r);
    const p = r.players[0];
    const m = r.ctx.config.movement;
    // through gate 1 with half a tank, then burn it nearly dry and walk off the side
    p.jetFuel = 0.5;
    for (let i = 0; i < 60 * 6 && p.raceCp < 1; i++) tick(r, { 1: { buttons: Btn.Forward } });
    expect(p.raceCp).toBe(1);
    p.jetFuel = 0.1;
    let back = false;
    for (let i = 0; i < 60 * 5 && !back; i++) {
      tick(r, { 1: { buttons: Btn.Forward, view: yawToView(-90) } });
      back = r.world.events.some((e) => e.type === 'raceRespawn');
    }
    expect(back).toBe(true);
    expect(p.jetFuel).toBeCloseTo(0.5, 5);
    expect(p.jetFuel).toBeLessThan(m.raceJetpackFuelSec);
  });
});

describe('race rules: finish', () => {
  it('times the finishers, orders them, and makes the rest DNF after the grace time', () => {
    const r = makeRace(3, { lastRacerGraceSec: 2 });
    toGo(r);
    // 1 and 2 run (2 a moment later), 3 stays on the grid
    for (let i = 0; i < 60 * 30 && r.st.phase === 'racing'; i++)
      tick(r, {
        1: { buttons: Btn.Forward },
        2: { buttons: i > 20 ? Btn.Forward : 0 },
      });
    expect(r.st.phase).toBe('results');
    const res = r.st.result!;
    expect(res.standings.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(res.standings[0].place).toBe(1);
    expect(res.standings[1].place).toBe(2);
    expect(res.standings[2]).toEqual(
      expect.objectContaining({ place: 3, dnf: true, timeMs: null }),
    );
    const t1 = res.standings[0].timeMs!;
    const t2 = res.standings[1].timeMs!;
    // (90 m at the race sprint, 12 m/s)
    expect(t1).toBeGreaterThan(6500);
    expect(t1).toBeLessThan(9500);
    expect(t2 - t1).toBeGreaterThan(250);
    expect(t2 - t1).toBeLessThan(450);
    // splits at every gate: 2 checkpoints + the finish
    expect(res.standings[0].splitsMs.length).toBe(3);
    expect(res.standings[0].splitsMs[2]).toBe(t1);
    // the DNF came 2 s (the grace) after the second finisher
    const view = raceView(r.st, r.ctx);
    expect(view.order).toEqual([1, 2, 3]);
    // after the results, back to the lobby
    ticks(r, 60 * 3);
    expect(r.st.phase).toBe('lobby');
    expect(r.players.every((p) => p.raceCp === -1 && !p.frozen)).toBe(true);
  });

  it('a racer out at 2 × par is DNF (solo)', () => {
    const r = makeRace(1);
    toGo(r);
    ticks(r, Math.round((20 * 2) / TICK_DT) + 2);
    expect(r.st.phase).toBe('results');
    expect(r.st.result!.standings[0]).toEqual(
      expect.objectContaining({ dnf: true, place: 1, timeMs: null }),
    );
  });

  it('a racer who leaves is out (last), the race goes on', () => {
    const r = makeRace(2);
    toGo(r);
    ticks(r, 30, { 1: { buttons: Btn.Forward }, 2: { buttons: Btn.Forward } });
    raceLeave(r.st, r.world, r.ctx, 2);
    r.world.players = r.world.players.filter((p) => p.id !== 2);
    r.players = r.players.filter((p) => p.id !== 2);
    expect(r.st.phase).toBe('racing');
    for (let i = 0; i < 60 * 20 && r.st.phase === 'racing'; i++)
      tick(r, { 1: { buttons: Btn.Forward } });
    const s = r.st.result!.standings;
    expect(s[0].id).toBe(1);
    expect(s[1]).toEqual(expect.objectContaining({ id: 2, left: true, dnf: false }));
  });

  it('is deterministic (same inputs, same world)', () => {
    const run = () => {
      const r = makeRace(2);
      toGo(r);
      for (let i = 0; i < 400; i++)
        tick(r, {
          1: { buttons: Btn.Forward | (i === 50 ? Btn.Dash : 0) | (i % 90 === 0 ? Btn.Jump : 0) },
          2: { buttons: Btn.Forward, view: yawToView(i * 0.3) },
        });
      return hashWorld(r.world);
    };
    expect(run()).toBe(run());
  });

  it('a bot racer drives the line to the finish', () => {
    const config = defaultConfig();
    const def = testTrack();
    const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 1);
    const g = def.race!.grid[0];
    const p = addPlayer(world, createPlayer(1, 0, g.pos, g.yawDeg, config));
    resetRacer(p, config.movement, g.pos, g.yawDeg, 0);
    const rep = driveRaceLine(ctx, world, p, step);
    expect(rep.finished).toBe(true);
    expect(rep.splitsSec.length).toBe(3);
    expect(rep.timeSec).toBeGreaterThan(6.5);
    expect(rep.timeSec).toBeLessThan(9.5);
  });
});
