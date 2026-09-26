// Glicko-2 rating system (Mark Glickman, "Example of the Glicko-2 system", 2013).
// Ratings use the public scale (1500 / 350 / 0.06); the math runs on the internal Glicko-2 scale.

export interface Rating {
  /** Public rating, 1500 = average newcomer. */
  rating: number;
  /** Rating deviation: how unsure we are about `rating` (public scale). */
  rd: number;
  /** Volatility: how erratic the player's results are. */
  vol: number;
}

export interface GameResult {
  opponent: Rating;
  /** 1 = win, 0.5 = draw, 0 = loss. */
  score: 0 | 0.5 | 1;
}

export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOL = 0.06;
/** System constant: how much volatility may change per period (paper suggests 0.3..1.2). */
export const DEFAULT_TAU = 0.5;
export const MIN_RD = 30;
export const MAX_RD = 350;
/** Conversion factor between the public scale and the Glicko-2 scale. */
export const GLICKO2_SCALE = 173.7178;
/** Convergence tolerance for the volatility iteration. */
const EPSILON = 0.000001;

export const newRating = (): Rating => ({
  rating: DEFAULT_RATING,
  rd: DEFAULT_RD,
  vol: DEFAULT_VOL,
});

export const clampRd = (rd: number): number => Math.min(MAX_RD, Math.max(MIN_RD, rd));

const toMu = (rating: number): number => (rating - DEFAULT_RATING) / GLICKO2_SCALE;
const toPhi = (rd: number): number => rd / GLICKO2_SCALE;
const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu: number, muJ: number, phiJ: number): number =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/** New volatility via the Illinois algorithm (step 5 of the paper). */
const newVolatility = (phi: number, sigma: number, v: number, delta: number, tau: number) => {
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const d2 = delta * delta;
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const den = phi2 + v + ex;
    return (ex * (d2 - phi2 - v - ex)) / (2 * den * den) - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (d2 > phi2 + v) {
    B = Math.log(d2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > EPSILON; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
};

/**
 * Rating after one rating period. With no results only the RD grows (the player
 * becomes less certain). RD is clamped to [MIN_RD, MAX_RD].
 */
export const updateRating = (
  player: Rating,
  results: readonly GameResult[],
  tau: number = DEFAULT_TAU,
): Rating => {
  const mu = toMu(player.rating);
  const phi = toPhi(player.rd);
  const sigma = player.vol;
  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: player.rating, rd: clampRd(phiStar * GLICKO2_SCALE), vol: sigma };
  }
  let vInv = 0;
  let sum = 0;
  for (const { opponent, score } of results) {
    const muJ = toMu(opponent.rating);
    const phiJ = toPhi(opponent.rd);
    const gJ = g(phiJ);
    const e = expected(mu, muJ, phiJ);
    vInv += gJ * gJ * e * (1 - e);
    sum += gJ * (score - e);
  }
  const v = 1 / vInv;
  const delta = v * sum;
  const sigmaNew = newVolatility(phi, sigma, v, delta, tau);
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * sum;
  return {
    rating: muNew * GLICKO2_SCALE + DEFAULT_RATING,
    rd: clampRd(phiNew * GLICKO2_SCALE),
    vol: sigmaNew,
  };
};

/** RD after `periods` rating periods without games (rating and volatility unchanged). */
export const growRd = (player: Rating, periods: number): Rating => {
  const phi = toPhi(player.rd);
  const n = Math.max(0, Math.floor(periods));
  if (n === 0) return { ...player, rd: clampRd(player.rd) };
  const phiNew = Math.sqrt(phi * phi + n * player.vol * player.vol);
  return { rating: player.rating, rd: clampRd(phiNew * GLICKO2_SCALE), vol: player.vol };
};
