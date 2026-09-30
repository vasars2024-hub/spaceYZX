// Free running on a race / surf map online (a practice room playing one — the Map Maker's
// "Play: free roam" — or a race room's lobby, or a racer who joined mid-race and waits for the
// next one): the checkpoint gates and a room's restart bay work for everyone, however many
// players are in the room. A fall brings you back to the last gate you passed, never to the
// very start of the map.
import { describe, expect, it } from 'vitest';
import type { PlayerState, Vec3 } from '@space-yz/shared';
import { Btn, decodeSnapshot, gateCenter, yawToView } from '@space-yz/shared';
import type { Conn } from '../src/game/conn';
import { GameHub } from '../src/game/hub';
import type { Room } from '../src/game/room';
import type { RaceRules } from '../src/game/rules/race';

const MAP = 'surf-thirty-doors';

const fakeConn = () => ({ rttMs: 0, sendBinary: () => {}, sendJson: () => {} }) as unknown as Conn;

const playerOf = (room: Room, id: number): PlayerState =>
  room.world.players.find((p) => p.id === id)!;

const ticks = (room: Room, n: number) => {
  for (let i = 0; i < n; i++) room.tick();
};

/** Put a player in the middle of `gate` (standing still) and let one tick see it. */
const through = (room: Room, p: PlayerState, gate: { min: Vec3; max: Vec3 }) => {
  p.pos = gateCenter(gate);
  p.vel = { x: 0, y: 0, z: 0 };
  room.tick();
};

/** Drop a player into the cloud sea under the course (a fall) and let a tick see it. */
const fall = (room: Room, p: PlayerState) => {
  const race = room.level.def.race!;
  p.pos = { x: p.pos.x, y: race.killY - 5, z: p.pos.z };
  room.tick();
};

const near = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.z - b.z) < 0.5 && Math.abs(a.y - b.y) < 2;

/** Feet of a player (the body centre is half a standing height up). */
const feet = (room: Room, p: PlayerState): Vec3 => ({
  x: p.pos.x,
  y: p.pos.y - room.ctx.config.movement.standHeight / 2 - 0.01,
  z: p.pos.z,
});

describe('free running on a surf map online: checkpoints work', () => {
  it('practice room, several players: a fall brings you back to your last gate, not the start', () => {
    const hub = new GameHub({ log: () => {} });
    try {
      const room = hub.createRoom({ mode: 'practice', map: MAP })!;
      hub.clock.remove(room);
      const race = room.level.def.race!;
      expect(race.checkpoints.length).toBe(30);
      const a = room.addMember('Ada', fakeConn());
      const b = room.addMember('Bo', fakeConn());
      ticks(room, 5);
      const pa = playerOf(room, a.id);
      const pb = playerOf(room, b.id);
      // Ada clears rooms 1–3 (three gates, in order)
      for (let i = 0; i < 3; i++) through(room, pa, race.checkpoints[i]);
      // a third player joins meanwhile, and Bo passes the first gate
      const c = room.addMember('Cy', fakeConn());
      through(room, pb, race.checkpoints[0]);
      ticks(room, 5);
      // Ada falls: room 3's restart bay (no penalty: nobody is racing here)
      fall(room, pa);
      expect(near(feet(room, pa), race.checkpoints[2].respawn)).toBe(true);
      expect(pa.frozen).toBe(false);
      // (free running is never race progress)
      expect(pa.raceCp).toBe(-1);
      // Bo falls: room 1's bay
      fall(room, pb);
      expect(near(feet(room, pb), race.checkpoints[0].respawn)).toBe(true);
      // Cy passed nothing: the start
      const pc = playerOf(room, c.id);
      fall(room, pc);
      expect(near(feet(room, pc), race.start.respawn)).toBe(true);
      // and Ada's progress survived the others' falls and the join
      ticks(room, 30);
      fall(room, pa);
      expect(near(feet(room, pa), race.checkpoints[2].respawn)).toBe(true);
    } finally {
      hub.close();
    }
  });

  it('the client is sent its free-run gate (its prediction comes back to the same place)', () => {
    const hub = new GameHub({ log: () => {} });
    try {
      const room = hub.createRoom({ mode: 'practice', map: MAP })!;
      hub.clock.remove(room);
      const race = room.level.def.race!;
      const sent: Uint8Array[] = [];
      const conn = {
        rttMs: 0,
        sendBinary: (b: Uint8Array) => sent.push(b),
        sendJson: () => {},
      } as unknown as Conn;
      const a = room.addMember('Ada', conn);
      room.addMember('Bo', fakeConn());
      ticks(room, 5);
      const pa = playerOf(room, a.id);
      for (let i = 0; i < 4; i++) through(room, pa, race.checkpoints[i]);
      sent.length = 0;
      ticks(room, room.privateEvery + 1);
      const own = sent
        .map((b) => decodeSnapshot(b, () => null).own)
        .filter((o) => !!o)
        .pop();
      expect(own?.player.id).toBe(a.id);
      expect(own?.player.raceFreeCp).toBe(4);
    } finally {
      hub.close();
    }
  });

  it('practice room: holding the respawn key brings you back to your last gate', () => {
    const hub = new GameHub({ log: () => {} });
    try {
      const room = hub.createRoom({ mode: 'practice', map: MAP })!;
      hub.clock.remove(room);
      const race = room.level.def.race!;
      const a = room.addMember('Ada', fakeConn());
      room.addMember('Bo', fakeConn());
      ticks(room, 5);
      const pa = playerOf(room, a.id);
      for (let i = 0; i < 2; i++) through(room, pa, race.checkpoints[i]);
      // (hold R for half a second)
      const t0 = room.world.tick + 1;
      const hold = Array.from({ length: 30 }, (_, i) => ({
        tick: t0 + i,
        buttons: Btn.Recall,
        view: yawToView(0, 0),
      }));
      room.receiveInputs(a.id, 0, hold);
      let back = false;
      for (let i = 0; i < 30; i++) {
        room.tick();
        if (room.world.events.some((e) => e.type === 'raceRespawn' && e.player === a.id))
          back = true;
      }
      expect(back).toBe(true);
      expect(
        Math.hypot(
          pa.pos.x - race.checkpoints[1].respawn.x,
          pa.pos.z - race.checkpoints[1].respawn.z,
        ),
      ).toBeLessThan(3);
    } finally {
      hub.close();
    }
  });

  it('race room: a racer who joined mid-race gets checkpoints while waiting for the next race', () => {
    const hub = new GameHub({ log: () => {} });
    try {
      const room = hub.createRoom({ mode: 'race', map: MAP })!;
      hub.clock.remove(room);
      const race = room.level.def.race!;
      const rules = room.rules as RaceRules;
      const host = room.addMember('Host', fakeConn());
      expect(rules.requestStart(room)).toBeNull();
      ticks(room, 60 * 4);
      expect(rules.st.phase).toBe('racing');
      // the host races on; a friend joins mid-race (free running until the next race)
      const friend = room.addMember('Friend', fakeConn());
      ticks(room, 5);
      const ph = playerOf(room, host.id);
      const pf = playerOf(room, friend.id);
      expect(pf.raceCp).toBe(-1);
      for (let i = 0; i < 2; i++) through(room, pf, race.checkpoints[i]);
      fall(room, pf);
      expect(near(feet(room, pf), race.checkpoints[1].respawn)).toBe(true);
      // the host's race is untouched: gate 1 counts for the race, and a fall comes back there
      through(room, ph, race.checkpoints[0]);
      expect(ph.raceCp).toBe(1);
      fall(room, ph);
      expect(near(feet(room, ph), race.checkpoints[0].respawn)).toBe(true);
      expect(ph.frozen).toBe(true);
      expect(rules.st.entries.map((e) => e.id)).toEqual([host.id]);
    } finally {
      hub.close();
    }
  });
});
