// "Cliffline" — a parkour race track (rules/race.ts) along an alpine ridge at sunrise: snow
// paths on grey rock ridges, pine forests in the valley, a warm low sun in the east.
// Built with the race-course turtle (level/race-course.ts): the racing line (the safe route)
// is authored move by move, the risky shortcuts as forks. About 3 minutes for a good run.
//
//   1  Hut terrace, ridge run with two rock steps                         → checkpoint 1
//   2  Switchbacks down the cliff  |  RISKY: five drops onto small ledges → checkpoint 2
//   3  Boulder hops over the crevasse, fuel cell, climb to Peak One       → checkpoint 3
//   4  Zip-rail to Peak Two, round the notch  |  RISKY: jetpack the notch → checkpoint 4
//   5  Launch pad onto the high ridge, zigzag  |  RISKY: gravity boots along the cliff face
//      over the chasm (F to stick, jump off at the end), fuel cell         → checkpoint 5
//   6  Ice-cave portal through the massif, long zip-rail to the valley   → checkpoint 6
//   7  Round the lake on the causeway  |  RISKY: ice floes (surge-jumps) → checkpoint 7
//   8  Climb to the lodge, launch pad onto the terrace                     → FINISH
import type { Vec3 } from '../../math/vec3';
import { v3, sub, len } from '../../math/vec3';
import type { LevelDef } from '../types';
import { RaceCourse, headingDir, headingYaw, type CourseTheme } from '../race-course';
import { boulder, clearOf, hash01, massif, pine } from './race-deco';

/** The palette (the owner's: snow, rock, pine, sky) plus the sunrise accents. */
export const CLIFFLINE_COLORS = {
  snow: 0xe8f0f5,
  snowShade: 0xd3dfe8,
  rock: 0x6f7a86,
  rockDark: 0x58626e,
  pine: 0x2f5d46,
  pineLight: 0x3d7258,
  trunk: 0x5a3e2a,
  sky: 0xbfd9f2,
  skyTop: 0x6ea3d8,
  dawn: 0xffc98a,
  ice: 0xa8d8f0,
  lake: 0x4f86b0,
  wood: 0x8a5a36,
  roof: 0x9b3b2e,
  gate: 0xff9a3c,
  finish: 0xffd34d,
  arrow: 0xfff1c9,
  risky: 0xff4a3a,
  portal: 0x7fd8ff,
};
const C = CLIFFLINE_COLORS;

const THEME: CourseTheme = {
  path: {
    mat: 'sand',
    color: C.snow,
    thick: 0.7,
    width: 5,
    base: { mat: 'rock', color: C.rock, depth: 7, widen: 1.2 },
  },
  gate: C.gate,
  arrow: C.arrow,
  risky: C.risky,
  finish: C.finish,
  pad: { mat: 'wood', color: C.roof },
  post: { mat: 'wood', color: C.wood },
};

export const buildCliffline = (): LevelDef => {
  const c = RaceCourse.create(THEME, v3(-400, 60, 410), 0);
  const b = c.b;

  // ---- 1: hut terrace and the ridge ----
  c.with({ width: 10 }).run(8).mark('startLine');
  const grid = c.grid();
  const start = { respawn: { ...c.pos }, yawDeg: headingYaw(c.heading) };
  c.arch(C.finish, 10, 5.5);
  c.run(16).with({ width: 5 }).run(34).turn(25).run(38).ledge(1, 6).run(24);
  c.turn(-35).run(38).ledge(1.1, 6).run(28).turn(20).run(34).gate();

  // ---- 2: switchbacks down the cliff (RISKY: drops) ----
  c.run(6).mark('cliffTop');
  c.with({ base: { mat: 'rock', color: C.rockDark, depth: 5, widen: 0.6 } });
  c.face(90).run(16).ramp(40, -14).run(4).face(0).run(8).face(270).run(4).ramp(40, -14);
  c.run(4).face(0).run(8).face(90).run(4).ramp(40, -14).run(6).face(0).run(10);
  c.mark('cliffBottom').with({ base: THEME.path.base }).run(8).gate();

  // ---- 3: boulder hops, climb to Peak One ----
  c.run(22).with({ width: 4 });
  c.gap(3.5, 0, 5).gap(3.5, 0.5, 5).gap(3.5, -0.5, 5).gap(4, 0, 6);
  c.with({ width: 5 }).run(12).fuel().run(14).turn(30).ramp(30, 8).run(8).ledge(1.1, 6).run(4);
  c.ledge(1.1, 6).turn(-15).ramp(30, 8).run(22).gate();
  const peakOne = c.pos;

  // ---- 4: zip-rail to Peak Two, round the notch (RISKY: jetpack across) ----
  c.run(6).face(45).run(8).rail(170, 14, 16).run(10).mark('notchFork');
  const notch = { pos: c.pos, heading: c.heading };
  c.turn(-70).run(35).turn(70).run(40).turn(70).run(35).turn(-70).run(10).mark('notchJoin');
  c.run(12).gate();

  // ---- 5: launch pad, the high ridge (RISKY: gravity boots over the chasm) ----
  c.run(6).face(90).run(10).pad(26, 7, 1.4, 14).run(8).with({ width: 4 }).mark('ridgeFork');
  const ridge = { pos: c.pos, heading: c.heading };
  c.turn(60).run(40).turn(-60).run(40).turn(-60).run(40).turn(60).mark('ridgeJoin');
  c.run(22).fuel().run(22).turn(-20).run(32).with({ width: 5 }).gate();

  // ---- 6: ice-cave portal, the long zip-rail down to the valley ----
  c.run(16).mark('caveIn');
  const caveOut = c.ahead(110, -60);
  c.portal(caveOut, C.portal, 12).run(8).face(150).run(8).mark('railTop');
  c.rail(230, 16, 18).run(10).gate();

  // ---- 7: round the lake (RISKY: ice floes) ----
  c.run(6).face(180).run(8).mark('lakeFork');
  const lake = { pos: c.pos, heading: c.heading };
  c.turn(-60).run(40).turn(60).run(50).turn(60).run(50).turn(-60).run(30).mark('lakeJoin');
  c.run(12).gate();

  // ---- 8: up to the lodge ----
  c.run(12).face(225).run(10).ramp(40, 9).run(20).turn(20).run(30).pad(25, 7, 1.4, 14);
  c.run(8).with({ width: 8 }).run(8).finishHere().run(16);
  const finish = c.pos;

  // ================= risky shortcuts =================
  // 2: five drops down the cliff face onto small ledges, then straight to the bottom
  {
    const f = c.fork(
      'cliffTop',
      'Cliff drops',
      'switchbacks down the cliff',
      'drop from ledge to ledge down the cliff face',
    );
    f.with({ width: 3.2, base: { mat: 'rock', color: C.rock, depth: 3, widen: 0.4 } });
    f.face(0).run(4);
    // (running off an 8 m drop carries you 8–12 m: the ledges sit there)
    for (let i = 0; i < 5; i++) f.gap(7, -8.4, 6);
    f.with({ width: 4 }).rejoin('cliffBottom');
  }
  // 4: jetpack straight across the notch (≈15 m: no jump reaches it)
  {
    const join = c.at('notchJoin').pos;
    const f = c.fork(
      'notchFork',
      'The notch',
      'round the head of the notch',
      'jetpack across the notch',
    );
    f.face(notch.heading);
    const d = len(sub(join, notch.pos));
    f.with({ width: 4 })
      .run(d / 2 - 12)
      .gap(15, 0, 6, 4, { jet: 70 })
      .rejoin('notchJoin');
  }
  // 5: along the cliff face over the chasm on gravity boots
  {
    const f = c.fork(
      'ridgeFork',
      'Cliff face',
      'zigzag along the ridge',
      'stick to the cliff face (F) and run it across the chasm, jump off at the end',
    );
    f.face(ridge.heading).with({ width: 1.6, base: { mat: 'rock', color: C.rock, depth: 3 } });
    const wallFrom = 14;
    const chasm = 44;
    f.run(wallFrom + 4);
    const wallStart = f.ahead(-4, 0, 0);
    const wallEnd = f.ahead(chasm + 4, 0, 0);
    // the cliff face: a rock wall along the left side of the way, over the chasm (the safe
    // zigzag bends away to the right)
    const side = f.ahead(0, -(2.3 + 1.5), 0);
    const endSide = f.ahead(chasm, -(2.3 + 1.5), 0);
    const mid = v3((side.x + endSide.x) / 2, side.y + 1, (side.z + endSide.z) / 2);
    const wallLen = len(sub(wallEnd, wallStart));
    f.b.boxes.push({
      c: mid,
      h: v3(1.5, 9, wallLen / 2 + 4),
      q: rotYq(ridge.heading),
      mat: 'rock',
      color: C.rockDark,
    });
    // (no walkway over the chasm: the wall is the way — stick to it here, jump off at its end)
    f.mag();
    f.pos = f.ahead(chasm, 0, 0);
    f.jumpHere();
    f.pos = f.ahead(3, 0, -1);
    f.with({ width: 6 }).run(8).with({ width: 1.6 }).rejoin('ridgeJoin');
  }
  // 7: ice floes straight across the lake: 5.2 m hops onto 3 m floes, and in the middle one
  // open lead of 9 m that only a SURGE-jump clears
  {
    const join = c.at('lakeJoin').pos;
    const f = c.fork(
      'lakeFork',
      'The lake',
      'causeway round the lake',
      'jump the ice floes across',
    );
    const d = len(sub(join, lake.pos));
    const h = (Math.atan2(join.x - lake.pos.x, -(join.z - lake.pos.z)) * 180) / Math.PI;
    f.face(h).with({
      width: 4,
      mat: 'sand',
      color: C.ice,
      base: { mat: 'sand', color: C.ice, depth: 1.2 },
    });
    f.run(10);
    const floes = Math.floor((d - 20 - 13) / 8.2);
    for (let i = 0; i < floes; i++) {
      const lead = i === Math.floor(floes / 2);
      if (lead) f.gap(9, 0, 4, 4, { surge: true });
      // (after the lead a big floe: you land on it still surging)
      f.gap(5.2, 0, lead ? 9 : 3);
    }
    f.rejoin('lakeJoin');
  }

  c.buildGeometry();
  const lines = c.allLines();

  // ================= scenery =================
  // the valley floor (snowy meadow): far below most of the track, a fall is a respawn
  b.box(v3(-520, -4, -520), v3(520, 0, 520), { mat: 'sand', color: C.snowShade });
  // the lake: water you fall into (a kill volume just under the floes)
  const lp = lake.pos;
  const ld = headingDir(lake.heading);
  const lc = v3(lp.x + ld.x * 62 + ld.z * 14, 0, lp.z + ld.z * 62 - ld.x * 14);
  b.boxes.push({
    c: v3(lc.x, (lp.y - 2.6) / 2, lc.z),
    h: v3(55, (lp.y - 2.6) / 2, 80),
    q: rotYq(lake.heading),
    mat: 'sand',
    color: C.lake,
    noCollide: true,
  });
  const lakeMin = v3(lc.x - 97, 0, lc.z - 97);
  const lakeMax = v3(lc.x + 97, 0, lc.z + 97);
  c.killVolume(v3(lakeMin.x, lp.y - 4, lakeMin.z), v3(lakeMax.x, lp.y - 1.4, lakeMax.z));
  // the notch and the chasm are simply deep: falls end at the kill height
  // a rock spire beside the notch, the start hut and the finish lodge
  const sp = v3(notch.pos.x - 22, 0, notch.pos.z - 30);
  b.block(v3(sp.x, 28, sp.z), v3(8, 56, 8), { mat: 'rock', color: C.rockDark, noCollide: true });
  b.block(v3(sp.x, 58, sp.z), v3(4, 6, 4), { mat: 'sand', color: C.snow, noCollide: true });
  hut(b, v3(start.respawn.x + 9, start.respawn.y, start.respawn.z + 10), 6);
  hut(b, v3(finish.x - 12, finish.y, finish.z), 9);
  // cave mouths around the portal ends
  caveMouth(b, c.at('caveIn').pos, c.at('caveIn').heading, 1.5);
  caveMouth(b, caveOut, c.at('caveIn').heading, -2);
  // massifs round the course (seen through the morning haze)
  for (let i = 0; i < 26; i++) {
    const a = hash01(i * 3 + 1) * Math.PI * 2;
    const r = 420 + hash01(i * 3 + 2) * 60;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r + 20;
    const w = 40 + hash01(i * 3 + 3) * 50;
    massif(
      b,
      x,
      0,
      z,
      w,
      60 + hash01(i * 5) * 90,
      { rock: C.rock, rockDark: C.rockDark, cap: C.snow },
      i,
    );
  }
  // mountains the ridges stand on (below the walkways, clear of them)
  const under: [Vec3, number, number][] = [
    [v3(-330, 0, 250), 34, 52],
    [peakOne, 18, peakOne.y - 9],
    [c.at('notchJoin').pos, 22, c.at('notchJoin').pos.y - 9],
    [c.at('ridgeJoin').pos, 20, c.at('ridgeJoin').pos.y - 9],
    [c.at('railTop').pos, 20, c.at('railTop').pos.y - 9],
  ];
  for (const [p, w, h] of under)
    massif(b, p.x, 0, p.z, w, h, { rock: C.rock, rockDark: C.rockDark }, Math.round(p.x));
  // pine forest in the valley and on the lower slopes
  let placed = 0;
  for (let i = 0; placed < 170 && i < 1400; i++) {
    const x = -470 + hash01(i * 7 + 1) * 900;
    const z = -420 + hash01(i * 7 + 2) * 900;
    if (!clearOf(lines, x, z, 9)) continue;
    const near = !clearOf(lines, x, z, 90);
    if (!near && hash01(i * 7 + 3) < 0.6) continue;
    const inLake =
      x > lakeMin.x - 20 && x < lakeMax.x + 20 && z > lakeMin.z - 10 && z < lakeMax.z + 10;
    if (inLake) continue;
    pine(
      b,
      x,
      0,
      z,
      8 + hash01(i * 7 + 4) * 9,
      { trunk: C.trunk, needles: C.pine, needlesLight: C.pineLight, snow: C.snow },
      i,
    );
    placed++;
  }
  // boulders along the paths' feet
  for (let i = 0; i < 40; i++) {
    const n = c.line[Math.floor(hash01(i * 13 + 5) * c.line.length)];
    const s = (hash01(i * 13 + 6) < 0.5 ? -1 : 1) * (5 + hash01(i * 13 + 7) * 6);
    const x = n.pos.x + s;
    const z = n.pos.z + (hash01(i * 13 + 8) - 0.5) * 8;
    if (!clearOf(lines, x, z, 4.5)) continue;
    boulder(b, x, n.pos.y - 1.5, z, 1.2 + hash01(i * 13 + 9) * 1.6, C.rockDark, i);
  }

  const race = c.raceDef({ parSec: 180, start, grid, killY: 6 });
  return {
    name: 'Cliffline',
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
    fog: { color: C.sky, near: 90, far: 480 },
    ambient: 1.12,
    outdoor: {
      top: C.skyTop,
      horizon: C.sky,
      ground: C.snowShade,
      sun: { dir: v3(0.85, 0.18, 0.5), color: C.dawn, sizeDeg: 7 },
      sunLight: 0xffe2c2,
    },
    race,
  };
};

/** A yaw rotation for a heading (compass degrees). */
const rotYq = (heading: number) => {
  const a = (-heading * Math.PI) / 180;
  return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
};

/** A little wooden hut with a red roof (scenery). */
const hut = (b: RaceCourse['b'], p: Vec3, size: number): void => {
  b.block(v3(p.x, p.y + size * 0.35, p.z), v3(size, size * 0.7, size * 0.8), {
    mat: 'wood',
    color: C.wood,
    noCollide: true,
  });
  b.block(v3(p.x, p.y + size * 0.8, p.z), v3(size * 1.15, size * 0.25, size * 0.95), {
    mat: 'wood',
    color: C.roof,
    noCollide: true,
  });
  b.block(v3(p.x, p.y + size * 0.97, p.z), v3(size * 0.9, size * 0.12, size * 0.6), {
    mat: 'sand',
    color: C.snow,
    noCollide: true,
  });
};

/** A rock arch round a portal (`along`: offset along the heading). */
const caveMouth = (b: RaceCourse['b'], p: Vec3, heading: number, along: number): void => {
  const a = (heading * Math.PI) / 180;
  const fx = Math.sin(a);
  const fz = -Math.cos(a);
  const cx = p.x + fx * along;
  const cz = p.z + fz * along;
  const q = rotYq(heading);
  for (const s of [-1, 1])
    b.block(v3(cx + fz * -s * 3.4, p.y + 2.5, cz + fx * s * 3.4), v3(2.2, 5.5, 3), {
      q,
      mat: 'rock',
      color: C.rockDark,
      noCollide: true,
    });
  b.block(v3(cx, p.y + 5.6, cz), v3(9, 1.6, 3), {
    q,
    mat: 'rock',
    color: C.rockDark,
    noCollide: true,
  });
  b.block(v3(cx, p.y + 6.6, cz), v3(7, 0.6, 2.6), {
    q,
    mat: 'sand',
    color: C.ice,
    noCollide: true,
  });
};
