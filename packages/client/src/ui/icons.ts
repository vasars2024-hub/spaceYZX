// Menu icons: small line icons (inline SVG, 24×24, drawn in currentColor so CSS colors them),
// bot difficulty badges, and map thumbnails drawn from each map's real layout (floors by
// level, bomb sites, Towers, spawns) so a new map gets its picture for free.
import type { LevelDef } from '@space-yz/shared';

const svg = (body: string, size = 24): string =>
  `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
  `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ` +
  `aria-hidden="true">${body}</svg>`;

/** Line icons by name. */
export const ICONS = {
  // modes
  tower: svg(
    '<path d="M9 21h6M10 21l1-12h2l1 12"/><path d="M8 9h8l-1-3H9z"/><path d="M12 6V3"/><circle cx="12" cy="2.6" r=".6" fill="currentColor"/><path d="M5 5.5a8 8 0 0 1 2-2.5M19 5.5a8 8 0 0 0-2-2.5"/>',
  ),
  bomb: svg(
    '<rect x="3" y="10" width="18" height="9" rx="1.5"/><rect x="6" y="12.5" width="7" height="4" rx=".5"/><path d="M15.5 13h3M15.5 16h3"/><path d="M8 10V7.5a2 2 0 0 1 2-2h1.5"/><circle cx="14" cy="5.5" r="1" fill="currentColor"/>',
  ),
  // Elimination: a skull (last team standing)
  elim: svg(
    '<path d="M5 11a7 7 0 0 1 14 0v3.2l-2 1.3V19H7v-3.5l-2-1.3z"/><circle cx="9.3" cy="11.6" r="1.5" fill="currentColor"/><circle cx="14.7" cy="11.6" r="1.5" fill="currentColor"/><path d="M12 14.2v1.3M10.5 19v-1.8M13.5 19v-1.8"/>',
  ),
  cs: svg(
    '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  ),
  arena: svg(
    '<path d="M4 20 14.5 9.5M9.5 9.5 20 20"/><path d="M14.5 9.5 18 4l2 2-5.5 3.5M9.5 9.5 6 4 4 6l5.5 3.5"/><path d="M6 16l2 2M18 16l-2 2"/>',
  ),
  freefight: svg(
    '<path d="M12 2l2.2 5.8L20 6l-3.5 5L21 14l-6 .5L14 21l-2-5-2 5-1-6.5L3 14l4.5-3L4 6l5.8 1.8z"/>',
  ),
  range: svg(
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  ),
  playground: svg(
    '<path d="M3 19c4-1 6-5 8-9s4-6 10-6"/><circle cx="5" cy="18.4" r="1.4"/><path d="M14 20h7M17.5 16.5V20"/>',
  ),
  // menu
  online: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.6 5.7 3.6 9S14.5 18.3 12 21c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3z"/>',
  ),
  practice: svg(
    '<rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 7V4M9 12h.01M15 12h.01M9.5 15h5"/><path d="M5 11H3v3h2M19 11h2v3h-2"/>',
  ),
  ranked: svg(
    '<path d="M12 3l7 4v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V7z"/><path d="M8.5 11 12 8.5l3.5 2.5M8.5 15 12 12.5l3.5 2.5"/>',
  ),
  leaderboard: svg(
    '<path d="M4 21V13h5v8M9 21V8h6v13M15 21v-6h5v6M3 21h18"/><path d="M12 3.5l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z"/>',
  ),
  profile: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/>'),
  settings: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  ),
  controls: svg(
    '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  ),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  next: svg('<path d="M9 18l6-6-6-6"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  map: svg(
    '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  ),
  team: svg(
    '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M2.5 20c.8-3.4 2.9-5.2 5.5-5.2s4.7 1.8 5.5 5.2M13.5 15.2c.9-.6 1.9-.9 3-.9 2.2 0 3.9 1.4 4.6 4.2"/>',
  ),
  bot: svg(
    '<rect x="4.5" y="7" width="15" height="12" rx="3"/><path d="M12 7V4"/><circle cx="12" cy="3.3" r=".8" fill="currentColor"/><circle cx="9" cy="12.5" r="1.3" fill="currentColor"/><circle cx="15" cy="12.5" r="1.3" fill="currentColor"/><path d="M9.5 16h5"/>',
  ),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  quit: svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
  plus: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 8v8M8 12h8"/>'),
  key: svg(
    '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2"/><circle cx="8" cy="15" r="1" fill="currentColor"/>',
  ),
  respawn: svg('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>'),
  training: svg(
    '<path d="M3 10v4M21 10v4M6 7v10M18 7v10"/><rect x="6" y="10.5" width="12" height="3" rx="1"/>',
  ),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
} as const;

export type IconName = keyof typeof ICONS;

/** An icon as a DOM element (safe: the markup is our own constant). */
export const icon = (name: IconName, cls = ''): HTMLSpanElement => {
  const s = document.createElement('span');
  s.className = `icon-wrap ${cls}`.trim();
  s.innerHTML = ICONS[name];
  return s;
};

/** Bot difficulty levels in order, easiest first (ids from the shared bot presets). */
export const BOT_LEVEL_ORDER = ['rookie', 'casual', 'easy', 'normal', 'hard'] as const;

/** A bot face with 1–5 filled pips; the color warms from green (rookie) to red (hard). */
export const botBadge = (skill: string): HTMLSpanElement => {
  const i = Math.max(0, BOT_LEVEL_ORDER.indexOf(skill as (typeof BOT_LEVEL_ORDER)[number]));
  const n = i + 1;
  const hue = 130 - i * 30; // 130 green → 10 red
  const pips = Array.from({ length: 5 }, (_, k) => {
    const x = 3.5 + k * 4.25;
    return `<rect x="${x}" y="20.5" width="3" height="2.2" rx=".6" fill="${k < n ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="0.8"/>`;
  }).join('');
  const s = document.createElement('span');
  s.className = 'icon-wrap bot-badge';
  s.style.color = `hsl(${hue} 85% 58%)`;
  s.innerHTML =
    `<svg class="icon" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">` +
    `<rect x="5" y="4.5" width="14" height="12" rx="3"/><path d="M12 4.5V2.5"/>` +
    `<circle cx="9.3" cy="10" r="1.3" fill="currentColor"/><circle cx="14.7" cy="10" r="1.3" fill="currentColor"/>` +
    (i >= 3 ? '<path d="M8 7.5l2.6 1M16 7.5l-2.6 1"/>' : '') +
    `<path d="${i >= 3 ? 'M9.5 14h5' : 'M9.5 13.5q2.5 1.6 5 0'}"/>${pips}</svg>`;
  return s;
};

const TEAM = ['#19e3ff', '#ff8a1f'];

/**
 * A top-down picture of a map from its level data: floors shaded by level (basement darker,
 * upper decks lighter), bomb sites, Towers and spawns. Returns SVG markup.
 */
export const mapThumbnail = (def: LevelDef, w = 220, h = 140): string => {
  // walkable slabs: thin boxes, inside the ship (the sky arena etc. far above is left out)
  const floors = def.boxes.filter(
    (b) => !b.noRender && b.h.y <= 1.2 && Math.max(b.h.x, b.h.z) >= 1 && b.c.y < 40,
  );
  if (floors.length === 0) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of floors) {
    minX = Math.min(minX, b.c.x - b.h.x);
    maxX = Math.max(maxX, b.c.x + b.h.x);
    minZ = Math.min(minZ, b.c.z - b.h.z);
    maxZ = Math.max(maxZ, b.c.z + b.h.z);
  }
  const pad = 6;
  const s = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
  const ox = (w - (maxX - minX) * s) / 2;
  const oz = (h - (maxZ - minZ) * s) / 2;
  const X = (x: number) => (ox + (x - minX) * s).toFixed(1);
  const Z = (z: number) => (oz + (z - minZ) * s).toFixed(1);
  const shade = (top: number) => (top < -1 ? '#3a2d63' : top > 2.5 ? '#5f86c2' : '#2c4470');
  // lower floors first so upper decks draw on top
  const sorted = [...floors].sort((a, b) => a.c.y + a.h.y - (b.c.y + b.h.y));
  let g = '';
  for (const b of sorted) {
    const top = b.c.y + b.h.y;
    g += `<rect x="${X(b.c.x - b.h.x)}" y="${Z(b.c.z - b.h.z)}" width="${(b.h.x * 2 * s).toFixed(1)}" height="${(b.h.z * 2 * s).toFixed(1)}" fill="${shade(top)}" opacity="0.92"/>`;
  }
  for (const site of def.bombSites ?? []) {
    const x0 = +X(site.min.x);
    const z0 = +Z(site.min.z);
    const x1 = +X(site.max.x);
    const z1 = +Z(site.max.z);
    g += `<rect x="${x0}" y="${z0}" width="${x1 - x0}" height="${z1 - z0}" fill="rgba(255,90,106,.18)" stroke="#ff5a6a" stroke-width="1.2"/>`;
    g += `<text x="${(x0 + x1) / 2}" y="${(z0 + z1) / 2}" fill="#ff8b98" font-size="${Math.max(9, s * 8)}" font-weight="800" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, sans-serif">${site.name}</text>`;
  }
  for (const sp of def.spawns)
    if (sp.team !== undefined)
      g += `<circle cx="${X(sp.pos.x)}" cy="${Z(sp.pos.z)}" r="1.6" fill="${TEAM[sp.team]}" opacity="0.8"/>`;
  for (const t of def.towers) {
    const cx = +X(t.pos.x);
    const cz = +Z(t.pos.z);
    g += `<rect x="${cx - 3.5}" y="${cz - 3.5}" width="7" height="7" transform="rotate(45 ${cx} ${cz})" fill="#07101e" stroke="${TEAM[t.team] ?? '#fff'}" stroke-width="1.6"/>`;
  }
  return `<svg class="map-thumb" viewBox="0 0 ${w} ${h}" role="img" aria-label="Top-down view of ${def.name}">${g}</svg>`;
};
