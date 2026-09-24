// Field-level delta compression for snapshots.
//
// Every field is first quantized to a small tuple of unsigned ints (see quantize.ts). Deltas are
// decided and computed on those ints, so they are exact: a field is "unchanged" when its ints equal
// the baseline's ints, and the decoder then outputs the quantized baseline value. The decoded value
// is therefore always exactly quantize(source), whatever baseline was used - no drift.
//
// Changed vector fields (pos/vel/unit/quat) are written as a 2-bit width class followed by small
// zigzag deltas per component, falling back to absolute values (class 3) for big jumps.
//
// Wire format of a schema object:
//   full (no baseline):  every field, absolute
//   delta (baseline):    changed-field mask (1 bit per field), then only the changed fields
// Encoder and decoder must agree on whether a baseline is used (the snapshot header says which
// acknowledged snapshot is the baseline). Use the decoded/quantized object as the baseline on both
// sides (schema.quantize(obj) on the sender) for the smallest output.

import type { Quat } from '../../math/quat';
import type { Vec3 } from '../../math/vec3';
import type { BitReader, BitWriter } from './bits';
import { CodecError, MAX_UINT_BITS, unzigzag, zigzag } from './bits';
import type { Vec3Format } from './quantize';
import {
  DEFAULT_ANGLE_BITS,
  DEFAULT_POS_FORMAT,
  DEFAULT_QUAT_BITS,
  DEFAULT_UNIT_BITS,
  DEFAULT_VEL_FORMAT,
  MAX_QUAT_BITS,
  dequantizeAngle,
  dequantizeFloat,
  octFromInts,
  octToInts,
  quantizeAngle,
  quantizeFloat,
  quatFromInts,
  quatToInts,
  uniformVec3Format,
  vec3FromInts,
  vec3ToInts,
} from './quantize';

/** Bit widths of the three small-delta classes (class 3 = absolute value). */
export type DeltaWidths = readonly [number, number, number];

export const POS_DELTA_WIDTHS: DeltaWidths = [4, 8, 11];
export const VEL_DELTA_WIDTHS: DeltaWidths = [3, 6, 9];
export const UNIT_DELTA_WIDTHS: DeltaWidths = [3, 6, 9];
export const QUAT_DELTA_WIDTHS: DeltaWidths = [3, 5, 7];

// ---------------------------------------------------------------------------------------------
// Int-tuple codecs

interface TupleCodec<T> {
  /** Bit width of each int component. */
  readonly bits: readonly number[];
  /** Leading components that must be equal to delta-code (the quaternion's largest index). */
  readonly prefix: number;
  /** Small-delta classes; undefined = changed values are always written absolute. */
  readonly widths?: DeltaWidths;
  quant(v: T): number[];
  deq(q: readonly number[]): T;
}

const tuplesEqual = (a: readonly number[], b: readonly number[]): boolean => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const writeAbs = (w: BitWriter, c: TupleCodec<unknown>, q: readonly number[]): void => {
  for (let i = 0; i < q.length; i++) w.writeUint(q[i], c.bits[i]);
};

const readAbs = (r: BitReader, c: TupleCodec<unknown>): number[] =>
  c.bits.map((b) => r.readUint(b));

/** Write `q`, known to differ from baseline `qb`. */
const writeChange = (
  w: BitWriter,
  c: TupleCodec<unknown>,
  q: readonly number[],
  qb: readonly number[],
): void => {
  const widths = c.widths;
  if (!widths) {
    writeAbs(w, c, q);
    return;
  }
  let cls = 3;
  let prefixSame = true;
  for (let i = 0; i < c.prefix; i++) if (q[i] !== qb[i]) prefixSame = false;
  if (prefixSame) {
    let maxZ = 0;
    for (let i = c.prefix; i < q.length; i++) maxZ = Math.max(maxZ, zigzag(q[i] - qb[i]));
    for (let k = 0; k < 3; k++) {
      if (maxZ < 2 ** widths[k]) {
        cls = k;
        break;
      }
    }
  }
  w.writeUint(cls, 2);
  if (cls === 3) {
    writeAbs(w, c, q);
    return;
  }
  for (let i = c.prefix; i < q.length; i++) w.writeUint(zigzag(q[i] - qb[i]), widths[cls]);
};

const readChange = (r: BitReader, c: TupleCodec<unknown>, qb: readonly number[]): number[] => {
  const widths = c.widths;
  if (!widths) return readAbs(r, c);
  const cls = r.readUint(2);
  if (cls === 3) return readAbs(r, c);
  const out = qb.slice(0, c.prefix);
  for (let i = c.prefix; i < c.bits.length; i++) {
    const v = qb[i] + unzigzag(r.readUint(widths[cls]));
    if (v < 0 || v >= 2 ** c.bits[i]) {
      throw new CodecError('invalid', `delta leaves component range (${v})`);
    }
    out.push(v);
  }
  return out;
};

const checkBits = (bits: number, min: number, max: number, what: string): number => {
  if (!Number.isInteger(bits) || bits < min || bits > max) {
    throw new CodecError('range', `${what} bits ${bits} must be an integer in ${min}..${max}`);
  }
  return bits;
};

const checkWidths = (w: DeltaWidths): DeltaWidths => {
  for (const b of w) checkBits(b, 1, 32, 'delta width');
  return w;
};

const boolCodec: TupleCodec<boolean> = {
  bits: [1],
  prefix: 0,
  quant: (v) => [v ? 1 : 0],
  deq: (q) => q[0] === 1,
};

const uintCodec = (bits: number): TupleCodec<number> => ({
  bits: [checkBits(bits, 1, MAX_UINT_BITS, 'uint')],
  prefix: 0,
  quant: (v) => {
    if (!Number.isInteger(v) || v < 0 || v >= 2 ** bits) {
      throw new CodecError('range', `value ${v} does not fit in ${bits} unsigned bits`);
    }
    return [v];
  },
  deq: (q) => q[0],
});

const intCodec = (bits: number): TupleCodec<number> => ({
  bits: [checkBits(bits, 1, MAX_UINT_BITS, 'int')],
  prefix: 0,
  quant: (v) => {
    const half = 2 ** (bits - 1);
    if (!Number.isInteger(v) || v < -half || v >= half) {
      throw new CodecError('range', `value ${v} does not fit in ${bits} signed bits`);
    }
    return [zigzag(v)];
  },
  deq: (q) => unzigzag(q[0]),
});

const qfloatCodec = (min: number, max: number, bits: number): TupleCodec<number> => {
  quantizeFloat(0, min, max, bits); // validates the range and bits
  return {
    bits: [bits],
    prefix: 0,
    quant: (v) => [quantizeFloat(v, min, max, bits)],
    deq: (q) => dequantizeFloat(q[0], min, max, bits),
  };
};

const angleCodec = (bits: number): TupleCodec<number> => ({
  bits: [checkBits(bits, 1, 32, 'angle')],
  prefix: 0,
  quant: (v) => [quantizeAngle(v, bits)],
  deq: (q) => dequantizeAngle(q[0], bits),
});

const vec3Codec = (f: Vec3Format, widths: DeltaWidths): TupleCodec<Vec3> => ({
  bits: [f.x.bits, f.y.bits, f.z.bits],
  prefix: 0,
  widths: checkWidths(widths),
  quant: (v) => vec3ToInts(v, f),
  deq: (q) => vec3FromInts(q, f),
});

const unitCodec = (bits: number, widths: DeltaWidths): TupleCodec<Vec3> => ({
  bits: [checkBits(bits, 2, 30, 'unit'), bits],
  prefix: 0,
  widths: checkWidths(widths),
  quant: (v) => octToInts(v, bits),
  deq: (q) => octFromInts(q, bits),
});

const quatCodec = (bits: number, widths: DeltaWidths): TupleCodec<Quat> => ({
  bits: [2, checkBits(bits, 2, MAX_QUAT_BITS, 'quat'), bits, bits],
  prefix: 1,
  widths: checkWidths(widths),
  quant: (v) => quatToInts(v, bits),
  deq: (q) => quatFromInts(q, bits),
});

// ---------------------------------------------------------------------------------------------
// Standalone "changed bit + value" helpers. With a baseline: 1 bit when unchanged. Without one
// the value is always written absolute (the changed bit is still present and must be 1).

const writeDeltaWith = <T>(
  w: BitWriter,
  c: TupleCodec<T>,
  value: T,
  baseline: T | undefined,
): boolean => {
  const q = c.quant(value);
  if (baseline === undefined) {
    w.writeBool(true);
    writeAbs(w, c, q);
    return true;
  }
  const qb = c.quant(baseline);
  if (tuplesEqual(q, qb)) {
    w.writeBool(false);
    return false;
  }
  w.writeBool(true);
  writeChange(w, c, q, qb);
  return true;
};

const readDeltaWith = <T>(r: BitReader, c: TupleCodec<T>, baseline: T | undefined): T => {
  const changed = r.readBool();
  if (baseline === undefined) {
    if (!changed) throw new CodecError('invalid', 'unchanged field but no baseline');
    return c.deq(readAbs(r, c));
  }
  const qb = c.quant(baseline);
  return c.deq(changed ? readChange(r, c, qb) : qb);
};

export const writeDeltaBool = (w: BitWriter, v: boolean, base?: boolean): boolean =>
  writeDeltaWith(w, boolCodec, v, base);
export const readDeltaBool = (r: BitReader, base?: boolean): boolean =>
  readDeltaWith(r, boolCodec, base);

export const writeDeltaUint = (
  w: BitWriter,
  v: number,
  base: number | undefined,
  bits: number,
): boolean => writeDeltaWith(w, uintCodec(bits), v, base);
export const readDeltaUint = (r: BitReader, base: number | undefined, bits: number): number =>
  readDeltaWith(r, uintCodec(bits), base);

export const writeDeltaInt = (
  w: BitWriter,
  v: number,
  base: number | undefined,
  bits: number,
): boolean => writeDeltaWith(w, intCodec(bits), v, base);
export const readDeltaInt = (r: BitReader, base: number | undefined, bits: number): number =>
  readDeltaWith(r, intCodec(bits), base);

export const writeDeltaQFloat = (
  w: BitWriter,
  v: number,
  base: number | undefined,
  min: number,
  max: number,
  bits: number,
): boolean => writeDeltaWith(w, qfloatCodec(min, max, bits), v, base);
export const readDeltaQFloat = (
  r: BitReader,
  base: number | undefined,
  min: number,
  max: number,
  bits: number,
): number => readDeltaWith(r, qfloatCodec(min, max, bits), base);

export const writeDeltaAngle = (
  w: BitWriter,
  v: number,
  base: number | undefined,
  bits = DEFAULT_ANGLE_BITS,
): boolean => writeDeltaWith(w, angleCodec(bits), v, base);
export const readDeltaAngle = (
  r: BitReader,
  base: number | undefined,
  bits = DEFAULT_ANGLE_BITS,
): number => readDeltaWith(r, angleCodec(bits), base);

export const writeDeltaPos = (
  w: BitWriter,
  v: Vec3,
  base: Vec3 | undefined,
  f: Vec3Format = DEFAULT_POS_FORMAT,
  widths: DeltaWidths = POS_DELTA_WIDTHS,
): boolean => writeDeltaWith(w, vec3Codec(f, widths), v, base);
export const readDeltaPos = (
  r: BitReader,
  base: Vec3 | undefined,
  f: Vec3Format = DEFAULT_POS_FORMAT,
  widths: DeltaWidths = POS_DELTA_WIDTHS,
): Vec3 => readDeltaWith(r, vec3Codec(f, widths), base);

export const writeDeltaVel = (
  w: BitWriter,
  v: Vec3,
  base: Vec3 | undefined,
  f: Vec3Format = DEFAULT_VEL_FORMAT,
  widths: DeltaWidths = VEL_DELTA_WIDTHS,
): boolean => writeDeltaWith(w, vec3Codec(f, widths), v, base);
export const readDeltaVel = (
  r: BitReader,
  base: Vec3 | undefined,
  f: Vec3Format = DEFAULT_VEL_FORMAT,
  widths: DeltaWidths = VEL_DELTA_WIDTHS,
): Vec3 => readDeltaWith(r, vec3Codec(f, widths), base);

export const writeDeltaUnit = (
  w: BitWriter,
  v: Vec3,
  base: Vec3 | undefined,
  bits = DEFAULT_UNIT_BITS,
  widths: DeltaWidths = UNIT_DELTA_WIDTHS,
): boolean => writeDeltaWith(w, unitCodec(bits, widths), v, base);
export const readDeltaUnit = (
  r: BitReader,
  base: Vec3 | undefined,
  bits = DEFAULT_UNIT_BITS,
  widths: DeltaWidths = UNIT_DELTA_WIDTHS,
): Vec3 => readDeltaWith(r, unitCodec(bits, widths), base);

export const writeDeltaQuat = (
  w: BitWriter,
  v: Quat,
  base: Quat | undefined,
  bits = DEFAULT_QUAT_BITS,
  widths: DeltaWidths = QUAT_DELTA_WIDTHS,
): boolean => writeDeltaWith(w, quatCodec(bits, widths), v, base);
export const readDeltaQuat = (
  r: BitReader,
  base: Quat | undefined,
  bits = DEFAULT_QUAT_BITS,
  widths: DeltaWidths = QUAT_DELTA_WIDTHS,
): Quat => readDeltaWith(r, quatCodec(bits, widths), base);

// ---------------------------------------------------------------------------------------------
// Changed-field masks (bit i = field i), up to 32 fields.

export const MAX_SCHEMA_FIELDS = 32;

export const writeChangedMask = (w: BitWriter, mask: number, fieldCount: number): void => {
  checkBits(fieldCount, 0, MAX_SCHEMA_FIELDS, 'mask');
  w.writeBits(mask, fieldCount);
};

export const readChangedMask = (r: BitReader, fieldCount: number): number => {
  checkBits(fieldCount, 0, MAX_SCHEMA_FIELDS, 'mask');
  return r.readBits(fieldCount);
};

// ---------------------------------------------------------------------------------------------
// Schema-driven object codec

export type FieldKind =
  'bool' | 'uint' | 'int' | 'qfloat' | 'angle' | 'pos' | 'vel' | 'unit' | 'quat';

export interface FieldDef {
  readonly name: string;
  readonly kind: FieldKind;
  /** uint/int/qfloat/angle: value bits; pos/vel: bits per axis; unit/quat: bits per component (quat 2..12). */
  readonly bits?: number;
  /** qfloat (required) and pos/vel (per-axis range, default ±256 / ±64). */
  readonly min?: number;
  readonly max?: number;
  /** pos/vel/unit/quat: small-delta class widths. */
  readonly deltaWidths?: DeltaWidths;
}

export type FieldValue<K extends FieldKind> = K extends 'bool'
  ? boolean
  : K extends 'pos' | 'vel' | 'unit'
    ? Vec3
    : K extends 'quat'
      ? Quat
      : number;

export type SchemaObject<F extends readonly FieldDef[]> = {
  [D in F[number] as D['name']]: FieldValue<D['kind']>;
};

export interface Schema<T> {
  readonly fields: readonly FieldDef[];
  /**
   * Write `obj`: all fields when `baseline` is undefined, otherwise the changed-field mask and the
   * changed fields. Returns the changed mask (all fields set for a full encode; 0 = unchanged).
   */
  encode(w: BitWriter, obj: T, baseline?: T): number;
  /** Read an object written by encode() with the same (or an equal quantized) baseline. */
  decode(r: BitReader, baseline?: T): T;
  /** What the receiver would decode: every field quantized. */
  quantize(obj: T): T;
  /** True when both objects quantize identically (would delta-encode to an empty mask). */
  equals(a: T, b: T): boolean;
}

const fieldCodec = (f: FieldDef): TupleCodec<unknown> => {
  switch (f.kind) {
    case 'bool':
      return boolCodec as TupleCodec<unknown>;
    case 'uint':
      return uintCodec(f.bits ?? 32) as TupleCodec<unknown>;
    case 'int':
      return intCodec(f.bits ?? 32) as TupleCodec<unknown>;
    case 'qfloat':
      if (f.min === undefined || f.max === undefined || f.bits === undefined) {
        throw new CodecError('range', `qfloat field '${f.name}' needs min, max and bits`);
      }
      return qfloatCodec(f.min, f.max, f.bits) as TupleCodec<unknown>;
    case 'angle':
      return angleCodec(f.bits ?? DEFAULT_ANGLE_BITS) as TupleCodec<unknown>;
    case 'pos':
    case 'vel': {
      const isPos = f.kind === 'pos';
      const def = isPos ? DEFAULT_POS_FORMAT : DEFAULT_VEL_FORMAT;
      const custom = f.min !== undefined || f.max !== undefined || f.bits !== undefined;
      const fmt = custom
        ? uniformVec3Format(f.min ?? def.x.min, f.max ?? -def.x.min, f.bits ?? def.x.bits)
        : def;
      const widths = f.deltaWidths ?? (isPos ? POS_DELTA_WIDTHS : VEL_DELTA_WIDTHS);
      return vec3Codec(fmt, widths) as TupleCodec<unknown>;
    }
    case 'unit':
      return unitCodec(
        f.bits ?? DEFAULT_UNIT_BITS,
        f.deltaWidths ?? UNIT_DELTA_WIDTHS,
      ) as TupleCodec<unknown>;
    case 'quat':
      return quatCodec(
        f.bits ?? DEFAULT_QUAT_BITS,
        f.deltaWidths ?? QUAT_DELTA_WIDTHS,
      ) as TupleCodec<unknown>;
    default:
      throw new CodecError('range', `unknown field kind '${(f as FieldDef).kind}'`);
  }
};

/** Build an encoder/decoder for plain objects described by `fields` (at most 32). */
export const defineSchema = <const F extends readonly FieldDef[]>(
  fields: F,
): Schema<SchemaObject<F>> => {
  if (fields.length > MAX_SCHEMA_FIELDS) {
    throw new CodecError('range', `schema has ${fields.length} fields, max ${MAX_SCHEMA_FIELDS}`);
  }
  const names = new Set<string>();
  for (const f of fields) {
    if (!f.name || names.has(f.name)) {
      throw new CodecError('range', `schema field name '${f.name}' is empty or duplicated`);
    }
    names.add(f.name);
  }
  const codecs = fields.map(fieldCodec);
  const n = fields.length;
  type T = SchemaObject<F>;
  const get = (o: T, i: number): unknown => (o as Record<string, unknown>)[fields[i].name];
  const quantAll = (o: T): number[][] => codecs.map((c, i) => c.quant(get(o, i)));
  const build = (qs: readonly (readonly number[])[]): T => {
    const out: Record<string, unknown> = {};
    for (let i = 0; i < n; i++) out[fields[i].name] = codecs[i].deq(qs[i]);
    return out as T;
  };

  return {
    fields,
    encode(w, obj, baseline) {
      const qs = quantAll(obj);
      if (baseline === undefined) {
        for (let i = 0; i < n; i++) writeAbs(w, codecs[i], qs[i]);
        return n === 32 ? 0xffffffff : 2 ** n - 1;
      }
      const qb = quantAll(baseline);
      let mask = 0;
      for (let i = 0; i < n; i++) if (!tuplesEqual(qs[i], qb[i])) mask = (mask | (1 << i)) >>> 0;
      writeChangedMask(w, mask, n);
      for (let i = 0; i < n; i++) if ((mask >>> i) & 1) writeChange(w, codecs[i], qs[i], qb[i]);
      return mask;
    },
    decode(r, baseline) {
      if (baseline === undefined) return build(codecs.map((c) => readAbs(r, c)));
      const qb = quantAll(baseline);
      const mask = readChangedMask(r, n);
      return build(qb.map((b, i) => ((mask >>> i) & 1 ? readChange(r, codecs[i], b) : b)));
    },
    quantize: (obj) => build(quantAll(obj)),
    equals: (a, b) => {
      const qa = quantAll(a);
      const qb = quantAll(b);
      return qa.every((q, i) => tuplesEqual(q, qb[i]));
    },
  };
};
