// "Training Bay": a compact combat arena for practice vs bots and balance runs.
import { v3 } from '../../math/vec3';
import { LevelBuilder } from '../builder';
import type { LevelDef, SpawnDef } from '../types';

const CYAN = 0x19e3ff;
const ORANGE = 0xff8a1f;
const VIOLET = 0xa46bff;

export const buildTrainingBay = (): LevelDef => {
  const b = new LevelBuilder();
  const W = 34; // half length (x)
  const D = 22; // half depth (z)
  const H = 14;
  b.room(v3(-W, 0, -D), v3(W, H, D), 1, {}, { trim: CYAN });

  // team-colored end walls
  b.box(v3(-W, 0, -D), v3(-W + 0.3, 3, D), { mat: 'teamA', trim: CYAN });
  b.box(v3(W - 0.3, 0, -D), v3(W, 3, D), { mat: 'teamB', trim: ORANGE });

  // mirrored cover (x and -x)
  for (const s of [1, -1]) {
    const t = s > 0 ? ORANGE : CYAN;
    b.block(v3(s * 22, 0.55, 0), v3(1.2, 1.1, 8), { trim: t }); // waist-high line
    b.block(v3(s * 16, 1.5, -12), v3(4, 3, 1.2), { mat: 'panel', trim: t }); // tall wall
    b.block(v3(s * 16, 1.5, 12), v3(4, 3, 1.2), { mat: 'panel', trim: t });
    b.block(v3(s * 10, 0.5, -5), v3(1.4, 1, 1.4));
    b.block(v3(s * 10, 0.5, 6), v3(1.4, 1, 1.4));
    b.block(v3(s * 27, 1.25, -15), v3(3, 2.5, 3), { mat: 'panel', trim: t });
    b.block(v3(s * 27, 1.25, 15), v3(3, 2.5, 3), { mat: 'panel', trim: t });
    // pillars
    b.block(v3(s * 6, H / 2, -14), v3(1.4, H, 1.4), { mat: 'pillar' });
    b.block(v3(s * 6, H / 2, 14), v3(1.4, H, 1.4), { mat: 'pillar' });
  }
  // central raised platform with two ramps
  b.box(v3(-5, 0, -4), v3(5, 3, 4), { mat: 'panel', trim: VIOLET });
  b.ramp('z', -4, -12, 3, 0, 0, 5, { mat: 'floor' });
  b.ramp('z', 4, 12, 3, 0, 0, 5, { mat: 'floor' });
  // balcony along the back wall with ramps up at both ends
  b.box(v3(-18, 5.4, -D), v3(18, 6, -D + 3.5), { mat: 'floor', trim: VIOLET });
  b.ramp('x', -30, -18, 0, 6, -D + 1.75, 3.5, { mat: 'floor' });
  b.ramp('x', 30, 18, 0, 6, -D + 1.75, 3.5, { mat: 'floor' });

  const spawns: SpawnDef[] = [];
  for (const [team, sx] of [
    [0, -1],
    [1, 1],
  ] as const) {
    for (const z of [-10, -3.5, 3.5, 10]) {
      spawns.push({ pos: v3(sx * 31, 0, z), yawDeg: sx < 0 ? -90 : 90, team });
    }
  }

  return b.build({
    name: 'Training Bay',
    boundsMin: v3(-W - 2, -2, -D - 2),
    boundsMax: v3(W + 2, H + 2, D + 2),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails: [{ points: [v3(-20, 8.2, 10), v3(20, 8.2, 10)] }],
    pads: [],
    spawns,
    towers: [],
    areas: [
      { name: 'Cyan side', pos: v3(-30, 0, 0), yawDeg: -90 },
      { name: 'Orange side', pos: v3(30, 0, 0), yawDeg: 90 },
      { name: 'Center platform', pos: v3(0, 3, 0), yawDeg: -90 },
    ],
    fog: { color: 0x060912, near: 35, far: 120 },
    ambient: 0.85,
    lights: [
      ...[-20, 0, 20].flatMap((x) =>
        [-9, 9].map((z) => ({
          pos: v3(x, 12.5, z),
          color: 0xffe0b0,
          radius: 15,
          intensity: 0.95,
          shaft: true,
        })),
      ),
      { pos: v3(-31, 4, 0), color: CYAN, radius: 10, intensity: 1 },
      { pos: v3(31, 4, 0), color: ORANGE, radius: 10, intensity: 1 },
      { pos: v3(0, 5, 0), color: VIOLET, radius: 8, intensity: 0.8 },
    ],
  });
};
