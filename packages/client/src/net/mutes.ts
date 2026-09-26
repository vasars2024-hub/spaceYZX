// Per-player mutes (text chat + voice) in the current online room, keyed by player id.
// The chat feature says who can be muted (other humans) and clears the list when you leave.
class Mutes {
  private ids = new Set<number>();
  private listeners = new Set<() => void>();
  /** Who can be muted right now (other humans in your online room). */
  canMute: (id: number) => boolean = () => false;

  has(id: number): boolean {
    return this.ids.has(id);
  }

  toggle(id: number): boolean {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
    for (const fn of this.listeners) fn();
    return this.ids.has(id);
  }

  clear(): void {
    this.ids.clear();
    this.canMute = () => false;
    for (const fn of this.listeners) fn();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
}

export const mutes = new Mutes();
