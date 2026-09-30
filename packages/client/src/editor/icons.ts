// MAP MAKER — tool and palette icons (inline SVG line icons in the menu icons' style,
// ui/icons.ts: 24×24, currentColor).
const svg = (body: string): string =>
  `<svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" ` +
  `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ` +
  `aria-hidden="true">${body}</svg>`;

export const EDITOR_ICONS = {
  select: svg('<path d="M5 3l13 8-6 1.5L9 19z"/><path d="M12 12.5l5 6"/>'),
  platform: svg('<path d="M3 11l9-4 9 4-9 4z"/><path d="M3 11v2.5l9 4 9-4V11"/>'),
  block: svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>'),
  wall: svg(
    '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9h16M4 14h16M9 4v5M15 9v5M9 14v6"/>',
  ),
  wedge: svg('<path d="M3 19h18V7z"/><path d="M7 19l14-9"/>'),
  surf: svg('<path d="M2 19L12 5l10 14z"/><path d="M12 5v14"/>'),
  surfSide: svg('<path d="M5 19V5l15 14z"/>'),
  curveSurf: svg(
    '<path d="M4 20c0-9 7-16 16-16"/><path d="M9 20c0-6 5-11 11-11"/><path d="M4 20h5M20 4v5"/>',
  ),
  curveRamp: svg(
    '<path d="M12 21c-5 0-8-2-8-4s3-4 8-4 8-2 8-4-3-4-8-4"/><path d="M9 3.5L12 5 9 6.5"/>',
  ),
  quarterPipe: svg('<path d="M3 19h9a8 8 0 0 0 8-8V4"/><path d="M3 21h18V4"/>'),
  curvePlatform: svg('<path d="M4 20a16 16 0 0 1 16-16"/><path d="M9 20A11 11 0 0 1 20 9"/>'),
  cylinder: svg(
    '<ellipse cx="12" cy="8" rx="8" ry="3"/><path d="M4 8v6c0 1.7 3.6 3 8 3s8-1.3 8-3V8"/>',
  ),
  pillar: svg(
    '<ellipse cx="12" cy="5" rx="4" ry="1.6"/><path d="M8 5v14c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6V5"/>',
  ),
  glass: svg(
    '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M8 15l6-6M11 17l6-6" stroke-width="1.3"/>',
  ),
  killpaint: svg(
    '<path d="M3 16l9-4 9 4-9 4z" fill="currentColor" fill-opacity=".35"/><path d="M12 3v6M9.5 6.5L12 9l2.5-2.5"/>',
  ),
  start: svg('<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>'),
  checkpoint: svg('<path d="M4 20V8a8 8 0 0 1 16 0v12"/><path d="M8 20V9a4 4 0 0 1 8 0v11"/>'),
  finish: svg(
    '<path d="M5 21V4"/><path d="M5 4h13v9H5"/><path d="M5 8.5h13M9.3 4v9M13.7 4v9" stroke-width="1.2"/>',
  ),
  spawn: svg('<circle cx="12" cy="6" r="3"/><path d="M12 9v7M8 21l4-5 4 5M7 12h10"/>'),
  portal: svg('<ellipse cx="12" cy="12" rx="6" ry="9"/><ellipse cx="12" cy="12" rx="2.5" ry="5"/>'),
  pad: svg('<path d="M3 18l9-3 9 3-9 3z"/><path d="M12 13V3M8 7l4-4 4 4"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
  save: svg('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
  publish: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>'),
  restore: svg('<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v5h5"/>'),
  test: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  help: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>',
  ),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>'),
  copy: svg(
    '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  ),
  move: svg(
    '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  ),
  rotate: svg('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>'),
  exit: svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
  moving: svg(
    '<rect x="3" y="9" width="7" height="6" rx="1"/><path d="M13 12h8M18 9l3 3-3 3" /><path d="M13 8h3M13 16h3" stroke-width="1.2"/>',
  ),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  hand: svg(
    '<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L3.8 15a1.6 1.6 0 0 1 2.5-2L8 15"/>',
  ),
  bag: svg(
    '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/><path d="M9 12h6" stroke-width="1.3"/>',
  ),
  // curve types
  kindArc: svg('<path d="M4 20A16 16 0 0 1 20 4"/>'),
  kindS: svg('<path d="M4 20c0-8 16-8 16-16"/>'),
  kindSpiral: svg('<path d="M12 12a2 2 0 1 1 2 2 4 4 0 1 1-4-4 6 6 0 1 1 6 6 8 8 0 0 1-8-8"/>'),
  kindWave: svg('<path d="M2 14c2.5-6 5-6 7.5 0s5 6 7.5 0 3.5-4 5-3"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  eye: svg(
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ),
  map: svg(
    '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  ),
} as const;

export type EditorIconName = keyof typeof EDITOR_ICONS;

export const edIcon = (name: EditorIconName, cls = ''): HTMLSpanElement => {
  const s = document.createElement('span');
  s.className = `icon-wrap ${cls}`.trim();
  s.innerHTML = EDITOR_ICONS[name]; // our own constant markup
  return s;
};
