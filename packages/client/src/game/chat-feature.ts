// Online text chat + push-to-talk voice (in rooms, warmup and matches; not offline).
// Enter = team chat, Y = all chat, V = talk to your team, B = talk to everyone (rebindable).
// Chat feed bottom-left (fades after a few seconds, all visible while typing); who's talking
// top-left. Per-player mutes (scoreboard in the Esc menu) cover both text and voice.
// All player text goes into the page as text nodes, never as HTML.
import type { ChatLine, NetCore, ServerMsg } from '@space-yz/shared';
import { CHAT_MAX_LEN, sanitizeChat } from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import type { Settings } from '../settings';
import { h } from '../ui/menus';
import { keyLabel } from '../ui/settings-screen';
import { TEAM_COLOR } from './objectives';
import { mutes } from '../net/mutes';
import { VoiceMesh, type TalkMode } from '../net/voice';

const FEED_LINES = 6;
const OPEN_LINES = 12;
const KEEP_LINES = 50;
const FADE_MS = 8000;
const NOTE_MS = 7000;

interface FeedLine {
  el: HTMLElement;
  at: number;
}

export class ChatFeature implements ClientFeature {
  private root!: HTMLDivElement;
  private feed!: HTMLDivElement;
  private inputRow!: HTMLDivElement;
  private inputTag!: HTMLSpanElement;
  private input!: HTMLInputElement;
  private voiceBox!: HTMLDivElement;
  private lines: FeedLine[] = [];
  private notes: { text: string; until: number }[] = [];
  /** the chat box is open: which channel */
  private open: 'team' | 'all' | null = null;
  /** who is talking (from the server): player id -> channel */
  private talking = new Map<number, { all: boolean }>();
  private voice: VoiceMesh | null = null;
  private client: GameClient | null = null;
  private unsubs: (() => void)[] = [];
  private lastPaint = 0;
  private lastVoiceKey = '';

  constructor(
    private core: NetCore,
    private settings: Settings,
  ) {}

  init(c: GameClient): void {
    this.client = c;
    this.feed = h('div', { class: 'chat-feed' });
    this.inputTag = h('span', { class: 'chat-tag' });
    this.input = h('input', {
      type: 'text',
      class: 'chat-input',
      maxlength: String(CHAT_MAX_LEN),
      autocomplete: 'off',
      spellcheck: 'false',
      enterkeyhint: 'send',
    });
    // phones: tap the [TEAM]/[ALL] tag to switch channel, ➤ sends (no Enter/Y keys there);
    // mousedown is cancelled so the text field keeps the keyboard
    const keepFocus = (el: HTMLElement) =>
      el.addEventListener('mousedown', (e) => e.preventDefault());
    keepFocus(this.inputTag);
    this.inputTag.addEventListener('click', () => {
      if (this.open) this.setChannel(this.open === 'team' ? 'all' : 'team');
    });
    const sendBtn = h('button', { class: 'chat-send', type: 'button', 'aria-label': 'Send' }, '➤');
    keepFocus(sendBtn);
    sendBtn.addEventListener('click', () => this.send());
    this.inputRow = h(
      'div',
      { class: 'chat-input-row hidden' },
      this.inputTag,
      this.input,
      sendBtn,
    );
    this.root = h('div', { class: 'chat' }, this.feed, this.inputRow);
    this.voiceBox = h('div', { class: 'voice-box' });
    c.deps.ui.append(this.root, this.voiceBox);

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.isComposing) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        this.send();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Tab') e.preventDefault();
    });
    this.input.addEventListener('blur', () => this.close());

    const input = c.deps.input;
    this.unsubs.push(
      input.onAction((a) => {
        if (!input.capture || input.isTyping) return;
        if (a === 'chatTeam') this.openBox('team');
        else if (a === 'chatAll') this.openBox('all');
        else if ((a === 'voiceTeam' || a === 'voiceAll') && !this.settings.voiceEnabled)
          this.note('Voice chat is off (Settings → Chat & voice)');
      }),
      this.core.listen((msg) => this.onMessage(msg)),
      mutes.onChange(() => this.paint(performance.now(), true)),
    );
    mutes.canMute = (id) =>
      id !== this.core.localId && this.core.roster.some((p) => p.id === id && !p.bot);

    this.voice = new VoiceMesh(this.core, {
      enabled: () => this.settings.voiceEnabled,
      volumeFor: (id) => this.voiceVolume(id),
      note: (t) => this.note(t),
      nameOf: (id) => this.nameOf(id),
    });
    if (!this.voice.supported && this.settings.voiceEnabled)
      this.note('Voice chat is not supported in this browser — text chat works');
  }

  private myTeam(): 0 | 1 {
    return (
      this.core.roster.find((p) => p.id === this.core.localId)?.team ??
      this.client?.session.local()?.team ??
      0
    );
  }

  private teamOf(id: number): 0 | 1 | undefined {
    return this.core.roster.find((p) => p.id === id)?.team;
  }

  private nameOf(id: number): string {
    return this.core.roster.find((p) => p.id === id)?.name ?? `Player ${id}`;
  }

  private isEnemy(id: number): boolean {
    const t = this.teamOf(id);
    return t !== undefined && t !== this.myTeam();
  }

  /** May we hear this player right now (voice on, not muted, enemies only on all talk)? */
  private voiceAllowed(id: number): boolean {
    const s = this.settings;
    if (!s.voiceEnabled || mutes.has(id)) return false;
    // enemies are only ever heard on the all channel (and they only send us that anyway)
    if (this.isEnemy(id)) return !s.muteEnemies && s.voiceHearEnemy && !!this.talking.get(id)?.all;
    return true;
  }

  /** How loud a player's voice plays: 0 when muted / not allowed. */
  private voiceVolume(id: number): number {
    return this.voiceAllowed(id) ? this.settings.voiceVolume * this.settings.masterVolume : 0;
  }

  private onMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'chat':
        this.addChat(msg);
        break;
      case 'voice':
        if (msg.on) this.talking.set(msg.from, { all: msg.all });
        else this.talking.delete(msg.from);
        break;
      case 'room':
        for (const id of [...this.talking.keys()])
          if (!msg.players.some((p) => p.id === id)) this.talking.delete(id);
        break;
    }
  }

  private addChat(line: ChatLine): void {
    if (mutes.has(line.id)) return;
    const enemy = line.team !== this.myTeam();
    if (enemy && (this.settings.muteEnemies || !this.settings.chatShowEnemyAll)) return;
    if (enemy && line.teamOnly) return; // never happens (the server only sends team chat to the team)
    const me = line.id === this.core.localId;
    const el = h(
      'div',
      { class: 'chat-line' },
      line.dead ? h('span', { class: 'chat-dead' }, '*DEAD* ') : null,
      line.teamOnly ? h('span', { class: 'chat-team' }, '[TEAM] ') : null,
      h('span', { class: 'chat-name', style: `color:${TEAM_COLOR[line.team]}` }, line.from),
      me ? h('span', { class: 'chat-you' }, ' (you)') : null,
      ': ',
      h('span', { class: 'chat-text' }, line.text),
    );
    this.feed.append(el);
    this.lines.push({ el, at: performance.now() });
    while (this.lines.length > KEEP_LINES) this.lines.shift()?.el.remove();
    this.paint(performance.now(), true);
    if (!me) this.client?.deps.audio.play('uiHover', { volume: 0.35 });
  }

  private note(text: string): void {
    const now = performance.now();
    this.notes = this.notes.filter((n) => n.until > now && n.text !== text);
    this.notes.push({ text, until: now + NOTE_MS });
    if (this.notes.length > 3) this.notes.shift();
    this.lastVoiceKey = '';
  }

  private openBox(mode: 'team' | 'all'): void {
    if (!this.client) return;
    this.client.deps.input.setTyping(true);
    this.setChannel(mode);
    this.input.value = '';
    this.inputRow.classList.remove('hidden');
    this.root.classList.add('open');
    this.input.focus({ preventScroll: true });
    this.paint(performance.now(), true);
  }

  private setChannel(mode: 'team' | 'all'): void {
    this.open = mode;
    this.inputTag.textContent = mode === 'team' ? '[TEAM]' : '[ALL]';
    this.inputTag.style.color = mode === 'team' ? TEAM_COLOR[this.myTeam()] : '#e8f1ff';
    this.input.placeholder = `${mode === 'team' ? 'Team' : 'All'} chat — Enter sends, Esc cancels`;
  }

  private send(): void {
    const text = sanitizeChat(this.input.value);
    if (text && this.open) this.core.sendChat(text, this.open === 'team');
    this.close();
  }

  close(): void {
    if (!this.open) return;
    this.open = null;
    this.client?.deps.input.setTyping(false);
    this.inputRow.classList.add('hidden');
    this.root.classList.remove('open');
    this.input.value = '';
    if (document.activeElement === this.input) this.input.blur();
    this.paint(performance.now(), true);
  }

  /** Chat feed visibility: last few lines, fading; everything recent while typing. */
  private paint(now: number, force = false): void {
    if (!force && now - this.lastPaint < 200) return;
    this.lastPaint = now;
    const n = this.lines.length;
    this.lines.forEach((l, i) => {
      const fromEnd = n - 1 - i;
      const hidden = this.open ? fromEnd >= OPEN_LINES : fromEnd >= FEED_LINES;
      l.el.classList.toggle('hidden', hidden);
      l.el.classList.toggle('faded', !this.open && now - l.at > FADE_MS);
    });
  }

  frame(c: GameClient): void {
    const now = performance.now();
    const input = c.deps.input;
    // a menu opened (Esc, lost the mouse): drop the chat box
    if (this.open && !input.capture) this.close();
    const talk: TalkMode =
      !input.capture || input.isTyping
        ? null
        : input.isHeld('voiceAll')
          ? 'all'
          : input.isHeld('voiceTeam')
            ? 'team'
            : null;
    this.voice?.setTalk(this.settings.voiceEnabled ? talk : null);
    this.voice?.update(now);
    this.paint(now);
    this.paintVoice(now);
  }

  /** Top-left: your mic, who's talking (team colors, [ALL] tag), voice notes. */
  private paintVoice(now: number): void {
    this.notes = this.notes.filter((n) => n.until > now);
    const rows: { text: string; color: string; tag?: string; cls?: string }[] = [];
    const v = this.voice;
    const mode = v?.talking() ?? null;
    if (mode && v) {
      const tag = mode === 'all' ? 'ALL' : 'TEAM';
      if (v.micState === 'asking')
        rows.push({ text: '🎙 Allow the microphone…', color: '#e8f1ff', cls: 'me' });
      else if (v.micState === 'ready')
        rows.push({ text: '🎙 You', color: TEAM_COLOR[this.myTeam()], tag, cls: 'me' });
    }
    for (const [id, st] of this.talking) {
      if (!this.voiceAllowed(id)) continue;
      const team = this.teamOf(id);
      rows.push({
        text: `🔊 ${this.nameOf(id)}`,
        color: team === undefined ? '#e8f1ff' : TEAM_COLOR[team],
        tag: st.all ? 'ALL' : undefined,
      });
    }
    for (const n of this.notes) rows.push({ text: n.text, color: '', cls: 'note' });
    const key = JSON.stringify(rows);
    if (key === this.lastVoiceKey) return;
    this.lastVoiceKey = key;
    this.voiceBox.replaceChildren(
      ...rows.map((r) =>
        h(
          'div',
          { class: `voice-row ${r.cls ?? ''}` },
          h('span', r.color ? { style: `color:${r.color}` } : {}, r.text),
          r.tag ? h('span', { class: 'voice-tag' }, ` [${r.tag}]`) : null,
        ),
      ),
    );
  }

  /** Short help for the HUD hint line (uses the current key bindings). */
  static hint(s: Settings): string {
    const k = (a: string) => keyLabel(s.keybinds[a]?.[0]);
    return `${k('chatTeam')} team chat · ${k('chatAll')} all chat · hold ${k('voiceTeam')} / ${k('voiceAll')} to talk (team / all)`;
  }

  dispose(): void {
    this.close();
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.voice?.dispose();
    this.voice = null;
    mutes.clear();
    this.root.remove();
    this.voiceBox.remove();
    this.client = null;
  }
}
