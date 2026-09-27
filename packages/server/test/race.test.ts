import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NetCore, RaceView } from '@space-yz/shared';
import { DEFAULT_RACE_MAP } from '@space-yz/shared';
import { GameHub } from '../src/game/hub';
import { startGameServer, type GameServer } from '../src/app';
import { RaceRules, type RaceRecord } from '../src/game/rules/race';
import { startHeadlessBot, type HeadlessBot } from '../../../tools/bots/headless';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 8000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await wait(20);
  }
};
const raceOf = (extra: unknown): RaceView | null => {
  const x = extra as (RaceView & { rules?: string }) | null;
  return x?.rules === 'race' ? x : null;
};

describe('race rooms (hub)', () => {
  it('bot racers run a whole race and the result record comes out', () => {
    const results: RaceRecord[] = [];
    const hub = new GameHub({ log: () => {}, onRaceEnd: (_r, res) => results.push(res) });
    try {
      const room = hub.createRoom({ mode: 'race', map: 'race-neon', bots: 3, botSkill: 'hard' })!;
      expect(room.map).toBe('race-neon');
      expect(room.maxPlayers).toBe(8);
      expect(room.rules).toBeInstanceOf(RaceRules);
      expect(room.members.size).toBe(3);
      const rules = room.rules as RaceRules;
      expect(rules.requestStart(room)).toBeNull();
      // (the clock is driven by hand: no real time passes)
      hub.clock.remove(room);
      for (let i = 0; i < 60 * 400 && !results.length; i++) room.tick();
      expect(results.length).toBe(1);
      const r = results[0];
      expect(r.mode).toBe('race');
      expect(r.track).toBe('race-neon');
      expect(r.room).toBe(room.code);
      expect(r.standings.length).toBe(3);
      for (const s of r.standings) {
        expect(s.dnf).toBe(false);
        expect(s.timeMs).toBeGreaterThan(140_000);
        expect(s.timeMs).toBeLessThan(230_000);
        expect(s.splitsMs.length).toBe(room.level.def.race!.checkpoints.length + 1);
      }
      expect(r.standings.map((s) => s.place)).toEqual([1, 2, 3]);
      expect(r.racers.every((x) => x.bot)).toBe(true);
      // nobody got hurt, everyone raced on one team
      for (const p of room.world.players) expect(p.hp).toBe(room.ctx.config.combat.maxHp);
      for (const m of room.members.values()) expect(m.team).toBe(0);
    } finally {
      hub.close();
    }
  }, 60000);

  it('race rooms only take race tracks, other rooms never do', () => {
    const hub = new GameHub({ log: () => {} });
    try {
      expect(hub.createRoom({ mode: 'race', map: 'split-deck' })!.map).toBe(DEFAULT_RACE_MAP);
      expect(hub.createRoom({ mode: 'race', map: 'race-sunspire' })!.map).toBe('race-sunspire');
      // a removed surf map is ignored: the default track (never Training Bay)
      expect(hub.createRoom({ mode: 'race', map: 'surf-aurora' })!.map).toBe(DEFAULT_RACE_MAP);
    } finally {
      hub.close();
    }
  });
});

describe('race rooms over WebSocket', () => {
  let server: GameServer;
  const bots: HeadlessBot[] = [];
  beforeAll(async () => {
    server = await startGameServer({
      port: 0,
      host: '127.0.0.1',
      assets: null,
      log: () => {},
      services: {},
    });
  });
  afterAll(async () => {
    for (const b of bots) b.stop();
    await server.close();
  });
  const url = () => `ws://127.0.0.1:${server.port}/ws`;
  const bot = (name: string, onReady: (core: NetCore) => void) => {
    const b = startHeadlessBot({ url: url(), name, onReady });
    bots.push(b);
    return b;
  };

  it('create a race room by code, pick the track, start: countdown, then the race', async () => {
    const host = bot('RaceHost', (core) => core.createRoom('race', 'race-sunspire', 1, 'easy'));
    await until(() => host.core.state === 'room');
    expect(host.core.mode).toBe('race');
    expect(host.core.map).toBe('race-sunspire');
    const room = server.hub.rooms.get(host.core.code)!;
    expect(room.rules).toBeInstanceOf(RaceRules);
    // a friend joins by the code
    const friend = bot('RaceFriend', (core) => core.joinRoom(host.core.code));
    await until(() => friend.core.state === 'room');
    expect(friend.core.code).toBe(host.core.code);
    await until(() => raceOf(host.core.extra)?.phase === 'lobby');
    // in the lobby your predicted racer isn't racing yet
    await until(() => !!host.core.localPredicted());
    expect(host.core.localPredicted()!.raceCp).toBe(-1);
    host.core.sendJson({ t: 'startMatch' });
    await until(() => raceOf(host.core.extra)?.phase === 'countdown', 4000);
    const v = raceOf(host.core.extra)!;
    expect(v.racers.length).toBe(3);
    expect(v.gates).toBe(room.level.def.race!.checkpoints.length + 1);
    await until(() => raceOf(host.core.extra)?.phase === 'racing', 6000);
    // everyone is sent to everyone (no line-of-sight culling in races)
    await wait(300);
    expect(host.core.latest!.players.size).toBe(3);
    await until(() => host.core.localPredicted()!.raceCp === 0);
  }, 30000);
});
