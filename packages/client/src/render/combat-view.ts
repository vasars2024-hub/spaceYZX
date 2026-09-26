// Visuals for combat: Boomerangs (+ glowing trails), grenades, public lines (Wind-up aim,
// Laser warning, recall telegraph), laser beams, throw preview and hit/kill effects.
import { particleDensity } from './perf';
import { effects } from './effects';
import * as THREE from 'three';
import type {
  BoomerangState,
  GrenadeState,
  PowerupPickup,
  Level,
  Vec3,
  PathPrediction,
  SimEvent,
} from '@space-yz/shared';
import {
  Phase,
  Powerup,
  raycast,
  qForward,
  madd,
  sub,
  len,
  normalize,
  cross,
  v3,
} from '@space-yz/shared';
import { TEAM_COLORS } from './players';

/** how far a fully tilted Quick Throw banks (radians) */
const BANK_RAD = 0.7;
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const bankAxis = new THREE.Vector3();
const spinQ = new THREE.Quaternion();
const WHITE_C = new THREE.Color(0xffffff);

const tv = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z);

/** Soft round dot for the throw preview (plain points draw as squares). */
const dotTexture = (): THREE.Texture => {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(c);
};

/** Preview dots closer than this to the camera are skipped (they'd fill the screen). */
const PREVIEW_NEAR = 1.6;
const PREVIEW_WHITE = 0xffffff;
const PREVIEW_MATE = 0xff9a3d;
const PREVIEW_ENEMY = 0xff2e44;

/** A V-shaped low-poly boomerang. */
const boomerangGeometry = (): THREE.BufferGeometry => {
  const a = new THREE.BoxGeometry(0.34, 0.035, 0.09);
  a.translate(0.15, 0, 0);
  a.rotateY(0.55);
  const b = new THREE.BoxGeometry(0.34, 0.035, 0.09);
  b.translate(-0.15, 0, 0);
  b.rotateY(-0.55);
  const merged = new THREE.BufferGeometry();
  const pa = a.toNonIndexed().attributes.position.array as Float32Array;
  const pb = b.toNonIndexed().attributes.position.array as Float32Array;
  const pos = new Float32Array(pa.length + pb.length);
  pos.set(pa, 0);
  pos.set(pb, pa.length);
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.computeVertexNormals();
  return merged;
};

export const BOOMERANG_GEO = boomerangGeometry();

/** Power-up colours: Freeze is icy blue, Double boomerang is gold. */
export const POWERUP_COLORS: Record<1 | 2, number> = { 1: 0x8fe6ff, 2: 0xffc44d };

/**
 * A floating power-up: Freeze = an icy-blue crystal, Double = two small boomerangs orbiting a
 * glowing core; a glow ring on the floor below it.
 */
class PowerupModel {
  group = new THREE.Group();
  private spin = new THREE.Group();
  private ring: THREE.Mesh;
  private halo: THREE.Mesh;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  constructor(
    readonly kind: 1 | 2,
    pos: Vec3,
    floorY: number | null,
  ) {
    const color = POWERUP_COLORS[kind];
    const mat = (c: number, opacity = 1, additive = false) => {
      const m = new THREE.MeshBasicMaterial({
        color: c,
        transparent: opacity < 1 || additive,
        opacity,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: !additive,
        side: additive ? THREE.DoubleSide : THREE.FrontSide,
      });
      this.mats.push(m);
      return m;
    };
    const geo = <G extends THREE.BufferGeometry>(g: G): G => {
      this.geos.push(g);
      return g;
    };
    this.group.position.set(pos.x, pos.y, pos.z);
    this.group.add(this.spin);
    if (kind === Powerup.Freeze) {
      const crystal = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.26, 0)), mat(color));
      crystal.scale.set(1, 1.7, 1);
      this.spin.add(crystal);
      const shell = new THREE.Mesh(
        geo(new THREE.OctahedronGeometry(0.34, 0)),
        mat(0xe8fbff, 0.35, true),
      );
      shell.scale.set(1, 1.7, 1);
      this.spin.add(shell);
      // small shards around it
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.07, 0)), mat(0xd6f7ff));
        const a = (i / 3) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.45, (i - 1) * 0.12, Math.sin(a) * 0.45);
        s.scale.set(1, 2, 1);
        this.spin.add(s);
      }
    } else {
      const core = new THREE.Mesh(geo(new THREE.IcosahedronGeometry(0.12, 1)), mat(0xfff1c2));
      this.spin.add(core);
      for (let i = 0; i < 2; i++) {
        const b = new THREE.Mesh(BOOMERANG_GEO, mat(color));
        b.scale.setScalar(1.3);
        b.position.set(i === 0 ? 0.36 : -0.36, 0, 0);
        b.rotation.set(0, i * Math.PI, 0.35);
        this.spin.add(b);
      }
    }
    this.halo = new THREE.Mesh(geo(new THREE.SphereGeometry(0.55, 16, 12)), mat(color, 0.12, true));
    this.group.add(this.halo);
    // glow ring on the floor below (or just under it if there's no floor close by)
    this.ring = new THREE.Mesh(geo(new THREE.RingGeometry(0.55, 0.8, 40)), mat(color, 0.6, true));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = floorY !== null ? floorY + 0.03 - pos.y : -0.9;
    this.group.add(this.ring);
  }
  update(time: number): void {
    this.spin.rotation.y = time * (this.kind === Powerup.Double ? 3.2 : 1.6);
    this.spin.position.y = Math.sin(time * 2.2) * 0.12;
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    this.ring.scale.setScalar(1 + pulse * 0.15);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * pulse;
    this.halo.scale.setScalar(0.9 + 0.2 * pulse);
  }
  dispose(): void {
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
  }
}

class Trail {
  points: THREE.Vector3[] = [];
  geo = new THREE.BufferGeometry();
  mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  constructor(
    private max: number,
    color: number,
  ) {
    this.pos = new Float32Array(max * 2 * 3);
    this.col = new Float32Array(max * 2 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const idx: number[] = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.setColor(color);
  }
  color = new THREE.Color();
  setColor(c: number): void {
    this.color.set(c);
  }
  setOpacity(o: number): void {
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = o;
  }
  push(p: THREE.Vector3): void {
    const last = this.points[0];
    if (last && last.distanceToSquared(p) < 0.0004) return;
    this.points.unshift(p.clone());
    if (this.points.length > this.max) this.points.pop();
  }
  clear(): void {
    this.points = [];
    this.geo.setDrawRange(0, 0);
  }
  update(camPos: THREE.Vector3, width: number): void {
    const n = this.points.length;
    if (n < 2) {
      this.geo.setDrawRange(0, 0);
      return;
    }
    const side = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = this.points[i];
      const q = this.points[Math.min(n - 1, i + 1)];
      const r = this.points[Math.max(0, i - 1)];
      dir.subVectors(r, q).normalize();
      toCam.subVectors(camPos, p).normalize();
      side.crossVectors(dir, toCam).normalize();
      const f = 1 - i / n;
      const w = width * f;
      this.pos[i * 6] = p.x + side.x * w;
      this.pos[i * 6 + 1] = p.y + side.y * w;
      this.pos[i * 6 + 2] = p.z + side.z * w;
      this.pos[i * 6 + 3] = p.x - side.x * w;
      this.pos[i * 6 + 4] = p.y - side.y * w;
      this.pos[i * 6 + 5] = p.z - side.z * w;
      const k = f * f;
      for (let j = 0; j < 2; j++) {
        this.col[i * 6 + j * 3] = this.color.r * k;
        this.col[i * 6 + j * 3 + 1] = this.color.g * k;
        this.col[i * 6 + j * 3 + 2] = this.color.b * k;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }
  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** A thick glowing line segment (stretched cylinder), reusable. */
class Beam {
  mesh: THREE.Mesh;
  constructor(radius: number, color: number, opacity = 1) {
    const g = new THREE.CylinderGeometry(radius, radius, 1, 6, 1, true);
    g.translate(0, 0.5, 0);
    g.rotateX(Math.PI / 2); // along +Z
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }
  set(from: Vec3, to: Vec3, color?: number, opacity?: number): void {
    const a = tv(from);
    const b = tv(to);
    const l = a.distanceTo(b);
    if (l < 1e-3) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.position.copy(a);
    this.mesh.lookAt(b);
    this.mesh.scale.set(1, 1, l);
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    if (color !== undefined) mat.color.set(color);
    if (opacity !== undefined) mat.opacity = opacity;
    this.mesh.visible = true;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

interface Fragment {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

/** Instanced fragments for kill shatters and hit sparks. */
class Fragments {
  mesh: THREE.InstancedMesh;
  private list: Fragment[] = [];
  private dummy = new THREE.Object3D();
  constructor(private cap = 600) {
    const g = new THREE.TetrahedronGeometry(0.12);
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(g, m, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  }
  burst(
    at: Vec3,
    color: number,
    count: number,
    speed: number,
    life: number,
    scale: number,
    gravity: Vec3,
  ): void {
    const n = Math.max(1, Math.round(count * particleDensity));
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.cap) this.list.shift();
      const d = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.3,
        Math.random() - 0.5,
      ).normalize();
      this.list.push({
        pos: tv(at).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.4,
            Math.random() * 1.2 - 0.3,
            (Math.random() - 0.5) * 0.4,
          ),
        ),
        vel: d.multiplyScalar(speed * (0.4 + Math.random() * 0.8)),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        life,
        maxLife: life,
        scale: scale * (0.6 + Math.random() * 0.8),
        color: new THREE.Color(color),
      });
    }
    this.gravity = tv(gravity);
  }
  private gravity = new THREE.Vector3(0, -9, 0);
  update(dt: number): void {
    let n = 0;
    this.list = this.list.filter((f) => (f.life -= dt) > 0);
    for (const f of this.list) {
      f.vel.addScaledVector(this.gravity, dt * 0.5);
      f.pos.addScaledVector(f.vel, dt);
      f.rot.x += f.spin.x * dt;
      f.rot.y += f.spin.y * dt;
      const k = f.life / f.maxLife;
      this.dummy.position.copy(f.pos);
      this.dummy.rotation.copy(f.rot);
      this.dummy.scale.setScalar(f.scale * Math.min(1, k * 2));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, f.color.clone().multiplyScalar(0.6 + k));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export interface CombatViewInput {
  boomerangs: BoomerangState[];
  grenades: GrenadeState[];
  /** Double-boomerang twins in flight */
  twins?: BoomerangState[];
  /** power-ups waiting to be picked up */
  powerups?: PowerupPickup[];
  teamOf: (id: number) => 0 | 1 | undefined;
  /** public lines: players winding up / warning a laser (eye + view) */
  windups: {
    id: number;
    team: 0 | 1;
    eye: Vec3;
    view: { x: number; y: number; z: number; w: number };
    full: boolean;
  }[];
  laserWarns: {
    id: number;
    team: 0 | 1;
    eye: Vec3;
    view: { x: number; y: number; z: number; w: number };
  }[];
  localId: number;
  camPos: Vec3;
  pullRadius: number;
}

export class CombatView {
  group = new THREE.Group();
  private meshes = new Map<number, THREE.Mesh>();
  private trails = new Map<number, Trail>();
  private grenadeMeshes = new Map<number, THREE.Mesh>();
  private twinMeshes = new Map<number, THREE.Mesh>();
  private twinTrails = new Map<number, Trail>();
  private powerupModels = new Map<number, PowerupModel>();
  private pullShells = new Map<number, THREE.Mesh>();
  private windupBeams = new Map<number, Beam>();
  private warnBeams = new Map<number, Beam>();
  private flashes: { beam: Beam; life: number; max: number }[] = [];
  /** CS mode: bullet holes on the walls (oldest removed first) */
  private holes: THREE.Mesh[] = [];
  private holeGeo = new THREE.CircleGeometry(0.035, 6);
  private holeMat = new THREE.MeshBasicMaterial({
    color: 0x0b0d10,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  private recallLines: { id: number; beam: Beam; life: number }[] = [];
  fragments = new Fragments();
  private previewPoints: THREE.Points;
  private previewMarker: THREE.Mesh;
  /** ring on the enemy the previewed throw would hit */
  private targetMarker: THREE.Mesh;
  /** small diamond where the previewed throw bounces off a wall */
  private bounceMarker: THREE.Mesh;
  private time = 0;

  constructor(private level: Level) {
    this.group.add(this.fragments.mesh);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
    this.previewPoints = new THREE.Points(
      pg,
      new THREE.PointsMaterial({
        color: PREVIEW_WHITE,
        size: 0.12,
        map: dotTexture(),
        alphaTest: 0.05,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    this.previewPoints.frustumCulled = false;
    this.previewPoints.visible = false;
    this.group.add(this.previewPoints);
    this.previewMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.28, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.previewMarker.visible = false;
    this.group.add(this.previewMarker);
    this.targetMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 32),
      new THREE.MeshBasicMaterial({
        color: PREVIEW_ENEMY,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.targetMarker.renderOrder = 10;
    this.targetMarker.visible = false;
    this.group.add(this.targetMarker);
    this.bounceMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.2, 4),
      new THREE.MeshBasicMaterial({
        color: 0xffe45c,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    this.bounceMarker.visible = false;
    this.group.add(this.bounceMarker);
  }

  update(input: CombatViewInput, dt: number): void {
    this.time += dt;
    const cam = tv(input.camPos);
    // teammates' effects fade (Effects setting): what's aimed at you stays at full strength
    const myTeam = input.teamOf(input.localId);
    const fxFor = (team: 0 | 1 | undefined, id: number): number =>
      team !== undefined && team === myTeam && id !== input.localId ? effects.mateFx : 1;
    // ---- Boomerangs ----
    const seen = new Set<number>();
    for (const b of input.boomerangs) {
      seen.add(b.id);
      const team = input.teamOf(b.controller) ?? 0;
      let mesh = this.meshes.get(b.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          BOOMERANG_GEO,
          new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team] }),
        );
        this.meshes.set(b.id, mesh);
        this.group.add(mesh);
        const trail = new Trail(22, TEAM_COLORS[team]);
        this.trails.set(b.id, trail);
        this.group.add(trail.mesh);
      }
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(TEAM_COLORS[team]);
      // the explosive throw glows hot and pulses, so everyone sees it coming
      const hot = b.explosive && b.phase !== Phase.Held;
      if (hot) mat.color.set(0xff5a1f).lerp(WHITE_C, 0.35 + 0.35 * Math.sin(this.time * 24));
      // held Boomerangs are drawn in hand: yours by the viewmodel, others' by their robot
      const held = b.phase === Phase.Held;
      mesh.visible = !held && b.phase !== Phase.RecallTelegraph;
      mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
      const flying =
        b.phase === Phase.Out ||
        b.phase === Phase.Return ||
        b.phase === Phase.Deflected ||
        b.phase === Phase.Recall;
      if (flying) {
        // spins flat, banked toward the side it's tilting (flick the mouse in flight)
        const u = mesh.userData as { spin?: number; bank?: number };
        u.spin = ((u.spin ?? 0) + dt * (b.windup ? 60 : 40)) % (Math.PI * 2);
        const want = b.phase === Phase.Out ? b.curve * BANK_RAD : 0;
        u.bank = (u.bank ?? 0) + (want - (u.bank ?? 0)) * Math.min(1, dt * 14);
        bankAxis.set(b.vel.x, 0, b.vel.z);
        if (bankAxis.lengthSq() < 1e-6) bankAxis.set(0, 0, -1);
        bankAxis.normalize();
        mesh.quaternion
          .setFromAxisAngle(bankAxis, u.bank)
          .multiply(spinQ.setFromAxisAngle(UP_AXIS, u.spin));
      } else if (b.phase === Phase.Dropped) {
        mesh.rotation.set(0, this.time * 1.5, 0);
        mesh.scale.setScalar(1 + Math.sin(this.time * 6) * 0.08);
      } else mesh.scale.setScalar(1);
      const trail = this.trails.get(b.id)!;
      trail.setColor(hot ? 0xff7a2e : TEAM_COLORS[team]);
      if (hot) mesh.scale.setScalar(1.25);
      else if (b.phase !== Phase.Dropped) mesh.scale.setScalar(1);
      trail.setOpacity(fxFor(input.teamOf(b.controller), b.controller));
      // far-away trails are just noise
      if (flying && mesh.position.distanceTo(cam) <= effects.trailRange) trail.push(mesh.position);
      else trail.clear();
      trail.update(cam, b.windup ? 0.12 : 0.08);
    }
    for (const [id, m] of this.meshes)
      if (!seen.has(id)) {
        this.group.remove(m);
        (m.material as THREE.Material).dispose();
        this.meshes.delete(id);
        const t = this.trails.get(id);
        if (t) {
          this.group.remove(t.mesh);
          t.dispose();
          this.trails.delete(id);
        }
      }

    // ---- Double-boomerang twins: like a Boomerang, with a paler, longer, thinner trail ----
    const tseen = new Set<number>();
    for (const t of input.twins ?? []) {
      tseen.add(t.id);
      const team = input.teamOf(t.controller) ?? 0;
      const col = new THREE.Color(TEAM_COLORS[team]).lerp(new THREE.Color(0xffffff), 0.45);
      let mesh = this.twinMeshes.get(t.id);
      if (!mesh) {
        mesh = new THREE.Mesh(BOOMERANG_GEO, new THREE.MeshBasicMaterial({ color: col }));
        this.twinMeshes.set(t.id, mesh);
        this.group.add(mesh);
        const trail = new Trail(30, col.getHex());
        this.twinTrails.set(t.id, trail);
        this.group.add(trail.mesh);
      }
      mesh.position.set(t.pos.x, t.pos.y, t.pos.z);
      mesh.rotation.y -= dt * 40; // spins the other way round
      const trail = this.twinTrails.get(t.id)!;
      trail.setOpacity(fxFor(input.teamOf(t.controller), t.controller));
      if (mesh.position.distanceTo(cam) <= effects.trailRange) trail.push(mesh.position);
      else trail.clear();
      trail.update(cam, 0.055);
    }
    for (const [id, m] of this.twinMeshes)
      if (!tseen.has(id)) {
        this.group.remove(m);
        (m.material as THREE.Material).dispose();
        this.twinMeshes.delete(id);
        const t = this.twinTrails.get(id);
        if (t) {
          this.group.remove(t.mesh);
          t.dispose();
          this.twinTrails.delete(id);
        }
      }

    // ---- power-ups floating in the middle of the map ----
    const pseen = new Set<number>();
    for (const u of input.powerups ?? []) {
      pseen.add(u.id);
      let model = this.powerupModels.get(u.id);
      if (!model) {
        const down = raycast(this.level, u.pos, v3(0, -1, 0), 6);
        model = new PowerupModel(u.kind, u.pos, down ? down.point.y : null);
        this.powerupModels.set(u.id, model);
        this.group.add(model.group);
      }
      model.update(this.time + u.id * 0.37);
    }
    for (const [id, m] of this.powerupModels)
      if (!pseen.has(id)) {
        this.group.remove(m.group);
        m.dispose();
        this.powerupModels.delete(id);
      }

    // ---- grenades ----
    const gseen = new Set<number>();
    for (const g of input.grenades) {
      gseen.add(g.id);
      let m = this.grenadeMeshes.get(g.id);
      if (!m) {
        m = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.2, 0),
          new THREE.MeshBasicMaterial({ color: 0xc08bff }),
        );
        this.grenadeMeshes.set(g.id, m);
        this.group.add(m);
      }
      m.position.set(g.pos.x, g.pos.y, g.pos.z);
      m.rotation.x += dt * 5;
      let shell = this.pullShells.get(g.id);
      if (g.phase === 1) {
        if (!shell) {
          shell = new THREE.Mesh(
            new THREE.SphereGeometry(1, 20, 14),
            new THREE.MeshBasicMaterial({
              color: 0xa46bff,
              transparent: true,
              opacity: 0.12,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              side: THREE.DoubleSide,
            }),
          );
          this.pullShells.set(g.id, shell);
          this.group.add(shell);
        }
        shell.position.copy(m.position);
        const pulse = 0.85 + 0.15 * Math.sin(this.time * 18);
        shell.scale.setScalar(input.pullRadius * pulse);
      }
    }
    for (const [id, m] of this.grenadeMeshes)
      if (!gseen.has(id)) {
        this.group.remove(m);
        m.geometry.dispose();
        this.grenadeMeshes.delete(id);
        const s = this.pullShells.get(id);
        if (s) {
          this.group.remove(s);
          s.geometry.dispose();
          this.pullShells.delete(id);
        }
      }

    // ---- public Wind-up lines ----
    const wseen = new Set<number>();
    for (const w of input.windups) {
      wseen.add(w.id);
      let beam = this.windupBeams.get(w.id);
      if (!beam) {
        beam = new Beam(0.025, TEAM_COLORS[w.team], 0.8);
        this.windupBeams.set(w.id, beam);
        this.group.add(beam.mesh);
      }
      const dir = qForward(w.view);
      const hit = raycast(this.level, w.eye, dir, 150);
      const end = hit ? hit.point : madd(w.eye, dir, 150);
      const start = madd(w.eye, dir, w.id === input.localId ? 0.8 : 0.3);
      beam.set(
        start,
        end,
        TEAM_COLORS[w.team],
        (w.full ? 0.95 : 0.35 + 0.25 * Math.sin(this.time * 20)) * fxFor(w.team, w.id),
      );
    }
    for (const [id, b] of this.windupBeams)
      if (!wseen.has(id)) {
        this.group.remove(b.mesh);
        b.dispose();
        this.windupBeams.delete(id);
      }

    // ---- Laser warning lines ----
    const lseen = new Set<number>();
    for (const w of input.laserWarns) {
      lseen.add(w.id);
      let beam = this.warnBeams.get(w.id);
      if (!beam) {
        beam = new Beam(0.012, 0xff3b4f, 0.7);
        this.warnBeams.set(w.id, beam);
        this.group.add(beam.mesh);
      }
      const dir = qForward(w.view);
      const hit = raycast(this.level, w.eye, dir, 200);
      beam.set(
        madd(w.eye, dir, 0.5),
        hit ? hit.point : madd(w.eye, dir, 200),
        undefined,
        0.7 * fxFor(w.team, w.id),
      );
    }
    for (const [id, b] of this.warnBeams)
      if (!lseen.has(id)) {
        this.group.remove(b.mesh);
        b.dispose();
        this.warnBeams.delete(id);
      }

    // ---- transient beams ----
    this.flashes = this.flashes.filter((f) => {
      f.life -= dt;
      const mat = f.beam.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, f.life / f.max);
      if (f.life <= 0) {
        this.group.remove(f.beam.mesh);
        f.beam.dispose();
        return false;
      }
      return true;
    });
    this.recallLines = this.recallLines.filter((r) => {
      r.life -= dt;
      const b = input.boomerangs.find((bb) => bb.id === r.id);
      const active = b && (b.phase === Phase.RecallTelegraph || b.phase === Phase.Recall);
      if (!active || r.life <= 0) {
        this.group.remove(r.beam.mesh);
        r.beam.dispose();
        return false;
      }
      return true;
    });

    this.fragments.update(dt);
  }

  /**
   * React to sim events with one-shot visuals. `muzzleOf`: where a player's gun barrel is (for
   * CS mode tracers; they start at the eye otherwise).
   */
  onEvents(
    events: SimEvent[],
    teamOf: (id: number) => 0 | 1 | undefined,
    gravity: Vec3,
    muzzleOf?: (player: number) => Vec3 | null,
  ): void {
    for (const e of events) {
      if (e.type === 'gunFire') {
        this.gunShot(muzzleOf?.(e.player) ?? e.from, e.to, e.hit < 0 ? e.normal : null, gravity);
        continue;
      }
      if (e.type === 'laserFire') {
        const beam = new Beam(0.03, 0xff5a6a, 1);
        beam.set(e.from, e.to);
        this.group.add(beam.mesh);
        this.flashes.push({ beam, life: 0.12, max: 0.12 });
        this.fragments.burst(e.to, 0xff8090, 5, 3, 0.25, 0.4, gravity);
      } else if (e.type === 'recallStart') {
        const beam = new Beam(
          e.lethal ? 0.05 : 0.02,
          e.lethal ? 0xffe0e0 : 0x8899aa,
          e.lethal ? 0.95 : 0.35,
        );
        beam.set(e.from, e.to);
        this.group.add(beam.mesh);
        this.recallLines.push({ id: e.boomerang, beam, life: 2 });
      } else if (e.type === 'kill') {
        const team = teamOf(e.victim) ?? 0;
        this.fragments.burst(e.pos, TEAM_COLORS[team], 34, 7, 1.6, 1, gravity);
      } else if (e.type === 'hit') {
        this.fragments.burst(e.pos, e.head ? 0xffffff : 0xffd0a0, 6, 4, 0.3, 0.35, gravity);
      } else if (
        e.type === 'wallHit' ||
        e.type === 'wallBounce' ||
        e.type === 'clash' ||
        e.type === 'deflect'
      ) {
        this.fragments.burst(e.pos, 0xfff2c0, 8, 5, 0.35, 0.3, gravity);
      } else if (e.type === 'shieldBreak') {
        this.fragments.burst(e.pos, 0x9fe4ff, 26, 6, 0.55, 0.45, gravity);
      } else if (e.type === 'blast') {
        this.fragments.burst(e.pos, 0xff7a2e, 40, 11, 0.9, 0.8, gravity);
        this.fragments.burst(e.pos, 0xffe45c, 20, 6, 0.6, 0.5, gravity);
      } else if (e.type === 'grenadePop') {
        this.fragments.burst(e.pos, 0xc08bff, 30, 9, 0.8, 0.7, gravity);
      } else if (e.type === 'powerupPickup' || e.type === 'powerupSpawn') {
        this.fragments.burst(e.pos, POWERUP_COLORS[e.kind], 22, 5, 0.7, 0.45, gravity);
      } else if (e.type === 'freeze') {
        // ice shards off the frozen player
        this.fragments.burst(e.pos, 0xbfefff, 16, 4, 0.6, 0.4, gravity);
      } else if (e.type === 'twinBounce' || e.type === 'twinEnd') {
        this.fragments.burst(
          e.pos,
          0xfff6d8,
          e.type === 'twinEnd' ? 10 : 7,
          5,
          0.35,
          0.28,
          gravity,
        );
      }
    }
  }

  /** A bullet: a short-lived tracer, and dust + a hole where it hit the level. */
  private gunShot(from: Vec3, to: Vec3, wallNormal: Vec3 | null, gravity: Vec3): void {
    const d = sub(to, from);
    const l = len(d);
    if (l > 1) {
      // a thin streak: starts a little past the barrel, ends at the impact
      const beam = new Beam(0.009, 0xfff0b8, 0.7);
      beam.set(madd(from, d, Math.min(0.5, 0.4 / l)), to);
      this.group.add(beam.mesh);
      this.flashes.push({ beam, life: 0.06, max: 0.06 });
    }
    if (!wallNormal) return;
    this.fragments.burst(to, 0xb8ad96, 4, 2.5, 0.12, 0.25, gravity);
    const hole = new THREE.Mesh(this.holeGeo, this.holeMat);
    const n = tv(wallNormal);
    hole.position.copy(tv(to)).addScaledVector(n, 0.01);
    hole.lookAt(hole.position.clone().add(n));
    this.group.add(hole);
    this.holes.push(hole);
    while (this.holes.length > 80) this.group.remove(this.holes.shift()!);
  }

  /**
   * Private throw preview (only the thrower sees it). White normally, orange when a teammate is
   * on the path, red with a ring on the target when it would hit an enemy.
   */
  setPreview(pred: PathPrediction | null, opacity: number, camPos: Vec3): void {
    if (!pred) {
      this.previewPoints.visible = false;
      this.previewMarker.visible = false;
      this.targetMarker.visible = false;
      this.bounceMarker.visible = false;
      return;
    }
    if (pred.bouncePoint) {
      this.bounceMarker.visible = true;
      this.bounceMarker.position.set(pred.bouncePoint.x, pred.bouncePoint.y, pred.bouncePoint.z);
      this.bounceMarker.lookAt(tv(camPos));
    } else this.bounceMarker.visible = false;
    const attr = this.previewPoints.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    let n = 0;
    for (let i = 1; i < pred.points.length && n < 400; i += 2) {
      const p = pred.points[i];
      if (len(sub(p, camPos)) < PREVIEW_NEAR) continue;
      arr[n * 3] = p.x;
      arr[n * 3 + 1] = p.y;
      arr[n * 3 + 2] = p.z;
      n++;
    }
    attr.needsUpdate = true;
    this.previewPoints.geometry.setDrawRange(0, n);
    const mat = this.previewPoints.material as THREE.PointsMaterial;
    mat.opacity = opacity;
    const hit = pred.enemyHit;
    mat.color.set(
      hit ? PREVIEW_ENEMY : pred.teammatesOnPath.length > 0 ? PREVIEW_MATE : PREVIEW_WHITE,
    );
    this.previewPoints.visible = n > 0;
    if (pred.wallPoint) {
      this.previewMarker.visible = true;
      this.previewMarker.position.set(pred.wallPoint.x, pred.wallPoint.y, pred.wallPoint.z);
      const last = pred.points[pred.points.length - 2] ?? pred.wallPoint;
      const d = normalize(sub(pred.wallPoint, last));
      this.previewMarker.lookAt(this.previewMarker.position.clone().sub(tv(d)));
    } else this.previewMarker.visible = false;
    if (hit) {
      this.targetMarker.visible = true;
      this.targetMarker.position.set(hit.point.x, hit.point.y, hit.point.z);
      this.targetMarker.lookAt(tv(camPos));
      this.targetMarker.scale.setScalar(hit.head ? 0.7 : 1 + 0.08 * Math.sin(this.time * 12));
    } else this.targetMarker.visible = false;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        if (o.geometry !== BOOMERANG_GEO) o.geometry.dispose();
      }
    });
    this.fragments.dispose();
    for (const m of this.powerupModels.values()) m.dispose();
    for (const t of this.twinTrails.values()) t.dispose();
    this.holeGeo.dispose();
    this.holeMat.dispose();
    void cross;
    void len;
  }
}
