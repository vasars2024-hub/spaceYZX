// Moving blocks (LevelDef.movers): each mover's boxes baked into their own little mesh (the
// static level mesh leaves them out), moved every frame to where the sim has them. Their place
// is a pure function of the tick (level/movers.ts), so drawing is just asking for a tick: the
// local player's predicted tick plus the frame's fraction, the time you stand on them in.
import * as THREE from 'three';
import type { LevelDef } from '@space-yz/shared';
import { moverTimeline, timelineAt, v3 } from '@space-yz/shared';
import { buildLevelMeshes, type LevelMeshOptions } from './level-mesh';

export interface MoverMeshes {
  group: THREE.Group;
  /** place every mover at `tick` (fractional ticks allowed) */
  update(tick: number): void;
  dispose(): void;
}

/** Meshes for a level's movers (null: nothing moves on this map). */
export const buildMoverMeshes = (
  def: LevelDef,
  opts: Pick<LevelMeshOptions, 'brightness'> = {},
): MoverMeshes | null => {
  const movers = def.movers ?? [];
  if (!movers.length) return null;
  const group = new THREE.Group();
  const parts = movers.map((m) => {
    const meshes = buildLevelMeshes(
      {
        name: def.name,
        boundsMin: def.boundsMin,
        boundsMax: def.boundsMax,
        defaultGravity: def.defaultGravity,
        boxes: m.boxes.map((i) => def.boxes[i]).filter((b) => !!b),
        zones: [],
        rails: [],
        pads: [],
        spawns: [],
        towers: [],
        // the same light as the rest of the map
        ambient: def.ambient,
        outdoor: def.outdoor,
        sideTint: def.sideTint,
      },
      { brightness: opts.brightness, boxesOnly: true },
    );
    group.add(meshes.group);
    return { meshes, timeline: moverTimeline(m.path, m.speed, m.delay) };
  });
  const at = v3();
  return {
    group,
    update: (tick) => {
      for (const p of parts) {
        timelineAt(p.timeline, tick, at);
        p.meshes.group.position.set(at.x, at.y, at.z);
      }
    },
    dispose: () => parts.forEach((p) => p.meshes.dispose()),
  };
};
