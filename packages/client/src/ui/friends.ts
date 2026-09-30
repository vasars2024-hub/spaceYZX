// Friends: find players by name, friend requests (accept / decline / cancel), your friends with
// where they are right now (menu, a room, a match — mode and map — or ranked) and JOIN / INVITE
// buttons, blocked players. Also the toasts for requests and invites (with Join / Accept).
import type { FriendEntry, PlayerCard, Presence, SocialNotice } from '@space-yz/shared';
import { getMap } from '@space-yz/shared';
import { h, button } from './menus';
import { screenHead } from './menu-kit';
import { avatarEl } from './avatars';
import { modeLabel, nameLink, relationButtons } from './profile-screen';
import { account } from '../net/account';

const ago = (t: number | undefined): string => {
  if (!t) return '';
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.floor(hrs / 24)} days ago`;
};

/** "In a match · Bomb 5v5 on Split Deck (7/10)". */
export const presenceText = (p: Presence): string => {
  const where =
    p.mode && p.map
      ? `${modeLabel(p.mode, p.objective)} on ${getMap(p.map).name}${p.players ? ` (${p.players}/${p.maxPlayers ?? '?'})` : ''}`
      : '';
  switch (p.state) {
    case 'offline':
      return `Offline${p.lastSeen ? ` · seen ${ago(p.lastSeen)}` : ''}`;
    case 'menu':
      return 'Online · in the menus';
    case 'ranked':
      return `In ranked${where ? ` · ${where}` : ''}`;
    case 'match':
      return `In a match · ${where}`;
    default:
      return `In a room · ${where}`;
  }
};

const who = (c: PlayerCard, openProfile: (id: number) => void, extra?: Node | null) =>
  h(
    'div',
    { class: 'friend-who' },
    avatarEl(c.avatar, c.banner, 34),
    h('div', { class: 'friend-text' }, nameLink(c.name, c.id, openProfile), extra ?? null),
  );

export interface FriendsScreenOpts {
  back: () => void;
  openProfile: (id: number) => void;
  /** you are in a casual room now (Invite buttons show) */
  inRoom: () => boolean;
  connected: () => boolean;
}

export const friendsScreen = (o: FriendsScreenOpts): HTMLElement => {
  const msg = h('div', { class: 'queue-status' });
  const lists = h('div', { class: 'friends-lists' });
  const results = h('div', { class: 'friend-results' });
  const search = h('input', {
    type: 'text',
    placeholder: 'Find players by name',
    maxlength: '16',
    'aria-label': 'Find players by name',
  });
  let timer = 0;
  let asked = '';
  const runSearch = async () => {
    const q = search.value.trim();
    if (q === asked) return;
    asked = q;
    if (q.length < 2) {
      results.replaceChildren();
      return;
    }
    try {
      const res = await fetch(`/api/players?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { rows: PlayerCard[] };
      if (asked !== q) return;
      results.replaceChildren(
        ...(data.rows.length
          ? data.rows
              .filter((r) => r.id !== account.me?.id)
              .map((r) =>
                h(
                  'div',
                  { class: 'friend-row' },
                  who(r, o.openProfile, r.secured ? null : h('span', { class: 'chip' }, 'guest')),
                  relationButtons(r.id),
                ),
              )
          : [h('div', { class: 'muted' }, 'Nobody by that name.')]),
      );
    } catch {
      results.textContent = 'Search needs the game server.';
    }
  };
  search.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void runSearch(), 250);
  });

  const friendRow = (f: FriendEntry): HTMLElement => {
    const p = f.presence;
    const actions: HTMLElement[] = [];
    if (p.state === 'ranked') actions.push(h('span', { class: 'chip' }, 'In ranked'));
    else if (p.joinable)
      actions.push(
        button('Join', () => {
          msg.textContent = `Joining ${f.name}…`;
          account.joinFriend(f.id);
        }),
      );
    if (o.inRoom() && p.state !== 'offline')
      actions.push(button('Invite', () => account.invite(f.id), 'btn small secondary'));
    // a party: queue together (matchmaking screen); you lead it if you start it
    if (p.state !== 'offline' && !o.inRoom())
      actions.push(
        button(
          'Party invite',
          () => {
            account.core?.partyOp('invite', f.id);
            msg.textContent = `Party invite sent to ${f.name}.`;
            msg.className = 'queue-status active';
          },
          'btn small secondary',
        ),
      );
    actions.push(
      button(
        'Remove',
        () => {
          if (confirm(`Remove ${f.name} from your friends?`))
            account.friend('remove', { id: f.id });
        },
        'btn tiny secondary',
      ),
    );
    return h(
      'div',
      { class: `friend-row presence-${p.state}` },
      who(
        f,
        o.openProfile,
        h('span', { class: 'friend-presence' }, h('span', { class: 'pdot' }), presenceText(p)),
      ),
      h('div', { class: 'friend-actions' }, ...actions),
    );
  };

  let last = '';
  const render = () => {
    const s = account.social;
    const key = JSON.stringify([s, o.inRoom(), o.connected(), account.me?.id]);
    if (key === last) return;
    last = key;
    if (!o.connected() || !s) {
      lists.replaceChildren(
        h('div', { class: 'muted' }, o.connected() ? 'Loading…' : 'Connecting to the game server…'),
      );
      return;
    }
    const sec = (title: string, rows: HTMLElement[]) =>
      rows.length ? [h('div', { class: 'label' }, title), ...rows] : [];
    const online = s.friends.filter((f) => f.presence.state !== 'offline').length;
    lists.replaceChildren(
      ...sec(
        'Friend requests',
        s.incoming.map((r) =>
          h(
            'div',
            { class: 'friend-row' },
            who(r, o.openProfile, h('span', { class: 'muted' }, 'wants to be friends')),
            h(
              'div',
              { class: 'friend-actions' },
              button('Accept', () => account.friend('accept', { id: r.id }), 'btn small'),
              button(
                'Decline',
                () => account.friend('decline', { id: r.id }),
                'btn small secondary',
              ),
            ),
          ),
        ),
      ),
      h('div', { class: 'label' }, `Friends · ${online} online · ${s.friends.length}/${s.max}`),
      ...(s.friends.length
        ? s.friends.map(friendRow)
        : [
            h(
              'div',
              { class: 'muted' },
              'No friends yet — find players above, or add them from a profile.',
            ),
          ]),
      ...sec(
        'Sent requests',
        s.outgoing.map((r) =>
          h(
            'div',
            { class: 'friend-row' },
            who(r, o.openProfile, h('span', { class: 'muted' }, 'waiting for an answer')),
            button('Cancel', () => account.friend('cancel', { id: r.id }), 'btn small secondary'),
          ),
        ),
      ),
      ...sec(
        'Blocked',
        s.blocked.map((r) =>
          h(
            'div',
            { class: 'friend-row' },
            who(r, o.openProfile),
            button('Unblock', () => account.friend('unblock', { id: r.id }), 'btn small secondary'),
          ),
        ),
      ),
    );
  };
  const offResult = account.onResult((r) => {
    if (r.t !== 'socialResult') return;
    msg.textContent = r.ok ? (r.op === 'invite' ? 'Invite sent.' : '') : (r.error ?? '');
    msg.className = `queue-status${r.ok ? ' active' : ' error'}`;
  });
  const offChange = account.onChange(render);
  account.refreshSocial();
  render();
  const tick = window.setInterval(() => {
    if (!lists.isConnected) {
      window.clearInterval(tick);
      offResult();
      offChange();
    } else render();
  }, 1000);
  return h(
    'div',
    { class: 'screen interactive flow-screen friends-flow' },
    screenHead('team', 'Friends', o.back),
    h(
      'div',
      { class: 'panel wide-panel' },
      h('div', { class: 'friend-search' }, search),
      results,
      msg,
      lists,
    ),
  );
};

// ------------------------------------------------------------------------------------------
// Toasts

let box: HTMLDivElement | null = null;

/** A friend request / accepted request / room invite, with buttons. */
export const socialToast = (
  n: SocialNotice,
  act: {
    join: (code: string) => void;
    openProfile: (id: number) => void;
    /** join the party of this leader (a party invite) */
    joinParty?: (leader: number) => void;
  },
): void => {
  if (!box) {
    box = h('div', { class: 'social-toasts' });
    document.body.append(box);
  }
  const close = () => {
    t.classList.add('fade');
    window.setTimeout(() => t.remove(), 400);
  };
  const text =
    n.kind === 'party'
      ? `invites you to their party (${n.party?.size ?? 1}/5)`
      : n.kind === 'invite'
        ? `invites you: ${n.room ? `${modeLabel(n.room.mode)} on ${getMap(n.room.map).name}` : 'their room'}`
        : n.kind === 'request'
          ? 'wants to be your friend'
          : 'accepted your friend request';
  const buttons: HTMLElement[] = [];
  if (n.kind === 'invite' && n.room) {
    const code = n.room.code;
    buttons.push(
      button(
        'Join',
        () => {
          act.join(code);
          close();
        },
        'btn small',
      ),
    );
  }
  if (n.kind === 'party')
    buttons.push(
      button(
        'Join',
        () => {
          if (act.joinParty) act.joinParty(n.from.id);
          else account.core?.partyOp('join', n.from.id);
          close();
        },
        'btn small',
      ),
    );
  if (n.kind === 'request')
    buttons.push(
      button(
        'Accept',
        () => {
          account.friend('accept', { id: n.from.id });
          close();
        },
        'btn small',
      ),
    );
  buttons.push(button('✕', close, 'btn tiny secondary'));
  const t = h(
    'div',
    { class: 'social-toast' },
    avatarEl(n.from.avatar, n.from.banner, 32),
    h(
      'div',
      { class: 'friend-text' },
      nameLink(n.from.name, n.from.id, (id) => {
        act.openProfile(id);
        close();
      }),
      h('span', { class: 'muted' }, text),
    ),
    h('div', { class: 'friend-actions' }, ...buttons),
  );
  box.append(t);
  while (box.children.length > 4) box.firstElementChild?.remove();
  window.setTimeout(close, n.kind === 'invite' || n.kind === 'party' ? 20000 : 10000);
};
