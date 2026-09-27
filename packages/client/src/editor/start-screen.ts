// MAP MAKER — the start screen: continue the draft, start a new map, change a built-in map (an
// admin can change the real one), or open one of My Maps.
import { MAPS, OFFICIAL_PREFIX, getMap } from '@space-yz/shared';
import type { App } from '../app';
import { account } from '../net/account';
import { deleteMap, isAdmin, listMyMaps, loadMap, loadOfficialEdit } from '../net/custom-maps';
import { card, cardGrid, mapCard, screenHead, type Dir } from '../ui/menu-kit';
import { h } from '../ui/menus';
import { edIcon } from './icons';
import { addBlocks, addSpawn, fromCustomDoc, newDoc, type EditDoc } from './model';
import {
  GONE_MAP,
  baseGone,
  clearDraft,
  draftInfo,
  loadDraft,
  newSession,
  type EditorSession,
} from './session';
import { confirmBox, errorText } from './ui-kit';

/** A new empty map: a big floating platform and a spawn point on it. */
export const emptyMap = (name = 'My map'): EditDoc => {
  let doc = newDoc(name);
  doc = addBlocks(doc, [
    { shape: 'box', pos: [0, -0.5, 0], size: [24, 1, 24], mat: 'concrete' },
  ]).doc;
  return addSpawn(doc, { pos: [0, 0, 8], yaw: 0 });
};

const ago = (t: number): string => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} minutes ago`;
  if (s < 129600) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
};

export const startScreen = (app: App, dir: Dir, open: (s: EditorSession) => void): void => {
  // admins and My Maps need the server (it says who you are)
  try {
    app.ensureNet();
  } catch {
    /* offline: new maps still work */
  }
  const screen = h('div', { class: 'screen interactive flow-screen ed-start' });
  const body = h('div', { class: 'ed-start-body' });
  const draft = draftInfo();

  /** Open something new; an unsaved draft is replaced only after asking. */
  const replaceDraft = async (make: () => Promise<EditorSession | null> | EditorSession | null) => {
    // (a draft of a removed map can't be opened any more: nothing to keep)
    if (draft?.unsaved && !baseGone(draft.base)) {
      const ok = await confirmBox(
        screen,
        'Start something else?',
        `Your unsaved map "${draft.name}" will be replaced. (Open it and press Save first to keep it in My Maps.)`,
        'Replace it',
        'Keep it',
        true,
      );
      if (!ok) return;
    }
    try {
      const s = await make();
      if (!s) return;
      clearDraft();
      open(s);
    } catch (e) {
      note.textContent = errorText(e);
    }
  };
  const note = h('p', { class: 'ed-start-note' });

  const top: HTMLElement[] = [];
  // (a draft of a built-in map that was removed says so instead of opening another map)
  const draftGone = !!draft && baseGone(draft.base);
  if (draft)
    top.push(
      card({
        title: `Continue: ${draft.name}`,
        desc: draftGone
          ? `${GONE_MAP} · kept on this PC · ${ago(draft.at)}`
          : `${draft.base ? `${draft.kind === 'official' ? 'The real' : 'Your version of'} ${getMap(draft.base).name} · ` : ''}kept on this PC · ${ago(draft.at)}${draft.unsaved ? ' · not saved yet' : ''}`,
        art: edIcon('restore'),
        cls: 'mode ed-continue',
        onClick: () => {
          if (draftGone) {
            note.textContent = `${GONE_MAP}: it was a change of a built-in map the game no longer has. Start a new map instead.`;
            return;
          }
          const s = loadDraft();
          if (s) open(s);
          else note.textContent = 'The draft could not be read.';
        },
      }),
    );
  top.push(
    card({
      title: 'New map',
      desc: 'Start from a floating platform in the sky and build anything.',
      art: edIcon('plus'),
      cls: 'mode',
      onClick: () => void replaceDraft(() => newSession(emptyMap(), 'own')),
    }),
  );

  const pickBuiltIn = (mapId: string): void => {
    const name = getMap(mapId).name;
    // your own version starts from the map as everyone plays it now (its published edit)
    const own = () =>
      void replaceDraft(async () => {
        const live = await loadOfficialEdit(mapId).catch(() => null);
        const doc = live
          ? { ...fromCustomDoc(live), name: `My ${name}` }
          : newDoc(`My ${name}`, mapId, true);
        if (!doc.patch) doc.patch = { removed: [] };
        return newSession(doc, 'own');
      });
    if (!isAdmin()) return own();
    // admins: the real map, or their own version
    body.replaceChildren(
      h('h3', { class: 'step-title' }, name),
      cardGrid('modes wide', [
        card({
          title: 'Edit the real map',
          desc: `Your changes become the ${name} everyone plays when you press Publish.`,
          art: edIcon('publish'),
          cls: 'mode ed-official',
          onClick: () =>
            void replaceDraft(async () => {
              note.textContent = 'Loading the live version…';
              const live = await loadOfficialEdit(mapId);
              const doc = live ? fromCustomDoc(live) : newDoc(name, mapId, true);
              if (!doc.patch) doc.patch = { removed: [] };
              return newSession(doc, 'official', undefined, true);
            }),
        }),
        card({
          title: 'Make my own version',
          desc: 'A copy for My Maps: only you (and friends you invite) play it.',
          art: edIcon('copy'),
          cls: 'mode',
          onClick: own,
        }),
      ]),
      h('button', { type: 'button', class: 'btn small secondary' }, 'Other maps'),
    );
    (body.lastElementChild as HTMLButtonElement).addEventListener('click', () => render());
  };

  const myMaps = h(
    'div',
    { class: 'ed-mymaps' },
    h('p', { class: 'ed-start-note' }, 'Loading My Maps…'),
  );
  const loadMine = (): void => {
    listMyMaps().then(
      (list) => {
        if (!list.length) {
          myMaps.replaceChildren(
            h(
              'p',
              { class: 'ed-start-note' },
              account.me?.secured
                ? 'No saved maps yet. Build one and press Save.'
                : 'No saved maps yet. Saving needs a secured account (Profile on the title screen).',
            ),
          );
          return;
        }
        myMaps.replaceChildren(
          cardGrid(
            'modes wide',
            list.map((m) => {
              const official = m.official || m.id.startsWith(OFFICIAL_PREFIX);
              // (an edit of a built-in map that was removed: it says so, and only Delete works)
              const gone = baseGone(m.base);
              const c = card({
                title: m.name,
                desc: `${gone ? GONE_MAP : official ? `Live version of ${getMap(m.base).name}` : m.base ? `Edit of ${getMap(m.base).name}` : 'Own map'} · saved ${ago(m.updatedAt)}`,
                art: edIcon(official ? 'publish' : 'map'),
                cls: 'mode',
                onClick: () => {
                  if (gone) {
                    note.textContent = `${GONE_MAP}: "${m.name}" was a change of a built-in map the game no longer has.`;
                    return;
                  }
                  void replaceDraft(async () => {
                    note.textContent = `Opening ${m.name}…`;
                    const doc = fromCustomDoc(await loadMap(m.id));
                    if (baseGone(doc.base)) {
                      note.textContent = `${GONE_MAP}: "${m.name}" was a change of a built-in map the game no longer has.`;
                      return null;
                    }
                    return official
                      ? newSession(doc, 'official', undefined, true)
                      : newSession(doc, 'own', m.id, true);
                  });
                },
              });
              if (!official) {
                const del = h(
                  'span',
                  { class: 'ed-card-del', role: 'button', title: 'Delete this map', tabindex: '0' },
                  edIcon('trash'),
                );
                del.addEventListener('click', (e) => {
                  e.stopPropagation();
                  void confirmBox(
                    screen,
                    `Delete "${m.name}"?`,
                    'It is gone for good.',
                    'Delete',
                    'Keep',
                    true,
                  ).then((ok) => {
                    if (!ok) return;
                    deleteMap(m.id).then(loadMine, (err) => (note.textContent = errorText(err)));
                  });
                });
                c.append(del);
              }
              return c;
            }),
          ),
        );
      },
      (e) =>
        myMaps.replaceChildren(
          h(
            'p',
            { class: 'ed-start-note' },
            `My Maps can't be loaded right now (${errorText(e)}). New maps still work.`,
          ),
        ),
    );
  };

  const render = (): void => {
    body.replaceChildren(
      cardGrid('modes wide', top),
      h('h3', { class: 'step-title' }, 'Change a built-in map'),
      cardGrid(
        'maps',
        MAPS.filter((m) => !m.arena).map((m) => mapCard(m.id, false, () => pickBuiltIn(m.id))),
      ),
      h('h3', { class: 'step-title' }, 'My Maps'),
      myMaps,
    );
  };

  render();
  loadMine();
  screen.append(
    screenHead('map', 'Map Maker', () => app.showTitle()),
    note,
    body,
  );
  app.setScreen(screen, dir);
};
