// Seeded, deterministic PRNG (sfc32). State is 4 uint32s kept inside world state
// so the simulation replays identically on client and server.

export type RngState = [number, number, number, number];

export const rngFromSeed = (seed: number): RngState => {
  // splitmix32 to spread the seed into 4 words
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st: RngState = [next(), next(), next(), next()];
  // warm up
  for (let i = 0; i < 12; i++) rngNextU32(st);
  return st;
};

/** Advance the state in place and return a uint32. */
export const rngNextU32 = (st: RngState): number => {
  let [a, b, c, d] = st;
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) >>> 0;
  st[0] = a >>> 0;
  st[1] = b >>> 0;
  st[2] = c >>> 0;
  st[3] = d >>> 0;
  return t;
};

/** Float in [0, 1). */
export const rngFloat = (st: RngState): number => rngNextU32(st) / 4294967296;

/** Integer in [0, n). */
export const rngInt = (st: RngState, n: number): number => Math.floor(rngFloat(st) * n);

/** Fisher–Yates shuffle (returns a new array). */
export const rngShuffle = <T>(st: RngState, arr: readonly T[]): T[] => {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rngInt(st, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
};
