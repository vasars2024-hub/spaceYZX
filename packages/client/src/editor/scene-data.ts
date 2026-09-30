// MAP MAKER — turning the doc into what the editor draws and clicks: every piece with the thing
// it belongs to (a Ref), the gameplay markers, the moving blocks. No Three.js here.
import type { BoxDef, CustomBlock, LevelDef, Vec3 } from '@space-yz/shared';
import { customBlockQuat, customMoverOffset, expandCustomBlock, v3 } from '@space-yz/shared';
import type { EditDoc, Ref, V3 } from './model';
import { boxBounds } from './pick';
import type { MarkerSpec, MoverSpec } from './viewport';

export interface PickPiece {
  ref: Ref;
  box: BoxDef;
  min: Vec3;
  max: Vec3;
}

const expandCache = new WeakMap<CustomBlock, BoxDef[]>();

/** The pieces a block is built from (world space; cached per block object). */
export const blockBoxes = (b: CustomBlock): BoxDef[] => {
  let out = expandCache.get(b);
  if (!out) {
    try {
      out = expandCustomBlock(b);
    } catch {
      out = [];
    }
    expandCache.set(b, out);
  }
  return out;
};

export const piece = (ref: Ref, box: BoxDef): PickPiece => ({ ref, box, ...boxBounds(box) });

const p3 = (a: V3): Vec3 => v3(a[0], a[1], a[2]);

/** A volume (gate, portal, pad) as a box, turned to `yaw`. */
export const volumeBox = (pos: V3, size: V3, yaw = 0): BoxDef => {
  const q = customBlockQuat([yaw, 0, 0]);
  const b: BoxDef = { c: p3(pos), h: v3(size[0] / 2, size[1] / 2, size[2] / 2) };
  if (q) b.q = q;
  return b;
};

/** The compass heading as a flat direction (0 = -z, 90 = +x). */
export const headingDir = (yaw: number, len = 1): V3 => {
  const a = (yaw * Math.PI) / 180;
  return [Math.sin(a) * len, 0, -Math.cos(a) * len];
};

export const SPAWN_BOX: V3 = [0.8, 1.8, 0.8];
export const EXIT_BOX: V3 = [0.8, 0.8, 0.8];
const TEAM_COLORS = [0x19e3ff, 0xff8a1f];

export interface SceneData {
  /** blocks that stay put */
  docBoxes: BoxDef[];
  movers: MoverSpec[];
  markers: MarkerSpec[];
  /** everything clickable except the base map (see basePieces) */
  pieces: PickPiece[];
}

/** Build what the editor draws for a doc (base map boxes are separate: basePieces). */
export const sceneData = (
  e: EditDoc,
  selected: (r: Ref) => boolean,
  base: LevelDef | null,
): SceneData => {
  const docBoxes: BoxDef[] = [];
  const pieces: PickPiece[] = [];
  const movers: MoverSpec[] = [];
  const markers: MarkerSpec[] = [];
  const moving = new Map(e.movers.map((m) => [m.block, m] as const));
  for (const b of e.blocks) {
    const boxes = blockBoxes(b);
    const ref: Ref = { k: 'block', id: b.id };
    for (const box of boxes) pieces.push(piece(ref, box));
    const m = moving.get(b.id);
    if (!m) {
      docBoxes.push(...boxes);
      continue;
    }
    const pts: V3[] = [b.pos, ...m.points.slice(1)];
    // the numbered ghosts of points 2-4 are clickable (to move or delete a point)
    pts.forEach((p, i) => {
      if (i === 0) return;
      const d = v3(p[0] - b.pos[0], p[1] - b.pos[1], p[2] - b.pos[2]);
      for (const box of boxes)
        pieces.push(
          piece(
            { k: 'point', id: b.id, i },
            { ...box, c: v3(box.c.x + d.x, box.c.y + d.y, box.c.z + d.z) },
          ),
        );
    });
    const mover = { block: b.id, points: pts, speed: m.speed, delay: m.delay };
    movers.push({
      boxes,
      points: pts,
      origin: b.pos,
      posAt: (t) => (pts.length >= 2 ? customMoverOffset(mover, t) : b.pos),
      selected: selected(ref),
    });
  }
  // race gates
  const gate = (ref: Ref, g: { pos: V3; size: V3; yaw: number }, color: number, label: string) => {
    const box = volumeBox(g.pos, g.size, g.yaw);
    markers.push({ box, color, kind: 'volume', label, arrow: headingDir(g.yaw, 3) });
    pieces.push(piece(ref, box));
  };
  if (e.race.start) gate({ k: 'start' }, e.race.start, 0x3dff9a, 'START');
  e.race.checkpoints.forEach((g, i) => gate({ k: 'cp', i }, g, 0xffd23f, `CHECKPOINT ${i + 1}`));
  if (e.race.finish) gate({ k: 'finish' }, e.race.finish, 0xff4a5e, 'FINISH');
  // spawns: a body-sized post with an arrow
  e.spawns.forEach((s, i) => {
    const box = volumeBox([s.pos[0], s.pos[1] + SPAWN_BOX[1] / 2, s.pos[2]], SPAWN_BOX, s.yaw);
    const color = s.team === undefined ? 0xf2f4f8 : TEAM_COLORS[s.team];
    markers.push({ box, color, kind: 'solid', arrow: headingDir(s.yaw, 1.5) });
    pieces.push(piece({ k: 'spawn', i }, box));
  });
  // portals: the entry volume, a line to the exit, the exit
  e.portals.forEach((p, i) => {
    const color = p.color ?? 0x38e8ff;
    const box = volumeBox(p.from.pos, p.from.size);
    markers.push({
      box,
      color,
      kind: 'volume',
      label: `PORTAL ${i + 1}${p.twoWay ? ' ⇄' : ''}`,
      lineTo: p.to,
    });
    pieces.push(piece({ k: 'portal', i, end: 'from' }, box));
    const exit = volumeBox(p.to, p.twoWay ? p.from.size : EXIT_BOX);
    markers.push({ box: exit, color, kind: p.twoWay ? 'volume' : 'solid', label: `EXIT ${i + 1}` });
    pieces.push(piece({ k: 'portal', i, end: 'to' }, exit));
  });
  e.launchPads.forEach((p, i) => {
    const box = volumeBox(p.pos, p.size);
    markers.push({
      box,
      color: 0xffb347,
      kind: 'volume',
      arrow: [p.vel[0] * 0.25, p.vel[1] * 0.25, p.vel[2] * 0.25],
    });
    pieces.push(piece({ k: 'pad', i }, box));
  });
  // the built-in map's race (kept unless this edit gives a whole race of its own): shown dimmed
  const br = base?.race;
  if (br && e.patch && !(e.race.start && e.race.finish)) {
    const gateBox = (g: { min: Vec3; max: Vec3 }): BoxDef => ({
      c: v3((g.min.x + g.max.x) / 2, (g.min.y + g.max.y) / 2, (g.min.z + g.max.z) / 2),
      h: v3((g.max.x - g.min.x) / 2, (g.max.y - g.min.y) / 2, (g.max.z - g.min.z) / 2),
    });
    br.checkpoints.forEach((g, i) =>
      markers.push({
        box: gateBox(g),
        color: 0x8a7a3a,
        kind: 'volume',
        label: `${i + 1}`,
        labelColor: '#c9b46a',
      }),
    );
    markers.push({
      box: gateBox(br.finish),
      color: 0x8a3a44,
      kind: 'volume',
      label: 'FINISH',
      labelColor: '#d98a93',
    });
    const s = br.start.respawn;
    markers.push({
      box: { c: v3(s.x, s.y + 0.9, s.z), h: v3(0.4, 0.9, 0.4) },
      color: 0x3a8a5a,
      kind: 'volume',
      label: 'START',
      labelColor: '#8ad9a8',
    });
  }
  // the built-in map's own portals and pads (an edit of it can delete them)
  if (base && e.patch) {
    const gone = new Set(e.patch.removedPortals ?? []);
    (base.portals ?? []).forEach((p, i) => {
      if (gone.has(i)) return;
      const box: BoxDef = {
        c: v3((p.min.x + p.max.x) / 2, (p.min.y + p.max.y) / 2, (p.min.z + p.max.z) / 2),
        h: v3((p.max.x - p.min.x) / 2, (p.max.y - p.min.y) / 2, (p.max.z - p.min.z) / 2),
      };
      markers.push({ box, color: p.color, kind: 'volume', lineTo: [p.exit.x, p.exit.y, p.exit.z] });
      pieces.push(piece({ k: 'basePortal', i }, box));
    });
    const padsGone = new Set(e.patch.removedLaunchPads ?? []);
    (base.launchPads ?? []).forEach((p, i) => {
      if (padsGone.has(i)) return;
      const box: BoxDef = {
        c: v3((p.min.x + p.max.x) / 2, (p.min.y + p.max.y) / 2, (p.min.z + p.max.z) / 2),
        h: v3((p.max.x - p.min.x) / 2, (p.max.y - p.min.y) / 2, (p.max.z - p.min.z) / 2),
      };
      markers.push({
        box,
        color: 0xffb347,
        kind: 'volume',
        arrow: [p.vel.x * 0.25, p.vel.y * 0.25, p.vel.z * 0.25],
      });
      pieces.push(piece({ k: 'basePad', i }, box));
    });
  }
  return { docBoxes, movers, markers, pieces };
};
