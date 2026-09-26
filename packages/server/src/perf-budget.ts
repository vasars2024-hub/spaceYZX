// Measured costs (npm run load, headless bots over WebSockets, one modern CPU core) used by the
// host dashboard's capacity estimate. Re-run `npm run load` after big changes and update.
import type { RankedMode } from '@space-yz/shared';

export const MEASURED: Record<
  RankedMode,
  { players: number; tickMs: number; kbpsPerPlayer: number }
> = {
  '1v1': { players: 2, tickMs: 0.39, kbpsPerPlayer: 8.5 },
  '2v2': { players: 4, tickMs: 0.43, kbpsPerPlayer: 9.8 },
  '5v5': { players: 10, tickMs: 0.89, kbpsPerPlayer: 13.5 },
};

/** Share of one CPU core the game loop may use (the rest: OS, browser, the host's own game). */
export const CPU_SHARE = 0.6;

/**
 * How many simultaneous matches of `mode` the host can run, limited by CPU (one core) and by
 * the upload speed (Mbit/s). Upload is usually the real limit on home internet.
 */
export const capacity = (
  mode: RankedMode,
  uploadMbps: number,
): { matches: number; players: number; limit: 'cpu' | 'upload' } => {
  const m = MEASURED[mode];
  const byCpu = Math.floor(((1000 / 60) * CPU_SHARE) / m.tickMs);
  // KB/s -> Mbit/s, with 30% headroom for TCP/WebSocket overhead and spikes
  const perMatchMbps = (m.kbpsPerPlayer * m.players * 8 * 1.3) / 1000;
  const byUpload = Math.floor(uploadMbps / perMatchMbps);
  const matches = Math.max(0, Math.min(byCpu, byUpload));
  return { matches, players: matches * m.players, limit: byUpload < byCpu ? 'upload' : 'cpu' };
};
