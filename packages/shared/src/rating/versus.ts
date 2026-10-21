// The ranked pre-match "versus" screen: who is in the match, their ladder standing, and the
// odds. The server builds a VersusInfo when a ranked room forms (services/queue.ts) and sends
// it as { t: 'versus' }; the client shows it during warm-up (ui/versus.ts).
//
// Odds use the ladders' own maths:
// - Premier / Duels (Glicko-2): each team is one virtual player (team.ts virtualOpponent:
//   mean rating, root-mean-square RD) and the chance is Glicko-2's expected score with both
//   sides' uncertainty, E = 1 / (1 + exp(-g(√(φA² + φB²)) · (μA − μB))) — the same E the
//   rating update uses, only symmetric (P(A beats B) + P(B beats A) = 1).
// - Race (pairwise Elo, race.ts): a racer's chance to finish first is their share of the
//   Elo strengths 10^(r/400) (Bradley–Terry / Plackett–Luce); with two racers this is exactly
//   raceExpected().
import { GLICKO2_SCALE } from './glicko2';
import type { Rating } from './glicko2';
import { virtualOpponent } from './team';
import type { LadderId, RankDisplay, RankedQueueId } from './ladders';

const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

/** Chance that `a` beats `b` (Glicko-2 expected score with both RDs). */
export const winChance = (a: Rating, b: Rating): number => {
  const phiA = a.rd / GLICKO2_SCALE;
  const phiB = b.rd / GLICKO2_SCALE;
  const d = (a.rating - b.rating) / GLICKO2_SCALE;
  return 1 / (1 + Math.exp(-g(Math.sqrt(phiA * phiA + phiB * phiB)) * d));
};

/** Chance that team A beats team B: each team as its virtual player (mean rating, RMS RD). */
export const teamWinChance = (a: readonly Rating[], b: readonly Rating[]): number =>
  a.length && b.length ? winChance(virtualOpponent(a), virtualOpponent(b)) : 0.5;

/** Race: each racer's chance to finish first (Elo strengths, sums to 1). */
export const raceFirstChances = (ratings: readonly number[]): number[] => {
  if (!ratings.length) return [];
  const top = Math.max(...ratings);
  const s = ratings.map((r) => 10 ** ((r - top) / 400));
  const sum = s.reduce((x, y) => x + y, 0);
  return s.map((x) => x / sum);
};

/** A chance as a whole percent for the headline, never 0 % or 100 % (anything can happen). */
export const chancePercent = (p: number): number =>
  Math.min(99, Math.max(1, Math.round((Number.isFinite(p) ? p : 0.5) * 100)));

/**
 * The playful line under the odds. `field` = how many racers (race odds are "to finish
 * first", so a fair chance among 8 is 12.5 %: the line judges the chance against a fair share).
 */
export const oddsLine = (p: number, field = 2): string => {
  // scale a race chance so a fair share reads like a coin flip
  const fair = 1 / Math.max(2, field);
  const x = field > 2 ? (p <= fair ? (p / fair) * 0.5 : 0.5 + ((p - fair) / (1 - fair)) * 0.5) : p;
  if (x < 0.15) return 'Miracle needed.';
  if (x < 0.35) return 'Underdog story?';
  if (x <= 0.65) return 'Coin flip.';
  if (x <= 0.85) return 'Favoured.';
  return "Don't choke.";
};

export type FormResult = 'W' | 'L' | 'D';

/** One player on the versus screen (read-only ladder data). */
export interface VersusPlayer {
  /** player id in the room (null: never joined / not in the room) */
  id: number | null;
  /** the player's account (the versus screen opens their profile) */
  accountId: number | null;
  name: string;
  /** team (race: 0 for everyone) */
  team: 0 | 1;
  /** ladder rating, rounded; null while it's hidden (Premier / Race placements) */
  rating: number | null;
  /** rank label + colour (null while placing on a ladder that hides the rating) */
  rank: RankDisplay | null;
  /** placement progress while placing (null once placed) */
  placement: { done: number; need: number; unit: 'wins' | 'games' | 'races' } | null;
  /** all-time games / wins on this ladder */
  games: number;
  wins: number;
  /** last ranked results on this ladder, newest first (up to 5; Race: W = finished first) */
  form: FormResult[];
  /** Race only: chance to finish first (0..1) */
  firstChance?: number;
}

/** Sent once when a ranked room forms: { t: 'versus', data } (null clears it). */
export interface VersusInfo {
  ladder: LadderId;
  queue: RankedQueueId;
  map: string;
  players: VersusPlayer[];
  /** team ladders: each team's chance to win (sums to 1); race: [1, 0] (unused) */
  teamChance: [number, number];
}

/** Headline for a player: "You have a 23% chance of beating Nova" / "Your team has a 61% chance". */
export const versusHeadline = (
  info: VersusInfo,
  me: { id: number | null; team: 0 | 1 },
): { text: string; chance: number; line: string } => {
  if (info.ladder === 'race') {
    const mine = info.players.find((p) => p.id !== null && p.id === me.id);
    const chance = mine?.firstChance ?? 1 / Math.max(1, info.players.length);
    const pct = chancePercent(chance);
    return {
      text: `You have a ${pct}% chance to finish first`,
      chance,
      line: oddsLine(chance, info.players.length),
    };
  }
  const chance = info.teamChance[me.team] ?? 0.5;
  const pct = chancePercent(chance);
  const foes = info.players.filter((p) => p.team !== me.team);
  const mates = info.players.filter((p) => p.team === me.team);
  const text =
    foes.length === 1 && mates.length === 1
      ? `You have a ${pct}% chance of beating ${foes[0].name}`
      : `Your team has a ${pct}% chance`;
  return { text, chance, line: oddsLine(chance) };
};

/** Average of the shown ratings of a team (null: none shown). */
export const teamAverage = (players: readonly VersusPlayer[], team: 0 | 1): number | null => {
  const r = players.filter((p) => p.team === team && p.rating !== null).map((p) => p.rating!);
  return r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : null;
};
