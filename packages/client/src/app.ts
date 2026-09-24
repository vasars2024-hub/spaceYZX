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
import { h, button, controlsTable } from './ui/menus';
import { ServerLink } from './net/server-link';
import { CombatFeature } from './game/combat-feature';
import { MatchFeature } from './game/match-feature';
import { DynamicResolution, FrameStats, QUALITY, setParticleDensity } from './render/perf';
import { createPracticeSession } from './game/practice';
import { createRangeSession } from './game/range';
import {
  createPractice,
  updatePractice,
  NetCore,
  type BotSkill,
  type GameMode,
  type SocketLike,
} from '@space-yz/shared';
import { NetSession } from './net/net-session';
import { onlineMenu, RoomPanel, netPanel } from './ui/online';
import { settingsScreen } from './ui/settings-screen';
import { rankedPanel, leaderboardScreen, profileScreen, type ClientProfile } from './ui/ranked';

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
      antialias: (QUALITY[this.settings.quality] ?? QUALITY.medium).antialias,
      powerPreference: 'high-performance',
    });
    this.dynRes = new DynamicResolution(this.renderer, this.settings);
    this.applyRenderScale();
    this.input = new InputManager(canvas, this.settings);
    this.audio.unlockOnFirstGesture(window);
    this.applyVolumes();
    // menu sounds for every button (one listener for the whole UI)
    ui.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest?.('button')) this.audio.play('uiClick');
    });
    ui.addEventListener('mouseover', (e) => {
      const b = (e.target as HTMLElement).closest?.('button');
      if (b && !b.contains(e.relatedTarget as Node | null))
        this.audio.play('uiHover', { volume: 0.4 });
    });
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
    const join = params.get('join');
    if (join) this.showOnline(join.toUpperCase().slice(0, 6));
    else if (params.has('bench')) this.runBench(Number(params.get('bench')) || 20);
    else this.showTitle();
    this.server.connect();
    this.renderer.setAnimationLoop(() => this.loop());
  }

  dynRes: DynamicResolution;
  /** frame times while playing (benchmark, perf harness) */
  frameStats = new FrameStats();
  /** time spent in our own frame code (sim + scene updates + render submission) */
  cpuStats = new FrameStats();

  applyRenderScale(): void {
    this.dynRes.reset();
    setParticleDensity((QUALITY[this.settings.quality] ?? QUALITY.medium).particles);
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
    const ms = now - this.last;
    const dt = Math.min(0.1, ms / 1000);
    this.last = now;
    if (this.client) {
      this.dynRes.frame(ms);
      this.frameStats.add(ms);
      this.client.hud.renderScale = this.dynRes.scale / Math.max(0.01, this.settings.renderScale);
      const c0 = performance.now();
      this.client.frame(dt);
      this.cpuStats.add(performance.now() - c0);
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
      ['Play online', () => this.showOnline()],
      ['Practice vs bots', () => this.showPracticeMenu()],
      ['Practice range', () => this.startRange()],
      ['Movement playground', () => this.startPlayground()],
      [
        'Leaderboards',
        () => this.setScreen(leaderboardScreen(() => this.showTitle(), this.myAccountId())),
        'btn secondary',
      ],
      ['Profile', () => this.showProfile(), 'btn secondary'],
      ['Settings', () => this.showSettings(() => this.showTitle()), 'btn secondary'],
      ['Controls', () => this.showControls(() => this.showTitle()), 'btn secondary'],
    ];
  }

  showSettings(back: () => void): void {
    this.setScreen(settingsScreen(this.settings, () => this.onSettingsChanged(), back));
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
    this.input.rebuildBindings();
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

  matchFeature: MatchFeature | null = null;

  stopGame(): void {
    this.client?.dispose();
    this.matchFeature = null;
    this.client = null;
    this.tuning?.dispose();
    this.tuning = null;
    setLeaveGuard(false);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  showPracticeMenu(): void {
    let size = 1;
    let skill: BotSkill['name'] = 'normal';
    let kind: 'match' | 'deathmatch' = 'match';
    const kindRow = h('div', { class: 'choice-row' });
    const sizeRow = h('div', { class: 'choice-row' });
    const skillRow = h('div', { class: 'choice-row' });
    const renderRows = () => {
      kindRow.replaceChildren(
        ...(
          [
            ['match', 'Match (Kestrel)'],
            ['deathmatch', 'Free fight (Training Bay)'],
          ] as const
        ).map(([k, label]) =>
          button(
            label,
            () => {
              kind = k;
              renderRows();
            },
            `btn small ${kind === k ? '' : 'secondary'}`,
          ),
        ),
      );
      sizeRow.replaceChildren(
        ...[1, 2, 3, 5].map((n) =>
          button(
            `${n}v${n}`,
            () => {
              size = n;
              renderRows();
            },
            `btn small ${size === n ? '' : 'secondary'}`,
          ),
        ),
      );
      skillRow.replaceChildren(
        ...(['easy', 'normal', 'hard'] as const).map((k) =>
          button(
            k,
            () => {
              skill = k;
              renderRows();
            },
            `btn small ${skill === k ? '' : 'secondary'}`,
          ),
        ),
      );
    };
    renderRows();
    this.setScreen(
      h(
        'div',
        { class: 'screen interactive' },
        h('h2', {}, 'Practice vs bots'),
        h(
          'div',
          { class: 'panel practice-panel' },
          h('div', { class: 'label' }, 'Mode'),
          kindRow,
          h('div', { class: 'label' }, 'Team size'),
          sizeRow,
          h('div', { class: 'label' }, 'Bot difficulty'),
          skillRow,
        ),
        h(
          'div',
          { class: 'menu' },
          button('Start', () => this.startPractice(size, skill, kind)),
          button('Back', () => this.showTitle(), 'btn secondary'),
        ),
      ),
    );
  }

  startPractice(
    size: number,
    skill: BotSkill['name'],
    kind: 'match' | 'deathmatch' = 'deathmatch',
  ): void {
    const { session, stats } = createPracticeSession({
      size,
      skill,
      kind,
      config: loadTuning(),
    });
    const combat = new CombatFeature();
    const match = kind === 'match' ? new MatchFeature() : null;
    const client = this.startGame(session, match ? [combat, match] : [combat]);
    this.matchFeature = match;
    combat.statsText = () => {
      const r = stats.report([1]);
      const all = stats.report();
      return [
        'YOUR STATS',
        `Boomerang hit ${r.boomerangHitPct.toFixed(0)}%  Laser hit ${r.laserHitPct.toFixed(0)}%`,
        `Deflects ${r.deflectPct.toFixed(0)}% of incoming`,
        `K/D ${stats.players.get(1)?.kills ?? 0}/${stats.players.get(1)?.deaths ?? 0}`,
        'ALL PLAYERS',
        `Avg fight ${all.avgFightSec.toFixed(1)} s · off-screen deaths ${all.offscreenDeathPct.toFixed(0)}%`,
        `Kills: ${Object.entries(all.killsByKind)
          .map(([k, v]) => k + ' ' + v)
          .join(', ')}`,
      ].join('\n');
    };
    this.tuning?.gui.add(combat.hud, 'showStats').name('Show combat stats');
    client.hud.setHint(
      '` tuning panel (stats) · Esc menu · LMB throw · RMB wind-up/steer · E slash · R recall · Q grenade',
    );
  }

  net: NetCore | null = null;
  private netPing = 0;
  private roomPanel: RoomPanel | null = null;

  /** Connect (once) to the game server this page came from. */
  ensureNet(): NetCore {
    if (this.net && this.net.state !== 'closed') return this.net;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const core = new NetCore({
      url: `${proto}://${location.host}/ws`,
      name: this.settings.nickname || 'Pilot',
      token: this.accountToken(),
      now: () => performance.now(),
      createSocket: (u) => new WebSocket(u) as unknown as SocketLike,
      sim: this.netSim,
      schedule: (fn, ms) => void window.setTimeout(fn, ms),
    });
    core.onMessage = (msg) => this.onNetMessage(core, msg);
    core.connect();
    window.clearInterval(this.netPing);
    this.netPing = window.setInterval(() => core.pingServer(), 1000);
    this.net = core;
    return core;
  }

  /** Dev network simulator settings (M6 panel edits this live). */
  netSim = { delayMs: 0, jitterMs: 0, lossPct: 0 };

  accountToken(): string | undefined {
    try {
      return localStorage.getItem('spaceyz.token') ?? undefined;
    } catch {
      return undefined;
    }
  }

  private myAccountId(): number | null {
    return (this.net?.account as ClientProfile | null)?.id ?? null;
  }

  showProfile(): void {
    const core = this.ensureNet();
    this.setScreen(
      profileScreen(
        core,
        () => this.showTitle(),
        (code) => {
          try {
            localStorage.setItem('spaceyz.token', code);
          } catch {
            /* ignore */
          }
          core.close();
          this.net = null;
          this.showProfile();
        },
      ),
    );
  }

  /** Short messages from the server (warnings, rating changes), shown on any screen. */
  private toastBox: HTMLDivElement | null = null;
  private toast(msg: string): void {
    if (!this.toastBox) {
      this.toastBox = h('div', { class: 'toasts' });
      document.body.append(this.toastBox);
    }
    const t = h('div', { class: 'toast' }, msg);
    this.toastBox.append(t);
    window.setTimeout(() => t.classList.add('fade'), 5000);
    window.setTimeout(() => t.remove(), 5600);
  }

  private onNetMessage(core: NetCore, msg: { t: string }): void {
    if (msg.t === 'notice') {
      for (const n of core.notices.splice(0)) this.toast(n);
    }
    if (msg.t === 'roomLeft') {
      if (this.client?.session instanceof NetSession) this.stopGame();
      this.toast(core.roomLeftReason ?? 'You left the room.');
      this.showOnline();
    }
    if (msg.t === 'welcome') {
      const token = core.token;
      if (token)
        try {
          localStorage.setItem('spaceyz.token', token);
        } catch {
          /* ignore */
        }
    }
    if (msg.t === 'roomJoined') {
      // wait for the first exact snapshot, then start rendering
      const wait = () => {
        if (core.state !== 'room') return;
        if (!core.predWorld) {
          window.setTimeout(wait, 30);
          return;
        }
        this.startOnline(core);
      };
      wait();
    }
  }

  showOnline(prefill = ''): void {
    const core = this.ensureNet();
    this.setScreen(
      onlineMenu(
        {
          getName: () => this.settings.nickname,
          setName: (n) => {
            this.settings.nickname = n.slice(0, 16);
            saveSettings(this.settings);
            if (core.state === 'lobby') this.reHello(core);
          },
          create: (mode: GameMode, map: string, bots: number, skill: string) => {
            this.reHello(core);
            core.createRoom(mode, map, bots, skill);
          },
          join: (code: string) => {
            this.reHello(core);
            core.joinRoom(code);
          },
          back: () => {
            core.queueRanked(null);
            this.showTitle();
          },
          columns: [rankedPanel(core, () => this.reHello(core))],
          status: () =>
            core.error
              ? { text: core.error, ok: false }
              : core.state === 'lobby'
                ? { text: `Connected as ${core.name} · ${Math.round(core.rttMs)} ms`, ok: true }
                : core.state === 'room'
                  ? { text: `Joining room ${core.code}…`, ok: true }
                  : core.state === 'closed'
                    ? { text: 'Not connected — is the server running?', ok: false }
                    : { text: 'Connecting…', ok: null },
        },
        prefill,
      ),
    );
  }

  /** Re-send hello if the nickname changed so the server uses it. */
  private reHello(core: NetCore): void {
    core.error = null;
    if (this.settings.nickname && this.settings.nickname !== core.name) {
      core.rename(this.settings.nickname);
    }
  }

  startOnline(core: NetCore): void {
    const session = new NetSession(core);
    const combat = new CombatFeature();
    const match = new MatchFeature();
    const client = this.startGame(session, [combat, match], { tuning: false });
    this.matchFeature = match;
    this.roomPanel = new RoomPanel(this.ui, core);
    client.addFeature({
      frame: () => {
        this.roomPanel?.update();
        client.hud.netText = this.settings.showNetStats
          ? `${Math.round(core.rttMs)} ms${core.inputDelay ? ` (+${core.inputDelay} delay)` : ''}`
          : '';
      },
      dispose: () => {
        this.roomPanel?.dispose();
        this.roomPanel = null;
      },
    });
    client.hud.setHint(`Room ${core.code} — share the code or the invite link · Esc menu`);
  }

  /**
   * Benchmark: an offline 5v5 bot match on Kestrel for N seconds, then frame-time stats and
   * draw calls. Used by tools/perf/browser-bench.mjs (CPU throttling + software rendering).
   */
  runBench(seconds: number): void {
    const w = window as unknown as { __spaceyz: Record<string, unknown> };
    this.startPractice(5, 'normal', 'match');
    const t0 = performance.now();
    let calls = 0;
    let triangles = 0;
    let frames = 0;
    const sample = window.setInterval(() => {
      calls += this.renderer.info.render.calls;
      triangles += this.renderer.info.render.triangles;
      frames++;
    }, 250);
    window.setTimeout(() => {
      this.frameStats.reset(); // skip loading hitches
      this.cpuStats.reset();
    }, 3000);
    window.setTimeout(() => {
      window.clearInterval(sample);
      const s = this.frameStats.summary();
      const result = {
        ...s,
        cpuMs: this.cpuStats.summary().avgMs,
        seconds,
        drawCalls: Math.round(calls / Math.max(1, frames)),
        triangles: Math.round(triangles / Math.max(1, frames)),
        renderScale: this.dynRes.scale,
        quality: this.settings.quality,
        wallMs: Math.round(performance.now() - t0),
      };
      w.__spaceyz.bench = result;
      console.log('BENCH', JSON.stringify(result));
    }, seconds * 1000);
  }

  startRange(): void {
    const { session, stats } = createRangeSession(loadTuning());
    const combat = new CombatFeature();
    const client = this.startGame(session, [combat]);
    combat.hud.showStats = true;
    combat.statsText = () => {
      const r = stats.report([1]);
      const me = stats.players.get(1);
      return [
        'PRACTICE RANGE',
        `Boomerang hits ${r.boomerangHitPct.toFixed(0)}% · Laser hits ${r.laserHitPct.toFixed(0)}%`,
        `Dummies down: ${me?.kills ?? 0}`,
        'Static · strafing · jumping dummies at 10–55 m',
      ].join('\n');
    };
    client.hud.setHint(
      'Practice range · LMB throw (hold to aim, A/D to curve) · RMB wind-up · R recall · Q grenade · Esc menu',
    );
  }

  startPlayground(): void {
    const practice = createPractice(1.5);
    const session = new LocalSession({
      levelDef: buildTestShip(),
      config: loadTuning(),
      afterStep: (world, ctx) => void updatePractice(practice, world, ctx),
    });
    const combat = new CombatFeature();
    const client = this.startGame(session, [combat]);
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
    const match = s.match?.() ?? null;
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
      match?.phase === 'warmup' && s.canStart?.()
        ? button('Start match now', () => {
            s.startMatch?.();
            this.pause(false);
          })
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
    const board =
      match && this.matchFeature
        ? h('div', { class: 'pause-board' }, this.matchFeature.scoreboard(s, match, true))
        : null;
    this.setScreen(
      h(
        'div',
        { class: 'screen interactive pause' },
        h('h2', {}, this.isOffline() ? 'Paused' : 'Menu'),
        board,
        menu,
        s instanceof NetSession ? netPanel(s.core, this.netSim) : null,
      ),
    );
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
