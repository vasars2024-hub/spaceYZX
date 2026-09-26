import { describe, expect, it } from 'vitest';
import { arenaView, arenaWatchPit, defaultConfig, qForward, yawToView } from '@space-yz/shared';
import { createArenaPractice } from '../src/game/arena-entry';
import { arenaFromExtra, watchPitOf } from '../src/game/arena-feature';

describe('offline arena practice', () => {
  it('runs rotating duels vs bots and only shows your pit', () => {
    const { session, arena } = createArenaPractice({
      loadout: 'lethal',
      bots: 3,
      skill: 'normal',
      config: defaultConfig(),
    });
    expect(session.world().players.length).toBe(4);
    const view = yawToView(-90);
    const idle = () => ({ buttons: 0, view });
    // warmup (3 s) then the first round's break
    for (let i = 0; i < 60 * 5 && arena.phase === 'warmup'; i++) session.update(1 / 60, idle);
    expect(arena.phase === 'break' || arena.phase === 'duel').toBe(true);
    const mine = arena.duels.find((d) => d.ids.includes(session.localId))!;
    expect(mine).toBeDefined();
    const opp = mine.ids.find((id) => id !== session.localId)!;
    // you see your opponent, never the players of the other pit
    expect(session.others().map((p) => p.id)).toEqual([opp]);
    expect(qForward(view).x).toBeGreaterThan(0.9);
    // standing still: the bot finds and beats you (or the timer decides) — the round ends
    for (let i = 0; i < 60 * 60 && mine.winner === null; i++) session.update(1 / 60, idle);
    expect(mine.winner).not.toBeNull();
    // the HUD's idea of the pit you watch matches the rules' (which the server culls by)
    const me = session.local()!;
    expect(watchPitOf(arenaView(arena), me.id, me.alive)).toBe(
      arenaWatchPit(arena, session.world(), me.id),
    );
  });

  it('reads the arena state from an online rules state', () => {
    expect(arenaFromExtra({ rules: 'match' })).toBeNull();
    expect(arenaFromExtra(null)).toBeNull();
    expect(arenaFromExtra({ rules: 'arena', phase: 'warmup' })?.phase).toBe('warmup');
  });
});
