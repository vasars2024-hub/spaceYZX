// Practice vs bots, in steps: 1 mode → 2 map → 3 team size + bot difficulty, with a summary bar
// and Start. Back (button, Esc, or a breadcrumb) goes one step back; the step logic is ui/flow.ts.
import { BOT_SKILL_LABELS, getMap } from '@space-yz/shared';
import { h } from './menus';
import { icon, botBadge } from './icons';
import {
  ARENA_KITS,
  PRACTICE_STEP_LABELS,
  botSkillChoices,
  mapsForMode,
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

  const mapStep = () =>
    stepPanel(
      'Pick a map',
      pickGrid(
        'maps',
        mapsForMode(s.mode),
        (m) => m.id === s.map,
        (m, selected, pick) => mapCard(m.id, selected, pick),
        (m) => go(pickPracticeMap(s, m.id), 'forward'),
      ),
    );

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

  const setupStep = () =>
    stepPanel(
      s.mode === 'arena' ? 'Players' : 'Team size',
      pickGrid(
        'compact sizes',
        sizesFor(s.mode),
        (n) => n === s.size,
        (n, selected, pick) =>
          card({
            title: sizeTitle(s.mode === 'arena', n),
            desc: s.mode === 'arena' ? arenaSizeDesc(n) : sizeDesc(n),
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
      s.mode === 'arena' ? h('h3', { class: 'step-title' }, 'Kit') : null,
      s.mode === 'arena' ? kitGrid() : null,
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
      sumItem(icon(s.size === 1 ? 'profile' : 'team'), sizeTitle(s.mode === 'arena', s.size)),
      ...(s.mode === 'arena'
        ? [
            sumItem(
              icon(s.kit === 'cs' ? 'cs' : 'arena'),
              ARENA_KITS.find((k) => k.id === (s.kit ?? 'lethal'))!.name,
            ),
          ]
        : []),
      sumItem(botBadge(s.skill), `${BOT_SKILL_LABELS[s.skill]} bots`),
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
