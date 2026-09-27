// Ranked pre-match "versus" screen (Premier, Duels 1v1 / 2v2, Race): both teams side by side
// (or you vs them in a 1v1, or the racers), everyone's ladder rating + colour band (or their
// placement progress), wins / games, win rate, last 5 results, team averages — and the
// headline odds: "You have a 23% chance of beating Nova" (rating/versus.ts, the ladders' own
// expected-score maths), with a playful line.
//
// The server sends it once when the ranked room forms ({ t: 'versus' }). It shows for 7 s,
// Tab hides it early, and holding Tab brings it back while the match hasn't started (warm-up /
// spawn lock; a race: lobby / countdown).
import type { NetCore, VersusInfo, VersusPlayer } from '@space-yz/shared';
import { LADDERS, chancePercent, getMap, teamAverage, versusHeadline } from '@space-yz/shared';
import type { ClientFeature, GameClient } from '../game/client';
import { TEAM_COLOR } from '../game/objectives';
import { h } from './menus';

/** How long the screen stays up on its own (s). */
export const VERSUS_AUTO_SEC = 7;

export interface VersusOptions {
  /** may Tab bring it back now? (the match / race hasn't started) */
  canRecall: () => boolean;
  /** a name was clicked: open that player's profile (by account id) */
  openProfile?: (accountId: number) => void;
}

const pctText = (wins: number, games: number): string =>
  games > 0 ? `${Math.round((wins / games) * 100)}%` : '—';

/** Rating number (or placement progress) for a player row. */
export const ratingText = (p: VersusPlayer): string =>
  p.rating !== null
    ? String(p.rating)
    : p.placement
      ? `Placement ${p.placement.done}/${p.placement.need}`
      : '—';

export class VersusFeature implements ClientFeature {
  private root!: HTMLDivElement;
  private shown: VersusInfo | null = null;
  private autoUntil = 0;
  private time = 0;
  private held = false;
  /** Tab pressed to dismiss: ignore the hold until it is released */
  private swallowHold = false;
  private unsub: (() => void) | null = null;

  constructor(
    private readonly core: NetCore,
    private readonly opts: VersusOptions,
  ) {}

  init(c: GameClient): void {
    this.root = h('div', { class: 'versus' });
    this.root.style.display = 'none';
    c.deps.ui.append(this.root);
    this.unsub = c.deps.input.onAction((a) => {
      if (a === 'scoreboard') {
        if (this.time < this.autoUntil) {
          this.autoUntil = 0;
          this.swallowHold = true;
        } else this.held = true;
      }
      if (a === 'scoreboard:up') {
        this.held = false;
        this.swallowHold = false;
      }
    });
  }

  frame(c: GameClient, dt: number): void {
    this.time += dt;
    const info = this.core.versus;
    const recall = this.opts.canRecall();
    if (info !== this.shown) {
      this.shown = info;
      // (joined late, match already running: no pop-up, only Tab before the start)
      this.autoUntil = info && recall ? this.time + VERSUS_AUTO_SEC : 0;
      if (info) this.root.replaceChildren(this.view(info, c));
    }
    // the match started: the transition cards take over
    if (!recall) this.autoUntil = 0;
    const visible =
      !!info && (this.time < this.autoUntil || (this.held && !this.swallowHold && recall));
    this.root.style.display = visible ? '' : 'none';
    if (visible) c.panelOpen = true;
  }

  private view(info: VersusInfo, c: GameClient): HTMLElement {
    const localId = this.core.localId;
    const meLine = info.players.find((p) => p.id === localId);
    const myTeam: 0 | 1 = meLine?.team ?? c.session.local()?.team ?? 0;
    const head = versusHeadline(info, { id: localId, team: myTeam });
    const mi = getMap(info.map);
    const mapName = mi.id === info.map ? mi.name : info.map;
    const top = h(
      'div',
      { class: 'vs-top' },
      h('span', { class: 'vs-ladder' }, LADDERS[info.ladder]?.name ?? info.ladder),
      h('span', { class: 'vs-map' }, mapName),
    );
    const pct = chancePercent(head.chance);
    const [before, after = ''] = head.text.split(`${pct}%`);
    const odds = h(
      'div',
      { class: 'vs-odds' },
      h('div', { class: 'vs-headline' }, before, h('b', { class: 'vs-pct' }, `${pct}%`), after),
      h('div', { class: 'vs-line' }, head.line),
    );
    const hint = h(
      'div',
      { class: 'vs-hint' },
      'Tab: hide · hold Tab before the start to see it again',
    );
    if (info.ladder === 'race')
      return h('div', { class: 'vs-panel vs-race' }, top, odds, this.raceTable(info), hint);
    const bar = h(
      'div',
      { class: 'vs-bar' },
      h('div', {
        class: 'vs-bar-mine',
        style: `width:${pct}%;background:${TEAM_COLOR[myTeam]}`,
      }),
      h('div', {
        class: 'vs-bar-them',
        style: `background:${TEAM_COLOR[(1 - myTeam) as 0 | 1]}`,
      }),
    );
    const duel = info.players.length === 2;
    return h(
      'div',
      { class: `vs-panel${duel ? ' vs-duel' : ''}` },
      top,
      odds,
      bar,
      h(
        'div',
        { class: 'vs-teams' },
        this.teamCol(info, myTeam, localId, true),
        h('div', { class: 'vs-vs' }, 'VS'),
        this.teamCol(info, (1 - myTeam) as 0 | 1, localId, false),
      ),
      hint,
    );
  }

  private teamCol(info: VersusInfo, team: 0 | 1, localId: number, mine: boolean): HTMLElement {
    const players = info.players.filter((p) => p.team === team);
    const avg = teamAverage(info.players, team);
    const title =
      players.length === 1
        ? mine
          ? 'YOU'
          : 'OPPONENT'
        : `${mine ? 'YOUR TEAM' : 'THEM'}${avg !== null ? ` · avg ${avg}` : ''}`;
    return h(
      'div',
      { class: `vs-team${mine ? ' mine' : ''}`, style: `--vs-team:${TEAM_COLOR[team]}` },
      h('div', { class: 'vs-team-title' }, title),
      ...players.map((p) => this.row(p, p.id === localId)),
    );
  }

  private row(p: VersusPlayer, me: boolean): HTMLElement {
    const color = p.rank?.color ?? '#9aa6b8';
    const label = me ? `${p.name} (you)` : p.name;
    const open = this.opts.openProfile;
    const accountId = p.accountId;
    // a name opens the player's profile (when the pointer is free: before the game grabs it)
    const name =
      open && accountId !== null && accountId !== undefined
        ? h('button', { class: 'vs-name vs-name-link', type: 'button', title: 'Profile' }, label)
        : h('div', { class: 'vs-name' }, label);
    if (name instanceof HTMLButtonElement)
      name.addEventListener('click', (ev) => {
        ev.stopPropagation();
        open!(accountId!);
      });
    return h(
      'div',
      { class: `vs-row${me ? ' me' : ''}` },
      name,
      h(
        'div',
        { class: 'vs-rating', style: `color:${color};border-color:${color}` },
        ratingText(p),
        p.rank ? h('span', { class: 'vs-rank' }, p.rank.label) : null,
      ),
      h(
        'div',
        { class: 'vs-stats' },
        `${p.wins}W / ${p.games} games · ${pctText(p.wins, p.games)}`,
      ),
      h(
        'div',
        { class: 'vs-form' },
        ...(p.form.length
          ? p.form.map((r) => h('span', { class: `vs-f vs-f-${r}` }, r))
          : [h('span', { class: 'vs-f-none' }, 'no recent games')]),
      ),
    );
  }

  private raceTable(info: VersusInfo): HTMLElement {
    const localId = this.core.localId;
    const racers = [...info.players].sort((a, b) => (b.firstChance ?? 0) - (a.firstChance ?? 0));
    return h(
      'div',
      { class: 'vs-racers' },
      ...racers.map((p) =>
        h(
          'div',
          { class: 'vs-racer' },
          this.row(p, p.id === localId),
          h('div', { class: 'vs-first' }, `${chancePercent(p.firstChance ?? 0)}% to win`),
        ),
      ),
    );
  }

  dispose(): void {
    this.unsub?.();
    this.root.remove();
  }
}
