// CS mode rooms: the loadout travels from room creation to the match rules and the config every
// client predicts with; ranked and practice rooms never get it.
import { describe, expect, it } from 'vitest';
import { CS_MOVE_SCALE, configLoadout, defaultConfig } from '@space-yz/shared';
import { GameHub } from '../src/game/hub';
import { MatchRules } from '../src/game/rules/match';

describe('CS mode rooms', () => {
  it('a CS room plays bomb rules with the CS config (guns, slower movement)', () => {
    const hub = new GameHub({ log: () => {} });
    const room = hub.createRoom({ mode: '2v2', map: 'split-deck', loadout: 'cs' })!;
    expect(configLoadout(room.ctx.config)).toBe('cs');
    expect(room.ctx.config.movement.sprintSpeed).toBe(
      defaultConfig().movement.sprintSpeed * CS_MOVE_SCALE,
    );
    const rules = room.rules as MatchRules;
    expect(rules).toBeInstanceOf(MatchRules);
    expect(rules.ms.loadout).toBe('cs');
    expect(rules.ms.objective).toBe('bomb');
    expect((rules.state(room) as { loadout: string }).loadout).toBe('cs');
  });

  it('normal rooms stay Lethal Recoil; ranked and practice rooms ignore a CS request', () => {
    const hub = new GameHub({ log: () => {} });
    const normal = hub.createRoom({ mode: '1v1', map: 'split-deck', objective: 'bomb' })!;
    expect(configLoadout(normal.ctx.config)).toBe('lethal');
    expect((normal.rules as MatchRules).ms.loadout).toBe('lethal');
    const ranked = hub.createRoom({ mode: '1v1', map: 'kestrel', ranked: true, loadout: 'cs' })!;
    expect(configLoadout(ranked.ctx.config)).toBe('lethal');
    const practice = hub.createRoom({ mode: 'practice', map: 'training-bay', loadout: 'cs' })!;
    expect(configLoadout(practice.ctx.config)).toBe('lethal');
  });
});

describe('Elimination and 3v3 rooms', () => {
  it('Elimination rooms keep their objective with either kit (CS never forces the bomb)', () => {
    const hub = new GameHub({ log: () => {} });
    const lethal = hub.createRoom({ mode: '2v2', map: 'kestrel', objective: 'elim' })!;
    expect((lethal.rules as MatchRules).ms.objective).toBe('elim');
    expect((lethal.rules as MatchRules).ms.loadout).toBe('lethal');
    const cs = hub.createRoom({ mode: '2v2', map: 'kestrel', objective: 'elim', loadout: 'cs' })!;
    expect(configLoadout(cs.ctx.config)).toBe('cs');
    expect((cs.rules as MatchRules).ms.objective).toBe('elim');
    // CS with Towers is not a thing: still the bomb
    const csTower = hub.createRoom({
      mode: '2v2',
      map: 'kestrel',
      objective: 'tower',
      loadout: 'cs',
    })!;
    expect((csTower.rules as MatchRules).ms.objective).toBe('bomb');
    // ranked stays Tower rules
    const ranked = hub.createRoom({
      mode: '2v2',
      map: 'kestrel',
      objective: 'elim',
      ranked: true,
    })!;
    expect((ranked.rules as MatchRules).ms.objective).toBe('tower');
  });

  it('3v3 rooms hold six players with 3v3 rules, for every objective', () => {
    const hub = new GameHub({ log: () => {} });
    for (const objective of ['tower', 'bomb', 'elim'] as const) {
      const room = hub.createRoom({ mode: '3v3', map: 'split-deck', objective })!;
      expect(room.maxPlayers).toBe(6);
      const rules = room.rules as MatchRules;
      expect(rules).toBeInstanceOf(MatchRules);
      expect(rules.ms.objective).toBe(objective);
      expect(rules.ms.rules.teamSize).toBe(3);
    }
  });
});
