// Charged grenades (bounce count, lineups, the preview) and the remote mine.
import { describe, expect, it } from 'vitest';
import {
  Btn,
  v3,
  len,
  sub,
  step,
  createPlayer,
  addPlayer,
  respawnPlayer,
  predictGrenade,
  grenadeChargeTicks,
  csConfig,
  withRemoteMine,
  jamMines,
  mineVisibleTo,
  MineSlot,
  newBomb,
  updateBomb,
  createMatch,
  beginRound,
  type PlayerState,
  type PlayerInput,
  type SimEvent,
  type Quat,
  type BoxDef,
  type Vec3,
  type GameConfig,
  type LevelDef,
} from '../src/index';
import { flatLevel, makeSim, settle, view, type Sim } from './helpers';

type Frame = Record<number, { buttons?: number; view?: Quat }>;

const tick = (sim: Sim, frame: Frame = {}, n = 1): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const inputs: Record<number, PlayerInput> = {};
    for (const p of sim.world.players) {
      const f = frame[p.id] ?? {};
      inputs[p.id] = { tick: sim.world.tick + 1, buttons: f.buttons ?? 0, view: f.view ?? p.view };
    }
    step(sim.world, inputs, sim.ctx);
    events.push(...sim.world.events);
  }
  return events;
};

const simWith = (def: LevelDef, config?: (c: GameConfig) => GameConfig): Sim => {
  const sim = makeSim(def);
  if (config) {
    sim.config = config(sim.config);
    sim.ctx.config = sim.config;
  }
  settle(sim);
  return sim;
};

/** Set the bounce count by tapping middle mouse until it's `n`. */
const setBounces = (sim: Sim, id: number, n: number): void => {
  const p = sim.world.players.find((q) => q.id === id)!;
  for (let k = 0; k < 4 && p.nadeBounces !== n; k++) {
    tick(sim, { [id]: { buttons: Btn.NadeBounce } }, 1);
    tick(sim, {}, 1);
  }
  expect(p.nadeBounces).toBe(n);
};

interface Throw {
  events: SimEvent[];
  /** the grenade's position after every tick from the release, up to where it went off */
  path: Vec3[];
  /** where it went off (null: it didn't within the time) */
  end: Vec3 | null;
}

/** Hold Q for `hold` ticks looking along `v`, let go, and follow the grenade until it goes off. */
const throwNade = (sim: Sim, hold: number, v: Quat, id = 1): Throw => {
  const events = tick(sim, { [id]: { buttons: Btn.Grenade, view: v } }, hold);
  const path: Vec3[] = [];
  let end: Vec3 | null = null;
  let gid = -1;
  for (let i = 0; i < 400 && !end; i++) {
    const ev = tick(sim, { [id]: { view: v } }, 1);
    events.push(...ev);
    const thrown = ev.find((e) => e.type === 'grenadeThrow');
    if (thrown && thrown.type === 'grenadeThrow') gid = thrown.grenade;
    const g = sim.world.grenades.find((x) => x.id === gid);
    if (g) path.push({ ...g.pos });
    const act = ev.find((e) => e.type === 'grenadeActivate' && e.grenade === gid);
    if (act && act.type === 'grenadeActivate') end = act.pos;
  }
  return { events, path, end };
};

const planar = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

describe('grenade: charge, bounces, lineups', () => {
  it('a tap lobs it softly; holding longer throws it further (monotonic), up to full charge', () => {
    const full = grenadeChargeTicks(makeSim(flatLevel()).config.combat, 1 / 60) + 1;
    const dists: number[] = [];
    for (const hold of [1, 10, 20, 30, 45, full, full + 30]) {
      const sim = simWith(flatLevel());
      setBounces(sim, 1, 0);
      const t = throwNade(sim, hold, view(0, 15));
      expect(t.end, `hold ${hold}`).not.toBeNull();
      dists.push(planar(t.end!, sim.p.pos));
    }
    for (let i = 1; i < dists.length - 1; i++) expect(dists[i]).toBeGreaterThan(dists[i - 1]);
    // holding past full charge changes nothing
    expect(dists[dists.length - 1]).toBeCloseTo(dists[dists.length - 2], 9);
    // a tap is a soft lob: well under half the full throw's distance
    expect(dists[0]).toBeLessThan(dists[dists.length - 1] * 0.4);
  });

  it('the grenade only leaves the hand when Q is let go', () => {
    const sim = simWith(flatLevel());
    const held = tick(sim, { 1: { buttons: Btn.Grenade } }, 40);
    expect(held.some((e) => e.type === 'grenadeThrow')).toBe(false);
    expect(sim.p.nadeCharge).toBeGreaterThan(0);
    const out = tick(sim, {}, 1);
    expect(out.some((e) => e.type === 'grenadeThrow')).toBe(true);
    expect(sim.p.grenadesLeft).toBe(0);
    expect(sim.p.nadeCharge).toBe(0);
  });

  it('middle mouse cycles the bounce count 0..3 (default 1), and it survives a respawn', () => {
    const sim = simWith(flatLevel());
    expect(sim.p.nadeBounces).toBe(1);
    const seen: number[] = [];
    for (let k = 0; k < 5; k++) {
      tick(sim, { 1: { buttons: Btn.NadeBounce } }, 1);
      tick(sim, {}, 1);
      seen.push(sim.p.nadeBounces);
    }
    expect(seen).toEqual([2, 3, 0, 1, 2]);
    respawnPlayer(sim.world, sim.p, v3(0, 0, 0), 0, sim.config);
    expect(sim.p.nadeBounces).toBe(2);
  });

  it('goes off on the impact after exactly the chosen number of bounces', () => {
    // a closed room so every throw has walls to bounce off
    const walls: BoxDef[] = [
      { c: v3(0, 3, -14), h: v3(14, 3, 0.5) },
      { c: v3(0, 3, 14), h: v3(14, 3, 0.5) },
      { c: v3(-14, 3, 0), h: v3(0.5, 3, 14) },
      { c: v3(14, 3, 0), h: v3(0.5, 3, 14) },
    ];
    for (const n of [0, 1, 2, 3]) {
      const sim = simWith(flatLevel(walls));
      setBounces(sim, 1, n);
      const t = throwNade(sim, 80, view(0, 20));
      expect(t.end, `bounces ${n}`).not.toBeNull();
      const bounces = t.events.filter((e) => e.type === 'grenadeBounce').length;
      expect(bounces, `bounces ${n}`).toBe(n);
      const pred = predictGrenade(sim.world, sim.ctx, sim.p, view(0, 20), 80, n);
      expect(pred.cause).toBe('impact');
      expect(pred.bounces.length).toBe(n);
    }
  });

  it('a rolling grenade stops and goes off; it never rolls forever', () => {
    const sim = simWith(flatLevel());
    setBounces(sim, 1, 3);
    // a soft lob straight down the floor: it can't make 3 real bounces, so it rolls to a stop
    const t = throwNade(sim, 1, view(0, -30));
    expect(t.end).not.toBeNull();
    expect(t.path.length).toBeLessThan(Math.round(sim.config.combat.grenadeMaxFuseSec * 60));
  });

  it('lineups: the same spot, view, charge and bounces land on exactly the same spot', () => {
    const ends: Vec3[] = [];
    for (let k = 0; k < 3; k++) {
      const sim = simWith(flatLevel([{ c: v3(3, 2, -12), h: v3(4, 2, 0.5) }]));
      setBounces(sim, 1, 2);
      const t = throwNade(sim, 33, view(8, 12));
      ends.push(t.end!);
    }
    expect(ends[0]).not.toBeNull();
    expect(ends[1]).toEqual(ends[0]);
    expect(ends[2]).toEqual(ends[0]);
  });

  it('the preview flies exactly the path the sim flies (what you see is what you get)', () => {
    const extra: BoxDef[] = [
      { c: v3(4, 1.5, -16), h: v3(6, 1.5, 0.5) },
      { c: v3(-6, 0.5, -8), h: v3(1, 0.5, 2) },
    ];
    for (const [hold, b, yaw, pitch] of [
      [1, 0, 0, 10],
      [25, 1, 10, 25],
      [61, 2, -5, 5],
      [61, 3, 20, 35],
    ] as const) {
      const sim = simWith(flatLevel(extra));
      setBounces(sim, 1, b);
      const v = view(yaw, pitch);
      tick(sim, { 1: { buttons: Btn.Grenade, view: v } }, hold);
      // what the HUD would draw right now (the release happens next tick)
      const pred = predictGrenade(sim.world, sim.ctx, sim.p, v);
      const t = throwNade(sim, 0, v);
      expect(t.end).not.toBeNull();
      expect(t.path).toEqual(pred.points.slice(1));
      expect(t.end).toEqual(pred.end);
    }
  });

  it('CS kit: the same charged throw and bounce count (no remote mine)', () => {
    const sim = simWith(flatLevel(), csConfig);
    expect(sim.p.grenadesLeft).toBe(1);
    tick(sim, { 1: { buttons: Btn.NadeBounce } }, 1);
    tick(sim, {}, 1);
    expect(sim.p.nadeBounces).toBe(2);
    const v = view(0, 20);
    tick(sim, { 1: { buttons: Btn.Grenade, view: v } }, 30);
    const pred = predictGrenade(sim.world, sim.ctx, sim.p, v);
    const t = throwNade(sim, 0, v);
    expect(t.events.some((e) => e.type === 'grenadeThrow')).toBe(true);
    expect(t.end).toEqual(pred.end);
    expect(t.events.filter((e) => e.type === 'grenadeBounce').length).toBe(pred.bounces.length);
    // a longer hold throws further in CS too
    const sim2 = simWith(flatLevel(), csConfig);
    const t2 = throwNade(sim2, 1, v);
    expect(planar(t.end!, sim.p.pos)).toBeGreaterThan(planar(t2.end!, sim2.p.pos));
    // and no mine there
    const ev = tick(sim, { 1: { buttons: Btn.MinePlace } }, 1);
    expect(ev.some((e) => e.type === 'minePlace')).toBe(false);
    expect(sim.world.mines.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------

const add = (sim: Sim, id: number, team: 0 | 1, feet: Vec3): PlayerState =>
  addPlayer(sim.world, createPlayer(id, team, feet, 0, sim.config));

/** Place (tick 1), wait until armed, detonate. */
const placeAndBlow = (sim: Sim, id = 1): SimEvent[] => {
  const ev = tick(sim, { [id]: { buttons: Btn.MinePlace } }, 1);
  ev.push(...tick(sim, {}, Math.round(sim.config.combat.mineArmSec * 60) + 1));
  ev.push(...tick(sim, { [id]: { buttons: Btn.MineDetonate } }, 1));
  return ev;
};

describe('remote mine', () => {
  it('drops at your feet, sets off later from anywhere: half health within its radius', () => {
    const sim = simWith(flatLevel());
    const near = add(sim, 2, 1, v3(3, 0, 0)); // inside the 4 m radius
    const far = add(sim, 3, 1, v3(9, 0, 0)); // outside
    settle(sim);
    const ev = tick(sim, { 1: { buttons: Btn.MinePlace } }, 1);
    expect(ev.some((e) => e.type === 'minePlace')).toBe(true);
    expect(sim.p.mineSlot).toBe(MineSlot.Placed);
    const m = sim.world.mines[0];
    expect(Math.abs(m.pos.y)).toBeLessThan(0.05); // on the floor
    // walk far away, then set it off from there
    sim.p.pos = { ...sim.p.pos, x: -40 };
    settle(sim);
    const ev2 = tick(sim, { 1: { buttons: Btn.MineDetonate } }, 1);
    expect(ev2.some((e) => e.type === 'mineBlast')).toBe(true);
    expect(near.hp).toBe(sim.config.combat.maxHp * 0.5);
    expect(far.hp).toBe(sim.config.combat.maxHp);
    expect(sim.p.hp).toBe(sim.config.combat.maxHp);
    expect(sim.world.mines.length).toBe(0);
    expect(sim.p.mineSlot).toBe(MineSlot.Used);
  });

  it('one per round: no second mine after the first went off', () => {
    const sim = simWith(flatLevel());
    placeAndBlow(sim);
    tick(sim, {}, 5);
    const ev = tick(sim, { 1: { buttons: Btn.MinePlace } }, 1);
    expect(ev.some((e) => e.type === 'minePlace')).toBe(false);
    expect(sim.world.mines.length).toBe(0);
  });

  it('friendly fire as for grenades: teammates and the owner are hit too', () => {
    const sim = simWith(flatLevel());
    const mate = add(sim, 2, 0, v3(2, 0, 0));
    settle(sim);
    placeAndBlow(sim);
    expect(mate.hp).toBe(50);
    expect(sim.p.hp).toBe(50);
  });

  it('no damage through walls', () => {
    const sim = simWith(flatLevel([{ c: v3(1.5, 2, 0), h: v3(0.2, 2, 3) }]));
    const behind = add(sim, 2, 1, v3(3, 0, 0));
    settle(sim);
    sim.p.pos = { ...sim.p.pos, x: -0.5 };
    settle(sim);
    tick(sim, { 1: { buttons: Btn.MinePlace } }, 1);
    sim.p.pos = { ...sim.p.pos, x: -30 };
    settle(sim);
    tick(sim, { 1: { buttons: Btn.MineDetonate } }, 1);
    expect(behind.hp).toBe(100);
  });

  it('can only be placed standing on the ground', () => {
    const sim = simWith(flatLevel());
    tick(sim, { 1: { buttons: Btn.Jump } }, 1);
    tick(sim, {}, 6);
    expect(sim.p.grounded).toBe(false);
    const ev = tick(sim, { 1: { buttons: Btn.MinePlace } }, 1);
    expect(ev.some((e) => e.type === 'mineRefused' && e.reason === 'air')).toBe(true);
    expect(sim.p.mineSlot).toBe(MineSlot.Ready);
    tick(sim, {}, 60);
    const ok = tick(sim, { 1: { buttons: Btn.MinePlace } }, 1);
    expect(ok.some((e) => e.type === 'minePlace')).toBe(true);
  });

  it("needs a moment to arm: an instant detonate does nothing", () => {
    const sim = simWith(flatLevel());
    tick(sim, { 1: { buttons: Btn.MinePlace } }, 1);
    const ev = tick(sim, { 1: { buttons: Btn.MineDetonate } }, 1);
    expect(ev.some((e) => e.type === 'mineBlast')).toBe(false);
    expect(sim.world.mines.length).toBe(1);
  });

  it("a dead owner's mine fizzles harmlessly", () => {
    const sim = simWith(flatLevel());
    const enemy = add(sim, 2, 1, v3(2, 0, 0));
    settle(sim);
    tick(sim, { 1: { buttons: Btn.MinePlace } }, 1);
    sim.p.hp = 1;
    sim.p.pos = { ...sim.p.pos, y: -500 }; // falls out of the map
    const ev = tick(sim, {}, 2);
    expect(ev.some((e) => e.type === 'mineFizzle')).toBe(true);
    expect(sim.world.mines.length).toBe(0);
    expect(enemy.hp).toBe(100);
  });

  it('resets each round: a fresh mine, the old one gone', () => {
    const sim = simWith(flatLevel());
    add(sim, 2, 1, v3(0, 0, -20));
    settle(sim);
    const ms = createMatch('1v1', 'tower', 'lethal');
    beginRound(ms, sim.world, sim.ctx);
    for (const p of sim.world.players) p.frozen = false;
    settle(sim);
    tick(sim, { 1: { buttons: Btn.MinePlace } }, 1);
    expect(sim.world.mines.length).toBe(1);
    expect(sim.p.mineSlot).toBe(MineSlot.Placed);
    jamMines(sim.world, v3());
    beginRound(ms, sim.world, sim.ctx);
    expect(sim.world.mines.length).toBe(0);
    expect(sim.world.minesJammed).toBe(false);
    expect(sim.p.mineSlot).toBe(MineSlot.Ready);
  });

  it('Tower mode: not on a Tower (its touch volume, on top too); next to it is fine', () => {
    const def = flatLevel([{ c: v3(10, 1.5, 0), h: v3(1, 1.5, 1) }]);
    def.towers = [{ team: 1, pos: v3(10, 0, 0), radius: 1, height: 3 }];
    const tower = (cfg: GameConfig) => withRemoteMine(cfg, 'tower');
    // standing right at its foot (inside the touch volume)
    const a = simWith(def, tower);
    a.p.pos = { ...a.p.pos, x: 7.5 };
    settle(a);
    const ev = tick(a, { 1: { buttons: Btn.MinePlace } }, 1);
    expect(ev.some((e) => e.type === 'mineRefused' && e.reason === 'tower')).toBe(true);
    expect(a.world.mines.length).toBe(0);
    // on top of it
    const b = simWith(def, tower);
    b.p.pos = { ...b.p.pos, x: 10, y: 3 + (b.p.pos.y - 0) };
    settle(b);
    expect(b.p.grounded).toBe(true);
    const ev2 = tick(b, { 1: { buttons: Btn.MinePlace } }, 1);
    expect(ev2.some((e) => e.type === 'mineRefused' && e.reason === 'tower')).toBe(true);
    // a few metres away: fine
    const c = simWith(def, tower);
    c.p.pos = { ...c.p.pos, x: 4 };
    settle(c);
    expect(tick(c, { 1: { buttons: Btn.MinePlace } }, 1).some((e) => e.type === 'minePlace')).toBe(
      true,
    );
    // other modes don't ban it
    const d = simWith(def, (cfg) => withRemoteMine(cfg, 'elim'));
    d.p.pos = { ...d.p.pos, x: 7.5 };
    settle(d);
    expect(tick(d, { 1: { buttons: Btn.MinePlace } }, 1).some((e) => e.type === 'minePlace')).toBe(
      true,
    );
  });

  it('Bomb mode: the plant jams every mine (they fizzle) and nobody can place one after', () => {
    const def = flatLevel();
    def.bombSites = [
      { name: 'A', min: v3(-5, 0, -5), max: v3(5, 3, 5) },
      { name: 'B', min: v3(40, 0, 40), max: v3(50, 3, 50) },
    ];
    const sim = simWith(def, (c) => withRemoteMine(c, 'bomb'));
    sim.p.team = 1; // the attacker carrying the bomb
    const defender = add(sim, 2, 0, v3(0, 0, -12));
    const late = add(sim, 3, 0, v3(0, 0, 12));
    settle(sim);
    const bomb = newBomb(sim.world, 1);
    // the defender mines the site
    defender.pos = { ...defender.pos, z: -2 };
    settle(sim);
    tick(sim, { 2: { buttons: Btn.MinePlace } }, 1);
    expect(sim.world.mines.length).toBe(1);
    const events: SimEvent[] = [];
    for (let i = 0; i < Math.round(sim.config.rules.bombPlantSec * 60) + 2 && !bomb.planted; i++) {
      const inputs: Record<number, PlayerInput> = {};
      for (const p of sim.world.players)
        inputs[p.id] = {
          tick: sim.world.tick + 1,
          buttons: p.id === 1 ? Btn.Use : 0,
          view: p.view,
        };
      step(sim.world, inputs, sim.ctx);
      updateBomb(bomb, sim.world, sim.ctx, 1, false);
      events.push(...sim.world.events);
    }
    expect(bomb.planted).not.toBeNull();
    expect(events.some((e) => e.type === 'mineJam')).toBe(true);
    expect(events.some((e) => e.type === 'mineFizzle' && e.player === 2)).toBe(true);
    expect(sim.world.mines.length).toBe(0);
    expect(defender.mineSlot).toBe(MineSlot.Used);
    // the fizzled mine can't be set off, and nobody can place one now
    const after = tick(sim, { 2: { buttons: Btn.MineDetonate }, 3: { buttons: Btn.MinePlace } }, 1);
    expect(after.some((e) => e.type === 'mineBlast')).toBe(false);
    expect(after.some((e) => e.type === 'mineRefused' && e.reason === 'jammed')).toBe(true);
    expect(sim.p.hp).toBe(100);
    expect(late.mineSlot).toBe(MineSlot.Ready);
  });

  it('mode table: on in every Boomerang mode, off in CS', () => {
    const base = makeSim(flatLevel()).config;
    for (const m of ['tower', 'bomb', 'elim', 'arena', 'brawl', 'brawl-ffa', 'practice'] as const)
      expect(withRemoteMine(base, m).combat.mineEnabled, m).toBe(1);
    for (const m of ['cs-bomb', 'cs-elim', 'cs-arena'] as const)
      expect(withRemoteMine(base, m).combat.mineEnabled, m).toBe(0);
    expect(csConfig(base).combat.mineEnabled).toBe(0);
  });

  it('enemies only see a mine up close (server culling); its team always', () => {
    const sim = simWith(flatLevel());
    const mate = add(sim, 2, 0, v3(30, 0, 0));
    const enemyFar = add(sim, 3, 1, v3(20, 0, 0));
    const enemyNear = add(sim, 4, 1, v3(3, 0, 3));
    settle(sim);
    tick(sim, { 1: { buttons: Btn.MinePlace } }, 1);
    const m = sim.world.mines[0];
    expect(mineVisibleTo(sim.ctx, m, sim.p, sim.p)).toBe(true);
    expect(mineVisibleTo(sim.ctx, m, sim.p, mate)).toBe(true);
    expect(mineVisibleTo(sim.ctx, m, sim.p, enemyFar)).toBe(false);
    expect(mineVisibleTo(sim.ctx, m, sim.p, enemyNear)).toBe(true);
    expect(len(sub(enemyNear.pos, m.pos))).toBeLessThan(6);
  });
});
