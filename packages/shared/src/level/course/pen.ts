// An authoring helper for course data (./types.ts): a pen that walks the route and writes the
// elements with absolute coordinates, so a map file reads as a sequence of moves ("a 12 m gap,
// a hop chain curving left, a surf ramp dropping 14 m") while the result stays plain JSON data.
// Nothing here is needed to expand a course; an editor will write the same data directly.
//
// Surf maps (docs/movement-map-design/BUILDING.md): `curve` lands you on a curved ramp's face
// at the pen and leaves the pen where its racing line ends (heading its way); `gate` and
// `anchor` put a fly-through gate / recovery ring round the pen, and their restart bay is placed
// when the next ramp (or pad) is written — its landing is where the bay's launch throws you.
import type { Vec3 } from '../../math/vec3';
import { v3, add, madd, cross, dot, sub, UP } from '../../math/vec3';
import type {
  AnchorEl,
  CourseData,
  CurveEl,
  CurveLeg,
  GateEl,
  Go,
  P2,
  P3,
  RouteElement,
  SceneryElement,
  SurfEl,
} from './types';
import { headingDir, headingOf } from './expand';
import { curvePath, curveRidePoint } from './curve';

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const P = (v: Vec3): P3 => [r3(v.x), r3(v.y), r3(v.z)];
const DEG = Math.PI / 180;

export interface HopStep {
  /** centre-to-centre distance from the previous pad (or from the pen) */
  d: number;
  /** turn before this step (degrees, + = right) */
  turn?: number;
  rise?: number;
  size?: P2;
}

/**
 * Where a gate's or anchor's restart bay goes, from the landing its launch throws you onto:
 * `back` metres back along the way, `side` to the right, `up` above (defaults 26, 10 toward a
 * ramp's ridge — away from the transfer that arrives on its face — and 12), the flight taking
 * `flightSec` (default 1.2 s: about 23 m/s on arrival, a typical surf entry, mostly along it).
 * Before a portal the landing is the portal's opening (Pen.airPortal: you are thrown through it
 * again). Authored instead: `at` (the bay), `heading` (its facing) and `to` (where its launch
 * throws you: a re-entry ramp of your own, drawn with `branch`) — any of them.
 */
export interface BayOpts {
  back?: number;
  side?: number;
  up?: number;
  flightSec?: number;
  at?: P3;
  heading?: number;
  to?: P3;
}

export class Pen {
  pos: Vec3;
  heading: number;
  readonly route: RouteElement[] = [];
  readonly scenery: SceneryElement[] = [];
  /** gates and anchors whose restart bay waits for the next landing */
  private pending: { e: GateEl | AnchorEl; bay: BayOpts }[] = [];
  /** where the last element written was left (its exit): bays go to the other side */
  private lastEnd: Vec3 | null = null;

  constructor(at: P3, heading: number) {
    this.pos = v3(at[0], at[1], at[2]);
    this.heading = heading;
  }

  get dir(): Vec3 {
    return headingDir(this.heading);
  }
  get right(): Vec3 {
    return cross(this.dir, UP);
  }
  /** A point relative to the pen: `f` ahead, `s` to the right, `u` up. */
  rel(f: number, s = 0, u = 0): Vec3 {
    return add(madd(madd(this.pos, this.dir, f), this.right, s), v3(0, u, 0));
  }
  relP(f: number, s = 0, u = 0): P3 {
    return P(this.rel(f, s, u));
  }
  here(): P3 {
    return P(this.pos);
  }

  turn(deg: number): this {
    this.heading = (((this.heading + deg) % 360) + 360) % 360;
    return this;
  }
  face(heading: number): this {
    this.heading = heading;
    return this;
  }
  /** Move without building (a flight, a drop, a gap). */
  move(f: number, rise = 0, side = 0): this {
    this.pos = this.rel(f, side, rise);
    return this;
  }
  /** Leave the last element with a jump and a jetpack burn of `ticks` (it holds Space). */
  jet(ticks: number): this {
    const e = this.route[this.route.length - 1];
    if (e) {
      e.go = 'jump';
      e.jet = ticks;
    }
    return this;
  }
  /** The last element built (to set how you leave it). */
  go(go: Go): this {
    const e = this.route[this.route.length - 1];
    if (e) e.go = go;
    return this;
  }

  start(size: P2 = [14, 16]): this {
    this.route.push({ t: 'start', at: this.here(), heading: this.heading, size });
    this.pos = this.rel(size[1] / 2);
    return this;
  }
  /** A walled checkpoint room entered from the pen (its back doorway at the pen). */
  stage(size: P2 = [12, 14], cap?: number, name?: string): this {
    const e: RouteElement = { t: 'stage', at: this.relP(size[1] / 2), heading: this.heading, size };
    if (cap) e.cap = cap;
    if (name) e.name = name;
    this.route.push(e);
    this.pos = this.rel(size[1]);
    return this;
  }
  finish(size: P2 = [14, 16]): this {
    this.route.push({ t: 'finish', at: this.relP(size[1] / 2), heading: this.heading, size });
    this.pos = this.rel(size[1] / 2);
    return this;
  }
  /**
   * Place the restart bays waiting for a landing: the landing is at the pen, heading its way;
   * `ridge` = the side (+1 right, -1 left) of a ramp's ridge, where a bay goes by default.
   */
  private land(ridge = 0, landing: Vec3 = this.pos, up = 12): void {
    // (no ridge to go by: the side away from where the way arrives from)
    const from = this.lastEnd;
    const away = ridge || (from && dot(sub(from, this.pos), this.right) > 0 ? -1 : 1);
    for (const { e, bay } of this.pending) {
      const to = bay.to ? v3(bay.to[0], bay.to[1], bay.to[2]) : landing;
      const side = bay.side ?? 10 * away;
      const at = bay.at
        ? v3(bay.at[0], bay.at[1], bay.at[2])
        : add(
            madd(madd(to, this.dir, -(bay.back ?? 26)), this.right, side),
            v3(0, bay.up ?? up, 0),
          );
      e.bay = P(at);
      e.bayHeading = r3(bay.heading ?? headingOf(v3(to.x - at.x, 0, to.z - at.z)));
      e.to = P(to);
      e.flightSec = bay.flightSec ?? 1.2;
    }
    this.pending = [];
  }

  /**
   * A fly-through progress gate (C1..C5) round the pen: `size` [width, height] centred on it;
   * its restart bay is placed at the next landing (`bay`). `finish`: the finish gate.
   */
  gate(size: P2, name?: string, bay: BayOpts = {}, finish = false): this {
    const e: GateEl = {
      t: 'gate',
      at: this.relP(0, 0, -size[1] / 2),
      heading: this.heading,
      size,
    };
    if (name) e.name = name;
    if (finish) e.finish = true;
    this.route.push(e);
    if (!finish) this.pending.push({ e, bay });
    return this;
  }

  /** The finish gate round the pen, with a landing platform `after` metres beyond it. */
  finishGate(size: P2, after = 30, drop = 10): this {
    const e: GateEl = {
      t: 'gate',
      at: this.relP(0, 0, -size[1] / 2),
      heading: this.heading,
      size,
      finish: true,
      bay: this.relP(after, 0, -drop),
    };
    this.route.push(e);
    return this;
  }

  /** A recovery anchor ring round the pen (default 10 × 10); its bay waits for the next landing. */
  anchor(name?: string, bay: BayOpts = {}, size: P2 = [10, 10]): this {
    const e = {
      t: 'anchor',
      at: this.relP(0, 0, -size[1] / 2),
      heading: this.heading,
      size,
    } as AnchorEl;
    if (name) e.name = name;
    this.route.push(e);
    this.pending.push({ e, bay });
    return this;
  }

  /** A red zone block `f` ahead, `s` right, bottom `u` up: [width, height, depth], turned. */
  red(f: number, s: number, u: number, size: P3, turn = 0): this {
    this.route.push({ t: 'red', at: this.relP(f, s, u), size, heading: r3(this.heading + turn) });
    return this;
  }

  /**
   * A curved surf ramp you land on at the pen, `depth` down its riding face: its ridge follows
   * the legs from above the pen (./curve.ts), starting `lead` metres (default 5) before it on
   * a straight at the first leg's slope (nobody lands on a ramp's very end). The pen ends where
   * its racing line ends, heading the way the ridge does there.
   */
  curve(o: {
    legs: CurveLeg[];
    height: number;
    angle: number;
    side: 'left' | 'right' | 'both';
    ride?: 'left' | 'right';
    depth?: number;
    red?: number;
    color?: number;
    early?: number;
    lead?: number;
    /** how far the lead-in drops toward the landing (default: the first leg's slope carried on) */
    leadDrop?: number;
    alt?: boolean;
    go?: Go;
  }): this {
    const depth = o.depth ?? 0.35;
    const face = o.side === 'both' ? (o.legs[0]?.ride ?? o.ride ?? 'right') : o.side;
    const s = face === 'right' ? 1 : -1;
    this.land(-s);
    const run = o.height / Math.tan(o.angle * DEG);
    const lead = o.lead ?? 5;
    // the first leg's slope carries on back over the lead-in
    const l0 = o.legs[0];
    const len0 = l0.len ?? Math.abs(l0.turn ?? 0) * DEG * (l0.radius ?? 20);
    const drop = r3(o.leadDrop ?? ((l0.drop ?? 0) / Math.max(1, len0)) * lead);
    // the ridge is up and toward it from the landing, `lead` back along the way
    const at = add(
      madd(madd(this.pos, this.right, -s * run * depth), this.dir, -lead),
      v3(0, o.height * depth + drop, 0),
    );
    const e: CurveEl = {
      t: 'curve',
      at: P(at),
      heading: r3(this.heading),
      legs: lead > 0 ? [{ len: lead, drop }, ...o.legs] : o.legs,
      height: o.height,
      angle: o.angle,
      side: o.side,
    };
    if (lead > 0) e.lead = lead;
    for (const k of ['ride', 'depth', 'red', 'color', 'early', 'alt'] as const)
      if (o[k] !== undefined) (e as unknown as Record<string, unknown>)[k] = o[k];
    e.go = o.go ?? 'strafe';
    this.route.push(e);
    // where the line ends: on the face it rides at the end, at that leg's depth
    const path = curvePath(e);
    const end = path.at(Math.max(0, path.length - (o.early ?? 0)));
    let lastFace: 'left' | 'right' = face;
    let lastDepth = depth;
    for (const l of e.legs) {
      if (l.ride) lastFace = l.ride;
      if (l.depth !== undefined) lastDepth = l.depth;
    }
    this.pos = curveRidePoint(e, end, o.side === 'both' ? lastFace : face, lastDepth);
    this.heading = r3(headingOf(end.dir));
    this.lastEnd = this.pos;
    return this;
  }

  /**
   * An alternative stretch (a salvage ramp, a faster line's ramp, a launch back): `draw` writes
   * it from here with the pen (everything marked `alt`: off the racing line), then the pen
   * comes back where it was. Returns what `draw` returns (points to build a fork's line from).
   */
  branch<T>(draw: (p: this) => T): T {
    const pos = this.pos;
    const heading = this.heading;
    const pending = this.pending;
    this.pending = [];
    const from = this.route.length;
    const out = draw(this);
    for (const e of this.route.slice(from)) {
      if (e.t === 'gate' || e.t === 'anchor' || e.t === 'jumps')
        throw new Error('a branch holds ramps, platforms, launches, portals, walls, red zones');
      e.alt = true;
    }
    this.pos = pos;
    this.heading = heading;
    this.pending = pending;
    return out;
  }

  /** Bhop pads (their own top colour, arrows to the next pad), each a step from the last. */
  bhopPads(steps: HopStep[], size: P2 = [6, 6]): this {
    this.pads(steps, 'hop', size);
    const e = this.route[this.route.length - 1];
    if (e.t === 'jumps') e.style = 'bhop';
    return this;
  }

  /**
   * A portal flown through `f` ahead of the pen ([width, height] centred on the flight), turning
   * you `turn` degrees; you come out at `exit` (feet) heading the turned way. Cardinal only.
   * `look`: its colour and mark, whether it keeps where you crossed it (PortalEl.offset) and
   * your vertical speed (PortalEl.vertical).
   * Gates and anchors waiting for a landing get their bays here, before it: their launch throws
   * you through it again (from 30 m back, 3 m below the opening's middle: through it level).
   */
  airPortal(
    f: number,
    exit: P3,
    turn = 0,
    size: P2 = [10, 10],
    look: { color?: number; glyph?: string; offset?: boolean; vertical?: 'keep' | 'zero' } = {},
  ): this {
    if (this.pending.length) {
      this.pending = this.pending.map(({ e, bay }) => ({ e, bay: { back: 30, ...bay } }));
      this.land(0, this.rel(f), -3);
    }
    const e: RouteElement = {
      t: 'portal',
      at: this.relP(f, 0, -size[1] / 2),
      // (portals face a cardinal heading: the nearest)
      heading: (Math.round(this.heading / 90) * 90) % 360,
      exit,
      size,
      air: true,
      go: 'strafe',
    };
    if (turn) e.turn = turn;
    if (look.color !== undefined) e.color = look.color;
    if (look.glyph) e.glyph = look.glyph;
    if (look.offset) e.offset = true;
    if (look.vertical === 'zero') e.vertical = 'zero';
    this.route.push(e);
    this.pos = v3(exit[0], exit[1], exit[2]);
    this.heading = e.heading;
    this.turn(turn);
    this.lastEnd = null;
    return this;
  }

  /** A platform entered from its back edge at the pen (or centred on it: `centred`). */
  platform(
    size: P2,
    go?: Go,
    opts: { centred?: boolean; style?: 'island' | 'slab' | 'plain' } = {},
  ): this {
    this.land();
    const c = opts.centred ? this.pos : this.rel(size[1] / 2);
    const e: RouteElement = { t: 'platform', at: P(c), size, heading: this.heading };
    if (go) e.go = go;
    if (opts.style) e.style = opts.style;
    this.route.push(e);
    this.pos = madd(c, this.dir, size[1] / 2);
    return this;
  }
  /**
   * A square landing where the way turns: entered at the pen, the pen ends on its far edge after
   * turning `deg` (it exits toward whatever comes next).
   */
  turnPad(deg: number, size = 10, go?: Go): this {
    const c = this.rel(size / 2);
    const e: RouteElement = { t: 'platform', at: P(c), size: [size, size], heading: this.heading };
    if (go) e.go = go;
    this.route.push(e);
    this.pos = c;
    this.turn(deg);
    this.pos = madd(c, this.dir, size / 2);
    return this;
  }
  /** A walkway (or a narrow beam) from the pen to `to`. */
  path(to: P3, width?: number, style?: 'walk' | 'beam'): this {
    const e: RouteElement = { t: 'path', to };
    if (width !== undefined) e.width = width;
    if (style) e.style = style;
    this.route.push(e);
    this.pos = v3(to[0], to[1], to[2]);
    return this;
  }
  /** Pads to jump or bunny-hop (`go` 'hop'), each a step from the last; the pen ends on the last. */
  pads(steps: HopStep[], go: Go = 'hop', size: P2 = [5, 5]): this {
    const pads: { at: P3; size: P2; heading: number }[] = [];
    let landed = false;
    for (const s of steps) {
      if (s.turn) this.turn(s.turn);
      this.move(s.d, s.rise ?? 0);
      if (!landed) {
        this.land();
        landed = true;
      }
      pads.push({ at: this.here(), size: s.size ?? size, heading: this.heading });
    }
    this.lastEnd = this.pos;
    this.route.push({ t: 'jumps', pads, go });
    return this;
  }
  /**
   * A surf ramp you land on at the pen (the upper third of its face), running `length` ahead
   * and dropping `drop`; the pen ends where the ride leaves it.
   */
  surf(o: {
    length: number;
    drop: number;
    height: number;
    angle: number;
    side: 'left' | 'right' | 'both';
    ride?: 'left' | 'right';
    depth?: number;
    go?: Go;
  }): this {
    this.land();
    const depth = o.depth ?? 0.3;
    const face = o.side === 'both' ? (o.ride ?? 'right') : o.side;
    const s = face === 'right' ? 1 : -1;
    const run = o.height / Math.tan(o.angle * DEG);
    const sideRun = o.side === 'both' ? run : run;
    // the ride line sits `depth` down the face: the ridge is up and toward it from there
    const back = (0.04 * o.length) / 0.92;
    const ridgeStart = add(
      madd(madd(this.pos, this.right, -s * sideRun * depth), this.dir, -back),
      v3(0, o.height * depth + (0.04 * o.drop) / 0.92, 0),
    );
    const total = o.length / 0.92;
    const drop = o.drop / 0.92;
    const from = ridgeStart;
    const to = add(madd(ridgeStart, this.dir, total), v3(0, -drop, 0));
    const e: SurfEl = {
      t: 'surf',
      from: P(from),
      to: P(to),
      height: o.height,
      angle: o.angle,
      side: o.side,
    };
    if (o.side === 'both' && o.ride) e.ride = o.ride;
    if (o.depth !== undefined) e.depth = o.depth;
    e.go = o.go ?? 'strafe';
    this.route.push(e);
    this.pos = add(this.rel(o.length), v3(0, -o.drop, 0));
    return this;
  }
  /**
   * A launch pad `back` metres behind the pen (on the platform you're on: no base of its own)
   * throwing you `f` ahead of the pen, `rise` up (`side` right) in `sec`.
   */
  launch(f: number, rise: number, sec: number, side = 0, back = 2.5): this {
    const at = this.rel(-back);
    const to = this.rel(f, side, rise);
    this.route.push({ t: 'launch', at: P(at), to: P(to), flightSec: sec, base: false });
    this.pos = to;
    return this;
  }
  /** A boost strip (on its own platform, entered from the pen) or an air ring at the pen. */
  booster(speed: number, up = 3, air = false, size: P2 = [4, 5]): this {
    if (air) {
      this.route.push({
        t: 'booster',
        at: this.here(),
        heading: this.heading,
        speed,
        up,
        size,
        air: true,
        go: 'strafe',
      });
      return this;
    }
    const c = this.rel(size[1] / 2 + 1);
    this.route.push({
      t: 'booster',
      at: P(c),
      heading: this.heading,
      speed,
      up,
      size,
      go: 'strafe',
    });
    this.pos = madd(c, this.dir, size[1] / 2 + 1);
    return this;
  }
  /** A big portal 5 m ahead (on its own platform); you come out at `exit`, same heading. */
  portal(exit: P3, size: P2 = [7, 8]): this {
    this.route.push({ t: 'portal', at: this.relP(5), heading: this.heading, exit, size });
    this.pos = v3(exit[0], exit[1], exit[2]);
    return this;
  }
  /** A wall with a hole `f` ahead; the pen moves to the hole. */
  window(f: number, hole: P2, wall?: P2, rise = 0, side = 0): this {
    this.move(f, rise, side);
    const e: RouteElement = {
      t: 'window',
      at: this.here(),
      heading: this.heading,
      hole,
      go: 'strafe',
    };
    if (wall) e.wall = wall;
    this.route.push(e);
    return this;
  }
  /** A solid block `f` ahead, `s` to the right (bottom centre), turned `turn` from the heading. */
  wall(f: number, s: number, size: P3, rise = 0, turn = 0): this {
    this.route.push({ t: 'wall', at: this.relP(f, s, rise), size, heading: this.heading + turn });
    return this;
  }
  fuel(): this {
    this.route.push({ t: 'fuel', at: this.here() });
    return this;
  }
  deco(e: SceneryElement): this {
    this.scenery.push(e);
    return this;
  }
  /** Scenery at a point relative to the pen. */
  decoAt(f: number, s: number, u: number, make: (at: P3) => SceneryElement): this {
    this.scenery.push(make(this.relP(f, s, u)));
    return this;
  }

  course(
    rest: Omit<CourseData, 'route' | 'scenery' | 'format'> & { scenery?: SceneryElement[] },
  ): CourseData {
    if (this.pending.length) throw new Error('a gate or anchor has no landing after it');
    return {
      format: 1,
      ...rest,
      route: this.route,
      scenery: [...this.scenery, ...(rest.scenery ?? [])],
    };
  }
}
