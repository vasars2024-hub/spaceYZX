// "Proving Grounds": the Milestone 2 movement test ship.
// Hangar (normal gravity) + zero-G cargo bay (+X) + wall-gravity engine corridor (-X) + flip room.
import { v3 } from '../../math/vec3';
import { LevelBuilder } from '../builder';
import type { LevelDef } from '../types';

const CYAN = 0x19e3ff;
const ORANGE = 0xff8a1f;
const VIOLET = 0xa46bff;
const GREEN = 0x3dff9a;

export const buildTestShip = (): LevelDef => {
  const b = new LevelBuilder();
  const door = { u0: -4, u1: 4, v0: 0, v1: 7 };
  const corridorDoor = { u0: -4, u1: 4, v0: 0, v1: 8 };

  // ---------------- Hangar ----------------
  b.room(
    v3(-30, 0, -20),
    v3(30, 16, 20),
    1,
    { '+x': [door], '-x': [corridorDoor] },
    { trim: CYAN },
  );
  // slide ramp platform + ramp (down toward +z)
  b.box(v3(-28, 0, -19), v3(-16, 4, -7), { mat: 'panel', trim: ORANGE });
  b.ramp('z', -7, 9, 4, 0, -22, 12, { mat: 'floor' });
  // waist-high crates (vault)
  b.block(v3(4, 0.5, 2), v3(1.4, 1, 1.4));
  b.block(v3(8, 0.55, -2), v3(2, 1.1, 2));
  b.block(v3(12, 0.5, 6), v3(3, 1, 1));
  // ledges to climb (1.8 m and 2.5 m)
  b.box(v3(14, 0, -10), v3(18, 1.8, -6), { mat: 'panel', trim: CYAN });
  b.box(v3(20, 0, 2), v3(24, 2.5, 8), { mat: 'panel', trim: CYAN });
  // wall-jump chimney
  b.box(v3(24, 0, 10), v3(24.8, 14, 18), { mat: 'pillar', trim: VIOLET });
  b.box(v3(27.2, 0, 10), v3(28, 14, 18), { mat: 'pillar', trim: VIOLET });
  // balcony along the back wall + ramp up to it
  b.box(v3(-12, 5.4, -20), v3(28, 6, -14.5), { mat: 'floor', trim: ORANGE });
  b.ramp('x', 10, 26, 0, 6, -12.5, 4, { mat: 'floor' });
  // pillars for strafing practice
  for (const x of [-8, 0, 8]) b.block(v3(x, 8, -3), v3(1.2, 16, 1.2), { mat: 'pillar' });
  // small step ledges (0.3 m) — should just step up
  b.box(v3(-12, 0, 10), v3(-6, 0.3, 16), { mat: 'panel' });

  // ---------------- Zero-G cargo bay (+X) ----------------
  b.room(
    v3(31, -6, -15),
    v3(61, 24, 15),
    1,
    { '-x': [{ u0: -4, u1: 4, v0: 0, v1: 7 }] },
    { trim: VIOLET },
  );
  b.box(v3(31, -0.5, -4), v3(36, 0, 4), { mat: 'floor', trim: GREEN }); // entry walkway
  b.block(v3(45, 8, 0), v3(4, 4, 4), { trim: VIOLET });
  b.block(v3(52, 14, -8), v3(3, 6, 3), { trim: VIOLET });
  b.block(v3(40, 16, 8), v3(5, 2, 5), { trim: VIOLET });
  b.block(v3(55, 2, 6), v3(4, 4, 4), { trim: VIOLET });
  b.block(v3(48, -2, -10), v3(3, 3, 3), { trim: VIOLET });

  // ---------------- Wall-gravity engine corridor (-X) ----------------
  b.room(
    v3(-70, 0, -4),
    v3(-31, 8, 4),
    1,
    { '-x': [corridorDoor], '+x': [corridorDoor] },
    { wall: 'engine', trim: ORANGE },
  );
  // conduits on the +z wall (a floor while gravity pulls into it)
  b.box(v3(-44, 1, 3), v3(-40, 3, 4), { mat: 'engine', trim: ORANGE });
  b.box(v3(-38, 5, 2.6), v3(-35, 7, 4), { mat: 'engine', trim: ORANGE });
  // conduits on the ceiling section
  b.box(v3(-54, 7, -2), v3(-50, 8, 1), { mat: 'engine', trim: ORANGE });
  b.box(v3(-66, 2, 2.5), v3(-62, 6, 4), { mat: 'engine', trim: ORANGE });

  // ---------------- Flip room ----------------
  b.room(v3(-88, 0, -9), v3(-71, 12, 9), 1, { '+x': [corridorDoor] }, { trim: GREEN });
  b.box(v3(-81, 0, -1.5), v3(-78, 0.05, 1.5), { mat: 'trim', color: GREEN, noCollide: true });
  b.block(v3(-84, 1, -5), v3(2, 2, 2));
  b.block(v3(-76, 11, 5), v3(2, 2, 2));
  b.block(v3(-84, 11, 5), v3(3, 2, 3));

  return b.build({
    name: 'Proving Grounds',
    boundsMin: v3(-90, -8, -22),
    boundsMax: v3(63, 26, 22),
    defaultGravity: v3(0, -1, 0),
    zones: [
      { name: 'cargo-zero-g', min: v3(36, -7, -16), max: v3(62, 25, 16), gravity: v3(0, 0, 0) },
      { name: 'corridor-a', min: v3(-45, -1, -5), max: v3(-33, 9, 5), gravity: v3(0, 0, 1) },
      { name: 'corridor-b', min: v3(-57, -1, -5), max: v3(-45, 9, 5), gravity: v3(0, 1, 0) },
      { name: 'corridor-c', min: v3(-68, -1, -5), max: v3(-57, 9, 5), gravity: v3(0, 0, 1) },
      { name: 'flip-room', min: v3(-89, -1, -10), max: v3(-71, 13, 10), gravity: v3(0, -1, 0) },
    ],
    rails: [{ points: [v3(-24, 6.6, -10), v3(20, 5, 16)] }],
    pads: [
      {
        min: v3(-81, 0, -1.5),
        max: v3(-78, 2, 1.5),
        zone: 'flip-room',
        gravity: v3(0, 1, 0),
        durationSec: 5,
        cooldownSec: 3,
      },
    ],
    spawns: [{ pos: v3(0, 0, 14), yawDeg: 0 }],
    towers: [],
    areas: [
      { name: 'Hangar', pos: v3(0, 0, 14), yawDeg: 0 },
      { name: 'Ramp top', pos: v3(-22, 4, -15), yawDeg: 180 },
      { name: 'Rail start', pos: v3(-24, 4, -12), yawDeg: 180 },
      { name: 'Wall-jump chimney', pos: v3(26, 0, 19), yawDeg: 0 },
      { name: 'Zero-G bay', pos: v3(33, 0, 0), yawDeg: -90 },
      { name: 'Wall-gravity corridor', pos: v3(-28, 0, 0), yawDeg: 90 },
      { name: 'Flip room', pos: v3(-73, 0, 0), yawDeg: 90 },
    ],
    fog: { color: 0x060912, near: 30, far: 140 },
    ambient: 0.9,
    lights: [
      { pos: v3(0, 11, 14), color: 0xffe0b0, radius: 16, intensity: 1, shaft: true },
      { pos: v3(-18, 11, -12), color: 0xffe0b0, radius: 14, intensity: 0.9, shaft: true },
      { pos: v3(12, 11, -8), color: 0xbcd4ff, radius: 14, intensity: 0.9, shaft: true },
      { pos: v3(26, 10, 19), color: 0xbcd4ff, radius: 10, intensity: 0.8 },
      { pos: v3(48, 8, 0), color: 0xa46bff, radius: 18, intensity: 1 },
      { pos: v3(-45, 5, 0), color: 0xff5a3c, radius: 14, intensity: 1 },
      { pos: v3(-80, 10, 0), color: 0xbcd4ff, radius: 14, intensity: 0.9 },
    ],
  });
};
