// Text chat, push-to-talk state and voice signaling over real WebSockets: team chat stays in
// the team, all chat reaches the room, spam and garbage are dropped, and signaling only ever
// goes to the addressed human in the sender's own room.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ServerMsg } from '@space-yz/shared';
import { CHAT_MAX_LEN, RTC_SDP_MAX, sanitizeChat } from '@space-yz/shared';
import { startGameServer, type GameServer } from '../src/app';
import { startHeadlessBot, type HeadlessBot } from '../../../tools/bots/headless';

let server: GameServer;
let clients: HeadlessBot[] = [];

beforeAll(async () => {
  server = await startGameServer({ port: 0, host: '127.0.0.1', assets: null, log: () => {} });
});

afterEach(() => {
  // the server allows a dozen connections per IP: every test starts clean
  for (const c of clients) c.stop();
  clients = [];
});

afterAll(async () => {
  await server.close();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 5000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await wait(20);
  }
};

// invisible characters, built from code points (no look-alikes hidden in the source)
const RLO = String.fromCharCode(0x202e); // right-to-left override
const ZWSP = String.fromCharCode(0x200b); // zero-width space
/** n combining accents */
const marks = (n: number) =>
  Array.from({ length: n }, (_, i) => String.fromCharCode(0x301 + i)).join('');

const url = () => `ws://127.0.0.1:${server.port}/ws`;

interface Player {
  bot: HeadlessBot;
  got: ServerMsg[];
  id: number;
  team: 0 | 1;
  name: string;
}

const connect = (name: string, onReady: (c: HeadlessBot['core']) => void) => {
  const got: ServerMsg[] = [];
  const bot = startHeadlessBot({ url: url(), name, onReady });
  bot.core.listen((m) => got.push(m));
  clients.push(bot);
  return { bot, got };
};

/** A room with these humans (the first creates it, no bots). */
const room = async (mode: '1v1' | '2v2', names: string[]): Promise<Player[]> => {
  const out: { bot: HeadlessBot; got: ServerMsg[]; name: string }[] = [];
  const host = connect(names[0], (core) => core.createRoom(mode, 'kestrel', 0));
  await until(() => host.bot.core.state === 'room');
  out.push({ ...host, name: names[0] });
  for (const name of names.slice(1)) {
    const p = connect(name, (core) => core.joinRoom(host.bot.core.code));
    await until(() => p.bot.core.state === 'room');
    out.push({ ...p, name });
  }
  const r = server.hub.rooms.get(host.bot.core.code)!;
  return out.map((p) => {
    const m = r.members.get(p.bot.core.localId)!;
    return { ...p, id: m.id, team: m.team, name: m.name };
  });
};

const chats = (p: Player) =>
  p.got.filter((m): m is Extract<ServerMsg, { t: 'chat' }> => m.t === 'chat');
const of = <T extends ServerMsg['t']>(p: Player, t: T) =>
  p.got.filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t);

describe('sanitizeChat', () => {
  it('strips control/formatting characters and rejects empty or long messages', () => {
    expect(sanitizeChat('  hello   world ')).toBe('hello world');
    expect(sanitizeChat(`a\u0000b${RLO}c${ZWSP}d\nx`)).toBe('abcd x');
    expect(sanitizeChat(`e${marks(5)}`)).toBe(`e${marks(2)}`);
    expect(sanitizeChat('   ')).toBeNull();
    expect(sanitizeChat(`\u0007${RLO}`)).toBeNull();
    expect(sanitizeChat(42)).toBeNull();
    expect(sanitizeChat('x'.repeat(CHAT_MAX_LEN))).toBe('x'.repeat(CHAT_MAX_LEN));
    expect(sanitizeChat('x'.repeat(CHAT_MAX_LEN + 1))).toBeNull();
    expect(sanitizeChat('<b>hi</b> 🙂')).toBe('<b>hi</b> 🙂'); // shown as text, never HTML
  });
});

describe('text chat', () => {
  it('team chat reaches only teammates, all chat everyone in the room', async () => {
    const ps = await room('2v2', ['Ana', 'Bo', 'Cy', 'Di']);
    const a = ps[0];
    const mates = ps.filter((p) => p.team === a.team);
    const enemies = ps.filter((p) => p.team !== a.team);
    expect(mates.length).toBe(2);
    expect(enemies.length).toBe(2);

    a.bot.core.sendChat('push mid', true);
    await until(() => mates.every((p) => chats(p).length === 1));
    await wait(250);
    for (const e of enemies) expect(chats(e)).toEqual([]);
    expect(chats(mates[1])[0]).toMatchObject({
      id: a.id,
      from: a.name,
      team: a.team,
      text: 'push mid',
      teamOnly: true,
    });

    a.bot.core.sendChat('gg all', false);
    await until(() => ps.every((p) => chats(p).some((c) => c.text === 'gg all')));
    const e = chats(enemies[0]).find((c) => c.text === 'gg all')!;
    expect(e).toMatchObject({ id: a.id, from: a.name, team: a.team, teamOnly: false });

    // an enemy's team chat never reaches a's team
    enemies[0].bot.core.sendChat('secret plan', true);
    await until(() => chats(enemies[1]).some((c) => c.text === 'secret plan'));
    await wait(250);
    for (const m of mates) expect(chats(m).some((c) => c.text === 'secret plan')).toBe(false);
  }, 20000);

  it('rate limits chat (5 messages / 5 s) and tells the sender', async () => {
    const [a, b] = await room('1v1', ['Spam', 'Victim']);
    for (let i = 0; i < 8; i++) a.bot.core.sendChat(`msg ${i}`, false);
    await until(() => chats(b).length >= 5 && of(a, 'notice').length >= 1);
    await wait(300);
    expect(chats(b).map((c) => c.text)).toEqual(['msg 0', 'msg 1', 'msg 2', 'msg 3', 'msg 4']);
    expect(of(a, 'notice')).toHaveLength(1);
    expect(of(a, 'notice')[0].msg).toMatch(/slow down/i);
  }, 20000);

  it('drops long and garbage messages, cleans the rest', async () => {
    const [a, b] = await room('1v1', ['Weird', 'Reader']);
    a.bot.core.sendChat('x'.repeat(CHAT_MAX_LEN + 1), false);
    a.bot.core.sendChat(`   \u0000${RLO}  `, false);
    a.bot.core.sendJson({ t: 'chat', text: 42 } as never);
    a.bot.core.sendJson({ t: 'chat', text: { toString: 'boom' } } as never);
    a.bot.core.sendChat(`hi${RLO}there\u0007`, false);
    a.bot.core.sendChat('last', false);
    await until(() => chats(b).some((c) => c.text === 'last'));
    expect(chats(b).map((c) => c.text)).toEqual(['hithere', 'last']);
  }, 20000);
});

describe('voice signaling', () => {
  it('relays offers only to the addressed human in the same room', async () => {
    const ps = await room('2v2', ['Offer', 'Answer', 'Third']);
    const [a, b, c] = ps;
    const other = await room('1v1', ['Else1', 'Else2']);
    a.bot.core.sendRtc(b.id, { kind: 'offer', sdp: 'v=0 fake sdp' });
    await until(() => of(b, 'rtc').length === 1);
    expect(of(b, 'rtc')[0]).toEqual({
      t: 'rtc',
      from: a.id,
      data: { kind: 'offer', sdp: 'v=0 fake sdp' },
    });
    b.bot.core.sendRtc(a.id, { kind: 'answer', sdp: 'v=0 answer' });
    await until(() => of(a, 'rtc').length === 1);
    expect(of(a, 'rtc')[0].from).toBe(b.id);

    // not to yourself, nobody, a malformed payload, an oversized SDP or extra fields
    a.bot.core.sendRtc(a.id, { kind: 'bye' });
    a.bot.core.sendRtc(99, { kind: 'bye' });
    a.bot.core.sendJson({ t: 'rtc', to: c.id, data: { kind: 'evil' } } as never);
    a.bot.core.sendJson({ t: 'rtc', to: c.id, data: { kind: 'offer' } } as never);
    a.bot.core.sendRtc(c.id, { kind: 'offer', sdp: 'x'.repeat(RTC_SDP_MAX + 1) });
    a.bot.core.sendJson({ t: 'rtc', to: c.id, data: { kind: 'hi', html: '<script>' } } as never);
    await until(() => of(c, 'rtc').length === 1);
    expect(of(c, 'rtc')[0]).toEqual({ t: 'rtc', from: a.id, data: { kind: 'hi' } });

    // another room: the same id number means someone else there, never b
    other[0].bot.core.sendRtc(b.id, { kind: 'offer', sdp: 'from elsewhere' });
    other[0].bot.core.sendRtc(other[1].id, { kind: 'offer', sdp: 'same room' });
    await until(() => of(other[1], 'rtc').some((m) => m.data.sdp === 'same room'));
    await wait(250);
    for (const p of ps)
      expect(of(p, 'rtc').some((m) => m.data.sdp === 'from elsewhere')).toBe(false);
    expect(of(a, 'rtc')).toHaveLength(1);
  }, 20000);

  it('team talk is announced to teammates only, all talk to everyone', async () => {
    const ps = await room('2v2', ['Talker', 'E1', 'Mate', 'E2']);
    const a = ps[0];
    const mate = ps.find((p) => p !== a && p.team === a.team)!;
    const enemies = ps.filter((p) => p.team !== a.team);

    a.bot.core.sendVoice(true, false);
    await until(() => of(mate, 'voice').length === 1);
    expect(of(mate, 'voice')[0]).toEqual({ t: 'voice', from: a.id, on: true, all: false });
    a.bot.core.sendVoice(false, false);
    await until(() => of(mate, 'voice').length === 2);
    await wait(250);
    for (const e of enemies) expect(of(e, 'voice')).toEqual([]);

    a.bot.core.sendVoice(true, true);
    await until(() => enemies.every((e) => of(e, 'voice').length === 1));
    for (const e of enemies)
      expect(of(e, 'voice')[0]).toEqual({ t: 'voice', from: a.id, on: true, all: true });
    a.bot.core.sendVoice(false, false);
    await until(() => enemies.every((e) => of(e, 'voice').length === 2));
    for (const e of enemies) expect(of(e, 'voice')[1]).toMatchObject({ from: a.id, on: false });
    expect(of(a, 'voice')).toEqual([]); // not echoed to the talker
  }, 20000);
});
