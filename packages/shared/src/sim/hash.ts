// Stable hash of world state for determinism checks.
import type { WorldState } from './state';

/** FNV-1a over the JSON encoding (events excluded — they are per-tick outputs). */
export const hashWorld = (w: WorldState): string => {
  const json = JSON.stringify({ ...w, events: undefined });
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + ':' + json.length;
};

/** Deep clone of plain state. */
export const cloneWorld = (w: WorldState): WorldState =>
  JSON.parse(JSON.stringify(w)) as WorldState;
