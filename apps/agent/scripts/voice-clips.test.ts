import { Attempt } from '@pending/contract';
import { expect, test } from 'vitest';
import lostBlueprint from '../../../packages/machine/fixtures/lost/blueprint.json';
import lostEvents from '../../../packages/machine/fixtures/lost/events.json';
import repairedBlueprint from '../../../packages/machine/fixtures/repaired/blueprint.json';
import repairedEvents from '../../../packages/machine/fixtures/repaired/events.json';
import repairedPatch from '../../../packages/machine/fixtures/repaired/patch.json';
import { opening, repaired, trial } from '../src/build/beats';
import type { Draft } from '../src/build/beats';
import { FIXED, MAX_CHARS, Manifest, sha256, stale } from './voice-clips';

// The recorded build of MACHINE-RULES section 7: lost at L3, repaired by removing p4, then pressed.
const lost = Attempt.parse({
  n: 1,
  blueprint: lostBlueprint,
  violations: [],
  events: lostEvents,
  outcome: 'lost',
  failedAt: 'L3',
});
const pressed = Attempt.parse({
  n: 2,
  blueprint: repairedBlueprint,
  violations: [],
  events: repairedEvents,
  outcome: 'pressed',
  patch: repairedPatch,
});

// A line with a slot: a memo, a title, a trial number, a cell or a part.
const variable = (l: Draft) =>
  l.source === 'model' ||
  l.beat === 'designed' ||
  l.beat === 'running' ||
  l.beat === 'exhausted' ||
  /^(Finding|Correction \d+):/.test(l.text);

test('every slot-free line the narration speaks in a recorded build has a clip, word for word', () => {
  const lines: Draft[] = [
    ...opening(),
    ...trial(lost, [], true),
    ...repaired('A memo.', lost, pressed),
    ...trial(pressed, [lost], false),
  ];
  const clipped = (l: Draft) => FIXED.some((f) => f.text === l.text);
  expect(lines.filter((l) => !variable(l) && !clipped(l))).toEqual([]);
  expect(lines.filter(clipped).map((l) => l.beat)).toEqual(
    expect.arrayContaining(['intake', 'designing', 'failed', 'cameo', 'repaired', 'pressed']),
  );
  expect(lines.filter((l) => l.beat === 'pressed').every(clipped)).toBe(true);
});

test('the fixed lines fit the manifest and the character budget, each under its own id', () => {
  const manifest = Manifest.parse(FIXED.map(({ id, text }) => ({ id, text, sha256: sha256(text) })));
  expect(new Set(manifest.map((e) => e.id)).size).toBe(FIXED.length);
  expect(FIXED.reduce((sum, l) => sum + l.text.length, 0)).toBeLessThan(MAX_CHARS);
});

test('a line is rendered again only when its text changed or its clip is missing', () => {
  const previous: Manifest = FIXED.map(({ id, text }) => {
    const said = id === 'designing' ? 'Drafting. The Department is in no hurry.' : text;
    return { id, text: said, sha256: sha256(said) };
  });
  expect(stale(previous, (id) => id !== 'cameo').map((l) => l.id)).toEqual(['designing', 'cameo']);
  expect(stale(previous.slice(1), () => true).map((l) => l.id)).toEqual(['intake', 'designing']);
});
