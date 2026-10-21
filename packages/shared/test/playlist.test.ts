// Map playlists (rules/playlist.ts): queue order, loop, the map vote (counting, seeded
// tie-break, timeout) and the host's skip.
import { describe, expect, it } from 'vitest';
import {
  PLAYLIST_RULES,
  createPlaylist,
  objectiveMapPool,
  playlistAdvance,
  playlistMatchEnded,
  playlistSkip,
  playlistView,
  playlistVote,
  tallyVote,
  upcomingMap,
  voteChoices,
  voteCounts,
  voteSeed,
  type MapVote,
} from '../src/index';

const POOL = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
const card = Math.round(PLAYLIST_RULES.nextCardSec * 60);
const voteTicks = Math.round(PLAYLIST_RULES.voteSec * 60);

describe('map playlists', () => {
  it('keeps valid maps in order, drops repeats and caps the length', () => {
    const pl = createPlaylist(
      { maps: ['a', 'b', 'a', 'bad', 'c', ...'defghijk'.split('')] },
      (id) => id !== 'bad',
    )!;
    expect(pl.maps.slice(0, 3)).toEqual(['a', 'b', 'c']);
    expect(pl.maps.length).toBe(PLAYLIST_RULES.maxMaps);
    expect(pl.next).toBe('playlist');
    expect(createPlaylist({ maps: ['bad'] }, (id) => id !== 'bad')).toBeNull();
  });

  it('plays the queue in order, then stops (no loop)', () => {
    const pl = createPlaylist({ maps: ['a', 'b', 'c'] })!;
    const played = ['a'];
    let tick = 1000;
    for (;;) {
      if (!playlistMatchEnded(pl, played[played.length - 1], POOL, tick, 1)) break;
      expect(pl.endsAt).toBe(tick + card);
      expect(playlistAdvance(pl, pl.endsAt - 1)).toBeNull(); // the card is still up
      const next = playlistAdvance(pl, pl.endsAt);
      played.push(next!);
      tick += 10_000;
    }
    expect(played).toEqual(['a', 'b', 'c']);
    expect(upcomingMap(pl)).toBeNull();
    expect(pl.endsAt).toBe(0);
  });

  it('loop: starts again from the first map', () => {
    const pl = createPlaylist({ maps: ['a', 'b'], loop: true })!;
    const played = ['a'];
    for (let i = 0; i < 4; i++) {
      expect(playlistMatchEnded(pl, played[played.length - 1], POOL, i * 5000, 1)).toBe(true);
      played.push(playlistAdvance(pl, pl.endsAt)!);
    }
    expect(played).toEqual(['a', 'b', 'a', 'b', 'a']);
    // a one-map loop replays that map
    const one = createPlaylist({ maps: ['solo'], loop: true })!;
    expect(upcomingMap(one)).toBe('solo');
  });

  it('vote choices: queued maps first, never the map just played, then the mode pool', () => {
    const pl = createPlaylist({ maps: ['m5', 'm2', 'm6'], next: 'vote' })!;
    const c = voteChoices(pl, 'm5', POOL, 42);
    expect(c.length).toBe(PLAYLIST_RULES.voteChoices);
    expect(c.slice(0, 2)).toEqual(['m2', 'm6']);
    expect(c).not.toContain('m5');
    expect(new Set(c).size).toBe(c.length);
    // the rest comes from the pool in a seeded order: same seed, same choices
    expect(voteChoices(pl, 'm5', POOL, 42)).toEqual(c);
    // a tiny pool: fewer choices
    expect(voteChoices(createPlaylist({ maps: ['x'], next: 'vote' })!, 'x', ['x', 'y'], 1)).toEqual(
      ['y'],
    );
  });

  it('counts votes: most votes wins, players can change their vote', () => {
    const vote: MapVote = { choices: ['a', 'b', 'c'], votes: {}, seed: 7 };
    const pl = { ...createPlaylist({ maps: ['a'], next: 'vote' })!, vote, endsAt: 900 };
    expect(playlistVote(pl, 1, 'b', [1, 2, 3], 100)).toBe(true);
    expect(playlistVote(pl, 2, 'b', [1, 2, 3], 100)).toBe(true);
    expect(playlistVote(pl, 3, 'nope', [1, 2, 3], 100)).toBe(false); // not on offer
    expect(playlistVote(pl, 3, 'a', [1, 2, 3], 100)).toBe(true);
    expect(voteCounts(vote)).toEqual([1, 2, 0]);
    expect(tallyVote(vote)).toBe('b');
    expect(playlistVote(pl, 1, 'a', [1, 2, 3], 100)).toBe(true); // changed their mind
    expect(voteCounts(vote)).toEqual([2, 1, 0]);
    expect(tallyVote(vote)).toBe('a');
  });

  it('breaks ties with a seeded pick among the tied maps (deterministic)', () => {
    const tie = (seed: number): string =>
      tallyVote({ choices: ['a', 'b', 'c', 'd'], votes: { 1: 'b', 2: 'd', 3: 'b', 4: 'd' }, seed });
    for (let seed = 0; seed < 40; seed++) {
      expect(['b', 'd']).toContain(tie(seed));
      expect(tie(seed)).toBe(tie(seed)); // same seed, same winner
    }
    // the seed really decides (both tied maps win for some seed)
    const winners = new Set(Array.from({ length: 40 }, (_, s) => tie(s)));
    expect(winners).toEqual(new Set(['b', 'd']));
    // nobody voted: a seeded pick among all choices
    const none = tallyVote({ choices: ['a', 'b', 'c'], votes: {}, seed: 5 });
    expect(['a', 'b', 'c']).toContain(none);
    expect(tallyVote({ choices: ['a', 'b', 'c'], votes: {}, seed: 5 })).toBe(none);
  });

  it('the vote closes at its timeout, early once everyone voted, or when the host skips', () => {
    const pl = createPlaylist({ maps: ['m1', 'm2', 'm3'], next: 'vote' })!;
    const seed = voteSeed('ROOM42', 1);
    expect(playlistMatchEnded(pl, 'm1', POOL, 1000, seed)).toBe(true);
    expect(pl.vote!.choices[0]).toBe('m2');
    expect(pl.endsAt).toBe(1000 + voteTicks);
    playlistVote(pl, 1, 'm3', [1, 2], 1100);
    // not everyone yet: still open until the timeout
    expect(pl.endsAt).toBe(1000 + voteTicks);
    expect(playlistAdvance(pl, 1000 + voteTicks - 1)).toBeNull();
    expect(playlistAdvance(pl, 1000 + voteTicks)).toBe('m3');
    expect(pl.at).toBe(2);
    expect(pl.vote).toBeNull();
    // everyone voted: closes soon
    playlistMatchEnded(pl, 'm3', POOL, 5000, seed);
    playlistVote(pl, 1, pl.vote!.choices[1], [1, 2], 5100);
    playlistVote(pl, 2, pl.vote!.choices[1], [1, 2], 5200);
    expect(pl.endsAt).toBe(5200 + Math.round(PLAYLIST_RULES.allVotedSec * 60));
    // host skip: ends now
    expect(playlistSkip(pl, 5300)).toBe(true);
    expect(pl.endsAt).toBe(5300);
    const choice = pl.vote!.choices[1];
    expect(playlistAdvance(pl, 5300)).toBe(choice);
    expect(playlistSkip(pl, 5400)).toBe(false); // nothing left to skip
  });

  it('a view for clients: the upcoming map or the open vote and when it ends', () => {
    const pl = createPlaylist({ maps: ['a', 'b'] })!;
    playlistMatchEnded(pl, 'a', POOL, 60, 1);
    expect(playlistView(pl)).toMatchObject({ maps: ['a', 'b'], upcoming: 'b', vote: null });
    const v = createPlaylist({ maps: ['a', 'b'], next: 'vote' })!;
    playlistMatchEnded(v, 'a', POOL, 60, 1);
    expect(playlistView(v).vote?.choices[0]).toBe('b');
    expect(JSON.parse(JSON.stringify(playlistView(v)))).toEqual(playlistView(v));
  });

  it('the vote pool of a mode only has maps that suit it', () => {
    for (const o of ['tower', 'bomb', 'elim'] as const) {
      const pool = objectiveMapPool(o);
      expect(pool.length).toBeGreaterThan(1);
    }
  });
});
