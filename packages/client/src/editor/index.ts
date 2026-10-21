// MAP MAKER — entry (search term: map maker, map editor). The title screen's Map Maker tile opens
// the start screen (continue, a new map, change a built-in map, My Maps); picking one opens the
// editor (editor/editor.ts): mouse + keyboard on a computer, touch on phones and tablets
// (editor/touch-ui.ts, Minecraft Pocket Edition style).
import './editor.css';
import { isTouchDevice, readDeviceEnv } from '../mobile';
import type { App } from '../app';
import type { Dir } from '../ui/menu-kit';
import { MapEditor } from './editor';
import type { EditorSession } from './session';
import { startScreen } from './start-screen';

let current: MapEditor | null = null;

/** Open the Map Maker (its start screen). */
export const openMapMaker = (app: App, dir: Dir = 'forward'): void => {
  startScreen(app, dir, (s) => openEditor(app, s));
};

/** Phones and tablets get the touch editor (the touch layout, detected or forced in Settings). */
const touchEditor = (app: App): boolean => app.mobile || isTouchDevice(readDeviceEnv());

/** Open the editor on a session (a new map, a saved one, the draft, or back from a test). */
export const openEditor = (app: App, session: EditorSession, notice?: string): void => {
  current?.dispose();
  const ed: MapEditor = new MapEditor(
    app,
    session,
    {
      exit: () => {
        ed.dispose();
        if (current === ed) current = null;
        startScreen(app, 'back', (s) => openEditor(app, s));
      },
      reopen: (msg) => openEditor(app, session, msg),
    },
    { touch: touchEditor(app) },
  );
  current = ed;
  if (notice) ed.ui.toast(notice);
};
