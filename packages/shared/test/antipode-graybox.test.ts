// Antipode (graybox, round 2: level/maps/graybox/antipode.ts): two decks, a floor deck walked
// upright and a ceiling deck walked upside down, joined ONLY by three turn corridors. Checks the
// gravity (no zero-G, nothing sideways), that only the turns join the decks, walks each turn both
// ways in the sim, the defenders' head start at each site, and the painted signs.
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  Btn,
  buildLevel,
  createPlayer,
  createWorld,
  defaultConfig,
  len,
  mapDef,
  pointInAabb,
  step,
  sub,
  TICK_DT,
  v3,
  waypointRoute,
  type LevelDef,
  type SimContext,
  type Vec3,
} from '../src/index';
import { ANTIPODE_GRAYBOX_LAYOUT as LAY, ANTIPODE_TURNS } from '../src/level/maps/graybox/antipode';

const def = () => mapDef('antipode-graybox');
const [FLOOR, CEILING] = LAY.layers;
const DECK = CEILING.y;
const S = LAY.cellM;
const cells = (rows: string[], c: string) =>
  rows.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === c ? [{ x, y }] : [])));
const centre = (x: number, y: number) => [(x + 0.5) * S, (y + 0.5) * S] as const;
/** the yaw (degrees) that looks from cell a toward cell b (yawToView: 0 = -z, 90 = -x) */
const yawToward = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (Math.atan2(-(b.x - a.x), -(b.y - a.y)) * 180) / Math.PI;

const sim = () => {
  const lv = buildLevel(def());
  const config = defaultConfig();
  const ctx: SimContext = { level: lv, config, dt: TICK_DT };
  return { lv, config, ctx, world: createWorld(lv, 1) };
};

describe('Antipode graybox: two decks, three turns', () => {
  it('has only the ceiling deck’s gravity (straight up): no zero-G, nothing sideways', () => {
    const d = def();
    expect(d.zones.length).toBeGreaterThan(0);
    for (const z of d.zones) expect(z.gravity, z.name).toEqual(v3(0, 1, 0));
    expect(d.defaultGravity).toEqual(v3(0, -1, 0));
    // no gravity areas left in the layout, no pads, rails or portals
    expect(Object.values(LAY.legend).filter((a) => a.k === 'gravity')).toEqual([]);
    expect(d.launchPads ?? []).toEqual([]);
    expect(d.rails ?? []).toEqual([]);
    expect(d.portals ?? []).toEqual([]);
    // 3v3 (and every size) plays the full map
    expect(LAY.sizes).toBeUndefined();
    expect(LAY.theme).toBe('station');
  });

  it('joins the decks only at the turns (bot links landing ↔ door, both ways)', () => {
    const d = def();
    const wps = d.waypoints!;
    const layerOf = (i: number) => Number(wps[i].name!.split(':')[0].slice(1));
    const crossings = new Set<string>();
    wps.forEach((w, i) =>
      w.links.forEach((j) => {
        if (layerOf(i) === layerOf(j)) return;
        const [a, b] = [w.name!, wps[j].name!].sort();
        crossings.add(`${a}|${b}`);
        expect(wps[j].links, `${wps[j].name} → ${w.name}`).toContain(i);
      }),
    );
    const turnChars = new Set(ANTIPODE_TURNS.flatMap((t) => [t.landing, t.door]));
    for (const c of crossings)
      for (const n of c.split('|')) expect(turnChars.has(n[0]), c).toBe(true);
    for (const t of ANTIPODE_TURNS)
      expect(
        [...crossings].some((c) => c.includes(`${t.landing}0:`) && c.includes(`${t.door}1:`)),
        t.name,
      ).toBe(true);
  });

  for (const t of ANTIPODE_TURNS) {
    // the landing cell that has the door beside it, and that door cell
    const pair = () => {
      for (const a of cells(FLOOR.rows, t.landing))
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          if (CEILING.rows[a.y + dy]?.[a.x + dx] === t.door)
            return { land: a, door: { x: a.x + dx, y: a.y + dy } };
      throw new Error(t.name);
    };
    /**
     * A body standing at `from` (feet), still for half a second (on the ceiling deck it turns
     * over first), then walking ahead until it stands with its up along `wantUp` on the other
     * deck — or 3 s pass.
     */
    const walk = (from: Vec3, yawDeg: number, wantUp: number) => {
      const { ctx, world, config } = sim();
      const p = addPlayer(world, createPlayer(0, 0, from, yawDeg, config));
      const hp = p.hp;
      const startUp = Math.sign(-wantUp);
      let ticks = 0;
      for (let i = 0; i < 30; i++)
        step(world, { 0: { tick: world.tick + 1, buttons: 0, view: p.view } }, ctx);
      expect(p.up.y).toBeCloseTo(startUp, 6);
      for (; ticks < 180; ticks++) {
        step(world, { 0: { tick: world.tick + 1, buttons: Btn.Forward, view: p.view } }, ctx);
        if (p.grounded && Math.abs(p.up.y - wantUp) < 1e-9) break;
      }
      return { p, hp, ticks };
    };

    it(`${t.name}: walking off the landing turns you over onto the ceiling deck`, () => {
      const { land, door } = pair();
      const [x, z] = centre(land.x, land.y);
      const { p, hp, ticks } = walk(v3(x, LAY.legend[t.landing].h!, z), yawToward(land, door), -1);
      // over in about a second, standing on the ceiling deck (head 1.8 m under it), not hurt
      expect(ticks).toBeLessThan(80);
      expect(p.pos.y).toBeCloseTo(DECK - 0.9, 1);
      expect(CEILING.rows[Math.floor(p.pos.z / S)][Math.floor(p.pos.x / S)]).not.toBe('.');
      expect(p.hp).toBe(hp);
    });

    it(`${t.name}: walking off its door on the ceiling deck drops you onto the landing, upright`, () => {
      const { land, door } = pair();
      const [x, z] = centre(door.x, door.y);
      // (an upright body hanging under the ceiling deck, like a ceiling spawn)
      const { p, hp, ticks } = walk(v3(x, DECK - 1.82, z), yawToward(door, land), 1);
      expect(ticks).toBeLessThan(80);
      expect(p.pos.y).toBeLessThan(LAY.legend[t.landing].h! + 1);
      expect(p.pos.y).toBeGreaterThan(LAY.legend[t.landing].h! - 0.5);
      expect(p.hp).toBe(hp);
    });
  }

  it('the defenders (Cyan) reach each bomb site 3–5 s before the attackers (Orange)', () => {
    const d: LevelDef = def();
    const wps = d.waypoints!;
    const near = (p: Vec3) => {
      let best = 0;
      let bd = Infinity;
      wps.forEach((w, i) => {
        const q = len(sub(w.pos, v3(p.x, p.y + 1, p.z)));
        if (q < bd) {
          bd = q;
          best = i;
        }
      });
      return best;
    };
    const routeLen = (a: number, b: number) => {
      const r = waypointRoute(wps, a, b);
      let m = 0;
      for (let i = 1; i < r.length; i++) m += len(sub(wps[r[i]].pos, wps[r[i - 1]].pos));
      return r.length ? m : Infinity;
    };
    const sprint = defaultConfig().movement.sprintSpeed;
    expect(d.bombSites!.map((b) => b.name).sort()).toEqual(['A', 'B']);
    for (const site of d.bombSites!) {
      const inside = wps.flatMap((w, i) => (pointInAabb(w.pos, site.min, site.max) ? [i] : []));
      const secs = ([0, 1] as const).map((team) => {
        const from = near(d.spawns.find((s) => s.team === team)!.pos);
        return Math.min(...inside.map((i) => routeLen(from, i))) / sprint;
      });
      const lead = secs[1] - secs[0];
      expect(
        lead,
        `site ${site.name}: cyan ${secs[0].toFixed(1)} s, orange ${secs[1].toFixed(1)} s`,
      ).toBeGreaterThan(3);
      expect(lead, `site ${site.name}`).toBeLessThan(5);
    }
  });

  it('has a painted sign on a wall at every junction and at both ends of every turn', () => {
    const signs = LAY.signs!;
    const step = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;
    for (const sg of signs) {
      const rows = LAY.layers[sg.l ?? 0].rows;
      // on a wall cell, read from a floor cell of the same deck
      expect(rows[sg.y][sg.x], `${sg.text} at ${sg.x},${sg.y}`).toBe('.');
      const [dx, dy] = step[sg.face];
      expect(rows[sg.y + dy]?.[sg.x + dx] ?? '.', `${sg.text} reader`).not.toBe('.');
    }
    const readFrom = (l: number, c: string) =>
      signs.some((sg) => {
        const [dx, dy] = step[sg.face];
        return (sg.l ?? 0) === l && LAY.layers[l].rows[sg.y + dy]?.[sg.x + dx] === c;
      });
    // each turn: a "TO CEILING" sign at its ramp or landing, a "TO FLOOR" one at or by its door
    for (const t of ANTIPODE_TURNS) {
      const ramp = Object.keys(LAY.legend).find(
        (c) => LAY.legend[c].k === 'ramp' && LAY.legend[c].n === t.name,
      )!;
      expect(
        signs.some((sg) => sg.text.includes('TO CEILING') && (sg.l ?? 0) === 0) &&
          (readFrom(0, ramp) || readFrom(0, t.landing)),
        t.name,
      ).toBe(true);
    }
    expect(signs.filter((sg) => sg.text.includes('TO FLOOR')).length).toBeGreaterThanOrEqual(3);
    expect(signs.filter((sg) => /\bA\b/.test(sg.text)).length).toBeGreaterThan(5);
    expect(signs.filter((sg) => /\bB\b/.test(sg.text)).length).toBeGreaterThan(5);
  });
});
