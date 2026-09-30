import { describe, expect, it } from 'vitest';
import { Room } from '../src/game/room';
import { MatchRules, type MatchResult } from '../src/game/rules/match';

const botRoom = (mode: '1v1' | '2v2', bots: number) => {
  const room = new Room({ code: 'TEST01', mode, map: 'kestrel', seed: 11 });
  const rules = new MatchRules(mode);
  room.rules = rules;
  for (let i = 0; i < bots; i++) room.addMember(`Bot ${i + 1}`, null, { botSkill: 'normal' });
  return { room, rules };
};

describe('server match rules', () => {
  it('starts when both teams are full and plays a 1v1 match to the end', () => {
    const { room, rules } = botRoom('1v1', 2);
    let result: MatchResult | null = null;
    rules.onResult = (_r, res) => (result = res);
    expect(rules.ms.phase).toBe('warmup');
    for (let i = 0; i < 60 * 4; i++) room.tick();
    expect(rules.ms.phase).toBe('spawnLock');
    for (let i = 0; i < 60 * 60 * 15 && !result; i++) room.tick();
    expect(result).not.toBeNull();
    const r = result!;
    expect(r.rounds).toBeGreaterThanOrEqual(5);
    expect(r.durationSec).toBeLessThanOrEqual(15 * 60);
    expect(r.players.length).toBe(2);
    const reasons = rules.ms.rounds.map((x) => x.reason);
    // bots should score through the objective and through fights, not only by timeouts
    expect(reasons.some((x) => x === 'tower' || x === 'elimination')).toBe(true);
    const state = rules.state(room) as { phase: string; scores: number[] };
    expect(state.phase).toBe('matchEnd');
  }, 60_000);

  it('waits in warmup for a 2v2 until the host starts it', () => {
    const { room, rules } = botRoom('2v2', 2);
    for (let i = 0; i < 60 * 5; i++) room.tick();
    expect(rules.ms.phase).toBe('warmup');
    expect(rules.requestStart(room)).toBeNull();
    for (let i = 0; i < 60 * 4; i++) room.tick();
    expect(rules.ms.phase).toBe('spawnLock');
    expect(rules.requestStart(room)).not.toBeNull();
  });

  it('a player joining mid-round sits out until the next round', () => {
    const { room, rules } = botRoom('2v2', 4);
    for (let i = 0; i < 60 * 9; i++) room.tick();
    expect(rules.ms.phase).toBe('live');
    room.removeMember(4);
    const m = room.addMember('Late', null);
    const p = room.world.players.find((q) => q.id === m.id)!;
    expect(p.alive).toBe(false);
  });
});
