import { SimEvent } from '@pending/contract';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { Minutes } from './Minutes';

afterEach(cleanup);

const files = import.meta.glob<unknown>('../../../../../packages/machine/fixtures/*/events.json', {
  eager: true,
  import: 'default',
});
const recorded = (name: string) =>
  SimEvent.array().parse(files[`../../../../../packages/machine/fixtures/${name}/events.json`]);

describe('minutes list', () => {
  const names = ['pressed', 'lost', 'stalled', 'seesaw', 'catapult', 'catapult-repaired', 'repaired'];

  test.each(names)('%s: one entry per event, in order, naming its step, cells and part', (name) => {
    const events = recorded(name);
    const { getAllByRole } = render(<Minutes n={1} events={events} step={200} />);
    const items = getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(items).toHaveLength(events.length);
    events.forEach((event, i) => {
      const text = items[i] ?? '';
      expect(text.startsWith(`Step ${event.step}:`)).toBe(true);
      const facts = [
        'cell' in event ? event.cell : undefined,
        'from' in event ? event.from : undefined,
        'to' in event ? event.to : undefined,
        'part' in event ? event.part : undefined,
        'edge' in event ? event.edge : undefined,
        event.type === 'button.pressed' ? event.by : undefined,
        event.type === 'ball.launched' ? event.by : undefined,
      ];
      for (const fact of facts.filter((f) => f !== undefined)) expect(text).toContain(fact);
    });
  });

  test('stops at the playhead and says so when nothing has happened', () => {
    const events = recorded('seesaw');
    const { getAllByRole, rerender, getByText } = render(<Minutes n={1} events={events} step={7} />);
    expect(getAllByRole('listitem')).toHaveLength(7);
    rerender(<Minutes n={1} events={events} step={0} />);
    expect(getByText('Nothing has happened yet.')).toBeTruthy();
  });
});
