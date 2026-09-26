// Block-robot player models with a team-colored rim light (easy to spot, never camouflaged).
// Chunky boxes, one merged mesh per body segment (few draw calls with 9 players). Procedural
// animation: run cycle with arm swing and hips turning toward the movement, crouch squat, slide,
// air, zero-G, rail, climb, mantle; plus the combat poses (aim, wind-up, throw follow-through,
// slash, Laser). Name tags are screen-space markers (game/world-markers.ts), not part of the model.
import * as THREE from 'three';
import {
  qForward,
  qFromBasis,
  projectOnPlane,
  normalize,
  cross,
  dot,
  v3,
  len,
  Move,
  MOVEMENT_DEFAULTS,
  COMBAT_DEFAULTS,
} from '@space-yz/shared';
import type { RenderPlayer } from '../game/session';
import {
  SUIT,
  SUIT_DARK,
  SUIT_LIGHT,
  SUIT_MID,
  LEG,
  type Leg,
  buildLeg,
  solveLeg,
  partsMesh,
  partsGeometry,
  damp,
  smooth,
} from './robot';
import { AK_PARTS, DEAGLE_PARTS } from './gun-models';

import { TEAM_COLORS, paletteVersion } from './team-palette';
export { TEAM_COLORS };

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
  uniform float shade;
  uniform float flash;
  uniform float ice;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vColor;
  void main() {
    float ndv = max(dot(normalize(vN), normalize(vV)), 0.0);
    float rim = pow(1.0 - ndv, 2.2);
    float light = 0.55 + 0.45 * max(dot(normalize(vN), normalize(vec3(0.3, 0.9, 0.4))), 0.0);
    vec3 col = vColor * light * shade + rimColor * rim * rimStrength + vec3(flash);
    // Freeze power-up: iced over (pale blue body, frosty white rim)
    vec3 iceCol = vec3(0.55, 0.85, 1.0) * (0.45 + 0.55 * light) + vec3(0.85, 0.97, 1.0) * rim * 1.6;
    col = mix(col, iceCol, ice * 0.8);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const RIM = 1.6;
/** the round-start shield's shell (scaled to the body) */
const SHIELD_GEO = new THREE.IcosahedronGeometry(1, 2);
/** CS mode: a faint rim and darker colors, so players don't glow (hard to spot, like in CS) */
const RIM_DIM = 0.12;
const SHADE_DIM = 0.5;

export const makeRimMaterial = (team: 0 | 1): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    vertexShader: rimVertex,
    fragmentShader: rimFragment,
    uniforms: {
      rimColor: { value: new THREE.Color(TEAM_COLORS[team]) },
      rimStrength: { value: RIM },
      shade: { value: 1 },
      flash: { value: 0 },
      ice: { value: 0 },
    },
  });

// Body layout (metres). The model origin is the capsule center like the sim's `pos`; the feet
// sit at -height/2 of the current (standing/crouched) capsule. Everything stays inside the
// honest hitbox: head sphere at eye + 0.02, body capsule up to bodyTop.
const M = MOVEMENT_DEFAULTS;
const STAND_HIP = LEG.thigh + LEG.shin + LEG.ankle; // 0.8 m: legs straight
const NECK = 0.64; // hip joint -> neck pivot
const HEAD_C = 0.17; // neck pivot -> head center
const SHOULDER_X = 0.31;
const SHOULDER_Y = 0.54;
const ELBOW = 0.27; // shoulder -> elbow
const WINDUP_FULL = Math.round(COMBAT_DEFAULTS.windupSec * 60);
const SLASH_SEC = 0.26;
const LASER_HOLD_SEC = 0.3; // the arm stays up (with recoil) after the shot
const THROW_SEC = 0.28;
const THROW_WINDUP_SEC = 0.42;

/** Head center above the feet: where the sim puts the head hitbox. */
const headHeight = (crouched: boolean): number =>
  crouched ? M.crouchHeight - M.eyeFromTopCrouch + 0.02 : M.standHeight - M.eyeFromTopStand + 0.02;

interface Arm {
  shoulder: THREE.Group; // order XZY: swing (x) of a raised (z), rolled (y) arm
  elbow: THREE.Group;
  grip: THREE.Group; // in the fist
}

const buildArm = (mat: THREE.Material, accent: number, mirror: boolean): Arm => {
  const shoulder = new THREE.Group();
  shoulder.rotation.order = 'XZY';
  shoulder.position.set(mirror ? -SHOULDER_X : SHOULDER_X, SHOULDER_Y, 0);
  shoulder.add(
    partsMesh(
      [
        { size: [0.12, 0.1, 0.12], at: [0, -0.02, 0], color: SUIT_DARK },
        { size: [0.12, 0.2, 0.13], at: [0, -0.15, 0], color: SUIT },
      ],
      mat,
      mirror,
    ),
  );
  const elbow = new THREE.Group();
  elbow.position.y = -ELBOW;
  // forearm + cuff + a big block hand (thumb on the inner side) in one mesh
  elbow.add(
    partsMesh(
      [
        { size: [0.1, 0.08, 0.1], color: SUIT_DARK },
        { size: [0.14, 0.18, 0.15], at: [0, -0.12, 0], color: SUIT },
        { size: [0.155, 0.04, 0.165], at: [0, -0.2, 0], color: accent },
        { size: [0.15, 0.1, 0.13], at: [0, -0.27, 0], color: SUIT_LIGHT },
        { size: [0.13, 0.05, 0.11], at: [0, -0.345, -0.01], color: SUIT_MID },
        { size: [0.035, 0.07, 0.05], at: [-0.085, -0.28, -0.03], color: SUIT_LIGHT },
      ],
      mat,
      mirror,
    ),
  );
  shoulder.add(elbow);
  const grip = new THREE.Group();
  grip.position.set(0, -0.3, -0.02);
  elbow.add(grip);
  return { shoulder, elbow, grip };
};

/** Damped pose values; `pose()` sets targets, the model eases toward them. */
interface Pose {
  hipH: number; // hip joint height above the feet
  lean: number; // torso forward lean (negative = back)
  twist: number; // torso yaw relative to the view (throws twist the shoulders)
  legYaw: number; // hips turn toward the movement direction
  splay: number; // legs apart (crouch)
  lz: number; // left ankle forward offset (-z = forward) and lift above the ground
  ll: number;
  rz: number;
  rl: number;
  rs: number; // right arm: swing (+ forward), raise (+ out), roll, elbow bend
  rr: number;
  rro: number;
  rb: number;
  ls: number; // left arm
  lr: number;
  lro: number;
  lb: number;
}
const POSE_KEYS = [
  'hipH',
  'lean',
  'twist',
  'legYaw',
  'splay',
  'lz',
  'll',
  'rz',
  'rl',
  'rs',
  'rr',
  'rro',
  'rb',
  'ls',
  'lr',
  'lro',
  'lb',
] as const satisfies readonly (keyof Pose)[];
const restPose = (): Pose => ({
  hipH: STAND_HIP,
  lean: 0,
  twist: 0,
  legYaw: 0,
  splay: 0.03,
  lz: 0,
  ll: 0,
  rz: 0,
  rl: 0,
  rs: 0,
  rr: 0.1,
  rro: 0,
  rb: 0.25,
  ls: 0,
  lr: 0.1,
  lro: 0,
  lb: 0.25,
});

interface Model {
  root: THREE.Group;
  hips: THREE.Group; // legs; turns toward the movement
  torso: THREE.Group; // leans and twists; carries head, arms, pack
  head: THREE.Group;
  legL: Leg;
  legR: Leg;
  armL: Arm;
  armR: Arm;
  pack: THREE.Group; // back: the Controller attaches here (M5)
  controller: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  boomerang: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; // held, in the right fist
  ak: THREE.Mesh; // CS mode guns, in the right fist
  deagle: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  /** round-start shield: a faint blue shell around the whole body */
  shield: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  team: 0 | 1;
  /** the team palette this model was built with (sides swap colors at half time) */
  palette: number;
  phase: number;
  seed: number; // de-syncs idle motion between players
  cur: Pose;
  tgt: Pose;
  // edge detection for one-shot animations
  armed: boolean;
  wasAiming: boolean;
  windupPeak: number;
  throwT: number;
  throwDur: number;
  throwStrong: boolean;
  wasSlash: boolean;
  slashT: number;
  wasWarn: boolean;
  laserT: number;
}

const buildModel = (team: 0 | 1, id: number): Model => {
  const mat = makeRimMaterial(team);
  const accent = TEAM_COLORS[team];
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = -M.standHeight / 2 + STAND_HIP;
  root.add(hips);
  const torso = new THREE.Group();
  torso.rotation.order = 'YXZ'; // lean in the twisted frame
  hips.add(torso);
  // pelvis, belly, chest with a lit core, shoulder pads and the back pack: one mesh
  torso.add(
    partsMesh(
      [
        { size: [0.36, 0.14, 0.24], color: SUIT },
        { size: [0.38, 0.04, 0.26], at: [0, 0.075, 0], color: accent },
        { size: [0.3, 0.16, 0.2], at: [0, 0.17, 0.01], color: SUIT_DARK },
        { size: [0.5, 0.34, 0.3], at: [0, 0.42, 0], color: SUIT },
        { size: [0.3, 0.16, 0.03], at: [0, 0.44, -0.16], color: SUIT_LIGHT },
        { size: [0.1, 0.06, 0.02], at: [0, 0.44, -0.18], color: accent, glow: 1.5 },
        { size: [0.3, 0.04, 0.22], at: [0, 0.6, 0], color: SUIT_DARK },
        { size: [0.12, 0.08, 0.12], at: [0, NECK, 0], color: SUIT_DARK },
        { size: [0.17, 0.13, 0.22], at: [SHOULDER_X, SHOULDER_Y + 0.03, 0], color: accent },
        { size: [0.17, 0.13, 0.22], at: [-SHOULDER_X, SHOULDER_Y + 0.03, 0], color: accent },
        { size: [0.34, 0.36, 0.1], at: [0, 0.42, 0.2], color: 0x1c222e },
        { size: [0.04, 0.24, 0.02], at: [0.1, 0.42, 0.255], color: accent, glow: 1.3 },
        { size: [0.04, 0.24, 0.02], at: [-0.1, 0.42, 0.255], color: accent, glow: 1.3 },
      ],
      mat,
    ),
  );
  // box head: dark visor band with a glowing eye strip, chin plate, ear bolts, a low crest
  const head = new THREE.Group();
  head.rotation.order = 'YXZ';
  head.position.y = NECK;
  head.add(
    partsMesh(
      [
        { size: [0.3, 0.26, 0.3], at: [0, HEAD_C, 0], color: SUIT_LIGHT },
        { size: [0.28, 0.1, 0.03], at: [0, HEAD_C + 0.02, -0.155], color: SUIT_DARK },
        { size: [0.22, 0.035, 0.02], at: [0, HEAD_C + 0.02, -0.168], color: accent, glow: 1.6 },
        { size: [0.2, 0.05, 0.03], at: [0, HEAD_C - 0.09, -0.152], color: SUIT_DARK },
        { size: [0.03, 0.1, 0.1], at: [0.16, HEAD_C, 0.01], color: SUIT_DARK },
        { size: [0.03, 0.1, 0.1], at: [-0.16, HEAD_C, 0.01], color: SUIT_DARK },
        { size: [0.04, 0.03, 0.2], at: [0, HEAD_C + 0.145, 0.02], color: accent },
      ],
      mat,
    ),
  );
  torso.add(head);
  const pack = new THREE.Group();
  pack.position.set(0, 0.32, 0.2);
  torso.add(pack);
  const controller = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22),
    new THREE.MeshBasicMaterial({ color: accent }),
  );
  controller.position.set(0, 0.08, 0.2);
  controller.visible = false;
  pack.add(controller);
  const armL = buildArm(mat, accent, true);
  const armR = buildArm(mat, accent, false);
  torso.add(armL.shoulder, armR.shoulder);
  const legL = buildLeg(mat, accent, true);
  legL.thigh.position.x = -0.12;
  const legR = buildLeg(mat, accent, false);
  legR.thigh.position.x = 0.12;
  hips.add(legL.thigh, legR.thigh);
  // a Boomerang in the fist (same V shape as the flying one), held club-style
  const boomerang = new THREE.Mesh(
    partsGeometry([
      { size: [0.34, 0.035, 0.09], at: [0.128, 0, -0.078], rot: [0, 0.55, 0], color: 0xffffff },
      { size: [0.34, 0.035, 0.09], at: [-0.128, 0, -0.078], rot: [0, -0.55, 0], color: 0xffffff },
    ]),
    new THREE.MeshBasicMaterial({ color: accent }),
  );
  boomerang.scale.setScalar(0.8);
  boomerang.rotation.set(-0.3, 0, Math.PI / 2);
  boomerang.visible = false;
  armR.grip.add(boomerang);
  // CS mode guns: barrel along the arm (the grip's -Y), gun up = the grip's -Z
  const ak = partsMesh(AK_PARTS, mat);
  const deagle = partsMesh(DEAGLE_PARTS, mat);
  for (const g of [ak, deagle]) {
    g.rotation.x = -Math.PI / 2;
    g.position.set(0, 0.02, 0);
    g.visible = false;
    armR.grip.add(g);
  }
  const shield = new THREE.Mesh(
    SHIELD_GEO,
    new THREE.MeshBasicMaterial({
      color: 0x7fd8ff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  shield.scale.set(0.62, 1.05, 0.62);
  shield.visible = false;
  root.add(shield);
  return {
    shield,
    ak,
    deagle,
    root,
    hips,
    torso,
    head,
    legL,
    legR,
    armL,
    armR,
    pack,
    controller,
    boomerang,
    mat,
    team,
    palette: paletteVersion,
    phase: 0,
    seed: (id * 1.618) % (Math.PI * 2),
    cur: restPose(),
    tgt: restPose(),
    armed: false,
    wasAiming: false,
    windupPeak: 0,
    throwT: 0,
    throwDur: THROW_SEC,
    throwStrong: false,
    wasSlash: false,
    slashT: 0,
    wasWarn: false,
    laserT: 0,
  };
};

const REST = restPose();
const WHITE = new THREE.Color(0xffffff);

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

const applyArm = (
  arm: Arm,
  swing: number,
  raise: number,
  roll: number,
  bend: number,
  side: 1 | -1,
) => {
  arm.shoulder.rotation.set(swing, roll * side, raise * side);
  arm.elbow.rotation.x = bend;
};

export class PlayerModels {
  group = new THREE.Group();
  private models = new Map<number, Model>();
  private holding = new Set<number>();
  /** CS mode: dim robots holding guns */
  private cs = false;

  /** CS mode on/off: players drawn dim (faint rim, darker colors) and holding their guns. */
  setCsMode(on: boolean): void {
    this.cs = on;
  }

  /** Is CS mode (dim players) on? (tests) */
  get csMode(): boolean {
    return this.cs;
  }

  /** A player fired a gun: the arm kicks up. */
  gunKick(id: number): void {
    const m = this.models.get(id);
    if (m) m.laserT = LASER_HOLD_SEC * 0.6;
  }

  update(players: RenderPlayer[], dt: number, time: number): void {
    const seen = new Set<number>();
    for (const p of players) {
      seen.add(p.id);
      let m = this.models.get(p.id);
      if (!m || m.team !== p.team || m.palette !== paletteVersion) {
        if (m) this.remove(p.id);
        m = buildModel(p.team, p.id);
        this.models.set(p.id, m);
        this.group.add(m.root);
      }
      m.root.visible = p.alive;
      if (!p.alive) {
        // respawn starts from a clean slate (no half-played throw)
        m.armed = m.wasAiming = m.wasSlash = m.wasWarn = false;
        m.throwT = m.slashT = m.laserT = 0;
        continue;
      }
      this.pose(m, p, dt, time);
      // the Controller glows on the carrier's back (only the carrier)
      m.controller.visible = p.carrier;
      if (p.carrier) m.controller.rotation.y = time * 2;
      m.mat.uniforms.flash.value = Math.max(0, m.mat.uniforms.flash.value - dt * 4);
      // frozen by a Freeze hit: ice over fast, thaw a little slower
      m.shield.visible = !!p.shield;
      if (p.shield) m.shield.material.opacity = 0.14 + 0.06 * Math.sin(time * 3 + m.seed);
      const ice = m.mat.uniforms.ice;
      const want = (p.stun ?? 0) > 0 ? 1 : 0;
      ice.value += (want - ice.value) * Math.min(1, dt * (want ? 20 : 6));
    }
    for (const id of [...this.models.keys()])
      if (!seen.has(id)) {
        this.remove(id);
        this.holding.delete(id);
      }
  }

  flash(id: number): void {
    const m = this.models.get(id);
    if (m) m.mat.uniforms.flash.value = 0.6;
  }

  /**
   * Draw this player's Boomerang in their right fist (while it's held). Off by default: the
   * world view draws held Boomerangs at the sim's hand point, so only switch this on together
   * with hiding that one.
   */
  setHolding(id: number, holding: boolean): void {
    if (holding) this.holding.add(id);
    else this.holding.delete(id);
  }

  private pose(m: Model, p: RenderPlayer, dt: number, time: number): void {
    const fwd = qForward(p.view);
    const fwdP = normalize(projectOnPlane(fwd, p.up), v3(0, 0, -1));
    const q = qFromBasis(fwdP, p.up);
    m.root.position.set(p.pos.x, p.pos.y, p.pos.z);
    m.root.quaternion.set(q.x, q.y, q.z, q.w);
    const pitch = Math.asin(clamp(dot(fwd, p.up), -1, 1));
    const planar = projectOnPlane(p.vel, p.up);
    const speed = len(planar);
    const crouched = p.crouched;
    const feetY = -(crouched ? M.crouchHeight : M.standHeight) / 2;

    // Legs step along the movement: the hips turn toward it (up to ~50°), and running
    // backwards steps backwards instead of moonwalking.
    let moveYaw = 0;
    let dir = 1;
    if (speed > 0.5) {
      moveYaw = Math.atan2(dot(planar, cross(fwdP, p.up)), dot(planar, fwdP)); // + = right
      if (Math.abs(moveYaw) > Math.PI / 2) {
        dir = -1;
        moveYaw -= Math.PI * Math.sign(moveYaw);
      }
    }
    m.phase += dt * Math.min(14, speed * 1.4);
    const amt = Math.min(1, speed / 6);
    const s = Math.sin(m.phase);
    const c = Math.cos(m.phase);
    const breathe = Math.sin(time * 2 + m.seed) * 0.04;

    const t = m.tgt;
    Object.assign(t, REST);
    t.legYaw = -clamp(moveYaw, -0.9, 0.9) * Math.min(1, speed / 2);
    t.rb += breathe;
    t.lb -= breathe;
    // crouched/sliding: the head sits where the sim puts it, the legs fold underneath
    const hipFor = (lean: number): number =>
      headHeight(crouched) - (NECK * Math.cos(lean) + HEAD_C);

    switch (p.move) {
      case Move.Slide:
        // feet first, leaning back (legs kept short of reaching far out of the hitbox)
        t.lean = -0.25;
        t.hipH = hipFor(t.lean);
        t.splay = 0.12;
        t.lz = -0.18;
        t.ll = 0.02;
        t.rz = -0.06;
        t.rs = 0.6;
        t.rb = 0.6;
        t.ls = -0.5;
        t.lr = 0.5;
        t.lb = 0.3;
        break;
      case Move.Air:
        t.lean = crouched ? 0.1 : 0.05;
        if (crouched) t.hipH = hipFor(t.lean);
        t.lz = crouched ? -0.2 : -0.12;
        t.ll = crouched ? 0.1 : 0.22;
        t.rz = crouched ? -0.12 : 0.1;
        t.rl = crouched ? 0.06 : 0.08;
        t.rs = -0.2;
        t.ls = 0.3;
        t.rr = t.lr = 0.45;
        t.rb = t.lb = 0.5;
        break;
      case Move.Float: {
        const drift = Math.sin(time * 1.3 + m.seed);
        t.lz = 0.05 + drift * 0.08;
        t.ll = 0.12;
        t.rz = -0.05 - drift * 0.08;
        t.rl = 0.06;
        t.splay = 0.15;
        t.rr = t.lr = 0.85 + drift * 0.1;
        t.rb = t.lb = 0.4;
        break;
      }
      case Move.Rail:
        // hanging from the rail with both hands up
        t.rs = t.ls = -2.9;
        t.rr = t.lr = 0.15;
        t.rb = t.lb = 0.1;
        t.lz = 0.05 + Math.sin(time * 3) * 0.05;
        t.ll = 0.05;
        t.rz = -0.08;
        t.rl = 0.12;
        break;
      case Move.Climb: {
        const k = Math.sin(time * 9);
        t.rs = 2.7 + k * 0.35;
        t.ls = 2.7 - k * 0.35;
        t.rr = t.lr = 0.15;
        t.rb = t.lb = 0.3;
        t.lz = -0.1;
        t.ll = 0.15 + k * 0.12;
        t.rz = -0.1;
        t.rl = 0.15 - k * 0.12;
        break;
      }
      case Move.Mantle:
        t.lean = 0.3;
        t.rs = t.ls = 1.0;
        t.rb = t.lb = 0.2;
        t.lz = -0.1;
        t.ll = 0.3;
        t.rz = 0.05;
        t.rl = 0.2;
        break;
      default: {
        // ground: run cycle (the swing foot lifts), arms swing against the legs
        const stride = (crouched ? 0.15 : 0.28) * amt * dir;
        // in a deep squat the ankles stay in front of the hips (knees up, not through the floor)
        const base = crouched ? -0.2 : 0;
        t.lz = base - s * stride;
        t.ll = Math.max(0, c) * (crouched ? 0.08 : 0.16) * amt;
        t.rz = base + s * stride;
        t.rl = Math.max(0, -c) * (crouched ? 0.08 : 0.16) * amt;
        t.twist = 0.1 * s * dir * amt;
        t.rs = s * dir * 0.8 * amt;
        t.ls = -t.rs;
        t.rb = t.lb = 0.25 + 0.9 * amt;
        if (crouched) {
          t.lean = 0.45;
          t.hipH = hipFor(t.lean);
          t.splay = 0.22;
          t.rs += 0.4;
          t.ls += 0.4;
          t.rb = t.lb = 0.9;
        } else {
          t.lean = 0.14 * amt;
          // knees give a little while running so the feet reach the ground mid-stride
          t.hipH = STAND_HIP - amt * (0.04 + 0.03 * Math.abs(s));
        }
      }
    }

    // --- combat poses (upper body only; they play over any movement) ---
    const windup01 = Math.min(1, p.windup / WINDUP_FULL);
    const armed = p.aiming || p.windup > 0;
    if (m.armed && !armed && (m.wasAiming || m.windupPeak >= 0.98)) {
      // aim or a full wind-up just ended: that's a throw (cancels don't swing)
      m.throwStrong = !m.wasAiming;
      m.throwDur = m.throwStrong ? THROW_WINDUP_SEC : THROW_SEC;
      m.throwT = m.throwDur;
    }
    m.armed = armed;
    m.wasAiming = p.aiming;
    m.windupPeak = armed ? Math.max(m.windupPeak, windup01) : 0;
    if (p.slashTicks > 0 && !m.wasSlash) m.slashT = SLASH_SEC;
    m.wasSlash = p.slashTicks > 0;
    if (m.wasWarn && p.laserWarn === 0) m.laserT = LASER_HOLD_SEC; // fired
    m.wasWarn = p.laserWarn > 0;
    m.throwT = Math.max(0, m.throwT - dt);
    m.slashT = Math.max(0, m.slashT - dt);
    m.laserT = Math.max(0, m.laserT - dt);

    let k = 14;
    if (this.cs && m.slashT <= 0) {
      // CS mode: the gun up along the view at all times (kicks up on each shot), the left hand
      // on the AK's handguard
      const recoil = m.laserT / LASER_HOLD_SEC;
      t.twist = 0.15;
      t.rs = Math.PI / 2 + pitch + m.cur.lean + recoil * 0.3;
      t.rr = 0.05;
      t.rro = 0;
      t.rb = 0.1 + recoil * 0.3;
      t.ls = Math.PI / 2 + pitch + m.cur.lean - 0.15;
      t.lr = -0.55;
      t.lro = 0;
      t.lb = 0.55;
      k = 24;
    } else if (p.laserWarn > 0 || m.laserT > 0) {
      // Laser: right arm straight along the view; kicks up when it fires
      const recoil = m.laserT / LASER_HOLD_SEC;
      t.twist = 0.15;
      t.rs = Math.PI / 2 + pitch + m.cur.lean + recoil * 0.35;
      t.rr = 0.05;
      t.rro = 0;
      t.rb = 0.1 + recoil * 0.5;
      k = 24;
    } else if (m.throwT > 0) {
      // follow-through: arm whips forward and across, shoulders turn into the throw
      const u = 1 - m.throwT / m.throwDur;
      const st = m.throwStrong ? 1 : 0.65;
      t.twist = 0.6 * st;
      t.lean += 0.18 * st;
      t.rs = 1.25;
      t.rr = 0.35;
      t.rro = 0;
      t.rb = 0.1;
      t.ls = -0.5 * st;
      t.lr = 0.3;
      t.lb = 0.4;
      k = u < 0.35 ? 40 : 12;
    } else if (m.slashT > 0) {
      // slash: a flat swipe from right to left, the torso turning with it
      const u = 1 - m.slashT / SLASH_SEC;
      const e = smooth((u - 0.15) / 0.45);
      t.twist = -0.5 + 1.2 * e;
      t.rs = 1.35;
      t.rr = 0.9 - 1.25 * e;
      t.rro = -0.3;
      t.rb = 0.25;
      k = 34;
    } else if (p.windup > 0) {
      // wind-up: arm cocked far back behind the head, body twisted away, left arm points
      const w = windup01;
      const shake = w >= 1 ? Math.sin(time * 40) * 0.03 : 0;
      t.twist = -0.35 - 0.35 * w + shake;
      t.lean += 0.08 * w;
      t.rs = 0.5;
      t.rr = 1.3;
      t.rro = -1.6;
      t.rb = 2.0 + 0.2 * w;
      t.ls = 1.25 + pitch * 0.8 + t.lean;
      t.lr = 0.15;
      t.lb = 0.15;
    } else if (p.aiming) {
      // aim: throwing arm cocked up beside the head (elbow out), off hand forward
      t.twist = -0.3;
      t.rs = 0.5;
      t.rr = 1.2;
      t.rro = -1.6;
      t.rb = 2.1;
      t.ls = 1.0 + pitch * 0.6;
      t.lr = 0.1;
      t.lb = 0.3;
    }

    // ease toward the targets
    const cur = m.cur;
    for (const key of POSE_KEYS) cur[key] = damp(cur[key], t[key], key === 'hipH' ? 12 : k, dt);

    // apply: keep the head over the capsule axis when leaning (honest head hitbox)
    m.hips.position.set(0, feetY + cur.hipH, NECK * Math.sin(cur.lean));
    m.hips.rotation.y = cur.legYaw;
    m.torso.rotation.set(-cur.lean, -cur.legYaw + cur.twist, 0);
    m.head.rotation.set(clamp(pitch * 0.8 + cur.lean, -1.1, 1.1), -cur.twist * 0.7, 0);
    applyArm(m.armR, cur.rs, cur.rr, cur.rro, cur.rb, 1);
    applyArm(m.armL, cur.ls, cur.lr, cur.lro, cur.lb, -1);
    const drop = cur.hipH - LEG.ankle;
    solveLeg(m.legL, cur.lz, -drop + cur.ll);
    solveLeg(m.legR, cur.rz, -drop + cur.rl);
    m.legL.thigh.rotation.z = -cur.splay;
    m.legR.thigh.rotation.z = cur.splay;

    // charge glow: the rim light brightens with the wind-up and pulses when it's full
    const charge =
      p.windup > 0 ? windup01 * 1.2 + (windup01 >= 1 ? 0.5 + 0.5 * Math.sin(time * 18) : 0) : 0;
    m.mat.uniforms.rimStrength.value = (this.cs ? RIM_DIM : RIM) + charge;
    m.mat.uniforms.shade.value = this.cs ? SHADE_DIM : 1;
    m.ak.visible = this.cs && p.weapon !== 1;
    m.deagle.visible = this.cs && p.weapon === 1;
    m.boomerang.visible = this.holding.has(p.id) && m.throwT <= 0;
    if (m.boomerang.visible) {
      m.boomerang.material.color.set(TEAM_COLORS[m.team]).lerp(WHITE, windup01 * 0.6);
    }
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
    m.boomerang.material.dispose();
    m.shield.material.dispose();
    this.models.delete(id);
  }

  /** Is the Controller shown on this player's back? (tests, tools) */
  showsController(id: number): boolean {
    const m = this.models.get(id);
    return !!m && m.root.visible && m.controller.visible;
  }

  dispose(): void {
    for (const id of [...this.models.keys()]) this.remove(id);
    this.holding.clear();
  }
}
