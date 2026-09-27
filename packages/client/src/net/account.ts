// Your account on this device: who you are (MeInfo), your friends list, and the session token
// kept in the browser. A guest who logs into a secured account keeps their guest token aside,
// so logging out goes back to that guest (with its progress) instead of a brand-new one.
import type {
  AccountOp,
  FriendOp,
  MeInfo,
  NetCore,
  ServerMsg,
  SocialNotice,
  SocialState,
} from '@space-yz/shared';

const TOKEN_KEY = 'spaceyz.token';
const GUEST_KEY = 'spaceyz.guestToken';
const GUEST_NAME_KEY = 'spaceyz.guestName';
const ME_KEY = 'spaceyz.me';

const read = (k: string): string | undefined => {
  try {
    return localStorage.getItem(k) ?? undefined;
  } catch {
    return undefined;
  }
};
const write = (k: string, v: string | undefined): void => {
  try {
    if (v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode: the session just won't survive a reload */
  }
};

export type AccountResult = Extract<ServerMsg, { t: 'accountResult' }>;
export type SocialResult = Extract<ServerMsg, { t: 'socialResult' }>;

class AccountStore {
  me: MeInfo | null = null;
  social: SocialState | null = null;
  core: NetCore | null = null;
  private listeners = new Set<() => void>();
  private resultFns = new Set<(r: AccountResult | SocialResult) => void>();
  /** a social toast (friend request, accepted, invite) */
  onNotice: (n: SocialNotice) => void = () => {};
  /** logged out: the app says hello again as this guest (its nickname, if it had one) */
  onLoggedOut: (guestName: string | undefined) => void = () => {};
  private unlisten: (() => void) | null = null;

  constructor() {
    try {
      const cached = JSON.parse(read(ME_KEY) ?? 'null') as MeInfo | null;
      if (cached && typeof cached.name === 'string') this.me = cached;
    } catch {
      /* ignore */
    }
  }

  get token(): string | undefined {
    return read(TOKEN_KEY);
  }

  /** Listen to this game connection's account messages. */
  attach(core: NetCore): void {
    this.unlisten?.();
    this.core = core;
    this.unlisten = core.listen((m) => this.onMsg(core, m));
  }

  private onMsg(core: NetCore, m: ServerMsg): void {
    switch (m.t) {
      case 'welcome':
        if (core.token) write(TOKEN_KEY, core.token);
        if (m.me) this.setMe(m.me);
        break;
      case 'me':
        this.setMe(m.data);
        break;
      case 'social':
        this.social = m.data;
        this.changed();
        break;
      case 'socialNotice':
        this.onNotice(m.data);
        break;
      case 'accountResult':
        if ((m.op === 'logout' || m.op === 'logoutAll') && m.ok) this.becomeGuest(core);
        if (m.op === 'register' && m.ok) write(GUEST_KEY, undefined); // that guest is now secured
        for (const fn of this.resultFns) fn(m);
        break;
      case 'socialResult':
        for (const fn of this.resultFns) fn(m);
        break;
    }
  }

  private setMe(me: MeInfo): void {
    this.me = me;
    write(ME_KEY, JSON.stringify(me));
    this.changed();
  }

  /** Logged out: back to the guest this device had before logging in (or a new one). */
  private becomeGuest(core: NetCore): void {
    const guest = read(GUEST_KEY);
    const name = read(GUEST_NAME_KEY);
    write(GUEST_KEY, undefined);
    write(GUEST_NAME_KEY, undefined);
    write(TOKEN_KEY, guest);
    core.token = guest;
    this.social = null;
    this.onLoggedOut(guest ? name : undefined);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Answers to account / friend requests. */
  onResult(fn: (r: AccountResult | SocialResult) => void): () => void {
    this.resultFns.add(fn);
    return () => void this.resultFns.delete(fn);
  }

  // ---------------- requests ----------------

  account(
    op: AccountOp,
    fields: { username?: string; password?: string; oldPassword?: string; code?: string } = {},
  ): void {
    // logging into another account: remember this guest so logging out returns to it
    if ((op === 'login' || op === 'recover') && this.me && !this.me.secured && this.token) {
      write(GUEST_KEY, this.token);
      write(GUEST_NAME_KEY, this.me.name);
    }
    this.core?.sendJson({ t: 'account', op, ...fields });
  }

  editProfile(patch: { name?: string; avatar?: number; banner?: number; title?: string }): void {
    this.core?.sendJson({ t: 'editProfile', ...patch });
  }

  friend(op: FriendOp, target: { id?: number; name?: string }): void {
    this.core?.sendJson({ t: 'friend', op, ...target });
  }

  invite(id: number): void {
    this.core?.sendJson({ t: 'invite', id });
  }

  joinFriend(id: number): void {
    this.core?.sendJson({ t: 'joinFriend', id });
  }

  refreshSocial(): void {
    this.core?.sendJson({ t: 'social' });
  }

  /** Is this account a friend / a pending request / blocked? */
  relation(id: number): 'me' | 'friend' | 'incoming' | 'outgoing' | 'blocked' | 'none' {
    if (this.me?.id === id) return 'me';
    const s = this.social;
    if (!s) return 'none';
    if (s.friends.some((f) => f.id === id)) return 'friend';
    if (s.incoming.some((f) => f.id === id)) return 'incoming';
    if (s.outgoing.some((f) => f.id === id)) return 'outgoing';
    if (s.blocked.some((f) => f.id === id)) return 'blocked';
    return 'none';
  }
}

export const account = new AccountStore();
