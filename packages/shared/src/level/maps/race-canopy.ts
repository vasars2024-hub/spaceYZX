// "Canopy Run" — a parkour race track (rules/race.ts) through jungle treetops: plank walkways
// along giant branches, rope zip-rails between the trees, mushroom launch pads, a river gorge
// and temple ruins, under warm beams of sunlight. Built with the race-course turtle
// (level/race-course.ts). About 3 minutes for a good run.
//
//   1  The great tree's deck, branch walkways round the trunks           → checkpoint 1
//   2  Rope zip-rail, mushroom launch pads up the canopy                  → checkpoint 2
//   3  Rope bridges between the tree decks  |  RISKY: bare branch beams  → checkpoint 3
//   4  Spiral stair round the fig trunk down to the river bank            → checkpoint 4
//   5  Boardwalk along the river  |  RISKY: stepping stones over the rapids
//                                                                          → checkpoint 5
//   6  Spring up the waterfall cliff, climb into the ruins                → checkpoint 6
//   7  Round the temple  |  RISKY: gravity boots along the temple wall over the collapse
//      then the long rope rail down through the canopy                    → checkpoint 7
//   8  Branch run  |  RISKY: jetpack between the twin trees (fuel cell), mushroom up to the
//      hollow of the last tree                                            → FINISH
import type { Vec3 } from '../../math/vec3';
import { v3, sub, len } from '../../math/vec3';
import type { LevelDef, LightDef } from '../types';
import { RaceCourse, headingDir, headingYaw, type CourseTheme } from '../race-course';
import { boulder, clearOf, hash01, jungleTree } from './race-deco';

/** The palette (the owner's: moss, bark, leaves, sunbeams) plus water, stone and mushrooms. */
export const CANOPY_COLORS = {
  moss: 0x5e8c4a,
  mossDark: 0x46703a,
  bark: 0x6b4a2e,
  barkDark: 0x523822,
  plank: 0x9a7650,
  leaves: 0x8bcb6a,
  leavesDark: 0x5f9a45,
  sunbeam: 0xffe9a8,
  sky: 0xcfe8c4,
  skyTop: 0x8cc4e0,
  water: 0x3f9fb5,
  foam: 0xd8f3f5,
  stone: 0x9aa38f,
  stoneDark: 0x77806c,
  mushroom: 0xc8453a,
  stem: 0xeee2c8,
  rope: 0xc9a66b,
  gate: 0xffc14a,
  finish: 0xffe9a8,
  risky: 0xff4a3a,
  portal: 0x9dffb0,
};
const C = CANOPY_COLORS;

const THEME: CourseTheme = {
  path: {
    mat: 'wood',
    color: C.plank,
    thick: 0.45,
    width: 4,
    base: { mat: 'wood', color: C.bark, depth: 1.6, widen: 0.6 },
  },
  gate: C.gate,
  arrow: C.sunbeam,
  risky: C.risky,
  finish: C.finish,
  pad: { mat: 'sand', color: C.mushroom },
  post: { mat: 'wood', color: C.barkDark },
};

/** A tree deck: a wide round-ish platform (walkway style for a stretch). */
const DECK = {
  width: 8,
  base: { mat: 'wood' as const, color: C.barkDark, depth: 2.5, widen: 0.4 },
};
const BRANCH = { width: 4, base: THEME.path.base };
const BRIDGE = { width: 3, thick: 0.3, base: undefined };

export const buildCanopyRun = (): LevelDef => {
  const c = RaceCourse.create(THEME, v3(-380, 55, 400), 0);
  const b = c.b;
  const trunks: { pos: Vec3; w: number }[] = [];
  const trunk = (w = 5) => trunks.push({ pos: { ...c.pos }, w });

  // ---- 1: the great tree's deck, branches round the trunks ----
  c.with(DECK).run(10).mark('startLine');
  const grid = c.grid();
  const start = { respawn: { ...c.pos }, yawDeg: headingYaw(c.heading) };
  c.arch(C.finish, 8, 5.5);
  trunk(7);
  c.run(12).with(BRANCH).run(30).turn(30).run(35).with(DECK).run(8);
  trunk();
  c.with(BRANCH).turn(-45).run(40).ledge(1, 5).run(24).turn(25).run(35).with(DECK).run(8);
  trunk();
  c.with(BRANCH).turn(-10).run(24).gate();

  // ---- 2: rope zip-rail, mushroom launch pads up the canopy ----
  c.run(8).with(DECK).run(6);
  trunk();
  c.face(30).run(6).rail(150, 10, 14).run(10);
  trunk(6);
  c.with(BRANCH).run(14).pad(24, 6, 1.3, 12).run(6).pad(24, 6, 1.3, 12).run(8).with(DECK).run(8);
  trunk();
  c.with(BRANCH).turn(20).run(26).fuel().run(14).gate();

  // ---- 3: rope bridges between tree decks (RISKY: branch beams) ----
  c.run(6).with(DECK).run(8).mark('bridgeFork');
  trunk();
  c.with(BRIDGE).turn(-50).run(34).with(DECK).run(8);
  trunk();
  c.with(BRIDGE).turn(70).run(40).with(DECK).run(8);
  trunk();
  c.with(BRIDGE).turn(60).run(34).with(DECK).run(8);
  trunk();
  c.turn(-80).run(6).mark('bridgeJoin').with(BRANCH).run(20).gate();

  // ---- 4: the spiral stair round the fig trunk, down to the river bank ----
  c.run(10).with(DECK).run(6);
  const fig = c.ahead(9, 9);
  for (let i = 0; i < 4; i++)
    c.with(BRANCH)
      .turn(i ? 90 : 0)
      .ramp(24, -8.5)
      .with(DECK)
      .run(4);
  c.with(BRANCH).turn(90).ramp(24, -8.5).run(10).gate();

  // ---- 5: boardwalk along the river (RISKY: stepping stones) ----
  c.with({ width: 4, base: { mat: 'wood', color: C.barkDark, depth: 3, widen: 0 } });
  c.face(90).run(8).mark('riverFork');
  const river = { pos: c.pos, heading: c.heading };
  c.turn(-50).run(40).turn(50).run(60).turn(50).run(40).turn(-50).run(8).mark('riverJoin');
  c.run(16).gate();

  // ---- 6: spring up the waterfall cliff, climb into the ruins ----
  c.run(6)
    .face(180)
    .run(8)
    .pad(24, 7, 1.35, 12)
    .with({
      width: 5,
      mat: 'rock',
      color: C.stone,
      base: { mat: 'rock', color: C.stoneDark, depth: 6, widen: 1 },
    });
  c.run(10)
    .ledge(1.1, 6)
    .run(6)
    .ledge(1.1, 6)
    .turn(-30)
    .run(40)
    .fuel()
    .run(12)
    .turn(20)
    .run(14)
    .gate();

  // ---- 7: round the temple (RISKY: gravity boots along its wall), rope rail down ----
  c.run(8).mark('templeFork');
  const temple = { pos: c.pos, heading: c.heading };
  c.turn(-60).run(30).turn(60).run(4).ramp(30, 6).run(10).turn(60).run(4).ramp(30, -6);
  c.run(4).turn(-60).run(10);
  c.mark('templeJoin').run(12).turn(20).run(10).mark('railTop');
  c.with({ ...THEME.path })
    .run(4)
    .face(215)
    .run(6)
    .rail(240, 12, 16)
    .run(10)
    .gate();

  // ---- 8: branch run (RISKY: jetpack between the twin trees), up to the hollow ----
  c.with(BRANCH).run(6).face(270).run(6).fuel().run(8).mark('twinFork');
  const twin = { pos: c.pos, heading: c.heading };
  trunk();
  c.with(BRIDGE).turn(70).run(30).turn(-70).run(30).turn(-70).run(30).turn(70).run(6);
  c.mark('twinJoin');
  trunk();
  c.with(BRANCH).run(20).turn(-25).run(24).turn(25).run(10).pad(24, 6, 1.3, 12);
  c.with(DECK).run(8).finishHere().run(14);
  const finish = c.pos;
  trunk(8);

  // ================= risky shortcuts =================
  // 3: bare branch beams straight across (1 m wide)
  {
    const f = c.fork(
      'bridgeFork',
      'Branch beams',
      'rope bridges between the decks',
      'the bare branch beams',
    );
    f.with({ width: 1, thick: 0.6, base: undefined, color: C.bark });
    f.rejoin('bridgeJoin');
  }
  // 5: stepping stones across the rapids (4.5 m hops onto 2.5 m stones)
  {
    const join = c.at('riverJoin').pos;
    const f = c.fork(
      'riverFork',
      'Stepping stones',
      'boardwalk round the bend',
      'stones over the rapids',
    );
    const h = (Math.atan2(join.x - river.pos.x, -(join.z - river.pos.z)) * 180) / Math.PI;
    f.face(h).with({
      width: 2.6,
      mat: 'rock',
      color: C.stoneDark,
      base: { mat: 'rock', color: C.stoneDark, depth: 2 },
    });
    const d = len(sub(join, river.pos));
    f.run(5);
    const stones = Math.floor((d - 12) / 7);
    for (let i = 0; i < stones; i++) f.gap(4.5, 0, 2.5);
    f.rejoin('riverJoin');
  }
  // 7: gravity boots along the temple's outer wall, across the collapsed stairs
  {
    const f = c.fork(
      'templeFork',
      'Temple wall',
      'round the temple, up and down its stairs',
      'stick to the temple wall (F), run it across the collapse, jump off at the end',
    );
    f.face(temple.heading).with({
      width: 1.6,
      mat: 'rock',
      color: C.stone,
      base: { mat: 'rock', color: C.stoneDark, depth: 3 },
    });
    f.run(10);
    const span = 34;
    const a = f.ahead(-4, 3.8);
    const e = f.ahead(span + 4, 3.8);
    f.b.boxes.push({
      c: v3((a.x + e.x) / 2, a.y + 2, (a.z + e.z) / 2),
      h: v3(1.5, 10, len(sub(e, a)) / 2),
      q: rotYq(temple.heading),
      mat: 'rock',
      color: C.stone,
    });
    f.mag();
    f.pos = f.ahead(span, 0, 0);
    f.jumpHere();
    f.pos = f.ahead(3, 0, -1);
    f.with({ width: 6 }).run(8).with({ width: 1.6 }).rejoin('templeJoin');
  }
  // 8: jetpack straight between the twin trees (16 m: no jump reaches it)
  {
    const join = c.at('twinJoin').pos;
    const f = c.fork(
      'twinFork',
      'Twin trees',
      'rope bridge round the twins',
      'jetpack across the gap',
    );
    f.face(twin.heading).with({ width: 3 });
    const d = len(sub(join, twin.pos));
    f.run((d - 16 - 6) / 2)
      .gap(16, 0, 6, 3, { jet: 75 })
      .rejoin('twinJoin');
  }

  c.buildGeometry();
  const lines = c.allLines();

  // ================= scenery =================
  const lights: LightDef[] = [];
  // the jungle floor far below (a fall is a respawn)
  b.box(v3(-520, -4, -520), v3(520, 0, 520), { mat: 'sand', color: C.mossDark });
  // the river through the gorge: water (a kill volume just under the stones and boardwalk)
  const rp = river.pos;
  const rd = headingDir(river.heading);
  const rc = v3(rp.x + rd.x * 58, 0, rp.z + rd.z * 58);
  // (the river runs north ↔ south across the course, which heads east here)
  b.box(v3(rc.x - 18, 0, rc.z - 260), v3(rc.x + 18, rp.y - 1.6, rc.z + 260), {
    mat: 'sand',
    color: C.water,
    noCollide: true,
  });
  c.killVolume(v3(rc.x - 18, 0, rc.z - 260), v3(rc.x + 18, rp.y - 0.9, rc.z + 260));
  // waterfall (a pale sheet down the cliff behind the spring)
  // giant trunks under the tree decks
  for (const t of trunks)
    b.block(v3(t.pos.x, (t.pos.y - 2.5) / 2, t.pos.z), v3(t.w, t.pos.y - 2.5, t.w), {
      mat: 'wood',
      color: C.bark,
      noCollide: true,
    });
  // crowns over the decks (high, clear of the way) and sunbeams through them
  trunks.forEach((t, i) => {
    b.block(v3(t.pos.x, t.pos.y + 16, t.pos.z), v3(t.w * 5, 4, t.w * 5), {
      q: rotYq(hash01(i) * 90),
      mat: 'leaf',
      color: i % 2 ? C.leaves : C.leavesDark,
      noCollide: true,
    });
    if (i % 3 === 0)
      lights.push({
        pos: v3(t.pos.x + 6, t.pos.y + 12, t.pos.z + 4),
        color: C.sunbeam,
        radius: 14,
        intensity: 0.9,
        shaft: true,
      });
  });
  // the fig at the spiral stair
  b.block(v3(fig.x, fig.y / 2, fig.z), v3(9, fig.y, 9), {
    mat: 'wood',
    color: C.barkDark,
    noCollide: true,
  });
  // temple ruins (stone blocks round the stairs, a stepped pyramid behind)
  const tp = temple.pos;
  for (let i = 0; i < 4; i++)
    b.block(v3(tp.x - 30, tp.y - 8 + i * 5, tp.z - 30), v3(34 - i * 7, 5, 34 - i * 7), {
      mat: 'rock',
      color: i % 2 ? C.stone : C.stoneDark,
      noCollide: true,
    });
  // the finish hollow: a huge trunk ring behind the arch
  b.block(v3(finish.x, finish.y + 7, finish.z), v3(3, 14, 3), {
    mat: 'wood',
    color: C.barkDark,
    noCollide: true,
  });
  // mushrooms under the launch pads' caps (stems) and scattered on the floor
  for (const pad of c.parts.launchPads) {
    const cx = (pad.min.x + pad.max.x) / 2;
    const cz = (pad.min.z + pad.max.z) / 2;
    b.block(v3(cx, pad.min.y / 2, cz), v3(1.4, pad.min.y, 1.4), {
      mat: 'sand',
      color: C.stem,
      noCollide: true,
    });
  }
  // the jungle: broad trees on the floor, boulders, mushrooms
  let placed = 0;
  for (let i = 0; placed < 150 && i < 1500; i++) {
    const x = -480 + hash01(i * 7 + 1) * 960;
    const z = -480 + hash01(i * 7 + 2) * 960;
    if (!clearOf(lines, x, z, 12)) continue;
    if (clearOf(lines, x, z, 110) && hash01(i * 7 + 3) < 0.7) continue;
    jungleTree(
      b,
      x,
      0,
      z,
      18 + hash01(i * 7 + 4) * 22,
      { bark: C.bark, leaves: C.leaves, leavesDark: C.leavesDark },
      i,
    );
    placed++;
  }
  for (let i = 0; i < 60; i++) {
    const x = -470 + hash01(i * 11 + 5) * 940;
    const z = -470 + hash01(i * 11 + 6) * 940;
    if (!clearOf(lines, x, z, 6)) continue;
    if (hash01(i * 11 + 7) < 0.5) boulder(b, x, 0, z, 2 + hash01(i) * 3, C.mossDark, i);
    else {
      const h = 1.5 + hash01(i * 3) * 2;
      b.block(v3(x, h / 2, z), v3(0.6, h, 0.6), { mat: 'sand', color: C.stem, noCollide: true });
      b.block(v3(x, h + 0.3, z), v3(2.2, 0.7, 2.2), {
        mat: 'sand',
        color: C.mushroom,
        noCollide: true,
      });
    }
  }

  const race = c.raceDef({ parSec: 180, start, grid, killY: 4 });
  return {
    name: 'Canopy Run',
    boundsMin: v3(-500, -10, -500),
    boundsMax: v3(500, 160, 500),
    defaultGravity: v3(0, -1, 0),
    boxes: b.boxes,
    zones: [],
    rails: c.parts.rails,
    pads: [],
    spawns: grid,
    towers: [],
    launchPads: c.parts.launchPads,
    portals: c.parts.portals,
    lights,
    fog: { color: C.sky, near: 60, far: 380 },
    ambient: 1.05,
    outdoor: {
      top: C.skyTop,
      horizon: C.sky,
      ground: C.mossDark,
      sun: { dir: v3(-0.3, 0.8, 0.35), color: C.sunbeam, sizeDeg: 6 },
      sunLight: 0xfff0c8,
    },
    race,
  };
};

/** A yaw rotation for a heading (compass degrees). */
const rotYq = (heading: number) => {
  const a = (-heading * Math.PI) / 180;
  return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
};
