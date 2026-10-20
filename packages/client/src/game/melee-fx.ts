// Teleport slash presentation (sim/melee.ts): the charge hum and "ready" ting, the dash's big
// slash sound, a black screen flash on your own screen when you fire it (0.5 s, quick fade),
// the charge / cooldown meter under the crosshair and a fading streak along the dash for
// everyone. Driven by CombatFeature (events + frame).
import * as THREE from 'three';
import type { SimEvent, PlayerState, Vec3, GameConfig } from '@space-yz/shared';
import { loadoutOf } from '@space-yz/shared';
import type { AudioEngine, LoopHandle } from '../audio';
import { TEAM_COLORS } from '../render/players';

/** The black flash on the attacker's screen: total length and how long it stays fully black. */
const FLASH_SEC = 0.5;
const FLASH_HOLD_SEC = 0.06;
/** The streak left along the dash. */
const STREAK_SEC = 0.45;
/** Hearing range (m) of a teleport slash and its charge. */
const RANGE = 50;

interface Streak {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  life: number;
}

export class MeleeFx {
  private flash: HTMLDivElement;
  private meter: HTMLDivElement;
  private fill: HTMLDivElement;
  private label: HTMLDivElement;
  private flashT = 0;
  private streaks: Streak[] = [];
  private charges = new Map<number, LoopHandle>();
  /** your own teleport slash fired since the last frame (the viewmodel swings the sword) */
  fired = false;

  constructor(
    parent: HTMLElement,
    private scene: THREE.Scene,
  ) {
    this.flash = document.createElement('div');
    Object.assign(this.flash.style, {
      position: 'absolute',
      inset: '0',
      background: '#000',
      opacity: '0',
      pointerEvents: 'none',
      display: 'none',
    });
    this.meter = document.createElement('div');
    Object.assign(this.meter.style, {
      position: 'absolute',
      left: '50%',
      top: 'calc(50% + 46px)',
      width: '132px',
      transform: 'translateX(-50%)',
      pointerEvents: 'none',
      display: 'none',
      textAlign: 'center',
      font: '700 11px/1.2 system-ui, sans-serif',
      letterSpacing: '0.12em',
      color: '#e8f1ff',
      textShadow: '0 1px 2px rgba(0,0,0,0.9)',
    });
    this.label = document.createElement('div');
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      height: '5px',
      marginTop: '3px',
      background: 'rgba(0,0,0,0.55)',
      border: '1px solid rgba(255,255,255,0.35)',
      borderRadius: '3px',
      overflow: 'hidden',
    });
    this.fill = document.createElement('div');
    Object.assign(this.fill.style, { height: '100%', width: '0%', background: '#fff' });
    bar.append(this.fill);
    this.meter.append(this.label, bar);
    parent.append(this.meter, this.flash);
  }

  private stopCharge(id: number, fade: number): void {
    this.charges.get(id)?.stop(fade);
    this.charges.delete(id);
  }

  events(
    events: SimEvent[],
    me: number,
    a: AudioEngine,
    posOf: (id: number) => Vec3,
    teamOf: (id: number) => 0 | 1 | undefined,
  ): void {
    for (const e of events) {
      switch (e.type) {
        case 'meleeCharge':
          this.stopCharge(e.player, 0.03);
          this.charges.set(
            e.player,
            a.play3dHandle('swordCharge', posOf(e.player), {
              volume: e.player === me ? 0.7 : 0.9,
              refDistance: 8,
              maxDistance: RANGE,
            }),
          );
          break;
        case 'meleeReady':
          a.play3d('swordReady', posOf(e.player), {
            volume: e.player === me ? 0.7 : 0.8,
            refDistance: 8,
            maxDistance: RANGE,
          });
          break;
        case 'meleeCancel':
          this.stopCharge(e.player, 0.1);
          break;
        case 'teleportSlash': {
          this.stopCharge(e.player, 0.02);
          if (e.player === me) {
            a.play('teleportSlash', { volume: 1 });
            this.flashT = FLASH_SEC;
            this.fired = true;
          } else {
            a.play3d('teleportSlash', e.to, { volume: 1, refDistance: 10, maxDistance: RANGE });
          }
          this.addStreak(e.from, e.to, teamOf(e.player));
          break;
        }
      }
    }
  }

  /** A thin glowing slab along the dash, fading out. */
  private addStreak(from: Vec3, to: Vec3, team: 0 | 1 | undefined): void {
    const a = new THREE.Vector3(from.x, from.y, from.z);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const length = a.distanceTo(b);
    if (length < 0.2) return;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.1, length),
      new THREE.MeshBasicMaterial({
        color: team === undefined ? 0xffffff : TEAM_COLORS[team],
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.lookAt(b);
    this.scene.add(mesh);
    this.streaks.push({ mesh, life: STREAK_SEC });
  }

  frame(dt: number, local: PlayerState | undefined, config: GameConfig): void {
    // black flash: fully black for a moment, then a quick ease-out fade
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      const since = FLASH_SEC - this.flashT;
      const u = Math.max(0, (since - FLASH_HOLD_SEC) / (FLASH_SEC - FLASH_HOLD_SEC));
      this.flash.style.opacity = String(1 - u * (2 - u));
      this.flash.style.display = this.flashT > 0 ? 'block' : 'none';
    }
    for (const s of this.streaks) {
      s.life -= dt;
      s.mesh.material.opacity = 0.8 * Math.max(0, s.life / STREAK_SEC);
      s.mesh.scale.x = 1 + 3 * (1 - s.life / STREAK_SEC);
    }
    for (const s of this.streaks.filter((x) => x.life <= 0)) this.disposeStreak(s);
    this.streaks = this.streaks.filter((x) => x.life > 0);

    // the meter: charge while you hold E, the cooldown afterwards (none in CS modes)
    const c = config.combat;
    const tap = Math.round(c.teleportTapSec * 60);
    const full = Math.round(c.teleportChargeSec * 60);
    const cdTicks = Math.round(c.teleportCooldownSec * 60);
    let show = false;
    if (local && local.alive && loadoutOf(config).teleportSlash) {
      if (local.meleeCharge >= tap) {
        show = true;
        const ready = local.meleeCharge >= full;
        this.label.textContent = ready ? 'RELEASE E — TELEPORT SLASH' : 'CHARGING SLASH';
        this.fill.style.width = `${Math.min(100, (local.meleeCharge / full) * 100)}%`;
        this.fill.style.background = ready ? '#ffffff' : '#9fb4d8';
        this.meter.style.opacity = ready
          ? String(0.75 + 0.25 * Math.sin(performance.now() / 60))
          : '1';
      } else if (local.teleportCd > 0) {
        show = true;
        this.label.textContent = `TELEPORT SLASH ${Math.ceil(local.teleportCd / 60)}s`;
        this.fill.style.width = `${100 - (local.teleportCd / cdTicks) * 100}%`;
        this.fill.style.background = '#59647a';
        this.meter.style.opacity = '0.6';
      }
    }
    this.meter.style.display = show ? 'block' : 'none';
  }

  private disposeStreak(s: Streak): void {
    this.scene.remove(s.mesh);
    s.mesh.geometry.dispose();
    s.mesh.material.dispose();
  }

  dispose(): void {
    for (const id of [...this.charges.keys()]) this.stopCharge(id, 0);
    for (const s of this.streaks) this.disposeStreak(s);
    this.streaks = [];
    this.flash.remove();
    this.meter.remove();
  }
}
