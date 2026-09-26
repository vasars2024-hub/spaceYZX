// Online menus: nickname and connection on top, then tabs: Create room (in steps: objective →
// map → room size + bots) or Join by code. Also the in-game room panel and network panel.
import type { BotSkillName, NetCore, RoomMode } from '@space-yz/shared';
import { BOT_SKILL_LABELS, getMap } from '@space-yz/shared';
import { h, slider } from './menus';
import { icon, botBadge } from './icons';
import {
  ARENA_ROOM_SIZES,
  ROOM_OBJECTIVES,
  ROOM_SIZES,
  ROOM_STEPS,
  ROOM_STEP_LABELS,
  botSkillChoices,
  initialRoom,
  isArenaObjective,
  pickRoomMap,
  pickRoomObjective,
  roomBack,
  roomCreateArgs,
  roomMaps,
  type RoomSize,
  type RoomState,
} from './flow';
import {
  card,
  crumbs,
  iconButton,
  mapCard,
  mapMini,
  pickGrid,
  screenHead,
  segTabs,
  stepPanel,
  sumItem,
  swapStage,
  type Dir,
} from './menu-kit';

export interface OnlineMenuHandlers {
  getName(): string;
  setName(n: string): void;
  create(
    /** 'arena': an Arena 1v1 room */
    mode: RoomMode,
    map: string,
    bots: number,
    skill: BotSkillName,
    objective: 'tower' | 'bomb',
    /** 'cs': CS mode (AK + Deagle, bomb rules, half-speed movement) */
    loadout: 'lethal' | 'cs',
  ): void;
  join(code: string): void;
  back(): void;
  status(): { text: string; ok: boolean | null };
  /** the room choices, kept between visits (default: a fresh 1v1 Tower room) */
  room?: RoomState;
  extra?: HTMLElement[];
  /** extra panels shown under Join (kept for plug-ins) */
  columns?: HTMLElement[];
}

const SIZE_DESC: Record<RoomSize, string> = {
  '1v1': 'A duel: you and one friend.',
  '2v2': 'Two teams of two.',
  '5v5': 'Full teams of five.',
};

export const onlineMenu = (hd: OnlineMenuHandlers, prefillCode = ''): HTMLElement => {
  const nameInput = h('input', {
    type: 'text',
    maxlength: '16',
    placeholder: 'Your nickname',
    value: hd.getName(),
    class: 'name-input',
    'aria-label': 'Nickname',
  });
  nameInput.addEventListener('change', () => hd.setName(nameInput.value));
  const room = hd.room ?? initialRoom();
  let s: RoomState = { ...room, step: 'objective' };
  let tab: 'create' | 'join' = prefillCode ? 'join' : 'create';

  const status = h('div', { class: 'status' });
  const refresh = () => {
    const st = hd.status();
    status.replaceChildren(
      h('span', { class: `dot ${st.ok === null ? '' : st.ok ? 'ok' : 'bad'}` }),
      st.text,
    );
  };
  refresh();
  const timer = window.setInterval(() => {
    if (!status.isConnected) window.clearInterval(timer);
    else refresh();
  }, 300);

  // ---- join by code
  const codeInput = h('input', {
    type: 'text',
    maxlength: '6',
    placeholder: 'ABC123',
    value: prefillCode,
    class: 'code-input',
    'aria-label': 'Room code',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const join = () => {
    hd.setName(nameInput.value);
    hd.join(codeInput.value.trim().toUpperCase());
  };
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') join();
  });
  const joinPanel = h(
    'section',
    { class: 'step join-panel' },
    h('span', { class: 'join-art' }, icon('key')),
    h('h3', { class: 'step-title' }, 'Room code from your friend'),
    codeInput,
    iconButton('next', 'Join room', join, 'btn orange join-btn'),
    h('p', { class: 'hint' }, 'Or just open the invite link they sent you.'),
    ...(hd.extra ?? []),
    ...(hd.columns ?? []),
  );

  // ---- create a room, in steps
  const crumbBox = h('div', { class: 'crumb-box' });
  const stepStage = h('div', { class: 'stage' });
  const summary = h('div', { class: 'summary-bar' });
  const keep = () => Object.assign(room, s);
  const go = (next: RoomState, dir: Dir) => {
    s = next;
    keep();
    renderCreate(dir);
  };
  const create = () => {
    hd.setName(nameInput.value);
    const a = roomCreateArgs(s);
    hd.create(a.mode, a.map, a.bots, a.skill, a.objective, a.loadout);
  };

  const objectiveStep = () =>
    stepPanel(
      'Objective',
      pickGrid(
        'modes',
        ROOM_OBJECTIVES,
        (o) => o.id === s.objective,
        (o, selected, pick) =>
          card({
            title: o.name,
            desc: o.desc,
            art: icon(o.icon),
            selected,
            cls: `mode mode-${o.id}`,
            onClick: pick,
          }),
        (o) => go(pickRoomObjective(s, o.id), 'forward'),
      ),
    );

  const mapStep = () => {
    const { best, other } = roomMaps(s.objective);
    const pick = (id: string) => go(pickRoomMap(s, id), 'forward');
    return stepPanel(
      'Map',
      pickGrid(
        'maps',
        best,
        (m) => m.id === s.map,
        (m, selected, p) => mapCard(m.id, selected, p),
        (m) => pick(m.id),
      ),
      other.length
        ? h('h3', { class: 'step-title' }, 'Other maps (no objective for this mode)')
        : null,
      other.length
        ? pickGrid(
            'maps small-maps',
            other,
            (m) => m.id === s.map,
            (m, selected, p) => mapCard(m.id, selected, p),
            (m) => pick(m.id),
          )
        : null,
    );
  };

  const roomStep = () => {
    const skillGrid = pickGrid(
      `bots${s.bots ? '' : ' off'}`,
      botSkillChoices(),
      (b) => b.id === s.skill,
      (b, selected, p) =>
        card({
          title: b.name,
          desc: b.desc,
          art: botBadge(b.id),
          selected,
          cls: `bot bot-${b.id}`,
          onClick: p,
        }),
      (b) => {
        s = { ...s, skill: b.id, bots: true };
        keep();
        syncBots();
        renderSummary();
      },
    );
    const botsCard = card({
      title: 'Fill empty slots with bots',
      desc: 'Bots play until friends join and take their place.',
      art: icon('bot'),
      selected: s.bots,
      cls: 'toggle bots-toggle',
      onClick: () => {
        s = { ...s, bots: !s.bots };
        keep();
        syncBots();
        renderSummary();
      },
    });
    const syncBots = () => {
      botsCard.classList.toggle('selected', s.bots);
      botsCard.setAttribute('aria-pressed', String(s.bots));
      skillGrid.classList.toggle('off', !s.bots);
    };
    return stepPanel(
      'Room size',
      pickGrid(
        'compact sizes',
        ROOM_SIZES,
        (z) => z === s.size,
        (z, selected, p) =>
          card({
            // (Arena rooms: how many players in all, each duel is 1v1)
            title: isArenaObjective(s.objective) ? ARENA_ROOM_SIZES[z].label : z,
            desc: isArenaObjective(s.objective) ? ARENA_ROOM_SIZES[z].desc : SIZE_DESC[z],
            art: icon(z === '1v1' ? 'profile' : 'team'),
            selected,
            cls: 'size',
            onClick: p,
          }),
        (z) => {
          s = { ...s, size: z };
          keep();
          renderSummary();
        },
      ),
      h('h3', { class: 'step-title' }, 'Bots'),
      h('div', { class: 'card-grid toggles' }, botsCard),
      skillGrid,
    );
  };

  const renderSummary = () => {
    const o = ROOM_OBJECTIVES.find((x) => x.id === s.objective) ?? ROOM_OBJECTIVES[0];
    summary.replaceChildren(
      sumItem(icon(o.icon), o.name),
      sumItem(mapMini(s.map), getMap(s.map).name, 'sum-map'),
      sumItem(
        icon(s.size === '1v1' ? 'profile' : 'team'),
        isArenaObjective(s.objective) ? ARENA_ROOM_SIZES[s.size].label : s.size,
      ),
      sumItem(
        s.bots ? botBadge(s.skill) : icon('bot'),
        s.bots ? `${BOT_SKILL_LABELS[s.skill]} bots` : 'No bots',
      ),
      h('span', { class: 'spacer' }),
      s.step === 'room'
        ? iconButton('plus', 'Create room', create, 'btn primary create-btn')
        : iconButton(
            'next',
            'Next',
            () =>
              go(
                s.step === 'objective' ? pickRoomObjective(s, s.objective) : pickRoomMap(s, s.map),
                'forward',
              ),
            'btn next-btn',
          ),
    );
  };

  const renderCreate = (dir: Dir) => {
    const at = ROOM_STEPS.indexOf(s.step);
    crumbBox.replaceChildren(
      crumbs(
        ROOM_STEPS.map((st, i) => ({
          label: ROOM_STEP_LABELS[st],
          state: i < at ? 'done' : i === at ? 'current' : 'todo',
          onClick: () => go({ ...s, step: st }, 'back'),
        })),
      ),
    );
    swapStage(
      stepStage,
      s.step === 'objective' ? objectiveStep() : s.step === 'map' ? mapStep() : roomStep(),
      dir,
    );
    renderSummary();
  };
  const createPanel = h('div', { class: 'create-panel' }, crumbBox, stepStage, summary);
  renderCreate('none');

  // ---- tabs: Create room | Join by code
  const tabBox = h('div', { class: 'tab-box' });
  const tabStage = h('div', { class: 'stage' });
  const renderTab = (dir: Dir) => {
    tabBox.replaceChildren(
      segTabs(
        [
          { id: 'create', label: 'Create room', icon: 'plus' },
          { id: 'join', label: 'Join by code', icon: 'key' },
        ],
        tab,
        (t) => {
          if (t === tab) return;
          tab = t;
          renderTab(t === 'join' ? 'forward' : 'back');
        },
      ),
    );
    // (the panels are kept, so a half-typed code or a chosen step survives switching tabs)
    swapStage(tabStage, tab === 'create' ? createPanel : joinPanel, dir);
    if (tab === 'join' && dir !== 'none') requestAnimationFrame(() => codeInput.focus());
  };
  renderTab('none');

  const back = () => {
    const prev = tab === 'create' ? roomBack(s) : null;
    if (prev) go(prev, 'back');
    else hd.back();
  };

  return h(
    'div',
    { class: 'screen interactive flow-screen online-flow' },
    screenHead('online', 'Play online', back),
    h(
      'div',
      { class: 'online-top' },
      h('label', { class: 'name-field' }, icon('profile'), nameInput),
      status,
    ),
    tabBox,
    tabStage,
  );
};

/** Small in-game panel with the room code and players (top center). */
export class RoomPanel {
  el: HTMLDivElement;
  constructor(
    parent: HTMLElement,
    private core: NetCore,
  ) {
    this.el = h('div', { class: 'room-panel' });
    parent.append(this.el);
  }
  update(): void {
    const link = `${location.origin}/?join=${this.core.code}`;
    const players = this.core.roster
      .map(
        (p) =>
          `${p.team === 0 ? '◆' : '◇'} ${p.name}${p.bot ? ' (bot)' : ''} ${p.bot ? '' : p.ping + 'ms'}`,
      )
      .join('   ');
    this.el.textContent = `ROOM ${this.core.code}${this.core.ranked ? ' · RANKED' : ''} · invite: ${link}\n${players}`;
  }
  dispose(): void {
    this.el.remove();
  }
}

/** Network simulator (dev) + live connection stats, shown in the in-game menu online. */
export const netPanel = (
  core: NetCore,
  sim: { delayMs: number; jitterMs: number; lossPct: number },
): HTMLElement => {
  const stats = h('div', { class: 'net-stats' });
  let bytes = core.bytesIn;
  let snaps = core.snapshotsIn;
  let corr = core.corrections;
  let t0 = performance.now();
  const refresh = () => {
    const now = performance.now();
    const dt = Math.max(0.001, (now - t0) / 1000);
    stats.textContent =
      `Ping ${Math.round(core.rttMs)} ms · jitter ${Math.round(core.jitterMs)} ms · ` +
      `input delay ${core.inputDelay} tick(s) · interpolation ${core.interpTicks.toFixed(1)} ticks\n` +
      `Download ${((core.bytesIn - bytes) / 1024 / dt).toFixed(1)} KB/s · ` +
      `${Math.round((core.snapshotsIn - snaps) / dt)} snapshots/s · ` +
      `${((core.corrections - corr) / dt).toFixed(1)} corrections/s · lead ${core.lastLead} ticks`;
    bytes = core.bytesIn;
    snaps = core.snapshotsIn;
    corr = core.corrections;
    t0 = now;
  };
  refresh();
  const timer = window.setInterval(() => {
    if (!stats.isConnected) window.clearInterval(timer);
    else refresh();
  }, 1000);
  return h(
    'details',
    { class: 'panel net-panel' },
    h('summary', {}, 'Network (stats & simulator)'),
    stats,
    h('div', { class: 'label' }, 'Simulate a worse connection (only affects you):'),
    slider(
      'Extra ping',
      0,
      300,
      10,
      sim.delayMs,
      (v) => `${v} ms`,
      (v) => (sim.delayMs = v),
    ),
    slider(
      'Jitter',
      0,
      60,
      2,
      sim.jitterMs,
      (v) => `±${v} ms`,
      (v) => (sim.jitterMs = v),
    ),
    slider(
      'Packet loss',
      0,
      10,
      0.5,
      sim.lossPct,
      (v) => `${v}%`,
      (v) => (sim.lossPct = v),
    ),
  );
};
