import { Line } from '@pending/contract';
import { expect, test } from 'vitest';
import { pressLine } from './press';

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
