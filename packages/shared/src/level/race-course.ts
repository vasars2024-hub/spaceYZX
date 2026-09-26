// Authoring race tracks (LevelDef.race) as a "turtle" that walks the racing line: every move
// adds the geometry under your feet AND the line node bot racers and the timing test drive to,
// so the line always matches the track. Headings are compass degrees (0 = north = -z,
// 90 = east = +x); positions are feet positions.
//
//   run(d)           flat walkway ahead          ramp(d, rise)    straight slope (≤ ~30°)
//   turn(deg)        change heading here         gap(d, rise)     jump a gap onto a platform
//   ledge(rise)      mantle up onto a step       rail(d, drop)    zip-rail over a drop
//   pad(d, rise)     launch pad to a platform    portal(...)      step through, come out there
//   gate()           numbered checkpoint here    finish()         the finish arch here
//   fuel()           a fuel cell here            mark(name)       remember this spot
// Risky shortcuts: `fork()` returns a second turtle from the same spot whose moves only add
// geometry (red floor chevrons, no line nodes); end it on a marked spot of the safe route.
import type { Vec3 } from '../math/vec3';
import { v3, add, sub, scale, len, normalize, cross, madd, UP } from '../math/vec3';
import type { Quat } from '../math/quat';
import { qFromAxisAngle, qFromBasis, qMul } from '../math/quat';
import { LevelBuilder } from './builder';
import type {
  BoxDef,
  LaunchPadDef,
  Material,
  PortalDef,
  RaceDef,
  RaceForkDef,
  RaceGateDef,
  RaceLineNode,
  RailDef,
  SpawnDef,
} from './types';

const DEG = Math.PI / 180;
/** gravity the launch pads are aimed with (MOVEMENT_DEFAULTS.gravity) */
const G = 20;
/** a zip-rail hangs this high over the feet at its ends (grab: jump under it) */
export const RAIL_HEIGHT = 2.7;

export interface CourseStyle {
  /** walkway surface */
  mat: Material;
  color: number;
  /** walkway thickness (deep = a solid ridge, thin = a plank bridge) */
  thick: number;
  width: number;
  /** a solid body under the walkway (a rock ridge, a trunk-like pillar), `depth` deep */
  base?: { mat: Material; color: number; depth: number; widen?: number };
}

export interface CourseTheme {
  path: CourseStyle;
  /** checkpoint gate posts and number boards (glowing) */
  gate: number;
  /** floor chevrons along the safe route */
  arrow: number;
  /** floor chevrons along risky shortcuts */
  risky: number;
  /** the finish arch */
  finish: number;
  /** launch pad springs / mushrooms */
  pad: { mat: Material; color: number };
  /** zip-rail anchor posts */
  post: { mat: Material; color: number };
}

/** Compass heading (deg) → horizontal unit direction. */
export const headingDir = (deg: number): Vec3 => v3(Math.sin(deg * DEG), 0, -Math.cos(deg * DEG));
/** Compass heading → the game's yawDeg (0 = facing -z, 90 = facing -x). */
export const headingYaw = (deg: number): number => -deg;

interface Seg {
  a: Vec3;
  b: Vec3;
  style: CourseStyle;
  extA: boolean;
  extB: boolean;
  risky: boolean;
  arrows: boolean;
}

/** Shared parts of a track: geometry, devices, gates (the main turtle and its forks). */
export class CourseParts {
  readonly b = new LevelBuilder();
  readonly segs: Seg[] = [];
  readonly rails: RailDef[] = [];
  readonly launchPads: LaunchPadDef[] = [];
  readonly portals: PortalDef[] = [];
  readonly fuelCells: Vec3[] = [];
  readonly checkpoints: RaceGateDef[] = [];
  finish: RaceGateDef | null = null;
  readonly killVolumes: { min: Vec3; max: Vec3 }[] = [];
  readonly forks: RaceForkDef[] = [];
  readonly marks = new Map<string, { pos: Vec3; heading: number }>();
  readonly theme: CourseTheme;
  constructor(theme: CourseTheme) {
    this.theme = theme;
  }
}

export class RaceCourse {
  pos: Vec3;
  heading: number;
  /** gates passed on the line so far */
  cp = 0;
  readonly line: RaceLineNode[] = [];
  style: CourseStyle;
  private last: Seg | null = null;
  private riskyLine: RaceLineNode[] | null;
  readonly parts: CourseParts;
  private readonly risky: boolean;

  constructor(parts: CourseParts, start: Vec3, heading: number, risky = false) {
    this.parts = parts;
    this.risky = risky;
    this.pos = { ...start };
    this.heading = heading;
    this.style = { ...parts.theme.path };
    this.riskyLine = risky ? [{ pos: { ...start }, cp: 0 }] : null;
    if (!risky) this.node(start);
  }

  static create(theme: CourseTheme, start: Vec3, heading: number): RaceCourse {
    return new RaceCourse(new CourseParts(theme), start, heading);
  }

  get b(): LevelBuilder {
    return this.parts.b;
  }

  get dir(): Vec3 {
    return headingDir(this.heading);
  }

  private get nodes(): RaceLineNode[] {
    return this.riskyLine ?? this.line;
  }

  private node(pos: Vec3, jump = false): void {
    const n: RaceLineNode = { pos: { ...pos }, cp: this.riskyLine ? this.forkCp : this.cp };
    if (jump) n.jump = true;
    this.nodes.push(n);
  }

  /** The node at the current position (added if the last one is elsewhere). */
  private here(): RaceLineNode {
    const n = this.nodes[this.nodes.length - 1];
    if (n && n.pos.x === this.pos.x && n.pos.y === this.pos.y && n.pos.z === this.pos.z) return n;
    this.node(this.pos);
    return this.nodes[this.nodes.length - 1];
  }

  /** Mark the current node as a take-off (the bot jumps here). */
  private takeOff(opts: { jet?: number; surge?: boolean } = {}): void {
    const n = this.here();
    n.jump = true;
    if (opts.jet) n.jet = opts.jet;
    if (opts.surge) n.surge = true;
  }

  /** Switch the gravity boots on here (risky wall-runs: the wall must be within reach). */
  mag(): this {
    this.here().mag = true;
    return this;
  }

  /** A node here: jump (off a wall you run on, or a ledge) toward the next move. */
  jumpHere(): this {
    this.takeOff();
    return this;
  }

  private forkCp = 0;

  /** Change the walkway style from here on. */
  with(style: Partial<CourseStyle>): this {
    this.style = { ...this.style, ...style };
    return this;
  }

  turn(deg: number): this {
    this.heading = (this.heading + deg + 360) % 360;
    return this;
  }

  face(heading: number): this {
    this.heading = heading;
    return this;
  }

  mark(name: string): this {
    this.parts.marks.set(name, { pos: { ...this.pos }, heading: this.heading });
    return this;
  }

  /** A walkway from here to `to` (continuing the last one: corners are closed). */
  walkTo(to: Vec3, arrows = true): this {
    const a = { ...this.pos };
    const b = { ...to };
    const flat = Math.abs(a.y - b.y) < 1e-6;
    const seg: Seg = {
      a,
      b,
      style: { ...this.style },
      extA: false,
      extB: flat,
      risky: this.risky,
      arrows,
    };
    const prev = this.last;
    if (flat && prev && prev.b.x === a.x && prev.b.y === a.y && prev.b.z === a.z) {
      const prevFlat = Math.abs(prev.a.y - prev.b.y) < 1e-6;
      // flat meets flat: both reach over the joint (no gap on the outside of a turn); a
      // slope and a flat meet exactly at the node (no lip to trip over)
      seg.extA = prevFlat;
      prev.extB = prevFlat;
    } else if (prev && !flat && prev.b.x === a.x && prev.b.y === a.y && prev.b.z === a.z)
      prev.extB = false;
    this.parts.segs.push(seg);
    this.last = seg;
    const d = sub(b, a);
    const h = v3(d.x, 0, d.z);
    if (len(h) > 1e-6) this.heading = (Math.atan2(h.x, -h.z) / DEG + 360) % 360;
    this.pos = b;
    this.node(b);
    return this;
  }

  /** Flat walkway `d` metres ahead. */
  run(d: number): this {
    return this.walkTo(madd(this.pos, this.dir, d));
  }

  /** Straight slope `d` metres ahead (horizontal), rising `rise`. */
  ramp(d: number, rise: number): this {
    return this.walkTo(add(madd(this.pos, this.dir, d), v3(0, rise, 0)));
  }

  /** Where `d` metres ahead and `side` metres to the right is (feet level + rise). */
  ahead(d: number, side = 0, rise = 0): Vec3 {
    const r = cross(this.dir, UP);
    return add(madd(madd(this.pos, this.dir, d), r, side), v3(0, rise, 0));
  }

  /** Break the walkway chain (the next walkway starts a new piece). */
  private cut(): void {
    this.last = null;
  }

  /**
   * Jump a gap: take off here (the walkway must end here), land `d` metres ahead (`rise`
   * higher) on a platform `landLen` long. Leaves you at the far end of the landing.
   */
  gap(
    d: number,
    rise = 0,
    landLen = 6,
    landWidth = this.style.width,
    how: { jet?: number; surge?: boolean } = {},
  ): this {
    this.takeOff(how);
    // the take-off edge is exactly here
    if (this.last) this.last.extB = false;
    this.cut();
    const edge = add(madd(this.pos, this.dir, d), v3(0, rise, 0));
    const heading = this.heading;
    const style = this.style;
    this.pos = edge;
    this.style = { ...style, width: landWidth };
    this.walkTo(madd(edge, headingDir(heading), landLen), false);
    this.style = style;
    return this;
  }

  /** A step up (≤ 1.2 m: a mantle) onto a platform `d` long. */
  ledge(rise: number, d = 4): this {
    this.cut();
    const top = add(this.pos, v3(0, rise, 0));
    this.pos = top;
    return this.walkTo(madd(top, this.dir, d));
  }

  /**
   * A zip-rail from above here, `d` metres ahead dropping `drop` (optionally bending through
   * `via` points, feet level), onto a landing `landLen` long. You jump under the start to grab.
   */
  rail(d: number, drop: number, landLen = 14, via: Vec3[] = []): this {
    const start = this.pos;
    const end = add(madd(start, this.dir, d), v3(0, -drop, 0));
    return this.railTo(end, landLen, via);
  }

  railTo(end: Vec3, landLen = 14, via: Vec3[] = []): this {
    const t = this.parts.theme;
    const start = { ...this.pos };
    const first = via[0] ?? end;
    const dir0 = normalize(v3(first.x - start.x, 0, first.z - start.z));
    const h = v3(0, RAIL_HEIGHT, 0);
    const pts = [add(madd(start, dir0, 1.2), h), ...via.map((p) => add(p, h)), add(end, h)];
    this.parts.rails.push({ points: pts });
    // anchor posts at both ends (beside the line, no collision)
    for (const [p, d] of [
      [pts[0], dir0],
      [pts[pts.length - 1], normalize(v3(end.x - first.x, 0, end.z - first.z))],
    ] as [Vec3, Vec3][]) {
      const side = cross(d, UP);
      for (const s of [-1, 1]) {
        const c = madd(p, side, s * 1.3);
        this.b.block(v3(c.x, c.y - RAIL_HEIGHT / 2 + 0.6, c.z), v3(0.35, RAIL_HEIGHT + 1.2, 0.35), {
          mat: t.post.mat,
          color: t.post.color,
          noCollide: true,
        });
      }
      this.b.block(v3(p.x, p.y + 0.55, p.z), v3(0.3, 0.3, 0.3), {
        ...rotY(d),
        mat: 'trim',
        color: t.gate,
        noCollide: true,
      });
    }
    this.takeOff();
    // the walkway goes on a little under the rail (a late jump still grabs it)
    if (this.last)
      this.parts.segs.push({
        ...this.last,
        a: { ...start },
        b: madd(start, dir0, 3),
        extA: true,
        extB: false,
        arrows: false,
      });
    for (const v of via) this.node(v);
    this.cut();
    const last = via[via.length - 1] ?? start;
    const hd = normalize(v3(end.x - last.x, 0, end.z - last.z));
    this.heading = (Math.atan2(hd.x, -hd.z) / DEG + 360) % 360;
    // the landing starts a little before the rail's end (you drop off it at speed)
    this.pos = madd(end, hd, -3);
    this.walkTo(madd(end, hd, landLen), false);
    return this;
  }

  /**
   * A launch pad here throwing you `d` metres ahead and `rise` up in `flightSec`, onto a
   * landing platform `landLen` long.
   */
  pad(d: number, rise: number, flightSec: number, landLen = 12): this {
    const t = this.parts.theme;
    const from = add(this.pos, v3(0, 0.9, 0));
    const to = add(madd(this.pos, this.dir, d), v3(0, rise + 0.9, 0));
    const T = flightSec;
    const vel = v3((to.x - from.x) / T, (to.y - from.y + 0.5 * G * T * T) / T, (to.z - from.z) / T);
    const p = this.pos;
    this.parts.launchPads.push({
      min: v3(p.x - 1.3, p.y - 0.2, p.z - 1.3),
      max: v3(p.x + 1.3, p.y + 1.6, p.z + 1.3),
      vel,
    });
    // the spring / mushroom: a cap you can see from afar (walk-through, no collision)
    this.b.block(v3(p.x, p.y + 0.12, p.z), v3(2.6, 0.24, 2.6), {
      ...rotY(this.dir),
      mat: t.pad.mat,
      color: t.pad.color,
      noCollide: true,
    });
    this.b.block(v3(p.x, p.y + 0.3, p.z), v3(1.2, 0.12, 1.2), {
      ...rotY(this.dir),
      mat: 'trim',
      color: t.gate,
      noCollide: true,
    });
    this.cut();
    const land = sub(to, v3(0, 0.9, 0));
    const heading = this.heading;
    // (the landing reaches back 3 m: you leave the pad from its near edge, a little early)
    this.pos = madd(land, headingDir(heading), -landLen / 2 - 3);
    this.walkTo(madd(land, headingDir(heading), landLen / 2), false);
    return this;
  }

  /**
   * A portal a step ahead: walk into it, come out at `exit` (feet) moving the same way (portals
   * keep your velocity and facing), onto a run-out `runOut` long.
   */
  portal(exit: Vec3, color: number, runOut = 8): this {
    const exitHeading = this.heading;
    const p = madd(this.pos, this.dir, 1.5);
    const thinX = Math.abs(this.dir.x) > Math.abs(this.dir.z);
    this.parts.portals.push({
      name: `portal-${this.parts.portals.length + 1}`,
      min: v3(p.x - (thinX ? 0.6 : 1.6), p.y, p.z - (thinX ? 1.6 : 0.6)),
      max: v3(p.x + (thinX ? 0.6 : 1.6), p.y + 3.2, p.z + (thinX ? 1.6 : 0.6)),
      exit: add(exit, v3(0, 0.95, 0)),
      color,
    });
    this.node(p);
    this.nodes[this.nodes.length - 1].portal = true;
    this.cut();
    this.heading = exitHeading;
    this.pos = madd(exit, headingDir(exitHeading), -2);
    return this.walkTo(madd(exit, headingDir(exitHeading), runOut), false);
  }

  /** A numbered checkpoint gate here (passing it counts); you respawn just past it. */
  gate(width = this.style.width): this {
    const gate = this.gateHere(width);
    this.parts.checkpoints.push(gate);
    this.gatePosts(width, this.parts.theme.gate, 4.2);
    this.cp++;
    return this;
  }

  /** The finish arch here. */
  finishHere(width = this.style.width): this {
    this.parts.finish = this.gateHere(width);
    this.gatePosts(width, this.parts.theme.finish, 5.5);
    this.cp++;
    return this;
  }

  private gateHere(width: number): RaceGateDef {
    const p = this.pos;
    const r = Math.max(width / 2 + 1.5, 3);
    const respawn = madd(p, this.dir, 2.5);
    return {
      min: v3(p.x - r, p.y - 1.5, p.z - r),
      max: v3(p.x + r, p.y + 6, p.z + r),
      respawn,
      yawDeg: headingYaw(this.heading),
    };
  }

  private gatePosts(width: number, color: number, height: number): void {
    const p = this.pos;
    const side = cross(this.dir, UP);
    const rot = rotY(this.dir);
    for (const s of [-1, 1]) {
      const c = madd(p, side, s * (width / 2 + 0.4));
      this.b.block(v3(c.x, c.y + height / 2, c.z), v3(0.5, height, 0.5), {
        ...rot,
        mat: 'trim',
        color,
        noCollide: true,
      });
    }
    this.b.block(v3(p.x, p.y + height + 0.3, p.z), v3(width + 1.3, 0.6, 0.5), {
      ...rot,
      mat: 'trim',
      color,
      noCollide: true,
    });
  }

  /** A decorative arch here (the start line): posts and a bar, no gate. */
  arch(color: number, width = this.style.width, height = 5): this {
    this.gatePosts(width, color, height);
    return this;
  }

  /** Every point of the racing line and of the risky shortcuts (scenery keeps clear of them). */
  allLines(): Vec3[][] {
    return [
      this.line.map((n) => n.pos),
      ...this.parts.forks.map((f) => f.riskyLine.map((n) => n.pos)),
    ];
  }

  /** A fuel cell here (floating at chest height). */
  fuel(): this {
    this.parts.fuelCells.push(add(this.pos, v3(0, 1.1, 0)));
    return this;
  }

  /**
   * A risky shortcut from a marked spot of the safe route: returns a turtle whose moves only add
   * geometry (and red chevrons). Finish it with `rejoin(mark)` on a later mark.
   */
  fork(from: string, name: string, safe: string, risky: string): RaceCourse {
    const at = this.at(from);
    const f = new RaceCourse(this.parts, at.pos, at.heading, true);
    f.style = { ...this.parts.theme.path };
    const i = this.line.findIndex((n) => n.pos.x === at.pos.x && n.pos.z === at.pos.z);
    const cp = i >= 0 ? this.line[i].cp : 0;
    f.forkCp = cp;
    f.riskyLine![0].cp = cp;
    f.forkInfo = { name, cp, safe, risky, riskyLine: f.riskyLine! };
    this.parts.forks.push(f.forkInfo);
    return f;
  }

  private forkInfo: RaceForkDef | null = null;

  /** End a risky shortcut on a marked spot of the safe route. */
  rejoin(mark: string): this {
    const m = this.parts.marks.get(mark);
    if (!m) throw new Error(`no mark ${mark}`);
    return this.walkTo(m.pos);
  }

  /** Remembered spot. */
  at(mark: string): { pos: Vec3; heading: number } {
    const m = this.parts.marks.get(mark);
    if (!m) throw new Error(`no mark ${mark}`);
    return m;
  }

  /** Falling in here counts as a fall (a river, a crevasse). */
  killVolume(min: Vec3, max: Vec3): this {
    this.parts.killVolumes.push({ min, max });
    return this;
  }

  /** The start grid: up to 8 slots in rows of 4 behind here, facing the heading. */
  grid(slots = 8, spacing = 2): SpawnDef[] {
    const side = cross(this.dir, UP);
    const out: SpawnDef[] = [];
    for (let i = 0; i < slots; i++) {
      const row = Math.floor(i / 4);
      const col = (i % 4) - 1.5;
      out.push({
        pos: madd(madd(this.pos, this.dir, -1.5 - row * 2.5), side, col * spacing),
        yawDeg: headingYaw(this.heading),
      });
    }
    return out;
  }

  /** Emit the walkway boxes and chevrons (call once, on the main turtle, at the end). */
  buildGeometry(): void {
    const t = this.parts.theme;
    for (const s of this.parts.segs) {
      addWalkway(this.b, s);
      if (s.arrows) addChevrons(this.b, s, s.risky ? t.risky : t.arrow);
    }
  }

  /** The race definition (after `buildGeometry`). */
  raceDef(opts: {
    parSec: number;
    start: { respawn: Vec3; yawDeg: number };
    grid: SpawnDef[];
    killY: number;
  }): RaceDef {
    const p = this.parts;
    if (!p.finish) throw new Error('race track without a finish');
    return {
      parSec: opts.parSec,
      start: opts.start,
      grid: opts.grid,
      checkpoints: p.checkpoints,
      finish: p.finish,
      killY: opts.killY,
      killVolumes: p.killVolumes,
      fuelCells: p.fuelCells,
      line: this.line,
      forks: p.forks,
    };
  }
}

/** A yaw-only rotation (local -z along `d`), as BoxDef fields. */
export const rotY = (d: Vec3): { q?: Quat } => {
  const h = normalize(v3(d.x, 0, d.z));
  if (Math.abs(h.z) > 0.99999 || Math.abs(h.x) > 0.99999) return {};
  return { q: qFromBasis(h, UP) };
};

const addWalkway = (b: LevelBuilder, s: Seg): void => {
  const d = sub(s.b, s.a);
  const L = len(d);
  if (L < 1e-6) return;
  const fwd = scale(d, 1 / L);
  const right = normalize(cross(fwd, UP), v3(1, 0, 0));
  const n = cross(right, fwd);
  const { width, thick, mat, color } = s.style;
  const ext = width / 2;
  const a = s.extA ? madd(s.a, fwd, -ext) : s.a;
  const bb = s.extB ? madd(s.b, fwd, ext) : s.b;
  const mid = scale(add(a, bb), 0.5);
  const len2 = len(sub(bb, a));
  const flatAxis =
    Math.abs(fwd.y) < 1e-6 && (Math.abs(fwd.x) > 0.99999 || Math.abs(fwd.z) > 0.99999);
  const box: BoxDef = {
    c: madd(mid, n, -thick / 2),
    h: v3(width / 2, thick / 2, len2 / 2),
    mat,
    color,
  };
  if (flatAxis) {
    // axis-aligned: store without a rotation (cheaper collision, exact edges)
    if (Math.abs(fwd.x) > 0.5) box.h = v3(len2 / 2, thick / 2, width / 2);
  } else box.q = qFromBasis(fwd, n);
  b.boxes.push(box);
  const base = s.style.base;
  if (base) {
    const w2 = width + (base.widen ?? 0);
    const under: BoxDef = {
      ...box,
      c: madd(mid, n, -thick - base.depth / 2),
      h: v3(w2 / 2, base.depth / 2, len2 / 2),
      mat: base.mat,
      color: base.color,
    };
    if (flatAxis && Math.abs(fwd.x) > 0.5) under.h = v3(len2 / 2, base.depth / 2, w2 / 2);
    b.boxes.push(under);
  }
};

/** Bright floor chevrons every ~22 m pointing along the walkway. */
const addChevrons = (b: LevelBuilder, s: Seg, color: number): void => {
  const d = sub(s.b, s.a);
  const L = len(d);
  if (L < 9) return;
  const fwd = scale(d, 1 / L);
  const right = normalize(cross(fwd, UP), v3(1, 0, 0));
  const n = cross(right, fwd);
  const base = qFromBasis(fwd, n);
  const count = Math.max(1, Math.floor(L / 22));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const c = madd(madd(s.a, d, t), n, 0.04);
    for (const side of [-1, 1]) {
      const q = qMul(base, qFromAxisAngle(v3(0, 1, 0), side * 40 * DEG));
      const off = madd(c, right, side * 0.42);
      b.boxes.push({
        c: madd(off, fwd, -0.35),
        h: v3(0.12, 0.04, 0.7),
        q,
        // (painted, not 'trim': a strip light each would bake ~200 lights and glow sprites)
        mat: 'sand',
        color,
        noCollide: true,
      });
    }
  }
};
