// Online menus: nickname, create a private room (mode/map/bots) or join one by code.
import type { GameMode, NetCore } from '@space-yz/shared';
import { MAPS } from '@space-yz/shared';
import { h, button, slider } from './menus';

export interface OnlineMenuHandlers {
  getName(): string;
  setName(n: string): void;
  create(mode: GameMode, map: string, bots: number, skill: string): void;
  join(code: string): void;
  back(): void;
  status(): { text: string; ok: boolean | null };
  extra?: HTMLElement[];
}

export const onlineMenu = (hd: OnlineMenuHandlers, prefillCode = ''): HTMLElement => {
  const nameInput = h('input', {
    type: 'text',
    maxlength: '16',
    placeholder: 'Your nickname',
    value: hd.getName(),
  });
  nameInput.addEventListener('change', () => hd.setName(nameInput.value));
  let mode: GameMode = '1v1';
  let map = MAPS.find((m) => m.competitive)?.id ?? MAPS[0].id;
  let bots = false;
  let skill = 'normal';
  const modeRow = h('div', { class: 'choice-row' });
  const mapSel = h('select', {});
  for (const m of MAPS) {
    const o = h('option', { value: m.id }, m.name);
    if (m.id === map) o.selected = true;
    mapSel.append(o);
  }
  mapSel.addEventListener('change', () => (map = mapSel.value));
  const botsBox = h('input', { type: 'checkbox' });
  botsBox.addEventListener('change', () => (bots = botsBox.checked));
  const skillSel = h('select', {});
  for (const s of ['easy', 'normal', 'hard']) {
    const o = h('option', { value: s }, `${s} bots`);
    if (s === skill) o.selected = true;
    skillSel.append(o);
  }
  skillSel.addEventListener('change', () => (skill = skillSel.value));
  const renderModes = () =>
    modeRow.replaceChildren(
      ...(['1v1', '2v2', '5v5'] as const).map((m) =>
        button(
          m,
          () => {
            mode = m;
            renderModes();
          },
          `btn small ${mode === m ? '' : 'secondary'}`,
        ),
      ),
    );
  renderModes();
  const codeInput = h('input', {
    type: 'text',
    maxlength: '6',
    placeholder: 'ABC123',
    value: prefillCode,
    class: 'code-input',
  });
  const status = h('div', { class: 'status' });
  const refresh = () => {
    const s = hd.status();
    status.replaceChildren(
      h('span', { class: `dot ${s.ok === null ? '' : s.ok ? 'ok' : 'bad'}` }),
      s.text,
    );
  };
  refresh();
  const timer = window.setInterval(() => {
    if (!status.isConnected) window.clearInterval(timer);
    else refresh();
  }, 300);
  const size: Record<GameMode, number> = { '1v1': 2, '2v2': 4, '5v5': 10, practice: 2 };
  return h(
    'div',
    { class: 'screen interactive' },
    h('h2', {}, 'Play online'),
    h(
      'div',
      { class: 'panel online-panel' },
      h(
        'label',
        { class: 'setting' },
        h('span', { class: 'setting-label' }, 'Nickname'),
        nameInput,
      ),
      h(
        'div',
        { class: 'online-cols' },
        h(
          'div',
          { class: 'online-col' },
          h('div', { class: 'label' }, 'Create a private room'),
          modeRow,
          h('label', { class: 'setting' }, h('span', { class: 'setting-label' }, 'Map'), mapSel),
          h(
            'label',
            { class: 'setting' },
            h('span', { class: 'setting-label' }, 'Fill empty slots with bots'),
            botsBox,
          ),
          h(
            'label',
            { class: 'setting' },
            h('span', { class: 'setting-label' }, 'Bot difficulty'),
            skillSel,
          ),
          button('Create room', () => {
            hd.setName(nameInput.value);
            hd.create(mode, map, bots ? size[mode] - 1 : 0, skill);
          }),
        ),
        h(
          'div',
          { class: 'online-col' },
          h('div', { class: 'label' }, 'Join a friend'),
          codeInput,
          button(
            'Join room',
            () => {
              hd.setName(nameInput.value);
              hd.join(codeInput.value.trim().toUpperCase());
            },
            'btn orange',
          ),
          ...(hd.extra ?? []),
        ),
      ),
      status,
    ),
    button('Back', hd.back, 'btn secondary'),
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
