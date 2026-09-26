import { describe, expect, it } from 'vitest';
import { defaultConfig, yawToView, type RaceView } from '@space-yz/shared';
import { createRacePractice, raceTrackId } from '../src/game/race-entry';
import {
  ghostAt,
  loadGhost,
  loadPersonalBests,
  ordinal,
  raceFromExtra,
  racePlace,
  raceTag,
  saveGhost,
  savePersonalBests,
  type RaceStore,
} from '../src/game/race-feature';
import { PlayerModels } from '../src/render/players';
import type { RenderPlayer } from '../src/game/session';

const memoryStore = (): RaceStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
};

describe('offline race practice', () => {
  it('counts down, then bot racers run the track; tags show their places', () => {
    const { session, race } = createRacePractice({
      track: 'race-canopy',
      bots: 3,
      skill: 'hard',
      config: defaultConfig(),
    });
    expect(session.world().players.length).toBe(4);
    expect(race.track).toBe('race-canopy');
    const idle = () => ({ buttons: 0, view: yawToView(0) });
    for (let i = 0; i < 60 * 8 && race.phase !== 'racing'; i++) session.update(1 / 60, idle);
    expect(race.phase).toBe('racing');
    expect(session.local()!.raceCp).toBe(0);
    for (let i = 0; i < 60 * 40; i++) session.update(1 / 60, idle);
    const bots = session.world().players.filter((p) => p.id !== session.localId);
    for (const b of bots) expect(b.raceCp).toBeGreaterThanOrEqual(1);
    // you stood still: last; the others' tags show their places
    expect(race.order[race.order.length - 1]).toBe(session.localId);
    const tags = session.others().map((p) => p.name);
    expect(tags.some((t) => t.endsWith('· 1st'))).toBe(true);
    // no weapons: nobody got hurt
    for (const p of session.world().players) expect(p.hp).toBe(session.config.combat.maxHp);
  });

  it('picks a race track (the default one for anything else)', () => {
    expect(raceTrackId('race-canopy')).toBe('race-canopy');
    expect(raceTrackId('split-deck')).toBe('race-cliffline');
    expect(raceTrackId(undefined)).toBe('race-cliffline');
  });
});

describe('race HUD helpers', () => {
  it('ordinals, places and tags', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
    ]);
    const v = { phase: 'racing', order: [5, 2, 9] } as unknown as RaceView;
    expect(racePlace(v, 2)).toBe(2);
    expect(racePlace(v, 7)).toBeNull();
    expect(raceTag('Nova', v, 9)).toBe('Nova · 3rd');
    expect(raceTag('Nova', { ...v, phase: 'lobby' }, 9)).toBe('Nova');
    expect(raceFromExtra({ rules: 'arena' })).toBeNull();
    expect(raceFromExtra({ rules: 'race', phase: 'lobby' })?.phase).toBe('lobby');
  });

  it('keeps personal bests and the best run as a ghost', () => {
    const store = memoryStore();
    expect(loadPersonalBests(store)).toEqual({});
    savePersonalBests({ t: { track: 't', timeMs: 5, splitsMs: [5], at: 0 } }, store);
    expect(loadPersonalBests(store).t.timeMs).toBe(5);
    expect(loadGhost('t', store)).toBeNull();
    // a ghost moving 1 m per sample along -z, turning a little
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) samples.push(0, 10, -i, i * 0.1);
    saveGhost({ track: 't', timeMs: 5, every: 6, samples }, store);
    const g = loadGhost('t', store)!;
    const at = ghostAt(g, 9)!;
    expect(at.pos.z).toBeCloseTo(-1.5, 6);
    expect(at.yaw).toBeCloseTo(0.15, 6);
    expect(at.vel.z).toBeCloseTo(-10, 6); // 1 m per 0.1 s
    expect(ghostAt(g, 6 * 9)).toBeNull(); // its run is over
    expect(ghostAt(g, -1)).toBeNull();
    store.set('lethalrecoil.race.pb.v1', '{broken');
    expect(loadPersonalBests(store)).toEqual({});
  });

  it('draws racers see-through (blended, no depth write) when asked', () => {
    const models = new PlayerModels();
    models.setOpacity(0.4);
    expect(models.modelOpacity).toBe(0.4);
    const p: RenderPlayer = {
      id: 3,
      team: 0,
      name: 'Nova',
      pos: { x: 0, y: 1, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      view: yawToView(0),
      vel: { x: 0, y: 0, z: 0 },
      crouched: false,
      alive: true,
      move: 0,
      hp: 100,
      windup: 0,
      aiming: false,
      laserWarn: 0,
      slashTicks: 0,
      carrier: false,
      revealed: false,
    };
    models.update([p], 1 / 60, 0);
    let mats = 0;
    models.group.traverse((o) => {
      const m = (o as { material?: { uniforms?: { opacity?: { value: number } } } }).material;
      if (m?.uniforms?.opacity) {
        mats++;
        expect(m.uniforms.opacity.value).toBe(0.4);
        expect((m as unknown as { transparent: boolean }).transparent).toBe(true);
        expect((m as unknown as { depthWrite: boolean }).depthWrite).toBe(false);
      }
    });
    expect(mats).toBeGreaterThan(0);
    models.dispose();
  });
});
