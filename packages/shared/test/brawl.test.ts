// Brawl (rules/brawl.ts): drop-in TDM / FFA with instant respawns at safe spawns, spawn
// protection, a kill target and a timer, then the next map of the rotation.
import { describe, expect, it } from 'vitest';
import {
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  step,
  mapDef,
  applyDamage,
  createBrawl,
  startBrawl,
  updateBrawl,
  brawlJoin,
  brawlLeave,
  brawlSafeSpawn,
  brawlView,
  brawlMaps,
  DEFAULT_BRAWL_MAP,
  nextBrawlMap,
  brawlStandings,
  applyBrawlBotObjectives,
  botThink,
  createBotMemory,
  BOT_SKILLS,
  BRAWL_DEFAULTS,
  hashWorld,
  isEnemy,
  isTeammate,
  len,
  sub,
  v3,
  TICK_DT,
  MAPS,
  type BotMemory,
  type BrawlState,
  type BrawlVariant,
  type PlayerInput,
  type PlayerState,
  type SimContext,
  type WorldState,
} from '../src/index';

const sec = (s: number) => Math.round(s / TICK_DT);

/** A Brawl on `map`: `perTeam` players on each team (FFA: the same count, teams ignored). */
const setup = (variant: BrawlVariant, perTeam = 2, map = 'kestrel', seed = 7) => {
  const config = defaultConfig();
  const ctx: SimContext = { level: buildLevel(mapDef(map)), config, dt: TICK_DT };
  if (variant === 'ffa') ctx.ffa = true;
  const world = createWorld(ctx.level, seed);
  let id = 1;
  for (const team of [0, 1] as const)
    for (let i = 0; i < perTeam; i++) {
      const s = ctx.level.def.spawns.find((sp) => sp.team === team)!;
      addPlayer(world, createPlayer(id++, team, s.pos, s.yawDeg, config));
    }
  const bs = createBrawl(variant);
  startBrawl(bs, world, ctx);
  return { ctx, world, bs };
};

/** Step the world and the rules together; returns true if a map change came due. */
const run = (w: { ctx: SimContext; world: WorldState; bs: BrawlState }, ticks: number) => {
  let next = false;
  for (let i = 0; i < ticks; i++) {
    step(w.world, {}, w.ctx);
    if (updateBrawl(w.bs, w.world, w.ctx)) next = true;
  }
  return next;
};

const player = (world: WorldState, id: number): PlayerState =>
  world.players.find((p) => p.id === id)!;

/** `killer` kills `victim` with a Boomerang (goes through the spawn shield: two hits). */
const kill = (w: { ctx: SimContext; world: WorldState }, killer: number, victim: number) => {
  const v = player(w.world, victim);
  v.shield = false;
  applyDamage(w.world, w.ctx, killer, v, 9999, 'boomerang', false, v.pos, v.pos);
};

describe('brawl: respawns and spawn protection', () => {
  it('a dead player is back after ~2 s, protected by the shield for 3 s', () => {
    const w = setup('tdm');
    run(w, sec(BRAWL_DEFAULTS.protectSec) + 5); // (the start protection runs out)
    kill(w, 1, 3);
    expect(player(w.world, 3).alive).toBe(false);
    run(w, sec(BRAWL_DEFAULTS.respawnSec) - 5);
    expect(player(w.world, 3).alive).toBe(false);
    run(w, 10);
    const p = player(w.world, 3);
    expect(p.alive).toBe(true);
    expect(p.shield).toBe(true);
    // protected: hits don't hurt (the shield comes back after soaking one up)
    for (let i = 0; i < 3; i++) {
      applyDamage(w.world, w.ctx, 1, p, 50, 'laser', false, p.pos, p.pos);
      expect(p.hp).toBe(w.ctx.config.combat.maxHp);
      run(w, 1);
    }
    run(w, sec(BRAWL_DEFAULTS.protectSec));
    expect(p.shield).toBe(false);
    applyDamage(w.world, w.ctx, 1, p, 50, 'laser', false, p.pos, p.pos);
    expect(p.hp).toBe(w.ctx.config.combat.maxHp - 50);
  });

  it('attacking ends your spawn protection early', () => {
    const w = setup('ffa');
    const p = player(w.world, 2);
    expect(p.shield).toBe(true);
    step(w.world, {}, w.ctx);
    w.world.events.push({ type: 'throw', player: 2, boomerang: 2, windup: false });
    updateBrawl(w.bs, w.world, w.ctx);
    expect(p.shield).toBe(false);
    run(w, 5);
    expect(p.shield).toBe(false);
    // others keep theirs
    expect(player(w.world, 1).shield).toBe(true);
  });

  it('respawns at a safe spawn: far from the enemies, out of their sight', () => {
    for (const variant of ['tdm', 'ffa'] as const) {
      const w = setup(variant, 3);
      const def = w.ctx.level.def;
      const me = player(w.world, 1);
      // every enemy stands at the team-0 side's spawns
      const side0 = def.spawns.filter((s) => s.team === 0);
      const foes = w.world.players.filter((p) => isEnemy(w.ctx, p, me));
      foes.forEach((f, i) => {
        const s = side0[i % side0.length];
        f.pos = v3(s.pos.x, s.pos.y + 0.9, s.pos.z);
      });
      for (let k = 0; k < 20; k++) {
        const s = brawlSafeSpawn(w.bs, w.world, w.ctx, me);
        const near = Math.min(...foes.map((f) => len(sub(f.pos, s.pos))));
        expect(near).toBeGreaterThan(25);
        expect(s.team).toBe(1);
      }
    }
  });

  it('spawn-camp protection: never next to an enemy, and not the same point twice in a row', () => {
    const w = setup('ffa', 3);
    const def = w.ctx.level.def;
    const me = player(w.world, 1);
    const foes = w.world.players.filter((p) => p.id !== 1);
    // campers stand a few metres from most of the spawn points
    foes.forEach((f, i) => {
      const s = def.spawns[i * 2];
      f.pos = v3(s.pos.x + 3, s.pos.y + 0.9, s.pos.z);
    });
    for (let k = 0; k < 30; k++) {
      const s = brawlSafeSpawn(w.bs, w.world, w.ctx, me);
      expect(Math.min(...foes.map((f) => len(sub(f.pos, s.pos))))).toBeGreaterThan(
        BRAWL_DEFAULTS.denyM,
      );
    }
    // respawn twice in quick succession: the second one comes out somewhere else
    const at: number[] = [];
    for (let k = 0; k < 2; k++) {
      kill(w, 2, 1);
      run(w, sec(BRAWL_DEFAULTS.respawnSec) + 2);
      at.push(def.spawns.findIndex((s) => len(sub(s.pos, v3(me.pos.x, s.pos.y, me.pos.z))) < 0.5));
    }
    expect(at[0]).toBeGreaterThanOrEqual(0);
    expect(at[1]).not.toBe(at[0]);
  });

  it('never picks a spawn point someone stands on', () => {
    const w = setup('ffa', 2, 'training-bay');
    const def = w.ctx.level.def;
    const me = player(w.world, 1);
    const others = w.world.players.filter((p) => p.id !== 1);
    // everyone else on a spawn point: those points are taken
    others.forEach((o, i) => {
      const s = def.spawns[i];
      o.pos = v3(s.pos.x, s.pos.y + 0.9, s.pos.z);
    });
    for (let k = 0; k < 30; k++) {
      const s = brawlSafeSpawn(w.bs, w.world, w.ctx, me);
      expect(others.every((o) => len(sub(o.pos, s.pos)) > 1.5)).toBe(true);
    }
  });
});

describe('brawl: free-for-all', () => {
  it('everyone can hurt everyone (no team kills), team modes keep teams', () => {
    const w = setup('ffa');
    const a = player(w.world, 1);
    const b = player(w.world, 2); // same team value as 1
    expect(a.team).toBe(b.team);
    expect(isEnemy(w.ctx, a, b)).toBe(true);
    expect(isTeammate(w.ctx, a, b)).toBe(false);
    run(w, sec(2));
    kill(w, 1, 2);
    expect(a.kills).toBe(1);
    expect(a.teamKills).toBe(0);
    const t = setup('tdm');
    const c = player(t.world, 1);
    const d = player(t.world, 2);
    expect(isTeammate(t.ctx, c, d)).toBe(true);
    run(t, sec(2));
    kill(t, 1, 2);
    expect(c.kills).toBe(0);
    expect(c.teamKills).toBe(1);
    expect(t.bs.scores).toEqual([0, 0]); // team kills don't score
  });

  it('bots hunt players of their own team value in FFA', () => {
    const w = setup('ffa', 1, 'training-bay');
    const mem: BotMemory = createBotMemory(2, BOT_SKILLS.normal, 5);
    // player 1 is the only other one, on the same team value as the bot
    player(w.world, 2).team = 0;
    applyBrawlBotObjectives(w.bs, w.world, w.ctx, [mem]);
    expect(mem.objective).not.toBeNull();
    const me = player(w.world, 1);
    expect(len(sub(mem.objective!, me.pos))).toBeLessThan(0.01);
  });

  it('first to 20 kills wins; the standings rank by kills', () => {
    const w = setup('ffa', 2);
    run(w, sec(2));
    player(w.world, 3).kills = 19;
    player(w.world, 1).kills = 12;
    expect(brawlStandings(w.world).map((r) => r.id)).toEqual([3, 1, 2, 4]);
    run(w, 1);
    expect(w.bs.phase).toBe('live');
    kill(w, 3, 4);
    run(w, 1);
    expect(w.bs.phase).toBe('end');
    expect(w.bs.winner).toBe(3);
    expect(w.bs.endReason).toBe('score');
    expect(w.world.players.every((p) => p.frozen)).toBe(true);
    const view = brawlView(w.bs, w.world, 'kestrel');
    expect(view.target).toBe(20);
    expect(view.next).toBe(nextBrawlMap('kestrel'));
  });
});

describe('brawl: team deathmatch, timer and the next match', () => {
  it('first team to 50 kills wins', () => {
    const w = setup('tdm');
    run(w, sec(2));
    w.bs.scores = [49, 10];
    kill(w, 2, 3); // team 0 kills a team-1 player (this tick's kill event)
    updateBrawl(w.bs, w.world, w.ctx);
    expect(w.bs.scores[0]).toBe(50);
    expect(w.bs.phase).toBe('end');
    expect(w.bs.winner).toBe(0);
  });

  it('the timer ends it: more kills win, level is a draw; then the next Brawl is due', () => {
    const w = setup('tdm');
    w.bs.scores = [7, 9];
    w.world.tick = w.bs.endsTick - 1;
    run(w, 1);
    expect(w.bs.phase).toBe('end');
    expect(w.bs.winner).toBe(1);
    expect(w.bs.endReason).toBe('time');
    expect(run(w, sec(BRAWL_DEFAULTS.resultsSec) - 2)).toBe(false);
    expect(run(w, 3)).toBe(true);
    // the caller starts the next one: everything resets
    startBrawl(w.bs, w.world, w.ctx);
    expect(w.bs.phase).toBe('live');
    expect(w.bs.matchNo).toBe(2);
    expect(w.bs.scores).toEqual([0, 0]);
    expect(w.world.players.every((p) => p.alive && !p.frozen && p.kills === 0)).toBe(true);

    const f = setup('ffa', 1);
    player(f.world, 1).kills = 3;
    player(f.world, 2).kills = 3;
    f.world.tick = f.bs.endsTick;
    run(f, 1);
    expect(f.bs.phase).toBe('end');
    expect(f.bs.winner).toBeNull(); // level on kills and deaths: a draw
  });

  it('TDM starts each team on its own side, FFA spread over the map', () => {
    const t = setup('tdm', 3);
    const def = t.ctx.level.def;
    const sideOf = (p: PlayerState) => {
      let best = def.spawns[0];
      for (const s of def.spawns) if (len(sub(s.pos, p.pos)) < len(sub(best.pos, p.pos))) best = s;
      return best.team;
    };
    for (const p of t.world.players) expect(sideOf(p)).toBe(p.team);
    const f = setup('ffa', 4);
    const spots = new Set(
      f.world.players.map((p) => `${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}`),
    );
    expect(spots.size).toBe(8); // nobody shares a spawn point
  });
});

describe('brawl: joining and leaving mid-match', () => {
  it('a player who joins mid-match plays right away (protected), frozen during the results', () => {
    const w = setup('tdm');
    run(w, sec(30));
    const s = w.ctx.level.def.spawns[0];
    const p = addPlayer(w.world, createPlayer(9, 1, s.pos, s.yawDeg, w.ctx.config));
    brawlJoin(w.bs, w.world, w.ctx, 9);
    expect(p.alive).toBe(true);
    expect(p.frozen).toBe(false);
    expect(p.shield).toBe(true);
    run(w, sec(5));
    expect(p.shield).toBe(false);
    brawlLeave(w.bs, 9);
    w.world.players = w.world.players.filter((q) => q.id !== 9);
    // during the results: frozen until the next Brawl
    w.bs.scores = [50, 0];
    run(w, 1);
    const q = addPlayer(w.world, createPlayer(10, 0, s.pos, s.yawDeg, w.ctx.config));
    brawlJoin(w.bs, w.world, w.ctx, 10);
    run(w, 1);
    expect(q.frozen).toBe(true);
  });
});

describe('brawl: maps and determinism', () => {
  it('rotates through the Brawl maps (first) and the competitive maps (no Arena, no race tracks)', () => {
    const ids = brawlMaps().map((m) => m.id);
    expect(ids[0]).toBe('colossus-yard');
    expect(DEFAULT_BRAWL_MAP()).toBe('colossus-yard');
    expect(ids).not.toContain('training-bay'); // (too cramped for ten)
    expect(ids).toContain('split-deck');
    for (const m of MAPS) {
      if (m.arena || m.race) expect(ids).not.toContain(m.id);
      if ((m.competitive || m.brawl) && !m.arena && !m.race) expect(ids).toContain(m.id);
    }
    // the rotation visits every map once, then starts over
    let at = ids[0];
    const seen: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      seen.push(at);
      at = nextBrawlMap(at);
    }
    expect(seen.sort()).toEqual([...ids].sort());
    expect(at).toBe(ids[0]);
    expect(nextBrawlMap('race-cliffline')).toBe(ids[0]);
    // every rotation map has spawns to brawl on
    for (const id of ids) expect(mapDef(id).spawns.length).toBeGreaterThanOrEqual(8);
  });

  it('a bot Brawl replays bit for bit (FFA and TDM)', () => {
    const runBots = (variant: BrawlVariant) => {
      const w = setup(variant, 3, 'training-bay', 11);
      const mems = w.world.players.map((p) => createBotMemory(p.id, BOT_SKILLS.normal, p.id * 7));
      for (let t = 0; t < 900; t++) {
        const inputs: Record<number, PlayerInput> = {};
        for (const m of mems) {
          const p = player(w.world, m.id);
          inputs[m.id] = botThink(w.world, w.ctx, p, m);
        }
        step(w.world, inputs, w.ctx);
        updateBrawl(w.bs, w.world, w.ctx);
        applyBrawlBotObjectives(w.bs, w.world, w.ctx, mems);
      }
      return { hash: hashWorld(w.world), bs: JSON.stringify(w.bs), w };
    };
    for (const variant of ['ffa', 'tdm'] as const) {
      const a = runBots(variant);
      const b = runBots(variant);
      expect(a.hash).toBe(b.hash);
      expect(a.bs).toBe(b.bs);
    }
    // FFA bots fight bots of the same team value
    const f = runBots('ffa');
    const deaths = f.w.world.players.reduce((n, p) => n + p.deaths, 0);
    expect(deaths).toBeGreaterThan(0);
  });
});
