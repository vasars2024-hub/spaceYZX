import { describe, expect, it, vi } from 'vitest';
import { NetCore, type SocketLike } from '../src/net/client-core';
import {
  createPlayer,
  createWorld,
  decodeInput,
  encodeSnapshot,
  publicState,
  zoneOverrides,
} from '../src/index';

const setup = () => {
  let now = 1000;
  const sent: Uint8Array[] = [];
  const socket: SocketLike = {
    binaryType: '',
    readyState: 1,
    send: (data) => {
      if (data instanceof Uint8Array) sent.push(data);
    },
    close: () => {},
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  const core = new NetCore({
    url: 'test',
    name: 'Pilot',
    now: () => now,
    createSocket: () => socket,
  });
  core.connect();
  socket.onmessage!({
    data: JSON.stringify({
      t: 'roomJoined',
      code: 'test',
      mode: 'practice',
      map: 'training-bay',
      playerId: 1,
      tick: 20,
      config: {},
    }),
  });
  const world = createWorld(core.level!, 1);
  const spawn = core.level!.def.spawns[0];
  world.players.push(createPlayer(1, 0, spawn.pos, spawn.yawDeg, core.config));
  let seq = 0;
  const snapshot = (tick: number, lead: number, ackInput = tick) => {
    world.tick = tick;
    socket.onmessage!({
      data: encodeSnapshot(
        {
          seq: ++seq,
          tick,
          ackInput,
          lead,
          baseline: 0,
          ...publicState(world),
          grenades: [],
          zones: zoneOverrides(world),
          own: { player: world.players[0], boomerang: null },
          events: null,
          extra: null,
        },
        null,
      ),
    });
  };
  const update = (ms = 1000 / 60) => {
    now += ms;
    return core.update(ms / 1000, () => ({ buttons: 0, view: world.players[0].view }));
  };
  return { core, sent, snapshot, update, advance: (ms: number) => (now += ms) };
};

describe('client input clock', () => {
  it('does not repeatedly subtract stale lead after a stalled server catches up', () => {
    const { core, sent, snapshot, update, advance } = setup();
    snapshot(20, 2);
    update();
    // The client catches up after a stall while server ticks and lead feedback lag behind.
    update(20_000);
    for (let n = 0; n < 18; n++) update(1000);
    for (let n = 0; n < 4; n++) {
      advance(600); // feedback can trigger another jump after the 500 ms cooldown
      snapshot(21 + n, 1000);
      expect(core.clientTick).toBeGreaterThanOrEqual(21 + n);
      expect(() => update()).not.toThrow();
    }
    expect(sent.length).toBeGreaterThan(0);
    for (const packet of sent) {
      for (const input of decodeInput(packet).inputs) {
        expect(Number.isSafeInteger(input.tick)).toBe(true);
        expect(input.tick).toBeGreaterThanOrEqual(0);
      }
    }
    expect(core.pending.every((i) => i.tick > core.latest!.ackInput)).toBe(true);
    expect(core.predWorld!.tick).toBeGreaterThanOrEqual(core.latest!.tick);
  });

  it('keeps input ticks moving forward across a backward clock jump', () => {
    const { core, snapshot, update, advance } = setup();
    snapshot(20, 2);
    update();
    const before = core.clientTick;
    advance(-20_000);
    update();
    expect(core.clientTick).toBeGreaterThanOrEqual(before);
  });

  it('drops a bad pending tick with a warning and continues sending valid inputs', () => {
    const { core, sent, snapshot, update } = setup();
    snapshot(20, 2);
    update();
    core.pending.push({ tick: -963, buttons: 0, view: { x: 0, y: 0, z: 0, w: 1 } });
    const out = (globalThis as unknown as { console: { warn(msg: string): void } }).console;
    const warn = vi.spyOn(out, 'warn').mockImplementation(() => {});
    try {
      expect(() => update()).not.toThrow();
      expect(warn).toHaveBeenCalled();
      expect(core.pending.every((i) => i.tick >= 0)).toBe(true);
      expect(decodeInput(sent.at(-1)!).inputs.every((i) => i.tick >= 0)).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
