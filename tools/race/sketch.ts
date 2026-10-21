// A course's route sketch, seen from above: the ramps (curved surf pieces and straight surf
// prisms), the racing line with its heights, gates (C1..C5, F), recovery anchors (R) and their
// restart bays (b), red zones (X), portals (O) and the start (S) — as text in the terminal, or
// as an SVG drawing (the map docs, docs/movement-map-design/maps/).
//
//   npx tsx tools/race/sketch.ts <map-id>                 text, about 120 columns wide
//   npx tsx tools/race/sketch.ts <map-id> --svg out.svg   an SVG drawing
import { writeFileSync } from 'node:fs';
import { gateCenter, getMap, mapDef, type LevelDef, type Vec3 } from '@space-yz/shared';

/** Everything worth drawing, in plan (x, z). */
const shapes = (def: LevelDef) => {
  const race = def.race!;
  const ramps: { pts: Vec3[]; red: boolean }[] = [];
  for (const b of def.boxes) {
    if (b.noCollide) continue;
    if (b.hull) ramps.push({ pts: [b.hull[0], b.hull[1], b.hull[3], b.hull[2]], red: !!b.kill });
    else if (b.surf || b.kill) {
      const r = Math.hypot(b.h.x, b.h.z);
      ramps.push({
        pts: [
          { x: b.c.x - r * 0.7, y: b.c.y, z: b.c.z },
          { x: b.c.x + r * 0.7, y: b.c.y, z: b.c.z },
        ],
        red: !!b.kill,
      });
    }
  }
  return {
    ramps,
    line: race.line.map((n) => n.pos),
    gates: race.checkpoints.map((g, i) => ({
      c: gateCenter(g),
      label: `C${i + 1}`,
      bay: g.respawn,
    })),
    finish: gateCenter(race.finish),
    anchors: (race.anchors ?? []).map((a, i) => ({
      c: gateCenter(a),
      label: `R${i + 1}`,
      bay: a.respawn,
    })),
    portals: (def.portals ?? []).map((p) => ({ c: gateCenter(p), exit: p.exit })),
    start: race.start.respawn,
  };
};

const ascii = (def: LevelDef, cols = 120): string => {
  const s = shapes(def);
  const all = [...s.line, ...s.ramps.flatMap((r) => r.pts)];
  const x0 = Math.min(...all.map((p) => p.x)) - 10;
  const x1 = Math.max(...all.map((p) => p.x)) + 10;
  const z0 = Math.min(...all.map((p) => p.z)) - 10;
  const z1 = Math.max(...all.map((p) => p.z)) + 10;
  const k = (x1 - x0) / cols;
  const rows = Math.ceil((z1 - z0) / (k * 2));
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ' '));
  const put = (p: Vec3, ch: string, over = true) => {
    const c = Math.floor((p.x - x0) / k);
    const r = Math.floor((p.z - z0) / (k * 2));
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    if (over || grid[r][c] === ' ') grid[r][c] = ch;
  };
  for (const r of s.ramps) for (const p of r.pts) put(p, r.red ? 'x' : ':', false);
  // the line: its height in tens of metres as a digit (0-9 then a-z)
  for (const p of s.line) put(p, Math.max(0, Math.min(35, Math.floor(p.y / 10))).toString(36));
  for (const g of s.gates) {
    put(g.c, g.label[1]);
    put(g.bay, 'b');
  }
  for (const a of s.anchors) {
    put(a.c, 'R');
    put(a.bay, 'b');
  }
  for (const p of s.portals) {
    put(p.c, 'O');
    put(p.exit, 'o');
  }
  put(s.finish, 'F');
  put(s.start, 'S');
  const out = grid.map((r) => r.join('').replace(/\s+$/, ''));
  out.push(
    `x ${x0.toFixed(0)}..${x1.toFixed(0)} (→ east), z ${z0.toFixed(0)}..${z1.toFixed(0)} (↓ south), ${k.toFixed(1)} m per column`,
  );
  out.push(
    'line digits: height in tens of metres (0-9, then a = 100 m...); : ramps, x red, 1-5 gates, R anchors, b bays, O/o portal in/out',
  );
  return out.join('\n');
};

const svg = (def: LevelDef): string => {
  const s = shapes(def);
  const all = [...s.line, ...s.ramps.flatMap((r) => r.pts)];
  const x0 = Math.min(...all.map((p) => p.x)) - 30;
  const x1 = Math.max(...all.map((p) => p.x)) + 30;
  const z0 = Math.min(...all.map((p) => p.z)) - 30;
  const z1 = Math.max(...all.map((p) => p.z)) + 30;
  const ys = s.line.map((p) => p.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const f = (n: number) => n.toFixed(1);
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0)} ${f(z0)} ${f(x1 - x0)} ${f(z1 - z0)}" width="${Math.round(x1 - x0)}" height="${Math.round(z1 - z0)}" font-family="sans-serif">`,
  );
  parts.push(
    `<rect x="${f(x0)}" y="${f(z0)}" width="${f(x1 - x0)}" height="${f(z1 - z0)}" fill="#102f3c"/>`,
  );
  for (const r of s.ramps)
    parts.push(
      `<polygon points="${r.pts.map((p) => `${f(p.x)},${f(p.z)}`).join(' ')}" fill="${r.red ? '#e8242c' : '#a96c45'}" opacity="0.85"/>`,
    );
  // the line, coloured by height (high = pale, low = deep)
  for (let i = 1; i < s.line.length; i++) {
    const a = s.line[i - 1];
    const b = s.line[i];
    if (Math.hypot(b.x - a.x, b.z - a.z) > 60) continue;
    const t = (a.y - lo) / Math.max(1, hi - lo);
    const c = `hsl(${170 - t * 120}, 70%, ${45 + t * 35}%)`;
    parts.push(
      `<line x1="${f(a.x)}" y1="${f(a.z)}" x2="${f(b.x)}" y2="${f(b.z)}" stroke="${c}" stroke-width="2.5"/>`,
    );
  }
  const label = (p: Vec3, text: string, color: string, r = 7) => {
    parts.push(
      `<circle cx="${f(p.x)}" cy="${f(p.z)}" r="${r}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`,
    );
    parts.push(
      `<text x="${f(p.x)}" y="${f(p.z + 3.5)}" font-size="9" text-anchor="middle" fill="#000" font-weight="bold">${text}</text>`,
    );
  };
  for (const g of s.gates) {
    label(g.bay, 'b', '#dddddd', 4);
    label(g.c, g.label, '#e0c080', 9);
  }
  for (const a of s.anchors) {
    label(a.bay, 'b', '#dddddd', 4);
    label(a.c, a.label, '#9fffd9', 8);
  }
  for (const p of s.portals) {
    label(p.c, 'O', '#c9a0ff', 8);
    label(p.exit, 'o', '#c9a0ff', 6);
  }
  label(s.start, 'S', '#4dff9a', 9);
  label(s.finish, 'F', '#ff4d6a', 9);
  parts.push(
    `<text x="${f(x0 + 10)}" y="${f(z1 - 10)}" font-size="14" fill="#dddddd">${def.name} — line coloured by height ${lo.toFixed(0)}–${hi.toFixed(0)} m (pale = high); north up</text>`,
  );
  parts.push('</svg>');
  return parts.join('\n');
};

const main = (): void => {
  const id = process.argv[2] ?? 'surf-copper-reef';
  const def = getMap(id).id === id ? mapDef(id) : null;
  if (!def?.race) throw new Error(`${id} is not a race or surf map`);
  const i = process.argv.indexOf('--svg');
  if (i > 0) {
    writeFileSync(process.argv[i + 1], svg(def));
    console.log(`wrote ${process.argv[i + 1]}`);
  } else console.log(ascii(def));
};

if (process.argv[1]?.replace(/\\/g, '/').endsWith('race/sketch.ts')) main();
