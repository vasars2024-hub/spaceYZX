// Portal previews: a portal that knows the way through it (PortalDef.dir: surf maps' portals)
// shows where it leads — the view from its exit, turned the way the portal turns you — in its
// disc, rendered into a small texture while you are near it. One portal is refreshed per frame
// (the nearest first), at low resolution: a few extra draws, only near portals.
import * as THREE from 'three';
import type { LevelDef, Vec3 } from '@space-yz/shared';
import { v3 } from '@space-yz/shared';

/** Previews update while you are this close to the portal (m). */
const RANGE = 260;
const SIZE = 256;

interface Preview {
  center: Vec3;
  target: THREE.WebGLRenderTarget;
  camera: THREE.PerspectiveCamera;
  disc: THREE.Mesh;
  /** the disc's own look, while it shows no preview */
  plain: THREE.Material;
  view: THREE.MeshBasicMaterial;
}

export class PortalPreviews {
  private list: Preview[] = [];
  private turn = 0;

  constructor(def: LevelDef, group: THREE.Object3D) {
    const portals = def.portals ?? [];
    group.traverse((o) => {
      const i = o.userData.portalIndex as number | undefined;
      if (i === undefined || !(o instanceof THREE.Mesh)) return;
      const pt = portals[i];
      if (!pt?.dir) return;
      // the exit view: along the way through, turned as the portal turns you
      const a = (-(pt.turn ?? 0) * Math.PI) / 180;
      const d = pt.dir;
      const out = v3(
        d.x * Math.cos(a) + d.z * Math.sin(a),
        0,
        -d.x * Math.sin(a) + d.z * Math.cos(a),
      );
      const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 900);
      camera.position.set(pt.exit.x, pt.exit.y + 0.7, pt.exit.z);
      camera.lookAt(pt.exit.x + out.x * 10, pt.exit.y + 0.2, pt.exit.z + out.z * 10);
      camera.updateMatrixWorld();
      const target = new THREE.WebGLRenderTarget(SIZE, SIZE);
      target.texture.colorSpace = THREE.SRGBColorSpace;
      const view = new THREE.MeshBasicMaterial({
        map: target.texture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        fog: false,
      });
      this.list.push({
        center: v3((pt.min.x + pt.max.x) / 2, (pt.min.y + pt.max.y) / 2, (pt.min.z + pt.max.z) / 2),
        target,
        camera,
        disc: o,
        plain: o.material as THREE.Material,
        view,
      });
    });
  }

  get active(): boolean {
    return this.list.length > 0;
  }

  /** Before the frame is drawn: refresh the nearest portal in range (one per frame). */
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, eye: Vec3): void {
    if (!this.list.length) return;
    const near = this.list
      .map((p) => ({
        p,
        d: Math.hypot(p.center.x - eye.x, p.center.y - eye.y, p.center.z - eye.z),
      }))
      .filter((x) => x.d < RANGE);
    for (const p of this.list) if (!near.some((x) => x.p === p)) p.disc.material = p.plain;
    if (!near.length) return;
    near.sort((a, b) => a.d - b.d);
    const p = near[this.turn++ % Math.min(2, near.length)].p;
    // (the disc must not see itself: hide it for its own render)
    p.disc.visible = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(p.target);
    renderer.render(scene, p.camera);
    renderer.setRenderTarget(prev);
    p.disc.visible = true;
    p.disc.material = p.view;
  }

  dispose(): void {
    for (const p of this.list) {
      p.disc.material = p.plain;
      p.target.dispose();
      p.view.dispose();
    }
    this.list = [];
  }
}
