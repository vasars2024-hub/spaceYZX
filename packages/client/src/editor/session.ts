// MAP MAKER — one editing session (the map, its undo history, where the camera was) and the
// autosaved draft in localStorage, so a crash, a closed tab or a test run never loses work.
import type { CustomMapDoc } from '@space-yz/shared';
import { mapExists } from '@space-yz/shared';
import { History } from './history';
import { fromCustomDoc, toCustomDoc, type EditDoc, type V3 } from './model';

export interface CameraState {
  pos: V3;
  /** compass heading, degrees (0 = north -z, 90 = east +x) */
  heading: number;
  pitch: number;
}

export interface EditorSession {
  /** 'official': an admin editing the real built-in map (Publish makes it the live version) */
  kind: 'own' | 'official';
  /** its id in My Maps once saved */
  savedId?: string;
  history: History<EditDoc>;
  camera?: CameraState;
  /** the doc as last saved / published (null: never) — "unsaved changes" compares with it */
  savedDoc: EditDoc | null;
}

export const newSession = (
  doc: EditDoc,
  kind: EditorSession['kind'],
  savedId?: string,
  saved = false,
): EditorSession => ({
  kind,
  ...(savedId ? { savedId } : {}),
  history: new History(doc),
  savedDoc: saved ? doc : null,
});

export const hasUnsaved = (s: EditorSession): boolean => s.history.current !== s.savedDoc;

/** Said when a draft or saved map is an edit of a built-in map the game no longer has. */
export const GONE_MAP = 'This map no longer exists';

/**
 * Is `base` a built-in map the game no longer has (a draft or saved edit of it can't be opened:
 * it is never loaded as another map)?
 */
export const baseGone = (base: string | undefined): boolean => !!base && !mapExists(base);

// ---------------------------------------------------------------------------------------------
// the draft

const DRAFT_KEY = 'spaceyz.mapmaker.draft';

interface DraftJson {
  v: 1;
  kind: EditorSession['kind'];
  savedId?: string;
  doc: CustomMapDoc;
  /** the unfinished parts (a race without finish, a mover with one point) */
  edit: EditDoc;
  camera?: CameraState;
  unsaved: boolean;
  at: number;
}

export interface DraftInfo {
  name: string;
  base: string;
  kind: EditorSession['kind'];
  at: number;
  unsaved: boolean;
}

export const saveDraft = (s: EditorSession): void => {
  try {
    const d: DraftJson = {
      v: 1,
      kind: s.kind,
      ...(s.savedId ? { savedId: s.savedId } : {}),
      doc: toCustomDoc(s.history.current),
      edit: s.history.current,
      ...(s.camera ? { camera: s.camera } : {}),
      unsaved: hasUnsaved(s),
      at: Date.now(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* storage full or blocked: the session still works */
  }
};

const readDraft = (): DraftJson | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftJson;
    if (d?.v !== 1 || !d.edit || !Array.isArray(d.edit.blocks)) return null;
    return d;
  } catch {
    return null;
  }
};

export const draftInfo = (): DraftInfo | null => {
  const d = readDraft();
  return d
    ? { name: d.edit.name, base: d.edit.base, kind: d.kind, at: d.at, unsaved: d.unsaved }
    : null;
};

/** The draft as a session again (its undo history starts fresh). */
export const loadDraft = (): EditorSession | null => {
  const d = readDraft();
  if (!d) return null;
  const doc = fromCustomDoc({ ...d.doc, ...d.edit, race: undefined } as CustomMapDoc);
  doc.race = d.edit.race ?? { checkpoints: [] };
  doc.movers = d.edit.movers ?? [];
  const s = newSession(doc, d.kind, d.savedId, !d.unsaved);
  if (d.camera) s.camera = d.camera;
  return s;
};

export const clearDraft = (): void => {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
};
