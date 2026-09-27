// Practice vs bots, in steps: 1 mode → 2 map → 3 team size + bot difficulty, with a summary bar
// and Start. Back (button, Esc, or a breadcrumb) goes one step back; the step logic is ui/flow.ts.
import { BOT_SKILL_LABELS, getMap, type MapInfo } from '@space-yz/shared';
import { h } from './menus';
import { icon, botBadge } from './icons';
import {
  ARENA_KITS,
  PRACTICE_STEP_LABELS,
  botSkillChoices,
  hasKitChoice,
  isFreeRoam,
  mapsForMode,
  raceMapGroups,
  modeChoice,
  pickPracticeMap,
  pickPracticeMode,
  practiceBack,
  practiceMapId,
  practiceModes,
  practiceSteps,
  sizesFor,
  type PracticeState,
  type PracticeStep,
} from './flow';
import {
  card,
  crumbs,
  iconButton,
  mapCard,
  mapMini,
  pickGrid,
  screenHead,
  stepPanel,
  sumItem,
  swapStage,
  type Dir,
} from './menu-kit';

export interface PracticeMenuHandlers {
  /** the choices (kept between visits: the menu reopens with your last setup) */
  state: PracticeState;
  start(s: PracticeState): void;
  back(): void;
}

const sizeDesc = (n: number): string =>
  n === 1 ? 'You vs 1 bot' : `You + ${n - 1} bot${n > 2 ? 's' : ''} vs ${n} bots`;
/** Arena: the size is how many players in all (every duel is 1v1). */
const arenaSizeDesc = (n: number): string =>
  `You + ${n - 1} bot${n > 2 ? 's' : ''}, ${n / 2} duel${n > 2 ? 's' : ''} at a time`;
const sizeTitle = (arena: boolean, n: number): string => (arena ? `${n} players` : `${n}v${n}`);
/** Races: how many racers in all (1 = a time trial). */
const raceSizeTitle = (n: number): string => (n === 1 ? 'Time trial' : `${n} racers`);
const raceSizeDesc = (n: number): string =>
  n === 1
    ? 'Just you and the ghost of your best run.'
    : `You + ${n - 1} bot racer${n > 2 ? 's' : ''}.`;
/** The size card's title and description for a mode. */
const sizeText = (mode: string, n: number): { title: string; desc: string } =>
  mode === 'race'
    ? { title: raceSizeTitle(n), desc: raceSizeDesc(n) }
    : mode === 'brawl-ffa'
      ? { title: `${n} players`, desc: `You + ${n - 1} bots, everyone for themselves` }
      : {
          title: sizeTitle(mode === 'arena', n),
          desc: mode === 'arena' ? arenaSizeDesc(n) : sizeDesc(n),
        };

export const practiceMenu = (hd: PracticeMenuHandlers): HTMLElement => {
  let s: PracticeState = { ...hd.state, step: 'mode' };
  const save = () => Object.assign(hd.state, s);
  const crumbBox = h('div', { class: 'crumb-box' });
  const stage = h('div', { class: 'stage' });
  const summary = h('div', { class: 'summary-bar' });

  const go = (next: PracticeState, dir: Dir) => {
    s = next;
    save();
    render(dir);
  };
  const back = () => {
    const prev = practiceBack(s);
    if (prev) go(prev, 'back');
    else hd.back();
  };

  const modeStep = () =>
    stepPanel(
      'Pick a mode',
      pickGrid(
        'modes',
        practiceModes(),
        (m) => m.id === s.mode,
        (m, selected, pick) =>
          card({
            title: m.name,
            desc: m.desc,
            art: icon(m.icon),
            selected,
            cls: `mode mode-${m.id}`,
            onClick: pick,
          }),
        (m) => go(pickPracticeMode(s, m.id), 'forward'),
      ),
    );

  const mapStep = () => {
    const grid = (maps: MapInfo[], cls = 'maps') =>
      pickGrid(
        cls,
        maps,
        (m) => m.id === s.map,
        (m, selected, pick) => mapCard(m.id, selected, pick),
        (m) => go(pickPracticeMap(s, m.id), 'forward'),
      );
    // races: the race tracks, then the surf maps
    if (s.mode === 'race') {
      const { best, other } = raceMapGroups();
      return stepPanel(
        'Pick a track',
        grid(best),
        other.length ? h('h3', { class: 'step-title' }, 'Surf maps') : null,
        other.length ? grid(other) : null,
      );
    }
    return stepPanel('Pick a map', grid(mapsForMode(s.mode)));
  };

  const kitGrid = () =>
    pickGrid(
      'compact kits',
      ARENA_KITS,
      (k) => k.id === (s.kit ?? 'lethal'),
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
        s = { ...s, kit: k.id };
        save();
        renderSummary();
      },
    );

  /** Free roam: the kit and whether target dummies stand on the map. */
  const freeRoamStep = () => {
    const race = !!getMap(practiceMapId(s)).race;
    const dummiesCard = card({
      title: race ? 'No dummies on race tracks' : 'Target dummies',
      desc: race
        ? 'Race tracks are for movement: practise the route.'
        : 'Static, strafing and jumping dummies placed around the map. They never shoot back.',
      art: icon('range'),
      selected: !race && s.dummies !== false,
      cls: 'toggle dummies-toggle',
      onClick: () => {
        if (race) return;
        s = { ...s, dummies: s.dummies === false };
        save();
        dummiesCard.classList.toggle('selected', s.dummies !== false);
        dummiesCard.setAttribute('aria-pressed', String(s.dummies !== false));
        renderSummary();
      },
    });
    return stepPanel(
      'Kit',
      kitGrid(),
      h('h3', { class: 'step-title' }, 'Dummies'),
      h('div', { class: 'card-grid toggles' }, dummiesCard),
    );
  };

  const setupStep = () =>
    isFreeRoam(s.mode)
      ? freeRoamStep()
      : stepPanel(
          s.mode === 'arena' || s.mode === 'brawl-ffa'
            ? 'Players'
            : s.mode === 'race'
              ? 'Racers'
              : 'Team size',
          pickGrid(
            'compact sizes',
            sizesFor(s.mode),
            (n) => n === s.size,
            (n, selected, pick) =>
              card({
                ...sizeText(s.mode, n),
                art: icon(n === 1 ? 'profile' : 'team'),
                selected,
                cls: 'size',
                onClick: pick,
              }),
            (n) => {
              s = { ...s, size: n };
              save();
              renderSummary();
            },
          ),
          hasKitChoice(s.mode) ? h('h3', { class: 'step-title' }, 'Kit') : null,
          hasKitChoice(s.mode) ? kitGrid() : null,
          h('h3', { class: 'step-title' }, 'Bot difficulty'),
          pickGrid(
            'bots',
            botSkillChoices(),
            (b) => b.id === s.skill,
            (b, selected, pick) =>
              card({
                title: b.name,
                desc: b.desc,
                art: botBadge(b.id),
                selected,
                cls: `bot bot-${b.id}`,
                onClick: pick,
              }),
            (b) => {
              s = { ...s, skill: b.id };
              save();
              renderSummary();
            },
          ),
        );

  const renderSummary = () => {
    const m = modeChoice(s.mode);
    const last = s.step === 'setup';
    const showMap = s.mode !== 'arena' || mapsForMode('arena').length > 0;
    summary.replaceChildren(
      sumItem(icon(m.icon), m.name),
      ...(showMap
        ? [sumItem(mapMini(practiceMapId(s)), getMap(practiceMapId(s)).name, 'sum-map')]
        : []),
      ...(isFreeRoam(s.mode)
        ? []
        : [sumItem(icon(s.size === 1 ? 'profile' : 'team'), sizeText(s.mode, s.size).title)]),
      ...(hasKitChoice(s.mode)
        ? [
            sumItem(
              icon(s.kit === 'cs' ? 'cs' : 'arena'),
              ARENA_KITS.find((k) => k.id === (s.kit ?? 'lethal'))!.name,
            ),
          ]
        : []),
      isFreeRoam(s.mode)
        ? sumItem(
            icon('range'),
            s.dummies !== false && !getMap(practiceMapId(s)).race ? 'Dummies on' : 'No dummies',
          )
        : sumItem(botBadge(s.skill), `${BOT_SKILL_LABELS[s.skill]} bots`),
      h('span', { class: 'spacer' }),
      last
        ? iconButton('play', 'Start', () => hd.start({ ...s }), 'btn primary start-btn')
        : iconButton(
            'next',
            'Next',
            () =>
              go(
                s.step === 'mode' ? pickPracticeMode(s, s.mode) : pickPracticeMap(s, s.map),
                'forward',
              ),
            'btn next-btn',
          ),
    );
  };

  const render = (dir: Dir) => {
    const steps = practiceSteps(s.mode);
    const at = steps.indexOf(s.step);
    crumbBox.replaceChildren(
      crumbs(
        steps.map((st: PracticeStep, i) => ({
          label: PRACTICE_STEP_LABELS[st],
          state: i < at ? 'done' : i === at ? 'current' : 'todo',
          onClick: () => go({ ...s, step: st }, 'back'),
        })),
      ),
    );
    swapStage(
      stage,
      s.step === 'mode' ? modeStep() : s.step === 'map' ? mapStep() : setupStep(),
      dir,
    );
    renderSummary();
  };
  render('none');

  return h(
    'div',
    { class: 'screen interactive flow-screen practice-flow' },
    screenHead('practice', 'Practice vs bots', back),
    crumbBox,
    stage,
    summary,
  );
};
