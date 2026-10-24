import { readFileSync } from 'node:fs';
import { Attempt, BuildHeader, Form, Line } from '@pending/contract';
import type { StreamEvent } from '@pending/contract';
import { report } from '@pending/machine';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// A recorded build in two trials: lost, then repaired by removing p4 and pressed (MACHINE-RULES section 7 fixtures).
const fixture = (name: string, file: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../../packages/machine/fixtures/${name}/${file}.json`, import.meta.url), 'utf8'),
  );
export const FORM = Form.parse(fixture('lost', 'form'));
export const ATTEMPTS = [
  Attempt.parse({
    n: 1,
    blueprint: fixture('lost', 'blueprint'),
    violations: [],
    events: fixture('lost', 'events'),
    outcome: 'lost',
    failedAt: 'L3',
  }),
  Attempt.parse({
    n: 2,
    blueprint: fixture('repaired', 'blueprint'),
    violations: [],
    events: fixture('repaired', 'events'),
    outcome: 'pressed',
    patch: fixture('repaired', 'patch'),
  }),
];

// The same build with every free-text field the screen shows at its schema maximum, for the layout checks.
const LONGEST = ATTEMPTS.map((attempt) => ({
  ...attempt,
  blueprint: { ...attempt.blueprint, title: 'W'.repeat(40) },
}));
const LONGEST_LINES = [1, 2].map((attempt) =>
  Line.parse({
    id: `longest-${attempt}`,
    beat: 'running',
    mood: 'slow',
    text: 'W'.repeat(160),
    source: 'model',
    at: { attempt, step: 0 },
  }),
);

export const recorded = (requestId: string, longest = false): StreamEvent[] => [
  ...(longest ? LONGEST_LINES.map((line): StreamEvent => ({ type: 'line', requestId, line })) : []),
  ...(longest ? LONGEST : ATTEMPTS).map((attempt): StreamEvent => ({ type: 'attempt', requestId, attempt })),
  {
    type: 'done',
    requestId,
    header: BuildHeader.parse({
      id: 'b1',
      contractVersion: 'c1',
      rulesVersion: 'r2',
      promptVersion: 'p1',
      form: longest ? { ...FORM, nature: 'W'.repeat(180) } : FORM,
      model: { mode: 'local', id: longest ? 'W'.repeat(64) : 'gemma4:e2b', host: 'ollama' },
      title: longest ? 'W'.repeat(40) : 'The Scenic Route',
      report: report(ATTEMPTS),
      createdAt: '2026-10-22T10:00:00.000Z',
    }),
  },
];

export const ndjson = (events: StreamEvent[]) => events.map((e) => `${JSON.stringify(e)}\n`).join('');

// The front door's one button files a pre-filled request; a test that changes an item opens the fold first, as a
// visitor must.
export const DEFAULT = { nature: 'Press the blue button. Scenic route, please.', minParts: 3, maxParts: 8 };
export const FILE = 'Press the button';
export const adjust = (page: Page) => page.getByText('Advanced settings').click();

// What the board's Current step note says, label and sentence, in the phases the specs walk through.
const CHECKING = 'The simulator is checking whether the ball reaches the blue button.';
export const NOTE = {
  idle: 'Form 27B/6 awaits filing.',
  designing: 'GEMMA IS DESIGNING A small AI model is drawing a mechanical blueprint.',
  testing: `TESTING THE MACHINE ${CHECKING}`,
  failed: 'THE BUTTON WAS NOT PRESSED The simulator found where the attempt stopped.',
  repairing: 'GEMMA IS TRYING A REPAIR The findings went back to Gemma for a correction.',
  retesting: `TESTING THE REVISED MACHINE ${CHECKING}`,
  worked: "IT WORKED Gemma's machine pressed the button. The simulator verified it.",
};

// The local front door with the agent mocked at the network boundary.
export const CONFIG = {
  inference: 'this-machine',
  model: { mode: 'local', id: 'gemma4:e2b', host: 'ollama' },
  voice: { elevenlabs: false },
  telemetry: false,
  repairs: 5,
  contractVersion: 'c1',
  rulesVersion: 'r2',
};
export const BADGE = 'Gemma runs on this machine. Your prompts stay here.';

export async function open(page: Page) {
  await page.route('**/api/config', (route) => route.fulfill({ json: CONFIG }));
  await page.goto('/');
  await expect(page.getByText(BADGE)).toBeVisible();
}
