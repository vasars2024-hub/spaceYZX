// The casual (unranked) matchmaking queue: players tick the modes and team sizes they'd play,
// and the server forms the match that suits the most people (server services/queue.ts calls
// pickCasualMatch() every second). A full match starts at once; otherwise, once the longest
// waiter has waited CASUAL_BOT_FILL_SEC, the best match that includes them starts with bots in
// the missing slots (casual only — ranked never has bots). Parties search as one unit and play
// on one team. Pure and deterministic. The Play button's quick-play Brawl is separate.
import type { MatchObjective } from '../rules/match';
import type { LoadoutName } from '../config/loadout';
import type { TeamMode } from '../rating/global';

export type CasualModeId =
  'tower' | 'bomb' | 'elim' | 'cs' | 'elim-cs' | 'brawl' | 'brawl-ffa' | 'arena';

export interface CasualModeDef {
  id: CasualModeId;
  name: string;
  /** a match room (1v1…5v5 with an objective), a Brawl room or an Arena room */
  kind: 'match' | 'brawl' | 'brawl-ffa' | 'arena';
  objective: MatchObjective;
  loadout: LoadoutName;
}

export const CASUAL_MODES: readonly CasualModeDef[] = [
  { id: 'tower', name: 'Tower', kind: 'match', objective: 'tower', loadout: 'lethal' },
  { id: 'bomb', name: 'Bomb', kind: 'match', objective: 'bomb', loadout: 'lethal' },
  { id: 'elim', name: 'Elimination', kind: 'match', objective: 'elim', loadout: 'lethal' },
  { id: 'cs', name: 'CS Bomb', kind: 'match', objective: 'bomb', loadout: 'cs' },
  { id: 'elim-cs', name: 'CS Elimination', kind: 'match', objective: 'elim', loadout: 'cs' },
  { id: 'brawl', name: 'Brawl TDM', kind: 'brawl', objective: 'tower', loadout: 'lethal' },
  { id: 'brawl-ffa', name: 'Brawl FFA', kind: 'brawl-ffa', objective: 'tower', loadout: 'lethal' },
  { id: 'arena', name: 'Arena', kind: 'arena', objective: 'tower', loadout: 'lethal' },
];

export const CASUAL_MODE_IDS: readonly CasualModeId[] = CASUAL_MODES.map((m) => m.id);
/** Team sizes you can tick (Brawl FFA and Arena turn them into player counts). */
export const CASUAL_SIZES: readonly TeamMode[] = ['1v1', '2v2', '3v3', '5v5'];

export const casualMode = (id: unknown): CasualModeDef | undefined =>
  CASUAL_MODES.find((m) => m.id === id);

/** Seconds the longest waiter waits for a full match before bots fill the missing slots. */
export const CASUAL_BOT_FILL_SEC = 30;

const TEAM: Record<TeamMode, number> = { '1v1': 1, '2v2': 2, '3v3': 3, '5v5': 5 };
/** Brawl FFA / Arena: players in all for each size card (like the room wizard's). */
const FFA_PLAYERS: Record<TeamMode, number> = { '1v1': 4, '2v2': 6, '3v3': 8, '5v5': 10 };
const ARENA_PLAYERS: Record<TeamMode, number> = { '1v1': 2, '2v2': 4, '3v3': 6, '5v5': 8 };

/** Players per team (team modes) — FFA and Arena have one "team" of everyone. */
export const casualTeamSize = (mode: CasualModeDef, size: TeamMode): number =>
  mode.kind === 'match' || mode.kind === 'brawl' ? TEAM[size] : casualPlayers(mode, size);

/** Everyone a match of this mode and size holds. */
export const casualPlayers = (mode: CasualModeDef, size: TeamMode): number =>
  mode.kind === 'brawl-ffa'
    ? FFA_PLAYERS[size]
    : mode.kind === 'arena'
      ? ARENA_PLAYERS[size]
      : TEAM[size] * 2;

/** What a player (or a party's leader) ticked. */
export interface CasualPick {
  modes: CasualModeId[];
  sizes: TeamMode[];
}

/** Clean a pick from the network: known values only, no duplicates (null: nothing ticked). */
export const cleanCasualPick = (raw: unknown): CasualPick | null => {
  const r = (raw ?? {}) as { modes?: unknown; sizes?: unknown };
  const modes = Array.isArray(r.modes)
    ? CASUAL_MODE_IDS.filter((m) => (r.modes as unknown[]).includes(m))
    : [];
  const sizes = Array.isArray(r.sizes)
    ? CASUAL_SIZES.filter((s) => (r.sizes as unknown[]).includes(s))
    : [];
  return modes.length && sizes.length ? { modes, sizes } : null;
};

export interface CasualSearcher extends CasualPick {
  id: string;
  /** players in this entry (a party) */
  size: number;
  joinedAtMs: number;
}

export interface CasualMatch {
  mode: CasualModeId;
  size: TeamMode;
  /** searcher ids, longest waiter first */
  members: string[];
  /** humans in it */
  players: number;
  /** empty slots bots fill */
  bots: number;
  /** team modes: which team each searcher plays on (parties stay together) */
  teams: Record<string, 0 | 1>;
}

/**
 * Put parties onto two teams of `teamSize` (biggest first, onto the emptier team). Null: they
 * don't fit.
 */
export const casualTeams = (
  entries: readonly { id: string; size: number }[],
  teamSize: number,
): Record<string, 0 | 1> | null => {
  const free: [number, number] = [teamSize, teamSize];
  const out: Record<string, 0 | 1> = {};
  const list = [...entries].sort((a, b) => b.size - a.size || (a.id < b.id ? -1 : 1));
  for (const e of list) {
    const t: 0 | 1 = free[0] >= free[1] ? 0 : 1;
    if (e.size > free[t]) return null;
    free[t] -= e.size;
    out[e.id] = t;
  }
  return out;
};

/**
 * The next casual match to start, or null (keep waiting). For every mode × size someone ticked
 * it gathers the searchers who ticked both (longest waiters first, as many as fit, parties
 * whole). A full one starts at once (the one with the most players; ties: the one including
 * the longest waiter, then menu order). Otherwise, once the longest waiter has waited
 * `botFillMs`, the fullest option that includes them starts, bots filling the rest.
 */
export const pickCasualMatch = (
  searchers: readonly CasualSearcher[],
  nowMs: number,
  opts: { botFillMs?: number } = {},
): CasualMatch | null => {
  const botFillMs = opts.botFillMs ?? CASUAL_BOT_FILL_SEC * 1000;
  const byWait = [...searchers].sort(
    (a, b) => a.joinedAtMs - b.joinedAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  if (!byWait.length) return null;
  const options: (CasualMatch & { rank: number; hasOldest: boolean })[] = [];
  let rank = 0;
  for (const mode of CASUAL_MODES)
    for (const size of CASUAL_SIZES) {
      rank++;
      const cap = casualPlayers(mode, size);
      const team = mode.kind === 'match' || mode.kind === 'brawl' ? TEAM[size] : 0;
      const picked: CasualSearcher[] = [];
      let players = 0;
      for (const s of byWait) {
        if (!s.modes.includes(mode.id) || !s.sizes.includes(size)) continue;
        if (players + s.size > cap) continue;
        if (team && !casualTeams([...picked, s], team)) continue;
        picked.push(s);
        players += s.size;
      }
      if (!picked.length) continue;
      options.push({
        mode: mode.id,
        size,
        members: picked.map((s) => s.id),
        players,
        bots: cap - players,
        teams: team ? casualTeams(picked, team)! : {},
        rank,
        hasOldest: picked[0] === byWait[0],
      });
    }
  const better = (a: (typeof options)[number], b: (typeof options)[number]) =>
    b.players - a.players || Number(b.hasOldest) - Number(a.hasOldest) || a.rank - b.rank;
  const full = options.filter((o) => o.bots === 0).sort(better);
  let pick = full[0];
  if (!pick && nowMs - byWait[0].joinedAtMs >= botFillMs)
    pick = options.filter((o) => o.hasOldest).sort(better)[0];
  if (!pick) return null;
  return {
    mode: pick.mode,
    size: pick.size,
    members: pick.members,
    players: pick.players,
    bots: pick.bots,
    teams: pick.teams,
  };
};
