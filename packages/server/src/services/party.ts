// Parties (in memory only: a party lasts while its players are online). Built on the friends
// system (social.ts): the leader invites friends (a toast with Join), members can leave, the
// leader can kick or hand the lead over. The party sees each other in the menus, and the
// leader's search (ranked multi-search or the casual queue) applies to everyone: the queue
// (queue.ts) takes the whole party as one unit on one team. A "ready" tick is shown only.
import type { PartyOp, PartyView, PlayerCard } from '@space-yz/shared';
import { PARTY_MAX } from '@space-yz/shared';
import type { Conn } from '../game/conn';
import type { Accounts } from './accounts';
import type { Social } from './social';

export interface Party {
  id: number;
  leader: number;
  /** account ids, leader first */
  members: number[];
  /** invited account ids -> when the invite runs out (ms) */
  invited: Map<number, number>;
  ready: Set<number>;
}

/** An invite stays valid this long. */
export const PARTY_INVITE_MS = 5 * 60_000;

export const PARTY_OPS: readonly PartyOp[] = [
  'create',
  'invite',
  'join',
  'decline',
  'leave',
  'kick',
  'promote',
  'ready',
  'unready',
];

export class Parties {
  private byAccount = new Map<number, Party>();
  private nextId = 1;
  /** the party's search, for its view (set by the queue) */
  searchOf: (p: Party) => PartyView['search'] = () => null;
  /** the party changed (someone joined / left / was kicked): the queue stops its search */
  onChange: (p: Party, why: string) => void = () => {};

  constructor(
    private social: Social,
    private accounts: Accounts,
    private now: () => number = Date.now,
    private log: (msg: string) => void = () => {},
  ) {}

  of(accountId: number | null): Party | undefined {
    return accountId === null ? undefined : this.byAccount.get(accountId);
  }

  /** Every party (dashboard, tests). */
  all(): Party[] {
    return [...new Set(this.byAccount.values())];
  }

  /** An account's connection to use (the newest one that is still open). */
  connOf(accountId: number): Conn | null {
    const list = [...(this.social.online.get(accountId) ?? [])].filter((c) => !c.closed);
    return list[list.length - 1] ?? null;
  }

  /** Run a party action for this connection. Returns an error message, or null. */
  op(conn: Conn, op: PartyOp, id?: number): string | null {
    const me = conn.accountId;
    if (me === null) return 'Parties need an account.';
    if (!PARTY_OPS.includes(op)) return 'Unknown party action.';
    const mine = this.byAccount.get(me);
    switch (op) {
      case 'create': {
        if (mine) return 'You are already in a party.';
        this.create(me);
        return null;
      }
      case 'invite': {
        if (typeof id !== 'number') return 'Invite whom?';
        const p = mine ?? this.create(me);
        if (p.leader !== me) return 'Only the party leader can invite.';
        if (p.members.length >= PARTY_MAX) return `A party holds ${PARTY_MAX} players.`;
        if (p.members.includes(id)) return 'They are already in your party.';
        if (!this.social.areFriends(me, id)) return 'You can only invite friends.';
        if (!this.social.online.has(id)) return 'They are offline.';
        if (this.social.inviteLimit.lockedFor(`inv:${me}`))
          return 'Too many invites — wait a moment.';
        this.social.inviteLimit.hit(`inv:${me}`);
        p.invited.set(id, this.now() + PARTY_INVITE_MS);
        this.push(p);
        // blocked by them: looks sent, but they never hear of it
        if (!this.social.hasBlocked(id, me)) {
          const card = this.accounts.cards([me]).get(me);
          if (card)
            this.social.notify(id, {
              kind: 'party',
              from: card,
              party: { size: p.members.length },
            });
        }
        return null;
      }
      case 'join': {
        if (typeof id !== 'number') return 'Join whom?';
        const p = this.byAccount.get(id);
        const until = p?.invited.get(me);
        if (!p || until === undefined || until < this.now()) return 'That invite is gone.';
        if (p.members.length >= PARTY_MAX) return 'That party is full.';
        if (mine === p) return null;
        if (mine) this.leave(me, 'joined another party');
        p.invited.delete(me);
        p.members.push(me);
        this.byAccount.set(me, p);
        this.log(`Party ${p.id}: ${conn.name} joined`);
        this.onChange(p, `${conn.name} joined the party`);
        this.push(p);
        return null;
      }
      case 'decline': {
        const p = typeof id === 'number' ? this.byAccount.get(id) : undefined;
        if (p?.invited.delete(me)) this.push(p);
        return null;
      }
      case 'leave':
        if (!mine) return null;
        this.leave(me, 'left');
        conn.sendJson({ t: 'party', data: null });
        return null;
      case 'kick': {
        if (!mine || mine.leader !== me) return 'Only the party leader can remove players.';
        if (typeof id !== 'number' || id === me) return 'Remove whom?';
        if (mine.invited.delete(id)) {
          this.push(mine);
          return null;
        }
        if (!mine.members.includes(id)) return 'They are not in your party.';
        this.leave(id, 'was removed');
        this.sendTo(id, { t: 'party', data: null });
        this.sendTo(id, { t: 'notice', msg: 'You were removed from the party.' });
        return null;
      }
      case 'promote': {
        if (!mine || mine.leader !== me) return 'Only the party leader can do that.';
        if (typeof id !== 'number' || !mine.members.includes(id))
          return 'They are not in your party.';
        mine.leader = id;
        mine.members = [id, ...mine.members.filter((x) => x !== id)];
        this.onChange(mine, 'the party has a new leader');
        this.push(mine);
        return null;
      }
      case 'ready':
      case 'unready':
        if (!mine) return 'You are not in a party.';
        if (op === 'ready') mine.ready.add(me);
        else mine.ready.delete(me);
        this.push(mine);
        return null;
    }
    return 'Unknown party action.';
  }

  private create(leader: number): Party {
    const p: Party = {
      id: this.nextId++,
      leader,
      members: [leader],
      invited: new Map(),
      ready: new Set(),
    };
    this.byAccount.set(leader, p);
    this.push(p);
    return p;
  }

  /** A member leaves (or is removed / went offline): a new leader if needed; empty = gone. */
  leave(accountId: number, why: string): void {
    const p = this.byAccount.get(accountId);
    if (!p) return;
    this.byAccount.delete(accountId);
    p.members = p.members.filter((x) => x !== accountId);
    p.ready.delete(accountId);
    const name = this.accounts.cards([accountId]).get(accountId)?.name ?? 'A player';
    this.log(`Party ${p.id}: ${name} ${why}`);
    if (!p.members.length) return;
    if (p.leader === accountId) p.leader = p.members[0];
    this.onChange(p, `${name} ${why}`);
    this.push(p);
  }

  /** An account's last connection closed: it leaves its party. */
  disconnected(accountId: number | null): void {
    if (accountId === null || this.social.online.has(accountId)) return;
    this.leave(accountId, 'went offline');
  }

  private sendTo(accountId: number, msg: Parameters<Conn['sendJson']>[0]): void {
    for (const c of this.social.online.get(accountId) ?? []) c.sendJson(msg);
  }

  view(p: Party): PartyView {
    const now = this.now();
    for (const [id, until] of p.invited) if (until < now) p.invited.delete(id);
    const cards = this.accounts.cards([...p.members, ...p.invited.keys()]);
    const card = (id: number): PlayerCard =>
      cards.get(id) ?? { id, name: `Player ${id}`, avatar: 0, banner: 0, secured: false };
    return {
      leader: p.leader,
      members: p.members.map((id) => ({
        ...card(id),
        leader: id === p.leader,
        ready: p.ready.has(id),
        online: this.social.online.has(id),
      })),
      invited: [...p.invited.keys()].map(card),
      max: PARTY_MAX,
      search: this.searchOf(p),
    };
  }

  /** Send every member their party's view. */
  push(p: Party): void {
    const data = this.view(p);
    for (const id of p.members) this.sendTo(id, { t: 'party', data });
  }

  /** A connection said hello: tell it its party (if any). */
  hello(conn: Conn): void {
    const p = this.of(conn.accountId);
    conn.sendJson({ t: 'party', data: p ? this.view(p) : null });
  }
}
