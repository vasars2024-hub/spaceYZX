import {
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  step,
  yawToView,
  v3,
  TICK_DT,
  type LevelDef,
  type BoxDef,
  type GravityZoneDef,
  type SimContext,
  type WorldState,
  type PlayerState,
  type Vec3,
  type Quat,
  type GameConfig,
} from '../src/index';

export const flatLevel = (
  extra: BoxDef[] = [],
  zones: GravityZoneDef[] = [],
  more: Partial<LevelDef> = {},
): LevelDef => ({
  name: 'test',
  boundsMin: v3(-100, -20, -100),
  boundsMax: v3(100, 60, 100),
  defaultGravity: v3(0, -1, 0),
  boxes: [{ c: v3(0, -0.5, 0), h: v3(100, 0.5, 100) }, ...extra],
  zones,
  rails: [],
  pads: [],
  spawns: [{ pos: v3(0, 0, 0), yawDeg: 0 }],
  towers: [],
  ...more,
});

export interface Sim {
  ctx: SimContext;
  world: WorldState;
  p: PlayerState;
  config: GameConfig;
}

export const makeSim = (def: LevelDef, feet: Vec3 = v3(0, 0, 0), yawDeg = 0, seed = 1): Sim => {
  const config = defaultConfig();
  const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, seed);
  const p = addPlayer(world, createPlayer(1, 0, feet, yawDeg, config));
  return { ctx, world, p, config };
};

/** Run n ticks holding `buttons` (a function of tick index, or a constant). */
export const run = (
  sim: Sim,
  n: number,
  buttons: number | ((i: number) => number) = 0,
  view?: Quat | ((i: number) => Quat),
): void => {
  for (let i = 0; i < n; i++) {
    const b = typeof buttons === 'function' ? buttons(i) : buttons;
    const vq = typeof view === 'function' ? view(i) : (view ?? sim.p.view);
    step(sim.world, { [sim.p.id]: { tick: sim.world.tick + 1, buttons: b, view: vq } }, sim.ctx);
  }
};

export const settle = (sim: Sim): void => run(sim, 30);

export const view = (yawDeg: number, pitchDeg = 0): Quat => yawToView(yawDeg, pitchDeg);

export const planarSpeed = (p: PlayerState): number => Math.hypot(p.vel.x, p.vel.z);
