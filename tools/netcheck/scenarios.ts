// Hit-registration and Boomerang-consistency scenarios on the virtual network. Scripted
// clients play against the real server; every shot is judged twice — by what the shooter had
// on screen and by the server — and the two verdicts are compared.
import {
  Btn,
  DEG,
  Phase,
  Powerup,
  add,
  chestOf,
  closestPointSeg,
  csConfig,
  defaultConfig,
  dot,
  eyePos,
  len,
  madd,
  normalize,
  qForward,
  qFromBasis,
  rayHitbox,
  scale,
  sub,
  sweepHitbox,
  v3,
  type GameConfig,
  type Hitbox,
  type PlayerState,
  type Quat,
  type SimEvent,
  type Vec3,
} from '@space-yz/shared';
import type { Room } from '../../packages/server/src/game/room';
import { Harness, type TickSample, type VClient } from './harness';
import { rng, type LinkOptions } from './virtual-net';

const UP = v3(0, 1, 0);
const TICK_MS = 1000 / 60;

export interface ShotStats {
  shots: number;
  /** hit on the shooter's screen and on the server */
  bothHit: number;
  /** missed on both */
  bothMiss: number;
  /** hit on screen, not counted ("I hit him!") */
  falseNegative: number;
  /** missed on screen, counted anyway */
  falsePositive: number;
}

export const agreement = (s: ShotStats): number =>
  s.shots ? (s.bothHit + s.bothMiss) / s.shots : 1;

const emptyStats = (): ShotStats => ({
  shots: 0,
  bothHit: 0,
  bothMiss: 0,
  falseNegative: 0,
  falsePositive: 0,
});

const tally = (s: ShotStats, client: boolean, server: boolean): void => {
  s.shots++;
  if (client && server) s.bothHit++;
  else if (!client && !server) s.bothMiss++;
  else if (client) s.falseNegative++;
  else s.falsePositive++;
};

/** How often the shooter's screen showed each kind of event vs how often it happened. */
export type EventTally = Record<string, { shown: number; real: number }>;

export interface ScenarioReport {
  name: string;
  stats: ShotStats;
  events: EventTally;
  /** mean view lag the shooter's inputs reported (ms): latency + interpolation + lead */
  viewLagMs: number;
  /** extra measurements (prediction error etc.) */
  extra: Record<string, number>;
}

export interface NetcheckOptions {
  link: LinkOptions;
  /** the target's link (default: same as the shooter's) */
  targetLink?: LinkOptions;
  lagComp?: boolean;
  seconds?: number;
  seed?: number;
  fps?: number;
  /** the shooter strafes while shooting (tests its own prediction too) */
  shooterStrafes?: boolean;
}

const lookAt = (from: Vec3, to: Vec3): Quat =>
  qFromBasis(normalize(sub(to, from), v3(1, 0, 0)), UP);

/** Left/right strafing with random durations, sometimes jumping. */
const strafePattern = (seed: number, jumpy: boolean) => {
  const random = rng(seed);
  let dir = 1;
  let left = 0;
  return (): number => {
    if (--left <= 0) {
      dir = -dir;
      left = 15 + Math.floor(random() * 45);
    }
    let buttons = dir > 0 ? Btn.Right : Btn.Left;
    if (jumpy && random() < 0.02) buttons |= Btn.Jump;
    return buttons;
  };
};

// ---------------------------------------------------------------------------------------------
// shared duel setup

interface Duel {
  h: Harness;
  room: Room;
  config: GameConfig;
  shooter: VClient;
  target: VClient;
  sp: PlayerState;
  tp: PlayerState;
  events: EventTally;
  /** count one kind of event as shown (on the shooter's screen) or real (on the server) */
  count(kind: string, field: 'shown' | 'real'): void;
  /** scripted inputs run only between started and ending (late events still count) */
  started: boolean;
  ending: boolean;
  /** the shooter's own predicted events, with the tick they were predicted for */
  predicted: { key: string; tick: number }[];
  /** server events of the shooter's own actions, with their tick */
  serverSide: { key: string; tick: number }[];
  finish(): void;
}

/** Events a client predicts for itself and the server reports again (like NetCore's echo keys). */
const echoKeyOf = (e: SimEvent): string | null => {
  switch (e.type) {
    case 'hit':
      return `hit:${e.attacker}:${e.victim}:${e.kind}`;
    case 'laserFire':
      return `laserFire:${e.player}`;
    case 'gunFire':
      return `gunFire:${e.player}`;
    case 'deflect':
      return `deflect:${e.player}:${e.boomerang}`;
    case 'recallStart':
    case 'recallGo':
      return `${e.type}:${e.boomerang}`;
    case 'wallHit':
      return `wallHit:${e.boomerang}`;
    case 'grenadeActivate':
    case 'grenadePop':
      return `${e.type}:${e.grenade}`;
    case 'catch':
    case 'throw':
      return `${e.type}:${e.player}`;
    default:
      return null;
  }
};

/**
 * Prediction vs server for the shooter's own events: events that happened but were never
 * predicted, predicted events that never happened, and the largest tick difference between
 * an event and its predicted twin.
 */
const echoOffsets = (d: Duel): Record<string, number> => {
  const out: Record<string, number> = {};
  const kindOf = (key: string) => key.split(':')[0];
  const unmatched = [...d.predicted];
  for (const s of d.serverSide) {
    let best = -1;
    for (let i = 0; i < unmatched.length; i++)
      if (
        unmatched[i].key === s.key &&
        (best < 0 || Math.abs(unmatched[i].tick - s.tick) < Math.abs(unmatched[best].tick - s.tick))
      )
        best = i;
    const kind = kindOf(s.key);
    if (best < 0 || Math.abs(unmatched[best].tick - s.tick) > 30) {
      out[`${kind}: happened but not predicted`] =
        (out[`${kind}: happened but not predicted`] ?? 0) + 1;
      continue;
    }
    const diff = Math.abs(unmatched[best].tick - s.tick);
    const k = `${kind}: prediction vs server, max ticks apart`;
    out[k] = Math.max(out[k] ?? 0, diff);
    unmatched.splice(best, 1);
  }
  for (const p of unmatched) {
    const k = `${kindOf(p.key)}: predicted but never happened`;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};
type Sampler = (c: VClient, d: Duel) => TickSample;

const IDLE: TickSample = { buttons: 0, view: qFromBasis(v3(1, 0, 0), UP) };

/**
 * Two clients in an empty arena (nobody takes damage, so every shot is comparable), placed
 * at fixed spots once connected, then given 1.5 s for the clocks to settle.
 */
const startDuel = (
  opts: NetcheckOptions,
  config: GameConfig,
  shooterSample: Sampler,
  targetSample: Sampler,
  place: { shooter: Vec3; target: Vec3 },
  watch: (e: SimEvent, d: Duel) => string | null,
): Duel => {
  const h = new Harness({ config, lagComp: opts.lagComp });
  const room = h.createRoom('practice');
  room.ctx.noDamage = true;
  const events: EventTally = {};
  const d = {
    h,
    room,
    config,
    events,
    started: false,
    ending: false,
    predicted: [],
    serverSide: [],
  } as unknown as Duel;
  d.count = (kind, field) => {
    events[kind] ??= { shown: 0, real: 0 };
    events[kind][field]++;
  };
  d.shooter = h.addClient(
    'Shooter',
    opts.link,
    (c) => (d.started && !d.ending ? shooterSample(c, d) : IDLE),
    { roomCode: room.code, fps: opts.fps },
  );
  d.target = h.addClient(
    'Target',
    opts.targetLink ?? opts.link,
    (c) => (d.started && !d.ending ? targetSample(c, d) : IDLE),
    { roomCode: room.code, fps: opts.fps },
  );
  h.runUntil(
    () =>
      room.members.size === 2 &&
      !!d.shooter.core.localPredicted() &&
      !!d.target.core.localPredicted(),
    8000,
  );
  const id = (n: string) => [...room.members.values()].find((m) => m.name === n)!.id;
  const find = (i: number) => room.world.players.find((p) => p.id === i)!;
  d.sp = find(id('Shooter'));
  d.tp = find(id('Target'));
  d.sp.pos = add(place.shooter, v3(0, 0.9, 0));
  d.tp.pos = add(place.target, v3(0, 0.9, 0));
  h.run(1500);
  // what the shooter's screen shows (predicted + server events, as the game would play them)
  const drain = setInterval(() => {
    for (const e of d.shooter.core.drainEvents()) {
      const k = watch(e, d);
      if (k) d.count(k, 'shown');
    }
  }, 8);
  d.shooter.core.drainEvents();
  d.shooter.core.onPredicted = (w, input) => {
    for (const e of w.events) {
      const key = echoKeyOf(e);
      if (key) d.predicted.push({ key, tick: input.tick });
    }
  };
  d.finish = () => clearInterval(drain);
  d.started = true;
  return d;
};

/** Run the scenario hook on every server tick (also records the shooter's own events). */
const onTick = (d: Duel, fn: (r: Room, events: SimEvent[]) => void): void => {
  const myGrenades = new Set<number>();
  d.h.onServerTick = (r, events) => {
    for (const e of events) {
      if (e.type === 'grenadeThrow' && e.player === d.sp.id) myGrenades.add(e.grenade);
      const key = echoKeyOf(e);
      // the shooter's own predictable actions and objects. Not predicted, by design: hits of
      // a Boomerang it deflected (someone else's, flown by the server), and recall / grenade
      // damage (judged where players are now, which only the server knows)
      const mine =
        e.type === 'hit'
          ? e.attacker === d.sp.id && !['deflect', 'recall', 'grenade', 'blast'].includes(e.kind)
          : e.type === 'wallHit'
            ? e.boomerang === d.sp.id
            : e.type === 'grenadeActivate' || e.type === 'grenadePop'
              ? myGrenades.has(e.grenade) || d.predicted.some((x) => x.key === key)
              : 'player' in e && (e as { player: number }).player === d.sp.id;
      if (key && mine) d.serverSide.push({ key, tick: r.world.tick });
    }
    fn(r, events);
  };
};

/** Stop the scripted inputs, let the last shots and late events play out, then clean up. */
const endDuel = (d: Duel): Record<string, number> => {
  d.ending = true;
  d.h.run(1500);
  // a Boomerang thrown just before the end is still out: let it come back (or drop) so the
  // server gets to the catch the shooter already saw
  const flying = () =>
    d.room.world.boomerangs.some(
      (b) => b.owner === d.sp.id && b.phase !== Phase.Held && b.phase !== Phase.Dropped,
    );
  if (flying()) {
    d.h.runUntil(() => !flying(), 5000);
    d.h.run(500);
  }
  d.finish();
  if (process.env.NETCHECK_DEBUG) {
    console.log('predicted', JSON.stringify(d.predicted.filter((x) => x.key.startsWith('hit'))));
    console.log('server   ', JSON.stringify(d.serverSide.filter((x) => x.key.startsWith('hit'))));
    for (const m of d.room.members.values())
      console.log(m.name, 'late inputs', m.lateInputs, 'missed ticks', m.missedTicks);
  }
  d.h.onServerTick = null;
  const offsets = echoOffsets(d);
  d.h.dispose();
  return offsets;
};

const lagOf = (room: Room, id: number, tick: number): number =>
  (tick - room.members.get(id)!.viewTick) * TICK_MS;

const shownTarget = (c: VClient): Hitbox | undefined => [...(c.shown?.hitboxes.values() ?? [])][0];

// ---------------------------------------------------------------------------------------------
// Laser: the shooter tracks the target as drawn and fires; every 4th shot aims 0.75 m beside
// the body (must miss on both sides).

export const laserDuel = (opts: NetcheckOptions): ScenarioReport => {
  const config = defaultConfig();
  config.combat.laserCharges = 99;
  config.combat.laserReserve = 999;
  config.combat.laserFireCdSec = 0.05;
  const stats = emptyStats();
  let lagSum = 0;
  let eyeErr = 0;
  let shotNo = 0;
  let aimOff = 0;
  let fireIn = 90;
  const move = strafePattern((opts.seed ?? 7) + 1, false);
  const tgtMove = strafePattern(opts.seed ?? 7, true);
  const d = startDuel(
    opts,
    config,
    (c) => {
      const me = c.core.localPredicted();
      const tgt = shownTarget(c);
      if (!me || !tgt) return IDLE;
      const eye = eyePos(me, config.movement);
      const chest = chestOf(tgt);
      const side = normalize(v3(-(chest.z - eye.z), 0, chest.x - eye.x));
      const aim = shotNo % 2 ? tgt.head : chest;
      let buttons = opts.shooterStrafes ? move() : 0;
      if (--fireIn === 0) {
        buttons |= Btn.Fire;
        shotNo++;
        aimOff = shotNo % 4 === 3 ? 0.75 : 0;
        fireIn = 30;
      }
      return { buttons, view: lookAt(eye, madd(aim, side, aimOff)) };
    },
    () => ({ buttons: tgtMove(), view: qFromBasis(v3(-1, 0, 0), UP) }),
    { shooter: v3(-12, 0, 0), target: v3(12, 0, 0) },
    (e, d) =>
      e.type === 'hit' && e.attacker === d.sp.id
        ? 'hit marker'
        : e.type === 'laserFire' && e.player === d.sp.id
          ? 'laser beam'
          : null,
  );
  const b = d.room.world.boomerangs.find((x) => x.owner === d.sp.id)!;
  b.phase = Phase.Dropped; // Boomerang away: LMB fires the laser
  b.pos = v3(-55, 0.3, -35);
  b.vel = v3();
  // the shooter's own predicted eye per tick (to check its prediction while strafing)
  const predictedEye = new Map<number, Vec3>();
  const hook = d.shooter.core.onPredicted;
  d.shooter.core.onPredicted = (w, input) => {
    hook?.(w, input);
    const me = w.players.find((p) => p.id === d.sp.id);
    if (me) predictedEye.set(input.tick, eyePos(me, config.movement));
  };
  onTick(d, (r, events) => {
    const tick = r.world.tick;
    for (const e of events) {
      if (e.type === 'hit' && e.attacker === d.sp.id) d.count('hit marker', 'real');
      if (e.type !== 'laserFire' || e.player !== d.sp.id) continue;
      d.count('laser beam', 'real');
      const seen = d.shooter.seenAt.get(tick)?.hitboxes.get(d.tp.id);
      if (!seen) continue;
      const eye = eyePos(d.sp, config.movement);
      const onScreen = !!rayHitbox(eye, qForward(d.sp.view), config.combat.laserRange, seen);
      const counted = events.some(
        (x) => x.type === 'hit' && x.attacker === d.sp.id && x.kind === 'laser',
      );
      tally(stats, onScreen, counted);
      lagSum += lagOf(r, d.sp.id, tick);
      const pe = predictedEye.get(tick);
      if (pe) eyeErr = Math.max(eyeErr, len(sub(pe, eye)));
    }
  });
  d.h.run((opts.seconds ?? 20) * 1000);
  const echo = endDuel(d);
  return {
    name: opts.shooterStrafes ? 'laser, shooter strafing' : 'laser',
    stats,
    events: d.events,
    viewLagMs: stats.shots ? lagSum / stats.shots : 0,
    extra: { 'own eye prediction error, max (m)': eyeErr, ...echo },
  };
};

// ---------------------------------------------------------------------------------------------
// Boomerang: throws led at the target as drawn. On screen = the (predicted) Boomerang passed
// through the target as drawn. Also: predicted vs server flight, catches and recall lines.
//   quick  — Quick Throws
//   steer  — thrown off to the side, then steered (RMB) onto the target
//   windup — 3 s Wind-up Throws (150 m/s) from 30 m
//   recall — thrown past the target, then recalled (R) through it; the recall line is judged
//            where players are *now* (it is telegraphed, so it can be dodged), so only the
//            line itself and its timing must match — not the kills

/** 'twin': Quick Throws with the Double-boomerang power-up (each throw also flies a twin) */
export type BoomerangVariant = 'quick' | 'steer' | 'windup' | 'recall' | 'twin';

export const boomerangDuel = (
  opts: NetcheckOptions,
  variant: BoomerangVariant = 'quick',
): ScenarioReport => {
  const config = defaultConfig();
  const stats = emptyStats();
  let lagSum = 0;
  let lagN = 0;
  let phase = 0; // 0 wait, 1 aim / wind up, 2 thrown
  let wait = 60;
  let flight = 0;
  let prevSeen: Hitbox | null = null;
  const move = strafePattern((opts.seed ?? 11) + 1, false);
  const tgtMove = strafePattern(opts.seed ?? 11, false);
  const speed = variant === 'windup' ? config.combat.windupSpeed : config.combat.quickSpeed;
  const d = startDuel(
    opts,
    config,
    (c) => {
      const me = c.core.localPredicted();
      const tgt = shownTarget(c);
      if (!me || !tgt) return IDLE;
      const eye = eyePos(me, config.movement);
      // lead the target by its on-screen velocity times the flight time; aim a little high
      const vel = prevSeen ? scale(sub(chestOf(tgt), chestOf(prevSeen)), 60) : v3();
      prevSeen = tgt;
      const tFlight = len(sub(chestOf(tgt), eye)) / speed;
      const lead = add(madd(chestOf(tgt), vel, tFlight), v3(0, 1.5 * tFlight * tFlight, 0));
      const b = c.core.predWorld?.boomerangs.find((x) => x.owner === c.core.localId);
      const held = b?.phase === Phase.Held;
      let buttons = opts.shooterStrafes && variant !== 'windup' ? move() : 0;
      let aim = lead;
      if (phase === 0 && held && --wait <= 0) {
        phase = 1;
        wait = 0;
      }
      if (phase === 1) {
        if (variant === 'windup') {
          // hold RMB for the wind-up, then LMB fires (RMB still held)
          buttons |= Btn.Alt;
          if (++wait >= Math.ceil(config.combat.windupSec * 60) + 3) {
            buttons |= Btn.Fire;
            phase = 2;
            flight = 0;
          }
        } else {
          buttons |= Btn.Fire; // hold to aim, release to throw
          if (variant === 'steer' || variant === 'recall')
            aim = add(lead, v3(0, 0, variant === 'steer' ? 4 : 1.5));
          if (++wait >= 8) {
            phase = 2;
            flight = 0;
            buttons &= ~(Btn.Left | Btn.Right); // A/D held on release would curve the throw
          }
        }
      } else if (phase === 2) {
        flight++;
        if (held && flight > 2) {
          phase = 0;
          wait = 20;
        } else if (variant === 'steer' && !held) {
          buttons |= Btn.Alt; // steer onto the target as drawn
        } else if (variant === 'recall' && flight === 22) {
          buttons |= Btn.Recall;
        }
      }
      return { buttons, view: lookAt(eye, aim) };
    },
    () => ({ buttons: tgtMove(), view: qFromBasis(v3(-1, 0, 0), UP) }),
    variant === 'windup'
      ? { shooter: v3(-15, 0, 0), target: v3(15, 0, 0) }
      : { shooter: v3(-8, 0, 0), target: v3(8, 0, 0) },
    (e, d) =>
      e.type === 'hit' && e.attacker === d.sp.id
        ? 'hit marker'
        : e.type === 'catch' && e.player === d.sp.id
          ? 'catch'
          : e.type === 'recallStart' && e.player === d.sp.id
            ? 'recall line'
            : null,
  );
  // Double boomerang: plenty of charges (the client learns them from its exact own state)
  if (variant === 'twin') {
    d.sp.powerup = Powerup.Double;
    d.sp.powerupCharges = 1000;
  }
  // the shooter's forward-predicted Boomerang (and twins) per tick, and its predicted recall lines
  const predicted = new Map<number, Vec3>();
  const predictedTwins = new Map<string, Vec3>();
  const predictedLines = new Map<number, { from: Vec3; to: Vec3; lethal: boolean }>();
  const hook = d.shooter.core.onPredicted;
  d.shooter.core.onPredicted = (w, input) => {
    hook?.(w, input);
    const b = w.boomerangs.find((x) => x.owner === d.sp.id);
    if (b) predicted.set(input.tick, { ...b.pos });
    for (const t of w.twins) predictedTwins.set(`${input.tick}:${t.id}`, { ...t.pos });
    for (const e of w.events) if (e.type === 'recallStart') predictedLines.set(input.tick, e);
  };
  const twinPrev = new Map<number, Vec3>();
  let twinErrMax = 0;
  let twinsSeen = 0;
  let twinsUnpredicted = 0;
  let cur: { onScreen: boolean; counted: boolean; prev: Vec3 | null } | null = null;
  let errSum = 0;
  let errN = 0;
  let errMax = 0;
  let lineErr = 0;
  let lethalMismatch = 0;
  let lines = 0;
  onTick(d, (r, events) => {
    const tick = r.world.tick;
    const b = r.world.boomerangs.find((x) => x.owner === d.sp.id)!;
    if (b.phase === Phase.Dropped) {
      // a Boomerang that fell on the floor: hand it back (keeps the test throwing)
      b.phase = Phase.Held;
      b.controller = d.sp.id;
    }
    for (const e of events) {
      if (e.type === 'hit' && e.attacker === d.sp.id) d.count('hit marker', 'real');
      if (e.type === 'catch' && e.player === d.sp.id) d.count('catch', 'real');
      if (e.type === 'recallStart' && e.player === d.sp.id) {
        d.count('recall line', 'real');
        const pl = predictedLines.get(tick);
        lines++;
        if (!pl) lethalMismatch++;
        else {
          lineErr = Math.max(lineErr, len(sub(pl.from, e.from)), len(sub(pl.to, e.to)));
          if (pl.lethal !== e.lethal) lethalMismatch++;
        }
      }
      if (e.type === 'throw' && e.player === d.sp.id) {
        if (cur && variant !== 'recall') tally(stats, cur.onScreen, cur.counted);
        cur = { onScreen: false, counted: false, prev: null };
      }
      if (
        cur &&
        e.type === 'hit' &&
        e.attacker === d.sp.id &&
        (e.kind === 'boomerang' || e.kind === 'headshot' || e.kind === 'windup')
      )
        cur.counted = true;
    }
    const flying = b.phase === Phase.Out || b.phase === Phase.Return || b.phase === Phase.Recall;
    if (cur && flying) {
      const seen = d.shooter.seenAt.get(tick)?.hitboxes.get(d.tp.id);
      const from = cur.prev ?? b.pos;
      if (
        seen &&
        b.phase !== Phase.Recall &&
        sweepHitbox(from, b.pos, config.combat.boomerangRadius, seen)
      )
        cur.onScreen = true;
      cur.prev = { ...b.pos };
      lagSum += lagOf(r, d.sp.id, tick);
      lagN++;
      const p = predicted.get(tick);
      if (p) {
        const err = len(sub(p, b.pos));
        errSum += err;
        errN++;
        errMax = Math.max(errMax, err);
      }
    }
    // Double-boomerang twins: on screen like the real one, predicted exactly like it
    for (const t of r.world.twins) {
      if (t.owner !== d.sp.id) continue;
      const seen = d.shooter.seenAt.get(tick)?.hitboxes.get(d.tp.id);
      const from = twinPrev.get(t.id) ?? t.pos;
      if (cur && seen && sweepHitbox(from, t.pos, config.combat.boomerangRadius, seen))
        cur.onScreen = true;
      if (!twinPrev.has(t.id)) twinsSeen++;
      twinPrev.set(t.id, { ...t.pos });
      const p = predictedTwins.get(`${tick}:${t.id}`);
      if (p) twinErrMax = Math.max(twinErrMax, len(sub(p, t.pos)));
      else twinsUnpredicted++;
    }
  });
  d.h.run((opts.seconds ?? 20) * 1000);
  if (cur && variant !== 'recall') {
    const last = cur as { onScreen: boolean; counted: boolean };
    tally(stats, last.onScreen, last.counted);
  }
  const echo = endDuel(d);
  const extra: Record<string, number> = {
    'predicted flight error, mean (m)': errN ? errSum / errN : 0,
    'predicted flight error, max (m)': errMax,
    ...echo,
  };
  if (variant === 'twin') {
    extra['twins thrown'] = twinsSeen;
    extra['predicted twin flight error, max (m)'] = twinErrMax;
    extra['twin ticks not predicted'] = twinsUnpredicted;
  }
  if (variant === 'recall') {
    extra['recall lines'] = lines;
    extra['recall line: predicted vs server, max error (m)'] = lineErr;
    extra['recall line: lethal/timing mismatches'] = lethalMismatch;
  }
  const names: Record<BoomerangVariant, string> = {
    quick: 'boomerang',
    steer: 'boomerang, steered',
    windup: 'wind-up throw',
    recall: 'lethal recall',
    twin: 'double boomerang (twins)',
  };
  return {
    name: `${names[variant]}${opts.shooterStrafes ? ', thrower strafing' : ''}`,
    stats,
    events: d.events,
    viewLagMs: lagN ? lagSum / lagN : 0,
    extra,
  };
};

// ---------------------------------------------------------------------------------------------
// Slash: the target strafes within reach; the shooter swings at random moments, sometimes
// looking off to the side.

/** The sim's slash test (combat.ts), against one hitbox. */
const slashReaches = (eye: Vec3, fwd: Vec3, hb: Hitbox, c: GameConfig['combat']): boolean => {
  const target = chestOf(hb);
  const to = sub(target, eye);
  const dist = len(to);
  const near = Math.min(dist, len(sub(hb.head, eye)));
  if (near > c.slashRange + hb.bodyR) return false;
  return dot(normalize(to), fwd) >= Math.cos(c.slashConeDeg * DEG) || near <= 0.8;
};

export const slashDuel = (opts: NetcheckOptions): ScenarioReport => {
  const config = defaultConfig();
  const stats = emptyStats();
  let lagSum = 0;
  const random = rng(opts.seed ?? 3);
  const tgtMove = strafePattern(opts.seed ?? 5, false);
  let swingIn = 40;
  let off = 0;
  const d = startDuel(
    opts,
    config,
    (c) => {
      const me = c.core.localPredicted();
      const tgt = shownTarget(c);
      if (!me || !tgt) return IDLE;
      const eye = eyePos(me, config.movement);
      const dist = len(sub(chestOf(tgt), eye));
      // stay 1.5–3 m away (the lunge carries you forward)
      let buttons = dist < 1.8 ? Btn.Back : dist > 3 ? Btn.Forward : 0;
      if (--swingIn <= 0) {
        buttons |= Btn.Melee;
        swingIn = 50 + Math.floor(random() * 20);
        off = random() < 0.3 ? 1.6 : 0;
      }
      return { buttons, view: lookAt(eye, add(chestOf(tgt), v3(0, 0, off))) };
    },
    () => ({ buttons: tgtMove(), view: qFromBasis(v3(-1, 0, 0), UP) }),
    { shooter: v3(-1.3, 0, 0), target: v3(1.3, 0, 0) },
    (e, d) => (e.type === 'hit' && e.attacker === d.sp.id ? 'hit marker' : null),
  );
  onTick(d, (r, events) => {
    const tick = r.world.tick;
    for (const e of events) {
      if (e.type === 'hit' && e.attacker === d.sp.id) d.count('hit marker', 'real');
      if (e.type !== 'slash' || e.player !== d.sp.id) continue;
      const seen = d.shooter.seenAt.get(tick)?.hitboxes.get(d.tp.id);
      if (!seen) continue;
      // the swing is judged from the eye after this tick's movement (the lunge only adds speed)
      const eye = eyePos(d.sp, config.movement);
      const onScreen = slashReaches(eye, qForward(d.sp.view), seen, config.combat);
      const counted = events.some(
        (x) => x.type === 'hit' && x.attacker === d.sp.id && x.kind === 'slash',
      );
      tally(stats, onScreen, counted);
      lagSum += lagOf(r, d.sp.id, tick);
    }
  });
  d.h.run((opts.seconds ?? 20) * 1000);
  const echo = endDuel(d);
  return {
    name: 'slash',
    stats,
    events: d.events,
    viewLagMs: stats.shots ? lagSum / stats.shots : 0,
    extra: echo,
  };
};

// ---------------------------------------------------------------------------------------------
// Deflect: the "target" throws Boomerangs at the "shooter", who watches the Boomerang as drawn
// and slashes when it looks within reach (sometimes too early). On screen = during the swing,
// the Boomerang as drawn was inside the deflect cone and reach at least once.

export const deflectDuel = (opts: NetcheckOptions): ScenarioReport => {
  const config = defaultConfig();
  const c = config.combat;
  const stats = emptyStats();
  let lagSum = 0;
  let swings = 0;
  const random = rng(opts.seed ?? 21);
  let phase = 0;
  let wait = 50;
  let cooldown = 0;
  let early = 0; // how early (m beyond reach) this swing is timed
  const d = startDuel(
    opts,
    config,
    (cl, d) => {
      const me = cl.core.localPredicted();
      if (!me) return IDLE;
      const eye = eyePos(me, config.movement);
      const bp = cl.shown?.boomerangs.get(d.tp.id);
      const tgt = shownTarget(cl);
      let view = tgt ? lookAt(eye, chestOf(tgt)) : IDLE.view;
      let buttons = 0;
      cooldown--;
      if (bp && tgt) {
        const dist = len(sub(bp, eye));
        const closing = dist < len(sub(chestOf(tgt), eye)) - 0.5;
        if (closing && dist < 12) view = lookAt(eye, bp); // watch it come in
        if (closing && cooldown <= 0 && dist <= c.slashRange + c.boomerangRadius + early) {
          buttons = Btn.Melee;
          cooldown = 60;
          early = random() < 0.3 ? 2.5 + random() * 3 : random() * 0.6;
        }
      }
      return { buttons, view };
    },
    (cl) => {
      // the thrower: quick throws straight at the defender as drawn
      const me = cl.core.localPredicted();
      const tgt = shownTarget(cl);
      if (!me || !tgt) return IDLE;
      const eye = eyePos(me, config.movement);
      const b = cl.core.predWorld?.boomerangs.find((x) => x.owner === cl.core.localId);
      let buttons = 0;
      if (phase === 0 && b?.phase === Phase.Held && --wait <= 0) phase = 1;
      if (phase === 1) {
        buttons = Btn.Fire;
        if (++wait >= 6) phase = 2;
      } else if (phase === 2 && b?.phase !== Phase.Held) {
        phase = 3;
      } else if (phase === 3 && b?.phase === Phase.Held) {
        phase = 0;
        wait = 40;
      }
      return { buttons, view: lookAt(eye, add(chestOf(tgt), v3(0, 0.3, 0))) };
    },
    { shooter: v3(-7, 0, 0), target: v3(7, 0, 0) },
    (e, d) => (e.type === 'deflect' && e.player === d.sp.id ? 'deflect' : null),
  );
  let swing: { start: number; onScreen: boolean; counted: boolean } | null = null;
  const active = Math.round(c.slashActiveSec * 60);
  onTick(d, (r, events) => {
    const tick = r.world.tick;
    const b = r.world.boomerangs.find((x) => x.owner === d.tp.id)!;
    if (b.phase === Phase.Dropped) {
      b.phase = Phase.Held; // keep the thrower throwing
      b.controller = d.tp.id;
    }
    for (const e of events) {
      if (e.type === 'slash' && e.player === d.sp.id) {
        if (swing) tally(stats, swing.onScreen, swing.counted);
        swing = { start: tick, onScreen: false, counted: false };
        swings++;
        lagSum += lagOf(r, d.sp.id, tick);
      }
      if (e.type === 'deflect' && e.player === d.sp.id) {
        d.count('deflect', 'real');
        if (swing) swing.counted = true;
      }
    }
    // during the swing: was the Boomerang, as the defender saw it, inside the deflect cone?
    if (swing && tick - swing.start < active) {
      const seen = d.shooter.seenAt.get(tick)?.boomerangs.get(d.tp.id);
      const eye = eyePos(d.sp, config.movement);
      if (seen) {
        const to = sub(seen, eye);
        const dist = len(to);
        if (
          dist > 1e-6 &&
          dist <= c.slashRange + c.boomerangRadius &&
          dot(scale(to, 1 / dist), qForward(d.sp.view)) >= Math.cos(c.deflectConeDeg * DEG)
        )
          swing.onScreen = true;
      }
    }
  });
  d.h.run((opts.seconds ?? 20) * 1000);
  if (swing) {
    const last = swing as { onScreen: boolean; counted: boolean };
    tally(stats, last.onScreen, last.counted);
  }
  const echo = endDuel(d);
  return {
    name: 'deflect',
    stats,
    events: d.events,
    viewLagMs: swings ? lagSum / swings : 0,
    extra: echo,
  };
};

// ---------------------------------------------------------------------------------------------
// Grenade: the target lobs Gravity Grenades; the shooter tracks the grenade as drawn and
// lasers it out of the air. On screen = the laser line passed through the drawn grenade.

export const grenadeShot = (opts: NetcheckOptions): ScenarioReport => {
  const config = defaultConfig();
  config.combat.laserCharges = 99;
  config.combat.laserReserve = 999;
  config.combat.laserFireCdSec = 0.05;
  const c = config.combat;
  const stats = emptyStats();
  let lagSum = 0;
  const random = rng(opts.seed ?? 31);
  let throwIn = 60;
  let aimOff = 0;
  let firedFor = -1;
  const d = startDuel(
    opts,
    config,
    (cl) => {
      const me = cl.core.localPredicted();
      const g = [...(cl.shown?.grenades.entries() ?? [])][0];
      if (!me || !g) return IDLE;
      const eye = eyePos(me, config.movement);
      const [gid, gpos] = g;
      let buttons = 0;
      // fire once per grenade, ~0.25 s after it appears; keep tracking during the warning
      if (firedFor !== gid && (cl.shown?.grenadeAge.get(gid) ?? 0) > 15) {
        buttons = Btn.Fire;
        firedFor = gid;
        aimOff = random() < 0.25 ? 1.2 : 0;
      }
      return { buttons, view: lookAt(eye, add(gpos, v3(0, aimOff, 0))) };
    },
    (cl, d) => {
      const me = cl.core.localPredicted();
      if (!me) return IDLE;
      let buttons = 0;
      if (--throwIn <= 0) {
        d.tp.grenadesLeft = 1; // endless supply (server side)
        const mine = cl.core.localPredicted();
        if (mine) mine.grenadesLeft = 1;
        buttons = Btn.Grenade;
        throwIn = 100;
      }
      const eye = eyePos(me, config.movement);
      return { buttons, view: lookAt(eye, v3(-10, 7, (random() - 0.5) * 8)) };
    },
    { shooter: v3(-14, 0, 0), target: v3(14, 0, 0) },
    (e, d) =>
      e.type === 'laserFire' && e.player === d.sp.id
        ? 'laser beam'
        : e.type === 'grenadeActivate' && e.shot
          ? 'grenade shot down'
          : null,
  );
  const b = d.room.world.boomerangs.find((x) => x.owner === d.sp.id)!;
  b.phase = Phase.Dropped;
  b.pos = v3(-55, 0.3, -35);
  b.vel = v3();
  onTick(d, (r, events) => {
    const tick = r.world.tick;
    for (const e of events) {
      if (e.type === 'grenadeActivate' && e.shot) d.count('grenade shot down', 'real');
      if (e.type !== 'laserFire' || e.player !== d.sp.id) continue;
      d.count('laser beam', 'real');
      const seen = d.shooter.seenAt.get(tick);
      const eye = eyePos(d.sp, config.movement);
      const dir = qForward(d.sp.view);
      let onScreen = false;
      for (const gp of seen?.grenades.values() ?? []) {
        const cp = closestPointSeg(gp, eye, madd(eye, dir, c.laserRange));
        if (cp.distSq <= c.grenadeHitRadius * c.grenadeHitRadius) onScreen = true;
      }
      const counted = events.some((x) => x.type === 'grenadeActivate' && x.shot);
      tally(stats, onScreen, counted);
      lagSum += lagOf(r, d.sp.id, tick);
    }
  });
  d.h.run((opts.seconds ?? 20) * 1000);
  const echo = endDuel(d);
  return {
    name: 'grenade shot down',
    stats,
    events: d.events,
    viewLagMs: stats.shots ? lagSum / stats.shots : 0,
    extra: echo,
  };
};

// ---------------------------------------------------------------------------------------------
// CS mode guns: the shooter tracks the target as drawn and fires 3-round AK bursts (spray
// pattern + random cone); every 4th burst aims 0.75 m beside the body. On screen = the bullet's
// line (as the server fired it) passed through the target as drawn. The predicted bullet must
// leave in exactly the server's direction (same spray, same seeded spread).

export const gunDuel = (opts: NetcheckOptions): ScenarioReport => {
  const config = csConfig(defaultConfig());
  config.combat.akReserve = 9999;
  const stats = emptyStats();
  let lagSum = 0;
  let burst = 0;
  let holdFor = 0;
  let fireIn = 90;
  let dirErr = 0;
  const move = strafePattern((opts.seed ?? 7) + 1, false);
  const tgtMove = strafePattern(opts.seed ?? 7, true);
  const d = startDuel(
    opts,
    config,
    (c) => {
      const me = c.core.localPredicted();
      const tgt = shownTarget(c);
      if (!me || !tgt) return IDLE;
      const eye = eyePos(me, config.movement);
      const chest = chestOf(tgt);
      const side = normalize(v3(-(chest.z - eye.z), 0, chest.x - eye.x));
      let buttons = opts.shooterStrafes ? move() : 0;
      if (--fireIn === 0) {
        burst++;
        holdFor = 13; // 3 rounds
        fireIn = 45;
      }
      if (holdFor > 0) {
        holdFor--;
        buttons |= Btn.Fire;
      }
      const aim = burst % 2 ? tgt.head : chest;
      return { buttons, view: lookAt(eye, madd(aim, side, burst % 4 === 3 ? 0.75 : 0)) };
    },
    () => ({ buttons: tgtMove(), view: qFromBasis(v3(-1, 0, 0), UP) }),
    { shooter: v3(-12, 0, 0), target: v3(12, 0, 0) },
    (e, d) =>
      e.type === 'hit' && e.attacker === d.sp.id
        ? 'hit marker'
        : e.type === 'gunFire' && e.player === d.sp.id
          ? 'gun shot'
          : null,
  );
  // the shooter's predicted bullet directions, per tick
  const predictedDir = new Map<number, Vec3>();
  const hook = d.shooter.core.onPredicted;
  d.shooter.core.onPredicted = (w, input) => {
    hook?.(w, input);
    for (const e of w.events)
      if (e.type === 'gunFire' && e.player === d.sp.id)
        predictedDir.set(input.tick, normalize(sub(e.to, e.from)));
  };
  onTick(d, (r, events) => {
    const tick = r.world.tick;
    for (const e of events) {
      if (e.type === 'hit' && e.attacker === d.sp.id) d.count('hit marker', 'real');
      if (e.type !== 'gunFire' || e.player !== d.sp.id) continue;
      d.count('gun shot', 'real');
      const dir = normalize(sub(e.to, e.from));
      const pd = predictedDir.get(tick);
      if (pd) dirErr = Math.max(dirErr, len(sub(pd, dir)));
      const seen = d.shooter.seenAt.get(tick)?.hitboxes.get(d.tp.id);
      if (!seen) continue;
      const onScreen = !!rayHitbox(e.from, dir, config.combat.akRange, seen);
      const counted = events.some(
        (x) => x.type === 'hit' && x.attacker === d.sp.id && x.kind === 'ak',
      );
      tally(stats, onScreen, counted);
      lagSum += lagOf(r, d.sp.id, tick);
    }
  });
  d.h.run((opts.seconds ?? 20) * 1000);
  const echo = endDuel(d);
  return {
    name: opts.shooterStrafes ? 'AK, shooter strafing' : 'AK',
    stats,
    events: d.events,
    viewLagMs: stats.shots ? lagSum / stats.shots : 0,
    extra: { 'predicted vs server bullet direction error, max': dirErr, ...echo },
  };
};

export const SCENARIOS: Record<string, (o: NetcheckOptions) => ScenarioReport> = {
  laser: laserDuel,
  laserStrafing: (o) => laserDuel({ ...o, shooterStrafes: true }),
  boomerang: (o) => boomerangDuel(o, 'quick'),
  boomerangStrafing: (o) => boomerangDuel({ ...o, shooterStrafes: true }, 'quick'),
  boomerangSteered: (o) => boomerangDuel(o, 'steer'),
  windup: (o) => boomerangDuel(o, 'windup'),
  recall: (o) => boomerangDuel(o, 'recall'),
  twin: (o) => boomerangDuel(o, 'twin'),
  slash: slashDuel,
  deflect: deflectDuel,
  grenade: grenadeShot,
  gun: gunDuel,
  gunStrafing: (o) => gunDuel({ ...o, shooterStrafes: true }),
};
