// "Arena" — the Arena 1v1 map (rules/arena.ts). Four identical duel pits, 64 m apart along z
// and each sealed on every side (floor, walls, ceiling), so up to four duels run at once and
// nobody can see or hit into another pit. Every pit is mirror-symmetric across x = 0.
//
// One pit, seen from above (x along the fight, z across; 40 × 24 m inside, 11 m high):
//
//   z +12  ┌──────────────────────────────────────────────┐
//          │      ramp ⟋ ███ UPPER GROUND (y 3) ███ ⟍ ramp │
//   z  +7  │              ▀▀▀▀ parapets ▀▀▀▀              │
//          │   ▫         ■                ■         ▫     │
//   z   0  │ A      ▮          ▬▬ crate ▬▬       ▮      B │   A: team 0 spawn (x -17)
//          │   ▫         ■                ■         ▫     │   B: team 1 spawn (x +17)
//   z  -7  │              ▄▄▄▄ parapets ▄▄▄▄              │
//          │      ramp ⟍ ███ UPPER GROUND (y 3) ███ ⟋ ramp │
//   z -12  └──────────────────────────────────────────────┘
//        x -20                                        x +20
//
// The middle is flat with crates for cover (a waist-high crate in the centre, two tall crates
// either side, a wall of cover in front of each spawn, low crates by the spawns). Along both
// long sides runs the upper ground: a 3 m high platform with parapets, reached by a 27° ramp
// at each end (or the jetpack). Lights are baked (no shafts: each would be a draw call).
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { LevelBuilder } from '../builder';
import { buildLevel } from '../level';
import { lineOfSight } from '../collision';
import type { ArenaPitDef, LevelDef, LightDef, SpawnDef, WaypointDef } from '../types';

const CYAN = 0x19e3ff;
const ORANGE = 0xff8a1f;
const VIOLET = 0xa46bff;
const LAMP = 0xffe6c4;

/** Key numbers of one pit (local coordinates: x along the fight, z across, floor at y 0). */
export const ARENA_MAP = {
  pits: 4,
  /** distance between pit centres along z */
  spacing: 64,
  halfLength: 20, // x
  halfWidth: 12, // z
  height: 11,
  /** upper ground: top height, x half-length, inner edge (|z|) */
  upper: { y: 3, halfX: 9, inner: 7 },
  /** ramps from the upper ground's ends down to the floor (x from 9 to 15) */
  ramp: { top: 9, foot: 15, width: 4.4 },
  spawnX: 17,
};

/** Centre z of pit `i` (pit 0 is the top pit). */
export const arenaPitZ = (i: number): number => (i - (ARENA_MAP.pits - 1) / 2) * ARENA_MAP.spacing;

export const buildArena = (): LevelDef => {
  const A = ARENA_MAP;
  const L = A.halfLength;
  const W = A.halfWidth;
  const H = A.height;
  const U = A.upper;
  const b = new LevelBuilder();
  const lights: LightDef[] = [];
  const spawns: SpawnDef[] = [];
  const pits: ArenaPitDef[] = [];
  const wps: { pos: Vec3; pit: number }[] = [];
  const ramps: [number, number][] = []; // waypoint index pairs: ramp foot <-> top

  for (let i = 0; i < A.pits; i++) {
    const zc = arenaPitZ(i);
    b.room(v3(-L, 0, zc - W), v3(L, H, zc + W), 1, {}, { floor: 'plate' });
    // team-colored end walls behind the spawns
    b.box(v3(-L, 0, zc - W), v3(-L + 0.3, 3, zc + W), { mat: 'teamA', trim: CYAN });
    b.box(v3(L - 0.3, 0, zc - W), v3(L, 3, zc + W), { mat: 'teamB', trim: ORANGE });

    for (const s of [-1, 1]) {
      // upper ground along the side wall, parapets on its inner edge (gaps to drop down)
      b.box(v3(-U.halfX, 0, zc + s * U.inner), v3(U.halfX, U.y, zc + s * W), {
        mat: 'panel',
        trim: VIOLET,
      });
      for (const sx of [-1, 1])
        b.box(v3(sx * 2, U.y, zc + s * U.inner), v3(sx * 6, U.y + 0.9, zc + s * (U.inner + 0.5)), {
          mat: 'crate',
        });
      // ramps at both ends, 3 m over 6 m (27°)
      for (const sx of [-1, 1])
        b.ramp(
          'x',
          sx * A.ramp.top,
          sx * A.ramp.foot,
          U.y,
          0,
          zc + s * (U.inner + (W - U.inner) / 2),
          A.ramp.width,
          { mat: 'floor' },
        );
    }

    // the middle: a waist-high crate in the centre, tall crates, spawn cover, low crates
    b.block(v3(0, 0.65, zc), v3(2, 1.3, 4));
    for (const sx of [-1, 1]) {
      for (const s of [-1, 1]) {
        b.block(v3(sx * 6, 1, zc + s * 3.5), v3(1.6, 2, 1.6));
        b.block(v3(sx * 15.5, 0.55, zc + s * 4.5), v3(1.2, 1.1, 1.2));
      }
      b.block(v3(sx * 11, 1.2, zc), v3(1, 2.4, 3.6), { mat: 'panel' });
    }

    const pitSpawns: [SpawnDef, SpawnDef] = [
      { pos: v3(-A.spawnX, 0, zc), yawDeg: -90, team: 0 },
      { pos: v3(A.spawnX, 0, zc), yawDeg: 90, team: 1 },
    ];
    spawns.push(...pitSpawns);
    pits.push({
      center: v3(0, 0, zc),
      min: v3(-L, 0, zc - W),
      max: v3(L, H, zc + W),
      spawns: pitSpawns,
    });

    lights.push(
      { pos: v3(0, H - 0.5, zc), color: LAMP, radius: 16, intensity: 0.9 },
      { pos: v3(-12, H - 0.5, zc), color: LAMP, radius: 14, intensity: 0.8 },
      { pos: v3(12, H - 0.5, zc), color: LAMP, radius: 14, intensity: 0.8 },
      { pos: v3(-L + 1.5, 3.5, zc), color: CYAN, radius: 9, intensity: 1 },
      { pos: v3(L - 1.5, 3.5, zc), color: ORANGE, radius: 9, intensity: 1 },
      { pos: v3(0, 6.5, zc - 9.5), color: VIOLET, radius: 9, intensity: 0.7 },
      { pos: v3(0, 6.5, zc + 9.5), color: VIOLET, radius: 9, intensity: 0.7 },
    );

    // bot waypoints (1 m above the floor): a grid over the middle, the ramps, the upper ground
    for (const x of [-17, -13, -8.5, -3.5, 0, 3.5, 8.5, 13, 17])
      for (const z of [-5, 0, 5])
        if (x !== 0 || z !== 0) wps.push({ pos: v3(x, 1, zc + z), pit: i });
    const upperZ = U.inner + (W - U.inner) / 2;
    for (const s of [-1, 1]) {
      for (const x of [-7.8, -3, 0, 3, 7.8])
        wps.push({ pos: v3(x, U.y + 1, zc + s * upperZ), pit: i });
      for (const sx of [-1, 1]) {
        const foot =
          wps.push({ pos: v3(sx * (A.ramp.foot + 1.3), 1, zc + s * upperZ), pit: i }) - 1;
        const top = wps.findIndex(
          (w) => w.pit === i && w.pos.x === sx * 7.8 && w.pos.z === zc + s * upperZ,
        );
        ramps.push([foot, top]);
      }
    }
  }

  const def: LevelDef = b.build({
    name: 'Arena',
    boundsMin: v3(-L - 2, -2, arenaPitZ(0) - W - 2),
    boundsMax: v3(L + 2, H + 2, arenaPitZ(A.pits - 1) + W + 2),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers: [],
    areas: pits.map((p, i) => ({
      name: `Pit ${i + 1}`,
      pos: v3(-A.spawnX, 0, p.center.z),
      yawDeg: -90,
    })),
    fog: { color: 0x070b14, near: 30, far: 110 },
    sideTint: { neg: 0x1d6a80, pos: 0x86501f, amount: 0.12 },
    ambient: 0.8,
    lights,
    arenaPits: pits,
  });

  // link waypoints on the same level that see each other (and each ramp's foot to its top)
  const level = buildLevel(def);
  const waypoints: WaypointDef[] = wps.map((w) => ({ pos: w.pos, links: [] }));
  for (let a = 0; a < wps.length; a++)
    for (let c = a + 1; c < wps.length; c++) {
      const p = wps[a].pos;
      const q = wps[c].pos;
      if (wps[a].pit !== wps[c].pit || Math.abs(p.y - q.y) > 0.5) continue;
      if (Math.hypot(p.x - q.x, p.z - q.z) > 9.5 || !lineOfSight(level, p, q)) continue;
      waypoints[a].links.push(c);
      waypoints[c].links.push(a);
    }
  for (const [f, t] of ramps) {
    waypoints[f].links.push(t);
    waypoints[t].links.push(f);
  }
  def.waypoints = waypoints;
  return def;
};
