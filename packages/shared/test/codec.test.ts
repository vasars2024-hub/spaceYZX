import { describe, expect, it } from 'vitest';
import type { Quat, Vec3 } from '../src/index';
import {
  BitReader,
  BitWriter,
  CodecError,
  DEFAULT_POS_FORMAT,
  DEFAULT_VEL_FORMAT,
  defineSchema,
  dequantizeFloat,
  normalize,
  octFromInts,
  octToInts,
  qNormalize,
  quantizeFloat,
  quatToInts,
  readAngle,
  readChangedMask,
  readDeltaPos,
  readDeltaQuat,
  readDeltaUint,
  readPos,
  readQFloat,
  readQuat,
  readUnit,
  readVel,
  snapAngle,
  snapQuat,
  snapUnit,
  snapVec3,
  utf8Encode,
  writeAngle,
  writeChangedMask,
  writeDeltaPos,
  writeDeltaQuat,
  writeDeltaUint,
  writePos,
  writeQFloat,
  writeQuat,
  writeUnit,
  writeVel,
} from '../src/index';

/** Tiny seeded LCG (Numerical Recipes constants) so fuzz tests are reproducible. */
const lcg = (seed: number) => {
  let s = seed >>> 0;
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  return {
    float: next,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (n: number) => Math.floor(next() * n),
  };
};
type Rand = ReturnType<typeof lcg>;

const roundTrip = (write: (w: BitWriter) => void): BitReader => {
  const w = new BitWriter(1);
  write(w);
  return new BitReader(w.finish());
};

const expectCodecError = (fn: () => unknown, code?: string) => {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(CodecError);
  if (code) expect((err as CodecError).code).toBe(code);
};

const randUnit = (rnd: Rand): Vec3 => {
  const z = rnd.range(-1, 1);
  const t = rnd.range(0, Math.PI * 2);
  const r = Math.sqrt(1 - z * z);
  return { x: r * Math.cos(t), y: r * Math.sin(t), z };
};

const randQuat = (rnd: Rand): Quat =>
  qNormalize({
    x: rnd.range(-1, 1),
    y: rnd.range(-1, 1),
    z: rnd.range(-1, 1),
    w: rnd.range(-1, 1),
  });

const angleDeg = (a: Vec3, b: Vec3) =>
  (Math.acos(Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)) * 180) / Math.PI;

const quatAngleDeg = (a: Quat, b: Quat) => {
  const d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
};

describe('BitWriter / BitReader', () => {
  it('round-trips bits, bools, uints and ints with edge values', () => {
    const r = roundTrip((w) => {
      w.writeBits(0, 0);
      w.writeBits(0, 1);
      w.writeBits(1, 1);
      w.writeBits(0xffffffff, 32);
      w.writeBits(0, 32);
      w.writeBool(true);
      w.writeBool(false);
      w.writeUint(2 ** 32 - 1, 32);
      w.writeUint(5, 3);
      w.writeUint(2 ** 53 - 1, 53);
      w.writeUint(2 ** 40 + 7, 41);
      w.writeInt(-1, 1);
      w.writeInt(0, 1);
      w.writeInt(-128, 8);
      w.writeInt(127, 8);
      w.writeInt(-(2 ** 31), 32);
      w.writeInt(2 ** 31 - 1, 32);
      w.writeInt(-(2 ** 52), 53);
    });
    expect(r.readBits(0)).toBe(0);
    expect(r.readBits(1)).toBe(0);
    expect(r.readBits(1)).toBe(1);
    expect(r.readBits(32)).toBe(0xffffffff);
    expect(r.readBits(32)).toBe(0);
    expect(r.readBool()).toBe(true);
    expect(r.readBool()).toBe(false);
    expect(r.readUint(32)).toBe(2 ** 32 - 1);
    expect(r.readUint(3)).toBe(5);
    expect(r.readUint(53)).toBe(2 ** 53 - 1);
    expect(r.readUint(41)).toBe(2 ** 40 + 7);
    expect(r.readInt(1)).toBe(-1);
    expect(r.readInt(1)).toBe(0);
    expect(r.readInt(8)).toBe(-128);
    expect(r.readInt(8)).toBe(127);
    expect(r.readInt(32)).toBe(-(2 ** 31));
    expect(r.readInt(32)).toBe(2 ** 31 - 1);
    expect(r.readInt(53)).toBe(-(2 ** 52));
    r.expectEnd();
  });

  it('round-trips varints, floats, bytes and strings', () => {
    const vals = [0, 1, 127, 128, 16383, 16384, 2 ** 32 - 1, 2 ** 53 - 1];
    const ints = [0, -1, 1, -64, 64, -(2 ** 52), 2 ** 52 - 1];
    const strs = ['', 'a', 'héllo wörld', '日本語', '🚀 space 🌌', 'x'.repeat(300)];
    const bytes = Uint8Array.from([0, 1, 254, 255, 128]);
    const r = roundTrip((w) => {
      w.writeBool(true); // misalign everything that follows
      for (const v of vals) w.writeVarUint(v);
      for (const v of ints) w.writeVarInt(v);
      w.writeFloat32(1.5);
      w.writeFloat32(-0);
      w.writeFloat32(Infinity);
      w.writeFloat64(Math.PI);
      w.writeFloat64(-Number.MAX_VALUE);
      w.writeFloat64(NaN);
      w.writeBytes(bytes);
      for (const s of strs) w.writeString(s);
      w.alignToByte();
      w.writeBytes(bytes);
    });
    expect(r.readBool()).toBe(true);
    for (const v of vals) expect(r.readVarUint()).toBe(v);
    for (const v of ints) expect(r.readVarInt()).toBe(v);
    expect(r.readFloat32()).toBe(1.5);
    expect(Object.is(r.readFloat32(), -0)).toBe(true);
    expect(r.readFloat32()).toBe(Infinity);
    expect(r.readFloat64()).toBe(Math.PI);
    expect(r.readFloat64()).toBe(-Number.MAX_VALUE);
    expect(r.readFloat64()).toBeNaN();
    expect(r.readBytes(bytes.length)).toEqual(bytes);
    for (const s of strs) expect(r.readString()).toBe(s);
    r.alignToByte();
    expect(r.bitPosition % 8).toBe(0);
    expect(r.readBytes(bytes.length)).toEqual(bytes);
    r.expectEnd();
  });

  it('encodes UTF-8 correctly and replaces lone surrogates', () => {
    const s = 'aé€𝄞';
    expect(Array.from(utf8Encode(s))).toEqual([
      0x61, 0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9d, 0x84, 0x9e,
    ]);
    expect(Array.from(utf8Encode('\ud800x'))).toEqual([0xef, 0xbf, 0xbd, 0x78]);
  });

  it('packs mixed sizes bit-exactly', () => {
    const w = new BitWriter();
    w.writeUint(1, 1);
    w.writeUint(0b101, 3);
    w.writeUint(0xf, 4);
    w.writeUint(0x1ff, 9);
    expect(w.bitLength).toBe(17);
    expect(w.byteLength).toBe(3);
    // LSB-first: byte0 = 1 | 101<<1 | 1111<<4 = 0xfb; next 9 bits all ones.
    expect(Array.from(w.finish())).toEqual([0xfb, 0xff, 0x01]);
    w.alignToByte();
    expect(w.bitLength).toBe(24);
    w.reset();
    expect(w.finish().length).toBe(0);
    w.writeUint(3, 2);
    expect(Array.from(w.finish())).toEqual([3]);
  });

  it('rejects out-of-range writes', () => {
    const w = new BitWriter();
    expectCodecError(() => w.writeBits(2, 1), 'range');
    expectCodecError(() => w.writeBits(1, 33), 'range');
    expectCodecError(() => w.writeUint(-1, 8), 'range');
    expectCodecError(() => w.writeUint(1.5, 8), 'range');
    expectCodecError(() => w.writeUint(2 ** 53, 53), 'range');
    expectCodecError(() => w.writeInt(128, 8), 'range');
    expectCodecError(() => w.writeVarUint(2 ** 53), 'range');
    expectCodecError(() => w.writeString('abcd', 3), 'range');
  });

  it('throws CodecError on overrun and garbage, never reading out of bounds', () => {
    expectCodecError(() => new BitReader(new Uint8Array(0)).readBool(), 'overrun');
    expectCodecError(() => new BitReader(new Uint8Array(3)).readBits(25), 'overrun');
    expectCodecError(() => new BitReader(new Uint8Array(7)).readFloat64(), 'overrun');
    expectCodecError(() => new BitReader(new Uint8Array(4)).readUint(33), 'overrun');
    expectCodecError(() => new BitReader(new Uint8Array(2)).readBytes(3), 'overrun');
    // Endless continuation bits: rejected after 8 bytes, never loops.
    expectCodecError(() => new BitReader(new Uint8Array(64).fill(0xff)).readVarUint(), 'invalid');
    expectCodecError(() => new BitReader(Uint8Array.from([0xff, 0xff])).readVarUint(), 'overrun');
    expectCodecError(() => new BitReader(Uint8Array.from([0x80, 0x00])).readVarUint(), 'invalid');
    // Huge declared string length: rejected before allocating.
    const huge = roundTrip((w) => w.writeVarUint(2 ** 40));
    expectCodecError(() => huge.readString(), 'invalid');
    const lying = roundTrip((w) => w.writeVarUint(100));
    expectCodecError(() => lying.readString(), 'overrun');
    // Invalid UTF-8 (overlong, lone continuation, surrogate, truncated).
    for (const bad of [[0xc0, 0x80], [0x80], [0xed, 0xa0, 0x80], [0xe2, 0x82]]) {
      const r = roundTrip((w) => {
        w.writeVarUint(bad.length);
        w.writeBytes(Uint8Array.from(bad));
      });
      expectCodecError(() => r.readString(), 'invalid');
    }
    expectCodecError(() => new BitReader(new Uint8Array(2)).expectEnd(), 'invalid');
    const pad = new BitReader(Uint8Array.from([0x02]));
    pad.readBool();
    expectCodecError(() => pad.expectEnd(), 'invalid');
  });

  it('survives random garbage input', () => {
    const rnd = lcg(99);
    const schema = defineSchema([
      { name: 'a', kind: 'uint', bits: 12 },
      { name: 'p', kind: 'pos' },
      { name: 'q', kind: 'quat' },
      { name: 'n', kind: 'unit' },
    ]);
    const base = schema.quantize({
      a: 5,
      p: { x: 1, y: 2, z: 3 },
      q: randQuat(rnd),
      n: randUnit(rnd),
    });
    for (let i = 0; i < 2000; i++) {
      const bytes = Uint8Array.from({ length: rnd.int(24) }, () => rnd.int(256));
      for (const fn of [
        (r: BitReader) => r.readString(),
        (r: BitReader) => r.readVarUint(),
        (r: BitReader) => schema.decode(r),
        (r: BitReader) => schema.decode(r, base),
      ]) {
        try {
          fn(new BitReader(bytes));
        } catch (e) {
          expect(e).toBeInstanceOf(CodecError);
        }
      }
    }
  });

  it('fuzzes mixed fields with a seeded LCG', () => {
    const rnd = lcg(12345);
    for (let round = 0; round < 50; round++) {
      type Op = { kind: number; v: number | string | boolean; bits: number };
      const ops: Op[] = [];
      for (let i = 0; i < 200; i++) {
        const kind = rnd.int(7);
        const bits = 1 + rnd.int(53);
        let v: number | string | boolean;
        if (kind === 0) v = rnd.float() < 0.5;
        else if (kind === 1) v = Math.floor(rnd.float() * 2 ** Math.min(bits, 32));
        else if (kind === 2) v = Math.floor(rnd.float() * 2 ** bits) - 2 ** (bits - 1);
        else if (kind === 3) v = Math.floor(rnd.float() * 2 ** rnd.int(54));
        else if (kind === 4) v = Math.fround(rnd.range(-1e6, 1e6));
        else if (kind === 5) v = rnd.range(-1e300, 1e300);
        else v = String.fromCodePoint(...Array.from({ length: rnd.int(6) }, () => rnd.int(0xd7ff)));
        ops.push({ kind, v, bits });
      }
      const r = roundTrip((w) => {
        for (const o of ops) {
          if (o.kind === 0) w.writeBool(o.v as boolean);
          else if (o.kind === 1) w.writeUint(o.v as number, Math.min(o.bits, 32));
          else if (o.kind === 2) w.writeInt(o.v as number, o.bits);
          else if (o.kind === 3) w.writeVarUint(o.v as number);
          else if (o.kind === 4) w.writeFloat32(o.v as number);
          else if (o.kind === 5) w.writeFloat64(o.v as number);
          else w.writeString(o.v as string);
        }
      });
      for (const o of ops) {
        let got: number | string | boolean;
        if (o.kind === 0) got = r.readBool();
        else if (o.kind === 1) got = r.readUint(Math.min(o.bits, 32));
        else if (o.kind === 2) got = r.readInt(o.bits);
        else if (o.kind === 3) got = r.readVarUint();
        else if (o.kind === 4) got = r.readFloat32();
        else if (o.kind === 5) got = r.readFloat64();
        else got = r.readString();
        expect(got).toBe(o.v);
      }
      r.expectEnd();
    }
  });
});

describe('quantization', () => {
  it('quantizes bounded floats within half a step, clamping', () => {
    const rnd = lcg(1);
    for (let i = 0; i < 1000; i++) {
      const bits = 1 + rnd.int(20);
      const v = rnd.range(-10, 10);
      const q = quantizeFloat(v, -10, 10, bits);
      const step = 20 / (2 ** bits - 1);
      expect(Math.abs(dequantizeFloat(q, -10, 10, bits) - v)).toBeLessThanOrEqual(step / 2 + 1e-9);
      expect(quantizeFloat(dequantizeFloat(q, -10, 10, bits), -10, 10, bits)).toBe(q);
    }
    expect(quantizeFloat(-99, -1, 1, 8)).toBe(0);
    expect(quantizeFloat(99, -1, 1, 8)).toBe(255);
    expect(quantizeFloat(NaN, -1, 1, 8)).toBe(0);
    expect(dequantizeFloat(255, -1, 1, 8)).toBe(1);
    const r = roundTrip((w) => writeQFloat(w, 0.3, 0, 1, 10));
    expect(Math.abs(readQFloat(r, 0, 1, 10) - 0.3)).toBeLessThan(0.5 / 1023 + 1e-12);
  });

  it('quantizes positions (1/256 m) and velocities (1/64 m/s)', () => {
    expect(DEFAULT_POS_FORMAT.x.step).toBe(1 / 256);
    expect(DEFAULT_POS_FORMAT.x.bits).toBe(17);
    expect(DEFAULT_VEL_FORMAT.x.step).toBe(1 / 64);
    const rnd = lcg(2);
    for (let i = 0; i < 1000; i++) {
      const p = { x: rnd.range(-256, 255.99), y: rnd.range(-256, 255.99), z: rnd.range(-256, 255) };
      const v = { x: rnd.range(-64, 63.98), y: rnd.range(-64, 63.98), z: rnd.range(-64, 63.98) };
      const r = roundTrip((w) => {
        writePos(w, p);
        writeVel(w, v);
      });
      const p2 = readPos(r);
      const v2 = readVel(r);
      for (const k of ['x', 'y', 'z'] as const) {
        expect(Math.abs(p2[k] - p[k])).toBeLessThanOrEqual(1 / 512);
        expect(Math.abs(v2[k] - v[k])).toBeLessThanOrEqual(1 / 128);
      }
      expect(p2).toEqual(snapVec3(p, DEFAULT_POS_FORMAT));
      expect(r.bitPosition).toBe(51 + 39);
    }
    const zero = roundTrip((w) => writeVel(w, { x: 0, y: 0, z: -0 }));
    expect(readVel(zero)).toEqual({ x: 0, y: 0, z: 0 });
    const clamped = roundTrip((w) => writePos(w, { x: 1e9, y: -1e9, z: NaN }));
    expect(readPos(clamped)).toEqual({ x: 256 - 1 / 256, y: -256, z: -256 });
  });

  it('encodes unit vectors (octahedral 2x12) within 0.1 degrees', () => {
    const rnd = lcg(3);
    let maxErr = 0;
    const axes: Vec3[] = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ];
    const samples = [...axes, ...Array.from({ length: 20000 }, () => randUnit(rnd))];
    for (const n of samples) {
      const r = roundTrip((w) => writeUnit(w, n));
      const d = readUnit(r);
      expect(r.bitPosition).toBe(24);
      maxErr = Math.max(maxErr, angleDeg(n, d));
      expect(Math.abs(Math.hypot(d.x, d.y, d.z) - 1)).toBeLessThan(1e-12);
      // Idempotent: the decoded vector re-encodes to the same ints.
      expect(octToInts(d)).toEqual(octToInts(n));
    }
    // Axes are exact, and border twins (e.g. just below the equator) stay idempotent.
    for (const a of axes) expect(snapUnit(a)).toEqual(a);
    for (let i = 0; i < 5000; i++) {
      const e = normalize({ x: rnd.range(-1, 1), y: rnd.range(-1, 1), z: -rnd.range(0, 1e-3) });
      const q = octToInts(e);
      expect(octToInts(snapUnit(e))).toEqual(q);
      const b = normalize({ x: rnd.range(-1e-3, 1e-3), y: rnd.range(-1, 1), z: -1 });
      expect(octToInts(snapUnit(b))).toEqual(octToInts(b));
    }
    expect(maxErr).toBeLessThan(0.1);
    expect(snapUnit({ x: 0, y: 0, z: 0 })).toEqual(octFromInts(octToInts({ x: 0, y: 0, z: 1 })));
    expect(angleDeg(snapUnit({ x: 3, y: 4, z: 0 }), normalize({ x: 3, y: 4, z: 0 }))).toBeLessThan(
      0.1,
    );
  });

  it('compresses quaternions (smallest three, 10 bits) within 0.2 degrees', () => {
    const rnd = lcg(4);
    let maxErr = 0;
    for (let i = 0; i < 20000; i++) {
      const q = randQuat(rnd);
      const r = roundTrip((w) => writeQuat(w, q));
      const d = readQuat(r);
      expect(r.bitPosition).toBe(32);
      maxErr = Math.max(maxErr, quatAngleDeg(q, d));
      expect(Math.abs(Math.hypot(d.x, d.y, d.z, d.w) - 1)).toBeLessThan(1e-12);
    }
    expect(maxErr).toBeLessThan(0.2);
    // Idempotent even for ties between components (e.g. 90° turns) and near-ties.
    const s = Math.SQRT1_2;
    const ties: Quat[] = [
      { x: s, y: 0, z: 0, w: s },
      { x: 0, y: -s, z: 0, w: s },
      { x: 0.5, y: 0.5, z: -0.5, w: 0.5 },
      { x: 0.5, y: -0.5, z: 0.5000001, w: -0.4999999 },
    ];
    for (let i = 0; i < 20000; i++) {
      const q = i < ties.length ? qNormalize(ties[i]) : randQuat(rnd);
      const ints = quatToInts(q);
      expect(quatToInts(snapQuat(q))).toEqual(ints);
      if (i % 3 === 0) {
        // Near-tie: two components of almost equal magnitude.
        const t = rnd.range(0.3, 0.7);
        const n = qNormalize({
          x: t,
          y: -t + rnd.range(-1e-3, 1e-3),
          z: rnd.float() * 0.3,
          w: 0.2,
        });
        expect(quatToInts(snapQuat(n))).toEqual(quatToInts(n));
      }
    }
    expect(snapQuat({ x: 0, y: 0, z: 0, w: 1 })).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    // q and -q are the same rotation and encode identically.
    const q = randQuat(rnd);
    expect(quatToInts({ x: -q.x, y: -q.y, z: -q.z, w: -q.w })).toEqual(quatToInts(q));
    // 12 bits is proportionally tighter.
    let maxErr12 = 0;
    for (let i = 0; i < 5000; i++) {
      const q12 = randQuat(rnd);
      maxErr12 = Math.max(maxErr12, quatAngleDeg(q12, snapQuat(q12, 12)));
    }
    expect(maxErr12).toBeLessThan(0.05);
    expect(snapQuat({ x: 0, y: 0, z: 0, w: 0 })).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it('encodes angles with wrap-around', () => {
    const rnd = lcg(5);
    const step = (Math.PI * 2) / 4096;
    for (let i = 0; i < 1000; i++) {
      const a = rnd.range(-20, 20);
      const r = roundTrip((w) => writeAngle(w, a));
      const d = readAngle(r);
      expect(d).toBeGreaterThanOrEqual(-Math.PI);
      expect(d).toBeLessThan(Math.PI);
      const tau = Math.PI * 2;
      const diff = Math.abs(((((d - a + Math.PI) % tau) + tau) % tau) - Math.PI);
      expect(diff).toBeLessThanOrEqual(step / 2 + 1e-9);
      expect(snapAngle(d)).toBe(d);
    }
    expect(snapAngle(Math.PI)).toBe(-Math.PI);
    expect(snapAngle(0)).toBe(0);
  });
});

describe('delta helpers', () => {
  it('writes one bit for unchanged values and restores changed ones', () => {
    const w = new BitWriter();
    expect(writeDeltaUint(w, 7, 7, 10)).toBe(false);
    expect(writeDeltaUint(w, 9, 7, 10)).toBe(true);
    expect(writeDeltaUint(w, 3, undefined, 10)).toBe(true);
    const p = { x: 10, y: 1, z: -5 };
    const pb = { x: 10.1, y: 1, z: -5.3 };
    expect(writeDeltaPos(w, p, p)).toBe(false);
    expect(writeDeltaPos(w, p, pb)).toBe(true);
    expect(writeDeltaPos(w, p, { x: -200, y: 100, z: 200 })).toBe(true); // absolute fallback
    const q = randQuat(lcg(6));
    expect(writeDeltaQuat(w, q, q)).toBe(false);
    expect(writeDeltaQuat(w, q, randQuat(lcg(7)))).toBe(true);
    const r = new BitReader(w.finish());
    expect(readDeltaUint(r, 7, 10)).toBe(7);
    expect(readDeltaUint(r, 7, 10)).toBe(9);
    expect(readDeltaUint(r, undefined, 10)).toBe(3);
    const sp = snapVec3(p, DEFAULT_POS_FORMAT);
    expect(readDeltaPos(r, p)).toEqual(sp);
    expect(readDeltaPos(r, pb)).toEqual(sp);
    expect(readDeltaPos(r, { x: -200, y: 100, z: 200 })).toEqual(sp);
    expect(readDeltaQuat(r, q)).toEqual(snapQuat(q));
    expect(readDeltaQuat(r, randQuat(lcg(7)))).toEqual(snapQuat(q));
    r.expectEnd();
    // A "no change" bit without a baseline is garbage.
    expectCodecError(
      () => readDeltaUint(new BitReader(new Uint8Array(1)), undefined, 4),
      'invalid',
    );
  });

  it('round-trips changed masks up to 32 fields', () => {
    const r = roundTrip((w) => {
      writeChangedMask(w, 0xffffffff, 32);
      writeChangedMask(w, 0b101, 3);
      writeChangedMask(w, 0, 0);
    });
    expect(readChangedMask(r, 32)).toBe(0xffffffff);
    expect(readChangedMask(r, 3)).toBe(0b101);
    expect(readChangedMask(r, 0)).toBe(0);
    expectCodecError(() => writeChangedMask(new BitWriter(), 8, 3), 'range');
  });
});

describe('schema delta encoding', () => {
  const player = defineSchema([
    { name: 'id', kind: 'uint', bits: 8 },
    { name: 'pos', kind: 'pos' },
    { name: 'vel', kind: 'vel' },
    { name: 'rot', kind: 'quat' },
    { name: 'aim', kind: 'unit' },
    { name: 'health', kind: 'uint', bits: 7 },
    { name: 'charge', kind: 'qfloat', min: 0, max: 1, bits: 6 },
    { name: 'spin', kind: 'int', bits: 6 },
    { name: 'yaw', kind: 'angle' },
    { name: 'grounded', kind: 'bool' },
    { name: 'dashing', kind: 'bool' },
  ]);
  type Player = Parameters<typeof player.encode>[1];

  const randomPlayer = (rnd: Rand, id: number): Player => ({
    id,
    pos: { x: rnd.range(-200, 200), y: rnd.range(0, 60), z: rnd.range(-200, 200) },
    vel: { x: rnd.range(-12, 12), y: rnd.range(-5, 5), z: rnd.range(-12, 12) },
    rot: randQuat(rnd),
    aim: randUnit(rnd),
    health: rnd.int(101),
    charge: rnd.float(),
    spin: rnd.int(64) - 32,
    yaw: rnd.range(-Math.PI, Math.PI),
    grounded: rnd.float() < 0.5,
    dashing: rnd.float() < 0.1,
  });

  const encode = (obj: Player, base?: Player) => {
    const w = new BitWriter();
    player.encode(w, obj, base);
    return w.finish();
  };

  it('full encode decodes to the quantized object', () => {
    const rnd = lcg(8);
    for (let i = 0; i < 200; i++) {
      const p = randomPlayer(rnd, i);
      const r = new BitReader(encode(p));
      const d = player.decode(r);
      r.expectEnd();
      expect(d).toEqual(player.quantize(p));
      expect(player.quantize(d)).toEqual(d);
      expect(player.equals(d, p)).toBe(true);
    }
  });

  it('an unchanged object encodes to just the mask', () => {
    const p = player.quantize(randomPlayer(lcg(9), 1));
    const w = new BitWriter();
    expect(player.encode(w, p, p)).toBe(0);
    expect(w.bitLength).toBe(player.fields.length);
    expect(w.finish().length).toBe(2);
    expect(player.decode(new BitReader(w.finish()), p)).toEqual(p);
  });

  it('writes only changed fields', () => {
    const base = player.quantize(randomPlayer(lcg(10), 1));
    const next = { ...base, health: base.health - 10, dashing: !base.dashing };
    const w = new BitWriter();
    const mask = player.encode(w, next, base);
    expect(mask).toBe((1 << 5) | (1 << 10));
    expect(w.bitLength).toBe(11 + 7 + 1);
    expect(player.decode(new BitReader(w.finish()), base)).toEqual(player.quantize(next));
  });

  it('rejects invalid schemas and values', () => {
    expectCodecError(() => defineSchema([{ name: 'a', kind: 'qfloat', bits: 8 }]), 'range');
    expectCodecError(() =>
      defineSchema([
        { name: 'a', kind: 'bool' },
        { name: 'a', kind: 'bool' },
      ]),
    );
    const many = Array.from({ length: 33 }, (_, i) => ({ name: `f${i}`, kind: 'bool' as const }));
    expectCodecError(() => defineSchema(many), 'range');
    const s = defineSchema([{ name: 'n', kind: 'uint', bits: 4 }]);
    expectCodecError(() => s.encode(new BitWriter(), { n: 16 }), 'range');
    // A malicious delta that leaves the component range is rejected.
    const ps = defineSchema([{ name: 'p', kind: 'pos' }]);
    const w = new BitWriter();
    w.writeBits(1, 1); // mask: changed
    w.writeUint(0, 2); // class 0 (4-bit deltas)
    for (let i = 0; i < 3; i++) w.writeUint(15, 4); // zigzag 15 = -8
    const r = new BitReader(w.finish());
    expectCodecError(() => ps.decode(r, { p: { x: -256, y: -256, z: -256 } }), 'invalid');
  });

  it('1000-step random walk against decoded baselines never drifts', () => {
    const rnd = lcg(11);
    const src = randomPlayer(rnd, 3);
    let serverBase: Player | undefined; // what the server believes the client has
    let clientBase: Player | undefined; // what the client actually decoded
    const history: Player[] = [];
    for (let step = 0; step < 1000; step++) {
      // Walk every field a little; occasionally jump.
      const jump = rnd.float() < 0.02;
      const dp = jump ? 50 : 0.3;
      src.pos = {
        x: Math.max(-255, Math.min(255, src.pos.x + rnd.range(-dp, dp))),
        y: Math.max(-255, Math.min(255, src.pos.y + rnd.range(-dp, dp))),
        z: Math.max(-255, Math.min(255, src.pos.z + rnd.range(-dp, dp))),
      };
      src.vel = {
        x: Math.max(-63, Math.min(63, src.vel.x + rnd.range(-0.5, 0.5))),
        y: Math.max(-63, Math.min(63, src.vel.y + rnd.range(-0.5, 0.5))),
        z: src.vel.z,
      };
      const turn = jump ? 1 : 0.02;
      src.rot = qNormalize({
        x: src.rot.x + rnd.range(-turn, turn),
        y: src.rot.y + rnd.range(-turn, turn),
        z: src.rot.z + rnd.range(-turn, turn),
        w: src.rot.w + rnd.range(-turn, turn),
      });
      src.aim = normalize({
        x: src.aim.x + rnd.range(-turn, turn),
        y: src.aim.y + rnd.range(-turn, turn),
        z: src.aim.z + rnd.range(-turn, turn),
      });
      if (rnd.float() < 0.1) src.health = rnd.int(101);
      src.charge = Math.min(1, Math.max(0, src.charge + rnd.range(-0.05, 0.05)));
      if (rnd.float() < 0.1) src.spin = rnd.int(64) - 32;
      src.yaw += rnd.range(-0.1, 0.1);
      src.grounded = rnd.float() < 0.8 ? src.grounded : !src.grounded;

      const bytes = encode(src, serverBase);
      const r = new BitReader(bytes);
      const decoded = player.decode(r, clientBase);
      r.expectEnd();
      expect(decoded).toEqual(player.quantize(src));
      history.push(decoded);
      // Sometimes the ack is late: use an older decoded snapshot as the baseline.
      const lag = rnd.int(4);
      const base = history[Math.max(0, history.length - 1 - lag)];
      serverBase = base;
      clientBase = player.quantize(base); // an independent copy
    }
  });

  it('size report: 10 players under ~25 B full and ~10 B delta each', () => {
    const rnd = lcg(12);
    const snap = defineSchema([
      { name: 'id', kind: 'uint', bits: 8 },
      { name: 'pos', kind: 'pos' },
      { name: 'vel', kind: 'vel' },
      { name: 'rot', kind: 'quat' },
      { name: 'health', kind: 'uint', bits: 7 },
      { name: 'grounded', kind: 'bool' },
      { name: 'dashing', kind: 'bool' },
      { name: 'hasBoomerang', kind: 'bool' },
    ]);
    type P = Parameters<typeof snap.encode>[1];
    const players: P[] = Array.from({ length: 10 }, (_, id) => ({
      id,
      pos: { x: rnd.range(-200, 200), y: rnd.range(0, 40), z: rnd.range(-200, 200) },
      vel: { x: rnd.range(-9, 9), y: 0, z: rnd.range(-9, 9) },
      rot: randQuat(rnd),
      health: 100,
      grounded: true,
      dashing: false,
      hasBoomerang: true,
    }));
    const encodeAll = (list: P[], base?: P[]) => {
      const w = new BitWriter();
      list.forEach((p, i) => snap.encode(w, p, base?.[i]));
      return w.finish().length;
    };
    const full = encodeAll(players);
    const base = players.map((p) => snap.quantize(p));
    let deltaTotal = 0;
    const steps = 30;
    for (let t = 0; t < steps; t++) {
      // Two 60 Hz ticks of typical movement per snapshot (30 Hz snapshots, baseline = last one).
      for (const p of players) {
        const dt = 2 / 60;
        p.vel = {
          x: p.vel.x + rnd.range(-0.4, 0.4),
          y: p.vel.y,
          z: p.vel.z + rnd.range(-0.4, 0.4),
        };
        p.pos = { x: p.pos.x + p.vel.x * dt, y: p.pos.y, z: p.pos.z + p.vel.z * dt };
        p.rot = qNormalize({
          x: p.rot.x + rnd.range(-0.01, 0.01),
          y: p.rot.y + rnd.range(-0.01, 0.01),
          z: p.rot.z + rnd.range(-0.01, 0.01),
          w: p.rot.w + rnd.range(-0.01, 0.01),
        });
        if (rnd.float() < 0.02) p.health = Math.max(0, p.health - 20);
      }
      deltaTotal += encodeAll(players, base);
      players.forEach((p, i) => (base[i] = snap.quantize(p)));
    }
    const fullPer = full / 10;
    const deltaPer = deltaTotal / steps / 10;
    // The shared tsconfig has no DOM/Node types, so reach console through globalThis.
    const out = (globalThis as unknown as { console: { log(s: string): void } }).console;
    out.log(
      `codec size: full ${full} B (${fullPer.toFixed(1)} B/player), ` +
        `delta ${(deltaTotal / steps).toFixed(1)} B (${deltaPer.toFixed(1)} B/player)`,
    );
    expect(fullPer).toBeLessThan(25);
    expect(deltaPer).toBeLessThan(10);
  });
});
