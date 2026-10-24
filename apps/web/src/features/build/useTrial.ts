import type { Attempt } from '@pending/contract';
import { useState } from 'react';
import { lastStep } from '../board';

export type Playing = { attempt: Attempt; step: number };

// The trial shown on the board and in the minutes: any trial the playhead has reached may be chosen; the choice
// follows the playhead until another is chosen, and a new `run` (a replay, a new build) follows it again. A trial
// produced by a correction carries the attempt it corrected as `previous`.
export function useTrial(attempts: Attempt[], playing: Playing | undefined, run: string) {
  const [chosen, setChosen] = useState<{ run: string; n: number }>();
  const reached = playing === undefined ? [] : attempts.filter((a) => a.n <= playing.attempt.n);
  const picked = chosen?.run === run ? reached.find((a) => a.n === chosen.n) : undefined;
  const shown = picked ?? playing?.attempt;
  const live = shown !== undefined && shown === playing?.attempt;
  const step = live ? playing.step : shown && lastStep(shown.events);
  const previous = shown?.patch && attempts.find((a) => a.n === shown.n - 1);
  return { reached, shown, live, step, previous, choose: (n: number) => setChosen({ run, n }) };
}

export type Trial = ReturnType<typeof useTrial>;
