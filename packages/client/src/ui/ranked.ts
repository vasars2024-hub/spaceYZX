// Ranked UI: queue panel (in the online menu), leaderboards and the player profile with the
// "login code" for moving an account to another PC. Names are always rendered as text.
import type { NetCore, RoomMode } from '@space-yz/shared';
import { h, button } from './menus';
import { icon } from './icons';
import { rankedQueues } from './flow';
import { card, iconButton, screenHead } from './menu-kit';

interface Tier {
  label: string;
  color: string;
  isGalaxy: boolean;
}
interface ModeInfo {
  rating: number;
  games: number;
  wins: number;
  tier: Tier;
  position: number | null;
}
export interface ClientProfile {
  id: number;
  name: string;
  /** 'arena': the Arena 1v1 ladder (its own rating and ranks, not in the global rank) */
  modes: Partial<Record<'1v1' | '2v2' | '5v5' | 'arena', ModeInfo>>;
  global: { rating: number | null; tier: Tier; position: number | null };
  recent: {
    mode: string;
    ranked: boolean;
    won: boolean | null;
    /** arena: final place */
    place?: number | null;
    delta: number;
    kills: number;
    deaths: number;
    at: number;
  }[];
  bannedUntil?: number | null;
}

const MODES = ['1v1', '2v2', '5v5', 'arena'] as const;
const MODE_LABEL: Record<(typeof MODES)[number], string> = {
  '1v1': '1v1',
  '2v2': '2v2',
  '5v5': '5v5',
  arena: 'Arena',
};

const tierBadge = (t: Tier | undefined): HTMLElement =>
  h(
    'span',
    { class: `tier${t?.isGalaxy ? ' galaxy' : ''}`, style: `color:${t?.color ?? '#9aa'}` },
    t?.label ?? 'Unranked',
  );

const fmtWait = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** A mode's rank line for a queue card ("Gold II · 1540", or "Unranked"). */
const rankInfo = (p: ClientProfile | null, mode: string): ModeInfo | undefined =>
  (p?.modes as Record<string, ModeInfo | undefined> | undefined)?.[mode];

export interface RankedScreenHandlers {
  /** called before queueing (sends a changed nickname first) */
  beforeQueue(): void;
  back(): void;
  status(): { text: string; ok: boolean | null };
}

/** Ranked: one card per queue with your rank there; pick one to search for a match. */
export const rankedScreen = (core: NetCore, hd: RankedScreenHandlers): HTMLElement => {
  const global = h('div', { class: 'rank-global' });
  const grid = h('div', { class: 'card-grid queues' });
  const status = h('div', { class: 'queue-status' });
  const conn = h('div', { class: 'status' });
  const cancel = iconButton(
    'back',
    'Cancel search',
    () => core.queueRanked(null),
    'btn small secondary cancel-btn',
  );
  const queues = rankedQueues();
  // the Arena has a queue per kit on the same ladder: remember which one we joined
  let kit: string | undefined;
  const isQueued = (q: (typeof queues)[number]) =>
    core.queue.mode === q.mode && (q.loadout === undefined || q.loadout === (kit ?? 'lethal'));
  const cards = queues.map((q) => {
    const tag = h('span', { class: 'queue-rank' });
    const c = card({
      title: q.name,
      desc: q.desc,
      art: icon(q.icon),
      cls: `queue queue-${q.mode}`,
      onClick: () => {
        if (isQueued(q)) return; // already searching this one
        hd.beforeQueue();
        kit = q.loadout;
        core.queueRanked(q.mode as RoomMode, q.loadout);
      },
    });
    c.querySelector('.card-body')?.append(tag);
    c.style.setProperty('--i', String(queues.indexOf(q)));
    return { q, c, tag };
  });
  grid.append(...cards.map((x) => x.c));
  let last = '';
  const render = () => {
    const p = core.account as ClientProfile | null;
    const q = core.queue;
    const key = JSON.stringify([p?.global, p?.modes, q.mode, q.error, q.waitSec, q.searching, kit]);
    const st = hd.status();
    conn.replaceChildren(
      h('span', { class: `dot ${st.ok === null ? '' : st.ok ? 'ok' : 'bad'}` }),
      st.text,
    );
    if (key === last) return;
    last = key;
    global.replaceChildren(
      h('span', { class: 'rank-mode' }, 'Global rank'),
      tierBadge(p?.global.tier),
      h('span', { class: 'rank-rating' }, p?.global.rating ? `${p.global.rating}` : ''),
    );
    for (const { q: queue, c, tag } of cards) {
      const i = rankInfo(p, queue.mode);
      tag.replaceChildren(
        tierBadge(i?.tier),
        h('span', { class: 'rank-rating' }, i ? `${i.rating} · ${i.wins}/${i.games} won` : ''),
      );
      const searching = isQueued(queue);
      c.classList.toggle('selected', searching);
      c.classList.toggle('searching', searching);
      c.disabled = !!q.mode && !searching;
    }
    if (q.mode) {
      const name = queues.find(isQueued)?.name ?? q.mode;
      status.textContent = `Searching ${name} · ${fmtWait(q.waitSec)} · ${q.searching} searching`;
      status.className = 'queue-status active';
      cancel.hidden = false;
    } else {
      status.textContent = q.error ?? 'Matched by rating. Leaving a ranked match counts as a loss.';
      status.className = `queue-status${q.error ? ' error' : ''}`;
      cancel.hidden = true;
    }
  };
  render();
  const timer = window.setInterval(() => {
    if (!status.isConnected) window.clearInterval(timer);
    else render();
  }, 300);
  return h(
    'div',
    { class: 'screen interactive flow-screen ranked-flow' },
    screenHead('ranked', 'Ranked', hd.back),
    global,
    grid,
    h('div', { class: 'queue-row' }, status, cancel),
    conn,
  );
};

/** Leaderboards: global and per mode, from the server's JSON API. */
export const leaderboardScreen = (back: () => void, myId: number | null): HTMLElement => {
  let which: 'global' | (typeof MODES)[number] = 'global';
  const tabs = h('div', { class: 'choice-row' });
  const table = h('div', { class: 'leaderboard' }, 'Loading…');
  const load = async () => {
    tabs.replaceChildren(
      ...(['global', ...MODES] as const).map((m) =>
        button(
          m === 'global' ? 'Global' : MODE_LABEL[m],
          () => {
            which = m;
            void load();
          },
          `btn small ${which === m ? '' : 'secondary'}`,
        ),
      ),
    );
    table.textContent = 'Loading…';
    try {
      const res = await fetch(`/api/leaderboard?mode=${which}&limit=100`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        rows: {
          position: number;
          playerId: number;
          name: string;
          rating: number;
          games: number;
          tier: Tier;
        }[];
      };
      if (!data.rows.length) {
        table.textContent = 'No ranked players yet — play 5 ranked matches to appear here.';
        return;
      }
      table.replaceChildren(
        h(
          'table',
          {},
          h('tr', {}, ...['#', 'Player', 'Rank', 'Rating', 'Games'].map((x) => h('th', {}, x))),
          ...data.rows.map((r) =>
            h(
              'tr',
              { class: r.playerId === myId ? 'me' : '' },
              h('td', {}, String(r.position)),
              h('td', {}, r.name),
              h('td', {}, tierBadge(r.tier)),
              h('td', {}, String(r.rating)),
              h('td', {}, String(r.games)),
            ),
          ),
        ),
      );
    } catch {
      table.textContent = 'Leaderboards need the game server (not available offline).';
    }
  };
  void load();
  return h(
    'div',
    { class: 'screen interactive flow-screen' },
    screenHead('leaderboard', 'Leaderboards', back),
    h('div', { class: 'panel wide-panel' }, tabs, table),
  );
};

/** Your profile: ranks, recent matches and the login code. */
export const profileScreen = (
  core: NetCore,
  back: () => void,
  useCode: (code: string) => void,
): HTMLElement => {
  core.sendJson({ t: 'profile' });
  const body = h('div', {});
  const render = () => {
    const p = core.account as ClientProfile | null;
    if (!p) {
      body.textContent = core.state === 'closed' ? 'Not connected to the game server.' : 'Loading…';
      return;
    }
    const parts: (Node | null)[] = [
      h('div', { class: 'profile-name' }, p.name),
      h(
        'div',
        { class: 'rank-list' },
        ...MODES.map((m) => {
          const i = p.modes[m];
          return h(
            'div',
            { class: 'rank-row' },
            h('span', { class: 'rank-mode' }, MODE_LABEL[m]),
            tierBadge(i?.tier),
            h(
              'span',
              { class: 'rank-rating' },
              i
                ? `${i.rating} · ${i.wins}/${i.games} won${i.position ? ` · #${i.position}` : ''}`
                : 'no games',
            ),
          );
        }),
        h(
          'div',
          { class: 'rank-row global' },
          h('span', { class: 'rank-mode' }, 'Global'),
          tierBadge(p.global.tier),
          h(
            'span',
            { class: 'rank-rating' },
            p.global.rating
              ? `${p.global.rating}${p.global.position ? ` · #${p.global.position}` : ''}`
              : '',
          ),
        ),
      ),
      p.bannedUntil
        ? h(
            'div',
            { class: 'queue-status error' },
            `Ranked ban until ${new Date(p.bannedUntil).toLocaleString()}`,
          )
        : null,
      h('div', { class: 'label' }, 'Recent matches'),
      p.recent.length
        ? h(
            'table',
            { class: 'recent' },
            ...p.recent.map((r) =>
              h(
                'tr',
                {},
                h('td', {}, `${r.mode}${r.ranked ? ' ranked' : ''}`),
                h(
                  'td',
                  { class: r.won ? 'win' : r.won === false ? 'loss' : '' },
                  r.place ? `#${r.place}` : r.won ? 'Win' : r.won === false ? 'Loss' : 'Draw',
                ),
                h('td', {}, `${r.kills}/${r.deaths}`),
                h('td', {}, r.ranked ? `${r.delta >= 0 ? '+' : ''}${r.delta}` : ''),
              ),
            ),
          )
        : h('div', {}, 'No matches yet.'),
    ];
    body.replaceChildren(...parts.filter((x): x is Node => x !== null));
  };
  render();
  const timer = window.setInterval(() => {
    if (!body.isConnected) window.clearInterval(timer);
    else render();
  }, 500);
  const codeOut = h('input', {
    type: 'password',
    readonly: 'readonly',
    value: core.token ?? '',
    class: 'login-code',
  });
  const codeIn = h('input', {
    type: 'text',
    placeholder: 'Paste a login code',
    class: 'login-code',
  });
  return h(
    'div',
    { class: 'screen interactive flow-screen' },
    screenHead('profile', 'Your profile', back),
    h(
      'div',
      { class: 'panel wide-panel' },
      body,
      h(
        'div',
        { class: 'label' },
        'Login code — keep it secret. Use it to play as you on another PC.',
      ),
      h(
        'div',
        { class: 'choice-row' },
        codeOut,
        button(
          'Copy my login code',
          () => {
            void navigator.clipboard?.writeText(core.token ?? '');
          },
          'btn small',
        ),
      ),
      h(
        'div',
        { class: 'choice-row' },
        codeIn,
        button(
          'Use this code',
          () => {
            const c = codeIn.value.trim();
            if (/^syz_[A-Za-z0-9_-]{20,64}$/.test(c)) useCode(c);
            else codeIn.value = '';
          },
          'btn small orange',
        ),
      ),
    ),
  );
};
