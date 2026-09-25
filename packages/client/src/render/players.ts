// Low-poly player models with a team-colored rim light (easy to spot, never camouflaged).
// Procedural animation: run cycle, slide pose, air tuck, head pitch. Name tags are screen-space
// markers (game/world-markers.ts), not part of the model.
import * as THREE from 'three';
import {
  qForward,
  qFromBasis,
  projectOnPlane,
  normalize,
  dot,
  v3,
  len,
  Move,
} from '@space-yz/shared';
import type { RenderPlayer } from '../game/session';

export const TEAM_COLORS = [0x19e3ff, 0xff8a1f] as const;
const SUIT = 0x2a3140;

const rimVertex = /* glsl */ `
  attribute vec3 color;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const rimFragment = /* glsl */ `
  uniform vec3 rimColor;
  uniform float rimStrength;
  uniform float flash;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vColor;
  void main() {
    float ndv = max(dot(normalize(vN), normalize(vV)), 0.0);
    float rim = pow(1.0 - ndv, 2.2);
    float light = 0.55 + 0.45 * max(dot(normalize(vN), normalize(vec3(0.3, 0.9, 0.4))), 0.0);
    vec3 col = vColor * light + rimColor * rim * rimStrength + vec3(flash);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const makeRimMaterial = (team: 0 | 1): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    vertexShader: rimVertex,
    fragmentShader: rimFragment,
    uniforms: {
      rimColor: { value: new THREE.Color(TEAM_COLORS[team]) },
      rimStrength: { value: 1.6 },
      flash: { value: 0 },
    },
  });

/** Box geometry with a flat vertex color. */
const coloredBox = (w: number, h: number, d: number, color: number): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const c = new THREE.Color(color);
  const cols = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) c.toArray(cols, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
};

interface Model {
  root: THREE.Group;
  body: THREE.Group; // tilts for slide
  head: THREE.Mesh;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  pack: THREE.Group; // back: Controller attaches here (M5)
  controller: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  mat: THREE.ShaderMaterial;
  phase: number;
  team: 0 | 1;
}

const limb = (w: number, h: number, color: number, mat: THREE.Material): THREE.Group => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(coloredBox(w, h, w, color), mat);
  m.position.y = -h / 2;
  g.add(m);
  return g;
};

const buildModel = (team: 0 | 1): Model => {
  const mat = makeRimMaterial(team);
  const accent = TEAM_COLORS[team];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // origin = capsule center (0.9 m above feet)
  const torso = new THREE.Mesh(coloredBox(0.52, 0.62, 0.3, SUIT), mat);
  torso.position.y = 0.2;
  body.add(torso);
  const stripe = new THREE.Mesh(coloredBox(0.54, 0.08, 0.32, accent), mat);
  stripe.position.y = 0.33;
  body.add(stripe);
  const head = new THREE.Mesh(coloredBox(0.3, 0.3, 0.3, SUIT), mat);
  head.position.y = 0.7;
  const visor = new THREE.Mesh(coloredBox(0.26, 0.09, 0.04, accent), mat);
  visor.position.set(0, 0.02, -0.16);
  head.add(visor);
  body.add(head);
  const pack = new THREE.Group();
  pack.position.set(0, 0.22, 0.2);
  const packMesh = new THREE.Mesh(coloredBox(0.36, 0.42, 0.12, 0x1c222e), mat);
  pack.add(packMesh);
  body.add(pack);
  const controller = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22),
    new THREE.MeshBasicMaterial({ color: accent }),
  );
  controller.position.set(0, 0.08, 0.2);
  controller.visible = false;
  pack.add(controller);
  const legL = limb(0.17, 0.82, SUIT, mat);
  legL.position.set(-0.13, -0.1, 0);
  const legR = limb(0.17, 0.82, SUIT, mat);
  legR.position.set(0.13, -0.1, 0);
  const armL = limb(0.13, 0.6, SUIT, mat);
  armL.position.set(-0.34, 0.47, 0);
  const armR = limb(0.13, 0.6, SUIT, mat);
  armR.position.set(0.34, 0.47, 0);
  body.add(legL, legR, armL, armR);
  return {
    root,
    body,
    head,
    legL,
    legR,
    armL,
    armR,
    pack,
    controller,
    mat,
    phase: 0,
    team,
  };
};

export class PlayerModels {
  group = new THREE.Group();
  private models = new Map<number, Model>();

  update(players: RenderPlayer[], dt: number, time: number): void {
    const seen = new Set<number>();
    for (const p of players) {
      seen.add(p.id);
      let m = this.models.get(p.id);
      if (!m || m.team !== p.team) {
        if (m) this.remove(p.id);
        m = buildModel(p.team);
        this.models.set(p.id, m);
        this.group.add(m.root);
      }
      m.root.visible = p.alive;
      if (!p.alive) continue;
      this.pose(m, p, dt);
      // the Controller glows on the carrier's back (only the carrier)
      m.controller.visible = p.carrier;
      if (p.carrier) m.controller.rotation.y = time * 2;
      m.mat.uniforms.flash.value = Math.max(0, m.mat.uniforms.flash.value - dt * 4);
    }
    for (const id of [...this.models.keys()]) if (!seen.has(id)) this.remove(id);
  }

  flash(id: number): void {
    const m = this.models.get(id);
    if (m) m.mat.uniforms.flash.value = 0.6;
  }

  private pose(m: Model, p: RenderPlayer, dt: number): void {
    const fwdP = normalize(projectOnPlane(qForward(p.view), p.up), v3(0, 0, -1));
    const q = qFromBasis(fwdP, p.up);
    m.root.position.set(p.pos.x, p.pos.y, p.pos.z);
    m.root.quaternion.set(q.x, q.y, q.z, q.w);
    // head pitch
    const pitch = Math.asin(Math.max(-1, Math.min(1, dot(qForward(p.view), p.up))));
    m.head.rotation.x = pitch * 0.8;
    const speed = len(projectOnPlane(p.vel, p.up));
    const crouchDrop = p.crouched ? 0.35 : 0;
    m.body.position.y = -crouchDrop;
    if (p.move === Move.Slide) {
      m.body.rotation.x = 0.55;
      m.legL.rotation.x = -1.2;
      m.legR.rotation.x = -1.0;
      m.armL.rotation.x = -0.4;
      m.armR.rotation.x = -0.6;
      return;
    }
    m.body.rotation.x = 0;
    if (p.move === Move.Air || p.move === Move.Float || p.move === Move.Rail) {
      m.legL.rotation.x = -0.5;
      m.legR.rotation.x = 0.3;
      m.armL.rotation.x = p.move === Move.Rail ? -2.9 : -0.3;
      m.armR.rotation.x = p.move === Move.Rail ? -2.9 : -0.6;
      return;
    }
    m.phase += dt * Math.min(14, speed * 1.4);
    const swing = Math.min(1, speed / 6) * 0.9;
    m.legL.rotation.x = Math.sin(m.phase) * swing;
    m.legR.rotation.x = -Math.sin(m.phase) * swing;
    m.armL.rotation.x = -Math.sin(m.phase) * swing * 0.7;
    m.armR.rotation.x = Math.sin(m.phase) * swing * 0.7 - (p.aiming || p.windup > 0 ? 1.2 : 0);
  }

  private remove(id: number): void {
    const m = this.models.get(id);
    if (!m) return;
    this.group.remove(m.root);
    m.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    m.mat.dispose();
    m.controller.material.dispose();
    this.models.delete(id);
  }

  /** Is the Controller shown on this player's back? (tests, tools) */
  showsController(id: number): boolean {
    const m = this.models.get(id);
    return !!m && m.root.visible && m.controller.visible;
  }

  dispose(): void {
    for (const id of [...this.models.keys()]) this.remove(id);
  }
}
