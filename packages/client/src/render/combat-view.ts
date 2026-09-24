// Visuals for combat: Boomerangs (+ glowing trails), grenades, public lines (Wind-up aim,
// Laser warning, recall telegraph), laser beams, throw preview and hit/kill effects.
import { particleDensity } from './perf';
import * as THREE from 'three';
import type {
  BoomerangState,
  GrenadeState,
  Level,
  Vec3,
  PathPrediction,
  SimEvent,
} from '@space-yz/shared';
import { Phase, raycast, qForward, madd, sub, len, normalize, cross } from '@space-yz/shared';
import { TEAM_COLORS } from './players';

const tv = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z);

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
  teamOf: (id: number) => 0 | 1 | undefined;
  /** public lines: players winding up / warning a laser (eye + view) */
  windups: {
    id: number;
    team: 0 | 1;
    eye: Vec3;
    view: { x: number; y: number; z: number; w: number };
    full: boolean;
  }[];
  laserWarns: { id: number; eye: Vec3; view: { x: number; y: number; z: number; w: number } }[];
  localId: number;
  camPos: Vec3;
  pullRadius: number;
}

export class CombatView {
  group = new THREE.Group();
  private meshes = new Map<number, THREE.Mesh>();
  private trails = new Map<number, Trail>();
  private grenadeMeshes = new Map<number, THREE.Mesh>();
  private pullShells = new Map<number, THREE.Mesh>();
  private windupBeams = new Map<number, Beam>();
  private warnBeams = new Map<number, Beam>();
  private flashes: { beam: Beam; life: number; max: number }[] = [];
  private recallLines: { id: number; beam: Beam; life: number }[] = [];
  fragments = new Fragments();
  private previewPoints: THREE.Points;
  private previewMarker: THREE.Mesh;
  private time = 0;

  constructor(private level: Level) {
    this.group.add(this.fragments.mesh);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
    this.previewPoints = new THREE.Points(
      pg,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.09,
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
  }

  update(input: CombatViewInput, dt: number): void {
    this.time += dt;
    const cam = tv(input.camPos);
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
      // your own held Boomerang is drawn by the viewmodel
      const heldLocal = b.phase === Phase.Held && b.owner === input.localId;
      mesh.visible = !heldLocal && b.phase !== Phase.RecallTelegraph;
      mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
      const flying =
        b.phase === Phase.Out ||
        b.phase === Phase.Return ||
        b.phase === Phase.Deflected ||
        b.phase === Phase.Recall;
      if (flying) mesh.rotation.y += dt * (b.windup ? 60 : 40);
      else if (b.phase === Phase.Dropped) {
        mesh.rotation.set(0, this.time * 1.5, 0);
        mesh.scale.setScalar(1 + Math.sin(this.time * 6) * 0.08);
      } else mesh.scale.setScalar(1);
      const trail = this.trails.get(b.id)!;
      trail.setColor(TEAM_COLORS[team]);
      if (flying) trail.push(mesh.position);
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
        w.full ? 0.95 : 0.35 + 0.25 * Math.sin(this.time * 20),
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
      beam.set(madd(w.eye, dir, 0.5), hit ? hit.point : madd(w.eye, dir, 200));
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

  /** React to sim events with one-shot visuals. */
  onEvents(events: SimEvent[], teamOf: (id: number) => 0 | 1 | undefined, gravity: Vec3): void {
    for (const e of events) {
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
      } else if (e.type === 'wallHit' || e.type === 'clash' || e.type === 'deflect') {
        this.fragments.burst(e.pos, 0xfff2c0, 8, 5, 0.35, 0.3, gravity);
      } else if (e.type === 'grenadePop') {
        this.fragments.burst(e.pos, 0xc08bff, 30, 9, 0.8, 0.7, gravity);
      }
    }
  }

  /** Private throw preview (only the thrower sees it). */
  setPreview(pred: PathPrediction | null, opacity: number, mateOnPath: boolean): void {
    if (!pred) {
      this.previewPoints.visible = false;
      this.previewMarker.visible = false;
      return;
    }
    const attr = this.previewPoints.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    let n = 0;
    for (let i = 1; i < pred.points.length && n < 400; i += 2) {
      const p = pred.points[i];
      arr[n * 3] = p.x;
      arr[n * 3 + 1] = p.y;
      arr[n * 3 + 2] = p.z;
      n++;
    }
    attr.needsUpdate = true;
    this.previewPoints.geometry.setDrawRange(0, n);
    const mat = this.previewPoints.material as THREE.PointsMaterial;
    mat.opacity = opacity;
    mat.color.set(mateOnPath ? 0xff9a3d : 0xffffff);
    this.previewPoints.visible = true;
    if (pred.wallPoint) {
      this.previewMarker.visible = true;
      this.previewMarker.position.set(pred.wallPoint.x, pred.wallPoint.y, pred.wallPoint.z);
      const last = pred.points[pred.points.length - 2] ?? pred.wallPoint;
      const d = normalize(sub(pred.wallPoint, last));
      this.previewMarker.lookAt(this.previewMarker.position.clone().sub(tv(d)));
    } else this.previewMarker.visible = false;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        if (o.geometry !== BOOMERANG_GEO) o.geometry.dispose();
      }
    });
    this.fragments.dispose();
    void cross;
    void len;
  }
}
