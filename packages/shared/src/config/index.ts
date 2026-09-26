// GameConfig: every tunable number. The server sends its config to clients so the prediction
// runs with exactly the same values.
import { MOVEMENT_DEFAULTS, type MovementConfig } from './movement';
import { COMBAT_DEFAULTS, type CombatConfig } from './combat';
import { RULES_DEFAULTS, type RulesConfig } from './rules';

export interface GameConfig {
  movement: MovementConfig;
  combat: CombatConfig;
  rules: RulesConfig;
}

export const defaultConfig = (): GameConfig => ({
  movement: { ...MOVEMENT_DEFAULTS },
  combat: { ...COMBAT_DEFAULTS },
  rules: { ...RULES_DEFAULTS },
});

/** Merge a partial override (e.g. from the tuning panel) onto defaults, ignoring unknown keys. */
export const mergeConfig = (base: GameConfig, patch: unknown): GameConfig => {
  const out = defaultConfig();
  for (const section of ['movement', 'combat', 'rules'] as const) {
    Object.assign(out[section], base[section]);
    const p = (patch as Record<string, Record<string, unknown>> | null)?.[section];
    if (!p || typeof p !== 'object') continue;
    for (const [k, v] of Object.entries(p)) {
      if (k in out[section] && typeof v === 'number' && Number.isFinite(v)) {
        (out[section] as Record<string, number>)[k] = v;
      }
    }
  }
  return out;
};

export { MOVEMENT_DEFAULTS, COMBAT_DEFAULTS, RULES_DEFAULTS };
export type { MovementConfig, CombatConfig, RulesConfig };
export * from './rules';
export * from './guns';
export * from './loadout';
export * from './arena';
