// First-person viewmodel: your own block-robot hands (and feet when you look down). The right
// fist holds the Boomerang (spins faster and glows while winding up) or, while the Boomerang is
// away, the Laser emitter with its charge lights. One-shot animations: quick-throw and wind-up
// release, catch, slash, Laser recoil. CS mode: an AK-47 (both hands) or a Desert Eagle instead,
// with muzzle flash, recoil kick and a reload animation.
import * as THREE from 'three';
import { Move, MOVEMENT_DEFAULTS } from '@space-yz/shared';
import { BOOMERANG_GEO } from './combat-view';
import { TEAM_COLORS, makeRimMaterial } from './players';
import { paletteVersion } from './team-palette';
import {
  SUIT,
  SUIT_LIGHT,
  SUIT_MID,
  LEG,
  type Leg,
  type Part,
  buildLeg,
  solveLeg,
  partsMesh,
  damp,
  smooth,
} from './robot';
import { AK_PARTS, AK_MUZZLE, DEAGLE_PARTS, DEAGLE_MUZZLE, muzzleFlash } from './gun-models';

export interface ViewmodelState {
  held: boolean;
  team: 0 | 1;
  aiming: boolean;
  windup: number; // 0..1
  windupFull: boolean;
  slashing: boolean;
  laserCharges: number;
  laserMax: number;
  laserWarn: boolean;
  moving: number; // 0..1 bob amount
  /** view pitch relative to your up (radians, + = looking up): your feet show when looking down */
  pitch?: number;
  grounded?: boolean;
  crouched?: boolean;
  move?: number; // Move: slide / air poses for the feet
  /** the Laser is chosen (key 2) while the Boomerang is still in hand */
  laserOut?: boolean;
  /** CS mode: the gun in hand (replaces the Boomerang / Laser) */
  gun?: 'ak' | 'deagle' | null;
  /** CS mode: shots fired so far (a change = a shot: flash + kick) */
  gunShots?: number;
  /** CS mode: reload progress 0..1 (0 = not reloading) */
  gunReload01?: number;
}

const M = MOVEMENT_DEFAULTS;
const THROW_SEC = 0.3;
const THROW_WINDUP_SEC = 0.42;
const CATCH_SEC = 0.25;
const SLASH_SEC = 0.26;
const RECOIL_SEC = 0.22;
const DRAW_SEC = 0.2; // the emitter rises into view after a throw
const FEET_PITCH = -0.6; // ~35° down: feet never show while looking ahead

/**
 * First-person block hand: palm at the origin, closed fingers and thumb in front, a team cuff
 * and the forearm running back toward the bottom corner of the screen (off-screen).
 */
const handParts = (accent: number): Part[] => [
  { size: [0.075, 0.07, 0.085], color: SUIT_LIGHT },
  { size: [0.08, 0.035, 0.03], at: [0, 0.02, -0.05], color: SUIT_MID },
  { size: [0.025, 0.025, 0.05], at: [-0.048, 0.022, -0.02], color: SUIT_LIGHT },
  // team cuff in a dark tint: full team color this close to the lens is a glaring slab
  {
    size: [0.074, 0.068, 0.03],
    at: [0.012, -0.012, 0.055],
    rot: [0.3, 0.25, 0],
    color: dim(accent),
  },
  // a short forearm: a long one reaches back past the lens and fills the bottom of the screen
  { size: [0.058, 0.056, 0.16], at: [0.03, -0.035, 0.13], rot: [0.3, 0.25, 0], color: SUIT },
];

/** A team color darkened toward the suit (for parts right in front of your eyes). */
const dim = (c: number): number => new THREE.Color(c).lerp(new THREE.Color(SUIT), 0.6).getHex();

/** First-person hands are drawn smaller than life so they never crowd the view. */
const HAND_SCALE = 0.68;

// Arm poses: [x, y, z, rx, ry, rz] of the palm in camera space
type Pose6 = [number, number, number, number, number, number];
const R_IDLE: Pose6 = [0.17, -0.16, -0.4, -0.2, 0.3, 0.06];
const R_AIM: Pose6 = [0.11, -0.085, -0.3, 0.2, 0.55, 0.3];
const R_LASER: Pose6 = [0.13, -0.12, -0.32, 0, 0.08, 0];
const L_IDLE: Pose6 = [-0.22, -0.21, -0.38, -0.1, -0.35, -0.12];
const L_AIM: Pose6 = [-0.14, -0.145, -0.38, 0.1, -0.25, -0.15];
const L_WINDUP: Pose6 = [-0.12, -0.125, -0.42, 0.15, -0.2, -0.2];
// CS mode: right hand on the pistol grip, left hand under the AK's handguard / cupping the Deagle
const R_AK: Pose6 = [0.13, -0.14, -0.27, 0, 0.02, 0];
const L_AK: Pose6 = [0.07, -0.16, -0.47, 0.1, -0.2, 0.35];
const R_DEAGLE: Pose6 = [0.11, -0.12, -0.3, 0, 0.03, 0];
const L_DEAGLE: Pose6 = [0.065, -0.155, -0.29, 0.1, -0.3, 0.3];
const GUN_SCALE = 0.8;
const KICK_SEC = { ak: 0.09, deagle: 0.22 };
const FLASH_SEC = 0.045;

export class Viewmodel {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  private mat = makeRimMaterial(0);
  private team: 0 | 1 = 0;
  private palette = -1;
  private rArm = new THREE.Group();
  private lArm = new THREE.Group();
  private rMesh: THREE.Mesh | null = null;
  private lMesh: THREE.Mesh | null = null;
  private grip = new THREE.Group();
  private boomerang: THREE.Mesh;
  private glow: THREE.Mesh;
  private laser = new THREE.Group();
  private pips: THREE.Mesh[] = [];
  private tip: THREE.Mesh;
  // feet: a yaw-only frame under the camera (undoes the pitch)
  private body = new THREE.Group();
  private hips = new THREE.Group();
  private legL: Leg | null = null;
  private legR: Leg | null = null;
  private r: Pose6 = [...R_IDLE];
  private l: Pose6 = [...L_IDLE];
  private eyeH = M.standHeight - M.eyeFromTopStand;
  private hipH = LEG.thigh + LEG.shin + LEG.ankle;
  private feet = [0, 0, 0, 0]; // left z, lift, right z, lift (damped)
  private phase = 0;
  private t = 0;
  // one-shot animations (seconds left) and edge detection
  private slashT = 0;
  private throwT = 0;
  private throwDur = THROW_SEC;
  private throwStrong = false;
  private catchT = 0;
  private recoilT = 0;
  private drawT = 0;
  private wasHeld: boolean | null = null; // null until the first update (no throw on spawn)
  private wasWarn = false;
  private wasLaserOut: boolean | null = null;
  private windupPeak = 0;
  // CS mode guns
  private gunMat = makeRimMaterial(0);
  private ak = new THREE.Group();
  private deagle = new THREE.Group();
  private akFlash = muzzleFlash(0.09);
  private deagleFlash = muzzleFlash(0.07);
  private kickT = 0;
  private kickDur = KICK_SEC.ak;
  private flashT = 0;
  private lastShots: number | null = null;

  constructor() {
    this.scene.add(this.camera);
    this.camera.add(this.rArm, this.lArm, this.body);
    this.mat.uniforms.rimStrength.value = 0.35; // a hint of team light, not a glowing outline
    this.boomerang = new THREE.Mesh(
      BOOMERANG_GEO,
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[0] }),
    );
    this.boomerang.scale.setScalar(0.26);
    this.glow = new THREE.Mesh(
      new THREE.RingGeometry(0.035, 0.11, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.glow.rotation.x = Math.PI / 2;
    // the Boomerang balances just above the fist
    this.grip.position.set(0, 0.05, -0.015);
    this.grip.add(this.boomerang, this.glow);
    this.rArm.add(this.grip);

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.035, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x3a4458 }),
    );
    this.tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.025, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xff5a6a }),
    );
    this.tip.position.z = -0.09;
    this.laser.add(shell, this.tip);
    for (let i = 0; i < 3; i++) {
      const pip = new THREE.Mesh(
        new THREE.BoxGeometry(0.009, 0.009, 0.02),
        new THREE.MeshBasicMaterial({ color: 0xff5a6a }),
      );
      pip.position.set(0.024, 0.01 - i * 0.011, 0.01);
      this.pips.push(pip);
      this.laser.add(pip);
    }
    // gripped in the right fist, pointing ahead
    this.laser.position.set(0, 0.02, -0.07);
    this.rArm.add(this.laser);

    // CS mode guns: in the right fist (the grip is the gun's origin)
    this.gunMat.uniforms.rimStrength.value = 0.15;
    this.ak.add(partsMesh(AK_PARTS, this.gunMat), this.akFlash);
    this.akFlash.position.copy(AK_MUZZLE);
    this.deagle.add(partsMesh(DEAGLE_PARTS, this.gunMat), this.deagleFlash);
    this.deagleFlash.position.copy(DEAGLE_MUZZLE);
    for (const g of [this.ak, this.deagle]) {
      g.scale.setScalar(GUN_SCALE);
      g.position.set(0, 0.01, -0.01);
      g.visible = false;
      this.rArm.add(g);
    }

    this.body.add(this.hips);
    this.build(0);
  }

  /** (Re)build the team-colored hand and leg meshes. */
  private build(team: 0 | 1): void {
    this.team = team;
    this.palette = paletteVersion;
    const accent = TEAM_COLORS[team];
    this.mat.uniforms.rimColor.value.set(accent);
    this.gunMat.uniforms.rimColor.value.set(accent);
    for (const m of [this.rMesh, this.lMesh]) {
      if (!m) continue;
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.rMesh = partsMesh(handParts(accent), this.mat);
    this.lMesh = partsMesh(handParts(accent), this.mat, true);
    this.rMesh.scale.setScalar(HAND_SCALE);
    this.lMesh.scale.setScalar(HAND_SCALE);
    this.rArm.add(this.rMesh);
    this.lArm.add(this.lMesh);
    for (const leg of [this.legL, this.legR]) {
      if (!leg) continue;
      leg.thigh.removeFromParent();
      leg.thigh.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.legL = buildLeg(this.mat, accent, true);
    this.legL.thigh.position.x = -0.12;
    this.legR = buildLeg(this.mat, accent, false);
    this.legR.thigh.position.x = 0.12;
    this.hips.add(this.legL.thigh, this.legR.thigh);
  }

  resize(aspect: number, vfov: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = Math.min(vfov, 70);
    this.camera.updateProjectionMatrix();
  }

  update(s: ViewmodelState, dt: number): void {
    this.t += dt;
    if (s.team !== this.team || this.palette !== paletteVersion) this.build(s.team);
    (this.boomerang.material as THREE.MeshBasicMaterial).color.set(TEAM_COLORS[s.team]);

    // what's in the right hand: the Boomerang, or the Laser (chosen with 2, or while it's away);
    // in CS mode a gun
    const gun = s.gun ?? null;
    const inHand = !gun && s.held && !s.laserOut;
    if (gun && this.lastShots !== null && (s.gunShots ?? 0) > this.lastShots) {
      this.kickDur = KICK_SEC[gun];
      this.kickT = this.kickDur;
      this.flashT = FLASH_SEC;
      const f = gun === 'ak' ? this.akFlash : this.deagleFlash;
      f.rotation.z = Math.random() * Math.PI;
      f.scale.setScalar(0.8 + Math.random() * 0.5);
    }
    this.lastShots = gun ? (s.gunShots ?? 0) : null;
    if (this.wasLaserOut !== null && this.wasLaserOut !== !!s.laserOut && s.held)
      this.drawT = DRAW_SEC; // switched weapon: the new one comes up into view
    this.wasLaserOut = !!s.laserOut;

    // --- one-shot triggers ---
    if (this.wasHeld === true && !s.held) {
      // released: a throw (a full wind-up swings harder)
      this.throwStrong = this.windupPeak >= 0.98;
      this.throwDur = this.throwStrong ? THROW_WINDUP_SEC : THROW_SEC;
      this.throwT = this.throwDur;
      this.drawT = 0;
    } else if (this.wasHeld === false && s.held) {
      this.catchT = CATCH_SEC;
      this.throwT = 0;
    }
    this.wasHeld = s.held;
    this.windupPeak = s.held && s.windup > 0 ? Math.max(this.windupPeak, s.windup) : 0;
    if (s.slashing) this.slashT = SLASH_SEC;
    // the Laser fires when its warning ends
    if (this.wasWarn && !s.laserWarn && !inHand) this.recoilT = RECOIL_SEC;
    this.wasWarn = s.laserWarn;
    const prevThrow = this.throwT;
    this.throwT = Math.max(0, this.throwT - dt);
    if (prevThrow > 0 && this.throwT === 0 && !inHand) this.drawT = DRAW_SEC;
    this.slashT = Math.max(0, this.slashT - dt);
    this.catchT = Math.max(0, this.catchT - dt);
    this.recoilT = Math.max(0, this.recoilT - dt);
    this.drawT = Math.max(0, this.drawT - dt);
    this.kickT = Math.max(0, this.kickT - dt);
    this.flashT = Math.max(0, this.flashT - dt);

    // --- base poses (eased) ---
    const armed = s.aiming || s.windup > 0;
    let rT: Pose6 = R_IDLE;
    let lT: Pose6 = L_IDLE;
    if (gun === 'ak') {
      rT = R_AK;
      lT = L_AK;
    } else if (gun === 'deagle') {
      rT = R_DEAGLE;
      lT = L_DEAGLE;
    } else if (!inHand) rT = R_LASER;
    else if (s.windup > 0) {
      const w = s.windup;
      // arm pulls further back and up toward the camera, wrist cocked
      rT = [0.15 + 0.03 * w, -0.08 + 0.01 * w, -0.27 + 0.04 * w, 0.3 + 0.25 * w, 0.7, 0.45];
      lT = L_WINDUP;
    } else if (s.aiming) {
      rT = R_AIM;
      lT = L_AIM;
    }
    const k = armed ? 16 : 12;
    for (let i = 0; i < 6; i++) {
      this.r[i] = damp(this.r[i], rT[i], k, dt);
      this.l[i] = damp(this.l[i], lT[i], k, dt);
    }

    // --- additive motion ---
    const bob = Math.sin(this.t * 9) * 0.008 * s.moving;
    const sway = Math.cos(this.t * 4.5) * 0.006 * s.moving;
    const breathe = Math.sin(this.t * 1.8) * 0.002;
    const r: Pose6 = [...this.r];
    const l: Pose6 = [...this.l];
    addPose(r, 1, [sway, bob + breathe, 0, 0, 0, 0]);
    addPose(l, 1, [sway, -bob + breathe, 0, 0, 0, 0]);

    if (this.throwT > 0) {
      // release: the hand whips forward and down across the screen, the off hand pulls back
      const u = 1 - this.throwT / this.throwDur;
      const env = u < 0.3 ? smooth(u / 0.3) : 1 - smooth((u - 0.3) / 0.7);
      const str = this.throwStrong ? 1.5 : 1;
      addPose(r, env * str, [-0.1, -0.05, -0.14, -0.9, -0.5, -0.4]);
      addPose(l, env * (this.throwStrong ? 1 : 0.4), [0.03, -0.05, 0.08, -0.2, 0.2, 0]);
    }
    if (this.catchT > 0) {
      // catch: a small bump back as it slaps into the hand
      const env = Math.sin(Math.PI * (1 - this.catchT / CATCH_SEC));
      addPose(r, env, [0.01, -0.035, 0.05, 0.35, 0, 0]);
    }
    if (this.slashT > 0) {
      // slash: a short wind to the right, then a flat swipe to the left and back
      const u = 1 - this.slashT / SLASH_SEC;
      const pre = smooth(u / 0.15) * (1 - smooth((u - 0.15) / 0.4));
      const sweep = smooth((u - 0.15) / 0.4) * (1 - smooth((u - 0.55) / 0.45));
      addPose(r, pre, [0.04, 0.02, 0, 0, 0.4, 0]);
      addPose(r, sweep, [-0.26, -0.02, -0.07, -0.3, -1.5, 0.7]);
    }
    if (this.recoilT > 0) {
      const e = (this.recoilT / RECOIL_SEC) ** 2;
      addPose(r, e, [0, 0.015, 0.07, 0.4, 0, 0]);
    }
    if (gun && this.kickT > 0) {
      // recoil: back into the shoulder and muzzle up; the Deagle kicks much harder
      const e = (this.kickT / this.kickDur) ** 2;
      const k: Pose6 =
        gun === 'ak' ? [0, 0.006, 0.035, 0.08, 0, 0.01] : [0, 0.03, 0.06, 0.55, 0, 0.05];
      addPose(r, e, k);
      addPose(l, e, k);
    }
    const reload = gun ? (s.gunReload01 ?? 0) : 0;
    if (reload > 0) {
      // reload: tip the gun over to the left and down, the off hand swaps the magazine
      const e = Math.sin(Math.PI * Math.min(1, reload * 1.15));
      addPose(r, e, [-0.03, -0.04, 0.02, 0.35, 0.35, 0.6]);
      const swap = Math.sin(Math.PI * Math.min(1, reload * 2)) * (reload < 0.5 ? 1 : 0);
      addPose(l, e, [-0.05, -0.08, 0.12, -0.4, 0, 0]);
      addPose(l, swap, [0, -0.12, 0.04, 0, 0, 0]);
    }
    if (!inHand && s.laserWarn) {
      // charging the shot: a slight tremble
      r[0] += Math.sin(this.t * 70) * 0.002;
      r[1] += Math.cos(this.t * 83) * 0.002;
    }
    if (this.drawT > 0) r[1] -= 0.14 * (this.drawT / DRAW_SEC) ** 2;
    if (inHand && s.windupFull) {
      r[0] += Math.sin(this.t * 60) * 0.0015;
      r[1] += Math.cos(this.t * 55) * 0.0015;
    }
    setPose(this.rArm, r);
    setPose(this.lArm, l);

    // --- what the right fist holds ---
    const throwing = this.throwT > 0;
    this.grip.visible = inHand;
    this.laser.visible = !gun && !inHand && !throwing;
    this.ak.visible = gun === 'ak';
    this.deagle.visible = gun === 'deagle';
    this.akFlash.visible = gun === 'ak' && this.flashT > 0;
    this.deagleFlash.visible = gun === 'deagle' && this.flashT > 0;
    if (inHand) {
      const spin = s.windup > 0 ? 6 + 30 * s.windup : 1.2;
      this.boomerang.rotation.y += dt * spin;
      this.boomerang.scale.setScalar(
        0.26 * (1 + 0.25 * Math.sin(Math.PI * (this.catchT / CATCH_SEC))),
      );
      const g = this.glow.material as THREE.MeshBasicMaterial;
      g.opacity = s.windupFull ? 0.55 + 0.25 * Math.sin(this.t * 20) : s.windup * 0.4;
      g.color.set(TEAM_COLORS[s.team]);
    } else if (!gun) {
      this.pips.forEach((p, i) => (p.visible = i < s.laserCharges));
      const hot = s.laserWarn || this.recoilT > RECOIL_SEC * 0.5;
      (this.tip.material as THREE.MeshBasicMaterial).color.set(hot ? 0xffffff : 0xff5a6a);
    }
    // wind-up charge also lights up your hands' rim
    this.mat.uniforms.rimStrength.value =
      0.35 + (inHand && s.windup > 0 ? s.windup * 0.8 + (s.windupFull ? 0.4 : 0) : 0);

    this.updateFeet(s, dt);
  }

  /** Your feet and lower legs, seen when looking down; a walk cycle while moving. */
  private updateFeet(s: ViewmodelState, dt: number): void {
    const pitch = s.pitch ?? 0;
    const crouched = !!s.crouched;
    const eyeTarget = crouched
      ? M.crouchHeight - M.eyeFromTopCrouch
      : M.standHeight - M.eyeFromTopStand;
    this.eyeH = damp(this.eyeH, eyeTarget, 14, dt);
    const move = s.move ?? Move.Ground;
    const grounded = s.grounded ?? true;
    const amt = Math.min(1, (s.moving * 9) / 6); // moving is speed / 9 on the ground
    this.phase += dt * Math.min(14, s.moving * 9 * 1.4);
    const sn = Math.sin(this.phase);
    const cs = Math.cos(this.phase);
    let hipT = LEG.thigh + LEG.shin + LEG.ankle - amt * 0.06;
    let f: [number, number, number, number];
    // folded legs keep the ankles in front of the hips: knees come up, never through the floor
    if (move === Move.Slide) {
      hipT = 0.25;
      f = [-0.45, 0.03, -0.2, 0];
    } else if (!grounded) {
      if (crouched) hipT = 0.3;
      f = crouched ? [-0.2, 0.1, -0.12, 0.05] : [-0.15, 0.25, 0.1, 0.1];
    } else if (crouched) {
      hipT = 0.3;
      const stride = 0.15 * amt;
      const lift = 0.06 * amt;
      f = [-0.2 - sn * stride, Math.max(0, cs) * lift, -0.2 + sn * stride, Math.max(0, -cs) * lift];
    } else {
      const stride = 0.28 * amt;
      f = [-sn * stride, Math.max(0, cs) * 0.16 * amt, sn * stride, Math.max(0, -cs) * 0.16 * amt];
    }
    this.hipH = damp(this.hipH, hipT, 12, dt);
    for (let i = 0; i < 4; i++) this.feet[i] = damp(this.feet[i], f[i], 20, dt);

    // hidden (and not drawn) unless you look well down, so they never block the view
    this.body.visible = s.pitch !== undefined && pitch < FEET_PITCH;
    if (!this.body.visible || !this.legL || !this.legR) return;
    this.body.rotation.x = -pitch;
    // a little ahead of the eye (as if bending to look), so the feet come into view
    this.hips.position.set(0, -(this.eyeH - this.hipH), -0.15);
    const drop = this.hipH - LEG.ankle;
    solveLeg(this.legL, this.feet[0], -drop + this.feet[1]);
    solveLeg(this.legR, this.feet[2], -drop + this.feet[3]);
    const splay = crouched ? 0.2 : 0.04;
    this.legL.thigh.rotation.z = -splay;
    this.legR.thigh.rotation.z = splay;
  }
}

const addPose = (p: Pose6, w: number, d: Pose6): void => {
  for (let i = 0; i < 6; i++) p[i] += d[i] * w;
};

const setPose = (g: THREE.Object3D, p: Pose6): void => {
  g.position.set(p[0], p[1], p[2]);
  g.rotation.set(p[3], p[4], p[5]);
};
