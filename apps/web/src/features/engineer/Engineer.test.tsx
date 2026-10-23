import { Line } from '@pending/contract';
import type { Beat } from '@pending/contract';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Engineer } from './Engineer';
import type * as BodyDrawing from './Body';
import type * as Drawing from './Figure';
import { mood } from './model/mood';
import type { Phase } from './model/mood';
import { Sloth } from './Sloth';
import styles from './Engineer.module.css';

// The drawing and the body under it can each be made to throw, to show the fallback never re-enters either.
const drawing = vi.hoisted(() => ({ broken: false, bodyBroken: false }));
vi.mock('./Figure', async (importOriginal) => {
  const actual = await importOriginal<typeof Drawing>();
  return {
    ...actual,
    Figure: (props: Parameters<typeof Drawing.Figure>[0]) => {
      if (drawing.broken) throw new Error('the drawing broke');
      return <actual.Figure {...props} />;
    },
  };
});
vi.mock('./Body', async (importOriginal) => {
  const actual = await importOriginal<typeof BodyDrawing>();
  return {
    ...actual,
    Body: () => {
      if (drawing.bodyBroken) throw new Error('the body broke');
      return <actual.Body />;
    },
  };
});

const line = (beat: Beat, mood: Line['mood'], text = 'This is why we employ snails.') =>
  Object.freeze(
    Line.parse({ id: `l-${beat}`, beat, mood, text, source: 'table', at: { attempt: 1, step: 4 } }),
  );

const prefersReduced = (matches: boolean) =>
  vi.stubGlobal('matchMedia', () => ({ matches, addEventListener() {}, removeEventListener() {} }));

beforeEach(() => prefersReduced(false));
afterEach(() => {
  drawing.broken = false;
  drawing.bodyBroken = false;
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// By default the line's attempt is one the simulator failed, as the cameo line's always is in a real build.
const card = (status: Phase, current: Line | undefined, failed = true) =>
  render(
    <Engineer status={status} line={current} failed={failed}>
      <p>{current?.text}</p>
    </Engineer>,
  ).container;

const rigs = (container: Element) => [...container.querySelectorAll('svg[data-variant]')];
const has = (element: Element, name: string | undefined) =>
  name !== undefined && element.classList.contains(name);
const moods = (svg: Element) => (['slow', 'excited', 'deadpan'] as const).filter((m) => has(svg, styles[m]));

describe('mood', () => {
  test.each([
    ['idle', undefined, 'slow'],
    ['designing', undefined, 'slow'],
    ['running', undefined, 'slow'],
    ['repairing', undefined, 'slow'],
    ['pressed', undefined, 'deadpan'],
    ['exhausted', undefined, 'deadpan'],
    ['error', undefined, 'deadpan'],
    ['running', line('handoff', 'excited'), 'excited'],
    ['running', line('failed', 'deadpan'), 'deadpan'],
    ['repairing', line('repaired', 'slow'), 'slow'],
    ['pressed', line('pressed', 'excited'), 'excited'],
    ['exhausted', line('exhausted', 'deadpan'), 'deadpan'],
    ['idle', line('handoff', 'excited'), 'slow'],
    ['error', line('handoff', 'excited'), 'deadpan'],
  ] as const)('%s with %o is %s', (status, current, expected) => {
    expect(mood(status, current)).toBe(expected);
  });

  test.each(['slow', 'excited', 'deadpan'] as const)('the %s mood is a class on both rigs', (expected) => {
    const container = card('running', line('running', expected));
    const drawn = rigs(container);
    expect(drawn.map((svg) => svg.getAttribute('data-variant'))).toEqual(['desk', 'phone']);
    for (const svg of drawn) expect(moods(svg)).toEqual([expected]);
  });

  test('the press cuts to deadpan without a transition, while every other mood change keeps one', () => {
    const cut = (container: Element) => rigs(container).map((svg) => has(svg, styles.cut));
    expect(cut(card('pressed', line('pressed', 'deadpan')))).toEqual([true, true]);
    cleanup();
    expect(cut(card('pressed', line('pressed', 'excited')))).toEqual([false, false]);
    cleanup();
    expect(cut(card('running', line('failed', 'deadpan')))).toEqual([false, false]);
  });

  test('the phone rig draws only the head, stalks and spectacles', () => {
    const [desk, phone] = rigs(card('idle', undefined));
    expect(desk?.querySelector(`.${styles.shell}`)).not.toBeNull();
    expect(phone?.querySelector(`.${styles.shell}`)).toBeNull();
    for (const part of ['head', 'stalks', 'eyes', 'lids', 'spectacles'] as const)
      expect(phone?.querySelector(`.${styles[part]}`)).not.toBeNull();
  });
});

describe('error boundary', () => {
  // The full rig in the desk's 360 × 320 box and the head alone in the phone's, both static and slow.
  const stillRig = (container: Element) => {
    const fallbacks = [...container.querySelectorAll('svg[data-fallback]')];
    expect(rigs(container)).toEqual([]);
    expect(fallbacks.map((svg) => svg.getAttribute('viewBox'))).toEqual(['0 0 360 320', '125 -5 140 140']);
    const [desk, phone] = fallbacks;
    expect(desk && has(desk, styles.desk)).toBe(true);
    expect(phone && has(phone, styles.phone)).toBe(true);
    expect(desk?.querySelector(`.${styles.shell}`)).not.toBeNull();
    expect(phone?.querySelector(`.${styles.shell}`)).toBeNull();
    for (const fallback of fallbacks) {
      expect(moods(fallback)).toEqual(['slow']);
      expect(has(fallback, styles.cameo)).toBe(false);
    }
  };

  test('a throw inside the rig leaves a static slow rig and the rest of the card', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('matchMedia', () => {
      throw new Error('no media queries here');
    });
    const container = card('running', line('handoff', 'excited', 'A successful descent!'));
    stillRig(container);
    expect(screen.getByText('A successful descent!')).toBeDefined();
  });

  test('a throw inside the drawing itself does not reach the fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    drawing.broken = true;
    const container = card('running', line('handoff', 'excited', 'A successful descent!'));
    stillRig(container);
    expect(screen.getByText('A successful descent!')).toBeDefined();
  });

  test('a throw inside the body does not reach the fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    drawing.bodyBroken = true;
    const container = card('running', line('handoff', 'excited', 'A successful descent!'));
    stillRig(container);
    expect(screen.getByText('A successful descent!')).toBeDefined();
  });

  test('on the cameo line a throwing sloth is dropped and the card still stands', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('matchMedia', () => {
      throw new Error('no media queries here');
    });
    const container = card('repairing', line('cameo', 'deadpan'));
    expect(container.querySelector('[data-sloth]')).toBeNull();
    expect(container.querySelector('[data-fallback]')).not.toBeNull();
    expect(screen.getByText('This is why we employ snails.')).toBeDefined();
  });
});

describe('the Sloth Incident', () => {
  const cameo = (container: Element) => rigs(container).every((svg) => has(svg, styles.cameo));
  const sloth = (container: Element) => container.querySelector('[data-sloth]');

  test('the look sequence and the sloth appear only on the cameo line', () => {
    const { container, rerender } = render(
      <Engineer status="running" line={line('failed', 'deadpan')} failed>
        <p />
      </Engineer>,
    );
    expect(sloth(container)).toBeNull();
    expect(cameo(container)).toBe(false);

    rerender(
      <Engineer status="repairing" line={line('cameo', 'deadpan')} failed>
        <p />
      </Engineer>,
    );
    expect(sloth(container)).not.toBeNull();
    expect(cameo(container)).toBe(true);
    expect(rigs(container).map(moods)).toEqual([['deadpan'], ['deadpan']]);

    rerender(
      <Engineer status="running" line={line('repaired', 'slow')} failed={false}>
        <p />
      </Engineer>,
    );
    expect(sloth(container)).toBeNull();
    expect(cameo(container)).toBe(false);
  });

  test('a cameo line on an attempt the simulator did not fail brings neither the sloth nor the looks', () => {
    // A forged record can carry the cameo line on a pressed trial; the line still shows, nothing else does.
    const container = card('running', line('cameo', 'deadpan'), false);
    expect(sloth(container)).toBeNull();
    expect(cameo(container)).toBe(false);
    expect(container.querySelector(`.${styles.withSloth}`)).toBeNull();
    expect(screen.getByText('This is why we employ snails.')).toBeDefined();
  });

  test('with reduced motion the sloth and the line show and nothing moves', () => {
    prefersReduced(true);
    const container = card('repairing', line('cameo', 'deadpan'));
    expect(sloth(container)).not.toBeNull();
    expect(screen.getByText('This is why we employ snails.')).toBeDefined();
    expect(cameo(container)).toBe(false);
    expect(container.querySelector(`.${styles.blink}`)).toBeNull();
  });

  test('with motion the sloth blinks once', () => {
    const container = card('repairing', line('cameo', 'deadpan'));
    expect(container.querySelector(`.${styles.blink}`)).not.toBeNull();
  });

  test('the layer reads no prop of the board or the session', () => {
    // It takes no props at all, and draws the same whatever the line, the phase or the trial.
    expect(Sloth.length).toBe(0);
    const first = sloth(card('repairing', line('cameo', 'deadpan')))?.outerHTML;
    cleanup();
    const other = Object.freeze(
      Line.parse({
        id: 'other',
        beat: 'cameo',
        mood: 'deadpan',
        text: 'Elsewhere.',
        source: 'table',
        at: { attempt: 3, step: 90 },
      }),
    );
    expect(sloth(card('running', other))?.outerHTML).toBe(first);
  });
});
