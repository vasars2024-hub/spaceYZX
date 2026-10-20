// Client side of the charged Gravity Grenade and the remote mine (both kits), owned by
// CombatFeature: the lineup preview while you hold Q (the sim's own predictGrenade, so what you
// see is exactly where it goes), the mines on the floor, their sounds and pulses, the HUD
// status (kit rows + charge bar) and the "can't place it here" hints.
import type { SimEvent, Vec3, MineState } from '@space-yz/shared';
import {
  MineSlot,
  predictGrenade,
  grenadeCharge01,
  grenadeStrength,
  loadoutOf,
  isTeammate,
  len,
  sub,
} from '@space-yz/shared';
import type { GameClient } from './client';
import { NadeView } from '../render/nade-view';
import { NadeHud, type UtilityStatus } from '../ui/nade-hud';
import { keyLabel } from '../ui/settings-screen';

type Burst = (
  at: Vec3,
  color: number,
  count: number,
  speed: number,
  life: number,
  scale: number,
  gravity: Vec3,
) => void;

const DOWN: Vec3 = { x: 0, y: -9, z: 0 };

export class NadeExtras {
  private view = new NadeView();
  private hud!: NadeHud;

  constructor(private burst: Burst) {}

  /** `hudRoot`: the combat HUD's layer (the charge bar and hints go in it). */
  init(c: GameClient, hudRoot: HTMLElement): void {
    c.scene.add(this.view.group);
    this.hud = new NadeHud(hudRoot);
  }

  events(c: GameClient, events: SimEvent[]): void {
    const me = c.session.localId;
    const a = c.deps.audio;
    const radius = c.session.config.combat.mineRadius;
    for (const e of events) {
      switch (e.type) {
        case 'grenadeBounce':
          a.play3d('wallHit', e.pos, { volume: 0.35, rate: 1.9, refDistance: 6 });
          break;
        case 'minePlace':
          if (e.player === me) a.play('catch', { volume: 0.5, rate: 0.6 });
          break;
        case 'mineRefused':
          if (e.player === me) {
            this.hud.refused(e.reason);
            a.play('laserEmpty', { volume: 0.6 });
          }
          break;
        case 'mineBlast': {
          a.play3d('grenadePop', e.pos, { volume: 1.3, rate: 0.8, refDistance: 12 });
          this.view.pulse(e.pos, radius, 0xff6a3d, 0.45, 0.4);
          this.burst(e.pos, 0xff7a2e, 36, 10, 0.8, 0.7, DOWN);
          const d = len(sub(e.pos, c.eye()));
          if (d < radius * 3) c.shake = Math.max(c.shake, 0.7 * (1 - d / (radius * 3)));
          break;
        }
        case 'mineFizzle':
          this.view.pulse(e.pos, 0.8, 0x9fb4c8, 0.5, 0.25);
          this.burst(e.pos, 0x9fb4c8, 8, 2, 0.5, 0.3, DOWN);
          break;
        case 'mineJam':
          // the planted bomb's radio shockwave: a big cyan pulse everyone hears
          this.view.pulse(e.pos, 40, 0x7fe8ff, 1.2, 0.18);
          a.play3d('revealPulse', e.pos, { volume: 1, rate: 0.55, refDistance: 25 });
          break;
        default:
          break;
      }
    }
  }

  /** Per frame: preview, mines; returns the HUD status (null: nothing to show). */
  frame(c: GameClient, dt: number): UtilityStatus | null {
    const s = c.session;
    const me = s.local();
    const world = s.world();
    const cfg = s.config.combat;
    this.view.update(dt);
    // mines: yours / your team's in your colour, an enemy's (only sent up close) dull red
    const mines: MineState[] = s.mines?.() ?? world.mines;
    const team = me?.team ?? 0;
    this.view.setMines(
      mines,
      (m) => {
        if (m.owner === s.localId) return 'mine';
        const owner = world.players.find((p) => p.id === m.owner);
        return owner && me && isTeammate(s.ctx, owner, me) ? 'mate' : 'enemy';
      },
      team,
    );
    const grenadeOn = loadoutOf(s.config).grenade;
    // the lineup preview: exactly where a release right now would send it
    const charging = !!me && me.alive && grenadeOn && me.nadeCharge > 0 && me.grenadesLeft > 0;
    this.view.setPreview(
      charging ? predictGrenade(world, s.ctx, me, c.fps.quat) : null,
      c.eye(),
      me?.up ?? { x: 0, y: 1, z: 0 },
    );
    if (!me) {
      this.hud.update(dt, null);
      return null;
    }
    const keys = c.deps.settings.keybinds;
    const label = (action: string) => keyLabel(keys[action]?.[0]).toUpperCase();
    const own = mines.find((m) => m.owner === s.localId) ?? null;
    const mine: UtilityStatus['mine'] = !(cfg.mineEnabled > 0)
      ? 'off'
      : me.mineSlot === MineSlot.Placed
        ? 'placed'
        : me.mineSlot === MineSlot.Used
          ? 'used'
          : world.minesJammed
            ? 'jammed'
            : 'ready';
    const status: UtilityStatus = {
      grenadeOn,
      grenades: me.grenadesLeft,
      charge01: charging ? grenadeCharge01(cfg, s.ctx.dt, me.nadeCharge) : null,
      strength: grenadeStrength(cfg, s.ctx.dt, Math.max(1, me.nadeCharge)),
      bounces: me.nadeBounces,
      mine,
      mineArmed: !!own && world.tick - own.placedTick >= Math.round(cfg.mineArmSec / s.ctx.dt),
      mineDist: own ? len(sub(own.pos, me.pos)) : null,
      keys: {
        nade: label('grenade'),
        bounce: label('nadeBounce'),
        place: label('minePlace'),
        detonate: label('mineDetonate'),
      },
    };
    this.hud.update(dt, me.alive ? status : null);
    return status;
  }

  dispose(c: GameClient): void {
    c.scene.remove(this.view.group);
    this.view.dispose();
  }
}
