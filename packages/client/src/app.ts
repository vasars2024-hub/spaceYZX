// App shell: title screen, starting/stopping games, pause menu, settings.
import * as THREE from 'three';
import { GAME_NAME, buildTestShip } from '@space-yz/shared';
import { loadSettings, saveSettings, type Settings } from './settings';
import { InputManager, setLeaveGuard } from './game/input';
import { GameClient, type ClientFeature } from './game/client';
import type { Session } from './game/session';
import { LocalSession } from './game/local-session';
import { AudioEngine } from './audio';
import { TuningPanel, loadTuning } from './ui/tuning';
import { h, button, quickSettings, controlsTable } from './ui/menus';
import { ServerLink } from './net/server-link';

export const params = new URLSearchParams(location.search);
export const AUTOTEST = params.has('autotest');

export class App {
  renderer: THREE.WebGLRenderer;
  settings: Settings = loadSettings();
  input: InputManager;
  audio = new AudioEngine();
  client: GameClient | null = null;
  tuning: TuningPanel | null = null;
  server = new ServerLink();
  private screen: HTMLElement | null = null;
  private titleScene = new THREE.Scene();
  private titleCam = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  private last = performance.now();
  private titleTime = 0;

  constructor(
    public canvas: HTMLCanvasElement,
    public ui: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.settings.quality !== 'potato' && this.settings.quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.applyRenderScale();
    this.input = new InputManager(canvas, this.settings);
    this.audio.unlockOnFirstGesture(window);
    this.applyVolumes();
    this.input.onLockChange = (locked) => {
      if (!this.client) return;
      if (!locked && !AUTOTEST) this.pause(true);
    };
    this.input.onAction((a) => this.onAction(a));
    canvas.addEventListener('click', () => {
      if (this.client && !this.input.locked && !this.screen) void this.input.lockPointer();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.buildTitleScene();
    this.showTitle();
    this.server.connect();
    this.renderer.setAnimationLoop(() => this.loop());
  }

  applyRenderScale(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(dpr * this.settings.renderScale);
  }

  applyVolumes(): void {
    this.audio.setVolume('master', this.settings.masterVolume);
    this.audio.setVolume('sfx', this.settings.sfxVolume);
    this.audio.setVolume('ui', this.settings.uiVolume);
  }

  private resize(): void {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    this.renderer.setSize(w, hgt, false);
    this.titleCam.aspect = w / hgt;
    this.titleCam.updateProjectionMatrix();
    this.client?.resize(w, hgt);
  }

  private loop(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.client) {
      this.client.frame(dt);
    } else {
      this.titleTime += dt;
      const t = this.titleTime * 0.05;
      this.titleCam.position.set(Math.cos(t) * 26, 7, Math.sin(t) * 16);
      this.titleCam.lookAt(0, 3, 0);
      this.renderer.render(this.titleScene, this.titleCam);
    }
  }

  private buildTitleScene(): void {
    import('./render/level-mesh').then(({ buildLevelMeshes }) => {
      const def = buildTestShip();
      this.titleScene.background = new THREE.Color(0x05070d);
      this.titleScene.fog = new THREE.Fog(0x05070d, 10, 70);
      this.titleScene.add(buildLevelMeshes(def).group);
    });
  }

  setScreen(el: HTMLElement | null): void {
    this.screen?.remove();
    this.screen = el;
    if (el) this.ui.append(el);
    this.input.capture = !!this.client && !el;
  }

  showTitle(): void {
    const status = h('div', { class: 'status', id: 'server-status' });
    this.server.onStatus = (ok, text) => {
      status.replaceChildren(
        h('span', { class: `dot ${ok === null ? '' : ok ? 'ok' : 'bad'}` }),
        text,
      );
    };
    this.server.emitStatus();
    const menu = h('div', { class: 'menu' });
    for (const [label, fn, cls] of this.menuEntries()) menu.append(button(label, fn, cls));
    this.setScreen(
      h(
        'div',
        { class: 'screen title-screen interactive' },
        h('h1', { class: 'title' }, GAME_NAME.toUpperCase()),
        h('div', { class: 'subtitle' }, 'Gravity arena'),
        menu,
        status,
      ),
    );
  }

  /** Title menu entries; later milestones register more modes here. */
  menuEntries(): [string, () => void, string?][] {
    return [
      ['Movement playground', () => this.startPlayground()],
      ['Settings', () => this.showSettings(() => this.showTitle()), 'btn secondary'],
      ['Controls', () => this.showControls(() => this.showTitle()), 'btn secondary'],
    ];
  }

  showSettings(back: () => void): void {
    this.setScreen(
      h(
        'div',
        { class: 'screen interactive' },
        h('h2', {}, 'Settings'),
        h(
          'div',
          { class: 'panel' },
          quickSettings(this.settings, () => this.onSettingsChanged()),
        ),
        button('Back', back, 'btn secondary'),
      ),
    );
  }

  showControls(back: () => void): void {
    this.setScreen(
      h(
        'div',
        { class: 'screen interactive' },
        h('h2', {}, 'Controls'),
        h('div', { class: 'panel' }, controlsTable()),
        button('Back', back, 'btn secondary'),
      ),
    );
  }

  onSettingsChanged(): void {
    saveSettings(this.settings);
    this.applyVolumes();
    this.applyRenderScale();
    this.client?.hud.applyCrosshair();
  }

  /** Start a game with a session; called from a click so pointer lock/fullscreen are allowed. */
  startGame(
    session: Session,
    features: ClientFeature[] = [],
    opts: { tuning?: boolean } = {},
  ): GameClient {
    this.stopGame();
    const client = new GameClient(
      {
        renderer: this.renderer,
        ui: this.ui,
        input: this.input,
        settings: this.settings,
        audio: this.audio,
      },
      session,
    );
    this.client = client;
    for (const f of features) client.addFeature(f);
    client.resize(window.innerWidth, window.innerHeight);
    if (opts.tuning !== false) {
      this.tuning = new TuningPanel({
        config: session.config,
        areas: session.level.def.areas ?? [],
        onTeleport: (i) => {
          session.teleport?.(i);
          client.syncCameraToPlayer();
          client.hud.resetBest();
        },
      });
    }
    this.setScreen(null);
    setLeaveGuard(true);
    if (!AUTOTEST) {
      void this.input.lockPointer();
      if (this.settings.fullscreenOnPlay) void this.input.enterFullscreen();
    }
    return client;
  }

  stopGame(): void {
    this.client?.dispose();
    this.client = null;
    this.tuning?.dispose();
    this.tuning = null;
    setLeaveGuard(false);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  startPlayground(): void {
    const session = new LocalSession({ levelDef: buildTestShip(), config: loadTuning() });
    const client = this.startGame(session);
    client.hud.setHint(
      '` tuning panel · Esc menu · try the ramp, rail, zero-G bay (right) and wall corridor (left)',
    );
  }

  pause(on: boolean): void {
    if (!this.client) return;
    this.client.paused = on && this.isOffline();
    if (!on) {
      this.setScreen(null);
      void this.input.lockPointer();
      return;
    }
    const s = this.client.session;
    const menu = h(
      'div',
      { class: 'menu' },
      button('Resume', () => this.pause(false)),
      s.respawn
        ? button(
            'Respawn',
            () => {
              s.respawn?.();
              this.client?.syncCameraToPlayer();
              this.pause(false);
            },
            'btn secondary',
          )
        : null,
      button('Settings', () => this.showSettings(() => this.pause(true)), 'btn secondary'),
      button('Controls', () => this.showControls(() => this.pause(true)), 'btn secondary'),
      button(
        'Quit to title',
        () => {
          this.stopGame();
          this.showTitle();
        },
        'btn orange',
      ),
    );
    this.setScreen(h('div', { class: 'screen interactive pause' }, h('h2', {}, 'Paused'), menu));
  }

  isOffline(): boolean {
    return this.client?.session instanceof LocalSession;
  }

  private onAction(a: string): void {
    if (a === 'tuning' && this.tuning && this.client) {
      const open = this.tuning.toggle();
      if (open) document.exitPointerLock?.();
      else void this.input.lockPointer();
    }
  }
}
