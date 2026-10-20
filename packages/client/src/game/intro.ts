// The opening face-off (owner's request): when a match starts, both teams jetpack onto a stage
// high above the map, land in two lines facing each other (seen from the side, name tags and
// ranks over their heads, a "VS" title with the map, the mode and each team's chance to win),
// then portals open under their feet, they drop through and the view cuts hard to your own
// eyes at your spawn for the usual countdown.
//
// This file is the pure part (tested in test/intro.test.ts): the timeline, where everyone stands
// and flies, the camera shot and the win chance. game/intro-feature.ts draws it.
//
// It is purely visual: the sim only waits. Round 1's spawn lock lasts config matchIntroSec
// longer (rules/match.ts startMatch { intro: true }) and the intro fills exactly that extra
// time, so every client sees the same moment and the normal countdown follows untouched.
import type { Vec3 } from '@space-yz/shared';

/** The beats of the intro, in order. */
export type IntroPhase = 'flyIn' | 'faceOff' | 'portal' | 'drop';

/**
 * When each beat starts, as a share of the whole intro (so a longer or shorter matchIntroSec
 * stretches it evenly). At the default 5 s: fly in 0–1.7 s, face-off 1.7–3.5 s, portals open
 * 3.5–4.2 s, drop 4.2–5 s, then the cut.
 */
export const INTRO_BEATS: Record<IntroPhase, number> = {
  flyIn: 0,
  faceOff: 0.34,
  portal: 0.7,
  drop: 0.84,
};
const ORDER: IntroPhase[] = ['flyIn', 'faceOff', 'portal', 'drop'];

/** Seconds into the intro when a beat starts. */
export const beatAt = (phase: IntroPhase, total: number): number => INTRO_BEATS[phase] * total;

/**
 * Which beat is playing `t` seconds into an intro of `total` seconds, and how far through it
 * (u: 0..1). null: not playing (before it, after it, or skipped).
 */
export const introPhase = (
  t: number,
  total: number,
  skipped = false,
): { phase: IntroPhase; u: number } | null => {
  if (skipped || total <= 0 || t < 0 || t >= total) return null;
  const k = t / total;
  for (let i = ORDER.length - 1; i >= 0; i--) {
    const from = INTRO_BEATS[ORDER[i]];
    if (k >= from) {
      const to = i + 1 < ORDER.length ? INTRO_BEATS[ORDER[i + 1]] : 1;
      return { phase: ORDER[i], u: Math.min(1, (k - from) / (to - from)) };
    }
  }
  return null;
};

/**
 * Seconds into the intro at this tick. Round 1's spawn lock is matchIntroSec + spawnLockSec
 * long; the intro is its first matchIntroSec. Ticks are 60 Hz.
 */
export const introClock = (
  tick: number,
  phaseEnds: number,
  spawnLockSec: number,
  introSec: number,
): number => introSec - ((phaseEnds - tick) / 60 - spawnLockSec);

/** The intro starts only if you see it begin (joining later than this: no intro). */
export const INTRO_JOIN_GRACE_SEC = 1;

export interface IntroGate {
  /** Settings → Gameplay → Match intro */
  enabled: boolean;
  /** config matchIntroSec (0 or missing: an older server without the intro) */
  introSec: number;
  phase: string;
  round: number;
  /** how many players each team has */
  teamSizes: readonly [number, number];
  /** a free-for-all (everyone against everyone, e.g. Royale): no two teams to face off */
  ffa?: boolean;
  /** seconds into the intro right now (introClock) */
  t: number;
}

/**
 * Should the intro start now? Only for the first round of a two-team match, in the spawn
 * lock's intro window, seen from (nearly) its start. Free-for-all modes have no two teams: no
 * intro.
 */
export const shouldStartIntro = (g: IntroGate): boolean =>
  g.enabled &&
  !g.ffa &&
  g.introSec > 0 &&
  g.phase === 'spawnLock' &&
  g.round === 1 &&
  g.teamSizes[0] > 0 &&
  g.teamSizes[1] > 0 &&
  g.t >= 0 &&
  g.t < Math.min(INTRO_JOIN_GRACE_SEC, g.introSec);

// ---------------------------------------------------------------------------------- staging
//
// The stage's own frame: origin on the platform's surface in the middle, the camera on +x
// looking toward -x (a side view: 90° to the line between the teams). Screen left = +z: the
// left team stands at +z and faces -z, the right team at -z and faces +z. Your team is on the
// left.

/** Metres between neighbours in a line (along x, toward / away from the camera). */
export const LINE_SPACING = 1.8;
/** How much further back each step out from the middle stands (a shallow wedge). */
export const WEDGE = 0.45;

/** Distance between the two lines' middle players: a little wider for bigger teams. */
export const teamGap = (n: number): number => 6 + 0.5 * Math.max(1, Math.min(5, n));

/** Where the players of one team land: `n` spots, `side` +1 = left (+z), -1 = right (-z). */
export const lineLayout = (n: number, side: 1 | -1, gap = teamGap(n)): { x: number; z: number }[] =>
  Array.from({ length: n }, (_, i) => {
    const x = (i - (n - 1) / 2) * LINE_SPACING;
    return { x, z: side * (gap / 2 + WEDGE * Math.abs(x)) };
  });

/**
 * The order a team stands in: by id, but you in the middle of your line (the camera's
 * focus), with the others around you.
 */
export const lineOrder = (ids: readonly number[], localId: number | null): number[] => {
  const sorted = [...ids].sort((a, b) => a - b);
  const i = localId === null ? -1 : sorted.indexOf(localId);
  if (i < 0) return sorted;
  sorted.splice(i, 1);
  sorted.splice(Math.floor(sorted.length / 2), 0, localId!);
  return sorted;
};

/** Seconds one player's flight takes, and the gap between neighbours' take-offs. */
export const FLIGHT_SEC = 1.2;
export const FLIGHT_STAGGER = 0.08;

const easeOut = (u: number): number => 1 - Math.pow(1 - u, 3);
const clamp01 = (u: number): number => Math.max(0, Math.min(1, u));

/**
 * One player's jetpack flight onto their spot: from high up and far out on their own side
 * (off-screen), easing out into the landing. `k` = their place in the line (staggers the
 * take-off), `t` = seconds into the intro. `pos` = feet; `vel` = m/s (for the body's air pose);
 * `thrust` 0..1 = flame size; `landed` once down.
 */
export const flight = (
  spot: { x: number; z: number },
  side: 1 | -1,
  k: number,
  t: number,
  flyTime = FLIGHT_SEC,
): { pos: Vec3; vel: Vec3; thrust: number; landed: boolean; started: boolean } => {
  const t0 = k * FLIGHT_STAGGER;
  const u = clamp01((t - t0) / flyTime);
  const from = { x: spot.x - 3, y: 16, z: spot.z + side * 14 };
  const e = easeOut(u);
  // a little hop over the last stretch, so they come down onto the spot instead of sliding
  const arc = Math.sin(u * Math.PI) * 1.5;
  const pos = {
    x: from.x + (spot.x - from.x) * e,
    y: from.y * (1 - e) + arc * (1 - u),
    z: from.z + (spot.z - from.z) * e,
  };
  const de = u < 1 ? (3 * Math.pow(1 - u, 2)) / flyTime : 0;
  const vel = {
    x: (spot.x - from.x) * de,
    y: -from.y * de,
    z: (spot.z - from.z) * de,
  };
  return {
    pos,
    vel,
    // full burn on the way in, braking flare just before touch-down, off once landed
    thrust: u >= 1 ? 0 : u < 0.6 ? 1 : 0.6 + 0.4 * Math.sin(((u - 0.6) / 0.4) * Math.PI),
    landed: u >= 1,
    started: t >= t0,
  };
};

/** Each player's portal opens a moment after their neighbour's (seconds). */
export const PORTAL_STAGGER = 0.05;

/** Portal radius (0..1 of full) for player `k` at `t`: pops open with a little overshoot. */
export const portalOpen = (k: number, t: number, total: number): number => {
  const u = clamp01((t - beatAt('portal', total) - k * PORTAL_STAGGER) / 0.35);
  if (u <= 0) return 0;
  // ease-out-back: a touch past full size, then settles
  const c = 1.7;
  const x = u - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

/** How far player `k` has dropped into their portal (metres down) at `t`. */
export const dropDepth = (k: number, t: number, total: number): number => {
  const s = t - beatAt('drop', total) - k * PORTAL_STAGGER;
  return s > 0 ? 0.5 * 30 * s * s : 0;
};

/** Horizontal field of view of the intro camera (degrees). */
export const INTRO_HFOV = 62;

/**
 * The camera at `t` (stage frame): a side view at about 10° down, pulling in from wide while
 * they fly in, a slow push-in through the face-off, then tilting down after them into the
 * portals. `n` = the bigger team's size (wider teams: the camera stands further back).
 */
export const introShot = (
  t: number,
  total: number,
  n: number,
): { pos: Vec3; target: Vec3; hfov: number } => {
  const gap = teamGap(n);
  const half = gap / 2 + WEDGE * ((Math.max(1, n) - 1) / 2) * LINE_SPACING + 1.6;
  const base = half / Math.tan(((INTRO_HFOV / 2) * Math.PI) / 180);
  const fo = beatAt('faceOff', total);
  const po = beatAt('portal', total);
  const dr = beatAt('drop', total);
  let dist: number;
  let lift = 0;
  let targetY: number;
  if (t < fo) {
    const u = easeOut(clamp01(t / fo));
    dist = base * (1.45 - 0.3 * u);
    lift = 3 * (1 - u);
    targetY = 1.1 + 2 * (1 - u);
  } else if (t < dr) {
    // the slow push-in (also through the portals opening)
    const u = clamp01((t - fo) / (dr - fo));
    dist = base * (1.15 - 0.25 * u);
    targetY = 1.1 - 0.4 * clamp01((t - po) / (dr - po));
  } else {
    const u = clamp01((t - dr) / Math.max(0.01, total - dr));
    dist = base * 0.9;
    targetY = 0.7 - 2.2 * u * u;
  }
  const height = 1.1 + dist * Math.tan((10 * Math.PI) / 180) + lift;
  return {
    pos: { x: dist, y: height, z: 0 },
    target: { x: 0, y: targetY, z: 0 },
    hfov: INTRO_HFOV,
  };
};

// ------------------------------------------------------------------------------ win chance

/**
 * Each team's chance to win as whole percents (summing to 100), from the two teams' average
 * ratings with the Elo expected score E = 1 / (1 + 10^((Rb − Ra) / 400)). Missing ratings
 * (unranked players, bots) are left out of the average; a team with none: 50 / 50.
 */
export const winPercents = (
  a: readonly (number | null | undefined)[],
  b: readonly (number | null | undefined)[],
): [number, number] => {
  const avg = (r: readonly (number | null | undefined)[]): number | null => {
    const ok = r.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    return ok.length ? ok.reduce((s, x) => s + x, 0) / ok.length : null;
  };
  const ra = avg(a);
  const rb = avg(b);
  if (ra === null || rb === null) return [50, 50];
  const pa = Math.round(100 / (1 + Math.pow(10, (rb - ra) / 400)));
  return [pa, 100 - pa];
};
