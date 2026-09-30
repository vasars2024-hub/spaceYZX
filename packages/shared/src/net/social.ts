// Accounts, profiles and friends: the rules both sides check (usernames, passwords, titles,
// avatars, banners) and the shapes of the account / social messages (net/protocol.ts).
// Passwords are only ever checked for length here; the server hashes them (scrypt).

/** Usernames (secured accounts): same characters as nicknames, 3–16 of them. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;
export const PASSWORD_MIN = 8;
/** Longer inputs are refused (hashing cost stays bounded). */
export const PASSWORD_MAX = 128;
/** Profile tagline. */
export const TITLE_MAX = 32;
/** Preset avatars (client ui/avatars.ts draws them) and banner colours. */
export const AVATAR_COUNT = 16;
export const BANNER_COLORS: readonly string[] = [
  '#19e3ff',
  '#ff8a1f',
  '#3dff9a',
  '#ff4a5e',
  '#b47bff',
  '#ffd23f',
  '#4a7dff',
  '#ff5fc8',
  '#7ce0c3',
  '#c9d4e8',
  '#8a5a2b',
  '#2b3a55',
];
/** A secured account's display name (= username) can change once per this long. */
export const NAME_CHANGE_COOLDOWN_MS = 7 * 86_400_000;
export const FRIENDS_MAX = 200;

/** Names nobody may take (staff look-alikes, bot / guest / system names). */
const RESERVED = new Set([
  'admin',
  'administrator',
  'moderator',
  'mod',
  'owner',
  'server',
  'system',
  'support',
  'staff',
  'official',
  'dev',
  'developer',
  'lethalrecoil',
  'spaceyz',
  'anthropic',
  'claude',
  'guest',
  'player',
  'pilot',
  'bot',
  'you',
  'left',
  'nobody',
  'null',
  'undefined',
]);
const RESERVED_PATTERNS = [/^(bot|pilot|player|racer|guest)\d*$/];

/**
 * A small list of offensive words, matched inside names after undoing leetspeak (words that
 * hide inside ordinary names — "grape", "peacock" — are left out).
 */
const OFFENSIVE = [
  'fuck',
  'shit',
  'cunt',
  'nigg',
  'fag',
  'nazi',
  'hitler',
  'whore',
  'slut',
  'dick',
  'pussy',
  'retard',
  'penis',
  'porn',
  'bitch',
  'twat',
  'wank',
];

/** Lowercase, leetspeak undone, separators removed: what the filters compare. */
const squash = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[0@4]/g, (c) => (c === '0' ? 'o' : 'a'))
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/[\s_.-]+/g, '');

/** Does this text contain one of the offensive words? */
export const isOffensive = (text: string): boolean => {
  const s = squash(text);
  return OFFENSIVE.some((w) => s.includes(w));
};

/** The case-insensitive key two usernames are compared by. */
export const usernameKey = (name: string): string =>
  name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Is this name reserved (or offensive)? Spaces, _ - . and leetspeak don't hide it. */
export const isReservedName = (name: string): boolean => {
  const flat = usernameKey(name).replace(/[\s_.-]+/g, '');
  return (
    RESERVED.has(flat) ||
    RESERVED.has(squash(name)) ||
    RESERVED_PATTERNS.some((re) => re.test(flat)) ||
    isOffensive(name)
  );
};

/**
 * Check a username: the same characters as a nickname (letters, digits, space, _ - .),
 * 3–16 of them, at least one letter, not reserved or offensive. Returns the cleaned name
 * (spaces collapsed) and its unique key, or what's wrong.
 */
export const checkUsername = (
  raw: unknown,
): { ok: true; name: string; key: string } | { ok: false; error: string } => {
  if (typeof raw !== 'string') return { ok: false, error: 'Pick a username.' };
  const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX)
    return {
      ok: false,
      error: `Usernames are ${USERNAME_MIN}–${USERNAME_MAX} characters long.`,
    };
  if (/[^\p{L}\p{N} _\-.]/u.test(name))
    return { ok: false, error: 'Use letters, numbers, spaces, _ - and . only.' };
  if (!/\p{L}/u.test(name)) return { ok: false, error: 'Usernames need at least one letter.' };
  if (isReservedName(name)) return { ok: false, error: 'That username is not allowed.' };
  return { ok: true, name, key: usernameKey(name) };
};

/** What's wrong with a new password (null = fine). */
export const passwordProblem = (pw: unknown): string | null => {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN)
    return `Passwords need at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Passwords can be at most ${PASSWORD_MAX} characters.`;
  if (/^(.)\1*$/.test(pw)) return 'That password is too easy to guess.';
  if (['password', 'password1', '12345678', '123456789', 'qwertyuiop', 'iloveyou'].includes(pw))
    return 'That password is too easy to guess.';
  return null;
};

/**
 * Clean a profile tagline: control characters removed, whitespace collapsed, at most
 * TITLE_MAX characters. '' clears it; null = refused (too long, offensive, not text).
 */
export const cleanTitle = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || raw.length > TITLE_MAX * 4) return null;
  const s = raw
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/gu, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > TITLE_MAX || isOffensive(s)) return null;
  return s;
};

export const validAvatar = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < AVATAR_COUNT;
export const validBanner = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < BANNER_COLORS.length;

// ------------------------------------------------------------------------------------------
// Message shapes

/** Your own account, as the server tells you (welcome.me and 'me' messages). */
export interface MeInfo {
  id: number;
  /** display name (a secured account's is its username) */
  name: string;
  /** has a username + password */
  secured: boolean;
  avatar: number;
  banner: number;
  title: string;
  createdAt: number;
  /** secured: when the name may change again (ms since 1970; null = now) */
  nameChangeAt: number | null;
  /** may publish official edits of the built-in maps (the host grants it on the dashboard) */
  admin?: boolean;
}

/** What a player shows in lists: name, avatar, banner colour. */
export interface PlayerCard {
  id: number;
  name: string;
  avatar: number;
  banner: number;
  secured: boolean;
}

/** Where a friend is right now. */
export interface Presence {
  state: 'offline' | 'menu' | 'room' | 'match' | 'ranked';
  /** in a room: its mode (RoomMode), objective ('tower', 'bomb'…) and map */
  mode?: string;
  objective?: string;
  map?: string;
  players?: number;
  maxPlayers?: number;
  /** you may join them (a casual room with space) */
  joinable?: boolean;
  /** offline: last seen (ms since 1970) */
  lastSeen?: number;
}

export interface FriendEntry extends PlayerCard {
  presence: Presence;
  since: number;
}

export interface SocialState {
  friends: FriendEntry[];
  /** requests to you / from you (newest first) */
  incoming: (PlayerCard & { at: number })[];
  outgoing: (PlayerCard & { at: number })[];
  blocked: PlayerCard[];
  max: number;
}

export type AccountOp =
  'register' | 'login' | 'logout' | 'logoutAll' | 'password' | 'recover' | 'recoveryCode';

export type FriendOp = 'request' | 'accept' | 'decline' | 'cancel' | 'remove' | 'block' | 'unblock';

/** A toast-worthy social event. */
export interface SocialNotice {
  kind: 'request' | 'accepted' | 'invite' | 'party';
  from: PlayerCard;
  /** invite: the room to join */
  room?: { code: string; mode: string; map: string };
  /** party: an invite to `from`'s party (join with { t: 'party', op: 'join', id: from.id }) */
  party?: { size: number };
}

// ------------------------------------------------------------------------------------------
// Parties (server services/party.ts; in memory, no database)

/** Most players in a party (a full Premier team). */
export const PARTY_MAX = 5;

/**
 * 'create' a party (you lead it), 'invite' a friend (they get a toast with Join), 'join' the
 * party of the leader `id` who invited you, 'decline' that invite, 'leave', 'kick' a member
 * (leader), 'promote' a member to leader (leader), 'ready' / 'unready' (optional, shown only).
 */
export type PartyOp =
  'create' | 'invite' | 'join' | 'decline' | 'leave' | 'kick' | 'promote' | 'ready' | 'unready';

export interface PartyMemberView extends PlayerCard {
  leader: boolean;
  ready: boolean;
  online: boolean;
}

/** Your party as the server sends it ({ t: 'party' }; null = not in one). */
export interface PartyView {
  /** the leader's account id */
  leader: number;
  members: PartyMemberView[];
  /** invited, not joined yet */
  invited: PlayerCard[];
  max: number;
  /** the leader's search (it applies to everyone): ranked queues and / or the casual pick */
  search: {
    ranked: string[] | null;
    casual: { modes: string[]; sizes: string[] } | null;
    waitSec: number;
  } | null;
}
