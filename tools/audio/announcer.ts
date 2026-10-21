// Renders the 90s-arcade announcer clips (npm run announcer) into
// packages/client/public/audio/announcer/<id>.ogg — reproducible from this file alone.
//
//   *** PLACEHOLDER VOICE ***  The raw speech comes from the Windows built-in text-to-speech
//   voice (System.Speech, "Microsoft David Desktop"). Its licence for commercial
//   redistribution is unclear: replace these clips with a recorded or licensed voice before a
//   commercial launch (keep the ids in packages/client/src/audio/announcer-lines.ts).
//
// Needs Windows (PowerShell + System.Speech). ffmpeg with libopus on PATH gives Ogg Opus
// (~5–10 KB a clip); without it, or with --wav, 16-bit mono 22.05 kHz WAV files are written
// instead (then set ANNOUNCER_EXT = 'wav' in announcer-lines.ts).
//
// Processing chain (all here, in plain TypeScript, 44.1 kHz TTS in -> 22.05 kHz mono out):
//   1. TTS at a faster rate (+3), 44.1 kHz 16-bit mono
//   2. trim leading / trailing silence
//   3. pitch down 30 % by resampling (tape-style: also slows it, the fast TTS rate makes up
//      for it), with an anti-alias low-pass first; output 22.05 kHz
//   4. EQ: high-pass 75 Hz, low shelf +5 dB @ 180 Hz (chest), presence +4 dB @ 2.2 kHz,
//      low-pass 7.5 kHz (a 90s sampler's dull top)
//   5. saturation (tanh, drive 3, 70 % wet)
//   6. compression (peak follower, -20 dBFS, 4:1, 3 ms / 120 ms)
//   7. slap echo (95 ms 0.3, 190 ms 0.12, low-passed) + a small Schroeder hall (~1.1 s, 16 %)
//   8. normalise to -1 dBFS, trim the tail below -50 dB, short fades
//
// Usage: npm run announcer [-- --wav] [-- --keep] (--keep: leave the raw TTS files in the
// temp folder for listening)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANNOUNCER_LINES } from '../../packages/client/src/audio/announcer-lines';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(ROOT, 'packages', 'client', 'public', 'audio', 'announcer');
const TMP = path.join(tmpdir(), 'lethal-recoil-announcer');

const TTS_RATE = 3; // SpeechSynthesizer.Rate, -10..10
const TTS_SR = 44100;
const OUT_SR = 22050;
const PITCH = 0.7; // 30 % down
const OPUS_KBPS = 32;
const MAX_TOTAL_BYTES = 600 * 1024;

// ----------------------------------------------------------------------------- WAV in/out

export const readWav = (buf: Buffer): { sr: number; data: Float64Array } => {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('not a WAV file');
  let off = 12;
  let sr = 0;
  let ch = 1;
  let bits = 16;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      ch = buf.readUInt16LE(body + 2);
      sr = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      if (bits !== 16) throw new Error(`only 16-bit WAV (got ${bits})`);
      const frames = Math.floor(size / (2 * ch));
      const data = new Float64Array(frames);
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < ch; c++) s += buf.readInt16LE(body + (i * ch + c) * 2);
        data[i] = s / ch / 32768;
      }
      return { sr, data };
    }
    off = body + size + (size & 1);
  }
  throw new Error('WAV without data');
};

export const writeWav = (data: Float64Array, sr: number): Buffer => {
  const buf = Buffer.alloc(44 + data.length * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + data.length * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
};

// ----------------------------------------------------------------------------- DSP

const dbToGain = (db: number): number => 10 ** (db / 20);

const peak = (x: Float64Array): number => {
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  return p;
};

/** Cut silence (below `thresh`) at both ends, keeping `padSec` around the sound. */
export const trimSilence = (x: Float64Array, sr: number, thresh = 0.01, padSec = 0.01) => {
  let a = 0;
  while (a < x.length && Math.abs(x[a]) < thresh) a++;
  let b = x.length - 1;
  while (b > a && Math.abs(x[b]) < thresh) b--;
  const pad = Math.round(padSec * sr);
  return x.slice(Math.max(0, a - pad), Math.min(x.length, b + pad + 1));
};

/** Windowed-sinc (Blackman) low-pass FIR; `fc` in cycles per sample (0..0.5). */
const firLowpass = (x: Float64Array, fc: number, taps = 65): Float64Array => {
  const h = new Float64Array(taps);
  const m = taps - 1;
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const n = i - m / 2;
    const sinc = n === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * n) / (Math.PI * n);
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / m) + 0.08 * Math.cos((4 * Math.PI * i) / m);
    h[i] = sinc * w;
    sum += h[i];
  }
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let acc = 0;
    for (let k = 0; k < taps; k++) {
      const j = i + m / 2 - k;
      if (j >= 0 && j < x.length) acc += h[k] * x[j];
    }
    y[i] = acc / sum;
  }
  return y;
};

/**
 * Tape-style pitch shift + sample-rate change: output sample n reads the input at
 * n × pitch × srIn / srOut (cubic Hermite), so every frequency is multiplied by `pitch`.
 */
export const pitchResample = (
  x: Float64Array,
  srIn: number,
  srOut: number,
  pitch: number,
): Float64Array => {
  const step = (pitch * srIn) / srOut;
  // content above the output's Nyquist (in input terms) would alias: low-pass it first
  const maxIn = (0.45 * srOut) / pitch;
  const src = maxIn < srIn / 2 ? firLowpass(x, maxIn / srIn) : x;
  const n = Math.floor((src.length - 1) / step);
  const y = new Float64Array(n);
  const at = (i: number) => src[Math.max(0, Math.min(src.length - 1, i))];
  for (let k = 0; k < n; k++) {
    const pos = k * step;
    const i = Math.floor(pos);
    const t = pos - i;
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = 0.5 * (p2 - p0);
    const c2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    const c3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
    y[k] = ((c3 * t + c2) * t + c1) * t + p1;
  }
  return y;
};

type BiquadKind = 'lowpass' | 'highpass' | 'lowshelf' | 'peaking';

/** RBJ cookbook biquad, applied in place. */
const biquad = (
  x: Float64Array,
  sr: number,
  kind: BiquadKind,
  f: number,
  q = Math.SQRT1_2,
  gainDb = 0,
): Float64Array => {
  const A = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * f) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (kind) {
    case 'lowpass':
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cos + s);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - s);
      a0 = A + 1 + (A - 1) * cos + s;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - s;
      break;
    }
    case 'peaking':
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
  }
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
  return x;
};

const normalize = (x: Float64Array, target: number): Float64Array => {
  const p = peak(x);
  if (p > 0) for (let i = 0; i < x.length; i++) x[i] *= target / p;
  return x;
};

const saturate = (x: Float64Array, drive: number, wet: number): Float64Array => {
  const k = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = (1 - wet) * x[i] + (wet * Math.tanh(drive * x[i])) / k;
  return x;
};

const compress = (
  x: Float64Array,
  sr: number,
  threshDb: number,
  ratio: number,
  attackSec: number,
  releaseSec: number,
): Float64Array => {
  const att = Math.exp(-1 / (attackSec * sr));
  const rel = Math.exp(-1 / (releaseSec * sr));
  const thresh = dbToGain(threshDb);
  let env = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a;
    if (env > thresh) {
      const overDb = 20 * Math.log10(env / thresh);
      x[i] *= dbToGain(-overDb * (1 - 1 / ratio));
    }
  }
  return x;
};

const pad = (x: Float64Array, sec: number, sr: number): Float64Array => {
  const y = new Float64Array(x.length + Math.round(sec * sr));
  y.set(x);
  return y;
};

/** Slap-back echo: two taps, the echo path low-passed (one pole). */
const slapEcho = (x: Float64Array, sr: number): Float64Array => {
  const taps = [
    { d: Math.round(0.095 * sr), g: 0.3 },
    { d: Math.round(0.19 * sr), g: 0.12 },
  ];
  const y = Float64Array.from(x);
  for (const { d, g } of taps) {
    let lp = 0;
    const c = Math.exp((-2 * Math.PI * 3000) / sr);
    for (let i = d; i < x.length; i++) {
      lp = c * lp + (1 - c) * x[i - d];
      y[i] += g * lp;
    }
  }
  return y;
};

/** Small hall: 4 damped feedback combs in parallel, then 2 allpasses (Schroeder). */
const hall = (x: Float64Array, sr: number, rt60 = 1.1, wet = 0.16): Float64Array => {
  const combMs = [29.7, 37.1, 41.1, 43.7];
  const wetSig = new Float64Array(x.length);
  for (const ms of combMs) {
    const d = Math.round((ms / 1000) * sr);
    const g = 10 ** ((-3 * ms) / 1000 / rt60);
    const buf = new Float64Array(x.length);
    let lp = 0;
    for (let i = 0; i < x.length; i++) {
      const back = i >= d ? buf[i - d] : 0;
      lp = 0.7 * back + 0.3 * lp; // damping: the tail darkens
      buf[i] = x[i] + g * lp;
      wetSig[i] += buf[i] / combMs.length;
    }
  }
  let sig = wetSig;
  for (const [ms, g] of [
    [5, 0.7],
    [1.7, 0.7],
  ] as const) {
    const d = Math.round((ms / 1000) * sr);
    const out = new Float64Array(sig.length);
    for (let i = 0; i < sig.length; i++) {
      const xd = i >= d ? sig[i - d] : 0;
      const yd = i >= d ? out[i - d] : 0;
      out[i] = -g * sig[i] + xd + g * yd;
    }
    sig = out;
  }
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] + wet * sig[i];
  return y;
};

const fades = (x: Float64Array, sr: number, inSec: number, outSec: number): Float64Array => {
  const a = Math.min(x.length, Math.round(inSec * sr));
  for (let i = 0; i < a; i++) x[i] *= i / a;
  const b = Math.min(x.length, Math.round(outSec * sr));
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= i / b;
  return x;
};

/** The whole chain: raw TTS in, finished mono clip at OUT_SR out. */
export const processVoice = (raw: Float64Array, srIn: number, srOut = OUT_SR): Float64Array => {
  let x: Float64Array = trimSilence(raw, srIn, 0.01, 0.02);
  x = pitchResample(x, srIn, srOut, PITCH);
  biquad(x, srOut, 'highpass', 75);
  biquad(x, srOut, 'lowshelf', 180, Math.SQRT1_2, 5);
  biquad(x, srOut, 'peaking', 2200, 1, 4);
  biquad(x, srOut, 'lowpass', 7500);
  normalize(x, 0.9);
  saturate(x, 3, 0.7);
  compress(x, srOut, -20, 4, 0.003, 0.12);
  x = pad(x, 0.9, srOut);
  x = slapEcho(x, srOut);
  x = hall(x, srOut);
  normalize(x, dbToGain(-1));
  // the echo/reverb tail: cut where it fades below -50 dB
  let end = x.length - 1;
  const floor = dbToGain(-50);
  while (end > 0 && Math.abs(x[end]) < floor) end--;
  x = x.slice(0, Math.min(x.length, end + Math.round(0.02 * srOut)));
  return fades(x, srOut, 0.003, 0.08);
};

// ----------------------------------------------------------------------------- TTS + encode

/** Render every line with System.Speech (deepest male voice: Microsoft David). */
const renderTts = (lines: [string, string][]): string => {
  mkdirSync(TMP, { recursive: true });
  const esc = (s: string) => s.replace(/'/g, "''");
  const ps = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    // the deepest male voice installed (David on a stock Windows 10/11)
    "$v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Gender -eq 'Male' } | Sort-Object { if ($_.VoiceInfo.Name -like '*David*') { 0 } else { 1 } } | Select-Object -First 1",
    'if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }',
    `$s.Rate = ${TTS_RATE}`,
    '$s.Volume = 100',
    `$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(${TTS_SR}, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)`,
    ...lines.flatMap(([id, text]) => [
      `$s.SetOutputToWaveFile('${esc(path.join(TMP, `${id}.raw.wav`))}', $fmt)`,
      `$s.Speak('${esc(text)}')`,
    ]),
    '$s.SetOutputToNull()',
    'Write-Output $s.Voice.Name',
  ].join('; ');
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8',
  }).trim();
};

const hasOpusFfmpeg = (): boolean => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  return r.status === 0 && /libopus/.test(r.stdout);
};

const main = (): void => {
  if (process.platform !== 'win32') {
    console.error('The announcer tool needs Windows (System.Speech text-to-speech).');
    process.exit(1);
  }
  const wantWav = process.argv.includes('--wav');
  const opus = !wantWav && hasOpusFfmpeg();
  if (!wantWav && !opus)
    console.warn('ffmpeg with libopus not found: writing WAV (set ANNOUNCER_EXT to "wav").');
  const lines = Object.entries(ANNOUNCER_LINES);
  const voice = renderTts(lines);
  console.log(`TTS voice: ${voice}`);
  mkdirSync(OUT_DIR, { recursive: true });
  let total = 0;
  for (const [id] of lines) {
    const raw = readWav(readFileSync(path.join(TMP, `${id}.raw.wav`)));
    const clip = processVoice(raw.data, raw.sr);
    const wav = writeWav(clip, OUT_SR);
    let out: string;
    if (opus) {
      const tmpWav = path.join(TMP, `${id}.wav`);
      writeFileSync(tmpWav, wav);
      out = path.join(OUT_DIR, `${id}.ogg`);
      execFileSync('ffmpeg', [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        tmpWav,
        '-map_metadata',
        '-1',
        '-fflags',
        '+bitexact',
        '-c:a',
        'libopus',
        '-b:a',
        `${OPUS_KBPS}k`,
        '-ac',
        '1',
        '-application',
        'audio',
        out,
      ]);
    } else {
      out = path.join(OUT_DIR, `${id}.wav`);
      writeFileSync(out, wav);
    }
    const bytes = statSync(out).size;
    total += bytes;
    console.log(
      `${path.basename(out).padEnd(22)} ${(clip.length / OUT_SR).toFixed(2)} s  ${(bytes / 1024).toFixed(1)} KB`,
    );
  }
  console.log(`total ${(total / 1024).toFixed(1)} KB (${lines.length} clips)`);
  if (!process.argv.includes('--keep') && existsSync(TMP))
    rmSync(TMP, { recursive: true, force: true });
  if (total > MAX_TOTAL_BYTES) {
    console.error(`Too big: keep the announcer under ${MAX_TOTAL_BYTES / 1024} KB.`);
    process.exit(1);
  }
};

// run as a script (not when a test imports the DSP helpers)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
