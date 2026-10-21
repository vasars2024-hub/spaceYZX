// Free roam: practice alone on any map with target dummies placed automatically.
import { describe, expect, it } from 'vitest';
import {
  MAPS,
  buildLevel,
  capsuleOverlaps,
  defaultConfig,
  len,
  lineOfSight,
  mapDef,
  pointInAabb,
  raycast,
  sub,
  v3,
  yawToView,
} from '@space-yz/shared';
import {
  FREE_ROAM,
  createFreeRoamSession,
  freeRoamStart,
  placeDummies,
} from '../src/game/free-roam';

const config = defaultConfig();
const idle = () => ({ buttons: 0, view: yawToView(0) });

describe('free roam: dummy placement', () => {
  for (const info of MAPS) {
    it(`${info.id}: dummies stand on a floor, in the open, in bounds and in sight`, () => {
      const def = mapDef(info.id);
      const spots = placeDummies(def, config);
      if (def.race) {
        expect(spots).toEqual([]); // race tracks: movement practice only
        return;
      }
      expect(spots.length).toBeGreaterThanOrEqual(6);
      expect(spots.length).toBeLessThanOrEqual(FREE_ROAM.count);
      const level = buildLevel(def);
      const m = config.movement;
      const start = freeRoamStart(def).pos;
      // (where you can stand: the spawns and the bots' waypoints)
      const eyes = [
        ...def.spawns.map((s) => s.pos),
        ...(def.waypoints ?? []).map((w) => w.pos),
      ].map((p) => v3(p.x, p.y + 1.6, p.z));
      for (const s of spots) {
        // on a floor
        const hit = raycast(level, v3(s.pos.x, s.pos.y + 0.3, s.pos.z), v3(0, -1, 0), 0.6);
        expect(hit, `floor under ${JSON.stringify(s.pos)}`).not.toBeNull();
        // not inside a wall
        const center = v3(s.pos.x, s.pos.y + m.standHeight / 2 + 0.05, s.pos.z);
        expect(
          capsuleOverlaps(level, {
            center,
            up: v3(0, 1, 0),
            halfSeg: m.standHeight / 2 - m.radius,
            radius: m.radius,
          }),
        ).toBe(false);
        // in bounds, not out in a gorge
        expect(pointInAabb(s.pos, def.boundsMin, def.boundsMax)).toBe(true);
        for (const k of def.killVolumes ?? []) expect(pointInAabb(s.pos, k.min, k.max)).toBe(false);
        // someone standing on a spawn or a waypoint can see it
        const chest = v3(s.pos.x, s.pos.y + 1.2, s.pos.z);
        expect(eyes.some((e) => lineOfSight(level, e, chest))).toBe(true);
        // not on top of you, not on top of each other
        expect(len(sub(s.pos, start))).toBeGreaterThanOrEqual(FREE_ROAM.minFromStart);
        for (const o of spots) if (o !== s) expect(len(sub(o.pos, s.pos))).toBeGreaterThan(1);
      }
      // varied: some near, some far; not all static
      const d = spots.map((s) => len(sub(s.pos, start)));
      expect(Math.max(...d) - Math.min(...d)).toBeGreaterThan(10);
      expect(spots.some((s) => s.kind !== 'static')).toBe(true);
    });
  }

  it('is deterministic', () => {
    const def = mapDef('kestrel');
    expect(placeDummies(def, config)).toEqual(placeDummies(def, config));
  });
});

describe('free roam: the session', () => {
  for (const info of MAPS) {
    it(`${info.id}: starts, runs, and keeps you alive`, () => {
      const s = createFreeRoamSession({ mapId: info.id, config });
      const w = s.world();
      expect(s.local()).toBeDefined();
      const dummies = w.players.filter((p) => p.id !== s.localId);
      expect(dummies.length).toBe(s.dummySpots);
      if (!mapDef(info.id).race) expect(dummies.length).toBeGreaterThan(0);
      for (let i = 0; i < 60 * 2; i++) s.update(1 / 60, idle);
      expect(s.world().tick).toBeGreaterThan(100);
      // down: back after a moment (a fall or leaving the map kills now)
      const me = s.local()!;
      me.alive = false;
      me.hp = 0;
      for (let i = 0; i < 60 * 2; i++) s.update(1 / 60, idle);
      expect(s.local()!.alive).toBe(true);
    });
  }

  it('dummies go down, come back, reset and switch off / on', () => {
    const s = createFreeRoamSession({ mapId: 'split-deck', config, kit: 'lethal' });
    const n = s.dummySpots;
    const d = s.world().players.find((p) => p.id !== s.localId)!;
    d.alive = false;
    d.hp = 0;
    for (let i = 0; i < FREE_ROAM.respawnTicks + 5; i++) s.update(1 / 60, idle);
    expect(s.world().players.find((p) => p.id === d.id)!.alive).toBe(true);
    s.setDummies(false);
    expect(s.dummiesOn()).toBe(false);
    expect(s.world().players.length).toBe(1);
    expect(s.pauseActions().map((a) => a.label)).toEqual(['Dummies: off']);
    s.setDummies(true);
    expect(s.world().players.length).toBe(1 + n);
    expect(s.pauseActions().map((a) => a.label)).toEqual(['Reset dummies', 'Dummies: on']);
    s.world().players[1].hp = 1;
    s.resetDummies();
    expect(s.world().players.every((p) => p.hp === config.combat.maxHp)).toBe(true);
    // the CS kit works too; dummies off from the start
    const cs = createFreeRoamSession({ mapId: 'sakura-hold', config, kit: 'cs', dummies: false });
    expect(cs.world().players.length).toBe(1);
    expect(cs.config.combat.loadout).not.toBe(config.combat.loadout);
  });
});
