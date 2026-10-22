import { Blueprint, Build, Patch, SimEvent } from '@pending/contract';
import type { Attempt } from '@pending/contract';
import { expect, test } from 'vitest';
import catapultBlueprint from '../fixtures/catapult/blueprint.json';
import catapultEvents from '../fixtures/catapult/events.json';
import catapultForm from '../fixtures/catapult/form.json';
import catapultRepairedBlueprint from '../fixtures/catapult-repaired/blueprint.json';
import catapultRepairedEvents from '../fixtures/catapult-repaired/events.json';
import catapultRepairedPatch from '../fixtures/catapult-repaired/patch.json';
import lostBlueprint from '../fixtures/lost/blueprint.json';
import lostEvents from '../fixtures/lost/events.json';
import { report } from './report';

const PRESSED = 'One button. An extraordinary amount of paperwork.';
const PENDING = 'Your request is pending. Naturally.';

const events = (raw: unknown) => SimEvent.array().parse(raw);
const attempt = (fields: Omit<Attempt, 'violations'>): Attempt => ({ violations: [], ...fields });
const catapult = attempt({
  n: 1,
  blueprint: Blueprint.parse(catapultBlueprint),
  events: events(catapultEvents),
  outcome: 'stalled',
  failedAt: 'H4',
});
const catapultRepaired = attempt({
  n: 2,
  blueprint: Blueprint.parse(catapultRepairedBlueprint),
  events: events(catapultRepairedEvents),
  outcome: 'pressed',
  patch: Patch.parse(catapultRepairedPatch),
});

test('a pressed build reports its attempt count and the last blueprint, never a sum over repairs', () => {
  expect(report([catapult, catapultRepaired])).toEqual({
    attempts: 2,
    parts: 5,
    pressed: true,
    verdict: PRESSED,
  });
});

test('an unpressed build reports where its last attempt failed', () => {
  const lost = attempt({
    n: 1,
    blueprint: Blueprint.parse(lostBlueprint),
    events: events(lostEvents),
    outcome: 'lost',
    failedAt: 'L3',
  });
  expect(report([lost])).toEqual({ attempts: 1, parts: 4, pressed: false, failedAt: 'L3', verdict: PENDING });
});

test('report ignores anything but attempts: lines and a stale header cannot change it', () => {
  const build = Build.parse({
    id: 'b1',
    contractVersion: 'c1',
    rulesVersion: 'r2',
    promptVersion: 'p1',
    form: catapultForm,
    model: { mode: 'local', id: 'gemma4:12b', host: 'ollama' },
    title: 'Catapult',
    report: { attempts: 6, parts: 14, pressed: true, verdict: 'The machine pressed the button nine times.' },
    createdAt: '2026-10-22T12:00:00.000Z',
    attempts: [catapult],
    lines: [
      {
        id: 'l1',
        beat: 'designed',
        mood: 'slow',
        text: 'Fourteen parts. The button has been pressed.',
        source: 'model',
        at: { attempt: 1, step: 0 },
      },
    ],
  });
  expect(report(build.attempts)).toEqual({
    attempts: 1,
    parts: 5,
    pressed: false,
    failedAt: 'H4',
    verdict: PENDING,
  });
});

test('a report needs at least one attempt', () => {
  expect(() => report([])).toThrow('a report needs at least one attempt');
});
