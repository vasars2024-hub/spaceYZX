// The casual queue's choice: the match that suits the most people, bots after a wait.
import { describe, expect, it } from 'vitest';
import type { CasualSearcher } from '../src/index';
import { casualTeams, cleanCasualPick, pickCasualMatch } from '../src/index';

const s = (
  id: string,
  modes: CasualSearcher['modes'],
  sizes: CasualSearcher['sizes'],
  joinedAtMs = 0,
  size = 1,
): CasualSearcher => ({ id, modes, sizes, joinedAtMs, size });

describe('casual queue', () => {
  it('a full match starts at once: the one with the most players', () => {
    const m = pickCasualMatch(
      [
        s('a', ['tower', 'elim'], ['1v1', '2v2']),
        s('b', ['elim'], ['2v2']),
        s('c', ['elim', 'bomb'], ['2v2', '5v5']),
        s('d', ['tower', 'elim'], ['2v2']),
      ],
      0,
    )!;
    expect(m).toMatchObject({ mode: 'elim', size: '2v2', players: 4, bots: 0 });
    expect(Object.values(m.teams).sort()).toEqual([0, 0, 1, 1]);
  });

  it('prefers a full small match over waiting; nothing starts early without a full one', () => {
    expect(
      pickCasualMatch([s('a', ['tower'], ['2v2']), s('b', ['tower'], ['2v2'])], 1000),
    ).toBeNull();
    expect(
      pickCasualMatch([s('a', ['tower'], ['1v1', '2v2']), s('b', ['tower'], ['1v1', '2v2'])], 0),
    ).toMatchObject({ mode: 'tower', size: '1v1', bots: 0 });
  });

  it('after 30 s the longest waiter gets the fullest option with bots', () => {
    const list = [
      s('old', ['bomb', 'brawl'], ['3v3'], 0),
      s('new', ['brawl'], ['3v3', '5v5'], 20_000),
    ];
    expect(pickCasualMatch(list, 29_999)).toBeNull();
    expect(pickCasualMatch(list, 30_000)).toMatchObject({
      mode: 'brawl',
      size: '3v3',
      members: ['old', 'new'],
      players: 2,
      bots: 4,
    });
  });

  it('keeps parties whole on one team', () => {
    expect(
      casualTeams(
        [
          { id: 'p', size: 2 },
          { id: 'a', size: 1 },
          { id: 'b', size: 1 },
        ],
        2,
      ),
    ).toEqual({
      p: 0,
      a: 1,
      b: 1,
    });
    expect(casualTeams([{ id: 'p', size: 3 }], 2)).toBeNull();
    // a trio can't join a 1v1 / 2v2, so it waits for 3v3 players
    const m = pickCasualMatch(
      [s('trio', ['tower'], ['2v2', '3v3'], 0, 3), s('x', ['tower'], ['2v2'])],
      30_000,
    )!;
    expect(m).toMatchObject({ size: '3v3', members: ['trio'], bots: 3 });
  });

  it('cleans picks from the network', () => {
    expect(cleanCasualPick({ modes: ['tower', 'nope', 'tower'], sizes: ['9v9', '2v2'] })).toEqual({
      modes: ['tower'],
      sizes: ['2v2'],
    });
    expect(cleanCasualPick({ modes: [], sizes: ['1v1'] })).toBeNull();
    expect(cleanCasualPick('x')).toBeNull();
  });
});
