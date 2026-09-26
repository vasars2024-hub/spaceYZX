// Markdown rendering of a MapReport (printed by the CLI and saved as report.md). The report
// opens with a short plain-language summary for non-developers; the numbered sections below
// it hold the detail.
import type { Vec3 } from '@space-yz/shared';
import type { MapReport, SightStats, Timing } from './metrics';
import { LONG, SHORT } from './metrics';

const P = (p: Vec3 | null | undefined): string =>
  p ? `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})` : '—';
const T = (t: Timing | null | undefined): string =>
  t ? `${t.time.toFixed(2)} s (${t.dist.toFixed(0)} m)` : '—';
/** integer with thousands separators */
const N = (n: number): string => Math.round(n).toLocaleString('en-US');
/** seconds, one decimal (rounded from the two-decimal value the tables show) */
const S = (s: number): string => `${(Math.round(Math.round(s * 100) / 10) / 10).toFixed(1)} s`;
const team = (t: number): string => (t === 1 ? 'B' : 'A');
const ordinal = (n: number): string =>
  `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const every = (stride: number, spacing: number): string =>
  stride <= 1
    ? `every grid spot (${spacing} m apart)`
    : `every ${ordinal(stride)} grid spot in both directions (${stride * spacing} m apart)`;
const range = (xs: number[], f: (x: number) => string = (x) => x.toFixed(1)): string => {
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return Math.abs(hi - lo) < 0.05 ? f(lo) : `${f(lo)}–${f(hi)}`;
};
/** "a, b and c" */
const listing = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const share = (n: number, d: number): number => (d > 0 ? Math.round((100 * n) / d) : 0);

const table = (head: string[], rows: (string | number)[][]): string => {
  const line = (cells: (string | number)[]) =>
    `| ${cells.map((c) => String(c).replace(/\|/g, '/')).join(' | ')} |`;
  return [line(head), `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(line)].join('\n');
};

/** Histogram bin labels from the report's edges ("< 10 m", "10–19 m", …, "≥ 170 m"). */
const binLabels = (r: MapReport): string[] => {
  const e = r.sightlines.edges;
  return [
    `< ${e[0].at} m`,
    ...e.slice(1).map((x, i) => `${e[i].at}–${x.at} m`),
    `≥ ${e[e.length - 1].at} m`,
  ];
};

/** Share (%) of a group's spots whose longest sightline reaches at least `metres`. */
const spotsSeeingPast = (r: MapReport, x: SightStats, metres: number): number => {
  const i = r.sightlines.edges.findIndex((e) => e.at >= metres);
  if (i < 0) return 0; // farther than the rays are cast
  const n = x.longestHist.slice(i + 1).reduce((a, b) => a + b, 0);
  return share(n, x.samples);
};

/** Spots of team 0 and team 1 are mirror images when the numbers agree. */
const sameForBoth = <X>(xs: X[], key: (x: X) => string): boolean =>
  xs.length === 2 && key(xs[0]) === key(xs[1]);

// ------------------------------------------------------------------------------------------
// plain-language summary

/** A few sentences a non-developer can act on, built from the numbers below. */
export const plainSummary = (r: MapReport): string[] => {
  const out: string[] = [];
  const g = r.map.game;
  const fog = r.map.fog;
  const routes = r.routes;

  if (routes.available && routes.lanes.length) {
    const failed = r.walks?.checks.filter((c) => !c.pass) ?? [];
    out.push(
      r.walks
        ? failed.length
          ? `**Not balanced yet.** Measured sprint times miss ${failed.length} target(s): ${failed
              .slice(0, 2)
              .map((c) => `${c.name} (${c.detail})`)
              .join('; ')}.`
          : `**Balanced (measured).** All ${r.walks.checks.length} timing targets pass: see "Measured route timings".`
        : routes.mirror.ok
          ? '**Fair for both teams.** Every route takes exactly the same time from either side.'
          : `**Not fair yet.** Some routes take longer for one team: ${routes.mirror.issues.slice(0, 2).join('; ')}.`,
    );
    const lanes = [...new Set(routes.lanes.map((l) => l.lane))]
      .map((lane) => routes.lanes.find((l) => l.lane === lane && l.team === 0)!)
      .filter((l) => l.toEnemyTower && l.toMid)
      .sort((a, b) => a.toEnemyTower!.time - b.toEnemyTower!.time);
    if (lanes.length) {
      const [fast, ...rest] = lanes;
      out.push(
        `**Travel times.** The fastest way to the enemy Tower is the ${fast.lane}: ${S(fast.toEnemyTower!.time)} of sprinting from spawn${rest.length ? ` (${listing(rest.map((l) => `${l.lane} ${S(l.toEnemyTower!.time)}`))})` : ''}. Reaching the middle of a lane takes ${range(
          lanes.map((l) => l.toMid!.time),
          (x) => S(x).replace(' s', ''),
        )} s.`,
      );
    }
    const leads = routes.chokes.filter((c) => c.lead !== null);
    const inner = leads.filter((c) => !c.final).map((c) => c.lead!);
    const finals = leads.filter((c) => c.final).map((c) => c.lead!);
    if (leads.length) {
      const early = leads.filter((c) => c.lead! < 1);
      out.push(
        `**Where fights start.** Each team reaches its own chokepoints before the enemy can: ${inner.length ? `${range(inner)} s earlier at the ones in mid-map` : ''}${inner.length && finals.length ? ', ' : ''}${finals.length ? `${range(finals)} s earlier at the last doors before the Tower` : ''}. ${early.length ? `But the enemy gets to ${listing(early.map((c) => c.name))} first or at the same time.` : 'So first contact happens around the middle of each lane.'}`,
      );
    }
  }

  const s = r.sightlines;
  if (s.samples) {
    const longPct = share(s.overall.maxClass[2], s.samples);
    const top = s.longest[0];
    const vias = [
      ...new Set(s.longest.filter((l) => l.length >= top.length - 0.5).map((l) => l.via)),
    ];
    const worst = [...s.perLane]
      .filter((x) => x.region !== 'bases')
      .map((x) => ({ lane: x.region, pct: spotsSeeingPast(r, x, g.windupRange) }))
      .sort((a, b) => b.pct - a.pct)[0];
    out.push(
      `**Long sightlines.** From ${longPct}% of all spots you can see more than ${LONG} m in some direction.${top ? ` The longest clear lines are ${top.length} m, straight from ${top.fromRegion} to ${top.toRegion} through ${listing(vias)}${fog && top.length > fog.far ? ` — their far end is lost in the fog (nothing shows beyond ${fog.far} m)` : ''}.` : ''}${worst && worst.pct > 0 ? ` In the ${worst.lane}, ${worst.pct}% of spots have a line longer than the Wind-up Throw's ${g.windupRange} m range.` : ''}`,
    );
  }

  const sp = r.spawns;
  if (sp.spawns.length) {
    const exposed = sp.spawns.filter((x) => x.exposedBy > 0);
    const near = sp.spawns
      .map((x) => x.closest)
      .filter((x) => x)
      .sort((a, b) => a!.dist - b!.dist)[0];
    const nearEnemy = sp.spawns
      .map((x) => x.closestEnemySide)
      .filter((x) => x)
      .sort((a, b) => a!.dist - b!.dist)[0];
    const pairs = sp.pairs;
    const pairText = pairs.length
      ? ` ${pairs.length} pair${pairs.length > 1 ? 's' : ''} of opposing spawns can see each other, ${range(
          pairs.map((p) => p.dist),
          (x) => x.toFixed(0),
        )} m apart${Math.min(...pairs.map((p) => p.dist)) > g.windupRange ? ` — beyond Wind-up Throw range (${g.windupRange} m), only the Laser (${g.laserRange} m) reaches${fog ? `, through thick fog` : ''}` : ''}.`
      : ' No two opposing spawns can see each other.';
    out.push(
      `**Spawns.** ${exposed.length} of ${sp.spawns.length} spawn points can be seen from outside their own base${near ? `; the nearest such spot is ${near.dist} m away (${near.region})` : ''}${nearEnemy ? `, the nearest on the enemy half or in the middle ${nearEnemy.dist} m (${nearEnemy.region})` : ''}.${pairText} Players are frozen and cannot be hurt during the ${g.spawnLockSec} s spawn lock and nobody respawns during a round, so this matters mostly for the first moments of a round.`,
    );
  }

  if (r.towers.length) {
    const both = sameForBoth(r.towers, (t) => `${t.scoring.seenFrom}/${t.scoring.fromOutsideBase}`);
    for (const t of both ? [r.towers[0]] : r.towers) {
      const sc = t.scoring;
      const outside = sc.outsideByRegion.slice(0, 3);
      out.push(
        `**${both ? 'Towers' : `Tower ${team(t.team)}`}.** A carrier touching ${both ? 'a' : 'the'} Tower can be seen from ${N(sc.fromOutsideBase)} spots outside that base${sc.closestOutsideBase ? `, as close as ${sc.closestOutsideBase.dist} m (${sc.closestOutsideBase.region})` : ''}${sc.farthest ? ` and as far as ${sc.farthest.dist} m (${sc.farthest.region})` : ''}${outside.length ? `; most of them in ${listing(outside.map((x) => x.region))}` : ''}.`,
      );
    }
  }

  if (r.chokepoints.length) {
    const both = sameForBoth(r.chokepoints, (c) => `${c.seeAll}/${c.best?.count}/${c.seeAllFinal}`);
    for (const c of both ? [r.chokepoints[0]] : r.chokepoints) {
      const who = both ? 'a side' : `side ${team(c.side)}`;
      const mirror = both ? ` (side ${team(1 - c.side)} mirrors it)` : '';
      out.push(
        `**Chokepoints.** ${c.seeAll > 0 ? `${N(c.seeAll)} spots can watch every entrance of ${who} at once — one player could hold them all.` : `No single spot watches all ${c.chokes.length} entrances of ${who}: the best sees ${c.best?.count}, at ${P(c.best?.pos)} in ${c.best?.region}${mirror}.`}${c.finalChokes.length ? ` From ${N(c.seeAllFinal)} spots${c.seeAllFinalByRegion[0] ? ` (in ${listing(c.seeAllFinalByRegion.map((x) => x.region))})` : ''} a defender sees all ${c.finalChokes.length} base doors together.` : ''}`,
      );
    }
  }

  const og = r.openGround;
  const hot = og.exposedZones.find((z) => !z.onBox);
  const big = og.zones.find((z) => !z.onBox);
  const tops = og.zones.filter((z) => z.onBox);
  const box = (z: { min: Vec3; max: Vec3 }) =>
    `x ${z.min.x.toFixed(0)}…${z.max.x.toFixed(0)}, z ${z.min.z.toFixed(0)}…${z.max.z.toFixed(0)}`;
  if (hot || og.zones.length)
    out.push(
      `**Open ground.** ${hot ? `The most watched floor is ${hot.area} m² in ${hot.region} (${box(hot)}): ${hot.exposure}% of all standing spots on the map see a player there, with cover ${hot.cover} m away on average.` : ''}${big ? ` The biggest floor patch with no cover within ${og.threshold} m is ${big.area} m² in ${big.region} (${box(big)}).` : ` No floor spot in the lanes is more than ${og.threshold} m from cover.`}${tops.length ? ` Standing on top of ${tops.length === 1 ? 'a box' : 'boxes'} is exposed too: ${listing(tops.slice(0, 3).map((z) => `${z.region} at ${P(z.centroid)} (${z.area} m², seen from ${z.exposure}% of spots)`))}.` : ''}`,
    );

  const pk = r.peeks;
  if (pk.spots) {
    const blind = pk.blindSpots[0];
    const cover = blind ? pk.coverBoxes.find((b) => b.box === blind.box) : undefined;
    out.push(
      `**Peeks.** ${pk.glitchPairs === 0 ? 'No head-glitch spots: nowhere can a player shoot over low cover while showing almost nothing.' : `${pk.glitchSpots.length} head-glitch spots, worst behind box #${pk.glitchSpots[0].box} at ${P(pk.glitchSpots[0].pos)}: the defender can shoot while showing less than ${Math.round(r.options.glitchFrac * 100)}% of the body.`}${blind && cover ? ` Weakest cover: the ${cover.height} m tall, ${cover.size.x} × ${cover.size.z} m box at ${P(cover.center)} (${cover.region}) — ${blind.stance === 'crouch' ? 'crouched' : 'standing'} behind it you stay partly visible but cannot see back (${blind.blind} of ${blind.pairs} tested angles).` : ''}`,
    );
  }

  const h = r.height;
  if (h.positions.length) {
    const hard = h.positions.filter((p) => p.ratio >= 1.5);
    const top = h.positions[0];
    out.push(
      `**High ground.** ${hard.length ? `${hard.length} raised positions are hard to answer from below (they see much more than can see them back).` : 'Every raised position can be shot back from most of the ground it overlooks.'} The strongest, ${top.region} around ${P(top.best.pos)}, overlooks ${N(top.best.overlook)} ground spots; ${N(top.best.seeBack)} of them see it back.`,
    );
  }

  const f = r.features;
  const deadRails = f.rails.filter((x) => !x.reachable);
  const deadPads = f.pads.filter((x) => !x.reachable);
  if (f.rails.length || f.pads.length)
    out.push(
      `**Zip-rails and pads.** ${deadRails.length ? `${deadRails.length === 1 ? `The zip-rail from ${P(deadRails[0].from)} to ${P(deadRails[0].to)} cannot` : `${deadRails.length} of ${f.rails.length} zip-rails cannot`} be reached by walking and jumping: a jumping player's hand stays at least ${Math.min(...deadRails.map((x) => x.gap ?? Infinity))} m out of grab range, so it is probably dead geometry (the check ignores wall-jumps, dashes and grenade pulls).` : f.rails.length ? 'Every zip-rail can be grabbed.' : ''}${f.pads.length ? ` ${deadPads.length ? `${deadPads.length} of ${f.pads.length} gravity pads cannot be triggered.` : `${f.pads.length === 1 ? 'The gravity pad' : f.pads.length === 2 ? 'Both gravity pads' : `All ${f.pads.length} gravity pads`} can be triggered.`}` : ''}`,
    );
  return out;
};

// ------------------------------------------------------------------------------------------
// checklist against the design principles

export type Verdict = 'PASS' | 'WARN' | 'FAIL' | 'INFO';

export interface PrincipleCheck {
  principle: string;
  verdict: Verdict;
  finding: string;
}

/** Automatic verdicts against the competitive map-design principles (heuristic thresholds). */
export const principleChecks = (r: MapReport): PrincipleCheck[] => {
  const out: PrincipleCheck[] = [];
  const g = r.map.game;
  const routes = r.routes;
  if (routes.available && routes.lanes.length) {
    const lanes = [...new Set(routes.lanes.map((l) => l.lane))];
    const connected = lanes.filter((l) =>
      routes.lanes.filter((x) => x.lane === l).every((x) => x.toMid && x.toEnemyTower),
    );
    const cross = r.regionLinks.filter(
      (l) => l.from.includes('connector') || l.to.includes('connector'),
    );
    const oneWay = cross.filter((l) => l.oneWay);
    out.push({
      principle: '3 lanes with connectors / loops',
      verdict: connected.length >= 3 && cross.length >= 2 ? 'PASS' : 'WARN',
      finding: `${connected.length} lanes reach the enemy Tower on their own (${connected.join(', ')}); ${cross.length} connector links between regions${oneWay.length ? ` (${oneWay.length} one-way: ${oneWay.map((l) => `${l.from} → ${l.to}`).join(', ')})` : ''}.`,
    });
    const mids = lanes.map((l) => {
      const a = routes.lanes.find((x) => x.lane === l && x.team === 0)?.toMid;
      const b = routes.lanes.find((x) => x.lane === l && x.team === 1)?.toMid;
      return `${l}: A ${a?.time ?? '—'} s / B ${b?.time ?? '—'} s`;
    });
    const contact = r.walks?.checks.find((c) => c.name.startsWith('First contact'));
    out.push({
      principle: 'Both teams reach mid at the same time',
      verdict: contact ? (contact.pass ? 'PASS' : 'FAIL') : routes.mirror.ok ? 'PASS' : 'FAIL',
      finding: contact
        ? `${contact.detail} (measured sprint to the centre); lane middles: ${mids.join('; ')}.`
        : mids.join('; ') + (routes.mirror.ok ? '.' : ` — ${routes.mirror.issues.join('; ')}`),
    });
    if (r.walks) {
      const bad = r.walks.checks.filter((c) => !c.pass);
      out.push({
        principle: 'Measured route timings meet the balance targets',
        verdict: bad.length ? 'FAIL' : 'PASS',
        finding: bad.length
          ? bad.map((c) => `${c.name}: ${c.detail}`).join('; ')
          : `${r.walks.checks.length}/${r.walks.checks.length} targets pass (${r.walks.routes.length} routes walked).`,
      });
    }
    const leads = routes.chokes.filter((c) => c.lead !== null);
    if (leads.length) {
      const early = leads.filter((c) => c.lead! < 1);
      const finals = leads.filter((c) => c.final);
      const inner = leads.filter((c) => !c.final);
      const span = (cs: typeof leads) => `${range(cs.map((c) => c.lead!))} s`;
      out.push({
        principle: 'Defenders reach their own chokepoints first (≥ 1 s ahead)',
        verdict: early.length ? 'WARN' : 'PASS',
        finding: `${leads.length - early.length}/${leads.length} chokepoints reached ≥ 1 s before the enemy${finals.length ? `; base doors: ${span(finals)} ahead` : ''}${inner.length ? `; mid-map chokepoints: ${span(inner)} ahead` : ''}${early.length ? `; enemy first or level at ${early.map((c) => c.name).join(', ')}` : ''}.`,
      });
    }
  }
  const o = r.sightlines.overall;
  const longest = r.sightlines.longest[0];
  const mixOk = o.rayPct.every((x) => x >= 10);
  const beyond = r.sightlines.perLane
    .filter((x) => x.region !== 'bases')
    .map((x) => ({ lane: x.region, pct: spotsSeeingPast(r, x, g.windupRange) }))
    .filter((x) => x.pct >= 25);
  out.push({
    principle: 'Mix of short / medium / long sightlines',
    verdict: mixOk && !beyond.length ? 'PASS' : 'WARN',
    finding: `rays: ${o.rayPct[0]}% short (<${SHORT} m), ${o.rayPct[1]}% medium, ${o.rayPct[2]}% long (>${LONG} m); ${N(o.maxClass[2])} of ${N(o.samples)} spots have a long sightline somewhere${longest ? `; longest ${longest.length} m (${longest.fromRegion} → ${longest.toRegion})` : ''}${beyond.length ? `; lanes where ≥ 25% of spots see past the Wind-up Throw range (${g.windupRange} m): ${beyond.map((x) => `${x.lane} ${x.pct}%`).join(', ')}` : ''}.`,
  });
  for (const c of r.chokepoints) {
    out.push({
      principle: `No single spot sees every chokepoint (side ${team(c.side)})`,
      verdict: c.seeAll > 0 ? 'FAIL' : c.seeAllFinal > 0 ? 'WARN' : 'PASS',
      finding: `${c.seeAll > 0 ? `${N(c.seeAll)} spots see all ${c.chokes.length}` : `no spot sees all ${c.chokes.length}`}; best ${c.best?.count ?? 0}/${c.best?.of ?? 0} at ${P(c.best?.pos)} (${c.best?.region ?? '—'}); ${N(c.seeAllFinal)} spots see all ${c.finalChokes.length} base doors${c.seeAllFinalByRegion.length ? ` (${c.seeAllFinalByRegion.map((x) => `${x.region} ${N(x.count)}`).join(', ')})` : ''}.`,
    });
  }
  for (const t of r.spawns.teams) {
    const mine = r.spawns.spawns.filter((s) => s.team === t.team);
    const closest = mine
      .map((s) => s.closestEnemySide)
      .filter((c) => c)
      .sort((a, b) => a!.dist - b!.dist)[0];
    const pairs = r.spawns.pairs;
    const inRange = pairs.filter((p) => p.dist <= g.windupRange);
    out.push({
      principle: `Safe spawns (team ${team(t.team)})`,
      verdict: inRange.length ? 'FAIL' : pairs.length || t.exposingFromEnemySide ? 'WARN' : 'PASS',
      finding: `${t.exposedSpawns}/${t.spawns} spawns visible from outside the base, from ${N(t.exposingSamples)} spots (${N(t.exposingFromEnemySide)} on the enemy half or in the middle${closest ? `, closest ${closest.dist} m at ${P(closest.pos)} in ${closest.region}` : ''}); opposing spawn pairs with line of sight: ${pairs.length}${
        pairs.length
          ? ` at ${range(
              pairs.map((p) => p.dist),
              (x) => x.toFixed(0),
            )} m`
          : ''
      }.`,
    });
  }
  const og = r.openGround;
  const floorZones = og.zones.filter((z) => !z.onBox);
  const bigOpen = floorZones.filter((z) => z.area >= 40);
  const bare = og.exposedZones.filter((z) => !z.onBox && z.area >= 10 && z.cover > 4);
  const top = og.exposedZones.find((z) => !z.onBox);
  out.push({
    principle: 'Cover without killing fields',
    verdict: bigOpen.length || bare.length ? 'WARN' : 'PASS',
    finding: `${floorZones.length} open floor zones > ${og.threshold} m from cover${floorZones[0] ? ` (largest ${floorZones[0].area} m² in ${floorZones[0].region} at ${P(floorZones[0].centroid)})` : ''}${og.zones.length > floorZones.length ? ` plus ${og.zones.length - floorZones.length} exposed box tops` : ''}; most-watched floor: ${top ? `${top.region} around ${P(top.centroid)}, seen from ${top.exposure}% of standing spots (up to ${top.maxExposure}%), cover ${top.cover} m away` : '—'}${bare.length ? `; ${bare.length} of the most-watched floor areas have no cover within 4 m` : ''}.`,
  });
  const pk = r.peeks;
  out.push({
    principle: 'Fair peeks, no head-glitch spots',
    verdict: pk.glitchPairs > 0 ? 'FAIL' : pk.blindPairs > 0 ? 'WARN' : 'PASS',
    finding: `${pk.coverBoxes.length} low-cover boxes, ${pk.spots} defender spots, ${N(pk.pairs)} defender/attacker pairs: ${pk.glitchPairs} head-glitch pairs, ${pk.blindPairs} "blind" pairs (defender shows part of the hitbox but cannot see the attacker)${pk.blindSpots[0] ? `, worst at box #${pk.blindSpots[0].box} (${pk.blindSpots[0].stance}, ${pk.blindSpots[0].coverHeight} m cover)` : ''}.`,
  });
  const strong = r.height.positions.filter((p) => p.ratio >= 1.5);
  const hp = r.height.positions[0];
  out.push({
    principle: 'Height advantage with counterplay',
    verdict: strong.length ? 'WARN' : 'PASS',
    finding: `${r.height.positions.length} raised positions; ${strong.length} with overlook ÷ see-back ≥ 1.5${hp ? `; biggest overlook: ${hp.region} at ${P(hp.best.pos)} sees ${N(hp.best.overlook)} ground spots, ${N(hp.best.seeBack)} of which see its chest back` : ''}.`,
  });
  const f = r.features;
  if (f.rails.length || f.pads.length) {
    const dead = [...f.rails.filter((x) => !x.reachable), ...f.pads.filter((x) => !x.reachable)];
    out.push({
      principle: 'Every zip-rail and gravity pad can be used',
      verdict: dead.length ? 'FAIL' : 'PASS',
      finding: `${f.rails.filter((x) => x.reachable).length}/${f.rails.length} rails and ${f.pads.filter((x) => x.reachable).length}/${f.pads.length} pads reachable${f.rails
        .filter((x) => !x.reachable)
        .map((x) => `; rail ${P(x.from)} → ${P(x.to)} misses grab range by ${x.gap} m`)
        .join('')}.`,
    });
  }
  for (const t of r.towers)
    out.push({
      principle: `Tower ${team(t.team)} exposure`,
      verdict: 'INFO',
      finding: `a carrier touching it is seen from ${N(t.scoring.seenFrom)} of ${N(t.tested)} spots (${N(t.scoring.fromOutsideBase)} outside the base, closest ${t.scoring.closestOutsideBase?.dist ?? '—'} m); the Tower's upper half is visible from ${N(t.visibleFrom)} spots (${N(t.fromEnemyHalf)} on the enemy half, ${N(t.fromShared)} in the shared middle), ${t.minDist ?? '—'}–${t.maxDist ?? '—'} m away.`,
    });
  return out;
};

// ------------------------------------------------------------------------------------------
// the full report

export const renderMarkdown = (r: MapReport, files: string[] = []): string => {
  const L: string[] = [];
  const o = r.options;
  const g = r.map.game;
  const push = (...lines: string[]) => L.push(...lines, '');
  push(`# ${r.map.name} — map analysis`);
  push(
    `Generated by \`npm run map -- ${r.map.id}${o.quick ? ' --quick' : ''}\`: ${N(r.samples.reachable)} places a player can reach, checked on a ${o.spacing} m grid (zero-G surfaces ${o.zeroGSpacing} m, floating points ${o.floatSpacing} m) in ${Object.values(
      r.seconds,
    )
      .reduce((a, b) => a + b, 0)
      .toFixed(1)} s.`,
  );

  push('## In plain words');
  push(
    plainSummary(r)
      .map((x) => `- ${x}`)
      .join('\n'),
  );
  push(
    'The pictures next to this report show the same things on the map: `*-ground` and `*-upper` are the floor plans; the heat maps colour every walkable spot (darker = more).',
  );

  push('## How to read the numbers');
  push(
    [
      `- **Spot**: a place where a player can stand (or float, in zero-G), on the grid above. Counts depend on the grid, so only compare runs made with the same settings.`,
      `- **Position** (x, y, z) in metres. On the plans x runs left → right (team A, cyan, owns x < 0; team B, orange, x > 0), z runs top → bottom, y is the height.`,
      `- **Sees** means a straight line between the two points is free of walls, using the game's own line-of-sight code. Eyes are at 1.6 m (standing) or 0.95 m (crouched), the chest at 1.0 m; players never block each other.`,
      `- **Times** are straight-line distances along the bot route network at full sprint (${g.sprintSpeed} m/s); slides, dashes and jumps make real players a little faster.`,
      `- **Weapon ranges** used for context: a Quick Throw turns back after about ${g.quickThrowReach} m, a Wind-up Throw flies ${g.windupRange} m, the Laser ${g.laserRange} m.${r.map.fog ? ` Fog starts at ${r.map.fog.near} m and hides everything beyond ${r.map.fog.far} m.` : ''}`,
      `- **Verdicts** in the checklist use simple thresholds: read WARN/FAIL as "look here", not as a final judgement.`,
    ].join('\n'),
  );

  push('## Checklist against the design principles');
  push(
    table(
      ['Principle', 'Result', 'Finding'],
      principleChecks(r).map((c) => [c.principle, `**${c.verdict}**`, c.finding]),
    ),
  );

  // 1. samples
  push('## 1. Walkable spots');
  const k = r.samples.byKind;
  push(
    `${N(r.samples.reachable)} reachable spots (${N(k.floor)} floor, ${N(k.gravity)} on wall/ceiling gravity surfaces, ${N(k.mag)} mag-boot surfaces in zero-G, ${N(k.float)} floating points in zero-G). ${N(r.samples.unreachable)} more surfaces fit a player but cannot be reached (roofs, the top of the Tower…) and are ignored.`,
  );
  push(
    table(
      ['Region', 'Spots'],
      r.samples.byRegion.map((x) => [x.region, N(x.count)]),
    ),
  );

  // 2–3. routes and chokepoints
  push('## 2. Lanes and timings');
  if (!r.routes.available) push('This map has no bot waypoint graph, so routes are not timed.');
  else {
    push(
      `Shortest paths over the bot waypoint graph (straight-line link lengths) at sprint speed ${r.routes.sprintSpeed} m/s, starting from each team's spawn centroid. Each lane is timed on its own by removing the other lanes' centre waypoints. "To enemy Tower" ends where a carrier can touch the Tower.`,
    );
    const lanes = [...new Set(r.routes.lanes.map((l) => l.lane))];
    push(
      table(
        ['Lane', 'A → lane mid', 'B → lane mid', 'A → enemy Tower', 'B → enemy Tower'],
        lanes.map((l) => {
          const a = r.routes.lanes.find((x) => x.lane === l && x.team === 0);
          const b = r.routes.lanes.find((x) => x.lane === l && x.team === 1);
          return [l, T(a?.toMid), T(b?.toMid), T(a?.toEnemyTower), T(b?.toEnemyTower)];
        }),
      ),
    );
    push(
      r.walks
        ? 'Not a mirrored map: the balance between the teams is measured route by route below.'
        : r.routes.mirror.ok
          ? 'Mirror check: both teams need exactly the same time for every lane and chokepoint.'
          : `Mirror check FAILED: ${r.routes.mirror.issues.join('; ')}`,
    );
    if (r.walks) {
      push('### Measured route timings');
      push(
        `A scripted player sprints each route with the game's movement code (${r.walks.sprintSpeed} m/s sprint, acceleration, ramps and drops included), starting at its team's spawn centroid and following the named waypoints. Metres = length of the waypoint path; seconds = measured.`,
      );
      push(
        table(
          ['Team', 'Mode', 'To', 'Route', 'Metres', 'Seconds'],
          r.walks.routes.map((w) => [
            w.spec.team === 0 ? 'Cyan' : 'Orange',
            w.spec.mode,
            w.spec.to,
            w.spec.name,
            `${w.metres}`,
            w.seconds === null ? '**stuck**' : `${w.seconds.toFixed(2)}`,
          ]),
        ),
      );
      push(
        table(
          ['Balance target', 'Result', 'Measured'],
          r.walks.checks.map((c) => [c.name, `**${c.pass ? 'PASS' : 'FAIL'}**`, c.detail]),
        ),
      );
    }
    push('Region connections from the waypoint graph (the lane structure; → = one-way drop):');
    push(
      r.regionLinks
        .map(
          (l) =>
            `- ${l.from} ${l.oneWay ? '→' : '↔'} ${l.to}${l.links > 1 ? ` (${l.links} links)` : ''}`,
        )
        .join('\n'),
    );
    push('## 3. Chokepoints');
    push(
      'Arrival times from each spawn centroid. "Lead" = attacker time − defender time: how many seconds earlier the team whose half it is can be there. Opening = the smallest cross-section (width × height) within 6 m.',
    );
    push(
      table(
        ['Chokepoint', 'Pos', 'Opening', 'Defender', 'Attacker', 'Lead'],
        r.routes.chokes.map((c) => [
          `${c.name}${c.final ? ' (last before Tower)' : ''}`,
          P(c.pos),
          `${c.width} × ${c.height} m`,
          T(c.defender),
          T(c.attacker),
          c.lead === null ? '—' : `${c.lead.toFixed(2)} s`,
        ]),
      ),
    );
  }

  // 4. sightlines
  const s = r.sightlines;
  push('## 4. Sightlines');
  push(
    `${N(s.rays)} rays from ${N(s.samples)} spots (standing eye; ${o.sightRays} directions around the body plus ${o.sightPitchDeg.length ? o.sightPitchDeg.map((p) => `${p}°`).join('/') : 'no'} tilted ones). Each ray runs until it hits a wall.`,
  );
  const labels = binLabels(r);
  const notes = ['', ...s.edges.map((e) => e.note)];
  const lanes = [...s.perLane, s.overall];
  push('**How far the rays go** (share of all rays, %). Many long rays = open, exposed space.');
  push(
    table(
      ['Ray length', ...lanes.map((x) => (x.region === 'all' ? '**all**' : x.region)), ''],
      labels.map((lab, i) => [
        `${lab}${notes[i] ? ` (past ${notes[i]})` : ''}`,
        ...lanes.map((x) => x.hist[i]),
        '█'.repeat(Math.round(s.overall.hist[i] / 2.5)),
      ]),
    ),
  );
  push(
    '**Longest sightline per spot** (share of spots, %): from how many spots the farthest thing you can see is this far away.',
  );
  push(
    table(
      ['Longest line', ...lanes.map((x) => (x.region === 'all' ? '**all**' : x.region))],
      labels.map((lab, i) => [lab, ...lanes.map((x) => share(x.longestHist[i], x.samples))]),
    ),
  );
  push('Per lane:');
  push(
    table(
      [
        'Lane',
        'Spots',
        'Mean longest',
        'Longest',
        `Spots seeing > ${LONG} m`,
        `Spots seeing > ${g.windupRange} m`,
      ],
      lanes.map((x) => [
        x.region === 'all' ? '**all**' : x.region,
        N(x.samples),
        `${x.meanMax} m`,
        `${x.maxMax} m`,
        `${share(x.maxClass[2], x.samples)}%`,
        `${spotsSeeingPast(r, x, g.windupRange)}%`,
      ]),
    ),
  );
  push(
    'Longest distinct sightlines (one per pair of regions and corridor; mirror images and shorter pieces of a listed line left out). The first eight are drawn as numbered orange lines on the sightline plans.',
  );
  push(
    table(
      ['#', 'Length', 'From (eye)', 'To (hits a wall)', 'Regions (through)'],
      s.longest.map((l, i) => [
        i + 1,
        `${l.length} m${r.map.fog && l.length > r.map.fog.far ? ' (end in fog)' : ''}`,
        P(l.from),
        P(l.to),
        `${l.fromRegion} → ${l.toRegion} (through ${l.via})`,
      ]),
    ),
  );
  push('Per region (short < 15 m, medium 15–35 m, long > 35 m):');
  push(
    table(
      [
        'Region',
        'Spots',
        'Mean longest',
        'Max',
        'Spots short/med/long',
        'Ray mix short/med/long %',
      ],
      s.perRegion.map((x) => [
        x.region,
        N(x.samples),
        `${x.meanMax} m`,
        `${x.maxMax} m`,
        x.maxClass.map(N).join(' / '),
        x.rayPct.join(' / '),
      ]),
    ),
  );

  // 5. spawns
  push('## 5. Spawn safety');
  push(
    `For each spawn point: how many reachable spots outside that team's base see a player standing on it (eye to eye; ideal 0), how many of those are on the enemy half or in the shared middle, and which enemy spawns see it. Players are frozen and cannot be hurt during the ${g.spawnLockSec} s spawn lock, and nobody respawns during a round, so this matters most right when a round goes live.`,
  );
  push(
    table(
      [
        'Team',
        'Spawn',
        'Seen from spots',
        'From enemy half / middle',
        'Closest',
        'Closest from enemy half / middle',
        'Enemy spawns see it',
        'Top regions',
      ],
      r.spawns.spawns.map((x) => [
        team(x.team),
        P(x.pos),
        N(x.exposedBy),
        N(x.fromEnemySide),
        x.closest ? `${x.closest.dist} m from ${P(x.closest.pos)} (${x.closest.region})` : '—',
        x.closestEnemySide
          ? `${x.closestEnemySide.dist} m from ${P(x.closestEnemySide.pos)} (${x.closestEnemySide.region})`
          : '—',
        x.enemySpawnsSee,
        x.byRegion
          .slice(0, 3)
          .map((b) => `${b.region} ${N(b.count)}`)
          .join(', '),
      ]),
    ),
  );
  if (r.spawns.pairs.length) {
    push('Opposing spawn points that see each other:');
    push(
      table(
        ['Team A spawn', 'Team B spawn', 'Distance'],
        r.spawns.pairs.map((p) => [P(p.a), P(p.b), `${p.dist} m`]),
      ),
    );
  } else push('No team A spawn sees a team B spawn.');

  // 6. towers
  push('## 6. Tower exposure');
  push(
    `A round is won by touching the enemy Tower while carrying the Controller (within ${r.towers[0]?.scoring.reach ?? '—'} m of its centre). "Carrier seen from" counts the spots (${every(o.pairStride, o.spacing)}) whose eye sees the chest of a carrier standing just inside that distance (${r.towers[0]?.scoring.carrierSpots ?? 0} places around the Tower). "Tower visible from" counts spots that see the Tower's upper half.`,
  );
  push(
    table(
      [
        'Tower',
        'Carrier seen from',
        'Outside the base',
        'Closest outside the base',
        'Farthest',
        'Top regions',
      ],
      r.towers.map((t) => [
        team(t.team),
        `${N(t.scoring.seenFrom)} / ${N(t.tested)}`,
        N(t.scoring.fromOutsideBase),
        t.scoring.closestOutsideBase
          ? `${t.scoring.closestOutsideBase.dist} m, ${P(t.scoring.closestOutsideBase.pos)} (${t.scoring.closestOutsideBase.region})`
          : '—',
        t.scoring.farthest ? `${t.scoring.farthest.dist} m (${t.scoring.farthest.region})` : '—',
        t.scoring.byRegion
          .slice(0, 4)
          .map((b) => `${b.region} ${N(b.count)}`)
          .join(', '),
      ]),
    ),
  );
  push(
    table(
      [
        'Tower',
        'Tower visible from',
        'Own half',
        'Enemy half',
        'Shared',
        'Distance',
        'Farthest spot',
        'Top regions',
      ],
      r.towers.map((t) => [
        team(t.team),
        `${N(t.visibleFrom)} / ${N(t.tested)}`,
        N(t.fromOwnHalf),
        N(t.fromEnemyHalf),
        N(t.fromShared),
        `${t.minDist ?? '—'}–${t.maxDist ?? '—'} m`,
        t.farthest ? `${P(t.farthest.pos)} (${t.farthest.region})` : '—',
        t.byRegion
          .slice(0, 4)
          .map((b) => `${b.region} ${N(b.count)}`)
          .join(', '),
      ]),
    ),
  );

  // 7. chokepoint coverage
  push('## 7. Chokepoint coverage');
  push(
    `Can one spot watch every chokepoint of a side? A chokepoint counts as seen when any of 10 points across its opening (1.0 m and 1.6 m high) is visible. Tested on ${every(o.pairStride, o.spacing)}.`,
  );
  for (const c of r.chokepoints) {
    push(
      `**Side ${team(c.side)}** — ${c.chokes.length} chokepoints.`,
      `- Spots that see all of them: ${N(c.seeAll)}. Best spot: ${c.best?.count}/${c.best?.of} at ${P(c.best?.pos)} (${c.best?.region}) — sees ${c.best?.sees.join('; ')}.`,
      `- Spots that see all ${c.finalChokes.length} base doors: ${N(c.seeAllFinal)}${c.seeAllFinalByRegion.length ? ` (${c.seeAllFinalByRegion.map((x) => `${x.region} ${N(x.count)}`).join(', ')})` : ''}. Best: ${c.bestFinal?.count}/${c.bestFinal?.of} at ${P(c.bestFinal?.pos)} (${c.bestFinal?.region}).`,
    );
  }

  // 8. open ground
  const og = r.openGround;
  push('## 8. Open ground and killing fields');
  push(
    `For every lane spot (bases excluded): the distance to the nearest obstacle that blocks from knee to chest height (0.3–1.0 m above the floor; walls count, the box you stand on does not) — "open" = more than ${og.threshold} m — and the **exposure**: the share of ${N(og.viewers)} standing spots (floor and wall/ceiling gravity, on a ${o.viewerStride * o.spacing} m grid, zero-G spots not counted) whose eye can see a player's chest there. Exposure is measured on ${every(o.exposureStride, o.spacing)} and filled in between.`,
  );
  push(
    table(
      ['Region', 'Spots', 'Mean distance to cover', 'Open spots', 'Mean exposure', 'Max exposure'],
      og.perRegion.map((x) => [
        x.region,
        N(x.samples),
        `${x.meanCover} m`,
        `${x.openPct}%`,
        `${x.meanExposure}%`,
        `${x.maxExposure}%`,
      ]),
    ),
  );
  if (og.zones.length) {
    push('Open zones (no cover within the threshold):');
    push(
      table(
        ['Region', 'Area', 'Centre', 'Extent (x, z)', 'Farthest from cover', 'Mean exposure'],
        og.zones.map((z) => [
          `${z.region}${z.onBox ? ' (box top)' : ''}`,
          `${z.area} m²`,
          P(z.centroid),
          `x ${z.min.x}…${z.max.x}, z ${z.min.z}…${z.max.z}`,
          `${z.maxCover} m`,
          `${z.exposure}%`,
        ]),
      ),
    );
  } else push('No open zones.');
  if (og.exposedZones.length) {
    push(
      `Most-watched lane areas (the 10% of lane spots with the highest exposure, ≥ ${og.exposedFrom}% of standing spots), biggest first:`,
    );
    push(
      table(
        [
          'Region',
          'Area',
          'Centre',
          'Extent (x, z)',
          'Mean / max exposure',
          'Mean distance to cover',
        ],
        og.exposedZones.map((z) => [
          `${z.region}${z.onBox ? ' (box top)' : ''}`,
          `${z.area} m²`,
          P(z.centroid),
          `x ${z.min.x}…${z.max.x}, z ${z.min.z}…${z.max.z}`,
          `${z.exposure}% / ${z.maxExposure}%`,
          `${z.cover} m`,
        ]),
      ),
    );
  }

  // 9. peeks
  const pk = r.peeks;
  push('## 9. Peeks and head glitches');
  push(
    `Every box that is low cover (0.9–1.7 m above the floor next to it): a defender stands 0.6 m behind each face (centre and both ends), standing and crouched; attackers stand on the other side at 5–30 m in a ±60° fan. **Head glitch** = the defender's eye sees the attacker's chest while less than ${Math.round(o.glitchFrac * 100)}% of the defender's hitbox silhouette (head + body, ~40 points) is visible to the attacker. **Blind** = the reverse: the attacker sees part of the defender, but the defender can see neither the attacker's chest nor head.`,
  );
  push(
    table(
      ['Low-cover box', 'Centre', 'Size (x × y × z)', 'Cover height', 'Region'],
      pk.coverBoxes.map((b) => [
        `#${b.box}`,
        P(b.center),
        `${b.size.x} × ${b.size.y} × ${b.size.z}`,
        `${b.height} m`,
        b.region,
      ]),
    ),
  );
  push(
    table(
      ['Stance', 'Pairs', 'Head-glitch pairs', 'Blind pairs', 'Mean share of defender visible'],
      pk.byStance.map((x) => [
        x.stance,
        N(x.pairs),
        x.glitchPairs,
        x.blindPairs,
        `${Math.round(x.meanShown * 100)}%`,
      ]),
    ),
  );
  const spotRow = (x: (typeof pk.glitchSpots)[number]) => [
    `#${x.box} ${x.face}`,
    x.stance,
    P(x.pos),
    `${x.coverHeight} m`,
    `${x.glitches}/${x.pairs}`,
    `${x.blind}/${x.pairs}`,
    x.worst
      ? `attacker ${P(x.worst.attacker)} at ${x.worst.distance} m sees ${Math.round(x.worst.shown * 100)}%`
      : '—',
  ];
  const head = ['Box face', 'Stance', 'Defender at', 'Cover', 'Glitch', 'Blind', 'Worst case'];
  if (pk.glitchSpots.length) {
    push('Head-glitch spots:');
    push(table(head, pk.glitchSpots.map(spotRow)));
  } else push('No head-glitch spots.');
  if (pk.blindSpots.length) {
    push('Blind spots (defender exposed but cannot see):');
    push(table(head, pk.blindSpots.slice(0, 12).map(spotRow)));
  }

  // 10. height
  const h = r.height;
  push('## 10. Height advantage');
  push(
    `Raised spots (≥ ${o.heightMin} m above the lowest floor within 4 m): ${N(h.raisedSamples)}; ground spots tested against: ${N(h.groundSamples)} (${every(o.pairStride, o.spacing)}, up to 60 m away and ≥ ${o.heightMin} m lower). Overlook = ground spots whose chest the raised eye sees. See-back = of those, how many see the raised player's chest (or head/chest). Ratio = overlook ÷ see-back (chest); above ~1.5 the high ground is hard to answer.`,
  );
  push(
    table(
      [
        'Position',
        'Centre',
        'Height',
        'Spots',
        'Overlook mean / max',
        'See-back chest / any',
        'Ratio',
        'Best spot',
      ],
      h.positions
        .slice(0, 16)
        .map((p) => [
          p.region,
          P(p.centroid),
          `${p.height} m`,
          N(p.samples),
          `${N(p.overlookMean)} / ${N(p.overlookMax)}`,
          `${N(p.seeBackMean)} / ${N(p.seeBackAnyMean)}`,
          p.ratio,
          `${P(p.best.pos)}: ${N(p.best.overlook)} seen, ${N(p.best.seeBack)} see back`,
        ]),
    ),
  );

  // 11. rails and pads
  const f = r.features;
  push('## 11. Zip-rails and gravity pads');
  push(
    "A rail is grabbed when a player's hand (1.1 m above the body centre) comes within the grab radius of it; tested from every reachable spot, standing and at every height of a straight-up jump (wall-jumps, dashes and grenade pulls are not modelled). A rail running through a reachable zero-G zone counts as reachable. A gravity pad triggers when a player's body centre is inside its volume.",
  );
  if (f.rails.length)
    push(
      table(
        ['Rail', 'Length', 'Reachable', 'How', 'Closest miss', 'From'],
        f.rails.map((x) => [
          `${P(x.from)} → ${P(x.to)}`,
          `${x.length} m`,
          x.reachable ? 'yes' : '**no**',
          x.how,
          x.gap === null ? '—' : x.gap <= 0 ? 'in reach' : `${x.gap} m out of reach`,
          x.bestSpot ? `${P(x.bestSpot.pos)} (${x.bestSpot.region})` : '—',
        ]),
      ),
    );
  else push('No zip-rails.');
  if (f.pads.length)
    push(
      table(
        ['Pad', 'Flips zone', 'Reachable', 'Standing spots inside'],
        f.pads.map((x) => [P(x.centre), x.zone, x.reachable ? 'yes' : '**no**', N(x.spots)]),
      ),
    );
  else push('No gravity pads.');

  if (files.length) {
    push('## Files');
    push(files.map((f) => `- ${f}`).join('\n'));
  }
  push('## Timing');
  push(
    Object.entries(r.seconds)
      .map(([a, b]) => `${a} ${b.toFixed(2)} s`)
      .join(' · '),
  );
  return L.join('\n');
};
