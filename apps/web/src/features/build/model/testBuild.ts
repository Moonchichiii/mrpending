import { Attempt, BuildHeader, Form } from '@pending/contract';
import { report } from '@pending/machine';

// Recorded machines from MACHINE-RULES section 7, parsed like any external record; test support only.
const files = import.meta.glob<unknown>('../../../../../../packages/machine/fixtures/{pressed,lost}/*.json', {
  eager: true,
  import: 'default',
});
const fixture = (name: string, file: string) =>
  files[`../../../../../../packages/machine/fixtures/${name}/${file}.json`];

export const form = Form.parse({ nature: 'Press the blue button.', minParts: 2, maxParts: 14 });

export const pressed = (n: number) =>
  Attempt.parse({
    n,
    blueprint: fixture('pressed', 'blueprint'),
    violations: [],
    events: fixture('pressed', 'events'),
    outcome: 'pressed',
  });

export const lost = (n: number) =>
  Attempt.parse({
    n,
    blueprint: fixture('lost', 'blueprint'),
    violations: [],
    events: fixture('lost', 'events'),
    outcome: 'lost',
    failedAt: 'L3',
  });

export const header = (attempts: Attempt[]) =>
  BuildHeader.parse({
    id: 'b1',
    contractVersion: 'c1',
    rulesVersion: 'r2',
    promptVersion: 'p1',
    form,
    model: { mode: 'local', id: 'gemma4:e2b', host: 'ollama' },
    title: 'The Scenic Route',
    report: report(attempts),
    createdAt: '2026-10-22T10:00:00.000Z',
  });
