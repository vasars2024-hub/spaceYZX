// Visuals for the charged Gravity Grenade and the remote mine: the lineup preview (a faint arc
// of dots, small diamonds where it bounces, a ring where it goes off) while you hold Q, the
// mines lying on the floor, and the mine blast / fizzle / bomb-jam pulses.
import * as THREE from 'three';
import type { GrenadePath, MineState, Vec3 } from '@space-yz/shared';
import { len, sub } from '@space-yz/shared';
import { TEAM_COLORS } from './players';

const NADE_PURPLE = 0xc08bff;
/** preview dots closer than this to the camera are skipped (they'd fill the screen) */
const NEAR = 1.4;
const MAX_DOTS = 300;
const MAX_BOUNCES = 8;

/** Who a mine belongs to, seen from the local player. */
export type MineRelation = 'mine' | 'mate' | 'enemy';

interface Pulse {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  radius: number;
}

const dotTexture = (): THREE.Texture => {
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(c);
};

const yAxis = new THREE.Vector3(0, 1, 0);
const upV = new THREE.Vector3();

export class NadeView {
  group = new THREE.Group();
  private dots: THREE.Points;
  private landing: THREE.Mesh;
  private bounceMarks: THREE.Mesh[] = [];
  private mines = new Map<number, THREE.Group>();
  private pulses: Pulse[] = [];
  private time = 0;
  private mineBody = new THREE.CylinderGeometry(0.17, 0.2, 0.06, 12);
  private mineLight = new THREE.SphereGeometry(0.035, 8, 6);
  private pulseGeo = new THREE.SphereGeometry(1, 20, 14);

  constructor() {
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DOTS * 3), 3));
    this.dots = new THREE.Points(
      pg,
      new THREE.PointsMaterial({
        color: NADE_PURPLE,
        size: 0.09,
        map: dotTexture(),
        alphaTest: 0.05,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.dots.frustumCulled = false;
    this.dots.visible = false;
    this.landing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 28),
      new THREE.MeshBasicMaterial({
        color: NADE_PURPLE,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.landing.visible = false;
    const bounceGeo = new THREE.RingGeometry(0.08, 0.16, 4);
    const bounceMat = new THREE.MeshBasicMaterial({
      color: 0xe2c8ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    for (let i = 0; i < MAX_BOUNCES; i++) {
      const m = new THREE.Mesh(bounceGeo, bounceMat);
      m.visible = false;
      this.bounceMarks.push(m);
      this.group.add(m);
    }
    this.group.add(this.dots, this.landing);
  }

  /** The lineup preview while charging (null hides it). `up`: your up (lays the ring flat). */
  setPreview(path: GrenadePath | null, camPos: Vec3, up: Vec3): void {
    if (!path) {
      this.dots.visible = false;
      this.landing.visible = false;
      for (const m of this.bounceMarks) m.visible = false;
      return;
    }
    const attr = this.dots.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    let n = 0;
    // every 2nd tick (about one dot per 15-30 cm at full speed)
    for (let i = 1; i < path.points.length && n < MAX_DOTS; i += 2) {
      const p = path.points[i];
      if (len(sub(p, camPos)) < NEAR) continue;
      arr[n * 3] = p.x;
      arr[n * 3 + 1] = p.y;
      arr[n * 3 + 2] = p.z;
      n++;
    }
    attr.needsUpdate = true;
    this.dots.geometry.setDrawRange(0, n);
    this.dots.visible = n > 0;
    this.bounceMarks.forEach((m, i) => {
      const b = path.bounces[i];
      m.visible = !!b;
      if (b) {
        m.position.set(b.x, b.y, b.z);
        m.lookAt(camPos.x, camPos.y, camPos.z);
      }
    });
    this.landing.visible = true;
    this.landing.position.set(path.end.x, path.end.y, path.end.z);
    // flat on the floor (facing your up); slowly pulsing so it reads as "lands here"
    upV.set(up.x, up.y, up.z);
    this.landing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), upV);
    this.landing.scale.setScalar(1 + 0.08 * Math.sin(this.time * 6));
  }

  /** Mines lying around (`relation`: whose it is, for its colour). */
  setMines(mines: MineState[], relation: (m: MineState) => MineRelation, team: 0 | 1): void {
    const seen = new Set<number>();
    for (const m of mines) {
      seen.add(m.id);
      let g = this.mines.get(m.id);
      const rel = relation(m);
      if (!g) {
        g = new THREE.Group();
        const body = new THREE.Mesh(
          this.mineBody,
          new THREE.MeshBasicMaterial({ color: 0x2a2f36 }),
        );
        body.position.y = 0.03;
        // a small, dim light on top: yours / your team's in your colour, an enemy's dull red
        const color = rel === 'enemy' ? 0x8a2020 : TEAM_COLORS[team];
        const light = new THREE.Mesh(
          this.mineLight,
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
        );
        light.position.y = 0.075;
        light.name = 'light';
        g.add(body, light);
        this.mines.set(m.id, g);
        this.group.add(g);
      }
      g.position.set(m.pos.x, m.pos.y, m.pos.z);
      upV.set(m.up.x, m.up.y, m.up.z);
      g.quaternion.setFromUnitVectors(yAxis, upV);
      // the light blinks: slowly (and faintly) for an enemy mine
      const light = g.getObjectByName('light') as THREE.Mesh | undefined;
      if (light) {
        const mat = light.material as THREE.MeshBasicMaterial;
        const rate = rel === 'enemy' ? 1.2 : 2.5;
        const on = Math.sin((this.time + m.id * 0.31) * rate * Math.PI * 2) > 0.3;
        mat.opacity = rel === 'enemy' ? (on ? 0.55 : 0.12) : on ? 1 : 0.35;
      }
    }
    for (const [id, g] of this.mines)
      if (!seen.has(id)) {
        this.group.remove(g);
        for (const o of g.children) ((o as THREE.Mesh).material as THREE.Material).dispose();
        this.mines.delete(id);
      }
  }

  /** An expanding see-through shell (a mine blast, a fizzle, the bomb's jam shockwave). */
  pulse(at: Vec3, radius: number, color: number, sec: number, opacity = 0.35): void {
    const mesh = new THREE.Mesh(
      this.pulseGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.set(at.x, at.y, at.z);
    mesh.scale.setScalar(0.1);
    mesh.userData.opacity = opacity;
    this.group.add(mesh);
    this.pulses.push({ mesh, life: sec, max: sec, radius });
  }

  update(dt: number): void {
    this.time += dt;
    this.pulses = this.pulses.filter((p) => {
      p.life -= dt;
      const k = 1 - Math.max(0, p.life) / p.max;
      p.mesh.scale.setScalar(Math.max(0.1, p.radius * Math.sqrt(k)));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity =
        (p.mesh.userData.opacity as number) * (1 - k);
      if (p.life > 0) return true;
      this.group.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
      return false;
    });
  }

  dispose(): void {
    for (const g of this.mines.values())
      for (const o of g.children) ((o as THREE.Mesh).material as THREE.Material).dispose();
    for (const p of this.pulses) (p.mesh.material as THREE.Material).dispose();
    this.dots.geometry.dispose();
    (this.dots.material as THREE.PointsMaterial).map?.dispose();
    (this.dots.material as THREE.Material).dispose();
    this.landing.geometry.dispose();
    (this.landing.material as THREE.Material).dispose();
    this.bounceMarks[0]?.geometry.dispose();
    (this.bounceMarks[0]?.material as THREE.Material | undefined)?.dispose();
    this.mineBody.dispose();
    this.mineLight.dispose();
    this.pulseGeo.dispose();
  }
}
