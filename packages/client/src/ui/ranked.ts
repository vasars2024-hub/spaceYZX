// Ranked UI: the ranked screen (Premier, Duels and Race cards, the Premier map veto),
// leaderboards (ladders and race track times) and the player profile with the "login code" for
// moving an account to another PC. Names are always rendered as text. The ladders come from
// shared rating/ladders.ts (ui/flow.ts cards).
import type { LadderId, NetCore, RankedInfo, VetoView } from '@space-yz/shared';
import { formatRaceTime, getMap, LADDER_IDS, LADDERS, mapDef, raceMaps } from '@space-yz/shared';
import { h, button } from './menus';
import { icon } from './icons';
import {
  countdown,
  rankedCards,
  rankedQueueName,
  standingText,
  type LadderStandingView,
} from './flow';
import { iconButton, mapCard, screenHead } from './menu-kit';

interface Rank {
  label: string;
  color: string;
  top?: boolean;
}
interface Standing extends LadderStandingView {
  ladder: LadderId;
  name: string;
  games: number;
  wins: number;
  position: number | null;
}
export interface ClientProfile {
  id: number;
  name: string;
  season: number;
  ladders: Partial<Record<LadderId, Standing>>;
  pastSeasons?: { season: number; ladder?: LadderId; rating: number | null; rank: Rank | null }[];
  /** your best time per race track (null: none yet) and your place on its board */
  raceBests?: { track: string; timeMs: number | null; position: number | null }[];
  recentRaces?: {
    track: string;
    ranked: boolean;
    place: number;
    racers: number;
    timeMs: number | null;
    delta: number;
    at: number;
  }[];
  recent: {
    mode: string;
    ladder: LadderId | null;
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

const rankBadge = (r: Rank | null | undefined, fallback = 'Placement'): HTMLElement =>
  h(
    'span',
    { class: `tier${r?.top ? ' galaxy' : ''}`, style: `color:${r?.color ?? '#9aa6b8'}` },
    r?.label ?? fallback,
  );

const fmtWait = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Seconds still left of a server count that arrived `at` (ms, core clock). */
const left = (sec: number | null, at: number): number | null =>
  sec === null ? null : sec - (performance.now() - at) / 1000;

export interface RankedScreenHandlers {
  /** called before queueing (sends a changed nickname first) */
  beforeQueue(): void;
  back(): void;
  status(): { text: string; ok: boolean | null };
}

/** The Premier map veto: a card per map, banned ones crossed out, whose turn, the timer. */
const vetoPanel = (core: NetCore, v: VetoView): { el: HTMLElement; timer: HTMLElement } => {
  const mine = v.turn === v.yourTeam;
  const timer = h('span', { class: 'veto-timer' });
  const grid = h('div', { class: 'card-grid maps veto-grid' });
  for (const id of v.maps) {
    const ban = v.banned.find((b) => b.map === id);
    const picked = v.picked === id;
    const c = mapCard(id, picked, () => {
      if (!ban && mine && !v.picked) core.vetoBan(id);
    });
    c.classList.add('veto-map');
    if (ban) {
      c.classList.add('banned');
      c.append(
        h(
          'span',
          { class: 'veto-mark' },
          `Banned by ${ban.team === v.yourTeam ? 'your team' : 'enemy'}${ban.auto ? ' (time)' : ''}`,
        ),
      );
    }
    c.disabled = !!ban || !mine || !!v.picked;
    grid.append(c);
  }
  const names = (t: 0 | 1) => v.teams[t].join(', ');
  const el = h(
    'div',
    { class: 'veto' },
    h(
      'div',
      { class: 'veto-head' },
      h('span', { class: 'veto-title' }, `Map veto · Premier ${v.teamSize}v${v.teamSize}`),
      h(
        'span',
        { class: `veto-turn${mine ? ' mine' : ''}` },
        v.picked
          ? `Playing ${mapDef(v.picked).name}`
          : mine
            ? 'Your team bans a map'
            : 'The enemy team is banning',
      ),
      timer,
    ),
    h(
      'div',
      { class: 'veto-teams' },
      h('span', {}, `Your team: ${names(v.yourTeam)}`),
      h('span', {}, `Enemy: ${names(v.yourTeam === 0 ? 1 : 0)}`),
    ),
    grid,
    h(
      'div',
      { class: 'queue-status' },
      'Teams take turns banning; any player can ban for the team. If time runs out, a random map is banned. The last map is played.',
    ),
  );
  return { el, timer };
};

/** The race tracks with your best time on each (the Race card). */
const raceTrackList = (p: ClientProfile | null): HTMLElement =>
  h(
    'div',
    { class: 'race-tracks' },
    ...raceMaps().map((m) => {
      const b = p?.raceBests?.find((x) => x.track === m.id);
      return h(
        'div',
        { class: 'race-track-row' },
        h('span', {}, m.name),
        h(
          'span',
          { class: 'rank-rating' },
          b?.timeMs
            ? `${formatRaceTime(b.timeMs)}${b.position ? ` · #${b.position}` : ''}`
            : 'no time yet',
        ),
      );
    }),
  );

/** Premier's opening hours in words for its card ('' = always open). */
const hoursLine = (info: RankedInfo | null, at: number): { text: string; closed: boolean } => {
  if (!info) return { text: '', closed: false };
  const p = info.premier;
  if (!p.open) {
    const s = left(p.opensInSec, at);
    return {
      text:
        s === null
          ? 'Premier is closed for now.'
          : `Premier opens in ${countdown(s)}${p.hours ? ` · ${p.hours}` : ''}`,
      closed: true,
    };
  }
  const s = left(p.closesInSec, at);
  return {
    text: s === null ? '' : `Open now · closes in ${countdown(s)}${p.hours ? ` · ${p.hours}` : ''}`,
    closed: false,
  };
};

/** Ranked: a card per ladder (Premier, Duels) with its rating and a button per queue. */
export const rankedScreen = (core: NetCore, hd: RankedScreenHandlers): HTMLElement => {
  const season = h('div', { class: 'rank-global' });
  const stage = h('div', { class: 'ranked-stage' });
  const status = h('div', { class: 'queue-status' });
  const conn = h('div', { class: 'status' });
  const cancel = iconButton(
    'back',
    'Cancel search',
    () => core.queueRanked(null),
    'btn small secondary cancel-btn',
  );
  core.sendJson({ t: 'profile' }); // fresh ratings, season and Premier hours
  let lastAsk = performance.now();
  let hoursEl: HTMLElement | null = null;
  let vetoTimer: HTMLElement | null = null;

  const ladderCards = (): HTMLElement => {
    const p = core.account as ClientProfile | null;
    const q = core.queue;
    const grid = h('div', { class: 'card-grid queues ladders' });
    rankedCards().forEach((c, i) => {
      const st = p?.ladders?.[c.ladder];
      const def = LADDERS[c.ladder];
      const color = st?.rank?.color ?? '#9aa6b8';
      const hours = c.ladder === 'premier' ? hoursLine(core.rankedInfo, core.rankedInfoAt) : null;
      const buttons = c.queues.map((qd) => {
        const searching = q.mode === qd.id;
        const b = button(
          searching ? `Searching ${qd.label === 'Find match' ? '' : qd.label}`.trim() : qd.label,
          () => {
            if (q.mode === qd.id) return;
            hd.beforeQueue();
            core.queueRanked(qd.id);
          },
          `btn${searching ? '' : q.mode ? ' secondary' : ''}`,
        );
        b.disabled = (!!q.mode && !searching) || !!hours?.closed;
        return b;
      });
      const hoursText = h('div', { class: `ladder-hours${hours?.closed ? ' closed' : ''}` });
      hoursText.textContent = hours?.text ?? '';
      if (hours) hoursEl = hoursText;
      const card = h(
        'div',
        {
          class: `card queue ladder-card ladder-${c.ladder}${q.mode && c.queues.some((x) => x.id === q.mode) ? ' selected searching' : ''}`,
          style: `--i:${i}`,
        },
        h('span', { class: 'card-art' }, icon(c.icon)),
        h(
          'span',
          { class: 'card-body' },
          h('span', { class: 'card-title' }, c.name),
          h('span', { class: 'card-desc' }, c.desc),
        ),
        h(
          'div',
          { class: 'ladder-rank' },
          h(
            'span',
            { class: 'ladder-rating', style: `color:${color}` },
            st?.rating !== null && st?.rating !== undefined ? String(st.rating) : '—',
          ),
          h(
            'span',
            { class: 'ladder-sub' },
            st?.rating === null || !st
              ? standingText(st) || `Placement 0/${def.placement.count} ${def.placement.unit}`
              : st.rank?.label,
            st?.position ? ` · #${st.position}` : '',
          ),
        ),
        def.hideWhilePlacing && st && st.rating === null
          ? h(
              'div',
              { class: 'placement-bar' },
              h('span', {
                style: `width:${(100 * st.placement.done) / Math.max(1, st.placement.need)}%`,
              }),
            )
          : null,
        def.seasonal ? h('div', { class: 'ladder-season' }, `Season ${p?.season ?? 1}`) : null,
        hours ? hoursText : null,
        c.ladder === 'race' ? raceTrackList(p) : null,
        h('div', { class: 'ladder-buttons' }, ...buttons),
      );
      grid.append(card);
    });
    return grid;
  };

  /** countdowns tick without rebuilding the cards */
  const tickTexts = (): void => {
    const v = core.veto;
    if (hoursEl) hoursEl.textContent = hoursLine(core.rankedInfo, core.rankedInfoAt).text;
    if (v && vetoTimer)
      vetoTimer.textContent = v.picked
        ? ''
        : `${Math.max(0, Math.ceil(v.secondsLeft - (performance.now() - core.vetoAt) / 1000))} s`;
  };

  let last = '';
  const render = () => {
    const p = core.account as ClientProfile | null;
    const q = core.queue;
    const v = core.veto;
    const info = core.rankedInfo;
    const st = hd.status();
    conn.replaceChildren(
      h('span', { class: `dot ${st.ok === null ? '' : st.ok ? 'ok' : 'bad'}` }),
      st.text,
    );
    tickTexts();
    const hours = hoursLine(info, core.rankedInfoAt);
    // Premier just opened / closed: ask the server again (at most every 5 s)
    const edge = left(
      info?.premier.open ? info.premier.closesInSec : (info?.premier.opensInSec ?? null),
      core.rankedInfoAt,
    );
    if (edge !== null && edge <= 0 && performance.now() - lastAsk > 5000) {
      lastAsk = performance.now();
      core.sendJson({ t: 'profile' });
    }
    const key = JSON.stringify([
      p?.ladders,
      p?.raceBests,
      p?.season,
      q.mode,
      q.error,
      q.waitSec,
      q.searching,
      v && { ...v, secondsLeft: 0 },
      info && { ...info, premier: { ...info.premier, opensInSec: 0, closesInSec: 0 } },
      hours.closed,
    ]);
    if (key === last) return;
    last = key;
    season.replaceChildren(
      h('span', { class: 'rank-mode' }, `Season ${p?.season ?? info?.season ?? 1}`),
      h(
        'span',
        { class: 'rank-rating' },
        'Premier resets softly each season. Duels has no seasons.',
      ),
    );
    hoursEl = null;
    vetoTimer = null;
    if (v) {
      const panel = vetoPanel(core, v);
      vetoTimer = panel.timer;
      stage.replaceChildren(panel.el);
    } else stage.replaceChildren(ladderCards());
    if (v) {
      status.textContent = 'Leaving now cancels the match for everyone.';
      status.className = 'queue-status';
      cancel.hidden = false;
    } else if (q.mode) {
      status.textContent = `Searching ${rankedQueueName(q.mode)} · ${fmtWait(q.waitSec)} · ${q.searching} searching`;
      status.className = 'queue-status active';
      cancel.hidden = false;
    } else {
      status.textContent =
        q.error ?? 'Solo queue, matched by rating. Leaving a ranked match counts as a loss.';
      status.className = `queue-status${q.error ? ' error' : ''}`;
      cancel.hidden = true;
    }
    tickTexts();
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
    season,
    stage,
    h('div', { class: 'queue-row' }, status, cancel),
    conn,
  );
};

/** Leaderboards: Premier (this season or a past one) and Duels, from the server's JSON API. */
export const leaderboardScreen = (back: () => void, myId: number | null): HTMLElement => {
  let which: LadderId = 'premier';
  let season: number | null = null;
  /** Race: a track's fastest times instead of the rating board */
  let track: string | null = null;
  let current = 1;
  const tabs = h('div', { class: 'choice-row' });
  const table = h('div', { class: 'leaderboard' }, 'Loading…');
  const load = async () => {
    const seasonButtons: HTMLElement[] = [];
    if (LADDERS[which].seasonal && current > 1)
      for (let s = current; s >= 1; s--) {
        const n = s;
        seasonButtons.push(
          button(
            n === current ? `Season ${n} (now)` : `Season ${n}`,
            () => {
              season = n;
              void load();
            },
            `btn small ${(season ?? current) === n ? '' : 'secondary'}`,
          ),
        );
      }
    const trackButtons =
      which === 'race'
        ? raceMaps().map((m) =>
            button(
              `${m.name} times`,
              () => {
                track = m.id;
                void load();
              },
              `btn small ${track === m.id ? '' : 'secondary'}`,
            ),
          )
        : [];
    tabs.replaceChildren(
      ...LADDER_IDS.map((m) =>
        button(
          LADDERS[m].name,
          () => {
            which = m;
            season = null;
            track = null;
            void load();
          },
          `btn small ${which === m && !track ? '' : 'secondary'}`,
        ),
      ),
      ...(track ? [] : seasonButtons),
      ...trackButtons,
    );
    table.textContent = 'Loading…';
    if (track) {
      await loadTrack(track);
      return;
    }
    try {
      const res = await fetch(
        `/api/leaderboard?mode=${which}&limit=100${season ? `&season=${season}` : ''}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        currentSeason: number;
        rows: {
          position: number;
          playerId: number;
          name: string;
          rating: number;
          games: number;
          rank: Rank;
        }[];
      };
      if (data.currentSeason !== current) {
        current = data.currentSeason;
        void load(); // show the season buttons
        return;
      }
      if (!data.rows.length) {
        table.textContent =
          which === 'premier'
            ? 'No one has placed yet — win 5 Premier matches to appear here.'
            : which === 'race'
              ? 'No one has placed yet — finish 5 ranked races to appear here.'
              : 'No ranked players yet — play 5 Duels to appear here.';
        return;
      }
      table.replaceChildren(
        h(
          'table',
          {},
          h('tr', {}, ...['#', 'Player', 'Rating', 'Rank', 'Games'].map((x) => h('th', {}, x))),
          ...data.rows.map((r) =>
            h(
              'tr',
              { class: r.playerId === myId ? 'me' : '' },
              h('td', {}, String(r.position)),
              h('td', {}, r.name),
              h('td', { style: `color:${r.rank.color};font-weight:800` }, String(r.rating)),
              h('td', {}, rankBadge(r.rank)),
              h('td', {}, String(r.games)),
            ),
          ),
        ),
      );
    } catch {
      table.textContent = 'Leaderboards need the game server (not available offline).';
    }
  };
  /** A race track's fastest times: one per player. */
  const loadTrack = async (id: string) => {
    try {
      const res = await fetch(`/api/race-times?track=${encodeURIComponent(id)}&limit=100`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        rows: { position: number; playerId: number; name: string; timeMs: number; at: number }[];
      };
      if (track !== id) return; // another tab was picked meanwhile
      if (!data.rows.length) {
        table.textContent = `No times on ${getMap(id).name} yet — finish a race there online.`;
        return;
      }
      table.replaceChildren(
        h(
          'table',
          {},
          h('tr', {}, ...['#', 'Player', 'Time', 'Set'].map((x) => h('th', {}, x))),
          ...data.rows.map((r) =>
            h(
              'tr',
              { class: r.playerId === myId ? 'me' : '' },
              h('td', {}, String(r.position)),
              h('td', {}, r.name),
              h('td', { style: 'font-weight:800' }, formatRaceTime(r.timeMs)),
              h('td', {}, new Date(r.at).toLocaleDateString()),
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

/** How a match shows in the history: "Premier", "Duels 2v2", "2v2", "arena". */
const matchLabel = (r: ClientProfile['recent'][number]): string =>
  r.ladder === 'premier'
    ? 'Premier'
    : r.ladder
      ? `${LADDERS[r.ladder].name} ${r.mode}`
      : `${r.mode}${r.ranked ? ' ranked (old)' : ''}`;

/** Your profile: Premier and Duels, past seasons, recent matches and the login code. */
export const profileScreen = (
  core: NetCore,
  back: () => void,
  useCode: (code: string) => void,
): HTMLElement => {
  core.sendJson({ t: 'profile' });
  const body = h('div', {});
  let last = '';
  const render = () => {
    const p = core.account as ClientProfile | null;
    const key = JSON.stringify([p, core.state]);
    if (key === last) return;
    last = key;
    if (!p?.ladders) {
      body.textContent = core.state === 'closed' ? 'Not connected to the game server.' : 'Loading…';
      return;
    }
    const parts: (Node | null)[] = [
      h('div', { class: 'profile-name' }, p.name),
      h(
        'div',
        { class: 'rank-list' },
        ...LADDER_IDS.map((l) => {
          const st = p.ladders[l];
          return h(
            'div',
            { class: 'rank-row' },
            h('span', { class: 'rank-mode' }, LADDERS[l].name),
            st?.rating !== null && st?.rating !== undefined
              ? h(
                  'span',
                  {},
                  h('b', { style: `color:${st.rank?.color ?? '#9aa6b8'}` }, `${st.rating} `),
                  rankBadge(st.rank),
                )
              : h('span', { class: 'tier' }, standingText(st)),
            h(
              'span',
              { class: 'rank-rating' },
              st && st.games
                ? `${st.wins}/${st.games} won${st.position ? ` · #${st.position}` : ''}${LADDERS[l].seasonal ? ` · season ${p.season}` : ''}`
                : 'no games',
            ),
          );
        }),
        ...(p.pastSeasons ?? []).map((s) =>
          h(
            'div',
            { class: 'rank-row past' },
            h('span', { class: 'rank-mode' }, `S${s.season}`),
            s.rating !== null
              ? h(
                  'span',
                  {},
                  h('b', { style: `color:${s.rank?.color ?? '#9aa6b8'}` }, `${s.rating} `),
                  rankBadge(s.rank),
                )
              : h('span', { class: 'tier' }, 'not placed'),
            h(
              'span',
              { class: 'rank-rating' },
              `${LADDERS[s.ladder ?? 'premier'].name} season ${s.season} final`,
            ),
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
                h('td', {}, matchLabel(r)),
                h(
                  'td',
                  { class: r.won ? 'win' : r.won === false ? 'loss' : '' },
                  r.place ? `#${r.place}` : r.won ? 'Win' : r.won === false ? 'Loss' : 'Draw',
                ),
                h('td', {}, `${r.kills}/${r.deaths}`),
                h('td', {}, r.ladder ? `${r.delta >= 0 ? '+' : ''}${r.delta}` : ''),
              ),
            ),
          )
        : h('div', {}, 'No matches yet.'),
      h('div', { class: 'label' }, 'Race best times'),
      h(
        'table',
        { class: 'recent' },
        ...(p.raceBests ?? []).map((b) =>
          h(
            'tr',
            {},
            h('td', {}, getMap(b.track).name),
            h('td', {}, b.timeMs ? formatRaceTime(b.timeMs) : 'no time yet'),
            h('td', {}, b.position ? `#${b.position}` : ''),
          ),
        ),
      ),
      p.recentRaces?.length ? h('div', { class: 'label' }, 'Recent races') : null,
      p.recentRaces?.length
        ? h(
            'table',
            { class: 'recent' },
            ...p.recentRaces.map((r) =>
              h(
                'tr',
                {},
                h('td', {}, `${getMap(r.track).name}${r.ranked ? ' ranked' : ''}`),
                h(
                  'td',
                  { class: r.place === 1 && r.timeMs !== null ? 'win' : '' },
                  r.timeMs !== null ? `${r.place}/${r.racers}` : 'DNF',
                ),
                h('td', {}, r.timeMs !== null ? formatRaceTime(r.timeMs) : ''),
                h('td', {}, r.ranked ? `${r.delta >= 0 ? '+' : ''}${r.delta}` : ''),
              ),
            ),
          )
        : null,
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
