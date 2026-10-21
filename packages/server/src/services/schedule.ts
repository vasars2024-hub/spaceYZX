// Premier opening hours: while the player base is small, Premier can be limited to weekly
// windows (local server time) so everyone searches at the same time. Default: always open.
// Stored in the database's settings table (see RankedStore.schedule()).

export interface ScheduleWindow {
  /** days it opens on, 0 = Sunday … 6 = Saturday */
  days: number[];
  /** "HH:MM" local server time */
  start: string;
  /** "HH:MM"; at or before `start` = the next day (e.g. 22:00–02:00) */
  end: string;
}

export interface PremierSchedule {
  mode: 'always' | 'scheduled';
  windows: ScheduleWindow[];
}

export const DEFAULT_WINDOWS: ScheduleWindow[] = [
  { days: [5, 6, 0], start: '18:00', end: '23:00' },
];

export const DEFAULT_SCHEDULE: PremierSchedule = { mode: 'always', windows: DEFAULT_WINDOWS };

export interface ScheduleStatus {
  open: boolean;
  /** closed: ms until it opens (null = never: scheduled without windows) */
  opensInMs: number | null;
  /** open on a schedule: ms until it closes (null = always open) */
  closesInMs: number | null;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const hm = (s: string): [number, number] | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 24 && min < 60 && h * 60 + min <= 24 * 60 ? [h, min] : null;
};

/** Every opening between yesterday and a week from now, as [start, end] ms. */
const intervals = (windows: readonly ScheduleWindow[], now: Date): [number, number][] => {
  const out: [number, number][] = [];
  for (let off = -1; off <= 8; off++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off);
    for (const w of windows) {
      if (!w.days.includes(day.getDay())) continue;
      const a = hm(w.start);
      const b = hm(w.end);
      if (!a || !b) continue;
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), a[0], a[1]);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), b[0], b[1]);
      if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
      out.push([start.getTime(), end.getTime()]);
    }
  }
  return out.sort((x, y) => x[0] - y[0]);
};

export const scheduleStatus = (s: PremierSchedule, now: Date): ScheduleStatus => {
  if (s.mode === 'always') return { open: true, opensInMs: null, closesInMs: null };
  const t = now.getTime();
  const list = intervals(s.windows, now);
  // open now: until the end of this opening (back-to-back openings merge)
  let end = -1;
  for (const [a, b] of list) {
    if (a <= t && t < b) end = Math.max(end, b);
    else if (end >= 0 && a <= end) end = Math.max(end, b);
  }
  if (end >= 0) return { open: true, opensInMs: null, closesInMs: end - t };
  const next = list.find(([a]) => a > t);
  return { open: false, opensInMs: next ? next[0] - t : null, closesInMs: null };
};

/** "Fri–Sun 18:00–23:00" style text for menus and the dashboard ('' = always open). */
export const describeSchedule = (s: PremierSchedule): string =>
  s.mode === 'always' ? '' : s.windows.map(formatWindow).join(', ');

const formatDays = (days: number[]): string => {
  const set = [...new Set(days)].filter((d) => d >= 0 && d <= 6);
  if (set.length === 7) return 'Every day';
  // runs of consecutive days (wrapping over Saturday -> Sunday), starting after a gap
  const has = (d: number) => set.includes(((d % 7) + 7) % 7);
  const startDay = [0, 1, 2, 3, 4, 5, 6].find((d) => has(d) && !has(d - 1)) ?? 0;
  const runs: string[] = [];
  for (let i = 0; i < 7;) {
    const d = (startDay + i) % 7;
    if (!has(d)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < 7 && has(startDay + j + 1)) j++;
    const a = DAY_NAMES[d];
    const b = DAY_NAMES[(startDay + j) % 7];
    runs.push(j === i ? a : j === i + 1 ? `${a}, ${b}` : `${a}–${b}`);
    i = j + 1;
  }
  return runs.join(', ');
};

export const formatWindow = (w: ScheduleWindow): string =>
  `${formatDays(w.days)} ${w.start}–${w.end}`;

const dayIndex = (s: string): number =>
  DAY_NAMES.findIndex((d) => d.toLowerCase() === s.trim().slice(0, 3).toLowerCase());

/**
 * Read opening hours typed by the host, e.g. "Fri-Sun 18:00-23:00; Wed 20:00-22:00" (days:
 * names or ranges, comma separated; windows separated by ';' or new lines). Null if any part
 * can't be read.
 */
export const parseWindows = (text: string): ScheduleWindow[] | null => {
  const out: ScheduleWindow[] = [];
  for (const part of text.split(/[;\n]/)) {
    const p = part.trim().replace(/[–—]/g, '-');
    if (!p) continue;
    const m = /^(.+?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(p);
    if (!m || !hm(m[2]) || !hm(m[3])) return null;
    const days: number[] = [];
    for (const d of m[1].split(',')) {
      const t = d.trim().toLowerCase();
      if (t === 'every day' || t === 'daily') {
        days.push(0, 1, 2, 3, 4, 5, 6);
        continue;
      }
      const [a, b] = t.split('-').map(dayIndex);
      if (a < 0 || (b !== undefined && b < 0)) return null;
      if (b === undefined) days.push(a);
      else
        for (let i = a; ; i = (i + 1) % 7) {
          days.push(i);
          if (i === b) break;
        }
    }
    out.push({ days: [...new Set(days)], start: m[2], end: m[3] });
  }
  return out.length ? out : null;
};
