import { describe, expect, it } from 'vitest';
import {
  formatRaceTime,
  formatSplitDelta,
  RACE_K,
  RACE_LEAVER_PENALTY,
  RACE_PLACEMENT_RACES,
  RACE_START_RATING,
  raceExpected,
  raceRatingPlayers,
  splitDelta,
  updatePersonalBest,
  updateRaceRatings,
  type RaceRatingPlayer,
} from '../src/index';

const vet = (rating: number, place: number, extra: Partial<RaceRatingPlayer> = {}) => ({
  rating,
  races: 50,
  place,
  ...extra,
});

describe('Race ladder rating', () => {
  it('starts at 1000 with 5 placement races', () => {
    expect(RACE_START_RATING).toBe(1000);
    expect(RACE_PLACEMENT_RACES).toBe(5);
    expect(raceExpected(1000, 1000)).toBeCloseTo(0.5, 9);
    expect(raceExpected(1400, 1000)).toBeCloseTo(10 / 11, 6);
  });

  it('a 1v1 race is plain Elo', () => {
    const [w, l] = updateRaceRatings([vet(1000, 1), vet(1000, 2)]);
    expect(w.delta).toBeCloseTo(RACE_K / 2, 6);
    expect(l.delta).toBeCloseTo(-RACE_K / 2, 6);
    expect(w.rating).toBeCloseTo(1016, 6);
  });

  it('scales pairwise results down: winning an 8-racer race is worth about one win, not seven', () => {
    const field = Array.from({ length: 8 }, (_, i) => vet(1000, i + 1));
    const up = updateRaceRatings(field);
    expect(up[0].delta).toBeCloseTo(RACE_K / 2, 1);
    expect(up[7].delta).toBeCloseTo(-RACE_K / 2, 1);
    // monotone by place, zero-sum among equals
    for (let i = 1; i < 8; i++) expect(up[i].delta).toBeLessThan(up[i - 1].delta);
    expect(up.reduce((a, u) => a + u.delta, 0)).toBeCloseTo(0, 6);
  });

  it('beating stronger racers is worth more than beating weaker ones', () => {
    const vsStrong = updateRaceRatings([vet(1000, 1), vet(1300, 2)])[0].delta;
    const vsWeak = updateRaceRatings([vet(1000, 1), vet(700, 2)])[0].delta;
    expect(vsStrong).toBeGreaterThan(vsWeak);
    expect(vsWeak).toBeGreaterThan(0);
  });

  it('ties (every DNF shares the last place) are draws', () => {
    const up = updateRaceRatings([vet(1000, 1), vet(1000, 2), vet(1000, 2)]);
    expect(up[1].delta).toBeCloseTo(up[2].delta, 9);
    expect(up[1].delta).toBeLessThan(0);
  });

  it('placement races count double; leavers lose extra; a solo time trial changes nothing', () => {
    const newbie = updateRaceRatings([vet(1000, 1, { races: 0 }), vet(1000, 2)]);
    expect(newbie[0].placement).toBe(true);
    expect(newbie[0].delta).toBeCloseTo(RACE_K, 6);
    expect(newbie[1].placement).toBe(false);
    const left = updateRaceRatings([vet(1000, 1), vet(1000, 2, { left: true })]);
    expect(left[1].delta).toBeCloseTo(-RACE_K / 2 - RACE_LEAVER_PENALTY, 6);
    expect(updateRaceRatings([vet(1234, 1)])[0]).toEqual({
      rating: 1234,
      delta: 0,
      placement: false,
    });
  });

  it('reads a race result', () => {
    const players = raceRatingPlayers(
      [
        { id: 7, place: 1, left: false },
        { id: 3, place: 2, left: true },
      ],
      (id) => ({ rating: id * 100, races: id }),
    );
    expect(players).toEqual([
      { rating: 700, races: 7, place: 1, left: false },
      { rating: 300, races: 3, place: 2, left: true },
    ]);
  });
});

describe('personal bests', () => {
  it('keeps the fastest finish per track with its splits', () => {
    let r = updatePersonalBest({}, 'race-cliffline', 183_000, [20_000, 45_000, 183_000], 1);
    expect(r.improved).toBe(true);
    expect(r.previous).toBeNull();
    r = updatePersonalBest(r.pbs, 'race-cliffline', 190_000, [19_000, 46_000, 190_000], 2);
    expect(r.improved).toBe(false);
    expect(r.pbs['race-cliffline'].timeMs).toBe(183_000);
    r = updatePersonalBest(r.pbs, 'race-cliffline', 175_500, [18_000, 44_000, 175_500], 3);
    expect(r.improved).toBe(true);
    expect(r.previous?.timeMs).toBe(183_000);
    expect(r.pbs['race-cliffline']).toEqual({
      track: 'race-cliffline',
      timeMs: 175_500,
      splitsMs: [18_000, 44_000, 175_500],
      at: 3,
    });
    // other tracks are separate
    r = updatePersonalBest(r.pbs, 'race-canopy', 200_000, [200_000]);
    expect(Object.keys(r.pbs).sort()).toEqual(['race-canopy', 'race-cliffline']);
  });

  it('compares a split with the best (negative = faster)', () => {
    const pb = { splitsMs: [20_000, 45_000] };
    expect(splitDelta(pb, 0, 19_250)).toBe(-750);
    expect(splitDelta(pb, 1, 46_000)).toBe(1000);
    expect(splitDelta(pb, 2, 50_000)).toBeNull();
    expect(splitDelta(null, 0, 1)).toBeNull();
    expect(formatSplitDelta(-750)).toBe('−0.75');
    expect(formatSplitDelta(1000)).toBe('+1.00');
    expect(formatRaceTime(183_456)).toBe('3:03.46');
    expect(formatRaceTime(59_999)).toBe('1:00.00');
  });
});
