// Practice range: the Training Bay with target dummies — some stand still, some strafe, some
// strafe and jump — at short, medium and long range. Dummies never attack and pop back up a
// second after they're killed.
import type { PlayerInput, GameConfig, Vec3 } from '@space-yz/shared';
import {
  buildTrainingBay,
  createPlayer,
  addPlayer,
  respawnPlayer,
  yawToView,
  v3,
  Btn,
  StatsTracker,
} from '@space-yz/shared';
import { LocalSession } from './local-session';

export type DummyKind = 'static' | 'strafe' | 'jumper';

interface Dummy {
  id: number;
  home: Vec3;
  kind: DummyKind;
  deadSince: number;
  phase: number;
}

export const RANGE_DUMMIES: { pos: Vec3; kind: DummyKind }[] = [
  { pos: v3(-18, 0, -6), kind: 'static' },
  { pos: v3(-18, 0, 6), kind: 'strafe' },
  { pos: v3(-4, 3, 0), kind: 'static' }, // on the centre platform
  { pos: v3(8, 0, -8), kind: 'strafe' },
  { pos: v3(8, 0, 8), kind: 'jumper' },
  { pos: v3(24, 0, -3), kind: 'static' },
  { pos: v3(24, 0, 10), kind: 'jumper' },
  { pos: v3(0, 6, -19), kind: 'strafe' }, // on the balcony
];

/** Scripted input for a dummy at tick `t` (strafing left/right every ~1.2 s). */
export const dummyInput = (d: { kind: DummyKind; phase: number }, tick: number): number => {
  if (d.kind === 'static') return 0;
  const left = Math.floor((tick + d.phase) / 70) % 2 === 0;
  let b = left ? Btn.Left : Btn.Right;
  if (d.kind === 'jumper' && (tick + d.phase) % 90 === 0) b |= Btn.Jump;
  return b;
};

export const createRangeSession = (
  config: GameConfig,
): { session: LocalSession; stats: StatsTracker } => {
  const levelDef = buildTrainingBay();
  const stats = new StatsTracker();
  const dummies: Dummy[] = [];
  const names: Record<number, string> = {};
  const session = new LocalSession({
    levelDef,
    config,
    seed: 7,
    names,
    setup: (world, ctx) => {
      RANGE_DUMMIES.forEach((d, i) => {
        const id = 2 + i;
        addPlayer(world, createPlayer(id, 1, d.pos, 90, ctx.config));
        dummies.push({ id, home: d.pos, kind: d.kind, deadSince: -1, phase: i * 37 });
        names[id] =
          d.kind === 'static' ? 'Dummy' : d.kind === 'strafe' ? 'Strafing dummy' : 'Jumping dummy';
      });
      const me = world.players.find((p) => p.id === 1)!;
      respawnPlayer(world, me, v3(-31, 0, 0), -90, ctx.config);
    },
    extraInputs: (world) => {
      const inputs: Record<number, PlayerInput> = {};
      for (const d of dummies)
        inputs[d.id] = {
          tick: world.tick + 1,
          buttons: dummyInput(d, world.tick),
          view: yawToView(90, 0),
        };
      return inputs;
    },
    afterStep: (world, ctx) => {
      stats.observe(world);
      for (const d of dummies) {
        const p = world.players.find((q) => q.id === d.id);
        if (!p) continue;
        if (p.alive) {
          d.deadSince = -1;
          // strafers drift: pull them back home
          if (Math.abs(p.pos.x - d.home.x) + Math.abs(p.pos.z - d.home.z) > 8)
            respawnPlayer(world, p, d.home, 90, ctx.config);
          continue;
        }
        if (d.deadSince < 0) d.deadSince = world.tick;
        if (world.tick - d.deadSince > 60) {
          respawnPlayer(world, p, d.home, 90, ctx.config);
          stats.onRespawn(p.id);
        }
      }
      // you respawn quickly too (e.g. after your own grenade)
      const me = world.players.find((p) => p.id === 1);
      if (me && !me.alive) respawnPlayer(world, me, v3(-31, 0, 0), -90, ctx.config);
    },
  });
  return { session, stats };
};
