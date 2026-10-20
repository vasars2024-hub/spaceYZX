// Training → Free roam on any map: pick any map in rotation (competitive maps, the other maps,
// race tracks, surf maps), a kit and whether target dummies stand around, then Start. It runs the
// same free roam as Practice → Free roam (game/free-roam.ts). The map list is ui/flow.ts
// trainingMapGroups.
import { getMap } from '@space-yz/shared';
import { h } from './menus';
import { icon } from './icons';
import { ARENA_KITS, trainingMapGroups, type ArenaKit, type TrainingMapGroup } from './flow';
import {
  card,
  cardGrid,
  iconButton,
  mapCard,
  mapMini,
  pickGrid,
  screenHead,
  stepPanel,
  sumItem,
  surfGroupTitle,
} from './menu-kit';

export interface TrainingMapState {
  map: string;
  kit: ArenaKit;
  dummies: boolean;
}

export interface TrainingMapHandlers {
  /** the choices (kept between visits) */
  state: TrainingMapState;
  start(s: TrainingMapState): void;
  back(): void;
  /** default: every map in rotation */
  groups?: TrainingMapGroup[];
}

/** The map to start with: the last one picked if it is still offered, else the first one. */
export const trainingStartMap = (groups: TrainingMapGroup[], last: string): string => {
  const ids = groups.flatMap((g) => g.maps.map((m) => m.id));
  return ids.includes(last) ? last : (ids[0] ?? last);
};

export const trainingMapMenu = (hd: TrainingMapHandlers): HTMLElement => {
  const groups = hd.groups ?? trainingMapGroups();
  const s: TrainingMapState = { ...hd.state, map: trainingStartMap(groups, hd.state.map) };
  const save = () => Object.assign(hd.state, s);
  save();
  const summary = h('div', { class: 'summary-bar' });
  const isRace = () => !!getMap(s.map).race;

  // one highlight across every group's grid
  const mapCards: { id: string; el: HTMLButtonElement }[] = [];
  const pickMap = (id: string) => {
    s.map = id;
    save();
    for (const c of mapCards) {
      c.el.classList.toggle('selected', c.id === id);
      c.el.setAttribute('aria-pressed', String(c.id === id));
    }
    paintDummies();
    renderSummary();
  };
  const grids = groups.flatMap((g) => {
    const cards = g.maps.map((m) => {
      const el = mapCard(m.id, m.id === s.map, () => pickMap(m.id));
      mapCards.push({ id: m.id, el });
      return el;
    });
    return [
      g.surf ? surfGroupTitle(g.surf) : h('h3', { class: 'step-title' }, g.title),
      cardGrid('maps', cards),
    ];
  });

  const kits = pickGrid(
    'compact kits',
    ARENA_KITS,
    (k) => k.id === s.kit,
    (k, selected, pick) =>
      card({
        title: k.name,
        desc: k.desc,
        art: icon(k.icon),
        selected,
        cls: `mode mode-${k.id}`,
        onClick: pick,
      }),
    (k) => {
      s.kit = k.id;
      save();
      renderSummary();
    },
  );

  const dummiesCard = card({
    title: 'Target dummies',
    desc: 'Static, strafing and jumping dummies placed around the map. They never shoot back.',
    art: icon('range'),
    selected: s.dummies && !isRace(),
    cls: 'toggle dummies-toggle',
    onClick: () => {
      if (isRace()) return;
      s.dummies = !s.dummies;
      save();
      paintDummies();
      renderSummary();
    },
  });
  const paintDummies = () => {
    const on = s.dummies && !isRace();
    dummiesCard.classList.toggle('selected', on);
    dummiesCard.setAttribute('aria-pressed', String(on));
    dummiesCard.classList.toggle('disabled', isRace());
  };
  paintDummies();

  const renderSummary = () => {
    summary.replaceChildren(
      sumItem(icon('range'), 'Free roam'),
      sumItem(mapMini(s.map), getMap(s.map).name, 'sum-map'),
      sumItem(
        icon(s.kit === 'cs' ? 'cs' : 'arena'),
        ARENA_KITS.find((k) => k.id === s.kit)?.name ?? '',
      ),
      sumItem(icon('range'), s.dummies && !isRace() ? 'Dummies on' : 'No dummies'),
      h('span', { class: 'spacer' }),
      iconButton('play', 'Start', () => hd.start({ ...s }), 'btn primary start-btn'),
    );
  };
  renderSummary();

  return h(
    'div',
    { class: 'screen interactive flow-screen practice-flow training-maps' },
    screenHead('training', 'Free roam: any map', hd.back),
    h(
      'div',
      { class: 'stage' },
      stepPanel(
        'Pick a map',
        h(
          'div',
          { class: 'label' },
          'Every map in rotation, just you (and target dummies if you like). No rounds, no timer. Race tracks have no dummies.',
        ),
        ...grids,
        h('h3', { class: 'step-title' }, 'Kit'),
        kits,
        h('h3', { class: 'step-title' }, 'Dummies'),
        h('div', { class: 'card-grid toggles' }, dummiesCard),
      ),
    ),
    summary,
  );
};
