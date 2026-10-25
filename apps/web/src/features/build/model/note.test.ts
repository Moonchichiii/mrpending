import type { Attempt } from '@pending/contract';
import { expect, test } from 'vitest';
import { lastStep } from '../../board';
import { appError } from './errors';
import { currentStep } from './note';
import type { Note } from './note';
import { reduce } from './session';
import type { Session } from './session';
import { form, header, lost, pressed } from './testBuild';

const LIVE = { revealed: false, replay: false };
const REPLAY = { revealed: false, replay: true };
const said = ({ label, text }: Note) => [label, text];
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
const repairing = (attempts: Attempt[]): Session => ({
  status: 'repairing',
  requestId: 'r',
  form,
  attempts,
  lines: [],
  speed: 1,
});
const ended = (attempts: Attempt[]): Session => ({
  status: attempts.at(-1)?.outcome === 'pressed' ? 'pressed' : 'exhausted',
  requestId: 'r',
  build: { ...header(attempts), attempts, lines: [] },
});
const designing = reduce({ status: 'idle' }, { type: 'FILE', requestId: 'r', form, startedAt: 0 });

test('idle says the form waits or that the button replays a recording, and while the config is asked for, that the equipment is being checked', () => {
  expect(said(currentStep({ status: 'idle' }, LIVE))).toEqual([undefined, 'Form 27B/6 awaits filing.']);
  expect(said(currentStep({ status: 'idle' }, { ...LIVE, connecting: true }))).toEqual([
    "Checking the Department's equipment",
    'Confirming the model on this machine.',
  ]);
  expect(said(currentStep({ status: 'idle' }, REPLAY))).toEqual([
    'REPLAY',
    'Press the button to replay a recorded run.',
  ]);
});

test('a live build waits for the model only while it designs and while it repairs', () => {
  const first = lost(1);
  const end = lastStep(first.events);
  const phases: [Session, string, string, boolean][] = [
    [designing, 'GEMMA IS DESIGNING', 'A small AI model is drawing a mechanical blueprint.', true],
    [
      running([first], 1),
      'TESTING THE MACHINE',
      'The simulator is checking whether the ball reaches the blue button.',
      false,
    ],
    [
      running([first], end),
      'THE BUTTON WAS NOT PRESSED',
      'The simulator found where the attempt stopped.',
      false,
    ],
    [
      repairing([first]),
      'GEMMA IS TRYING A REPAIR',
      'The findings went back to Gemma for a correction.',
      true,
    ],
    [
      running([first, pressed(2)], end + 2),
      'TESTING THE REVISED MACHINE',
      'The simulator is checking whether the ball reaches the blue button.',
      false,
    ],
  ];
  for (const [session, label, text, waiting] of phases)
    expect(currentStep(session, LIVE)).toEqual({ label, text, waiting, alert: false });
});

test('a trial that reaches the button is still being tested until the hard cut reveals the verdict', () => {
  const attempts = [lost(1), pressed(2)];
  const end = lastStep(attempts[0]?.events ?? []) + 1 + lastStep(attempts[1]?.events ?? []);
  expect(currentStep(running(attempts, end), LIVE).label).toBe('TESTING THE REVISED MACHINE');
  expect(currentStep(ended(attempts), LIVE).label).toBe('TESTING THE REVISED MACHINE');
  expect(said(currentStep(ended(attempts), { ...LIVE, revealed: true }))).toEqual([
    'IT WORKED',
    "Gemma's machine pressed the button. The simulator verified it.",
  ]);
  expect(said(currentStep(ended([lost(1), lost(2)]), { ...LIVE, revealed: true }))).toEqual([
    'STILL PENDING',
    'Gemma tried; the simulator never recorded a press.',
  ]);
});

test('an error or a timeout shows its real message and the next action, which its alert already announces', () => {
  const timeout = currentStep(
    { status: 'error', requestId: 'r', form, attempts: [], error: appError('TIMEOUT', 'r') },
    LIVE,
  );
  expect(timeout).toEqual({
    label: 'Gemma took too long to answer. Try again.',
    text: 'Next: Build again.',
    waiting: false,
    alert: true,
  });
  const invalid = currentStep(
    { status: 'error', requestId: 'r', form, attempts: [lost(1)], error: appError('INPUT_INVALID', 'r') },
    LIVE,
  );
  expect(invalid.text).toBe('Next: Edit the form.');
});

test('a recording replays the design and the repair, never claiming a model is working now', () => {
  const first = lost(1);
  expect(currentStep(designing, REPLAY)).toEqual({
    label: "REPLAYING GEMMA'S DESIGN",
    text: 'A recorded blueprint from Gemma is replayed on the board.',
    waiting: false,
    alert: false,
  });
  expect(currentStep(repairing([first]), REPLAY)).toEqual({
    label: "REPLAYING GEMMA'S REPAIR",
    text: "Gemma's recorded correction is replayed on the board.",
    waiting: false,
    alert: false,
  });
  expect(currentStep(running([first], lastStep(first.events)), REPLAY).label).toBe(
    'THE BUTTON WAS NOT PRESSED',
  );
  expect(currentStep(running([first], 1), REPLAY).waiting).toBe(false);
});
