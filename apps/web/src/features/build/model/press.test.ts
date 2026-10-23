import { Line } from '@pending/contract';
import { expect, test } from 'vitest';
import { pressLine, pressVoiced, pressing } from './press';
import type { Session } from './session';
import { form, lost, pressed } from './testBuild';

const line = (id: string, beat: Line['beat'], mood: Line['mood']) =>
  Line.parse({ id, beat, mood, text: id, source: 'table', at: { attempt: 1, step: 0 } });

const lines = [
  line('start', 'running', 'slow'),
  line('cheer', 'pressed', 'excited'),
  line('ack', 'pressed', 'deadpan'),
  line('verdict', 'pressed', 'deadpan'),
];

test.each([
  ['before', 'start'],
  ['excited', 'cheer'],
  ['cut', 'verdict'],
] as const)('on the press clock %s, the rig reacts to %s', (beat, id) => {
  expect(pressLine(lines, beat)?.id).toBe(id);
});

test('lines without a pressed beat are read at their last line', () => {
  expect(pressLine(lines.slice(0, 1), 'before')?.id).toBe('start');
});

test('the excited handoff ends when the terminal beat arrives', () => {
  const handed = [...lines.slice(0, 1), line('contact', 'handoff', 'excited'), ...lines.slice(1)];
  expect(pressLine(handed, 'before')?.id).toBe('start');
  expect(pressLine(handed, 'excited')?.id).toBe('cheer');
  // On the press tick, before the pressed lines have arrived, the handoff no longer sets the mood either.
  expect(pressLine(handed.slice(0, 2), 'before')?.id).toBe('start');
});

test.each([
  ['before', ['start']],
  ['excited', ['start', 'cheer', 'ack', 'verdict']],
  ['cut', ['start', 'cheer', 'ack', 'verdict']],
] as const)('on the press clock %s, the voice queue holds %j', (beat, ids) => {
  expect(pressVoiced(lines, beat).map((l) => l.id)).toEqual(ids);
});

test('the press starts on the tick that reaches the button event, never on a line', () => {
  const won = pressed(1);
  const at = won.events.find((event) => event.type === 'button.pressed')?.step;
  if (at === undefined) throw new Error('the pressed fixture has no button event');
  const running = (attempt: typeof won, step: number): Session => ({
    status: 'running',
    requestId: 'b1',
    form,
    attempts: [attempt],
    // A record can carry pressed lines on any trial; only the simulator's event starts the press.
    lines: [line('cheer', 'pressed', 'excited')],
    step,
    speed: 1,
    paused: false,
  });
  expect(pressing(running(won, at - 1))).toBeUndefined();
  expect(pressing(running(won, at))).toBe('b1');
  const failed = lost(1);
  expect(pressing(running(failed, failed.events.at(-1)?.step ?? 0))).toBeUndefined();
});
