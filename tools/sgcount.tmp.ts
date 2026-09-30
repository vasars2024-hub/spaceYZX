import { buildStormglass } from '../packages/shared/src/level/maps/stormglass';
const d = buildStormglass();
const m = new Map<string, number>();
for (const b of d.boxes) { const k = `${b.mat}|${(b.color??0).toString(16)}|${b.noCollide?'nc':''}`; m.set(k, (m.get(k)??0)+1); }
console.log([...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30));
