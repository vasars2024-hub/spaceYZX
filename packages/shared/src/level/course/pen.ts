// An authoring helper for course data (./types.ts): a pen that walks the route and writes the
// elements with absolute coordinates, so a map file reads as a sequence of moves ("a 12 m gap,
// a hop chain curving left, a surf ramp dropping 14 m") while the result stays plain JSON data.
// Nothing here is needed to expand a course; an editor will write the same data directly.
import type { Vec3 } from '../../math/vec3';
import { v3, add, madd, cross, UP } from '../../math/vec3';
import type { CourseData, Go, P2, P3, RouteElement, SceneryElement, SurfEl } from './types';
import { headingDir } from './expand';

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

export class Pen {
  pos: Vec3;
  heading: number;
  readonly route: RouteElement[] = [];
  readonly scenery: SceneryElement[] = [];

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
  stage(size: P2 = [12, 14], cap?: number): this {
    const e: RouteElement = { t: 'stage', at: this.relP(size[1] / 2), heading: this.heading, size };
    if (cap) e.cap = cap;
    this.route.push(e);
    this.pos = this.rel(size[1]);
    return this;
  }
  finish(size: P2 = [14, 16]): this {
    this.route.push({ t: 'finish', at: this.relP(size[1] / 2), heading: this.heading, size });
    this.pos = this.rel(size[1] / 2);
    return this;
  }
  /** A platform entered from its back edge at the pen (or centred on it: `centred`). */
  platform(
    size: P2,
    go?: Go,
    opts: { centred?: boolean; style?: 'island' | 'slab' | 'plain' } = {},
  ): this {
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
    for (const s of steps) {
      if (s.turn) this.turn(s.turn);
      this.move(s.d, s.rise ?? 0);
      pads.push({ at: this.here(), size: s.size ?? size, heading: this.heading });
    }
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
    return {
      format: 1,
      ...rest,
      route: this.route,
      scenery: [...this.scenery, ...(rest.scenery ?? [])],
    };
  }
}
