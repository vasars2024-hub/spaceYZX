// Arena 1v1 HUD (shared/rules/arena.ts): your pit, your opponent, the duel timer, your wins and
// losses and the match clock (top bar); "Next: vs … in 3" between duels and DUEL WON / LOST
// banners; the standings (Tab) and the final results. While you wait for the other pits it
// keeps the camera on a fight (your pit, else the top pit that is still fighting).
// Works offline (the state comes straight from the rules) and online (the server's rules state
// `{ rules: 'arena', ... }`). Reuses the match HUD's styles (.match-bar, .scoreboard, ...).
import type { ArenaView, DuelEndReason } from '@space-yz/shared';
import { TICK_DT, yawToView, v3 } from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import type { CombatFeature } from './combat-feature';
import { h } from '../ui/menus';
import { TEAM_COLOR } from './objectives';

const WIN = '#5dff9a';
const LOSS = '#ff5b5b';

const REASON: Record<DuelEndReason, string> = {
  kill: 'Kill',
  trade: 'Both died: more damage wins',
  hp: 'Time: more health wins',
  coin: 'Time, equal health: coin flip',
  forfeit: 'Opponent left',
};

const fmt = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The arena state from a NetCore's rules state (null in other rooms). */
export const arenaFromExtra = (extra: unknown): ArenaView | null => {
  const x = extra as (ArenaView & { rules?: string }) | null;
  return x && x.rules === 'arena' ? x : null;
};

/** Which pit a player watches (mirrors shared arenaWatchPit, from the client's view). */
export const watchPitOf = (v: ArenaView, id: number, alive: boolean): number => {
  const d = v.duels.find((x) => x.ids.includes(id));
  if (d && (d.winner === null || alive)) return d.pit;
  if (v.phase === 'duel') {
    const live = v.duels.filter((x) => x.winner === null).sort((a, b) => a.pit - b.pit)[0];
    if (live) return live.pit;
  }
  return d?.pit ?? v.duels[0]?.pit ?? 0;
};

export class ArenaFeature implements ClientFeature {
  private root!: HTMLDivElement;
  private title!: HTMLDivElement;
  private timer!: HTMLDivElement;
  private sub!: HTMLDivElement;
  private banner!: HTMLDivElement;
  private bannerSub!: HTMLDivElement;
  private bannerUntil = 0;
  private board!: HTMLDivElement;
  private results!: HTMLDivElement;
  private boardHeld = false;
  private unsub: (() => void) | null = null;
  private time = 0;
  private lastBoard = -1;
  /** round whose break we already turned the camera for */
  private facedRound = -1;
  /** duels we already announced (round:pit) */
  private announced = new Set<string>();
  private lastCount = -1;

  constructor(
    private opts: {
      /** the arena state now (offline: arenaView(st); online: arenaFromExtra(core.extra)) */
      view: () => ArenaView | null;
      /** its "ELIMINATED" line is replaced by the arena's own wording */
      combat?: CombatFeature;
    },
  ) {}

  init(c: GameClient): void {
    this.title = h('div', { class: 'mb-center' });
    this.timer = h('div', { class: 'mb-score' });
    this.sub = h('div', { class: 'mb-sub' });
    this.banner = h('div', { class: 'match-banner' });
    this.bannerSub = h('div', { class: 'match-banner-sub' });
    this.board = h('div', { class: 'scoreboard' });
    this.results = h('div', { class: 'match-results' });
    this.root = h(
      'div',
      { class: 'match-ui arena-ui' },
      h(
        'div',
        { class: 'match-bar' },
        h('div', { class: 'mb-row' }, this.title, this.timer),
        this.sub,
      ),
      h('div', { class: 'match-banner-wrap' }, this.banner, this.bannerSub),
      this.board,
      this.results,
    );
    this.root.style.display = 'none';
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
    const s = c.session;
    const me = s.localId;
    const local = s.local();
    const tick = s.tickNow?.() ?? s.world().tick;
    const secs = (until: number) => (until - tick) * TICK_DT;
    const duel = v.duels.find((d) => d.ids.includes(me)) ?? null;
    const side = duel ? (duel.ids[0] === me ? 0 : 1) : null;
    const opp = duel ? duel.ids[side === 0 ? 1 : 0] : null;
    const row = v.table.find((r) => r.id === me);
    const sitting = v.sitting.includes(me);
    const clock =
      v.phase === 'warmup' || v.phase === 'matchEnd'
        ? ''
        : secs(v.matchEnds) > 0
          ? `Match ${fmt(secs(v.matchEnds))}`
          : 'Last round';
    const record = row ? `W ${row.wins} · L ${row.losses}` : '';

    // ---- top bar ----
    let title = 'ARENA 1v1';
    let timer = '';
    let sub: string;
    if (v.phase === 'warmup') {
      const players = v.ladder.length;
      sub =
        v.startAt > 0
          ? `Warmup · first duels in ${Math.max(0, Math.ceil(secs(v.startAt)))} s · ${players} players`
          : `Warmup · waiting for players (${players}/2)`;
    } else if (v.phase === 'matchEnd') {
      sub = 'Arena over';
    } else {
      title = duel
        ? `PIT ${duel.pit + 1}/${v.pits} · vs ${opp !== null ? this.name(c, opp) : '—'}`
        : sitting
          ? 'SITTING OUT'
          : 'WAITING';
      timer =
        v.phase === 'duel' && duel && duel.winner === null
          ? fmt(secs(v.duelEnds))
          : v.phase === 'break'
            ? fmt(secs(v.phaseEnds))
            : '';
      sub = [record, `Round ${v.round}`, clock].filter(Boolean).join(' · ');
    }
    this.title.textContent = title;
    this.timer.textContent = timer;
    this.timer.style.color =
      v.phase === 'duel' && duel?.winner === null && secs(v.duelEnds) <= 10 ? LOSS : '';
    this.sub.textContent = sub;

    // ---- banners: next duel (break), duel won / lost ----
    if (v.phase === 'break') {
      const n = Math.max(1, Math.ceil(secs(v.phaseEnds)));
      if (duel && opp !== null) {
        this.showBanner(
          `Next: vs ${this.name(c, opp)} in ${n}…`,
          `Pit ${duel.pit + 1} · ${record || 'first duel'}`,
          0.3,
          TEAM_COLOR[side ?? 0],
        );
        // you were moved to your pit: look down it at your opponent
        if (this.facedRound !== v.round && local) {
          this.facedRound = v.round;
          c.fps.reset(yawToView(side === 0 ? -90 : 90), v3(0, 1, 0));
        }
      } else if (sitting) this.showBanner('You sit this round out', `Next round in ${n}…`, 0.3);
      if (n !== this.lastCount && n <= 3) c.deps.audio.play('revealPulse', { volume: 0.4 });
      this.lastCount = n;
    } else this.lastCount = -1;
    if (duel && duel.winner !== null) {
      const key = `${v.round}:${duel.pit}`;
      if (!this.announced.has(key)) {
        this.announced.add(key);
        const won = duel.winner === me;
        this.showBanner(
          won ? 'DUEL WON' : 'DUEL LOST',
          duel.reason ? REASON[duel.reason] : '',
          2.5,
          won ? WIN : LOSS,
        );
        c.deps.audio.play(won ? 'roundWin' : 'roundLose');
      }
    }
    const bannerOn = this.time < this.bannerUntil;
    this.banner.style.opacity = bannerOn ? '1' : '0';
    this.bannerSub.style.opacity = bannerOn ? '1' : '0';

    // ---- while waiting: watch a fight ----
    if (local && !local.alive && (v.phase === 'duel' || v.phase === 'break')) {
      const pit = watchPitOf(v, me, false);
      const fighters: number[] = v.duels.find((d) => d.pit === pit)?.ids ?? [];
      const alive = s.others().filter((p) => p.alive && fighters.includes(p.id));
      if (alive.length && !alive.some((p) => p.id === c.spectating)) c.spectating = alive[0].id;
    }
    const combat = this.opts.combat;
    if (combat?.hud && local && !local.alive && !c.panelOpen && v.phase !== 'warmup') {
      const watching = v.phase === 'duel' ? ` · watching pit ${watchPitOf(v, me, false) + 1}` : '';
      combat.hud.setDeath(
        v.phase === 'matchEnd'
          ? null
          : sitting
            ? `SITTING OUT THIS ROUND${watching}`
            : duel?.winner === me
              ? `DUEL WON · waiting for the other pits${watching}`
              : duel && duel.winner !== null
                ? `DUEL LOST · next round soon${watching}`
                : `WAITING FOR THE NEXT ROUND${watching}`,
      );
    }

    // ---- standings (Tab) and the results ----
    const showBoard = this.boardHeld && v.phase !== 'matchEnd' && v.table.length > 0;
    this.board.style.display = showBoard ? '' : 'none';
    this.results.style.display = v.phase === 'matchEnd' ? '' : 'none';
    if (showBoard || v.phase === 'matchEnd') c.panelOpen = true;
    if (this.time - this.lastBoard > 0.25) {
      this.lastBoard = this.time;
      if (showBoard) this.board.replaceChildren(this.standings(c, v));
      if (v.phase === 'matchEnd') this.results.replaceChildren(this.resultsView(c, v, tick));
    }
  }

  /** The standings table: wins, losses, kills, deaths, damage; current pit. */
  standings(c: GameClient, v: ArenaView): HTMLElement {
    const me = c.session.localId;
    const pings = c.session.pings?.() ?? {};
    const rows = v.table.map((r, i) => {
      const d = v.duels.find((x) => x.ids.includes(r.id));
      const where = r.left
        ? 'left'
        : v.sitting.includes(r.id)
          ? 'sits out'
          : d
            ? `pit ${d.pit + 1}${d.winner === null ? '' : d.winner === r.id ? ' ✓' : ' ✗'}`
            : '—';
      return h(
        'tr',
        { class: r.id === me ? 'me' : '' },
        h('td', {}, String(i + 1)),
        h('td', {}, this.name(c, r.id)),
        h('td', { style: `color:${WIN}` }, String(r.wins)),
        h('td', { style: `color:${LOSS}` }, String(r.losses)),
        h('td', {}, String(r.kills)),
        h('td', {}, String(r.deaths)),
        h('td', {}, String(r.damage)),
        h('td', {}, where),
        h('td', {}, pings[r.id] ? `${pings[r.id]} ms` : '—'),
      );
    });
    return h(
      'div',
      { class: 'sb' },
      h('div', { class: 'sb-title' }, `ARENA 1v1 · round ${v.round}`),
      h(
        'table',
        {},
        h(
          'tr',
          {},
          ...['#', 'Player', 'W', 'L', 'K', 'D', 'Dmg', 'Now', 'Ping'].map((x) => h('th', {}, x)),
        ),
        ...rows,
      ),
    );
  }

  private resultsView(c: GameClient, v: ArenaView, tick: number): HTMLElement {
    const me = c.session.localId;
    const place = v.table.findIndex((r) => r.id === me) + 1;
    const won = v.winner === me;
    const left = Math.max(0, Math.ceil((v.phaseEnds - tick) * TICK_DT));
    return h(
      'div',
      { class: 'mr' },
      h(
        'div',
        { class: 'mr-title', style: `color:${won ? WIN : '#fff'}` },
        won
          ? 'YOU WIN THE ARENA'
          : place > 0
            ? `PLACE ${place} OF ${v.table.length}`
            : 'ARENA OVER',
      ),
      h(
        'div',
        { class: 'mr-reason' },
        v.winner !== null && !won ? `${this.name(c, v.winner)} wins the arena` : v.endReason,
      ),
      this.standings(c, v),
      h('div', { class: 'mr-next' }, `Next arena warmup in ${left} s · Esc for menu`),
    );
  }

  dispose(): void {
    this.unsub?.();
    this.root.remove();
  }
}
