import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mapDef, v3, type BoxDef, type LevelDef } from '@space-yz/shared';
import { mapThumbnail } from '../src/ui/icons';

const column = (top = 0, x = 0): BoxDef => ({
  c: v3(x, top - 5, 0),
  h: v3(4, 5, 4),
  mat: 'floor',
});
const level = (boxes: BoxDef[]): LevelDef => ({
  ...mapDef('split-deck-graybox'),
  boxes,
  spawns: [],
  towers: [],
  bombSites: [],
  callouts: [{ name: 'Centre', pos: v3(0, 0, 0) }],
});

describe('map thumbnails', () => {
  it('keeps legacy SVG bytes unchanged at menu and overview sizes (hashes captured before the change)', () => {
    const hashes = [];
    for (const id of ['split-deck', 'kestrel', 'antipode']) {
      for (const [w, h] of [
        [220, 140],
        [110, 70],
        [720, 480],
      ]) {
        const svg = mapThumbnail(mapDef(id), w, h);
        hashes.push([id, w, h, createHash('sha256').update(svg).digest('hex')]);
        expect(svg).toContain('<rect');
      }
    }
    expect(hashes).toMatchInlineSnapshot(`
      [
        [
          "split-deck",
          220,
          140,
          "7d7edad16e95600f512c2dae2d40bfc6d6a74821f754994cd1ac6e327d870bd1",
        ],
        [
          "split-deck",
          110,
          70,
          "ccf8b5beded62a827d67356d9e86a3b31d241cd57ef717b3b59115d676f6ad76",
        ],
        [
          "split-deck",
          720,
          480,
          "3c0e07d5e8bed90c4360a824b8d7e1d9204e3fba5c29b3fe4267d08358a18a22",
        ],
        [
          "kestrel",
          220,
          140,
          "7363d8149c74f76946c621bb2d8dc9b879c329bbc9f50177b27af7a8c8a712ab",
        ],
        [
          "kestrel",
          110,
          70,
          "420fbd6be373ed1d0ad644d67aecbbcb06d02733a22b6ffed40523deeb58691d",
        ],
        [
          "kestrel",
          720,
          480,
          "91ae0fb342962f50f3501ab0e7804fb98f9665a1c84067d9cc9ace414c0d2a8f",
        ],
        [
          "antipode",
          220,
          140,
          "3fbea06dd6b01fbb654d14d184403d40b00dab191e374bf25a8b267fc41add23",
        ],
        [
          "antipode",
          110,
          70,
          "c6c8a8714fe761a064b97a0a574167aae5dc65e8693a4d5a9a28fbb0e83ef818",
        ],
        [
          "antipode",
          720,
          480,
          "aae5a1cad0e8dff284f3cbed40534e34fa8adb3fe878b7dfca86af295a5107e6",
        ],
      ]
    `);
  });

  it('draws the graybox floor plan, with all three floor height shades', () => {
    const svg = mapThumbnail(mapDef('split-deck-graybox'));
    // Objectives alone must not make this pass: floor faces have their own opacity.
    expect(svg.match(/opacity="0.92"/g)!.length).toBeGreaterThan(20);
    for (const shade of ['#3a2d63', '#2c4470', '#5f86c2']) expect(svg).toContain(shade);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('includes graybox callout names when labels are enabled, including other floor heights', () => {
    const def = mapDef('split-deck-graybox');
    const svg = mapThumbnail(def, 1600, 1200, true);
    expect(def.callouts!.length).toBeGreaterThan(0);
    for (const callout of def.callouts!) expect(svg).toContain(`>${callout.name}</text>`);
    expect(svg).toContain('paint-order="stroke"');
    expect(svg).toContain('fill="#fff" stroke="#07101e"');
  });

  it('enables labels at 360px and lets menus explicitly enable or disable them', () => {
    const def = level([column()]);
    expect(mapThumbnail(def, 359, 200)).not.toContain('>Centre</text>');
    expect(mapThumbnail(def, 360, 200)).toContain('>Centre</text>');
    expect(mapThumbnail(def, 220, 140, true)).toContain('>Centre</text>');
    expect(mapThumbnail(def, 720, 480, false)).not.toContain('>Centre</text>');
  });

  it.each(['hull', 'skyglass', 'forcefield'] as const)(
    'excludes %s tops from the floor plan',
    (mat) => {
      expect(mapThumbnail(level([column(), { ...column(20, 100), mat }]))).toBe(
        mapThumbnail(level([column()])),
      );
    },
  );

  it.each(['noRender', 'noCollide'] as const)('excludes %s boxes from the floor plan', (flag) => {
    expect(mapThumbnail(level([column(), { ...column(20, 100), [flag]: true }]))).toBe(
      mapThumbnail(level([column()])),
    );
  });

  it('requires two metres of headroom, including invisible colliders', () => {
    const floor = column();
    const roof = { ...column(12), mat: 'hull' as const };
    expect(mapThumbnail(level([floor, { ...roof, c: v3(0, 6.9, 0), noRender: true }]))).toBe(
      '<svg viewBox="0 0 220 140"></svg>',
    );
    expect(mapThumbnail(level([floor, roof]))).toBe(mapThumbnail(level([floor])));
    expect(mapThumbnail(level([floor, { ...roof, c: v3(0, 6.9, 0), noCollide: true }]))).toBe(
      mapThumbnail(level([floor])),
    );
  });

  it('keeps exposed portions of a top face beside a low obstruction', () => {
    const obstruction = { ...column(11), h: v3(1, 5, 4), mat: 'hull' as const };
    const svg = mapThumbnail(level([column(), obstruction]));
    expect(svg.match(/opacity="0.92"/g)).toHaveLength(2);
  });

  it('draws narrow stair treads and shades columns by their top rather than centre', () => {
    const svg = mapThumbnail(
      level([
        column(-5, -12),
        column(6, 12),
        { c: v3(0, 0.5, 0), h: v3(0.1, 0.1, 4), mat: 'grate' },
      ]),
    );
    expect(svg.match(/opacity="0.92"/g)).toHaveLength(3);
    expect([...svg.matchAll(/fill="(#[a-f0-9]+)" opacity="0.92"/g)].map((m) => m[1])).toEqual([
      '#3a2d63',
      '#2c4470',
      '#5f86c2',
    ]);
  });

  it('escapes authored callout text before putting it in SVG markup', () => {
    const def = level([column()]);
    def.callouts = [{ name: '<Mid & "A">', pos: v3(0, 0, 0) }];
    const svg = mapThumbnail(def, 360, 200);
    expect(svg).toContain('>&#60;Mid &#38; &#34;A&#34;&#62;</text>');
    expect(svg).not.toContain('<Mid');
  });
});
