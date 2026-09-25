// The in-game runtime: input -> session ticks -> camera -> render/HUD/audio, every frame.
import * as THREE from 'three';
import type { SimEvent, Vec3 } from '@space-yz/shared';
import { len, projectOnPlane, v3, qForward, Move } from '@space-yz/shared';
import type { Session } from './session';
import { FpsCamera } from './camera';
import type { InputManager } from './input';
import { buildLevelMeshes, type LevelMeshes } from '../render/level-mesh';
import { QUALITY } from '../render/perf';
import { Hud } from '../ui/hud';
import type { Settings } from '../settings';
import { cameraRotationRate } from '../settings';
import type { AudioEngine, LoopHandle } from '../audio';

export interface GameClientDeps {
  renderer: THREE.WebGLRenderer;
  ui: HTMLElement;
  input: InputManager;
  settings: Settings;
  audio: AudioEngine;
}

/** Plug-ins add rendering/UI features (combat view, objective HUD…) without touching the core. */
export interface ClientFeature {
  init?(client: GameClient): void;
  frame?(client: GameClient, dt: number): void;
  events?(client: GameClient, events: SimEvent[]): void;
  dispose?(client: GameClient): void;
}

export class GameClient {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
  fps: FpsCamera;
  hud: Hud;
  paused = false;
  fovOverride: number | null = null; // aiming zoom (horizontal degrees)
  private levelMeshes: LevelMeshes;
  private wind: LoopHandle | null = null;
  private slide: LoopHandle | null = null;
  private features: ClientFeature[] = [];
  private currentFov = 100;
  shake = 0;
  /**
   * A panel covers the middle of the screen this frame (scoreboard, match results): world
   * markers step aside so they don't show through it. Set by the feature that shows it.
   */
  panelOpen = false;
  /** Drawn after the world with a cleared depth buffer (first-person viewmodel). */
  overlay: { scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;

  constructor(
    public deps: GameClientDeps,
    public session: Session,
  ) {
    const def = session.level.def;
    const fog = def.fog ?? { color: 0x070b14, near: 30, far: 160 };
    this.scene.background = new THREE.Color(fog.color);
    this.scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);
    const q = QUALITY[deps.settings.quality] ?? QUALITY.medium;
    this.levelMeshes = buildLevelMeshes(def, {
      brightness: Math.min(1.2, Math.max(0.8, deps.settings.brightness)),
      dust: q.dust,
      atmosphere: q.atmosphere,
    });
    this.scene.add(this.levelMeshes.group);
    this.scene.add(this.camera);
    const p = session.local();
    this.fps = new FpsCamera(p?.view ?? { x: 0, y: 0, z: 0, w: 1 }, p?.up);
    this.hud = new Hud(deps.ui, deps.settings);
  }

  addFeature(f: ClientFeature): void {
    this.features.push(f);
    f.init?.(this);
  }

  /** Re-sync camera to the player's current view (after teleports/respawns). */
  syncCameraToPlayer(): void {
    const p = this.session.local();
    if (p) this.fps.reset(p.view, p.up);
  }

  frame(dt: number): void {
    const { input, settings } = this.deps;
    // mouse look at display rate
    const [dx, dy] = input.takeMouse();
    if (!this.paused)
      this.fps.look(
        dx * settings.sensitivity,
        (settings.invertY ? -dy : dy) * settings.sensitivity,
      );

    if (!this.paused) {
      this.session.update(dt, () => ({ buttons: input.sampleButtons(), view: this.fps.quat }));
    }
    const up = this.session.localUp();
    if (up) this.fps.followUp(up, cameraRotationRate(settings.cameraRotation), dt);

    const eye = this.session.localEye();
    if (eye) this.camera.position.set(eye.x, eye.y, eye.z);
    const q = this.fps.quat;
    this.camera.quaternion.set(q.x, q.y, q.z, q.w);
    if (this.shake > 0 && settings.screenShake) {
      const s = this.shake * 0.02;
      this.camera.rotateX((Math.random() - 0.5) * s);
      this.camera.rotateY((Math.random() - 0.5) * s);
    }
    this.shake = Math.max(0, this.shake - dt * 4);

    // FOV (horizontal setting -> vertical for three.js), smooth zoom
    const targetFov = this.fovOverride ?? settings.fov;
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, dt * 14);
    const aspect = this.camera.aspect;
    const vfov =
      (2 * Math.atan(Math.tan((this.currentFov * Math.PI) / 360) / aspect) * 180) / Math.PI;
    if (Math.abs(this.camera.fov - vfov) > 0.01) {
      this.camera.fov = vfov;
      this.camera.updateProjectionMatrix();
    }
    // this frame's view for features that project into it (markers, threat arcs); otherwise
    // they'd use last frame's and lag behind the world while you turn
    this.camera.updateMatrixWorld();

    const local = this.session.local();
    this.hud.update(local, this.session.config.movement, dt, this.fps.forward(), this.fps.camUp());

    // animate zero-G dust
    this.levelMeshes.group.traverse((o) => {
      if (o.userData.spin) o.rotation.y += dt * 0.01;
    });

    const events = this.session.drainEvents();
    this.audioFrame(events, local ? len(projectOnPlane(local.vel, local.up)) : 0, local?.move ?? 0);
    for (const f of this.features) {
      if (events.length) f.events?.(this, events);
      f.frame?.(this, dt);
    }
    const r = this.deps.renderer;
    r.info.autoReset = false; // count both passes (world + viewmodel) per frame
    r.info.reset();
    r.render(this.scene, this.camera);
    if (this.overlay) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.overlay.scene, this.overlay.camera);
      r.autoClear = true;
    }
  }

  private audioFrame(events: SimEvent[], speed: number, move: number): void {
    const a = this.deps.audio;
    const eye = this.session.localEye() ?? v3();
    a.setListener(eye, qForward(this.fps.quat), this.fps.camUp());
    const me = this.session.localId;
    for (const e of events) {
      if ('player' in e && e.player !== me) continue;
      switch (e.type) {
        case 'jump':
          a.play('jump', { volume: 0.5 });
          break;
        case 'land':
          if (e.speed > 3)
            a.play(e.speed > 12 ? 'landHard' : 'land', { volume: Math.min(1, e.speed / 10) });
          break;
        case 'wallJump':
          a.play('jump', { volume: 0.7, rate: 1.2 });
          break;
        case 'slide':
          if (e.boosted) a.play('dash', { volume: 0.4, rate: 0.8 });
          break;
        case 'mantle':
          a.play('mantle');
          break;
        case 'railGrab':
          a.play('railGrab');
          break;
        case 'thruster':
        case 'pushOff':
          a.play('thruster');
          break;
        case 'mag':
          a.play('magboots', { rate: e.on ? 1 : 0.8 });
          break;
        case 'dash':
          a.play('dash');
          break;
        case 'padFlip':
          a.play('revealPulse');
          break;
      }
    }
    // speed wind + slide loops
    if (a.unlocked) {
      this.wind ??= a.loop2d('wind', { volume: 0 });
      this.wind?.setVolume(Math.max(0, Math.min(0.6, (speed - 7) / 15)));
      this.wind?.setRate(0.8 + Math.min(1, speed / 25) * 0.6);
      const sliding = move === Move.Slide;
      if (sliding && !this.slide) this.slide = a.loop2d('slide', { volume: 0.35 });
      if (!sliding && this.slide) {
        this.slide.stop(0.1);
        this.slide = null;
      }
    }
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.fov = 0; // force FOV recompute
    this.camera.updateProjectionMatrix();
  }

  /** Eye position and look direction (for features). */
  eye(): Vec3 {
    return this.session.localEye() ?? v3();
  }

  dispose(): void {
    for (const f of this.features) f.dispose?.(this);
    this.wind?.stop(0.05);
    this.slide?.stop(0.05);
    this.levelMeshes.dispose();
    this.hud.root.remove();
    this.session.dispose();
  }
}
