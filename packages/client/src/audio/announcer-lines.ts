// The announcer's lines: clip id -> what is said. Pure data, shared by the client (which plays
// public/audio/announcer/<id>.<ext>) and tools/audio/announcer.ts (which renders them).
//
// The clips are PLACEHOLDERS rendered offline with the Windows text-to-speech voice
// (Microsoft David) and heavily processed. The licence of that voice for commercial
// redistribution is unclear: replace them with a recorded or licensed voice before a commercial
// launch (same ids, run the tool's encoder on the new recordings or drop the files in).

/** Rounds that have a "Round n" clip (every mode's maxRounds fits; later rounds say "Next round"). */
export const ANNOUNCER_MAX_ROUND = 13;

const NUMBER_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
];

export const ANNOUNCER_LINES: Record<string, string> = {
  'lethal-recoil': 'Lethal Recoil!',
  fight: 'Fight!',
  'next-round': 'Next round!',
  'match-point': 'Match point!',
  'final-round': 'Final round!',
  'sudden-death': 'Sudden death!',
  'switching-sides': 'Switching sides!',
  victory: 'Victory!',
  defeat: 'Defeat.',
  ...Object.fromEntries(
    NUMBER_WORDS.slice(0, ANNOUNCER_MAX_ROUND).map((w, i) => [`round-${i + 1}`, `Round ${w}!`]),
  ),
};

export type AnnouncerLine = keyof typeof ANNOUNCER_LINES & string;

/** File type of the shipped clips (Ogg Opus; the tool can also write .wav). */
export const ANNOUNCER_EXT = 'ogg';

/** The clip for "Round n" (past the last numbered clip: "Next round"). */
export const roundLine = (round: number): string =>
  round >= 1 && round <= ANNOUNCER_MAX_ROUND ? `round-${Math.floor(round)}` : 'next-round';
