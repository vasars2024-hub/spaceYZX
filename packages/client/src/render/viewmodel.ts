// First-person viewmodel: your Boomerang in hand (spins faster and glows while winding up) or
// the Laser emitter with its charge lights while the Boomerang is away.
import * as THREE from 'three';
import { BOOMERANG_GEO } from './combat-view';
import { TEAM_COLORS } from './players';

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
}

export class Viewmodel {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  private hand = new THREE.Group();
  private boomerang: THREE.Mesh;
  private glow: THREE.Mesh;
  private laser = new THREE.Group();
  private pips: THREE.Mesh[] = [];
  private tip: THREE.Mesh;
  private t = 0;
  private slashT = 0;

  constructor() {
    this.scene.add(this.camera);
    this.camera.add(this.hand);
    this.boomerang = new THREE.Mesh(
      BOOMERANG_GEO,
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[0] }),
    );
    this.boomerang.scale.setScalar(0.2);
    this.glow = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.09, 24),
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
    this.hand.add(this.boomerang, this.glow);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.035, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x3a4458 }),
    );
    this.tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.025, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xff5a6a }),
    );
    this.tip.position.z = -0.09;
    this.laser.add(body, this.tip);
    for (let i = 0; i < 3; i++) {
      const pip = new THREE.Mesh(
        new THREE.BoxGeometry(0.009, 0.009, 0.02),
        new THREE.MeshBasicMaterial({ color: 0xff5a6a }),
      );
      pip.position.set(0.024, 0.01 - i * 0.011, 0.01);
      this.pips.push(pip);
      this.laser.add(pip);
    }
    this.camera.add(this.laser);
  }

  resize(aspect: number, vfov: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = Math.min(vfov, 70);
    this.camera.updateProjectionMatrix();
  }

  update(s: ViewmodelState, dt: number): void {
    this.t += dt;
    const bob = Math.sin(this.t * 9) * 0.008 * s.moving;
    (this.boomerang.material as THREE.MeshBasicMaterial).color.set(TEAM_COLORS[s.team]);
    this.hand.visible = s.held;
    this.laser.visible = !s.held;
    if (s.slashing) this.slashT = 0.18;
    this.slashT = Math.max(0, this.slashT - dt);
    const slash = this.slashT / 0.18;
    if (s.held) {
      const aimPull = s.aiming || s.windup > 0 ? 1 : 0;
      this.hand.position.set(
        0.15 - aimPull * 0.06 - slash * 0.12,
        -0.12 + bob + aimPull * 0.03,
        -0.36 - slash * 0.08,
      );
      this.hand.rotation.set(-0.3 + slash * 1.2, 0.4 - slash * 1.6, 0.1);
      const spin = s.windup > 0 ? 6 + 30 * s.windup : 1.2;
      this.boomerang.rotation.y += dt * spin;
      const g = this.glow.material as THREE.MeshBasicMaterial;
      g.opacity = s.windupFull ? 0.55 + 0.25 * Math.sin(this.t * 20) : s.windup * 0.4;
      g.color.set(TEAM_COLORS[s.team]);
    } else {
      this.laser.position.set(0.14, -0.12 + bob, -0.3);
      this.laser.rotation.set(0, 0.05, 0);
      this.pips.forEach((p, i) => (p.visible = i < s.laserCharges));
      (this.tip.material as THREE.MeshBasicMaterial).color.set(s.laserWarn ? 0xffffff : 0xff5a6a);
    }
  }
}
