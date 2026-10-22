import { describe, expect, test } from 'vitest';
import {
  Attempt,
  Build,
  MAX_ATTEMPTS,
  MAX_EVENTS,
  MAX_IMPORT_BYTES,
  MAX_LINE_BYTES,
  MAX_LINES,
  MAX_PARTS,
  StreamEvent,
} from './index';

// UTF-8 length of the serialised value; JSON.stringify escapes lone surrogates, so every code point is whole.
function bytes(value: unknown): number {
  let size = 0;
  for (const char of JSON.stringify(value)) {
    const point = char.codePointAt(0) ?? 0;
    size += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return size;
}
const largest = <T>(candidates: T[]): T =>
  candidates.reduce((big, next) => (bytes(next) > bytes(big) ? next : big));
const ascii = (max: number) => 'a'.repeat(max);
const requestId = '123e4567-e89b-42d3-a456-426614174000';

// Every free-text field at its .max(), counted in UTF-16 units as zod counts it, filled with `unit`.
function worstCase(unit: string) {
  const text = (max: number) => unit.repeat(Math.floor(max / unit.length));
  const part = largest([
    { id: 'p99', cell: 'L7', dir: 'east', kind: 'conveyor', length: 6 },
    { id: 'p99', cell: 'L7', dir: 'east', kind: 'dominoes', length: 5 },
    { id: 'p99', cell: 'L7', dir: 'east', kind: 'catapult', power: 5 },
  ]);
  const event = largest([
    { type: 'ball.launched', step: 200, from: 'L7', to: 'L7', by: 'catapult', part: 'p99' },
    { type: 'ball.moved', step: 200, from: 'L7', to: 'L7', by: 'conveyor' },
    { type: 'domino.fell', step: 200, part: 'p99', index: 4, cell: 'L7' },
  ]);
  const attempt = (n: number) => ({
    n,
    blueprint: { title: text(40), parts: Array.from({ length: MAX_PARTS }, () => part) },
    violations: Array.from({ length: 8 }, () => text(120)),
    events: Array.from({ length: MAX_EVENTS }, () => event),
    outcome: 'stalled',
    failedAt: 'L7',
    patch: Array.from({ length: 4 }, () => ({ op: 'add', part })),
  });
  const line = {
    id: ascii(16),
    beat: 'designing',
    mood: 'excited',
    text: text(160),
    source: 'table',
    at: { attempt: 6, step: 200 },
  };
  const build = {
    id: ascii(32),
    contractVersion: ascii(16),
    rulesVersion: ascii(16),
    promptVersion: ascii(16),
    form: { nature: text(180), minParts: 8, maxParts: 14, required: 'dominoes', forbidden: 'catapult' },
    model: { mode: 'hosted', id: ascii(64), host: 'openrouter', digest: ascii(80), runtime: ascii(32) },
    title: text(40),
    report: { attempts: 6, parts: 14, pressed: false, failedAt: 'L7', verdict: text(120) },
    createdAt: '2026-10-22T10:00:00.000Z',
    attempts: Array.from({ length: MAX_ATTEMPTS }, (_, i) => attempt(i + 1)),
    lines: Array.from({ length: MAX_LINES }, () => line),
  };
  return {
    attemptLine: StreamEvent.parse({ type: 'attempt', requestId, attempt: Attempt.parse(attempt(6)) }),
    build: Build.parse(build),
  };
}

// Four-byte characters as the contract names them; control characters, which JSON escapes to six bytes per unit.
// The measured sizes are part of each test's name, so the test report prints them.
describe.each([
  ['four-byte characters', '\u{1F40C}'],
  ['escaped control characters', '\u0000'],
])('contract.bounds with %s', (_, unit) => {
  const { attemptLine, build } = worstCase(unit);
  const lineSize = bytes(attemptLine) + 1; // the newline
  const buildSize = bytes(build);

  test(`the largest attempt event, ${lineSize} B, fits one ${MAX_LINE_BYTES} B NDJSON line`, () => {
    expect(lineSize).toBeLessThanOrEqual(MAX_LINE_BYTES);
  });

  test(`the largest Build, ${buildSize} B, fits the ${MAX_IMPORT_BYTES} B import limit`, () => {
    expect(buildSize).toBeLessThanOrEqual(MAX_IMPORT_BYTES);
  });
});
