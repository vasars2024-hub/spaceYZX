// Transition cards: which card(s) play for which phase change (match start, half time, match
// point / final round, round won / lost, victory / defeat), their announcer lines, and the
// overlay's sequencing (each card says its line as it appears).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchView } from '@space-yz/shared';
import {
  cardDuration,
  defaultCard,
  isHalfTime,
  planMatchEnd,
  planRoundEnd,
  planRoundStart,
  roundStakes,
  sideLabel,
  CARD_MS,
  SIDE_COLORS,
} from '../src/game/transitions';
import {
  clearTransitions,
  configureTransitions,
  playTransitions,
  showTransition,
} from '../src/ui/transitions';
import type { Announcer } from '../src/audio/announcer';

const view = (over: Partial<MatchView> = {}): MatchView => ({
  mode: '5v5',
  phase: 'spawnLock',
  phaseEnds: 0,
  round: 1,
  maxRounds: 9,
  firstTo: 5,
  scores: [0, 0],
  sideSwapped: false,
  suddenDeath: false,
  roundEnds: 0,
  carriers: [],
  controllers: [],
  revealed: [],
  rounds: [],
  winner: null,
  endReason: '',
  overtime: null,
  objective: 'tower',
  loadout: 'lethal',
  attackers: null,
  bomb: null,
  ...over,
});

const kinds = (cards: { kind: string }[]) => cards.map((c) => c.kind);
const opts = { myTeam: 0 as const, map: 'Split Deck' };

describe('round start cards', () => {
  it('round 1: MATCH START (wordmark, map + mode) then ROUND 1', () => {
    const cards = planRoundStart(null, view({ round: 1 }), { ...opts, ladder: 'Premier' });
    expect(kinds(cards)).toEqual(['matchStart', 'round']);
    expect(cards[0]).toMatchObject({
      title: 'LETHAL RECOIL',
      map: 'Split Deck',
      mode: 'Premier · 5v5 · Tower',
      voice: 'lethal-recoil',
    });
    expect(cards[1]).toMatchObject({ title: 'ROUND 1', voice: 'round-1' });
  });

  it('a normal round: just ROUND n with its number said', () => {
    const prev = view({ round: 2, phase: 'roundEnd', scores: [1, 1] });
    const cards = planRoundStart(prev, view({ round: 3, scores: [1, 1] }), opts);
    expect(kinds(cards)).toEqual(['round']);
    expect(cards[0].voice).toBe('round-3');
    // past the numbered clips: "Next round"
    const late = planRoundStart(
      view({ round: 13 }),
      view({ round: 14, maxRounds: 30, firstTo: 16, scores: [7, 6] }),
      opts,
    );
    expect(late[0].voice).toBe('next-round');
  });

  it('half time: SWITCHING SIDES with your new side, then the round', () => {
    const prev = view({ round: 4, phase: 'roundEnd', sideSwapped: false, scores: [2, 2] });
    const now = view({ round: 5, sideSwapped: true, scores: [2, 2] });
    expect(isHalfTime(prev, now)).toBe(true);
    expect(isHalfTime(now, now)).toBe(false);
    expect(isHalfTime(null, now)).toBe(false); // joined mid-match: no half time card
    const cards = planRoundStart(prev, now, opts);
    expect(kinds(cards)).toEqual(['halfTime', 'round']);
    expect(cards[0]).toMatchObject({
      kicker: 'HALF TIME',
      title: 'SWITCHING SIDES',
      voice: 'switching-sides',
    });
    // team 0 starts on side 0 (cyan) and moves to side 1 (orange)
    expect(cards[0].side).toEqual({
      label: 'YOU ARE NOW ORANGE · ATTACK THE OTHER TOWER',
      color: SIDE_COLORS[1],
    });
  });

  it('half time in Bomb: T / CT in their colours', () => {
    const now = view({ round: 5, sideSwapped: true, objective: 'bomb', attackers: 0 });
    expect(sideLabel(now, 0)).toEqual({
      label: 'YOU ARE NOW T · ATTACK · PLANT THE BOMB',
      color: SIDE_COLORS[1],
    });
    expect(sideLabel(now, 1)).toEqual({
      label: 'YOU ARE NOW CT · DEFEND THE SITES',
      color: SIDE_COLORS[0],
    });
    expect(sideLabel(view({ round: 5, sideSwapped: true, objective: 'elim' }), 1).label).toBe(
      'YOU ARE NOW CYAN · COLOURS SWAPPED',
    );
  });

  it('match point / final round detection', () => {
    const base = { firstTo: 5, maxRounds: 9, suddenDeath: false };
    expect(roundStakes({ ...base, round: 3, scores: [2, 0] })).toBeNull();
    expect(roundStakes({ ...base, round: 6, scores: [4, 1] })).toEqual({
      kind: 'matchPoint',
      team: 0,
    });
    expect(roundStakes({ ...base, round: 6, scores: [2, 4] })).toEqual({
      kind: 'matchPoint',
      team: 1,
    });
    // both one win away, or the last possible round: FINAL ROUND
    expect(roundStakes({ ...base, round: 9, scores: [4, 4] })).toEqual({ kind: 'final' });
    expect(roundStakes({ ...base, round: 9, scores: [3, 4] })).toEqual({ kind: 'final' });
    expect(roundStakes({ ...base, round: 1, scores: [0, 0], suddenDeath: true })).toBeNull();

    const mp = planRoundStart(view({ round: 6 }), view({ round: 6, scores: [1, 4] }), opts);
    expect(kinds(mp)).toEqual(['matchPoint']);
    expect(mp[0]).toMatchObject({ kicker: 'ROUND 6', voice: 'match-point' });
    expect(mp[0].sub).toMatch(/Win this/); // it's the enemy's match point
    const fin = planRoundStart(view({ round: 8 }), view({ round: 9, scores: [4, 4] }), opts);
    expect(kinds(fin)).toEqual(['finalRound']);
    expect(fin[0].voice).toBe('final-round');
  });

  it('half time can also be match point (1v1: first to 5 of 9, swap after round 4)', () => {
    const prev = view({ mode: '1v1', round: 4, scores: [4, 0] });
    const now = view({ mode: '1v1', round: 5, scores: [4, 0], sideSwapped: true });
    expect(kinds(planRoundStart(prev, now, opts))).toEqual(['halfTime', 'matchPoint']);
  });

  it('sudden death replaces everything', () => {
    const cards = planRoundStart(view({ round: 9 }), view({ round: 10, suddenDeath: true }), opts);
    expect(kinds(cards)).toEqual(['suddenDeath']);
    expect(cards[0].voice).toBe('sudden-death');
  });

  it('the pre-round cards fit in the spawn lock (5 s)', () => {
    for (const cards of [
      planRoundStart(null, view({ round: 1 }), opts),
      planRoundStart(view({ round: 4 }), view({ round: 5, sideSwapped: true }), opts),
    ])
      expect(cards.reduce((t, c) => t + c.durMs, 0)).toBeLessThanOrEqual(4000);
  });
});

describe('round end and match end cards', () => {
  it('ROUND WON / ROUND LOST / DRAW with the reason, no voice', () => {
    expect(planRoundEnd(0, 0, 'Tower touched', '#19e3ff')[0]).toMatchObject({
      kind: 'roundWon',
      sub: 'Tower touched',
      accent: '#19e3ff',
    });
    expect(planRoundEnd(1, 0, 'Team eliminated')[0].kind).toBe('roundLost');
    expect(planRoundEnd(null, 0, 'Draw')[0].kind).toBe('roundDraw');
    expect(planRoundEnd(0, 0, 'x')[0].voice).toBeUndefined();
  });

  it('VICTORY / DEFEAT with your score first', () => {
    expect(planMatchEnd(1, 1, [3, 5])[0]).toMatchObject({
      kind: 'victory',
      sub: '5 – 3',
      voice: 'victory',
    });
    expect(planMatchEnd(0, 1, [5, 3])[0]).toMatchObject({ kind: 'defeat', voice: 'defeat' });
    expect(planMatchEnd(null, 0, [4, 4])[0].kind).toBe('draw');
  });

  it('calmer effects and reduced motion shorten cards (never under 0.8 s)', () => {
    expect(cardDuration(2000, 'full')).toBe(2000);
    expect(cardDuration(2000, 'reduced')).toBe(1700);
    expect(cardDuration(2000, 'minimal')).toBe(1200);
    expect(cardDuration(2000, 'full', true)).toBe(1200);
    expect(cardDuration(1000, 'minimal')).toBe(800);
  });

  it('defaultCard (for other HUDs, e.g. Brawl): usual title + voice, overridable', () => {
    expect(defaultCard('matchStart', { map: 'Kestrel', mode: 'Brawl' })).toMatchObject({
      kind: 'matchStart',
      title: 'LETHAL RECOIL',
      voice: 'lethal-recoil',
      map: 'Kestrel',
      durMs: CARD_MS.matchStart,
    });
    expect(defaultCard('round', { round: 4 })).toMatchObject({
      title: 'ROUND 4',
      voice: 'round-4',
    });
  });
});

describe('overlay sequencing', () => {
  const said: string[] = [];
  beforeEach(() => {
    said.length = 0;
    vi.useFakeTimers();
    configureTransitions({
      announcer: { say: (id: string) => said.push(id) } as unknown as Announcer,
      effects: () => 'full',
    });
  });
  afterEach(() => {
    clearTransitions();
    vi.useRealTimers();
    configureTransitions({ announcer: null });
  });

  it('says each card’s line as the card appears', () => {
    const total = playTransitions(planRoundStart(null, view({ round: 1 }), opts));
    expect(total).toBe(CARD_MS.matchStart + CARD_MS.round);
    expect(said).toEqual(['lethal-recoil']);
    vi.advanceTimersByTime(CARD_MS.matchStart - 1);
    expect(said).toEqual(['lethal-recoil']);
    vi.advanceTimersByTime(1);
    expect(said).toEqual(['lethal-recoil', 'round-1']);
  });

  it('a new sequence (or the round going live) cancels the rest', () => {
    playTransitions(planRoundStart(null, view({ round: 1 }), opts));
    clearTransitions();
    vi.advanceTimersByTime(10_000);
    expect(said).toEqual(['lethal-recoil']);
    showTransition('victory');
    expect(said).toEqual(['lethal-recoil', 'victory']);
  });
});
