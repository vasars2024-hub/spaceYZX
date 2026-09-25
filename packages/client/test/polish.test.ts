import { describe, expect, it } from 'vitest';
import { defaultConfig, capsuleOverlaps, lineOfSight, v3 } from '@space-yz/shared';
import { bindKey, keyLabel } from '../src/ui/settings-screen';
import { createRangeSession, RANGE_DUMMIES, dummyInput } from '../src/game/range';
import { DEFAULT_KEYBINDS } from '../src/settings';

describe('key rebinding', () => {
  it('moves a key to its new action and keeps two slots per action', () => {
    const b = bindKey(structuredClone(DEFAULT_KEYBINDS), 'dash', 1, 'KeyE');
    expect(b.dash).toEqual(['ShiftLeft', 'KeyE']);
    expect(b.melee).not.toContain('KeyE'); // taken away from Slash
    const c = bindKey(b, 'jump', 0, 'Mouse3');
    expect(c.jump[0]).toBe('Mouse3');
    expect(bindKey(c, 'jump', 0, null).jump).toEqual(['WheelDown']);
  });

  it('shows friendly key names', () => {
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('Mouse2')).toBe('Right mouse');
    expect(keyLabel('WheelDown')).toBe('Wheel down');
    expect(keyLabel('ShiftLeft')).toBe('Shift (left)');
    expect(keyLabel(undefined)).toBe('—');
  });
});

describe('practice range', () => {
  it('places dummies in open space; strafers move, statics stand, killed ones pop back up', () => {
    const { session } = createRangeSession(defaultConfig());
    const w = session.world();
    expect(w.players.length).toBe(1 + RANGE_DUMMIES.length);
    for (const p of w.players)
      expect(
        capsuleOverlaps(session.level, {
          center: p.pos,
          up: v3(0, 1, 0),
          halfSeg: 0.45,
          radius: 0.4,
        }),
      ).toBe(false);
    const start = new Map(w.players.map((p) => [p.id, { ...p.pos }]));
    for (let i = 0; i < 120; i++)
      session.update(1 / 60, () => ({ buttons: 0, view: { x: 0, y: 0, z: 0, w: 1 } }));
    const moved = (id: number) => {
      const a = start.get(id)!;
      const p = w.players.find((q) => q.id === id)!;
      return Math.hypot(p.pos.x - a.x, p.pos.z - a.z);
    };
    const staticId = 2 + RANGE_DUMMIES.findIndex((d) => d.kind === 'static');
    const strafeId = 2 + RANGE_DUMMIES.findIndex((d) => d.kind === 'strafe');
    expect(moved(staticId)).toBeLessThan(0.1);
    expect(moved(strafeId)).toBeGreaterThan(1);
    const victim = w.players.find((p) => p.id === staticId)!;
    victim.alive = false;
    victim.hp = 0;
    for (let i = 0; i < 70; i++)
      session.update(1 / 60, () => ({ buttons: 0, view: { x: 0, y: 0, z: 0, w: 1 } }));
    expect(victim.alive).toBe(true);
    expect(dummyInput({ kind: 'static', phase: 0 }, 5)).toBe(0);
  });

  it('every dummy can be seen (chest) from where you start', () => {
    const { session } = createRangeSession(defaultConfig());
    const eye = v3(-31, 1.6, 0);
    for (const d of RANGE_DUMMIES)
      expect(
        lineOfSight(session.level, eye, v3(d.pos.x, d.pos.y + 1.15, d.pos.z)),
        JSON.stringify(d.pos),
      ).toBe(true);
  });
});
