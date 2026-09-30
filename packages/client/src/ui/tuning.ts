// Live tuning panel (dev mode): edit every movement/combat number while playing.
// Values persist in localStorage; "Copy values" puts JSON on the clipboard to send to the dev.
import GUI from 'lil-gui';
import type { GameConfig } from '@space-yz/shared';
import { defaultConfig, mergeConfig } from '@space-yz/shared';
import { storage } from '../settings';

const KEY = 'spaceyz.tuning.v1';

const GROUPS: Record<string, string[]> = {
  Body: [
    'radius',
    'standHeight',
    'crouchHeight',
    'stepHeight',
    'maxWalkableSlopeDeg',
    'groundSnap',
  ],
  Gravity: ['gravity', 'upRotateDegPerSec'],
  Ground: ['sprintSpeed', 'runSpeed', 'crouchSpeed', 'groundAccel', 'friction', 'stopSpeed'],
  'Jump & bhop': ['jumpHeight', 'jumpBufferSec', 'coyoteSec', 'landGraceSec', 'bhopLandingLoss'],
  Air: ['airAccel', 'airWishCap', 'airSoftCap', 'maxSpeed'],
  'Tap-strafe': [
    'tapStrafeMinSpeed',
    'tapStrafeWindowSec',
    'tapStrafeTurnDegPerTick',
    'tapStrafeSpeedKeep',
    'tapStrafesPerAir',
  ],
  Slide: [
    'slideStartSpeed',
    'slideEndSpeed',
    'slideBoost',
    'slideBoostMaxSpeed',
    'slideBoostCooldownSec',
    'slideDecel',
    'slideSteerAccel',
    'slideSteerCap',
    'slideMaxSpeed',
  ],
  'Mantle & climb': [
    'vaultMaxHeight',
    'climbMaxHeight',
    'vaultTimeSec',
    'vaultSpeedKeep',
    'vaultMinExitSpeed',
    'climbSpeed',
    'climbTimeSec',
  ],
  'Wall-jump': [
    'wallJumpReach',
    'wallJumpOut',
    'wallJumpUp',
    'wallJumpSpeedKeep',
    'wallJumpsPerAir',
  ],
  'Zip-rail': ['railGrabRadius', 'railSpeed', 'railHang', 'railJumpUp', 'railCooldownSec'],
  'Zero-G': [
    'floatDriftAccel',
    'pushOffSpeed',
    'pushOffReach',
    'thrusterImpulse',
    'thrusterCharges',
    'thrusterRechargeSec',
    'maxFloatSpeed',
  ],
  'Gravity shift': ['magRange', 'magPull', 'magNearRange', 'magMaxSec', 'magCooldownSec'],
  Dash: ['dashSpeed', 'dashCooldownSec', 'dashDurationSec'],
};

/** Load saved tuning (or defaults). */
export const loadTuning = (): GameConfig => {
  const raw = storage.get(KEY);
  if (!raw) return defaultConfig();
  try {
    return mergeConfig(defaultConfig(), JSON.parse(raw));
  } catch {
    return defaultConfig();
  }
};

export const saveTuning = (cfg: GameConfig): void => storage.set(KEY, JSON.stringify(cfg));

/** Only the values that differ from the defaults (short and readable when pasted in chat). */
export const tuningDiff = (cfg: GameConfig): Record<string, Record<string, number>> => {
  const d = defaultConfig();
  const out: Record<string, Record<string, number>> = {};
  for (const section of ['movement', 'combat'] as const) {
    for (const [k, v] of Object.entries(cfg[section])) {
      if ((d[section] as Record<string, number>)[k] !== v) (out[section] ??= {})[k] = v;
    }
  }
  return out;
};

export interface TuningPanelOptions {
  config: GameConfig;
  areas: { name: string }[];
  onTeleport: (index: number) => void;
  onChange?: () => void;
  extraFolders?: (gui: GUI) => void;
}

export class TuningPanel {
  gui: GUI;
  visible = false;

  constructor(private opts: TuningPanelOptions) {
    this.gui = new GUI({ title: 'Lethal Recoil tuning (dev)', width: 320 });
    this.gui.domElement.classList.add('interactive', 'tuning-panel');
    const cfg = opts.config;
    const actions = {
      'Copy values': () => {
        const text = JSON.stringify(tuningDiff(cfg), null, 1);
        navigator.clipboard?.writeText(text).then(
          () => this.flash('Copied! Paste it in chat.'),
          () => window.prompt('Copy these values:', text),
        );
      },
      'Paste values': () => {
        const text = window.prompt('Paste tuning JSON:');
        if (!text) return;
        try {
          const merged = mergeConfig(defaultConfig(), JSON.parse(text));
          Object.assign(cfg.movement, merged.movement);
          Object.assign(cfg.combat, merged.combat);
          this.refresh();
        } catch {
          this.flash('That is not valid tuning JSON.');
        }
      },
      'Reset all to defaults': () => {
        const d = defaultConfig();
        Object.assign(cfg.movement, d.movement);
        Object.assign(cfg.combat, d.combat);
        this.refresh();
      },
    };
    this.gui.add(actions, 'Copy values');
    this.gui.add(actions, 'Paste values');
    this.gui.add(actions, 'Reset all to defaults');

    const tp = this.gui.addFolder('Teleport');
    opts.areas.forEach((a, i) => tp.add({ [a.name]: () => opts.onTeleport(i) }, a.name));

    opts.extraFolders?.(this.gui);

    const mv = this.gui.addFolder('Movement');
    for (const [group, keys] of Object.entries(GROUPS)) {
      const f = mv.addFolder(group);
      f.close();
      for (const k of keys) {
        if (!(k in cfg.movement)) continue;
        const v = (cfg.movement as Record<string, number>)[k];
        const range = Math.max(1, Math.abs(v) * 3);
        f.add(cfg.movement as Record<string, number>, k, 0, range, v < 1 ? 0.01 : 0.1).onChange(
          () => this.changed(),
        );
      }
    }
    const cb = this.gui.addFolder('Combat');
    cb.close();
    for (const [k, v] of Object.entries(cfg.combat)) {
      const range = Math.max(1, Math.abs(v) * 3);
      cb.add(cfg.combat as Record<string, number>, k, 0, range, v < 1 ? 0.01 : 0.1).onChange(() =>
        this.changed(),
      );
    }
    this.gui.hide();
  }

  private changed(): void {
    saveTuning(this.opts.config);
    this.opts.onChange?.();
  }

  private refresh(): void {
    this.gui.controllersRecursive().forEach((c) => c.updateDisplay());
    this.changed();
  }

  private flash(msg: string): void {
    this.gui.title(msg);
    window.setTimeout(() => this.gui.title('Lethal Recoil tuning (dev)'), 2500);
  }

  toggle(force?: boolean): boolean {
    this.visible = force ?? !this.visible;
    if (this.visible) this.gui.show();
    else this.gui.hide();
    return this.visible;
  }

  dispose(): void {
    this.gui.destroy();
  }
}
