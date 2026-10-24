import type { Attempt } from '@pending/contract';
import { expect, test } from 'vitest';
import { lastStep } from '../../board';
import { appError } from './errors';
import { progress } from './progress';
import { reduce } from './session';
import type { Session } from './session';
import { form, header, lost, pressed } from './testBuild';

const marks = (p: ReturnType<typeof progress>) => p.steps.map((s) => s.mark);
const running = (attempts: Attempt[], step: number): Session => ({
  status: 'running',
  requestId: 'r',
  form,
  attempts,
  lines: [],
  step,
  speed: 1,
  paused: false,
});

test('idle and drafting: nothing tested, then the first step and the first trial current', () => {
  const idle = progress({ status: 'idle' }, false);
  expect([idle.attempt, idle.stamp, idle.result]).toEqual([0, 'PENDING', 'Nothing has been tested yet.']);
  expect(marks(idle)).toEqual(Array(6).fill('pending'));
  const drafting = progress(
    reduce({ status: 'idle' }, { type: 'FILE', requestId: 'r', form, startedAt: 0 }),
    false,
  );
  expect(marks(drafting)).toEqual(['current', 'pending', 'pending', 'pending', 'pending', 'pending']);
  expect(drafting.trials).toEqual(['current', 'pending', 'pending', 'pending', 'pending', 'pending']);
});

test('a first trial runs, fails at its terminal step, is repaired and tested again, each from the attempts alone', () => {
  const first = lost(1);
  const playing = progress(running([first], 1), false);
  expect(marks(playing)).toEqual(['done', 'current', 'pending', 'pending', 'pending', 'pending']);
  expect(playing.result).toBe('The simulator is testing trial 1.');

  const failed = progress(running([first], lastStep(first.events)), false);
  expect(failed.steps[2]).toEqual({ label: 'Result: failed', mark: 'current' });
  expect(failed.trials.slice(0, 2)).toEqual(['failed', 'pending']);
  expect(failed.result).toBe('The button was not pressed. Gemma will try a repair.');

  const repairing = progress(
    { status: 'repairing', requestId: 'r', form, attempts: [first], lines: [], speed: 1 },
    false,
  );
  expect(marks(repairing)).toEqual(['done', 'done', 'done', 'current', 'pending', 'pending']);
  expect([repairing.attempt, repairing.trials[1]]).toEqual([2, 'current']);

  const again = progress(running([first, pressed(2)], lastStep(first.events) + 2), false);
  expect(marks(again)).toEqual(['done', 'done', 'done', 'done', 'current', 'pending']);
  expect(again.trials.slice(0, 3)).toEqual(['failed', 'current', 'pending']);

  // A later trial at its terminal step keeps the repair and the retest done while its result is current.
  const second = lost(2);
  const later = progress(
    running([first, second], lastStep(first.events) + 1 + lastStep(second.events)),
    false,
  );
  expect(later.steps[2]).toEqual({ label: 'Result: failed', mark: 'current' });
  expect(marks(later)).toEqual(['done', 'done', 'current', 'done', 'done', 'pending']);
});

test('the ending stamps PRESSED only at the reveal, and a first-trial press never needed a repair', () => {
  const attempts = [pressed(1)];
  const ended: Session = {
    status: 'pressed',
    requestId: 'r',
    build: { ...header(attempts), attempts, lines: [] },
  };
  const before = progress(ended, false);
  expect([before.stamp, before.result]).toEqual(['PENDING', 'The button was pressed.']);
  const after = progress(ended, true);
  expect([after.stamp, after.result]).toEqual(['PRESSED', header(attempts).report.verdict]);
  expect(marks(after)).toEqual(['done', 'done', 'done', 'skipped', 'skipped', 'done']);
  expect(after.trials[0]).toBe('done');
});

test('an exhausted build keeps the PENDING stamp with the verdict; an error marks where the build stopped', () => {
  const attempts = [lost(1), lost(2)];
  const exhausted = progress(
    { status: 'exhausted', requestId: 'r', build: { ...header(attempts), attempts, lines: [] } },
    true,
  );
  expect([exhausted.stamp, exhausted.result]).toEqual(['PENDING', header(attempts).report.verdict]);
  expect(exhausted.trials.slice(0, 3)).toEqual(['failed', 'failed', 'pending']);
  const error = progress(
    { status: 'error', requestId: 'r', form, attempts: [], error: appError('TIMEOUT', 'r') },
    false,
  );
  expect(marks(error)).toEqual(['failed', 'pending', 'pending', 'pending', 'pending', 'pending']);
});
