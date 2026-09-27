// Ranked versus screen maths: win chances from the ladders' own expected-score formulas, and
// the playful odds lines.
import { describe, expect, it } from 'vitest';
import type { Rating, VersusInfo, VersusPlayer } from '../src';
import {
  chancePercent,
  oddsLine,
  raceExpected,
  raceFirstChances,
  teamAverage,
  teamWinChance,
  updateRating,
  versusHeadline,
  virtualOpponent,
  winChance,
} from '../src';

const r = (rating: number, rd = 60): Rating => ({ rating, rd, vol: 0.06 });

describe('win chance (Glicko-2 expected score)', () => {
  it('equal ratings are a coin flip; the chances of both sides add up to 1', () => {
    expect(winChance(r(1500), r(1500))).toBeCloseTo(0.5, 10);
    for (const [a, b] of [
      [1500, 1700],
      [1000, 1320],
      [2100, 1650],
    ]) {
      const p = winChance(r(a, 80), r(b, 200));
      expect(p + winChance(r(b, 200), r(a, 80))).toBeCloseTo(1, 10);
      expect(p > 0.5).toBe(a > b);
    }
  });

  it('with no uncertainty it is the Elo curve (400 points = 10:1)', () => {
    // RD -> 0: g(φ) -> 1 and E = 1 / (1 + 10^(-Δ/400))
    expect(winChance(r(1900, 0), r(1500, 0))).toBeCloseTo(10 / 11, 6);
    expect(winChance(r(1500, 0), r(1700, 0))).toBeCloseTo(raceExpected(1500, 1700), 6);
  });

  it('more uncertainty pulls the chance toward 50 %', () => {
    const sure = winChance(r(1800, 40), r(1500, 40));
    const unsure = winChance(r(1800, 300), r(1500, 300));
    expect(sure).toBeGreaterThan(unsure);
    expect(unsure).toBeGreaterThan(0.5);
  });

  it('matches the expected score the rating update is built on (winner gains less when favoured)', () => {
    // a favourite gains less for a win than an underdog does: consistent with the odds
    const fav = r(1800, 60);
    const dog = r(1500, 60);
    expect(winChance(fav, dog)).toBeGreaterThan(0.75);
    const favGain = updateRating(fav, [{ opponent: dog, score: 1 }]).rating - fav.rating;
    const dogGain = updateRating(dog, [{ opponent: fav, score: 1 }]).rating - dog.rating;
    expect(dogGain).toBeGreaterThan(favGain);
  });

  it('teams: each team is its virtual player (mean rating, RMS RD)', () => {
    const a = [r(1600, 50), r(1400, 90)];
    const b = [r(1450, 70), r(1450, 70)];
    expect(teamWinChance(a, b)).toBeCloseTo(winChance(virtualOpponent(a), virtualOpponent(b)), 10);
    expect(teamWinChance(a, b)).toBeGreaterThan(0.5);
    expect(teamWinChance([], b)).toBe(0.5);
  });
});

describe('race: chance to finish first', () => {
  it('sums to 1; two racers = the Race ladder’s pairwise Elo expectation', () => {
    const c = raceFirstChances([1000, 1100, 900, 1300]);
    expect(c.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10);
    expect(c[3]).toBeGreaterThan(c[1]);
    const two = raceFirstChances([1200, 1000]);
    expect(two[0]).toBeCloseTo(raceExpected(1200, 1000), 10);
    expect(raceFirstChances([1000, 1000, 1000, 1000])).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(raceFirstChances([])).toEqual([]);
  });
});

describe('odds lines', () => {
  it('picks the line from the chance', () => {
    expect(oddsLine(0.05)).toBe('Miracle needed.');
    expect(oddsLine(0.149)).toBe('Miracle needed.');
    expect(oddsLine(0.15)).toBe('Underdog story?');
    expect(oddsLine(0.34)).toBe('Underdog story?');
    expect(oddsLine(0.35)).toBe('Coin flip.');
    expect(oddsLine(0.5)).toBe('Coin flip.');
    expect(oddsLine(0.65)).toBe('Coin flip.');
    expect(oddsLine(0.7)).toBe('Favoured.');
    expect(oddsLine(0.85)).toBe('Favoured.');
    expect(oddsLine(0.9)).toBe("Don't choke.");
  });

  it('race lines judge the chance against a fair share of the field', () => {
    expect(oddsLine(1 / 8, 8)).toBe('Coin flip.');
    expect(oddsLine(0.6, 8)).toBe('Favoured.');
    expect(oddsLine(0.01, 8)).toBe('Miracle needed.');
  });

  it('percent is whole and never 0 or 100', () => {
    expect(chancePercent(0.234)).toBe(23);
    expect(chancePercent(0)).toBe(1);
    expect(chancePercent(1)).toBe(99);
    expect(chancePercent(NaN)).toBe(50);
  });
});

describe('versus headline', () => {
  const player = (id: number, name: string, team: 0 | 1, rating: number | null): VersusPlayer => ({
    id,
    accountId: id + 100,
    name,
    team,
    rating,
    rank: null,
    placement: rating === null ? { done: 2, need: 5, unit: 'wins' } : null,
    games: 10,
    wins: 6,
    form: ['W', 'L'],
  });

  it('1v1 names the opponent; teams say "your team"', () => {
    const duel: VersusInfo = {
      ladder: 'duels',
      queue: 'duels-1v1',
      map: 'split-deck',
      players: [player(1, 'Me', 0, 1500), player(2, 'Nova', 1, 1700)],
      teamChance: [0.23, 0.77],
    };
    expect(versusHeadline(duel, { id: 1, team: 0 })).toMatchObject({
      text: 'You have a 23% chance of beating Nova',
      line: 'Underdog story?',
    });
    expect(versusHeadline(duel, { id: 2, team: 1 }).text).toBe(
      'You have a 77% chance of beating Me',
    );
    const team: VersusInfo = {
      ...duel,
      ladder: 'premier',
      queue: 'premier',
      players: [
        player(1, 'A', 0, 1200),
        player(2, 'B', 0, null),
        player(3, 'C', 1, 1000),
        player(4, 'D', 1, 1100),
      ],
      teamChance: [0.61, 0.39],
    };
    expect(versusHeadline(team, { id: 1, team: 0 })).toMatchObject({
      text: 'Your team has a 61% chance',
      line: 'Coin flip.',
    });
    // averages only count shown ratings (placements stay hidden)
    expect(teamAverage(team.players, 0)).toBe(1200);
    expect(teamAverage(team.players, 1)).toBe(1050);
  });

  it('race: your chance to finish first', () => {
    const race: VersusInfo = {
      ladder: 'race',
      queue: 'race',
      map: 'race-cliffline',
      players: [
        { ...player(1, 'Me', 0, 1000), firstChance: 0.1 },
        { ...player(2, 'Zip', 0, 1300), firstChance: 0.9 },
      ],
      teamChance: [1, 0],
    };
    expect(versusHeadline(race, { id: 1, team: 0 }).text).toBe(
      'You have a 10% chance to finish first',
    );
  });
});
