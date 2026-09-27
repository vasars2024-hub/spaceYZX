// Player profiles (anyone's: from leaderboards, the friends list, a room's players): banner,
// avatar, title, join date, lifetime stats (no levels), wins by mode, ratings with their colour
// bands and past seasons, recent matches (click one for its scoreboard) and race best times.
// Your own has Edit. Data from the server's public JSON API; names are always text.
import type { LadderId } from '@space-yz/shared';
import {
  AVATAR_COUNT,
  BANNER_COLORS,
  LADDER_IDS,
  LADDERS,
  NAME_CHANGE_COOLDOWN_MS,
  TITLE_MAX,
  USERNAME_MAX,
  checkUsername,
  cleanTitle,
  formatRaceTime,
  getMap,
} from '@space-yz/shared';
import { h, button } from './menus';
import { iconButton, screenHead } from './menu-kit';
import { avatarEl, AVATARS, bannerColor } from './avatars';
import { standingText, type LadderStandingView } from './flow';
import { account } from '../net/account';

interface Rank {
  label: string;
  color: string;
  top?: boolean;
}
interface PublicProfile {
  id: number;
  name: string;
  season: number;
  ladders: Partial<
    Record<LadderId, LadderStandingView & { games: number; wins: number; position: number | null }>
  >;
  pastSeasons: { season: number; ladder: LadderId; rating: number | null; rank: Rank | null }[];
  raceBests: { track: string; timeMs: number | null; position: number | null }[];
  recentRaces: {
    track: string;
    ranked: boolean;
    place: number;
    racers: number;
    timeMs: number | null;
    at: number;
  }[];
  recent: {
    matchId: number;
    objective: string | null;
    map: string;
    mode: string;
    ladder: LadderId | null;
    ranked: boolean;
    won: boolean | null;
    place: number | null;
    delta: number;
    kills: number;
    deaths: number;
    at: number;
  }[];
  card: {
    name: string;
    avatar: number;
    banner: number;
    title: string;
    joined: number;
    secured: boolean;
  } | null;
  stats: {
    matches: number;
    kills: number;
    deaths: number;
    kd: number;
    damage: number;
    headshots: number;
    boomerangAcc: number | null;
    laserAcc: number | null;
    gunAcc: number | null;
    favWeapon: { weapon: string; kills: number } | null;
    playtimeSec: number;
    byMode: Partial<Record<string, { games: number; wins: number }>>;
  };
}
interface MatchDetail {
  id: number;
  mode: string;
  objective: string | null;
  map: string;
  ranked: boolean;
  ladder: string | null;
  winner: number | null;
  scores: [number, number];
  reason: string;
  durationSec: number;
  at: number;
  players: {
    accountId: number | null;
    name: string;
    avatar: number | null;
    team: number;
    bot: boolean;
    kills: number;
    deaths: number;
    teamKills: number;
    damage: number;
    headshots: number | null;
    place: number | null;
    left: boolean;
    delta: number;
  }[];
}

const WEAPONS: Record<string, string> = {
  boomerang: 'Boomerang',
  laser: 'Laser',
  slash: 'Slash',
  grenade: 'Grenade',
  ak: 'AK',
  deagle: 'Deagle',
};
const MODE_NAMES: [string, string][] = [
  ['tower', 'Tower'],
  ['bomb', 'Bomb'],
  ['elim', 'Elimination'],
  ['brawl', 'Brawl'],
  ['race', 'Race'],
  ['arena', 'Arena'],
];
const OBJECTIVE: Record<string, string> = { tower: 'Tower', bomb: 'Bomb', elim: 'Elimination' };

/** "Tower 2v2", "Premier", "Arena", "Brawl". */
export const modeLabel = (mode: string, objective?: string | null, ladder?: string | null) => {
  if (ladder === 'premier') return 'Premier';
  if (ladder === 'premier-cs') return `Premier CS${objective === 'elim' ? ' Elimination' : ''}`;
  if (mode === 'arena') return 'Arena 1v1';
  if (mode === 'race') return 'Race';
  if (mode === 'practice') return 'Practice';
  if (mode.startsWith('brawl')) return 'Brawl';
  const obj = objective ? (OBJECTIVE[objective] ?? objective) : '';
  return `${ladder === 'duels' ? 'Duels ' : ''}${obj ? `${obj} ` : ''}${mode}`.trim();
};

export const playtime = (sec: number): string => {
  const hrs = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  return hrs ? `${hrs} h ${min} min` : `${min} min`;
};

const rankBadge = (r: Rank | null | undefined, fallback = 'Placement'): HTMLElement =>
  h(
    'span',
    { class: `tier${r?.top ? ' galaxy' : ''}`, style: `color:${r?.color ?? '#9aa6b8'}` },
    r?.label ?? fallback,
  );

const tile = (label: string, value: string, sub = ''): HTMLElement =>
  h(
    'div',
    { class: 'stat-tile' },
    h('span', { class: 'stat-value' }, value),
    h('span', { class: 'stat-label' }, label),
    sub ? h('span', { class: 'stat-sub' }, sub) : null,
  );

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

/** A name that opens that player's profile (plain text for bots / unknown players). */
export const nameLink = (
  name: string,
  id: number | null | undefined,
  open: ((id: number) => void) | undefined,
): HTMLElement => {
  if (id === null || id === undefined || !open) return h('span', {}, name);
  const b = h('button', { class: 'name-link', type: 'button', title: 'View profile' }, name);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    open(id);
  });
  return b;
};

/** The friend / block buttons for another player's profile or a search result. */
export const relationButtons = (id: number): HTMLElement => {
  const box = h('div', { class: 'relation' });
  const render = () => {
    const rel = account.relation(id);
    const act = (label: string, fn: () => void, cls = 'btn small') => button(label, fn, cls);
    const parts: HTMLElement[] = [];
    if (!account.me) {
      box.replaceChildren();
      return;
    }
    if (rel === 'friend')
      parts.push(
        h('span', { class: 'chip ok' }, 'Friends'),
        act('Remove', () => account.friend('remove', { id }), 'btn small secondary'),
      );
    else if (rel === 'incoming')
      parts.push(
        act('Accept friend', () => account.friend('accept', { id })),
        act('Decline', () => account.friend('decline', { id }), 'btn small secondary'),
      );
    else if (rel === 'outgoing')
      parts.push(
        h('span', { class: 'chip' }, 'Request sent'),
        act('Cancel', () => account.friend('cancel', { id }), 'btn small secondary'),
      );
    else if (rel === 'none') parts.push(act('Add friend', () => account.friend('request', { id })));
    if (rel === 'blocked')
      parts.push(act('Unblock', () => account.friend('unblock', { id }), 'btn small secondary'));
    else if (rel !== 'me')
      parts.push(
        act(
          'Block',
          () => {
            if (confirm('Block this player? Their chat, voice, requests and invites stop.'))
              account.friend('block', { id });
          },
          'btn small secondary',
        ),
      );
    box.replaceChildren(...parts);
  };
  render();
  const off = account.onChange(render);
  const timer = window.setInterval(() => {
    if (!box.isConnected) {
      off();
      window.clearInterval(timer);
    }
  }, 1000);
  return box;
};

/** One match's scoreboard (an overlay over the profile). */
const matchOverlay = (id: number, openProfile: (id: number) => void): HTMLElement => {
  const body = h('div', { class: 'panel match-detail' }, 'Loading…');
  const overlay = h('div', { class: 'overlay' }, body);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  void (async () => {
    try {
      const res = await fetch(`/api/match?id=${id}`);
      if (!res.ok) throw new Error(String(res.status));
      const m = (await res.json()) as MatchDetail;
      const arena = m.players.some((p) => p.place !== null);
      const row = (p: MatchDetail['players'][number]) =>
        h(
          'tr',
          { class: p.left ? 'left' : '' },
          h(
            'td',
            { class: 'mp-name' },
            p.avatar !== null ? avatarEl(p.avatar, 0, 20) : null,
            nameLink(p.name, p.accountId, (x) => {
              close();
              openProfile(x);
            }),
            p.left ? h('span', { class: 'chip' }, 'left') : null,
          ),
          arena ? h('td', {}, p.place ? `#${p.place}` : '') : null,
          h('td', {}, String(p.kills)),
          h('td', {}, String(p.deaths)),
          h('td', {}, String(p.damage)),
          h('td', {}, p.headshots === null ? '—' : String(p.headshots)),
          m.ranked ? h('td', {}, `${p.delta >= 0 ? '+' : ''}${p.delta}`) : null,
        );
      const head = h(
        'tr',
        {},
        ...[
          'Player',
          ...(arena ? ['Place'] : []),
          'K',
          'D',
          'Dmg',
          'HS',
          ...(m.ranked ? ['Rating'] : []),
        ].map((x) => h('th', {}, x)),
      );
      const teams = arena
        ? [h('table', { class: 'recent' }, head, ...m.players.map(row))]
        : ([0, 1] as const).map((t) =>
            h(
              'div',
              { class: 'mp-team' },
              h(
                'div',
                { class: `mp-team-title team-${t}` },
                `${t === 0 ? 'Cyan' : 'Orange'} · ${m.scores[t]}${m.winner === t ? ' · won' : ''}`,
              ),
              h(
                'table',
                { class: 'recent' },
                head.cloneNode(true),
                ...m.players.filter((p) => p.team === t).map(row),
              ),
            ),
          );
      body.replaceChildren(
        h(
          'div',
          { class: 'mp-head' },
          h('b', {}, `${modeLabel(m.mode, m.objective, m.ladder)} · ${getMap(m.map).name}`),
          h(
            'span',
            { class: 'muted' },
            `${new Date(m.at).toLocaleString()} · ${playtime(m.durationSec)} · ${m.reason}`,
          ),
        ),
        ...teams,
        button('Close', close, 'btn small secondary'),
      );
    } catch {
      body.replaceChildren('Could not load that match.', button('Close', close, 'btn small'));
    }
  })();
  return overlay;
};

export interface ProfileScreenOpts {
  id: number;
  back: () => void;
  openProfile: (id: number) => void;
  /** your own profile: open the editor / the account screen */
  edit?: () => void;
  account?: () => void;
}

/** Anyone's profile page. */
export const profileScreen = (o: ProfileScreenOpts): HTMLElement => {
  const body = h('div', { class: 'profile-body' }, 'Loading…');
  const screen = h(
    'div',
    { class: 'screen interactive flow-screen profile-flow' },
    screenHead('profile', 'Profile', o.back),
    h('div', { class: 'panel wide-panel' }, body),
  );
  void (async () => {
    let p: PublicProfile;
    try {
      const res = await fetch(`/api/profile?id=${o.id}`);
      if (!res.ok) throw new Error(String(res.status));
      p = (await res.json()) as PublicProfile;
    } catch {
      body.textContent = 'Profiles need the game server (not available offline).';
      return;
    }
    const c = p.card ?? {
      name: p.name,
      avatar: 0,
      banner: 0,
      title: '',
      joined: 0,
      secured: false,
    };
    const mine = account.me?.id === p.id;
    const st = p.stats;
    const header = h(
      'div',
      { class: 'profile-banner', style: `--av:${bannerColor(c.banner)}` },
      avatarEl(c.avatar, c.banner, 76, 'big'),
      h(
        'div',
        { class: 'profile-id' },
        h('div', { class: 'profile-name' }, c.name),
        c.title ? h('div', { class: 'profile-title' }, c.title) : null,
        h(
          'div',
          { class: 'muted' },
          `${c.secured ? '' : 'Guest · '}Joined ${c.joined ? new Date(c.joined).toLocaleDateString() : '—'}`,
        ),
      ),
      h(
        'div',
        { class: 'profile-actions' },
        mine && o.edit ? iconButton('settings', 'Edit profile', o.edit, 'btn small') : null,
        mine && o.account ? iconButton('key', 'Account', o.account, 'btn small secondary') : null,
        mine ? null : relationButtons(p.id),
      ),
    );
    const tiles = h(
      'div',
      { class: 'stat-tiles' },
      tile('Matches', String(st.matches)),
      tile('K/D', st.kd.toFixed(2), `${st.kills} / ${st.deaths}`),
      tile('Boomerang hits', pct(st.boomerangAcc)),
      tile('Laser hits', pct(st.laserAcc)),
      st.gunAcc !== null ? tile('Gun hits', pct(st.gunAcc)) : null,
      tile('Headshots', String(st.headshots)),
      tile(
        'Favourite weapon',
        st.favWeapon ? (WEAPONS[st.favWeapon.weapon] ?? st.favWeapon.weapon) : '—',
        st.favWeapon ? `${st.favWeapon.kills} kills` : '',
      ),
      tile('Played', playtime(st.playtimeSec)),
    );
    const modes = h(
      'div',
      { class: 'stat-tiles modes' },
      ...MODE_NAMES.map(([k, name]) => {
        const m = st.byMode[k];
        return tile(`${name} wins`, m ? String(m.wins) : '0', m ? `of ${m.games}` : 'not played');
      }),
    );
    const ratings = h(
      'div',
      { class: 'rank-list' },
      ...LADDER_IDS.map((l) => {
        const s = p.ladders[l];
        return h(
          'div',
          { class: 'rank-row' },
          h('span', { class: 'rank-mode' }, LADDERS[l].name),
          s?.rating !== null && s?.rating !== undefined
            ? h(
                'span',
                {},
                h('b', { style: `color:${s.rank?.color ?? '#9aa6b8'}` }, `${s.rating} `),
                rankBadge(s.rank),
              )
            : h('span', { class: 'tier' }, standingText(s)),
          h(
            'span',
            { class: 'rank-rating' },
            s && s.games
              ? `${s.wins}/${s.games} won${s.position ? ` · #${s.position}` : ''}`
              : 'no games',
          ),
        );
      }),
      ...p.pastSeasons.map((s) =>
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
          h('span', { class: 'rank-rating' }, `${LADDERS[s.ladder].name} season ${s.season}`),
        ),
      ),
    );
    const recent = p.recent.length
      ? h(
          'table',
          { class: 'recent clickable' },
          ...p.recent.map((r) => {
            const tr = h(
              'tr',
              { title: 'Show the scoreboard' },
              h('td', {}, modeLabel(r.mode, r.objective, r.ladder)),
              h('td', {}, getMap(r.map).name),
              h(
                'td',
                { class: r.won ? 'win' : r.won === false ? 'loss' : '' },
                r.place ? `#${r.place}` : r.won ? 'Win' : r.won === false ? 'Loss' : 'Draw',
              ),
              h('td', {}, `${r.kills}/${r.deaths}`),
              h('td', {}, r.ladder ? `${r.delta >= 0 ? '+' : ''}${r.delta}` : ''),
              h('td', { class: 'muted' }, new Date(r.at).toLocaleDateString()),
            );
            tr.tabIndex = 0;
            const open = () => screen.append(matchOverlay(r.matchId, o.openProfile));
            tr.addEventListener('click', open);
            tr.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') open();
            });
            return tr;
          }),
        )
      : h('div', { class: 'muted' }, 'No matches yet.');
    const races = h(
      'table',
      { class: 'recent' },
      ...p.raceBests.map((b) =>
        h(
          'tr',
          {},
          h('td', {}, getMap(b.track).name),
          h('td', {}, b.timeMs ? formatRaceTime(b.timeMs) : 'no time yet'),
          h('td', {}, b.position ? `#${b.position}` : ''),
        ),
      ),
    );
    body.replaceChildren(
      header,
      tiles,
      h('div', { class: 'label' }, 'Wins by mode'),
      modes,
      h('div', { class: 'label' }, `Ratings · season ${p.season}`),
      ratings,
      h('div', { class: 'label' }, 'Recent matches'),
      recent,
      h('div', { class: 'label' }, 'Race best times'),
      races,
    );
  })();
  return screen;
};

/** Edit your profile: avatar, banner colour, title and display name. */
export const editProfileScreen = (back: () => void): HTMLElement => {
  const me = account.me;
  let avatar = me?.avatar ?? 0;
  let banner = me?.banner ?? 0;
  const msg = h('div', { class: 'queue-status' });
  const preview = h('div', { class: 'edit-preview' });
  const nameIn = h('input', {
    type: 'text',
    maxlength: String(USERNAME_MAX),
    value: me?.name ?? '',
    'aria-label': 'Display name',
  });
  const titleIn = h('input', {
    type: 'text',
    maxlength: String(TITLE_MAX),
    value: me?.title ?? '',
    placeholder: 'A short title, e.g. "Rail rider"',
    'aria-label': 'Title',
  });
  const paint = () => {
    preview.replaceChildren(
      avatarEl(avatar, banner, 64, 'big'),
      h(
        'div',
        {},
        h('b', {}, nameIn.value || me?.name || ''),
        h('div', { class: 'muted' }, titleIn.value),
      ),
    );
    for (const b of avGrid.querySelectorAll('button'))
      b.classList.toggle('selected', Number(b.dataset.i) === avatar);
    for (const b of bannerRow.querySelectorAll('button'))
      b.classList.toggle('selected', Number(b.dataset.i) === banner);
  };
  const avGrid = h('div', { class: 'avatar-grid' });
  for (let i = 0; i < AVATAR_COUNT; i++) {
    const b = h('button', { type: 'button', class: 'avatar-pick', title: AVATARS[i].name });
    b.dataset.i = String(i);
    b.append(avatarEl(i, banner, 44));
    b.addEventListener('click', () => {
      avatar = i;
      paint();
    });
    avGrid.append(b);
  }
  const bannerRow = h('div', { class: 'banner-row' });
  BANNER_COLORS.forEach((col, i) => {
    const b = h('button', {
      type: 'button',
      class: 'banner-pick',
      style: `background:${col}`,
      'aria-label': `Banner colour ${i + 1}`,
    });
    b.dataset.i = String(i);
    b.addEventListener('click', () => {
      banner = i;
      for (const a of avGrid.querySelectorAll<HTMLElement>('.avatar'))
        a.style.setProperty('--av', col);
      paint();
    });
    bannerRow.append(b);
  });
  nameIn.addEventListener('input', paint);
  titleIn.addEventListener('input', paint);
  const cooldown = me?.secured && me.nameChangeAt ? new Date(me.nameChangeAt) : null;
  const nameNote = me?.secured
    ? cooldown
      ? `Your name is your username. Next change: ${cooldown.toLocaleDateString()} (only capitals can change before).`
      : `Your name is your username (log in with it). You can change it once every ${Math.round(NAME_CHANGE_COOLDOWN_MS / 86_400_000)} days.`
    : 'Guest name. Secure your account to reserve it as your username.';
  const off = account.onResult((r) => {
    if (!msg.isConnected) return off();
    if (r.t !== 'accountResult' || r.op !== 'editProfile') return;
    msg.textContent = r.ok ? 'Saved.' : (r.error ?? 'Could not save.');
    msg.className = `queue-status${r.ok ? ' active' : ' error'}`;
  });
  const save = button(
    'Save',
    () => {
      const patch: { name?: string; avatar?: number; banner?: number; title?: string } = {};
      if (avatar !== me?.avatar) patch.avatar = avatar;
      if (banner !== me?.banner) patch.banner = banner;
      const title = cleanTitle(titleIn.value);
      if (title === null) {
        msg.textContent = 'That title is not allowed.';
        msg.className = 'queue-status error';
        return;
      }
      if (title !== me?.title) patch.title = title;
      const name = nameIn.value.trim();
      if (name && name !== me?.name) {
        if (me?.secured) {
          const u = checkUsername(name);
          if (!u.ok) {
            msg.textContent = u.error;
            msg.className = 'queue-status error';
            return;
          }
        }
        patch.name = name;
      }
      if (!Object.keys(patch).length) {
        msg.textContent = 'Nothing changed.';
        return;
      }
      msg.textContent = 'Saving…';
      msg.className = 'queue-status';
      account.editProfile(patch);
    },
    'btn primary',
  );
  paint();
  const el = h(
    'div',
    { class: 'screen interactive flow-screen' },
    screenHead('profile', 'Edit profile', () => {
      off();
      back();
    }),
    h(
      'div',
      { class: 'panel wide-panel edit-profile' },
      preview,
      h('div', { class: 'label' }, 'Avatar'),
      avGrid,
      h('div', { class: 'label' }, 'Banner colour'),
      bannerRow,
      h('div', { class: 'label' }, 'Title'),
      titleIn,
      h('div', { class: 'label' }, 'Display name'),
      nameIn,
      h('div', { class: 'muted small' }, nameNote),
      h('div', { class: 'choice-row' }, save),
      msg,
    ),
  );
  return el;
};
