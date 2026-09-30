import {
  buildLevel,
  mapDef,
  createWorld,
  defaultConfig,
  TICK_DT,
  addPlayer,
  createPlayer,
  step,
  Btn,
  yawToView,
  v3,
} from '@space-yz/shared';

const lv = buildLevel(mapDef('antipode'));
const config = defaultConfig();
const ctx = { level: lv, config, dt: TICK_DT };
const world = createWorld(lv, 1);
const p = addPlayer(world, createPlayer(1, 0, v3(-11.5, 0, 6.5), 180, config));
const view = yawToView(180);
for (let t = 0; t < 20; t++) step(world, { 1: { tick: world.tick + 1, buttons: 0, view } }, ctx);
let maxY = 0;
for (let t = 0; t < 60 * 8; t++) {
  step(world, { 1: { tick: world.tick + 1, buttons: t < 30 ? Btn.Forward : 0, view } }, ctx);
  maxY = Math.max(maxY, p.pos.y);
  if (t % 20 === 0)
    console.log(t, p.pos.y.toFixed(2), p.vel.y.toFixed(2), p.grounded, JSON.stringify(p.gravity));
  if (t > 60 && p.grounded) break;
}
console.log('max', maxY, 'final', JSON.stringify(p.pos), p.hp);
