// Cinematic transition cards (MATCH START, ROUND n / MATCH POINT / FINAL ROUND, HALF TIME —
// SWITCHING SIDES, ROUND WON / LOST, VICTORY / DEFEAT) and the announcer line each one says.
// Pure planning only (tested in test/transitions.test.ts); ui/transitions.ts draws them.
//
// Cards only ever play while nobody can fight: spawn lock (round start), round end and match
// end. The match HUD clears them the moment a round goes live.
import type { MatchView } from '@space-yz/shared';
import { roundLine } from '../audio/announcer-lines';

export type TransitionKind =
  | 'matchStart'
  | 'round'
  | 'matchPoint'
  | 'finalRound'
  | 'suddenDeath'
  | 'halfTime'
  | 'roundWon'
  | 'roundLost'
  | 'roundDraw'
  | 'victory'
  | 'defeat'
  | 'draw';

export interface TransitionCard {
  kind: TransitionKind;
  /** the big line ('LETHAL RECOIL' on the match start card is drawn as the chrome wordmark) */
  title: string;
  /** small line above the title */
  kicker?: string;
  /** line under the title */
  sub?: string;
  /** CSS colour of the title / slash */
  accent?: string;
  /** half time: your new side, in its colour */
  side?: { label: string; color: string };
  /** match start: map and mode */
  map?: string;
  mode?: string;
  /** how long it stays up at full effects (ms) */
  durMs: number;
  /** announcer clip said when the card appears */
  voice?: string;
}

export type EffectsLevel = 'full' | 'reduced' | 'minimal';

/** Map-side colours: side 0 cyan (CT), side 1 orange (T) — as render/team-palette.ts. */
export const SIDE_COLORS = ['#19e3ff', '#ff8a1f'] as const;
const LOSS_RED = '#ff5b5b';

export const CARD_MS: Record<TransitionKind, number> = {
  matchStart: 2200,
  round: 1400,
  matchPoint: 1600,
  finalRound: 1600,
  suddenDeath: 1800,
  halfTime: 2400,
  roundWon: 1800,
  roundLost: 1800,
  roundDraw: 1600,
  victory: 2600,
  defeat: 2600,
  draw: 2200,
};

/** Shorter cards for calmer effects settings / reduced motion (and never under 0.8 s). */
export const cardDuration = (ms: number, level: EffectsLevel, reducedMotion = false): number => {
  const k = reducedMotion || level === 'minimal' ? 0.6 : level === 'reduced' ? 0.85 : 1;
  return Math.max(800, Math.round(ms * k));
};

export interface RoundStakesInput {
  round: number;
  scores: readonly [number, number];
  firstTo: number;
  maxRounds: number;
  suddenDeath: boolean;
}

/**
 * What's at stake in a round that is about to start: the last possible round ('final': round
 * = max rounds, or both teams one win away), a round that can end the match for one team
 * ('matchPoint', with that team), or nothing special.
 */
export const roundStakes = (
  m: RoundStakesInput,
): { kind: 'final' } | { kind: 'matchPoint'; team: 0 | 1 } | null => {
  if (m.suddenDeath) return null;
  const [a, b] = m.scores;
  const need = m.firstTo - 1;
  if (m.round >= m.maxRounds || (a >= need && b >= need)) return { kind: 'final' };
  if (a >= need) return { kind: 'matchPoint', team: 0 };
  if (b >= need) return { kind: 'matchPoint', team: 1 };
  return null;
};

/** Is this round start the half-time side swap? (sides flip between two rounds) */
export const isHalfTime = (prev: Pick<MatchView, 'sideSwapped'> | null, now: MatchView): boolean =>
  !!prev && !prev.sideSwapped && now.sideSwapped && now.round > 1;

/** Your side after the swap, as the game names it (bomb: T / CT; otherwise the colour). */
export const sideLabel = (m: MatchView, myTeam: 0 | 1): { label: string; color: string } => {
  const side = (myTeam ^ (m.sideSwapped ? 1 : 0)) as 0 | 1;
  const color = SIDE_COLORS[side];
  if (m.objective === 'bomb')
    return m.attackers === myTeam
      ? { label: 'YOU ARE NOW T · ATTACK · PLANT THE BOMB', color }
      : { label: 'YOU ARE NOW CT · DEFEND THE SITES', color };
  const name = side === 0 ? 'CYAN' : 'ORANGE';
  return m.objective === 'elim'
    ? { label: `YOU ARE NOW ${name} · COLOURS SWAPPED`, color }
    : { label: `YOU ARE NOW ${name} · ATTACK THE OTHER TOWER`, color };
};

const OBJECTIVE_NAME: Record<string, string> = {
  tower: 'Tower',
  bomb: 'Bomb',
  elim: 'Elimination',
};

/** "5v5 · Bomb", or a ranked ladder's name first ("Premier · 5v5 · Bomb"). */
export const modeLabel = (m: Pick<MatchView, 'mode' | 'objective'>, ladder?: string): string =>
  [ladder, m.mode, OBJECTIVE_NAME[m.objective] ?? m.objective].filter(Boolean).join(' · ');

/** The card(s) for one round's start: optional MATCH START / HALF TIME, then the round card. */
export const planRoundStart = (
  prev: Pick<MatchView, 'sideSwapped'> | null,
  now: MatchView,
  opts: { myTeam: 0 | 1; map: string; ladder?: string },
): TransitionCard[] => {
  const cards: TransitionCard[] = [];
  if (now.suddenDeath)
    return [
      {
        kind: 'suddenDeath',
        title: 'SUDDEN DEATH',
        sub: 'Half timer · bigger Tower zones · everyone revealed',
        accent: LOSS_RED,
        durMs: CARD_MS.suddenDeath,
        voice: 'sudden-death',
      },
    ];
  if (now.round === 1)
    cards.push({
      kind: 'matchStart',
      title: 'LETHAL RECOIL',
      map: opts.map,
      mode: modeLabel(now, opts.ladder),
      durMs: CARD_MS.matchStart,
      voice: 'lethal-recoil',
    });
  else if (isHalfTime(prev, now)) {
    const side = sideLabel(now, opts.myTeam);
    cards.push({
      kind: 'halfTime',
      kicker: 'HALF TIME',
      title: 'SWITCHING SIDES',
      side,
      accent: side.color,
      durMs: CARD_MS.halfTime,
      voice: 'switching-sides',
    });
  }
  const stakes = roundStakes(now);
  if (stakes?.kind === 'final')
    cards.push({
      kind: 'finalRound',
      kicker: `ROUND ${now.round}`,
      title: 'FINAL ROUND',
      sub: 'Winner takes the match',
      accent: '#ffd24a',
      durMs: CARD_MS.finalRound,
      voice: 'final-round',
    });
  else if (stakes?.kind === 'matchPoint')
    cards.push({
      kind: 'matchPoint',
      kicker: `ROUND ${now.round}`,
      title: 'MATCH POINT',
      sub: stakes.team === opts.myTeam ? 'One more round to win it' : 'Win this or it’s over',
      accent: stakes.team === opts.myTeam ? '#ffd24a' : LOSS_RED,
      durMs: CARD_MS.matchPoint,
      voice: 'match-point',
    });
  else
    cards.push({
      kind: 'round',
      title: `ROUND ${now.round}`,
      sub: `First to ${now.firstTo}`,
      durMs: CARD_MS.round,
      voice: roundLine(now.round),
    });
  return cards;
};

/** ROUND WON / ROUND LOST / DRAW (no voice: the win/lose sting plays). */
export const planRoundEnd = (
  winner: 0 | 1 | null,
  myTeam: 0 | 1,
  reason: string,
  winnerColor?: string,
): TransitionCard[] => [
  winner === null
    ? { kind: 'roundDraw', title: 'DRAW', sub: reason, durMs: CARD_MS.roundDraw }
    : winner === myTeam
      ? {
          kind: 'roundWon',
          title: 'ROUND WON',
          sub: reason,
          accent: winnerColor,
          durMs: CARD_MS.roundWon,
        }
      : {
          kind: 'roundLost',
          title: 'ROUND LOST',
          sub: reason,
          accent: winnerColor ?? LOSS_RED,
          durMs: CARD_MS.roundLost,
        },
];

/** VICTORY / DEFEAT / DRAW over the results screen. */
export const planMatchEnd = (
  winner: 0 | 1 | null,
  myTeam: 0 | 1,
  scores: readonly [number, number],
): TransitionCard[] => {
  const score = `${scores[myTeam]} – ${scores[1 - myTeam]}`;
  if (winner === null) return [{ kind: 'draw', title: 'DRAW', sub: score, durMs: CARD_MS.draw }];
  return winner === myTeam
    ? [
        {
          kind: 'victory',
          title: 'VICTORY',
          sub: score,
          accent: '#ffd24a',
          durMs: CARD_MS.victory,
          voice: 'victory',
        },
      ]
    : [
        {
          kind: 'defeat',
          title: 'DEFEAT',
          sub: score,
          accent: LOSS_RED,
          durMs: CARD_MS.defeat,
          voice: 'defeat',
        },
      ];
};

/** A card of one kind with its usual title / voice (for modes with their own HUD, e.g. Brawl). */
export const defaultCard = (
  kind: TransitionKind,
  info: Partial<TransitionCard> & { round?: number } = {},
): TransitionCard => {
  const base: Record<TransitionKind, Omit<TransitionCard, 'kind' | 'durMs'>> = {
    matchStart: { title: 'LETHAL RECOIL', voice: 'lethal-recoil' },
    round: {
      title: `ROUND ${info.round ?? 1}`,
      voice: roundLine(info.round ?? 0),
    },
    matchPoint: { title: 'MATCH POINT', voice: 'match-point', accent: '#ffd24a' },
    finalRound: { title: 'FINAL ROUND', voice: 'final-round', accent: '#ffd24a' },
    suddenDeath: { title: 'SUDDEN DEATH', voice: 'sudden-death', accent: LOSS_RED },
    halfTime: { kicker: 'HALF TIME', title: 'SWITCHING SIDES', voice: 'switching-sides' },
    roundWon: { title: 'ROUND WON' },
    roundLost: { title: 'ROUND LOST', accent: LOSS_RED },
    roundDraw: { title: 'DRAW' },
    victory: { title: 'VICTORY', voice: 'victory', accent: '#ffd24a' },
    defeat: { title: 'DEFEAT', voice: 'defeat', accent: LOSS_RED },
    draw: { title: 'DRAW' },
  };
  const { round: _round, ...rest } = info;
  return { kind, durMs: CARD_MS[kind], ...base[kind], ...rest };
};
