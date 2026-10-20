// Map playlists in the menus and in offline practice: the map step queues several maps (a plain
// click still picks one map and moves on), the wizards turn the queue into a playlist, and a
// practice match moves on to the next queued map (or the map you voted for) after the results.
import { describe, expect, it } from 'vitest';
import {
  PLAYLIST_RULES,
  createPlaylist,
  defaultConfig,
  forfeitMatch,
  objectiveMapPool,
  yawToView,
  type MatchState,
  type PlaylistState,
} from '@space-yz/shared';
import {
  clickQueuedMap,
  initialPractice,
  initialRoom,
  pickPracticeMode,
  pickRoomMap,
  pickRoomObjective,
  practicePlaylist,
  queuePosition,
  queuedMaps,
  roomPlaylist,
  toggleQueuedMap,
} from '../src/ui/flow';
import { createPracticeSession } from '../src/game/practice';
import type { LocalSession } from '../src/game/local-session';

const [A, B, C] = objectiveMapPool('tower');
const idle = () => ({ buttons: 0, view: yawToView(0) });

describe('map step: queue several maps', () => {
  it('a plain click picks one map and moves on, as before', () => {
    const s = { ...initialRoom(), map: A };
    const r = clickQueuedMap(s, B);
    expect(r.advance).toBe(true);
    expect(queuedMaps(r.s)).toEqual([B]);
    expect(roomPlaylist(r.s)).toBeNull(); // one map: no playlist at all
  });

  it('+ queues maps in order (numbered); with a queue a click toggles instead', () => {
    let s = { ...initialRoom(), map: A };
    s = toggleQueuedMap(s, B);
    s = toggleQueuedMap(s, C);
    expect(queuedMaps(s)).toEqual([A, B, C]);
    expect([A, B, C].map((m) => queuePosition(s, m))).toEqual([1, 2, 3]);
    // a click on a queued map takes it out, and stays on the step
    const r = clickQueuedMap(s, B);
    expect(r.advance).toBe(false);
    expect(queuedMaps(r.s)).toEqual([A, C]);
    // taking out the first map: the next one leads
    const t = toggleQueuedMap(r.s, A);
    expect(t.map).toBe(C);
    expect(queuedMaps(t)).toEqual([C]);
    // the last map can't be taken out
    expect(queuedMaps(toggleQueuedMap(t, C))).toEqual([C]);
    expect(roomPlaylist(s)).toEqual({ maps: [A, B, C], loop: false, next: 'playlist' });
    expect(roomPlaylist({ ...s, loop: true, nextMap: 'vote' })).toEqual({
      maps: [A, B, C],
      loop: true,
      next: 'vote',
    });
    // picking one map (the old way) replaces the queue
    expect(queuedMaps(pickRoomMap(s, B))).toEqual([B]);
  });

  it('caps the queue; Arena and races have no playlist; Brawl only rotates its maps', () => {
    let s = { ...initialRoom(), map: 'm0' };
    for (let i = 1; i < 20; i++) s = toggleQueuedMap(s, `m${i}`);
    expect(queuedMaps(s).length).toBe(PLAYLIST_RULES.maxMaps);
    const q = toggleQueuedMap({ ...initialRoom(), map: A }, B);
    expect(roomPlaylist({ ...q, objective: 'arena' })).toBeNull();
    expect(roomPlaylist({ ...q, objective: 'race' })).toBeNull();
    expect(roomPlaylist({ ...q, objective: 'brawl', loop: true })).toEqual({ maps: [A, B] });
    // changing the objective keeps the queued maps it can use
    expect(queuedMaps(pickRoomObjective(q, 'elim'))).toEqual([A, B]);
    expect(queuedMaps(pickRoomObjective(q, 'arena')).length).toBe(1);
  });

  it('practice: match modes queue maps, other modes play one map', () => {
    let s = pickPracticeMode({ ...initialPractice(), map: A }, 'match');
    s = toggleQueuedMap(s, B);
    expect(practicePlaylist(s)).toEqual({ maps: [A, B], loop: false, next: 'playlist' });
    expect(practicePlaylist({ ...s, mode: 'freeroam' })).toBeNull();
    expect(queuedMaps(pickPracticeMode(s, 'brawl'))).toHaveLength(1);
  });
});

/** An offline Tower match (1v1 vs a rookie bot) on `map`, with a playlist. */
const practice = (map: string, playlist: PlaylistState, onNextMap: (m: string) => void) => {
  const { session } = createPracticeSession({
    size: 1,
    skill: 'rookie',
    kind: 'match',
    mapId: map,
    config: defaultConfig(),
    playlist,
    onNextMap,
  });
  return session;
};

const matchOf = (s: LocalSession) => (s as unknown as { opts: { match: MatchState } }).opts.match;

/** The next map the last practice game reported (onNextMap). */
let nextSeen: string | null = null;

/** End the running match at once and play out the results card; the next map (or null). */
const finish = (s: LocalSession, sec: number): string | null => {
  let next: string | null = null;
  const ms = matchOf(s);
  forfeitMatch(ms, s.world(), s.ctx, 0);
  // (the session reports the next map through onNextMap: see `practice`)
  for (let i = 0; i < 60 * sec && next === null; i++) {
    s.update(1 / 60, idle);
    next = nextSeen;
  }
  return next;
};

describe('offline practice playlists', () => {
  it('plays the queued maps one after another, then stays on the last one', () => {
    const pl = createPlaylist({ maps: [A, B, C] })!;
    const played = [A];
    let s = practice(A, pl, (m) => (nextSeen = m));
    for (let n = 0; n < 2; n++) {
      nextSeen = null;
      // the results card shows the next map
      const ms = matchOf(s);
      forfeitMatch(ms, s.world(), s.ctx, 0);
      s.update(1 / 60, idle);
      expect(s.match()!.phase).toBe('matchEnd');
      expect(s.match()!.playlist?.upcoming).toBe(played.length === 1 ? B : C);
      const next = finish(s, PLAYLIST_RULES.nextCardSec + 1);
      expect(next).toBe(played.length === 1 ? B : C);
      played.push(next!);
      // (the app starts the next practice game on that map with the same playlist)
      s = practice(next!, pl, (m) => (nextSeen = m));
      expect(s.match()!.phase).not.toBe('matchEnd');
    }
    expect(played).toEqual([A, B, C]);
    nextSeen = null;
    expect(finish(s, 14)).toBeNull(); // the last map: no next one
    expect(s.match()!.playlist?.upcoming).toBeNull();
  }, 60_000);

  it('vote: you pick the next map on the results screen (skip loads it now)', () => {
    const pl = createPlaylist({ maps: [A, B], next: 'vote' })!;
    nextSeen = null;
    const s = practice(A, pl, (m) => (nextSeen = m));
    forfeitMatch(matchOf(s), s.world(), s.ctx, 0);
    s.update(1 / 60, idle);
    const vote = s.match()!.playlist!.vote!;
    expect(vote.choices[0]).toBe(B);
    expect(vote.choices).not.toContain(A);
    const pick = vote.choices[vote.choices.length - 1];
    s.voteMap(pick);
    expect(s.match()!.playlist!.vote!.votes[s.localId]).toBe(pick);
    expect(s.canSkipNext()).toBe(true);
    s.skipNext();
    for (let i = 0; i < 5 && nextSeen === null; i++) s.update(1 / 60, idle);
    expect(nextSeen).toBe(pick);
  }, 60_000);
});
