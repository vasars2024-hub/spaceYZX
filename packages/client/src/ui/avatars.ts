// Profile avatars: 16 preset block-robot faces and emblems, drawn like the menu icons (24×24
// line art in currentColor) on a tile tinted with the player's banner colour. No uploads.
import { AVATAR_COUNT, BANNER_COLORS } from '@space-yz/shared';

const HEAD = '<rect x="4.5" y="6" width="15" height="13" rx="3"/>';
const ANTENNA = '<path d="M12 6V3.5"/><circle cx="12" cy="2.8" r=".8" fill="currentColor"/>';
const eyes = (y = 11.5, r = 1.4) =>
  `<circle cx="9" cy="${y}" r="${r}" fill="currentColor"/><circle cx="15" cy="${y}" r="${r}" fill="currentColor"/>`;

/** Avatar artwork by index (AVATAR_COUNT of them), with a name for the picker. */
export const AVATARS: { name: string; body: string }[] = [
  { name: 'Classic', body: `${HEAD}${ANTENNA}${eyes()}<path d="M9.5 15.5h5"/>` },
  {
    name: 'Visor',
    body: `${HEAD}${ANTENNA}<rect x="7" y="10" width="10" height="3" rx="1.5" fill="currentColor" stroke="none"/><path d="M9.5 16h5"/>`,
  },
  {
    name: 'Cyclops',
    body: `${HEAD}${ANTENNA}<circle cx="12" cy="11.5" r="2.6"/><circle cx="12" cy="11.5" r="1" fill="currentColor"/><path d="M9.5 16h5"/>`,
  },
  {
    name: 'Grump',
    body: `${HEAD}${ANTENNA}${eyes(12)}<path d="M7.5 9l3 1.2M16.5 9l-3 1.2M9.5 16.2q2.5-1.4 5 0"/>`,
  },
  { name: 'Sunny', body: `${HEAD}${ANTENNA}${eyes()}<path d="M9 14.8q3 2.4 6 0"/>` },
  {
    name: 'Helmet',
    body: '<path d="M4.5 13a7.5 7.5 0 0 1 15 0v4.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M7 12.5h10v3.2H7z" fill="currentColor" stroke="none" opacity=".85"/><path d="M12 5.5V3"/>',
  },
  {
    name: 'Skullbot',
    body: '<path d="M5 11a7 7 0 0 1 14 0v3.2l-2 1.3V19H7v-3.5l-2-1.3z"/><rect x="7.8" y="10.2" width="3" height="2.6" rx=".6" fill="currentColor"/><rect x="13.2" y="10.2" width="3" height="2.6" rx=".6" fill="currentColor"/><path d="M10.5 19v-1.8M13.5 19v-1.8"/>',
  },
  {
    name: 'Kitbot',
    body: `<path d="M4.5 9.5 6 4l4 3h4l4-3 1.5 5.5V16a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3z"/>${eyes(12)}<path d="M10.8 15.5 12 16.3l1.2-.8"/>`,
  },
  {
    name: 'Boomerang',
    body: '<path d="M4 17 11 5.5c.6-1 2-1 2.6 0L20 17l-2.6 1.4L12 9.2 6.6 18.4z"/><circle cx="12.3" cy="6.6" r=".9" fill="currentColor"/>',
  },
  {
    name: 'Rocket',
    body: '<path d="M12 2.8c3 2.2 4.4 5.4 4.4 9.2v4H7.6v-4c0-3.8 1.4-7 4.4-9.2z"/><circle cx="12" cy="9.5" r="1.6"/><path d="M7.6 12.5 5 15.5V18l2.6-2M16.4 12.5l2.6 3V18l-2.6-2M10 18.5l2 2.7 2-2.7"/>',
  },
  {
    name: 'Nova',
    body: '<path d="M12 3l2.4 5.6 6.1.5-4.6 4 1.4 6-5.3-3.2-5.3 3.2 1.4-6-4.6-4 6.1-.5z"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  },
  {
    name: 'Surge',
    body: '<path d="M13.5 2.5 5.5 13.5H11l-1.5 8 8-11H12z" fill="currentColor" fill-opacity=".25"/>',
  },
  {
    name: 'Crown',
    body: '<path d="M4 17.5 3 7.5l5 4.2L12 5l4 6.7 5-4.2-1 10z"/><path d="M4.5 20h15"/><circle cx="12" cy="13.5" r="1.1" fill="currentColor"/>',
  },
  {
    name: 'Planet',
    body: '<circle cx="12" cy="12" r="5.2"/><path d="M3.5 15.5c1.5 2.2 9.5-.4 13.6-4.1 3.7-3.3 4.4-6 2.9-6.7-.9-.4-2.4 0-4.2 1"/><circle cx="18.8" cy="18.2" r=".9" fill="currentColor"/>',
  },
  {
    name: 'Aegis',
    body: '<path d="M12 3l7 3v5.5c0 4.3-3 7.6-7 9.5-4-1.9-7-5.2-7-9.5V6z"/><path d="M12 7.5v9M8.3 11.5h7.4"/>',
  },
  {
    name: 'Phantom',
    body:
      '<path d="M5.5 20V11a6.5 6.5 0 0 1 13 0v9l-2.2-1.6-2.1 1.6-2.2-1.6-2.2 1.6-2.1-1.6z"/>' +
      eyes(11, 1.3),
  },
];

/** SVG markup of an avatar (our own constant markup). */
export const avatarSvg = (i: number, size = 24): string =>
  `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${AVATARS[Math.max(0, Math.min(AVATAR_COUNT - 1, Math.floor(i) || 0))].body}</svg>`;

export const bannerColor = (i: number): string =>
  BANNER_COLORS[Math.max(0, Math.min(BANNER_COLORS.length - 1, Math.floor(i) || 0))];

/** An avatar tile in the player's banner colour. */
export const avatarEl = (avatar: number, banner: number, size = 36, cls = ''): HTMLSpanElement => {
  const s = document.createElement('span');
  s.className = `avatar ${cls}`.trim();
  s.style.setProperty('--av', bannerColor(banner));
  s.style.width = s.style.height = `${size}px`;
  s.innerHTML = avatarSvg(avatar, Math.round(size * 0.72));
  return s;
};
