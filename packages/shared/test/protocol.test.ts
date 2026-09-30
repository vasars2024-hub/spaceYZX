import { describe, expect, it } from 'vitest';
import {
  buildTestShip,
  buildTrainingBay,
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  step,
  stepPredict,
  encodeInput,
  decodeInput,
  encodeSnapshot,
  decodeSnapshot,
  publicState,
  zoneOverrides,
  netView,
  cloneWorld,
  yawToView,
  rngFromSeed,
  rngNextU32,
  rngFloat,
  sanitizeName,
  ALL_BUTTONS,
  TICK_DT,
  type PlayerInput,
  type SimContext,
  type SnapshotBaseline,
} from '../src/index';

describe('input messages', () => {
  it('round-trip ticks, buttons and a float32 view', () => {
    const view = netView(yawToView(33, -12));
    const bytes = encodeInput({ ack: 1234, inputs: [{ tick: 99, buttons: 0b1010101, view }] });
    const back = decodeInput(bytes);
    expect(back.ack).toBe(1234);
    expect(back.inputs[0].tick).toBe(99);
    expect(back.inputs[0].buttons).toBe(0b1010101);
    expect(back.inputs[0].view).toEqual(view);
  });
  it('rejects garbage views', () => {
    const bytes = encodeInput({
      ack: 1,
      inputs: [{ tick: 1, buttons: 0, view: { x: 9, y: 9, z: 9, w: 9 } }],
    });
    expect(() => decodeInput(bytes)).toThrow();
  });
});

describe('snapshots', () => {
  const setup = () => {
    const def = buildTrainingBay();
    const ctx: SimContext = { level: buildLevel(def), config: defaultConfig(), dt: TICK_DT };
    const world = createWorld(ctx.level, 5);
    for (let i = 1; i <= 4; i++) {
      const s = def.spawns[i];
      addPlayer(world, createPlayer(i, (i % 2) as 0 | 1, s.pos, s.yawDeg, ctx.config));
    }
    return { ctx, world };
  };

  it('full + delta round trip; private block is exact', () => {
    const { ctx, world } = setup();
    for (let t = 0; t < 20; t++)
      step(world, { 1: { tick: t + 1, buttons: 1, view: world.players[0].view } }, ctx);
    const pub1 = publicState(world);
    const snap1 = {
      seq: 1,
      tick: world.tick,
      ackInput: 20,
      lead: 2,
      baseline: 0,
      ...pub1,
      grenades: world.grenades,
      zones: zoneOverrides(world),
      own: { player: world.players[0], boomerang: world.boomerangs[0] },
      events: world.events,
      extra: { hello: 1 },
    };
    const b1 = encodeSnapshot(snap1, null);
    const d1 = decodeSnapshot(b1, () => null);
    expect(d1.players.size).toBe(4);
    expect(d1.own?.player).toEqual(world.players[0]);
    expect(d1.extra).toEqual({ hello: 1 });
    // delta vs snapshot 1
    for (let t = 0; t < 5; t++)
      step(world, { 1: { tick: 21 + t, buttons: 1, view: world.players[0].view } }, ctx);
    const pub2 = publicState(world);
    const base: SnapshotBaseline = { players: d1.players, boomerangs: d1.boomerangs };
    const b2 = encodeSnapshot(
      { ...snap1, seq: 2, baseline: 1, ...pub2, own: null, events: null, extra: null },
      base,
    );
    const d2 = decodeSnapshot(b2, (seq) => (seq === 1 ? base : null));
    for (const [id, p] of pub2.players) expect(d2.players.get(id)).toEqual(p);
    expect(b2.length).toBeLessThan(b1.length);
  });

  it('your own grenades travel exactly in the private block (flight + fuse)', () => {
    const { ctx, world } = setup();
    const g = {
      id: 77,
      owner: 1,
      pos: { x: 1.23456789, y: 2.5, z: -3.25 },
      vel: { x: 7.1, y: 3.3, z: -0.25 },
      phase: 0 as const,
      t: 41,
    };
    const snap = {
      seq: 1,
      tick: world.tick,
      ackInput: 0,
      lead: 0,
      baseline: 0,
      ...publicState(world),
      grenades: [g],
      zones: zoneOverrides(world),
      own: { player: world.players[0], boomerang: world.boomerangs[0], grenades: [g] },
      events: null,
      extra: null,
    };
    void ctx;
    const d = decodeSnapshot(encodeSnapshot(snap, null), () => null);
    expect(d.own?.grenades).toEqual([g]);
    // the public copy is rounded (and carries no velocity / fuse)
    expect(d.grenades[0].id).toBe(77);
    expect(d.grenades[0].t).toBe(0);
  });

  it('client prediction from the exact private state matches the server bit-for-bit', () => {
    const def = buildTestShip();
    const ctx: SimContext = { level: buildLevel(def), config: defaultConfig(), dt: TICK_DT };
    const server = createWorld(ctx.level, 9);
    const a = def.areas![0];
    addPlayer(server, createPlayer(1, 0, a.pos, a.yawDeg, ctx.config));
    const rng = rngFromSeed(42);
    const inputs: PlayerInput[] = [];
    let yaw = 0;
    let held = 0;
    for (let t = 1; t <= 400; t++) {
      yaw += (rngFloat(rng) - 0.5) * 10;
      if (t % 15 === 0) held = rngNextU32(rng) & ALL_BUTTONS & ~(1 << 12);
      inputs.push({
        tick: t,
        buttons: held,
        view: netView(yawToView(yaw, (rngFloat(rng) - 0.5) * 20)),
      });
    }
    // server runs everything; at tick 200 the client receives the exact state and replays the rest
    for (let t = 0; t < 200; t++) step(server, { 1: inputs[t] }, ctx);
    const bytes = encodeSnapshot(
      {
        seq: 1,
        tick: server.tick,
        ackInput: 200,
        lead: 0,
        baseline: 0,
        ...publicState(server),
        grenades: server.grenades,
        zones: zoneOverrides(server),
        own: { player: server.players[0], boomerang: server.boomerangs[0] },
        events: null,
        extra: null,
      },
      null,
    );
    const snap = decodeSnapshot(bytes, () => null);
    const client = cloneWorld(server);
    client.players[0] = snap.own!.player;
    client.boomerangs[0] = snap.own!.boomerang!;
    for (let t = 200; t < 400; t++) {
      step(server, { 1: inputs[t] }, ctx);
      stepPredict(client, 1, inputs[t], ctx);
    }
    expect(JSON.stringify(client.players[0])).toBe(JSON.stringify(server.players[0]));
    expect(JSON.stringify(client.boomerangs[0])).toBe(JSON.stringify(server.boomerangs[0]));
  });
});

describe('names', () => {
  it('sanitizes nicknames', () => {
    expect(sanitizeName('  Ace<script>  ')).toBe('Acescript');
    expect(sanitizeName('x')).toMatch(/^Pilot\d{4}$/);
    expect(sanitizeName('a'.repeat(40)).length).toBe(16);
  });
});
