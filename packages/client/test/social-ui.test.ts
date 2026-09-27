// Profiles and friends UI helpers: every avatar is drawn, presence reads well.
import { describe, expect, it } from 'vitest';
import { AVATAR_COUNT } from '@space-yz/shared';
import { AVATARS, avatarSvg } from '../src/ui/avatars';
import { modeLabel, playtime } from '../src/ui/profile-screen';
import { presenceText } from '../src/ui/friends';

describe('avatars', () => {
  it('has one drawing per preset, all different', () => {
    expect(AVATARS.length).toBe(AVATAR_COUNT);
    expect(new Set(AVATARS.map((a) => a.body)).size).toBe(AVATAR_COUNT);
    expect(new Set(AVATARS.map((a) => a.name)).size).toBe(AVATAR_COUNT);
    // out-of-range ids fall back to a real avatar
    expect(avatarSvg(99)).toContain(AVATARS[AVATAR_COUNT - 1].body);
    expect(avatarSvg(-3)).toContain(AVATARS[0].body);
  });
});

describe('profile / friends text', () => {
  it('names modes and play time', () => {
    expect(modeLabel('5v5', 'bomb', 'premier')).toBe('Premier');
    expect(modeLabel('2v2', 'tower', 'duels')).toBe('Duels Tower 2v2');
    expect(modeLabel('3v3', 'elim')).toBe('Elimination 3v3');
    expect(modeLabel('arena')).toBe('Arena 1v1');
    expect(playtime(3 * 3600 + 5 * 60)).toBe('3 h 5 min');
    expect(playtime(59)).toBe('0 min');
  });

  it('says where a friend is', () => {
    expect(presenceText({ state: 'menu' })).toBe('Online · in the menus');
    expect(
      presenceText({
        state: 'room',
        mode: '2v2',
        objective: 'tower',
        map: 'kestrel',
        players: 3,
        maxPlayers: 4,
        joinable: true,
      }),
    ).toMatch(/^In a room · Tower 2v2 on .+ \(3\/4\)$/);
    expect(presenceText({ state: 'ranked', mode: '5v5', map: 'kestrel' })).toMatch(/^In ranked/);
    expect(presenceText({ state: 'offline' })).toBe('Offline');
  });
});
