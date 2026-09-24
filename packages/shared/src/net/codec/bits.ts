// Bit-level binary writer/reader for the network protocol.
// Bits are packed LSB-first inside each byte. The reader never reads out of bounds and never
// loops unbounded: every malformed or truncated input ends in a CodecError.

export type CodecErrorCode = 'overrun' | 'range' | 'invalid';

/** Thrown for truncated input ('overrun'), bad arguments ('range') or garbage ('invalid'). */
export class CodecError extends Error {
  readonly code: CodecErrorCode;

  constructor(code: CodecErrorCode, message: string) {
    super(message);
    this.name = 'CodecError';
    this.code = code;
  }
}

export const DEFAULT_MAX_STRING_BYTES = 4096;
/** Largest bit width accepted by writeUint/readUint (so values stay exact in a double). */
export const MAX_UINT_BITS = 53;

const TWO_32 = 0x100000000;
const MAX_VARINT_BYTES = 8; // 8 × 7 bits = 56 ≥ 53
const scratch = new DataView(new ArrayBuffer(8));

const checkBitCount = (bits: number, max: number): void => {
  if (!Number.isInteger(bits) || bits < 0 || bits > max) {
    throw new CodecError('range', `bit count ${bits} must be an integer in 0..${max}`);
  }
};

const checkUint = (value: number, bits: number): void => {
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** bits) {
    throw new CodecError('range', `value ${value} does not fit in ${bits} unsigned bits`);
  }
};

export const zigzag = (n: number): number => (n >= 0 ? n * 2 : -n * 2 - 1);
export const unzigzag = (z: number): number => (z % 2 === 0 ? z / 2 : -(z + 1) / 2);

/** UTF-8 encode without TextEncoder. Lone surrogates become U+FFFD. */
export const utf8Encode = (s: string): Uint8Array => {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return Uint8Array.from(out);
};

/** Strict UTF-8 decode: overlong forms, surrogates, > U+10FFFF and truncation throw. */
export const utf8Decode = (b: Uint8Array): string => {
  let s = '';
  const units: number[] = [];
  let i = 0;
  while (i < b.length) {
    const b0 = b[i];
    let cp: number;
    let need: number;
    let minCp: number;
    if (b0 < 0x80) {
      cp = b0;
      need = 0;
      minCp = 0;
    } else if (b0 >= 0xc2 && b0 < 0xe0) {
      cp = b0 & 0x1f;
      need = 1;
      minCp = 0x80;
    } else if (b0 >= 0xe0 && b0 < 0xf0) {
      cp = b0 & 0x0f;
      need = 2;
      minCp = 0x800;
    } else if (b0 >= 0xf0 && b0 < 0xf5) {
      cp = b0 & 0x07;
      need = 3;
      minCp = 0x10000;
    } else {
      throw new CodecError('invalid', `invalid UTF-8 lead byte 0x${b0.toString(16)}`);
    }
    if (i + need >= b.length) throw new CodecError('invalid', 'truncated UTF-8 sequence');
    for (let k = 1; k <= need; k++) {
      const bk = b[i + k];
      if ((bk & 0xc0) !== 0x80) throw new CodecError('invalid', 'invalid UTF-8 continuation');
      cp = (cp << 6) | (bk & 63);
    }
    if (cp < minCp || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      throw new CodecError('invalid', `invalid UTF-8 code point ${cp}`);
    }
    i += need + 1;
    if (cp >= 0x10000) {
      const c = cp - 0x10000;
      units.push(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
    } else units.push(cp);
    if (units.length >= 4096) {
      s += String.fromCharCode(...units);
      units.length = 0;
    }
  }
  return s + String.fromCharCode(...units);
};

/** Growable bit writer. Call finish() to get the packed bytes (last byte zero-padded). */
export class BitWriter {
  private buf: Uint8Array;
  private pos = 0;

  constructor(initialBytes = 64) {
    this.buf = new Uint8Array(Math.max(1, Math.floor(initialBytes) || 1));
  }

  /** Bits written so far. */
  get bitLength(): number {
    return this.pos;
  }

  /** Bytes finish() would return. */
  get byteLength(): number {
    return Math.ceil(this.pos / 8);
  }

  private ensure(extraBits: number): void {
    const need = Math.ceil((this.pos + extraBits) / 8);
    if (need <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < need) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf);
    this.buf = nb;
  }

  /** Write the low `nBits` (0..32) of an unsigned integer `value` (must fit). */
  writeBits(value: number, nBits: number): void {
    checkBitCount(nBits, 32);
    checkUint(value, nBits);
    this.ensure(nBits);
    let v = value;
    let n = nBits;
    while (n > 0) {
      const off = this.pos & 7;
      const take = Math.min(8 - off, n);
      const chunk = v & ((1 << take) - 1);
      this.buf[this.pos >>> 3] |= chunk << off;
      v = (v - chunk) / (1 << take);
      this.pos += take;
      n -= take;
    }
  }

  writeBool(b: boolean): void {
    this.writeBits(b ? 1 : 0, 1);
  }

  /** Unsigned integer in `bits` (0..53) bits. */
  writeUint(n: number, bits: number): void {
    checkBitCount(bits, MAX_UINT_BITS);
    checkUint(n, bits);
    if (bits <= 32) {
      this.writeBits(n, bits);
      return;
    }
    const lo = n % TWO_32;
    this.writeBits(lo, 32);
    this.writeBits((n - lo) / TWO_32, bits - 32);
  }

  /** Signed integer in `bits` (1..53) bits, zigzag coded: range [-2^(bits-1), 2^(bits-1)-1]. */
  writeInt(n: number, bits: number): void {
    checkBitCount(bits, MAX_UINT_BITS);
    const half = 2 ** (bits - 1);
    if (!Number.isInteger(n) || bits < 1 || n < -half || n >= half) {
      throw new CodecError('range', `value ${n} does not fit in ${bits} signed bits`);
    }
    this.writeUint(zigzag(n), bits);
  }

  /** LEB128-style variable length unsigned integer, 0..2^53-1 (1..8 bytes of 7+1 bits). */
  writeVarUint(n: number): void {
    if (!Number.isInteger(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) {
      throw new CodecError('range', `varuint ${n} out of range`);
    }
    let v = n;
    do {
      const low = v % 128;
      v = (v - low) / 128;
      this.writeBits(v > 0 ? low | 128 : low, 8);
    } while (v > 0);
  }

  /** Zigzag + varuint; range [-2^52, 2^52-1]. */
  writeVarInt(n: number): void {
    if (!Number.isInteger(n) || n < -(2 ** 52) || n >= 2 ** 52) {
      throw new CodecError('range', `varint ${n} out of range`);
    }
    this.writeVarUint(zigzag(n));
  }

  writeFloat32(f: number): void {
    scratch.setFloat32(0, f, true);
    this.writeBits(scratch.getUint32(0, true), 32);
  }

  writeFloat64(f: number): void {
    scratch.setFloat64(0, f, true);
    this.writeBits(scratch.getUint32(0, true), 32);
    this.writeBits(scratch.getUint32(4, true), 32);
  }

  /** Raw bytes, no length prefix. */
  writeBytes(bytes: Uint8Array): void {
    if ((this.pos & 7) === 0) {
      this.ensure(bytes.length * 8);
      this.buf.set(bytes, this.pos >>> 3);
      this.pos += bytes.length * 8;
      return;
    }
    for (let i = 0; i < bytes.length; i++) this.writeBits(bytes[i], 8);
  }

  /** UTF-8 string with a varuint byte-length prefix. Throws if longer than `maxBytes`. */
  writeString(s: string, maxBytes = DEFAULT_MAX_STRING_BYTES): void {
    const bytes = utf8Encode(s);
    if (bytes.length > maxBytes) {
      throw new CodecError('range', `string of ${bytes.length} bytes exceeds max ${maxBytes}`);
    }
    this.writeVarUint(bytes.length);
    this.writeBytes(bytes);
  }

  /** Pad with zero bits up to the next byte boundary. */
  alignToByte(): void {
    const pad = (8 - (this.pos & 7)) & 7;
    if (pad > 0) this.writeBits(0, pad);
  }

  /** Copy of the written bytes. The writer stays usable (further writes append). */
  finish(): Uint8Array {
    return this.buf.slice(0, this.byteLength);
  }

  /** Forget everything written, keeping the allocated buffer. */
  reset(): void {
    this.buf.fill(0, 0, this.byteLength);
    this.pos = 0;
  }
}

/** Bounds-checked reader matching BitWriter. Safe on untrusted input. */
export class BitReader {
  private readonly bytes: Uint8Array;
  private readonly end: number;
  private pos = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.end = bytes.length * 8;
  }

  get bitPosition(): number {
    return this.pos;
  }

  get remainingBits(): number {
    return this.end - this.pos;
  }

  private need(bits: number): void {
    if (bits > this.end - this.pos) {
      throw new CodecError(
        'overrun',
        `read of ${bits} bits at bit ${this.pos} overruns ${this.end}-bit buffer`,
      );
    }
  }

  readBits(nBits: number): number {
    checkBitCount(nBits, 32);
    this.need(nBits);
    let result = 0;
    let mul = 1;
    let n = nBits;
    while (n > 0) {
      const off = this.pos & 7;
      const take = Math.min(8 - off, n);
      const chunk = (this.bytes[this.pos >>> 3] >>> off) & ((1 << take) - 1);
      result += chunk * mul;
      mul *= 1 << take;
      this.pos += take;
      n -= take;
    }
    return result;
  }

  readBool(): boolean {
    return this.readBits(1) === 1;
  }

  readUint(bits: number): number {
    checkBitCount(bits, MAX_UINT_BITS);
    if (bits <= 32) return this.readBits(bits);
    this.need(bits);
    const lo = this.readBits(32);
    return lo + this.readBits(bits - 32) * TWO_32;
  }

  readInt(bits: number): number {
    if (bits < 1) throw new CodecError('range', 'signed ints need at least 1 bit');
    return unzigzag(this.readUint(bits));
  }

  readVarUint(): number {
    let result = 0;
    let mul = 1;
    for (let i = 0; i < MAX_VARINT_BYTES; i++) {
      const b = this.readBits(8);
      const low = b & 127;
      if (i === MAX_VARINT_BYTES - 1 && (low >= 16 || b & 128)) {
        throw new CodecError('invalid', 'varuint exceeds 2^53-1');
      }
      result += low * mul;
      if ((b & 128) === 0) {
        if (i > 0 && low === 0) throw new CodecError('invalid', 'non-canonical varuint');
        return result;
      }
      mul *= 128;
    }
    throw new CodecError('invalid', 'varuint too long');
  }

  readVarInt(): number {
    return unzigzag(this.readVarUint());
  }

  readFloat32(): number {
    scratch.setUint32(0, this.readBits(32), true);
    return scratch.getFloat32(0, true);
  }

  readFloat64(): number {
    this.need(64);
    scratch.setUint32(0, this.readBits(32), true);
    scratch.setUint32(4, this.readBits(32), true);
    return scratch.getFloat64(0, true);
  }

  /** Read `count` raw bytes (a copy). */
  readBytes(count: number): Uint8Array {
    if (!Number.isInteger(count) || count < 0) {
      throw new CodecError('range', `invalid byte count ${count}`);
    }
    this.need(count * 8);
    if ((this.pos & 7) === 0) {
      const start = this.pos >>> 3;
      this.pos += count * 8;
      return this.bytes.slice(start, start + count);
    }
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) out[i] = this.readBits(8);
    return out;
  }

  readString(maxBytes = DEFAULT_MAX_STRING_BYTES): string {
    const len = this.readVarUint();
    if (len > maxBytes) throw new CodecError('invalid', `string length ${len} exceeds ${maxBytes}`);
    return utf8Decode(this.readBytes(len));
  }

  alignToByte(): void {
    const pad = (8 - (this.pos & 7)) & 7;
    if (pad > 0) this.readBits(pad);
  }

  /** Throw unless only zero padding (< 8 bits) is left: detects trailing garbage. */
  expectEnd(): void {
    const left = this.remainingBits;
    if (left >= 8) throw new CodecError('invalid', `${left} unexpected trailing bits`);
    if (left > 0 && this.readBits(left) !== 0) {
      throw new CodecError('invalid', 'non-zero padding bits');
    }
  }
}
