// Ranked UI: the matchmaking screen (Premier, Premier CS, Duels and Race cards with multi-search
// tick boxes and live numbers, the casual queue, your party, the mode vote and map veto) and
// leaderboards (ladders and race track times; a name opens that player's profile, see
// ui/profile-screen.ts). Names are always rendered as text. The ladders come from
// shared rating/ladders.ts (ui/flow.ts cards).
import type {
  CasualModeId,
  LadderId,
  NetCore,
  QueueCounts,
  RankedInfo,
  RankedQueueId,
  TeamMode,
  VetoView,
} from '@space-yz/shared';
import {
  CASUAL_MODES,
  CASUAL_SIZES,
  casualMode,
  formatRaceTime,
  LADDER_IDS,
  LADDERS,
  mapDef,
  queueMaxParty,
  queueTeamSizes,
  RANKED_QUEUE_IDS,
  rankedQueue,
} from '@space-yz/shared';
import { h, button } from './menus';
import { icon } from './icons';
import {
  countdown,
  mapName,
  raceMapSections,
  rankedCards,
  rankedQueueName,
  standingText,
  type LadderStandingView,
} from './flow';
import { card, iconButton, mapCard, modeChip, screenHead } from './menu-kit';
import { avatarEl } from './avatars';
import { nameLink } from './profile-screen';

interface Rank {
  label: string;
  color: string;
  top?: boolean;
}
interface Standing extends LadderStandingView {
  ladder: LadderId;
  name: string;
  games: number;
  wins: number;
  position: number | null;
}
export interface ClientProfile {
  id: number;
  name: string;
  season: number;
  ladders: Partial<Record<LadderId, Standing>>;
  pastSeasons?: { season: number; ladder?: LadderId; rating: number | null; rank: Rank | null }[];
  /** your best time per race track (null: none yet) and your place on its board */
  raceBests?: { track: string; timeMs: number | null; position: number | null }[];
  recentRaces?: {
    track: string;
    ranked: boolean;
    place: number;
    racers: number;
    timeMs: number | null;
    delta: number;
    at: number;
  }[];
  recent: {
    mode: string;
    ladder: LadderId | null;
    ranked: boolean;
    won: boolean | null;
    /** arena: final place */
    place?: number | null;
    delta: number;
    kills: number;
    deaths: number;
    at: number;
  }[];
  bannedUntil?: number | null;
}

const rankBadge = (r: Rank | null | undefined, fallback = 'Placement'): HTMLElement =>
  h(
    'span',
    { class: `tier${r?.top ? ' galaxy' : ''}`, style: `color:${r?.color ?? '#9aa6b8'}` },
    r?.label ?? fallback,
  );

const fmtWait = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Seconds still left of a server count that arrived `at` (ms, core clock). */
const left = (sec: number | null, at: number): number | null =>
  sec === null ? null : sec - (performance.now() - at) / 1000;

export interface RankedScreenHandlers {
  /** called before queueing (sends a changed nickname first) */
  beforeQueue(): void;
  back(): void;
  status(): { text: string; ok: boolean | null };
  /** open the friends screen (to invite friends to your party) */
  friends?(): void;
}

const MODE_NAME: Record<string, string> = { bomb: 'Bomb', elim: 'Elimination', tower: 'Tower' };

/**
 * The map veto (Premier, Premier CS): a card per map, banned ones crossed out, whose turn, the
 * timer. Premier CS votes the mode first: two big cards (Bomb / Elimination) with the votes.
 */
const vetoPanel = (core: NetCore, v: VetoView): { el: HTMLElement; timer: HTMLElement } => {
  const mine = v.turn === v.yourTeam;
  const timer = h('span', { class: 'veto-timer' });
  const ladder = v.ladder ? LADDERS[v.ladder].name : 'Premier';
  const names = (t: 0 | 1) => v.teams[t].join(', ');
  const teams = h(
    'div',
    { class: 'veto-teams' },
    h('span', {}, `Your team: ${names(v.yourTeam)}`),
    h('span', {}, `Enemy: ${names(v.yourTeam === 0 ? 1 : 0)}`),
  );
  if (v.phase === 'vote' && v.vote) {
    const vote = v.vote;
    const grid = h('div', { class: 'card-grid modes vote-grid' });
    for (const o of vote.options) {
      const c = card({
        title: MODE_NAME[o] ?? o,
        desc: `${vote.counts[o] ?? 0} vote${vote.counts[o] === 1 ? '' : 's'}${vote.yours === o ? ' · your vote' : ''}`,
        art: icon(o === 'elim' ? 'elim' : 'bomb'),
        cls: `mode${vote.yours === o ? ' selected' : ''}`,
        onClick: () => core.voteMode(o),
      });
      grid.append(c);
    }
    const el = h(
      'div',
      { class: 'veto' },
      h(
        'div',
        { class: 'veto-head' },
        h('span', { class: 'veto-title' }, `Mode vote · ${ladder} ${v.teamSize}v${v.teamSize}`),
        h('span', { class: 'veto-turn mine' }, 'Everyone votes: Bomb or Elimination?'),
        timer,
      ),
      teams,
      grid,
      h(
        'div',
        { class: 'queue-status' },
        'The mode with the most votes is played (a tie is decided at random). Then the teams ban maps.',
      ),
    );
    return { el, timer };
  }
  const grid = h('div', { class: 'card-grid maps veto-grid' });
  for (const id of v.maps) {
    const ban = v.banned.find((b) => b.map === id);
    const picked = v.picked === id;
    const c = mapCard(id, picked, () => {
      if (!ban && mine && !v.picked) core.vetoBan(id);
    });
    c.classList.add('veto-map');
    if (ban) {
      c.classList.add('banned');
      c.append(
        h(
          'span',
          { class: 'veto-mark' },
          `Banned by ${ban.team === v.yourTeam ? 'your team' : 'enemy'}${ban.auto ? ' (time)' : ''}`,
        ),
      );
    }
    c.disabled = !!ban || !mine || !!v.picked;
    grid.append(c);
  }
  const mode = v.mode ? ` · ${MODE_NAME[v.mode] ?? v.mode}` : '';
  const el = h(
    'div',
    { class: 'veto' },
    h(
      'div',
      { class: 'veto-head' },
      h('span', { class: 'veto-title' }, `Map veto · ${ladder} ${v.teamSize}v${v.teamSize}${mode}`),
      h(
        'span',
        { class: `veto-turn${mine ? ' mine' : ''}` },
        v.picked
          ? `Playing ${mapDef(v.picked).name}`
          : mine
            ? 'Your team bans a map'
            : 'The enemy team is banning',
      ),
      timer,
    ),
    teams,
    grid,
    h(
      'div',
      { class: 'queue-status' },
      'Teams take turns banning; any player can ban for the team. If time runs out, a random map is banned. The last map is played.',
    ),
  );
  return { el, timer };
};

/** The race tracks with your best time on each (the Race card), surf maps grouped by mode. */
const raceTrackList = (p: ClientProfile | null): HTMLElement =>
  h(
    'div',
    { class: 'race-tracks' },
    ...raceMapSections().flatMap((g) => [
      g.label
        ? h('div', { class: 'race-track-row race-track-group' }, modeChip(g.label, g.color))
        : null,
      ...g.maps.map((m) => {
        const b = p?.raceBests?.find((x) => x.track === m.id);
        return h(
          'div',
          { class: 'race-track-row' },
          h('span', {}, m.name),
          h(
            'span',
            { class: 'rank-rating' },
            b?.timeMs
              ? `${formatRaceTime(b.timeMs)}${b.position ? ` · #${b.position}` : ''}`
              : 'no time yet',
          ),
        );
      }),
    ]),
  );

/** Premier's opening hours in words ('' = no hours set). */
const hoursLine = (info: RankedInfo | null, at: number): { text: string; closed: boolean } => {
  if (!info || !info.premier.hours) return { text: '', closed: false };
  const p = info.premier;
  if (!p.open) {
    const s = left(p.opensInSec, at);
    return {
      text: s === null ? `Hours: ${p.hours}` : `Hours: ${p.hours} · next in ${countdown(s)}`,
      closed: true,
    };
  }
  const s = left(p.closesInSec, at);
  return {
    text: `Opening hours now${s === null ? '' : ` · closes in ${countdown(s)}`} · ${p.hours}`,
    closed: false,
  };
};

/**
 * One queue's live line: "7 searching · 3v3 ready", or why it's closed ("Opens at 20 online ·
 * now 12").
 */
export const queueCountText = (
  id: RankedQueueId,
  counts: QueueCounts | null,
  hours = '',
): { text: string; open: boolean } => {
  const c = counts?.ranked[id];
  if (!counts || !c) return { text: '', open: true };
  if (!c.open) {
    const parts = c.threshold > 0 ? [`Opens at ${c.threshold} online · now ${counts.online}`] : [];
    if (hours) parts.push(c.threshold > 0 ? `or ${hours}` : hours);
    return { text: parts.join(' ') || 'Closed right now', open: false };
  }
  const q = rankedQueue(id);
  const sizes = q?.kind === 'team' ? queueTeamSizes(q) : [];
  const size = q?.kind === 'team' && sizes.length > 1 ? c.forms : null;
  const smallest = sizes[sizes.length - 1] ?? 0;
  const extra =
    sizes.length > 1
      ? size
        ? ` · ${size}v${size} ready`
        : ` · ${smallest * 2} needed for ${smallest}v${smallest}`
      : '';
  return { text: `${c.searching} searching${extra}`, open: true };
};

/** Ranked picks kept while the page is open (null: the default, every open queue). */
let rankedPick: Set<RankedQueueId> | null = null;
/** The casual pick kept while the page is open. */
const casualPick: { modes: Set<CasualModeId>; sizes: Set<TeamMode> } = {
  modes: new Set(['tower', 'bomb', 'elim', 'brawl']),
  sizes: new Set(['1v1', '2v2', '3v3', '5v5']),
};

/** The party strip: who is in it, ready ticks, leave / invite. */
const partyStrip = (core: NetCore, hd: RankedScreenHandlers, myId: number | null): HTMLElement => {
  const p = core.party;
  if (!p)
    return h(
      'div',
      { class: 'party-strip empty' },
      h('span', { class: 'muted' }, 'Solo. Play with friends: '),
      button('Invite friends to a party', () => hd.friends?.(), 'btn small secondary'),
    );
  const leader = p.leader === myId;
  const me = p.members.find((m) => m.id === myId);
  return h(
    'div',
    { class: 'party-strip' },
    h('span', { class: 'label' }, `Party ${p.members.length}/${p.max}`),
    ...p.members.map((m) =>
      h(
        'span',
        { class: `party-member${m.leader ? ' leader' : ''}${m.online ? '' : ' offline'}` },
        avatarEl(m.avatar, m.banner, 24),
        h('span', {}, m.name),
        m.leader ? h('span', { class: 'chip' }, 'leader') : null,
        m.ready ? h('span', { class: 'chip ok' }, 'ready') : null,
        leader && !m.leader
          ? button('✕', () => core.partyOp('kick', m.id), 'btn tiny secondary')
          : null,
      ),
    ),
    ...p.invited.map((c) => h('span', { class: 'party-member invited' }, `${c.name} (invited)`)),
    h(
      'span',
      { class: 'party-actions' },
      leader && p.members.length < p.max
        ? button('Invite', () => hd.friends?.(), 'btn small secondary')
        : null,
      !leader && me
        ? button(
            me.ready ? 'Not ready' : 'Ready',
            () => core.partyOp(me.ready ? 'unready' : 'ready'),
            'btn small secondary',
          )
        : null,
      button('Leave party', () => core.partyOp('leave'), 'btn small secondary'),
    ),
  );
};

/**
 * Ranked + casual matchmaking. Ranked: a card per ladder with a tick box per queue — tick
 * several to search them all at once (all open ones are ticked by default); every card shows
 * how many search it and, for Premier, which team size would form now. Casual: tick modes and
 * team sizes, the server forms the match that suits the most people (bots fill after a short
 * wait). A party searches together (its leader picks); the members see it here.
 */
export const rankedScreen = (core: NetCore, hd: RankedScreenHandlers): HTMLElement => {
  const season = h('div', { class: 'rank-global' });
  const party = h('div', { class: 'party-row' });
  const stage = h('div', { class: 'ranked-stage' });
  const status = h('div', { class: 'queue-status' });
  const conn = h('div', { class: 'status' });
  const cancel = iconButton(
    'back',
    'Cancel search',
    () => core.queueRanked(null),
    'btn small secondary cancel-btn',
  );
  core.sendJson({ t: 'profile' }); // fresh ratings, season, Premier hours and queue numbers
  let lastAsk = performance.now();
  let vetoTimer: HTMLElement | null = null;
  const myId = (): number | null => (core.account as ClientProfile | null)?.id ?? null;
  const partySize = (): number => core.party?.members.length ?? 1;
  /** may I start a search? (solo, or my party's leader) */
  const canSearch = (): boolean => !core.party || core.party.leader === myId();
  const hours = (): string => hoursLine(core.rankedInfo, core.rankedInfoAt).text;
  /** open for me: open now, and my party fits it */
  const usable = (id: RankedQueueId): boolean => {
    const q = rankedQueue(id);
    return !!q && queueCountText(id, core.queueCounts).open && queueMaxParty(q) >= partySize();
  };
  const ticked = (id: RankedQueueId): boolean => (rankedPick ? rankedPick.has(id) : true);
  const selection = (): RankedQueueId[] =>
    RANKED_QUEUE_IDS.filter((id) => ticked(id) && usable(id));

  const ladderCards = (): HTMLElement => {
    const p = core.account as ClientProfile | null;
    const q = core.queue;
    const searchingNow = new Set(q.modes ?? (q.mode ? [q.mode] : []));
    const grid = h('div', { class: 'card-grid queues ladders' });
    rankedCards().forEach((c, i) => {
      const st = p?.ladders?.[c.ladder];
      const def = LADDERS[c.ladder];
      const color = st?.rank?.color ?? '#9aa6b8';
      const premierLike = c.ladder === 'premier' || c.ladder === 'premier-cs';
      const rows = c.queues.map((qd) => {
        const line = queueCountText(qd.id, core.queueCounts, premierLike ? hours() : '');
        const rq = rankedQueue(qd.id)!;
        const tooBig = queueMaxParty(rq) < partySize();
        const box = h('input', { type: 'checkbox', 'aria-label': `Search ${qd.label}` });
        box.checked = searchingNow.size ? searchingNow.has(qd.id) : ticked(qd.id) && usable(qd.id);
        box.disabled = !line.open || tooBig || !canSearch() || searchingNow.size > 0;
        box.addEventListener('change', () => {
          rankedPick ??= new Set(RANKED_QUEUE_IDS.filter(usable));
          if (box.checked) rankedPick.add(qd.id);
          else rankedPick.delete(qd.id);
          last = '';
          render();
        });
        return h(
          'label',
          {
            class: `queue-pick${line.open ? '' : ' closed'}${searchingNow.has(qd.id) ? ' searching' : ''}`,
          },
          box,
          h('span', { class: 'queue-pick-name' }, qd.label),
          h(
            'span',
            { class: 'queue-pick-count' },
            tooBig
              ? queueMaxParty(rq) === 1
                ? 'solo only'
                : `parties up to ${queueMaxParty(rq)}`
              : line.text,
          ),
        );
      });
      const card = h(
        'div',
        {
          class: `card queue ladder-card ladder-${c.ladder}${c.queues.some((x) => searchingNow.has(x.id)) ? ' selected searching' : ''}`,
          style: `--i:${i}`,
        },
        h('span', { class: 'card-art' }, icon(c.icon)),
        h(
          'span',
          { class: 'card-body' },
          h('span', { class: 'card-title' }, c.name),
          h('span', { class: 'card-desc' }, c.desc),
        ),
        h(
          'div',
          { class: 'ladder-rank' },
          h(
            'span',
            { class: 'ladder-rating', style: `color:${color}` },
            st?.rating !== null && st?.rating !== undefined ? String(st.rating) : '—',
          ),
          h(
            'span',
            { class: 'ladder-sub' },
            st?.rating === null || !st
              ? standingText(st) || `Placement 0/${def.placement.count} ${def.placement.unit}`
              : st.rank?.label,
            st?.position ? ` · #${st.position}` : '',
          ),
        ),
        def.hideWhilePlacing && st && st.rating === null
          ? h(
              'div',
              { class: 'placement-bar' },
              h('span', {
                style: `width:${(100 * st.placement.done) / Math.max(1, st.placement.need)}%`,
              }),
            )
          : null,
        def.seasonal ? h('div', { class: 'ladder-season' }, `Season ${p?.season ?? 1}`) : null,
        c.ladder === 'race' ? raceTrackList(p) : null,
        h('div', { class: 'ladder-buttons queue-picks' }, ...rows),
      );
      grid.append(card);
    });
    return grid;
  };

  /** Casual: tick modes and sizes, then search. */
  const casualPanel = (): HTMLElement => {
    const q = core.queue;
    const searching = !!q.casual;
    const locked = searching || !canSearch() || !!q.modes?.length;
    const chip = (label: string, on: boolean, count: string, flip: () => void) => {
      const b = button(
        `${label}${count}`,
        () => {
          flip();
          last = '';
          render();
        },
        `btn small ${on ? '' : 'secondary'}`,
      );
      b.disabled = locked;
      b.setAttribute('aria-pressed', String(on));
      return b;
    };
    const flip =
      <T>(set: Set<T>, v: T) =>
      () =>
        set.has(v) ? set.delete(v) : set.add(v);
    const shown = searching ? new Set(q.casual!.modes) : casualPick.modes;
    const shownSizes = searching ? new Set(q.casual!.sizes) : casualPick.sizes;
    const go = button(
      'Search casual',
      () => {
        hd.beforeQueue();
        core.queueCasual({ modes: [...casualPick.modes], sizes: [...casualPick.sizes] });
      },
      'btn',
    );
    go.disabled = locked || !casualPick.modes.size || !casualPick.sizes.size;
    return h(
      'div',
      { class: `panel casual-panel${searching ? ' searching' : ''}` },
      h('div', { class: 'label' }, 'Casual — unranked, bots fill empty slots after 30 s'),
      h(
        'div',
        { class: 'choice-row' },
        ...CASUAL_MODES.map((m) =>
          chip(
            m.name,
            shown.has(m.id),
            core.queueCounts ? ` · ${core.queueCounts.casual[m.id] ?? 0}` : '',
            flip(casualPick.modes, m.id),
          ),
        ),
      ),
      h(
        'div',
        { class: 'choice-row' },
        ...CASUAL_SIZES.map((s) => chip(s, shownSizes.has(s), '', flip(casualPick.sizes, s))),
        go,
      ),
    );
  };

  const searchRow = (): HTMLElement => {
    const sel = selection();
    const b = button(
      sel.length > 1 ? `Search ${sel.length} ranked modes` : 'Search ranked',
      () => {
        hd.beforeQueue();
        core.queueRankedMany(sel);
      },
      'btn primary',
    );
    b.disabled = !sel.length || !canSearch() || !!core.queue.mode || !!core.queue.casual;
    return h(
      'div',
      { class: 'ranked-search' },
      b,
      h(
        'span',
        { class: 'muted' },
        canSearch()
          ? 'Tick several: the first match that forms wins, the other searches stop.'
          : 'Your party leader picks the search.',
      ),
    );
  };

  /** countdowns tick without rebuilding the cards */
  const tickTexts = (): void => {
    const v = core.veto;
    if (v && vetoTimer) {
      const secs = v.phase === 'vote' && v.vote ? v.vote.secondsLeft : v.secondsLeft;
      vetoTimer.textContent = v.picked
        ? ''
        : `${Math.max(0, Math.ceil(secs - (performance.now() - core.vetoAt) / 1000))} s`;
    }
  };

  let last = '';
  const render = () => {
    const p = core.account as ClientProfile | null;
    const q = core.queue;
    const v = core.veto;
    const info = core.rankedInfo;
    const st = hd.status();
    conn.replaceChildren(
      h('span', { class: `dot ${st.ok === null ? '' : st.ok ? 'ok' : 'bad'}` }),
      st.text,
    );
    tickTexts();
    // Premier's hours just opened / closed: ask the server again (at most every 5 s)
    const edge = left(
      info?.premier.open ? info.premier.closesInSec : (info?.premier.opensInSec ?? null),
      core.rankedInfoAt,
    );
    if (edge !== null && edge <= 0 && performance.now() - lastAsk > 5000) {
      lastAsk = performance.now();
      core.sendJson({ t: 'profile' });
    }
    const key = JSON.stringify([
      p?.ladders,
      p?.raceBests,
      p?.season,
      q,
      v && { ...v, secondsLeft: 0, vote: v.vote && { ...v.vote, secondsLeft: 0 } },
      info && { ...info, premier: { ...info.premier, opensInSec: 0, closesInSec: 0 } },
      core.queueCounts,
      core.party,
      rankedPick && [...rankedPick],
      hours(),
    ]);
    if (key === last) return;
    last = key;
    season.replaceChildren(
      h('span', { class: 'rank-mode' }, `Season ${p?.season ?? info?.season ?? 1}`),
      h(
        'span',
        { class: 'rank-rating' },
        `${core.queueCounts ? `${core.queueCounts.online} players online · ` : ''}Premier and Premier CS reset softly each season.`,
      ),
    );
    party.replaceChildren(partyStrip(core, hd, myId()));
    vetoTimer = null;
    if (v) {
      const panel = vetoPanel(core, v);
      vetoTimer = panel.timer;
      stage.replaceChildren(panel.el);
    } else stage.replaceChildren(ladderCards(), searchRow(), casualPanel());
    const names = (q.modes ?? (q.mode ? [q.mode] : [])).map(rankedQueueName);
    if (v) {
      status.textContent = 'Leaving now cancels the match for everyone.';
      status.className = 'queue-status';
      cancel.hidden = false;
    } else if (names.length || q.casual) {
      const what = names.length
        ? names.join(' + ')
        : `casual ${q.casual!.modes.map((m) => casualMode(m)?.name ?? m).join(' / ')}`;
      status.textContent = `${q.party ? 'Your party is searching' : 'Searching'} ${what} · ${fmtWait(q.waitSec)}`;
      status.className = 'queue-status active';
      cancel.hidden = false;
    } else {
      status.textContent =
        q.error ??
        'Matched by rating; a party plays on one team. Leaving a ranked match counts as a loss.';
      status.className = `queue-status${q.error ? ' error' : ''}`;
      cancel.hidden = true;
    }
    tickTexts();
  };
  render();
  const timer = window.setInterval(() => {
    if (!status.isConnected) window.clearInterval(timer);
    else render();
  }, 300);
  return h(
    'div',
    { class: 'screen interactive flow-screen ranked-flow' },
    screenHead('ranked', 'Find a match', hd.back),
    season,
    party,
    stage,
    h('div', { class: 'queue-row' }, status, cancel),
    conn,
  );
};

/** Leaderboards: Premier (this season or a past one) and Duels, from the server's JSON API. */
export const leaderboardScreen = (
  back: () => void,
  myId: number | null,
  openProfile?: (id: number) => void,
): HTMLElement => {
  let which: LadderId = 'premier';
  let season: number | null = null;
  /** Race: a track's fastest times instead of the rating board */
  let track: string | null = null;
  let current = 1;
  const tabs = h('div', { class: 'choice-row' });
  const table = h('div', { class: 'leaderboard' }, 'Loading…');
  const load = async () => {
    const seasonButtons: HTMLElement[] = [];
    if (LADDERS[which].seasonal && current > 1)
      for (let s = current; s >= 1; s--) {
        const n = s;
        seasonButtons.push(
          button(
            n === current ? `Season ${n} (now)` : `Season ${n}`,
            () => {
              season = n;
              void load();
            },
            `btn small ${(season ?? current) === n ? '' : 'secondary'}`,
          ),
        );
      }
    // (a button per race map: the race tracks, then the surf maps under their mode's word)
    const trackButtons =
      which === 'race'
        ? raceMapSections().flatMap((g) => [
            ...(g.label ? [modeChip(g.label, g.color)] : []),
            ...g.maps.map((m) =>
              button(
                `${m.name} times`,
                () => {
                  track = m.id;
                  void load();
                },
                `btn small ${track === m.id ? '' : 'secondary'}`,
              ),
            ),
          ])
        : [];
    tabs.replaceChildren(
      ...LADDER_IDS.map((m) =>
        button(
          LADDERS[m].name,
          () => {
            which = m;
            season = null;
            track = null;
            void load();
          },
          `btn small ${which === m && !track ? '' : 'secondary'}`,
        ),
      ),
      ...(track ? [] : seasonButtons),
      ...trackButtons,
    );
    table.textContent = 'Loading…';
    if (track) {
      await loadTrack(track);
      return;
    }
    try {
      const res = await fetch(
        `/api/leaderboard?mode=${which}&limit=100${season ? `&season=${season}` : ''}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        currentSeason: number;
        rows: {
          position: number;
          playerId: number;
          name: string;
          rating: number;
          games: number;
          rank: Rank;
        }[];
      };
      if (data.currentSeason !== current) {
        current = data.currentSeason;
        void load(); // show the season buttons
        return;
      }
      if (!data.rows.length) {
        table.textContent =
          which === 'premier' || which === 'premier-cs'
            ? `No one has placed yet — win 5 ${LADDERS[which].name} matches to appear here.`
            : which === 'race'
              ? 'No one has placed yet — finish 5 ranked races to appear here.'
              : 'No ranked players yet — play 5 Duels to appear here.';
        return;
      }
      table.replaceChildren(
        h(
          'table',
          {},
          h('tr', {}, ...['#', 'Player', 'Rating', 'Rank', 'Games'].map((x) => h('th', {}, x))),
          ...data.rows.map((r) =>
            h(
              'tr',
              { class: r.playerId === myId ? 'me' : '' },
              h('td', {}, String(r.position)),
              h('td', {}, nameLink(r.name, r.playerId, openProfile)),
              h('td', { style: `color:${r.rank.color};font-weight:800` }, String(r.rating)),
              h('td', {}, rankBadge(r.rank)),
              h('td', {}, String(r.games)),
            ),
          ),
        ),
      );
    } catch {
      table.textContent = 'Leaderboards need the game server (not available offline).';
    }
  };
  /** A race track's fastest times: one per player. */
  const loadTrack = async (id: string) => {
    try {
      const res = await fetch(`/api/race-times?track=${encodeURIComponent(id)}&limit=100`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        rows: { position: number; playerId: number; name: string; timeMs: number; at: number }[];
      };
      if (track !== id) return; // another tab was picked meanwhile
      if (!data.rows.length) {
        table.textContent = `No times on ${mapName(id)} yet — finish a race there online.`;
        return;
      }
      table.replaceChildren(
        h(
          'table',
          {},
          h('tr', {}, ...['#', 'Player', 'Time', 'Set'].map((x) => h('th', {}, x))),
          ...data.rows.map((r) =>
            h(
              'tr',
              { class: r.playerId === myId ? 'me' : '' },
              h('td', {}, String(r.position)),
              h('td', {}, nameLink(r.name, r.playerId, openProfile)),
              h('td', { style: 'font-weight:800' }, formatRaceTime(r.timeMs)),
              h('td', {}, new Date(r.at).toLocaleDateString()),
            ),
          ),
        ),
      );
    } catch {
      table.textContent = 'Leaderboards need the game server (not available offline).';
    }
  };
  void load();
  return h(
    'div',
    { class: 'screen interactive flow-screen' },
    screenHead('leaderboard', 'Leaderboards', back),
    h('div', { class: 'panel wide-panel' }, tabs, table),
  );
};
