// Per-player shooting stats for the match history and profiles (cheap: it only reads the
// tick's sim events). Boomerang accuracy counts a throw once if it hurt an enemy; laser and
// gun accuracy count shots that hit an enemy; headshots are hits on an enemy's head; kills are
// grouped by weapon for the "favourite weapon".
import type { KillKind, WorldState } from '@space-yz/shared';

export interface PlayerMatchStats {
  throws: number;
  throwHits: number;
  laserShots: number;
  laserHits: number;
  gunShots: number;
  gunHits: number;
  headshots: number;
  /** kills by weapon group (weaponOfKill) */
  weaponKills: Record<string, number>;
}

/** The weapon a kill counts for (null: not a weapon — the bomb, falling out). */
export const weaponOfKill = (kind: KillKind): string | null => {
  switch (kind) {
    case 'boomerang':
    case 'headshot':
    case 'windup':
    case 'recall':
    case 'deflect':
    case 'blast':
      return 'boomerang';
    case 'slash':
    case 'laser':
    case 'grenade':
    case 'ak':
    case 'deagle':
      return kind;
    default:
      return null;
  }
};

const empty = (): PlayerMatchStats => ({
  throws: 0,
  throwHits: 0,
  laserShots: 0,
  laserHits: 0,
  gunShots: 0,
  gunHits: 0,
  headshots: 0,
  weaponKills: {},
});

export class MatchStats {
  private players = new Map<number, PlayerMatchStats>();
  /** throwId -> thrower, and throws that already counted as a hit */
  private throwOwner = new Map<number, number>();
  private throwHit = new Set<number>();

  reset(): void {
    this.players.clear();
    this.throwOwner.clear();
    this.throwHit.clear();
  }

  get(id: number): PlayerMatchStats {
    let s = this.players.get(id);
    if (!s) this.players.set(id, (s = empty()));
    return s;
  }

  /** Call once per tick after the step (reads world.events). */
  observe(world: WorldState): void {
    if (!world.events.length) return;
    const team = (id: number) => world.players.find((p) => p.id === id)?.team;
    const enemies = (a: number, b: number) => a !== b && team(a) !== team(b);
    for (const e of world.events) {
      switch (e.type) {
        case 'throw': {
          this.get(e.player).throws++;
          const b = world.boomerangs.find((x) => x.id === e.boomerang);
          if (b) this.throwOwner.set(b.throwId, e.player);
          break;
        }
        case 'laserFire': {
          const s = this.get(e.player);
          s.laserShots++;
          if (e.hit >= 0 && enemies(e.player, e.hit)) s.laserHits++;
          break;
        }
        case 'gunFire': {
          const s = this.get(e.player);
          s.gunShots++;
          if (e.hit >= 0 && enemies(e.player, e.hit)) s.gunHits++;
          break;
        }
        case 'hit': {
          if (!enemies(e.attacker, e.victim)) break;
          if (e.head) this.get(e.attacker).headshots++;
          if (e.kind === 'boomerang' || e.kind === 'headshot' || e.kind === 'windup') {
            const b = world.boomerangs.find((x) => x.controller === e.attacker && x.throwId);
            if (
              b &&
              !this.throwHit.has(b.throwId) &&
              this.throwOwner.get(b.throwId) === e.attacker
            ) {
              this.throwHit.add(b.throwId);
              this.get(e.attacker).throwHits++;
            }
          }
          break;
        }
        case 'kill': {
          if (e.teamKill || e.attacker === e.victim) break;
          const w = weaponOfKill(e.kind);
          if (!w) break;
          const k = this.get(e.attacker).weaponKills;
          k[w] = (k[w] ?? 0) + 1;
          break;
        }
      }
    }
  }
}
