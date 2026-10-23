import { Attempt, Build, Form } from '@pending/contract';
import { report } from '@pending/machine';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { EngineeringReport } from './EngineeringReport';
import { estimate, reportView, wrap } from './model/view';
import { ReportCard, SHAPES } from './ReportCard';

// Recorded machines from MACHINE-RULES section 7, parsed like any external record.
const files = import.meta.glob<unknown>('../../../../../packages/machine/fixtures/{pressed,lost}/*.json', {
  eager: true,
  import: 'default',
});
const fixture = (name: string, file: string) =>
  files[`../../../../../packages/machine/fixtures/${name}/${file}.json`];
const attempt = (n: number, name: 'pressed' | 'lost') =>
  Attempt.parse({
    n,
    blueprint: fixture(name, 'blueprint'),
    violations: [],
    events: fixture(name, 'events'),
    outcome: name,
    ...(name === 'lost' ? { failedAt: 'L3' } : {}),
  });

// Every line claims numbers the simulator never produced; the card must not repeat any of them.
const build = (attempts: Attempt[]) =>
  Build.parse({
    id: 'b1:take',
    contractVersion: 'c1',
    rulesVersion: 'r2',
    promptVersion: 'p1',
    form: Form.parse({ nature: 'Press the blue button.', minParts: 2, maxParts: 14 }),
    model: { mode: 'local', id: 'gemma4:12b', host: 'ollama' },
    title: 'The Scenic Route',
    report: report(attempts),
    createdAt: '2026-10-22T10:00:00.000Z',
    attempts,
    lines: [
      {
        id: 'l1',
        beat: 'pressed',
        mood: 'deadpan',
        text: 'Approved on attempt 5 with 12 parts, after a failure at B2.',
        source: 'model',
        at: { attempt: 1, step: 0 },
      },
    ],
  });

afterEach(cleanup);

const repaired = build([attempt(1, 'lost'), attempt(2, 'pressed')]);
const exhausted = build([attempt(1, 'lost'), attempt(2, 'lost')]);
const numbers = (card: Element) =>
  Object.fromEntries(
    [...card.querySelectorAll('[data-number]')].map((n) => [n.getAttribute('data-number'), n.textContent]),
  );

test.each(['landscape', 'portrait'] as const)(
  'the %s card shows the simulator numbers even when the lines carry wrong ones',
  (shape) => {
    const { container } = render(<ReportCard view={reportView(repaired)} shape={shape} />);
    expect(numbers(container)).toEqual({ attempts: '2', parts: '3', pressed: 'Yes' });
    const verdict = [...container.querySelectorAll('[data-verdict] tspan')].map((line) => line.textContent);
    expect(verdict.join(' ')).toBe(repaired.report.verdict);
    expect(container.textContent).not.toMatch(/\b(5|12|B2)\b/);
    expect(container.querySelector('desc')?.textContent).toContain('Attempts: 2. Parts: 3. Pressed: Yes.');
  },
);

test('the card is 1200 x 630, the portrait variant 3:4, and both carry the header footer', () => {
  for (const [shape, box] of [
    ['landscape', '0 0 1200 630'],
    ['portrait', '0 0 900 1200'],
  ] as const) {
    const { container } = render(<ReportCard view={reportView(repaired)} shape={shape} />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(box);
    expect(container.querySelector('[data-footer]')?.textContent).toBe(
      'Recorded local inference · gemma4:12b via Ollama',
    );
  }
});

test('the thumbnail is drawn from the final attempt, not the failed one before it', () => {
  const { container } = render(<ReportCard view={reportView(repaired)} shape="landscape" />);
  const thumbnail = container.querySelector('[data-thumbnail]');
  // The pressed fixture's three parts; the lost attempt's catapult p4 and its L3 failure are not on it.
  expect(
    [...(thumbnail?.querySelectorAll('[data-part]') ?? [])].map((p) => p.getAttribute('data-part')),
  ).toEqual(['p1', 'p2', 'p3']);
  expect(thumbnail?.querySelector('[data-failure]')).toBeNull();
  // Its final frame: the ball stops on the dominoes at I7, (64 + 56 * 8, 56 + 56 * 6).
  expect(thumbnail?.querySelector('[data-ball]')?.getAttribute('data-ball')).toBe('512 392');
  expect(thumbnail?.querySelector('[data-pressed]')?.getAttribute('data-pressed')).toBe('true');
});

test('a pressed build is stamped APPROVED; an exhausted one PENDING on the same card, with its failure', () => {
  const won = render(<EngineeringReport build={repaired} />).container;
  const lost = render(<EngineeringReport build={exhausted} />).container;
  for (const card of won.querySelectorAll('svg[data-shape]')) {
    expect(card.querySelector('[data-stamp]')?.getAttribute('data-stamp')).toBe('APPROVED');
  }
  for (const card of lost.querySelectorAll('svg[data-shape]')) {
    expect(card.querySelector('[data-stamp]')?.getAttribute('data-stamp')).toBe('PENDING');
    expect(numbers(card)).toEqual({ attempts: '2', parts: '4', pressed: 'No', failedAt: 'L3' });
    expect(card.querySelector('[data-thumbnail] [data-failure]')?.getAttribute('data-failure')).toBe('L3');
  }
  expect(won.querySelectorAll('svg[data-shape]')).toHaveLength(2);
});

test('Save as image says so when this browser cannot make the image', async () => {
  // jsdom lays nothing out, so neither card has a box to rasterise.
  const { getByRole, findByText } = render(<EngineeringReport build={repaired} />);
  getByRole('button', { name: 'Save as image' }).click();
  expect(await findByText(/could not make the image/)).toBeTruthy();
});

test.each(['landscape', 'portrait'] as const)(
  'on the %s card, text at every schema maximum stays inside its box and above the footer',
  (shape) => {
    const widest = Build.parse({
      ...repaired,
      title: 'W'.repeat(40),
      model: { mode: 'hosted', id: 'W'.repeat(64), host: 'openrouter' },
      report: { ...repaired.report, verdict: 'WW '.repeat(40).trim() },
    });
    const { container } = render(<ReportCard view={reportView(widest)} shape={shape} />);
    const { width, text, title, verdict } = SHAPES[shape];
    const extent = (line: Element, size: number) =>
      Number(line.getAttribute('textLength') ?? estimate(line.textContent, size));
    const titles = [...container.querySelectorAll('[data-title] tspan')];
    const verdicts = [...container.querySelectorAll('[data-verdict] tspan')];
    const footer = container.querySelector('[data-footer]');
    if (!footer) throw new Error('the card has no footer');
    expect(titles.length).toBeLessThanOrEqual(title.lines);
    expect(verdicts.length).toBeLessThanOrEqual(verdict.lines);
    for (const line of titles) expect(extent(line, 44)).toBeLessThanOrEqual(text);
    for (const line of verdicts) expect(extent(line, 28)).toBeLessThanOrEqual(text);
    expect(extent(footer, 20)).toBeLessThanOrEqual(width - 192);
    expect(Number(verdicts.at(-1)?.getAttribute('y'))).toBeLessThan(Number(footer.getAttribute('y')) - 28);
  },
);

test('svg text wraps on words, cuts a word longer than the line and caps the lines', () => {
  expect(wrap('One button. An extraordinary amount of paperwork.', 20, 4)).toEqual([
    'One button. An',
    'extraordinary amount',
    'of paperwork.',
  ]);
  expect(wrap('Supercalifragilistic', 8, 4)).toEqual(['Supercal', 'ifragili', 'stic']);
  expect(wrap('a b c d', 1, 2)).toEqual(['a', 'b c d']);
});

test('svg text wrap never splits a character outside the BMP', () => {
  const title = `${'a'.repeat(21)}🚀b`;
  expect(wrap(title, 22, 2)).toEqual([`${'a'.repeat(21)}🚀`, 'b']);
  expect(wrap('ab 🚀', 4, 2)).toEqual(['ab 🚀']);
});
