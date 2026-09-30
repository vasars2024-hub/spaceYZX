import { describe, expect, it } from 'vitest';
import { BRAWL_DEFAULTS, brawlView, defaultConfig, yawToView } from '@space-yz/shared';
import { createBrawlPractice } from '../src/game/brawl-entry';
import { brawlFromExtra, brawlPlace, brawlResultTitle } from '../src/game/brawl-feature';

const idle = () => ({ buttons: 0, view: yawToView(0) });

describe('offline Brawl vs bots', () => {
  it('TDM: you and your bots against a full bot team', () => {
    const s = createBrawlPractice({
      variant: 'tdm',
      size: 3,
      skill: 'rookie',
      map: 'kestrel',
      config: defaultConfig(),
    });
    const w = s.world();
    expect(w.players.length).toBe(6);
    expect(w.players.filter((p) => p.team === 0).length).toBe(3);
    expect(s.local()!.team).toBe(0);
    expect(s.ctx.ffa).toBeFalsy();
    expect(s.mapId).toBe('kestrel');
    expect(s.brawl.phase).toBe('live');
    // spawn protection at the start
    expect(w.players.every((p) => p.shield)).toBe(true);
    for (let i = 0; i < 60 * 3; i++) s.update(1 / 60, idle);
    expect(w.players.every((p) => !p.shield || !p.alive)).toBe(true);
  });

  it('FFA: every bot is an enemy (drawn in the enemy colour) and they fight each other', () => {
    const s = createBrawlPractice({
      variant: 'ffa',
      size: 5,
      skill: 'hard',
      map: 'training-bay',
      config: defaultConfig(),
    });
    expect(s.ctx.ffa).toBe(true);
    expect(s.world().players.length).toBe(5);
    expect(s.others().every((p) => p.team === 1)).toBe(true);
    for (let i = 0; i < 60 * 40; i++) s.update(1 / 60, idle);
    const bots = s.world().players.filter((p) => p.id !== s.localId);
    // (you stood still: the bots also shot at each other)
    expect(bots.reduce((n, p) => n + p.kills, 0)).toBeGreaterThan(0);
    const view = brawlView(s.brawl, s.world(), s.mapId);
    expect(view.table.length).toBe(5);
    expect(brawlPlace(view, s.localId)).toBeGreaterThan(0);
  });

  it('after the results the next map comes due', () => {
    const s = createBrawlPractice({
      variant: 'ffa',
      size: 4,
      skill: 'rookie',
      map: 'training-bay',
      config: defaultConfig(),
    });
    s.local()!.kills = s.brawl.settings.ffaKills;
    s.update(1 / 60, idle);
    s.update(1 / 60, idle);
    expect(s.brawl.phase).toBe('end');
    expect(s.brawl.winner).toBe(s.localId);
    expect(s.nextDue()).toBe(false);
    for (let i = 0; i < 60 * (BRAWL_DEFAULTS.resultsSec + 1); i++) s.update(1 / 60, idle);
    expect(s.nextDue()).toBe(true);
  });

  it('headlines and the online rules state', () => {
    expect(brawlFromExtra({ rules: 'match' })).toBeNull();
    expect(brawlFromExtra(null)).toBeNull();
    const base = brawlFromExtra({
      rules: 'brawl',
      variant: 'ffa',
      phase: 'end',
      winner: 3,
      table: [
        { id: 3, team: 1, kills: 20, deaths: 2, score: 2400 },
        { id: 1, team: 0, kills: 9, deaths: 7, score: 1100 },
      ],
    })!;
    expect(base.phase).toBe('end');
    expect(brawlResultTitle(base, 3, 0).text).toBe('YOU WIN');
    expect(brawlResultTitle(base, 1, 0).text).toBe('PLACE 2 OF 2');
    const tdm = { ...base, variant: 'tdm' as const, winner: 1 };
    expect(brawlResultTitle(tdm, 1, 1).text).toBe('VICTORY');
    expect(brawlResultTitle(tdm, 1, 0).text).toBe('DEFEAT');
    expect(brawlResultTitle({ ...tdm, winner: null }, 1, 0).text).toBe('DRAW');
  });
});
