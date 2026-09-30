// Combat statistics used for balance tuning (build plan: "Combat balance: how to tune it").
import type { Vec3 } from '../math/vec3';
import { sub, normalize, dot, len } from '../math/vec3';
import { qForward } from '../math/quat';
import type { SimEvent, KillKind } from '../sim/events';
import type { WorldState } from '../sim/state';
import { isFlying } from '../sim/combat';

export interface PlayerStats {
  throws: number;
  throwsHit: number; // throws that damaged at least one enemy
  windupThrows: number;
  laserShots: number;
  laserHits: number;
  deflects: number;
  incoming: number; // enemy Boomerangs that came within 3 m
  kills: number;
  deaths: number;
  teamKills: number;
  headshotKills: number;
  offscreenDeaths: number;
}

const emptyStats = (): PlayerStats => ({
  throws: 0,
  throwsHit: 0,
  windupThrows: 0,
  laserShots: 0,
  laserHits: 0,
  deflects: 0,
  incoming: 0,
  kills: 0,
  deaths: 0,
  teamKills: 0,
  headshotKills: 0,
  offscreenDeaths: 0,
});

export interface BalanceReport {
  boomerangHitPct: number;
  laserHitPct: number;
  deflectPct: number;
  avgFightSec: number;
  offscreenDeathPct: number;
  windupKillPct: number;
  recallKillPct: number;
  headshotKillPct: number;
  killsByKind: Record<string, number>;
  totalKills: number;
}

export class StatsTracker {
  players = new Map<number, PlayerStats>();
  private throwOwner = new Map<number, number>(); // throwId -> player
  private throwHit = new Set<number>();
  private incomingSeen = new Set<string>();
  private firstHurt = new Map<number, number>(); // victim -> tick of first damage this life
  fightTicks: number[] = [];
  killsByKind: Record<string, number> = {};
  totalKills = 0;
  private halfFovDeg: number;
  constructor(halfFovDeg = 50) {
    this.halfFovDeg = halfFovDeg;
  }

  private get(id: number): PlayerStats {
    let s = this.players.get(id);
    if (!s) this.players.set(id, (s = emptyStats()));
    return s;
  }

  /** Call once per tick after `step`. */
  observe(world: WorldState): void {
    const teamOf = (id: number) => world.players.find((p) => p.id === id)?.team;
    for (const e of world.events) this.onEvent(e, world, teamOf);
    // incoming Boomerangs (for deflect %)
    for (const b of world.boomerangs) {
      if (!isFlying(b)) continue;
      for (const p of world.players) {
        if (!p.alive || teamOf(b.controller) === p.team) continue;
        if (len(sub(b.pos, p.pos)) < 3) {
          const key = `${b.throwId}:${b.phase}:${p.id}`;
          if (!this.incomingSeen.has(key)) {
            this.incomingSeen.add(key);
            this.get(p.id).incoming++;
          }
        }
      }
    }
  }

  private onEvent(e: SimEvent, world: WorldState, teamOf: (id: number) => 0 | 1 | undefined): void {
    switch (e.type) {
      case 'throw': {
        const s = this.get(e.player);
        s.throws++;
        if (e.windup) s.windupThrows++;
        const b = world.boomerangs.find((bb) => bb.id === e.boomerang);
        if (b) this.throwOwner.set(b.throwId, e.player);
        break;
      }
      case 'laserFire': {
        const s = this.get(e.player);
        s.laserShots++;
        if (e.hit >= 0 && teamOf(e.hit) !== teamOf(e.player)) s.laserHits++;
        break;
      }
      case 'deflect':
        this.get(e.player).deflects++;
        break;
      case 'hit': {
        if (!this.firstHurt.has(e.victim)) this.firstHurt.set(e.victim, world.tick);
        if (
          ['boomerang', 'headshot', 'windup'].includes(e.kind) &&
          teamOf(e.attacker) !== teamOf(e.victim)
        ) {
          // attribute to the throw (via the attacker's current throw id)
          const b = world.boomerangs.find((bb) => bb.controller === e.attacker && bb.throwId);
          if (b && !this.throwHit.has(b.throwId) && this.throwOwner.get(b.throwId) === e.attacker) {
            this.throwHit.add(b.throwId);
            this.get(e.attacker).throwsHit++;
          }
        }
        break;
      }
      case 'kill': {
        this.totalKills++;
        this.killsByKind[e.kind] = (this.killsByKind[e.kind] ?? 0) + 1;
        const v = this.get(e.victim);
        v.deaths++;
        const a = this.get(e.attacker);
        if (e.teamKill) a.teamKills++;
        else if (e.attacker !== e.victim) a.kills++;
        if (e.kind === 'headshot') a.headshotKills++;
        const start = this.firstHurt.get(e.victim);
        if (start !== undefined) this.fightTicks.push(world.tick - start);
        this.firstHurt.delete(e.victim);
        const victim = world.players.find((p) => p.id === e.victim);
        if (victim && this.isOffscreen(victim.pos, qForward(victim.view), e.src))
          v.offscreenDeaths++;
        break;
      }
    }
  }

  private isOffscreen(pos: Vec3, forward: Vec3, src: Vec3): boolean {
    const d = normalize(sub(src, pos));
    return dot(d, forward) < Math.cos((this.halfFovDeg * Math.PI) / 180);
  }

  /** Forget in-life state for a respawned player. */
  onRespawn(id: number): void {
    this.firstHurt.delete(id);
  }

  report(ids?: number[]): BalanceReport {
    const list = [...this.players.entries()]
      .filter(([id]) => !ids || ids.includes(id))
      .map(([, s]) => s);
    const sum = (k: keyof PlayerStats) => list.reduce((a, s) => a + s[k], 0);
    const pct = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0);
    const kills = this.totalKills;
    return {
      boomerangHitPct: pct(sum('throwsHit'), sum('throws')),
      laserHitPct: pct(sum('laserHits'), sum('laserShots')),
      deflectPct: pct(sum('deflects'), sum('incoming')),
      avgFightSec: this.fightTicks.length
        ? this.fightTicks.reduce((a, b) => a + b, 0) / this.fightTicks.length / 60
        : 0,
      offscreenDeathPct: pct(sum('offscreenDeaths'), sum('deaths')),
      windupKillPct: pct(this.killsByKind['windup'] ?? 0, kills),
      recallKillPct: pct(this.killsByKind['recall'] ?? 0, kills),
      headshotKillPct: pct(this.killsByKind['headshot'] ?? 0, kills),
      killsByKind: { ...this.killsByKind },
      totalKills: kills,
    };
  }
}

export const KILL_KINDS: KillKind[] = [
  'boomerang',
  'headshot',
  'windup',
  'recall',
  'deflect',
  'slash',
  'laser',
  'grenade',
  'ak',
  'deagle',
  'world',
];
