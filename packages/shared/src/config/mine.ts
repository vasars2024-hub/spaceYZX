// Remote mine on / off per mode. One table for the owner to flip: `true` = players get one
// remote mine per round (per life in respawn modes), `false` = no mines in that mode.
// Rooms (server/src/game/hub.ts) and offline practice apply it with `withRemoteMine`.
import type { GameConfig } from './index';

export type RemoteMineMode =
  | 'tower' // Controller & Tower
  | 'bomb'
  | 'elim'
  | 'cs-bomb' // CS kit (AK + Deagle)
  | 'cs-elim'
  | 'arena'
  | 'cs-arena'
  | 'brawl'
  | 'brawl-ffa'
  | 'practice';

export const REMOTE_MINE_MODES: Record<RemoteMineMode, boolean> = {
  tower: true,
  bomb: true,
  elim: true,
  // the owner: CS modes have no remote mines
  'cs-bomb': false,
  'cs-elim': false,
  arena: true,
  'cs-arena': false,
  brawl: true,
  'brawl-ffa': true,
  practice: true,
};

/** The table entry for a room: its mode, its objective (match modes) and its kit. */
export const remoteMineMode = (
  mode: string,
  objective: 'tower' | 'bomb' | 'elim' | null,
  cs: boolean,
): RemoteMineMode => {
  if (mode === 'practice') return 'practice';
  if (mode === 'arena') return cs ? 'cs-arena' : 'arena';
  if (mode === 'brawl' || mode === 'brawl-ffa') return mode;
  const obj = objective ?? 'tower';
  if (cs) return obj === 'elim' ? 'cs-elim' : 'cs-bomb';
  return obj;
};

/**
 * A copy of `config` with the remote mine switched for this mode. Tower mode also bans mines
 * on the Towers (owner: placing near one is fine, on it is not).
 */
export const withRemoteMine = (config: GameConfig, mode: RemoteMineMode): GameConfig => ({
  movement: { ...config.movement },
  combat: {
    ...config.combat,
    mineEnabled: REMOTE_MINE_MODES[mode] ? 1 : 0,
    mineTowerBan: mode === 'tower' ? 1 : 0,
  },
  rules: { ...config.rules },
});
