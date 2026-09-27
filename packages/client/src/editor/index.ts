// MAP MAKER — entry (search term: map maker, map editor). The title screen's Map Maker tile opens
// the start screen (continue, a new map, change a built-in map, My Maps); picking one opens the
// editor (editor/editor.ts). Desktop only: it needs a keyboard and a mouse.
import './editor.css';
import { isTouchDevice, readDeviceEnv } from '../mobile';
import type { App } from '../app';
import type { Dir } from '../ui/menu-kit';
import { screenHead } from '../ui/menu-kit';
import { h } from '../ui/menus';
import { MapEditor } from './editor';
import type { EditorSession } from './session';
import { startScreen } from './start-screen';

let current: MapEditor | null = null;

/** Open the Map Maker (its start screen). */
export const openMapMaker = (app: App, dir: Dir = 'forward'): void => {
  if (app.mobile || isTouchDevice(readDeviceEnv())) {
    app.setScreen(
      h(
        'div',
        { class: 'screen interactive flow-screen' },
        screenHead('map', 'Map Maker', () => app.showTitle()),
        h(
          'div',
          { class: 'panel' },
          'Map Maker needs a keyboard and mouse. Open the game on a computer to build maps.',
        ),
      ),
      dir,
    );
    return;
  }
  startScreen(app, dir, (s) => openEditor(app, s));
};

/** Open the editor on a session (a new map, a saved one, the draft, or back from a test). */
export const openEditor = (app: App, session: EditorSession, notice?: string): void => {
  current?.dispose();
  const ed: MapEditor = new MapEditor(app, session, {
    exit: () => {
      ed.dispose();
      if (current === ed) current = null;
      startScreen(app, 'back', (s) => openEditor(app, s));
    },
    reopen: (msg) => openEditor(app, session, msg),
  });
  current = ed;
  if (notice) ed.ui.toast(notice);
};
