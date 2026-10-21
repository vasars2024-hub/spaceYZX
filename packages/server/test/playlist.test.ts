// Casual room playlists (rules/playlist.ts): a room with queued maps plays them one after another
// without going back to the warm-up lobby, loop starts the list again, a map vote decides the
// next map, ranked rooms ignore all of it, and the messages work over a real WebSocket.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PLAYLIST_RULES,
  brawlMaps,
  forfeitMatch,
  objectiveMapPool,
  type PlaylistView,
} from '@space-yz/shared';
import { GameHub } from '../src/game/hub';
import type { Room } from '../src/game/room';
import type { MatchRules } from '../src/game/rules/match';
import type { BrawlRules } from '../src/game/rules/brawl';
import { startGameServer, type GameServer } from '../src/app';
import { startHeadlessBot, type HeadlessBot } from '../../../tools/bots/headless';

const MAPS3 = objectiveMapPool('tower').slice(0, 3);

/** A 1v1 room run by hand (not by the hub's clock): two bots, so the match starts by itself. */
const botRoom = (hub: GameHub, playlist: { maps: string[]; loop?: boolean; next?: 'vote' }) => {
  const room = hub.createRoom({ mode: '1v1', map: playlist.maps[0], playlist })!;
  hub.clock.remove(room);
  room.addMember('Bot A', null, { botSkill: 'rookie' });
  room.addMember('Bot B', null, { botSkill: 'rookie' });
  return { room, rules: room.rules as MatchRules };
};

const ticks = (room: Room, n: number) => {
  for (let i = 0; i < n; i++) room.tick();
};

/** Wait for the match to start, then end it at once (a forfeit) and return the tick it ended. */
const playMatch = (room: Room, rules: MatchRules): void => {
  for (let i = 0; i < 60 * 12 && rules.ms.phase === 'warmup'; i++) room.tick();
  expect(rules.ms.phase).not.toBe('warmup');
  forfeitMatch(rules.ms, room.world, room.ctx, 0);
  room.tick();
  expect(rules.ms.phase).toBe('matchEnd');
};

const view = (rules: MatchRules, room: Room) =>
  (rules.state(room) as { playlist?: PlaylistView }).playlist!;

describe('casual room playlists', () => {
  let hub: GameHub;
  beforeAll(() => {
    hub = new GameHub({ log: () => {} });
  });
  afterAll(() => hub.close());

  it('plays 3 queued maps in order without going back to the lobby, then returns to it', () => {
    expect(MAPS3.length).toBe(3);
    const { room, rules } = botRoom(hub, { maps: MAPS3 });
    expect(room.map).toBe(MAPS3[0]);
    expect(rules.playlist?.maps).toEqual(MAPS3);
    const ids = [...room.members.keys()].sort();
    const played: string[] = [room.map];
    for (let n = 0; n < 2; n++) {
      playMatch(room, rules);
      // the results card says what comes next, ~8 s
      const v = view(rules, room);
      expect(v.upcoming).toBe(MAPS3[n + 1]);
      expect(v.endsAt - room.world.tick).toBeLessThanOrEqual(PLAYLIST_RULES.nextCardSec * 60);
      expect(rules.ms.phaseEnds).toBe(v.endsAt);
      ticks(room, PLAYLIST_RULES.nextCardSec * 60 + 1);
      // straight on to the next map: a fresh match counting down, same players and teams
      expect(room.map).toBe(MAPS3[n + 1]);
      played.push(room.map);
      expect(rules.ms.phase).toBe('warmup');
      expect(rules.startAt).toBeGreaterThan(room.world.tick);
      expect([...room.members.keys()].sort()).toEqual(ids);
      expect(room.world.players.length).toBe(2);
      ticks(room, PLAYLIST_RULES.startDelaySec * 60 + 1);
      expect(rules.ms.phase).toBe('spawnLock');
    }
    expect(played).toEqual(MAPS3);
    // after the last map: the results, then back to the room's warm-up lobby (as before)
    playMatch(room, rules);
    expect(view(rules, room).upcoming).toBeNull();
    ticks(room, 60 * 13);
    expect(rules.ms.phase).toBe('warmup');
    expect(room.map).toBe(MAPS3[2]);
  }, 60_000);

  it('loop: after the last map the list starts again', () => {
    const { room, rules } = botRoom(hub, { maps: MAPS3.slice(0, 2), loop: true });
    const played = [room.map];
    for (let n = 0; n < 3; n++) {
      playMatch(room, rules);
      ticks(room, PLAYLIST_RULES.nextCardSec * 60 + 1);
      played.push(room.map);
    }
    expect(played).toEqual([MAPS3[0], MAPS3[1], MAPS3[0], MAPS3[1]]);
  }, 60_000);

  it('vote: 3–4 choices (queued first, never the map just played); it closes at its timeout', () => {
    const { room, rules } = botRoom(hub, { maps: MAPS3, next: 'vote' });
    playMatch(room, rules);
    const v = view(rules, room);
    expect(v.vote).not.toBeNull();
    const choices = v.vote!.choices;
    expect(choices.length).toBeGreaterThanOrEqual(3);
    expect(choices.length).toBeLessThanOrEqual(4);
    expect(choices.slice(0, 2)).toEqual([MAPS3[1], MAPS3[2]]);
    expect(choices).not.toContain(MAPS3[0]);
    expect(v.endsAt - room.world.tick).toBeGreaterThan(PLAYLIST_RULES.voteSec * 60 - 5);
    // bots don't vote (only humans do): the seeded pick decides at the timeout
    const bot = [...room.members.values()][0];
    expect(rules.vote(room, bot.id, choices[2])).toBe(false);
    ticks(room, PLAYLIST_RULES.voteSec * 60 + 1);
    expect(choices).toContain(room.map);
    expect(rules.ms.phase).toBe('warmup');
  }, 60_000);

  it('a Brawl room with a playlist rotates through its own maps only', () => {
    const own = brawlMaps()
      .slice(-2)
      .map((m) => m.id);
    const room = hub.createRoom({ mode: 'brawl', map: own[0], playlist: { maps: own } })!;
    hub.clock.remove(room);
    const rules = room.rules as BrawlRules;
    const seen = [room.map];
    for (let i = 0; i < 3; i++) {
      rules.onNextMap!(room);
      seen.push(room.map);
    }
    expect(seen).toEqual([own[0], own[1], own[0], own[1]]);
    hub.closeRoom(room);
  });

  it('ranked rooms never get a playlist', () => {
    const room = hub.createRoom({
      mode: '1v1',
      map: MAPS3[0],
      ranked: true,
      ladder: 'duels',
      playlist: { maps: MAPS3, next: 'vote' },
    })!;
    hub.clock.remove(room);
    expect((room.rules as MatchRules).playlist).toBeNull();
    hub.closeRoom(room);
  });
});

describe('playlist messages over WebSocket', () => {
  let server: GameServer;
  const clients: HeadlessBot[] = [];
  beforeAll(async () => {
    server = await startGameServer({ port: 0, host: '127.0.0.1', assets: null, log: () => {} });
  });
  afterAll(async () => {
    for (const c of clients) c.stop();
    await server.close();
  });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn: () => boolean, ms = 8000) => {
    const t0 = Date.now();
    while (!fn()) {
      if (Date.now() - t0 > ms) throw new Error('timeout');
      await wait(20);
    }
  };
  const pl = (extra: unknown) => (extra as { playlist?: PlaylistView } | null)?.playlist;

  it('createRoom carries the playlist; votes and the host skip reach the room', async () => {
    const a = startHeadlessBot({
      url: `ws://127.0.0.1:${server.port}/ws`,
      name: 'Host',
      onReady: (core) =>
        core.createRoom('1v1', MAPS3[0], 1, 'rookie', 'tower', 'lethal', {
          maps: MAPS3,
          loop: true,
          next: 'vote',
        }),
    });
    clients.push(a);
    await until(() => a.core.state === 'room');
    const room = server.hub.rooms.get(a.core.code)!;
    const rules = room.rules as MatchRules;
    expect(rules.playlist).toMatchObject({ maps: MAPS3, loop: true, next: 'vote' });
    await until(() => pl(a.core.extra)?.maps.length === 3);
    // the match runs, then ends
    await until(() => rules.ms.phase !== 'warmup', 10_000);
    forfeitMatch(rules.ms, room.world, room.ctx, 0);
    await until(() => !!pl(a.core.extra)?.vote);
    const choices = pl(a.core.extra)!.vote!.choices;
    a.core.voteMap(choices[1]);
    await until(() => rules.playlist?.vote?.votes[a.core.localId] === choices[1]);
    await until(() => pl(a.core.extra)?.vote?.votes[a.core.localId] === choices[1]);
    // the only human voted: the vote closes soon anyway; the host skips it right now
    a.core.skipNext();
    await until(() => room.map === choices[1]);
    // the client loads the next map in the same room (a new 'roomJoined')
    await until(() => a.core.map === choices[1] && !!a.core.predWorld);
    expect(a.core.code).toBe(room.code);
    expect(a.core.state).toBe('room');
    a.core.leaveRoom();
  }, 40_000);
});
