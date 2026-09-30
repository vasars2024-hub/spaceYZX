// MAP MAKER — undo / redo: a stack of whole docs. Docs are never changed in place (editor/model.ts
// builds a new one per edit and shares the untouched blocks), so keeping hundreds is cheap.

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  /** the last push's merge key: a run of edits with the same key is one undo step */
  private lastKey: string | null = null;

  constructor(
    public current: T,
    private limit = 200,
  ) {}

  /**
   * Record a new state. With `mergeKey` equal to the previous push's (dragging a slider, holding
   * an arrow key), it replaces that step instead of adding one.
   */
  push(next: T, mergeKey: string | null = null): void {
    if (next === this.current) return;
    if (mergeKey !== null && mergeKey === this.lastKey && this.past.length) {
      this.current = next;
    } else {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
      this.current = next;
    }
    this.future = [];
    this.lastKey = mergeKey;
  }

  /** End a merge run (the next push is its own step even with the same key). */
  seal(): void {
    this.lastKey = null;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): T {
    const prev = this.past.pop();
    if (prev !== undefined) {
      this.future.push(this.current);
      this.current = prev;
    }
    this.lastKey = null;
    return this.current;
  }

  redo(): T {
    const next = this.future.pop();
    if (next !== undefined) {
      this.past.push(this.current);
      this.current = next;
    }
    this.lastKey = null;
    return this.current;
  }

  /** Start over from `state` (a map was opened): nothing to undo. */
  reset(state: T): void {
    this.past = [];
    this.future = [];
    this.current = state;
    this.lastKey = null;
  }
}
