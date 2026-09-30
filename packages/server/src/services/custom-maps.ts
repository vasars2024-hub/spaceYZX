// The Map Maker's storage: players' saved maps (custom_maps) and the official edits of the
// built-in maps (map_overrides, one row per version). The newest version of a built-in map is
// the one every new room plays (kept in memory: `override(map)`); rooms already running keep the
// version they started with. Docs arrive validated (custom-map-handler.ts).
import { randomBytes } from 'node:crypto';
import type { CustomMapDoc, CustomMapInfo, OfficialVersion } from '@space-yz/shared';
import { CUSTOM_MAP_LIMITS, OFFICIAL_PREFIX, customMapHash, mapExists } from '@space-yz/shared';
import type { Db } from './db';

interface MapRow {
  id: string;
  owner_id: number;
  name: string;
  base: string;
  doc: string;
  created_at: number;
  updated_at: number;
}

interface OverrideRow {
  id: number;
  map: string;
  doc: string | null;
  hash: string;
  action: OfficialVersion['action'];
  by_name: string;
  created_at: number;
}

export interface ActiveOverride {
  doc: CustomMapDoc;
  hash: string;
}

const newMapId = (): string => `m${randomBytes(9).toString('base64url')}`;
const MAP_ID_RE = /^m[A-Za-z0-9_-]{8,20}$/;

export class CustomMapStore {
  /** the official edit every new room plays, per built-in map */
  private active = new Map<string, ActiveOverride>();

  constructor(
    private db: Db,
    private now: () => number = Date.now,
  ) {
    const rows = db
      .prepare(
        `SELECT o.map, o.doc, o.hash FROM map_overrides o
         WHERE o.id = (SELECT MAX(id) FROM map_overrides WHERE map = o.map)`,
      )
      .all() as { map: string; doc: string | null; hash: string }[];
    // (the edit of a built-in map the game no longer has stays in the history, never played)
    for (const r of rows) if (mapExists(r.map)) this.setActive(r.map, r.doc, r.hash);
  }

  private setActive(map: string, doc: string | null, hash: string): void {
    if (doc === null) this.active.delete(map);
    else this.active.set(map, { doc: JSON.parse(doc) as CustomMapDoc, hash });
  }

  // ---------------- players' maps ----------------

  list(owner: number): CustomMapInfo[] {
    const rows = this.db
      .prepare(
        'SELECT id, name, base, updated_at FROM custom_maps WHERE owner_id = ? ORDER BY updated_at DESC',
      )
      .all(owner) as Pick<MapRow, 'id' | 'name' | 'base' | 'updated_at'>[];
    return rows.map((r) => ({ id: r.id, name: r.name, base: r.base, updatedAt: r.updated_at }));
  }

  count(owner: number): number {
    return (
      this.db.prepare('SELECT COUNT(*) AS n FROM custom_maps WHERE owner_id = ?').get(owner) as {
        n: number;
      }
    ).n;
  }

  /** A saved map (the handler gives it only to its owner). */
  get(id: string): { owner: number; doc: CustomMapDoc; name: string } | null {
    if (!MAP_ID_RE.test(id)) return null;
    const r = this.db
      .prepare('SELECT owner_id, name, doc FROM custom_maps WHERE id = ?')
      .get(id) as Pick<MapRow, 'owner_id' | 'name' | 'doc'> | undefined;
    return r ? { owner: r.owner_id, name: r.name, doc: JSON.parse(r.doc) as CustomMapDoc } : null;
  }

  /** Save a new map, or over one of your own (`id`). */
  save(
    owner: number,
    doc: CustomMapDoc,
    id?: string,
  ): { ok: true; id: string } | { ok: false; error: string } {
    const t = this.now();
    const name = doc.name.slice(0, CUSTOM_MAP_LIMITS.nameLength);
    const json = JSON.stringify(doc);
    if (id !== undefined) {
      const r = this.db.prepare('SELECT owner_id FROM custom_maps WHERE id = ?').get(id) as
        { owner_id: number } | undefined;
      if (r && r.owner_id !== owner) return { ok: false, error: 'That map is not yours.' };
      if (r) {
        this.db
          .prepare(
            'UPDATE custom_maps SET name = ?, base = ?, doc = ?, updated_at = ? WHERE id = ?',
          )
          .run(name, doc.base, json, t, id);
        return { ok: true, id };
      }
    }
    if (this.count(owner) >= CUSTOM_MAP_LIMITS.maps)
      return {
        ok: false,
        error: `You have ${CUSTOM_MAP_LIMITS.maps} maps saved (the most there can be): delete one first.`,
      };
    const newId = newMapId();
    this.db
      .prepare(
        'INSERT INTO custom_maps (id, owner_id, name, base, doc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(newId, owner, name, doc.base, json, t, t);
    return { ok: true, id: newId };
  }

  /** Delete one of your maps (false: no such map of yours). */
  delete(owner: number, id: string): boolean {
    return (
      Number(
        this.db.prepare('DELETE FROM custom_maps WHERE id = ? AND owner_id = ?').run(id, owner)
          .changes,
      ) > 0
    );
  }

  // ---------------- official edits of the built-in maps ----------------

  /** The official edit new rooms on this built-in map play (null: the original). */
  override(map: string): ActiveOverride | null {
    return this.active.get(map) ?? null;
  }

  /** Every built-in map with an official edit: map id -> version hash. */
  overrides(): Record<string, string> {
    return Object.fromEntries([...this.active].map(([m, o]) => [m, o.hash]));
  }

  /** The published edits as map-list entries (admins' list). */
  officialList(): CustomMapInfo[] {
    const rows = this.db
      .prepare(
        `SELECT o.map, o.created_at FROM map_overrides o
         WHERE o.doc IS NOT NULL AND o.id = (SELECT MAX(id) FROM map_overrides WHERE map = o.map)
         ORDER BY o.created_at DESC`,
      )
      .all() as { map: string; created_at: number }[];
    return rows.flatMap((r) => {
      const o = this.active.get(r.map);
      return o
        ? [
            {
              id: `${OFFICIAL_PREFIX}${r.map}`,
              name: o.doc.name,
              base: r.map,
              updatedAt: r.created_at,
              official: true,
            },
          ]
        : [];
    });
  }

  private add(
    map: string,
    doc: CustomMapDoc | null,
    action: OfficialVersion['action'],
    by: { id: number | null; name: string },
  ): string {
    const json = doc ? JSON.stringify(doc) : null;
    const hash = doc ? customMapHash(doc) : '';
    this.db
      .prepare(
        'INSERT INTO map_overrides (map, doc, hash, action, by_id, by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(map, json, hash, action, by.id, by.name, this.now());
    this.setActive(map, json, hash);
    return hash;
  }

  /** Make this edit the version of `map` everyone plays (new rooms). Returns its hash. */
  publish(map: string, doc: CustomMapDoc, by: { id: number | null; name: string }): string {
    return this.add(map, doc, 'publish', by);
  }

  /** Back to the original map (the edits stay in the history). False: it already is. */
  restore(map: string, by: { id: number | null; name: string }): boolean {
    if (!this.active.has(map)) return false;
    this.add(map, null, 'restore', by);
    return true;
  }

  /**
   * Undo the last publish / restore: back to the version before it (the original when there
   * was none). Versions form a stack (publish / restore push, undo pops), so undoing again goes
   * further back. False: nothing to undo.
   */
  undo(map: string, by: { id: number | null; name: string }): boolean {
    const rows = this.db
      .prepare('SELECT id, doc, action FROM map_overrides WHERE map = ? ORDER BY id')
      .all(map) as Pick<OverrideRow, 'id' | 'doc' | 'action'>[];
    const stack: (string | null)[] = [];
    for (const r of rows) {
      if (r.action === 'undo') stack.pop();
      else stack.push(r.doc);
    }
    if (!stack.length) return false;
    stack.pop();
    const top = stack.length ? stack[stack.length - 1] : null;
    this.add(map, top === null ? null : (JSON.parse(top) as CustomMapDoc), 'undo', by);
    return true;
  }

  /** The versions of a built-in map's official edit, newest first. */
  history(map: string, limit = 50): OfficialVersion[] {
    const rows = this.db
      .prepare(
        'SELECT id, hash, action, by_name, created_at FROM map_overrides WHERE map = ? ORDER BY id DESC LIMIT ?',
      )
      .all(map, Math.max(1, Math.min(200, limit))) as Omit<OverrideRow, 'map' | 'doc'>[];
    return rows.map((r, i) => ({
      id: r.id,
      action: r.action,
      hash: r.hash,
      by: r.by_name,
      at: r.created_at,
      active: i === 0,
    }));
  }
}
