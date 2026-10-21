// Team colors follow the map *side*, not the team: attackers (T side) are orange, defenders
// (CT side) cyan. When teams swap sides at half time the arrays below are rewritten in place,
// so everything that reads `TEAM_COLORS[team]` picks up the new colors; code that bakes a color
// into a mesh rebuilds when `paletteVersion` changes.

const SIDE_HEX = [0x19e3ff, 0xff8a1f] as const;
const SIDE_CSS = ['#19e3ff', '#ff8a1f'] as const;

/** team -> color (0xRRGGBB) */
export const TEAM_COLORS: [number, number] = [SIDE_HEX[0], SIDE_HEX[1]];
/** team -> CSS color */
export const TEAM_COLOR: [string, string] = [SIDE_CSS[0], SIDE_CSS[1]];

let swapped = false;
export let paletteVersion = 0;

/** Called every frame by the match HUD (false outside matches). */
export const setSidesSwapped = (on: boolean): void => {
  if (on === swapped) return;
  swapped = on;
  const k = on ? 1 : 0;
  for (const t of [0, 1] as const) {
    TEAM_COLORS[t] = SIDE_HEX[t ^ k];
    TEAM_COLOR[t] = SIDE_CSS[t ^ k];
  }
  paletteVersion++;
};
