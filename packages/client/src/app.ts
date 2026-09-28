// App shell: title screen, starting/stopping games, pause menu, settings.
import * as THREE from 'three';
import {
  GAME_NAME,
  LADDERS,
  buildTestShip,
  isBrawlMode,
  ladderForMode,
  type MatchObjective,
  type LoadoutName,
} from '@space-yz/shared';
import { loadSettings, saveSettings, hasSavedSettings, type Settings } from './settings';
import {
  applyMobileDefaults,
  enterMobileFullscreen,
  isTouchDevice,
  MOBILE_PIXEL_RATIO_CAP,
  readDeviceEnv,
  setMobileClass,
  useMobileLayout,
} from './mobile';
import { TouchControls, TOUCH_CONTROLS_HELP } from './game/touch-controls';
import { InputManager, setLeaveGuard } from './game/input';
import { GameClient, type ClientFeature, type GameClientDeps } from './game/client';
import type { Session } from './game/session';
import { LocalSession } from './game/local-session';
import { AudioEngine, Announcer } from './audio';
import { configureTransitions } from './ui/transitions';
import { TuningPanel, loadTuning } from './ui/tuning';
import { h, controlsTable } from './ui/menus';
import { icon, type IconName } from './ui/icons';
import {
  card,
  cardGrid,
  fxEnter,
  fxLeave,
  backButton,
  focusFirst,
  iconButton,
  screenHead,
  segTabs,
  type Dir,
} from './ui/menu-kit';
import {
  ARENA_ENABLED,
  QUICK_PLAY_OFFLINE,
  defaultNickname,
  initialPractice,
  initialRoom,
  isBrawlPractice,
  practiceMapId,
  quickPlayMode,
  type PracticeState,
} from './ui/flow';
import {
  BRAWL_HINT,
  BrawlLocalSession,
  brawlOnlineFeatures,
  startBrawlPractice,
} from './game/brawl-entry';
import { practiceMenu } from './ui/practice-menu';
import { ServerLink } from './net/server-link';
import { CombatFeature } from './game/combat-feature';
import { MatchFeature } from './game/match-feature';
import { ChatFeature } from './game/chat-feature';
import { SoundRadar } from './game/sound-radar';
import { WorldMarkers } from './game/world-markers';
import {
  DynamicResolution,
  FrameStats,
  QUALITY,
  setParticleDensity,
  setPixelRatioCap,
} from './render/perf';
import { effects, setEffects } from './render/effects';
import { setTextureDetail } from './render/textures';
import { createPracticeSession, isCsKind, type PracticeKind } from './game/practice';
import { startArenaPractice, arenaOnlineFeatures } from './game/arena-entry';
import {
  raceHint,
  RaceNetSession,
  isRaceLobby,
  raceOnlineFeatures,
  startRacePractice,
} from './game/race-entry';
import { createRangeSession } from './game/range';
import { FreeRoamSession, startFreeRoam } from './game/free-roam';
import { raceFromExtra } from './game/race-feature';
import { VersusFeature } from './ui/versus';
import {
  createPractice,
  updatePractice,
  NetCore,
  type BotSkill,
  type RoomMode,
  type SocketLike,
} from '@space-yz/shared';
import { NetSession } from './net/net-session';
import { onlineMenu, RoomPanel, netPanel } from './ui/online';
import { settingsScreen } from './ui/settings-screen';
import { rankedScreen, leaderboardScreen, type ClientProfile } from './ui/ranked';
import { account } from './net/account';
import { attachOfficialMaps } from './net/official-maps';
import { accountScreen, recoveryCodeScreen } from './ui/account-screen';
import { editProfileScreen, profileScreen } from './ui/profile-screen';
import { friendsScreen, socialToast } from './ui/friends';
import { avatarEl } from './ui/avatars';
import './editor/menu-tile.css';

export const params = new URLSearchParams(location.search);
export const AUTOTEST = params.has('autotest');

export class App {
  renderer: THREE.WebGLRenderer;
  settings: Settings = loadSettings();
  input: InputManager;
  audio = new AudioEngine();
  /** the 90s announcer (clips in public/audio/announcer, loaded when a match starts) */
  announcer = new Announcer(this.audio);
  client: GameClient | null = null;
  tuning: TuningPanel | null = null;
  server = new ServerLink();
  private screen: HTMLElement | null = null;
  private titleScene = new THREE.Scene();
  private titleCam = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  private last = performance.now();
  private titleTime = 0;
  /** touch layout (phones/tablets or forced in Settings): on-screen controls, no pointer lock */
  mobile = false;
  /**
   * Where leaving a game goes instead of the title screen (a Map Maker test run: back to the
   * editor). Set right before the game starts (net/custom-maps.ts playMap); used once.
   */
  afterGame: (() => void) | null = null;
  /** The Map Maker's own 3D view (editor/): drawn instead of the title scene while it is open. */
  editorView: { frame(dt: number): void; resize(w: number, h: number): void } | null = null;

  constructor(
    public canvas: HTMLCanvasElement,
    public ui: HTMLElement,
  ) {
    // phones and tablets: touch layout; on the very first run also phone-friendly graphics
    const device = readDeviceEnv();
    if (!hasSavedSettings() && isTouchDevice(device)) {
      applyMobileDefaults(this.settings);
      saveSettings(this.settings);
    }
    this.mobile = useMobileLayout(this.settings.touchControls, device);
    setMobileClass(this.mobile);
    if (isTouchDevice(device)) setPixelRatioCap(MOBILE_PIXEL_RATIO_CAP);
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
    configureTransitions({
      root: ui,
      announcer: this.announcer,
      effects: () => this.settings.effects,
    });
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
      // the touch layout never locks the pointer: the ❚❚ button opens the menu instead
      if (!locked && !AUTOTEST && !this.mobile) this.pause(true);
    };
    this.input.onEscape = () => {
      if (this.mobile && this.client && !this.screen) this.pause(true);
    };
    this.input.onAction((a) => this.onAction(a));
    canvas.addEventListener('click', () => {
      if (this.client && !this.input.locked && !this.screen && !this.mobile)
        void this.input.lockPointer();
    });
    // phone: switching apps / locking the screen opens the menu (and pauses offline games)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mobile && this.client && !this.screen && !AUTOTEST)
        this.pause(true);
    });
    // menus: Esc presses the screen's Back button (one step back); in a text field it leaves it
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.defaultPrevented || e.repeat || !this.screen) return;
      const t = e.target as HTMLElement | null;
      if (t?.matches?.('input, select, textarea')) {
        t.blur();
        return;
      }
      const back = this.screen.querySelector<HTMLButtonElement>('[data-esc]:not(:disabled)');
      if (back) {
        e.preventDefault();
        back.click();
      }
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.buildTitleScene();
    const join = params.get('join');
    if (join) this.showOnline(join.toUpperCase().slice(0, 6), 'fade');
    else if (params.has('bench'))
      this.runBench(Number(params.get('bench')) || 20, params.get('map') ?? undefined);
    else this.showTitle('fade');
    this.initAccount();
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
    setEffects(this.settings.effects);
    setTextureDetail(effects.textureDetail);
    setParticleDensity(
      (QUALITY[this.settings.quality] ?? QUALITY.medium).particles * effects.particles,
    );
  }

  applyVolumes(): void {
    this.audio.setVolume('master', this.settings.masterVolume);
    this.audio.setVolume('sfx', this.settings.sfxVolume);
    this.audio.setVolume('ui', this.settings.uiVolume);
    this.audio.setVolume('announcer', this.settings.announcerVolume);
    this.audio.setVolume('music', this.settings.musicVolume);
    this.announcer.enabled = this.settings.announcer;
  }

  private resize(): void {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    this.renderer.setSize(w, hgt, false);
    this.titleCam.aspect = w / hgt;
    this.titleCam.updateProjectionMatrix();
    this.client?.resize(w, hgt);
    this.editorView?.resize(w, hgt);
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
    } else if (this.editorView) {
      this.editorView.frame(dt);
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

  /**
   * Show a menu screen (null: none, back to the game). `dir` picks the transition: forward
   * slides in from the right, back from the left, fade for opening a menu.
   */
  setScreen(el: HTMLElement | null, dir: Dir = 'fade'): void {
    const old = this.screen;
    const hadFocus = !!old?.contains(document.activeElement);
    if (old && old !== el) {
      if (el) fxLeave(old, dir);
      else old.remove();
    }
    this.screen = el;
    if (el) {
      this.ui.append(el);
      fxEnter(el, dir);
      if (hadFocus) focusFirst(el);
    }
    this.input.capture = !!this.client && !el;
    // any menu over a running game silences the game (menu clicks still play)
    this.audio.setSfxPaused(!!this.client && !!el);
  }

  showTitle(dir: Dir = 'back'): void {
    const status = h('div', { class: 'status', id: 'server-status' });
    this.server.onStatus = (ok, text) => {
      status.replaceChildren(
        h('span', { class: `dot ${ok === null ? '' : ok ? 'ok' : 'bad'}` }),
        text,
      );
    };
    this.server.emitStatus();
    // one-click Play: a quick Brawl (online, else offline vs bots), TDM or FFA
    const modeSwitch = h('div', { class: 'play-mode' });
    const renderSwitch = () =>
      modeSwitch.replaceChildren(
        segTabs(
          [
            { id: 'tdm', label: 'Team DM', icon: 'team' },
            { id: 'ffa', label: 'Free-for-all', icon: 'freefight' },
          ],
          this.settings.brawlMode,
          (id) => {
            this.settings.brawlMode = id;
            saveSettings(this.settings);
            renderSwitch();
          },
        ),
      );
    renderSwitch();
    const play = h(
      'div',
      { class: 'play-now' },
      iconButton('play', 'Play', () => this.quickPlay(), 'btn primary play-btn'),
      h(
        'div',
        { class: 'play-side' },
        modeSwitch,
        h('div', { class: 'play-desc' }, 'Quick match: jump straight into a fight.'),
      ),
    );
    const tiles = cardGrid(
      'tiles',
      this.titleTiles().map(([name, title, desc, fn, cls]) =>
        card({ title, desc, art: icon(name), cls: `tile ${cls}`, onClick: fn }),
      ),
    );
    const small = h(
      'nav',
      { class: 'icon-row', 'aria-label': 'More' },
      iconButton(
        'leaderboard',
        'Leaderboards',
        () =>
          this.setScreen(
            leaderboardScreen(
              () => this.showTitle(),
              this.myAccountId(),
              (id) => this.openProfile(id, () => this.showTitle()),
            ),
            'forward',
          ),
        'btn small secondary',
      ),
      iconButton('profile', 'Profile', () => this.showProfile(), 'btn small secondary'),
      iconButton(
        'team',
        'Friends',
        () => this.showFriends(() => this.showTitle()),
        'btn small secondary',
      ),
      iconButton(
        'settings',
        'Settings',
        () => this.showSettings(() => this.showTitle(), 'forward'),
        'btn small secondary',
      ),
      iconButton(
        'controls',
        'Controls',
        () => this.showControls(() => this.showTitle(), 'forward'),
        'btn small secondary',
      ),
    );
    this.setScreen(
      h(
        'div',
        { class: 'screen title-screen interactive flow-screen' },
        this.profileChip(),
        h('h1', { class: 'title' }, GAME_NAME.toUpperCase()),
        h('div', { class: 'subtitle' }, 'Gravity arena'),
        play,
        tiles,
        small,
        status,
      ),
      dir,
    );
  }

  /** The big title tiles: [icon, name, one-line description, action, class]. */
  titleTiles(): [IconName, string, string, () => void, string][] {
    return [
      [
        'practice',
        'Practice',
        'Practice vs bots: pick a mode, a map and your opponents.',
        () => this.showPracticeMenu(),
        'play',
      ],
      [
        'online',
        'Online rooms',
        'Play online with friends: create a room or join by code.',
        () => this.showOnline(),
        'online',
      ],
      [
        'ranked',
        'Ranked',
        'Ranked and casual matchmaking, solo or with your party.',
        () => this.showRanked(),
        'ranked',
      ],
      [
        'training',
        'Training',
        'Practice range and movement playground.',
        () => this.showTraining(),
        'training',
      ],
      [
        'map',
        'Map Maker',
        'Build your own maps, or change the real ones.',
        () => this.showMapMaker(),
        'mapmaker',
      ],
    ];
  }

  /** The Map Maker (editor/, loaded on first use): pick a map to edit, then the editor. */
  showMapMaker(dir: Dir = 'forward'): void {
    void import('./editor').then((m) => m.openMapMaker(this, dir));
  }

  /** Training: the practice range and the movement playground. */
  showTraining(dir: Dir = 'forward'): void {
    this.setScreen(
      h(
        'div',
        { class: 'screen interactive flow-screen training-flow' },
        screenHead('training', 'Training', () => this.showTitle()),
        cardGrid('modes wide', [
          card({
            title: 'Practice range',
            desc: 'Static, strafing and jumping dummies at 10–55 m. Shows your hit rates.',
            art: icon('range'),
            cls: 'mode',
            onClick: () => this.startRange(),
          }),
          card({
            title: 'Movement playground',
            desc: 'Ramp, rail, zero-G bay and wall corridor. Learn to move fast.',
            art: icon('playground'),
            cls: 'mode',
            onClick: () => this.startPlayground(),
          }),
        ]),
      ),
      dir,
    );
  }

  showSettings(back: () => void, dir: Dir = 'forward'): void {
    this.setScreen(
      settingsScreen(this.settings, () => this.onSettingsChanged(), back),
      dir,
    );
  }

  showControls(back: () => void, dir: Dir = 'forward'): void {
    this.setScreen(
      h(
        'div',
        { class: 'screen interactive flow-screen' },
        screenHead('controls', 'Controls', back),
        h(
          'div',
          { class: 'panel' },
          this.mobile ? controlsTable(TOUCH_CONTROLS_HELP) : controlsTable(),
        ),
      ),
      dir,
    );
  }

  onSettingsChanged(): void {
    saveSettings(this.settings);
    this.applyVolumes();
    this.applyRenderScale();
    this.input.rebuildBindings();
    this.client?.hud.applyCrosshair();
    // touch layout forced on/off: switches now in the menus, after the running game otherwise
    if (!this.client) this.refreshLayout();
  }

  /** Touch layout on/off from the setting (or detection); not while a game runs. */
  private refreshLayout(): void {
    this.mobile = useMobileLayout(this.settings.touchControls, readDeviceEnv());
    setMobileClass(this.mobile);
  }

  /** Start a game with a session; called from a click so pointer lock/fullscreen are allowed. */
  startGame(
    session: Session,
    features: ClientFeature[] = [],
    opts: {
      tuning?: boolean;
      /** keep the pointer locked (a Brawl moving on to its next map) */
      keepLock?: boolean;
      /** the level's view, built and kept by the caller (GameClientDeps.levelMeshes) */
      levelMeshes?: GameClientDeps['levelMeshes'];
    } = {},
  ): GameClient {
    this.stopGame(opts.keepLock);
    const client = new GameClient(
      {
        renderer: this.renderer,
        ui: this.ui,
        input: this.input,
        settings: this.settings,
        audio: this.audio,
        ...(opts.levelMeshes ? { levelMeshes: opts.levelMeshes } : {}),
      },
      session,
    );
    this.client = client;
    for (const f of features) client.addFeature(f);
    // name tags and objective markers in every mode (teammates exist outside matches too)
    client.addFeature(new WorldMarkers());
    client.addFeature(new SoundRadar(() => this.settings.soundVisualizer));
    // phones: on-screen controls (added last: they sit on top of the HUD)
    if (this.mobile)
      client.addFeature(
        new TouchControls({
          settings: this.settings,
          onPause: () => this.pause(true),
          online: session instanceof NetSession,
          enabled: () => this.mobile,
        }),
      );
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
    if (AUTOTEST) {
      /* automated browser tests drive input themselves */
    } else if (this.mobile) {
      // no pointer lock or Keyboard Lock on phones: fullscreen + landscape where allowed
      if (this.settings.fullscreenOnPlay) void enterMobileFullscreen();
    } else {
      void this.input.lockPointer();
      if (this.settings.fullscreenOnPlay) void this.input.enterFullscreen();
    }
    return client;
  }

  matchFeature: MatchFeature | null = null;

  /** `keepLock`: the next game starts right away (Brawl map change): the pointer stays locked. */
  stopGame(keepLock = false): void {
    this.client?.dispose();
    this.matchFeature = null;
    this.client = null;
    this.audio.setSfxPaused(false);
    this.tuning?.dispose();
    this.tuning = null;
    setLeaveGuard(false);
    if (document.pointerLockElement && !keepLock) document.exitPointerLock();
    this.refreshLayout(); // a touch-controls setting changed during the game applies now
  }

  /**
   * Leave the game for the title screen (a Brawl's Back to menu button), or back to the Map
   * Maker after a test run (afterGame).
   */
  quitToTitle(): void {
    this.stopGame();
    const back = this.afterGame;
    this.afterGame = null;
    if (back) back();
    else this.showTitle('fade');
  }

  /**
   * One-click Play: into a public Brawl room (TDM or FFA from the title's switch). First-timers
   * get a default nickname, no forms. No server (or no answer in a few seconds, or it is full):
   * an offline Brawl vs bots instead.
   */
  quickPlay(): void {
    if (!this.settings.nickname) {
      this.settings.nickname = defaultNickname();
      saveSettings(this.settings);
    }
    const variant = this.settings.brawlMode;
    const offline = () =>
      startBrawlPractice(this, {
        variant,
        size: QUICK_PLAY_OFFLINE[variant],
        skill: 'casual',
      });
    if (this.server.ok === false) return offline();
    const core = this.ensureNet();
    this.reHello(core);
    const t0 = performance.now();
    let sent = false;
    let cancelled = false;
    const screen = h(
      'div',
      { class: 'screen interactive flow-screen quickplay-wait' },
      h('h2', { class: 'pause-title' }, 'Finding a match…'),
      h(
        'div',
        { class: 'menu' },
        iconButton('practice', 'Play offline vs bots', () => {
          cancelled = true;
          offline();
        }),
        backButton(() => {
          cancelled = true;
          if (sent && core.state === 'room') core.leaveRoom();
          this.showTitle();
        }, 'Cancel'),
      ),
    );
    this.setScreen(screen, 'fade');
    const poll = () => {
      if (cancelled || this.screen !== screen) return;
      if (core.state === 'room') return; // roomJoined starts the game
      if (core.state === 'closed' || core.error || performance.now() - t0 > 8000) {
        core.error = null;
        return offline();
      }
      if (core.state === 'lobby' && !sent) {
        sent = true;
        core.quickPlay(quickPlayMode(variant));
      }
      window.setTimeout(poll, 100);
    };
    poll();
  }

  /** Practice choices, kept while the page is open (the menu reopens with your last setup). */
  practiceState: PracticeState = initialPractice();

  showPracticeMenu(dir: Dir = 'forward'): void {
    this.setScreen(
      practiceMenu({
        state: this.practiceState,
        back: () => this.showTitle(),
        start: (st) => {
          if (st.mode === 'freeroam')
            startFreeRoam(this, {
              mapId: practiceMapId(st),
              kit: st.kit ?? 'lethal',
              dummies: st.dummies !== false,
            });
          else if (isBrawlPractice(st.mode))
            startBrawlPractice(this, {
              variant: st.mode === 'brawl-ffa' ? 'ffa' : 'tdm',
              size: st.size,
              skill: st.skill,
              map: practiceMapId(st),
            });
          else if (st.mode === 'arena') this.startArenaPractice(st);
          else if (st.mode === 'race')
            startRacePractice(this, {
              track: practiceMapId(st),
              bots: Math.max(0, st.size - 1),
              skill: st.skill,
            });
          else
            this.startPractice(
              st.size,
              st.skill,
              st.mode === 'elim' && st.kit === 'cs' ? 'elim-cs' : st.mode,
              practiceMapId(st),
            );
        },
      }),
      dir,
    );
  }

  /**
   * Arena 1v1 vs bots (game/arena-entry.ts): `st.size` players in all (you + bots), the kit
   * from `st.kit`. The menu only offers it when ui/flow.ts ARENA_ENABLED is true.
   */
  startArenaPractice(st: PracticeState): void {
    if (!ARENA_ENABLED) return;
    startArenaPractice(this, {
      loadout: st.kit ?? 'lethal',
      bots: Math.max(1, st.size - 1),
      skill: st.skill,
    });
  }

  startPractice(
    size: number,
    skill: BotSkill['name'],
    kind: PracticeKind = 'deathmatch',
    mapId?: string,
  ): void {
    const { session, stats } = createPracticeSession({
      size,
      skill,
      kind,
      mapId,
      config: loadTuning(),
    });
    const combat = new CombatFeature();
    const match = kind !== 'deathmatch' ? new MatchFeature() : null;
    // (no tuning panel in CS mode: its config is a CS copy that must not be saved as tuning)
    const client = this.startGame(session, match ? [combat, match] : [combat], {
      tuning: !isCsKind(kind),
    });
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
      isCsKind(kind)
        ? `Esc menu · LMB fire · 1 AK · 2 Deagle · R reload · E knife${kind === 'cs' ? ' · G plant/defuse' : ''} · stop moving to shoot straight`
        : '` tuning panel (stats) · Esc menu · LMB throw · RMB wind-up/steer · E slash · R recall · Q grenade',
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
    account.attach(core);
    // (the official map edits: offline modes play them too)
    attachOfficialMaps(core);
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
    return (this.net?.account as ClientProfile | null)?.id ?? account.me?.id ?? null;
  }

  // ---------------- accounts, profiles, friends ----------------

  /** Account events: toasts for friend requests / invites, logging out, the nickname. */
  private initAccount(): void {
    account.onNotice = (n) =>
      socialToast(n, {
        join: (code) => {
          const core = this.ensureNet();
          this.reHello(core);
          core.joinRoom(code);
        },
        // a party invite: join it, then the party shows on the matchmaking screen
        joinParty: (leader) => {
          const core = this.ensureNet();
          core.partyOp('join', leader);
          if (!this.client) this.showRanked();
        },
        openProfile: (id) => this.openProfile(id),
      });
    account.onLoggedOut = (guestName) => {
      this.settings.nickname = guestName ?? '';
      saveSettings(this.settings);
      this.net?.rename(this.settings.nickname || 'Pilot');
    };
    // a secured account's display name is its username: the nickname field follows it
    account.onChange(() => {
      const me = account.me;
      if (me?.secured && this.settings.nickname !== me.name) {
        this.settings.nickname = me.name;
        saveSettings(this.settings);
      }
    });
    // returning players go online right away (friends see them, invites arrive)
    if (this.accountToken() && !params.has('bench')) this.ensureNet();
  }

  /** Title screen: your avatar and name (opens your profile). */
  private profileChip(): HTMLElement {
    const b = h('button', { class: 'profile-chip', type: 'button', title: 'Your profile' });
    const paint = () => {
      const me = account.me;
      const req = account.social?.incoming.length ?? 0;
      b.replaceChildren(
        avatarEl(me?.avatar ?? 0, me?.banner ?? 0, 34),
        h(
          'span',
          {},
          h('span', { class: 'pc-name' }, me?.name ?? (this.settings.nickname || 'Guest')),
          h('span', { class: 'pc-sub' }, me?.secured ? 'Profile' : 'Guest · secure account'),
        ),
        ...(req ? [h('span', { class: 'pc-badge', title: 'Friend requests' }, String(req))] : []),
      );
    };
    paint();
    const off = account.onChange(() => (b.isConnected ? paint() : off()));
    b.addEventListener('click', () => this.showProfile());
    return b;
  }

  /** Run `fn` once the server told us who we are (connecting first if needed). */
  private withMe(fn: () => void, back: () => void): void {
    const core = this.ensureNet();
    if (account.me && (core.state === 'lobby' || core.state === 'room')) return fn();
    const note = h('div', { class: 'panel' }, 'Connecting to the game server…');
    const wait = h(
      'div',
      { class: 'screen interactive flow-screen' },
      screenHead('profile', 'Connecting…', back),
      note,
    );
    this.setScreen(wait, 'forward');
    const t0 = performance.now();
    const poll = () => {
      if (this.screen !== wait) return;
      if (core.state === 'lobby' || core.state === 'room') return fn();
      if (core.state === 'closed' || performance.now() - t0 > 8000)
        note.textContent = 'Not connected to the game server (practice still works offline).';
      else window.setTimeout(poll, 100);
    };
    poll();
  }

  /** Your own profile. */
  showProfile(dir: Dir = 'forward', back: () => void = () => this.showTitle()): void {
    this.withMe(() => {
      const id = this.myAccountId();
      if (id === null) return this.showAccount(back, dir);
      const again = () => this.showProfile('back', back);
      this.setScreen(
        profileScreen({
          id,
          back,
          openProfile: (x) => this.openProfile(x, again),
          edit: () => this.setScreen(editProfileScreen(again), 'forward'),
          account: () => this.showAccount(again),
        }),
        dir,
      );
    }, back);
  }

  /** Anyone's profile (leaderboards, friends, a room's players, toasts). */
  openProfile(id: number, back?: () => void): void {
    if (id === this.myAccountId()) return this.showProfile('forward', back);
    const ret = back ?? (() => (this.client ? this.pause(true, 'back') : this.showTitle()));
    this.setScreen(
      profileScreen({ id, back: ret, openProfile: (x) => this.openProfile(x, ret) }),
      'forward',
    );
  }

  /** Account: secure / log in / recover (guests), password and log out (secured). */
  showAccount(back: () => void, dir: Dir = 'forward'): void {
    const core = this.ensureNet();
    const again = () => this.showAccount(back, 'back');
    this.setScreen(
      accountScreen({
        core,
        back,
        showCode: (code) => this.setScreen(recoveryCodeScreen(code, again), 'forward'),
        useLoginCode: (code) => {
          try {
            localStorage.setItem('spaceyz.token', code);
          } catch {
            /* ignore */
          }
          core.close();
          this.net = null;
          this.showAccount(back, 'none');
        },
      }),
      dir,
    );
  }

  /** Friends: search, requests, who is online, Join / Invite. */
  showFriends(back: () => void, dir: Dir = 'forward'): void {
    this.withMe(() => {
      const core = this.ensureNet();
      this.setScreen(
        friendsScreen({
          back,
          openProfile: (id) => this.openProfile(id, () => this.showFriends(back, 'back')),
          inRoom: () => core.state === 'room' && !core.ranked,
          connected: () => core.state === 'lobby' || core.state === 'room',
        }),
        dir,
      );
    }, back);
  }

  /** The other humans in your online room, each opening their profile (pause menu). */
  private roomPeople(core: NetCore): HTMLElement | null {
    const me = this.myAccountId();
    const people = core.roster.filter(
      (r) => !r.bot && r.accountId !== null && r.accountId !== undefined && r.accountId !== me,
    );
    if (!people.length) return null;
    return h(
      'div',
      { class: 'room-people' },
      ...people.map((r) =>
        iconButton(
          'profile',
          r.name,
          () => this.openProfile(r.accountId!, () => this.pause(true, 'back')),
          'btn tiny secondary',
        ),
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
      // (a Map Maker test room: back to the editor)
      const back = this.afterGame;
      this.afterGame = null;
      if (back) back();
      else if (this.editorView) {
        /* already back in the Map Maker: stay there */
      }
      // (out of a quick-play room: back to the title, its Play button is right there)
      else if (core.isPublic) this.showTitle('fade');
      else this.showOnline('', 'fade');
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
      // already playing in this room: a Brawl moved on to its next map. The old game goes (the
      // room stays), the new map loads with the pointer still locked.
      const running = this.client?.session instanceof NetSession ? this.client.session : null;
      if (running?.core === core) {
        running.keepRoom = true;
        this.stopGame(true);
        this.setScreen(
          h(
            'div',
            { class: 'screen flow-screen quickplay-wait' },
            h('h2', { class: 'pause-title' }, 'Next map…'),
          ),
          'fade',
        );
      }
      // wait for the first exact snapshot, then start rendering
      const wait = () => {
        if (core.state !== 'room') return;
        if (!core.predWorld) {
          window.setTimeout(wait, 30);
          return;
        }
        this.startOnline(core, !!running);
      };
      wait();
    }
  }

  /** Online room choices, kept while the page is open. */
  roomState = initialRoom();

  /** Connection line for the online screens. */
  private netStatus(core: NetCore): { text: string; ok: boolean | null } {
    return core.error
      ? { text: core.error, ok: false }
      : core.state === 'lobby'
        ? { text: `Connected as ${core.name} · ${Math.round(core.rttMs)} ms`, ok: true }
        : core.state === 'room'
          ? { text: `Joining room ${core.code}…`, ok: true }
          : core.state === 'closed'
            ? { text: 'Not connected — is the server running?', ok: false }
            : { text: 'Connecting…', ok: null };
  }

  showRanked(dir: Dir = 'forward'): void {
    const core = this.ensureNet();
    this.setScreen(
      rankedScreen(core, {
        beforeQueue: () => this.reHello(core),
        back: () => {
          core.queueRanked(null);
          this.showTitle();
        },
        status: () => this.netStatus(core),
        friends: () => this.showFriends(() => this.showRanked('back')),
      }),
      dir,
    );
  }

  showOnline(prefill = '', dir: Dir = 'forward'): void {
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
          create: (
            mode: RoomMode,
            map: string,
            bots: number,
            skill: string,
            objective: MatchObjective,
            loadout: LoadoutName = 'lethal',
          ) => {
            this.reHello(core);
            core.createRoom(mode, map, bots, skill, objective, loadout);
          },
          join: (code: string) => {
            this.reHello(core);
            core.joinRoom(code);
          },
          back: () => {
            core.queueRanked(null);
            this.showTitle();
          },
          room: this.roomState,
          status: () => this.netStatus(core),
        },
        prefill,
      ),
      dir,
    );
  }

  /** Re-send hello if the nickname changed so the server uses it. */
  private reHello(core: NetCore): void {
    core.error = null;
    if (this.settings.nickname && this.settings.nickname !== core.name) {
      core.rename(this.settings.nickname);
    }
  }

  startOnline(core: NetCore, keepLock = false): void {
    if (core.mode === 'race') return this.startOnlineRace(core);
    if (isBrawlMode(core.mode)) return this.startOnlineBrawl(core, keepLock);
    const session = new NetSession(core);
    const combat = new CombatFeature();
    const ladder = core.ranked ? (core.ladder ?? ladderForMode(core.mode)) : null;
    const match = new MatchFeature({ ladder: ladder ? LADDERS[ladder].name : undefined });
    // text chat + voice: online only (offline play has nobody to talk to)
    const chat = new ChatFeature(core, this.settings);
    // Arena 1v1 rooms: the arena HUD (after the match feature, which stays empty there)
    const arena = core.mode === 'arena' ? arenaOnlineFeatures(core, combat) : [];
    // ranked: the versus screen (ratings + odds) during warm-up
    const versus = core.ranked
      ? [
          new VersusFeature(core, {
            canRecall: () => {
              const m = session.match?.();
              return !m || m.phase === 'warmup';
            },
            openProfile: (id) => this.openProfile(id, () => this.pause(true, 'back')),
          }),
        ]
      : [];
    const client = this.startGame(session, [combat, match, chat, ...arena, ...versus], {
      tuning: false,
    });
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
    client.hud.setHint(
      `Room ${core.code} — share the code or the invite link · Esc menu · ${ChatFeature.hint(this.settings)}`,
    );
  }

  /** A Brawl room (public quick play or private): the Brawl HUD, chat. */
  private startOnlineBrawl(core: NetCore, keepLock: boolean): void {
    const session = new NetSession(core);
    const combat = new CombatFeature();
    const chat = new ChatFeature(core, this.settings);
    const brawl = brawlOnlineFeatures(core, combat, () => this.quitToTitle());
    const client = this.startGame(session, [combat, ...brawl, chat], { tuning: false, keepLock });
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
    client.hud.setHint(
      core.isPublic
        ? `${BRAWL_HINT} · ${ChatFeature.hint(this.settings)}`
        : `Room ${core.code} — share the code · ${BRAWL_HINT} · ${ChatFeature.hint(this.settings)}`,
    );
  }

  /** An online race room: the race HUD, see-through racers, no weapons. */
  private startOnlineRace(core: NetCore): void {
    const session = new RaceNetSession(core);
    const chat = new ChatFeature(core, this.settings);
    // ranked race: the racers, their ratings and your chance to finish first
    const versus = core.ranked
      ? [
          new VersusFeature(core, {
            canRecall: () => {
              const r = raceFromExtra(core.extra);
              return !r || r.phase === 'lobby' || r.phase === 'countdown';
            },
            openProfile: (id) => this.openProfile(id, () => this.pause(true, 'back')),
          }),
        ]
      : [];
    const client = this.startGame(session, [...raceOnlineFeatures(core), chat, ...versus], {
      tuning: false,
    });
    this.roomPanel = new RoomPanel(this.ui, core);
    client.addFeature({
      frame: () => {
        this.roomPanel?.update();
        client.hud.netText = this.settings.showNetStats ? `${Math.round(core.rttMs)} ms` : '';
      },
      dispose: () => {
        this.roomPanel?.dispose();
        this.roomPanel = null;
      },
    });
    client.hud.setHint(
      `Room ${core.code} — share the code · ${raceHint(session.level.def.race)}`,
      16,
    );
  }

  /**
   * Benchmark: an offline 5v5 bot match (default match map unless `map` is given) for N seconds,
   * then frame-time stats and draw calls. Used by tools/perf/browser-bench.mjs (CPU throttling +
   * software rendering).
   */
  runBench(seconds: number, map?: string): void {
    const w = window as unknown as { __spaceyz: Record<string, unknown> };
    this.startPractice(5, 'normal', 'match', map);
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
      'Practice range · LMB throw (hold to aim, flick the mouse while it flies to tilt it) · RMB wind-up · R recall · Q grenade · Esc menu',
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

  pause(on: boolean, dir: Dir = 'fade'): void {
    if (!this.client) return;
    this.client.paused = on && this.isOffline();
    if (!on) {
      this.setScreen(null);
      if (!this.mobile) void this.input.lockPointer();
      return;
    }
    const s = this.client.session;
    const match = s.match?.() ?? null;
    // (an offline Brawl respawns you by itself)
    const brawlOffline = this.client.session instanceof BrawlLocalSession;
    const menu = h(
      'div',
      { class: 'menu pause-menu' },
      iconButton('play', 'Resume', () => this.pause(false), 'btn primary'),
      // respawning is a practice tool: never in a match (it would skip a death mid-round)
      s.respawn && !match && !brawlOffline
        ? iconButton(
            'respawn',
            'Respawn',
            () => {
              s.respawn?.();
              this.client?.syncCameraToPlayer();
              this.pause(false);
            },
            'btn secondary',
          )
        : null,
      // free roam: reset the dummies, switch them on / off
      ...(s instanceof FreeRoamSession ? s.pauseActions() : []).map((a) =>
        iconButton(
          a.icon,
          a.label,
          () => {
            a.run();
            this.pause(false);
          },
          'btn secondary',
        ),
      ),
      (match?.phase === 'warmup' || isRaceLobby(s)) && s.canStart?.()
        ? iconButton('next', isRaceLobby(s) ? 'Start race now' : 'Start match now', () => {
            s.startMatch?.();
            this.pause(false);
          })
        : null,
      iconButton(
        'settings',
        'Settings',
        () => this.showSettings(() => this.pause(true, 'back')),
        'btn secondary',
      ),
      iconButton(
        'controls',
        'Controls',
        () => this.showControls(() => this.pause(true, 'back')),
        'btn secondary',
      ),
      s instanceof NetSession
        ? iconButton(
            'team',
            'Friends',
            () => this.showFriends(() => this.pause(true, 'back')),
            'btn secondary',
          )
        : null,
      iconButton(
        'quit',
        this.afterGame ? 'Back to the Map Maker' : 'Quit to title',
        () => this.quitToTitle(),
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
        { class: 'screen interactive pause flow-screen' },
        h('h2', { class: 'pause-title' }, this.isOffline() ? 'Paused' : 'Menu'),
        board,
        s instanceof NetSession ? this.roomPeople(s.core) : null,
        menu,
        s instanceof NetSession ? netPanel(s.core, this.netSim) : null,
      ),
      dir,
    );
  }

  isOffline(): boolean {
    return this.client?.session instanceof LocalSession;
  }

  private onAction(a: string): void {
    if (a === 'tuning' && this.tuning && this.client) {
      const open = this.tuning.toggle();
      if (open) document.exitPointerLock?.();
      else if (!this.mobile) void this.input.lockPointer();
    }
  }
}
