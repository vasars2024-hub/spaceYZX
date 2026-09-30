// Brawl HUD (shared/rules/brawl.ts): the score and the match clock on top (TDM: both teams'
// kills; FFA: your kills and place, and the leader), a banner when a Brawl starts, "Back in 2…"
// while you're dead, the scoreboard on Tab (kills, deaths, score) and the results with
// "Next: <map> in 10 s" and a Back to menu button. Works offline (the state comes straight from
// the rules) and online (the server's rules state `{ rules: 'brawl', ... }`). Reuses the match
// HUD's styles (.match-bar, .scoreboard, .match-results, ...).
import type { BrawlRow, BrawlView } from '@space-yz/shared';
import { TICK_DT, getMap } from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import type { CombatFeature } from './combat-feature';
import { h } from '../ui/menus';
import { TEAM_COLOR } from './objectives';
import { setSidesSwapped } from '../render/team-palette';

const WIN = '#5dff9a';
const LOSS = '#ff5b5b';

const fmt = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The Brawl state from a NetCore's rules state (null in other rooms). */
export const brawlFromExtra = (extra: unknown): BrawlView | null => {
  const x = extra as (BrawlView & { rules?: string }) | null;
  return x && x.rules === 'brawl' ? x : null;
};

/** The mode's name as players see it. */
export const brawlModeName = (variant: BrawlView['variant']): string =>
  variant === 'ffa' ? 'FREE-FOR-ALL' : 'TEAM DEATHMATCH';

/** Your place in the standings (1 = best; 0 = not in them). */
export const brawlPlace = (v: BrawlView, id: number): number =>
  v.table.findIndex((r) => r.id === id) + 1;

/** The results headline from your point of view. */
export const brawlResultTitle = (
  v: BrawlView,
  me: number,
  myTeam: 0 | 1 | undefined,
): { text: string; color: string; won: boolean } => {
  if (v.winner === null) return { text: 'DRAW', color: '#fff', won: false };
  if (v.variant === 'ffa') {
    const won = v.winner === me;
    const place = brawlPlace(v, me);
    return {
      text: won ? 'YOU WIN' : place > 0 ? `PLACE ${place} OF ${v.table.length}` : 'BRAWL OVER',
      color: won ? WIN : '#fff',
      won,
    };
  }
  const won = v.winner === myTeam;
  return { text: won ? 'VICTORY' : 'DEFEAT', color: won ? WIN : LOSS, won };
};

export class BrawlFeature implements ClientFeature {
  private root!: HTMLDivElement;
  private left!: HTMLDivElement;
  private center!: HTMLDivElement;
  private right!: HTMLDivElement;
  private sub!: HTMLDivElement;
  private banner!: HTMLDivElement;
  private bannerSub!: HTMLDivElement;
  private bannerUntil = 0;
  private board!: HTMLDivElement;
  private results!: HTMLDivElement;
  private resBoard!: HTMLDivElement;
  private resNext!: HTMLDivElement;
  private boardHeld = false;
  private unsub: (() => void) | null = null;
  private time = 0;
  private lastBoard = -1;
  /** the Brawl whose start / end we already announced */
  private startedNo = -1;
  private endedNo = -1;
  /** when (this.time) you last died, for the respawn countdown (-1 = alive) */
  private deadAt = -1;

  constructor(
    private opts: {
      /** the Brawl state now (offline: brawlView(...); online: brawlFromExtra(core.extra)) */
      view: () => BrawlView | null;
      /** its "ELIMINATED" line becomes the respawn countdown */
      combat?: CombatFeature;
      /** the results' Back to menu button */
      onBack?: () => void;
    },
  ) {}

  init(c: GameClient): void {
    this.left = h('div', { class: 'mb-score' });
    this.center = h('div', { class: 'mb-center' });
    this.right = h('div', { class: 'mb-score' });
    this.sub = h('div', { class: 'mb-sub' });
    this.banner = h('div', { class: 'match-banner' });
    this.bannerSub = h('div', { class: 'match-banner-sub' });
    this.board = h('div', { class: 'scoreboard' });
    this.results = h('div', { class: 'match-results brawl-results' });
    this.root = h(
      'div',
      { class: 'match-ui brawl-ui' },
      h(
        'div',
        { class: 'match-bar' },
        h('div', { class: 'mb-row' }, this.left, this.center, this.right),
        this.sub,
      ),
      h('div', { class: 'match-banner-wrap' }, this.banner, this.bannerSub),
      this.board,
      this.results,
    );
    this.root.style.display = 'none';
    this.board.style.display = 'none';
    this.results.style.display = 'none';
    c.deps.ui.append(this.root);
    this.unsub = c.deps.input.onAction((a) => {
      if (a === 'scoreboard') this.boardHeld = true;
      if (a === 'scoreboard:up') this.boardHeld = false;
    });
  }

  private name(c: GameClient, id: number): string {
    return id === c.session.localId ? 'You' : (c.session.names()[id] ?? `Player ${id}`);
  }

  private showBanner(text: string, sub: string, sec: number, color = '#fff'): void {
    this.banner.textContent = text;
    this.banner.style.color = color;
    this.bannerSub.textContent = sub;
    this.bannerUntil = this.time + sec;
  }

  frame(c: GameClient, dt: number): void {
    this.time += dt;
    const v = this.opts.view();
    if (!v) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = '';
    // no side swaps in a Brawl: team colours stay put (a match before may have swapped them)
    setSidesSwapped(false);
    const s = c.session;
    const me = s.localId;
    const local = s.local();
    const tick = s.tickNow?.() ?? s.world().tick;
    const secs = (until: number) => (until - tick) * TICK_DT;
    const mine = v.table.find((r) => r.id === me);

    // ---- top bar ----
    const clock = v.phase === 'live' ? fmt(secs(v.endsTick)) : 'Results';
    if (v.variant === 'tdm') {
      this.left.textContent = String(v.scores[0]);
      this.left.style.color = TEAM_COLOR[0];
      this.right.textContent = String(v.scores[1]);
      this.right.style.color = TEAM_COLOR[1];
      this.center.textContent = clock;
      this.sub.textContent = `Team deathmatch · first team to ${v.target} kills`;
    } else {
      const leader = v.table[0];
      const place = brawlPlace(v, me);
      this.left.textContent = String(mine?.kills ?? 0);
      this.left.style.color = TEAM_COLOR[0];
      this.center.textContent = clock;
      this.right.textContent = leader ? String(leader.kills) : '0';
      this.right.style.color = TEAM_COLOR[1];
      this.sub.textContent = [
        place > 0 ? `You: #${place} of ${v.table.length}` : '',
        leader && leader.id !== me
          ? `Leader: ${this.name(c, leader.id)}`
          : leader
            ? 'You lead'
            : '',
        `first to ${v.target} kills`,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    this.center.classList.toggle('urgent', v.phase === 'live' && secs(v.endsTick) <= 30);

    // ---- banners: a new Brawl, the end ----
    if (v.phase === 'live' && this.startedNo !== v.matchNo) {
      this.startedNo = v.matchNo;
      this.showBanner(
        brawlModeName(v.variant),
        `${getMap(v.map).name} · ${v.variant === 'ffa' ? 'first to' : 'first team to'} ${v.target} kills`,
        3,
        TEAM_COLOR[0],
      );
    }
    if (v.phase === 'end' && this.endedNo !== v.matchNo) {
      this.endedNo = v.matchNo;
      const r = brawlResultTitle(v, me, local?.team);
      c.deps.audio.play(r.won ? 'roundWin' : 'roundLose');
      this.bannerUntil = 0;
      this.buildResults(c, v);
    }
    const bannerOn = this.time < this.bannerUntil;
    this.banner.style.opacity = bannerOn ? '1' : '0';
    this.bannerSub.style.opacity = bannerOn ? '1' : '0';

    // ---- dead: the respawn countdown ----
    const combat = this.opts.combat;
    if (local && !local.alive) {
      if (this.deadAt < 0) this.deadAt = this.time;
    } else this.deadAt = -1;
    if (combat?.hud && local && !local.alive && v.phase === 'live' && !c.panelOpen) {
      // (counted from when your death showed up here: close enough to the server's timer)
      const left = Math.max(1, Math.ceil(v.respawnSec - (this.time - this.deadAt)));
      combat.hud.setDeath(`ELIMINATED · back in ${left}`);
    }

    // ---- scoreboard (Tab) and the results ----
    const showBoard = this.boardHeld && v.phase === 'live' && v.table.length > 0;
    this.board.style.display = showBoard ? '' : 'none';
    this.results.style.display = v.phase === 'end' ? '' : 'none';
    c.panelOpen = showBoard || v.phase === 'end';
    if (this.time - this.lastBoard > 0.25) {
      this.lastBoard = this.time;
      if (showBoard) this.board.replaceChildren(this.scoreboard(c, v));
      if (v.phase === 'end') {
        this.resBoard.replaceChildren(this.scoreboard(c, v));
        const left = Math.max(0, Math.ceil(secs(v.phaseEnds)));
        this.resNext.textContent = `Next: ${getMap(v.next).name} in ${left} s`;
      }
    }
  }

  /** The results panel (built once per Brawl: its button must survive the updates). */
  private buildResults(c: GameClient, v: BrawlView): void {
    const r = brawlResultTitle(v, c.session.localId, c.session.local()?.team);
    const reason =
      v.winner === null
        ? v.endReason === 'time'
          ? 'Time is up: level on kills'
          : ''
        : v.variant === 'ffa'
          ? `${this.name(c, v.winner)} ${v.winner === c.session.localId ? 'win' : 'wins'} · ${
              v.endReason === 'score'
                ? `first to ${v.target} kills`
                : 'most kills at the time limit'
            }`
          : `${v.scores[0]} – ${v.scores[1]} · ${
              v.endReason === 'score' ? `first team to ${v.target}` : 'most kills at the time limit'
            }`;
    this.resBoard = h('div', {});
    this.resNext = h('div', { class: 'mr-next' });
    const back = h('button', { class: 'btn secondary brawl-back', type: 'button' }, 'Back to menu');
    back.addEventListener('click', () => this.opts.onBack?.());
    this.results.replaceChildren(
      h(
        'div',
        { class: 'mr' },
        h('div', { class: 'mr-title', style: `color:${r.color}` }, r.text),
        h('div', { class: 'mr-reason' }, reason),
        this.resBoard,
        this.resNext,
        this.opts.onBack ? back : null,
        h('div', { class: 'mr-hint' }, 'Esc for the menu'),
      ),
    );
  }

  /** The scoreboard: TDM one table per team, FFA one table; kills, deaths, score, ping. */
  scoreboard(c: GameClient, v: BrawlView): HTMLElement {
    const me = c.session.localId;
    const pings = c.session.pings?.() ?? {};
    const table = (rows: BrawlRow[], rank: boolean) =>
      h(
        'table',
        {},
        h(
          'tr',
          {},
          ...[rank ? '#' : '', 'Player', 'K', 'D', 'Score', 'Ping'].map((x) => h('th', {}, x)),
        ),
        ...rows.map((r) =>
          h(
            'tr',
            { class: r.id === me ? 'me' : '' },
            h('td', {}, rank ? String(v.table.indexOf(r) + 1) : ''),
            h('td', {}, this.name(c, r.id)),
            h('td', {}, String(r.kills)),
            h('td', {}, String(r.deaths)),
            h('td', {}, String(r.score)),
            h('td', {}, pings[r.id] ? `${pings[r.id]} ms` : '—'),
          ),
        ),
      );
    const title = `${brawlModeName(v.variant)} · ${getMap(v.map).name}`;
    if (v.variant === 'ffa')
      return h(
        'div',
        { class: 'sb' },
        h('div', { class: 'sb-title' }, title),
        table(v.table, true),
      );
    return h(
      'div',
      { class: 'sb' },
      h('div', { class: 'sb-title' }, title),
      h(
        'div',
        { class: 'sb-cols' },
        ...([0, 1] as const).map((team) =>
          h(
            'div',
            { class: 'sb-team' },
            h(
              'div',
              { class: 'sb-title', style: `color:${TEAM_COLOR[team]}` },
              `${team === 0 ? 'Cyan' : 'Orange'} · ${v.scores[team]}`,
            ),
            table(
              v.table.filter((r) => r.team === team),
              false,
            ),
          ),
        ),
      ),
    );
  }

  dispose(): void {
    this.unsub?.();
    this.root.remove();
  }
}
