import type { Attempt } from '@pending/contract';
import { describe, expect, test } from 'vitest';
import { appError } from './errors';
import { IDLE, reduce } from './session';
import type { Motion, Session, SessionEvent, Speed } from './session';
import { form, header, lost, pressed } from './testBuild';

const ID = '00000000-0000-4000-8000-000000000001';
const OLD = '00000000-0000-4000-8000-000000000002';

const run = (events: SessionEvent[], from: Session = IDLE) => events.reduce(reduce, from);
const filed = run([{ type: 'FILE', requestId: ID, form, startedAt: 0 }]);
const tick = (motion: Motion = 'full'): SessionEvent => ({ type: 'TICK', requestId: ID, motion });
const lastStep = (attempt: Attempt) => attempt.events.at(-1)?.step ?? 0;

// Ticks until the status changes, returning how many ticks it took and the state reached.
function playUntilChange(state: Session, motion: Motion) {
  let ticks = 0;
  let current = state;
  while (current.status === state.status && ticks < 1000) {
    current = reduce(current, tick(motion));
    ticks += 1;
  }
  return { ticks, state: current };
}

describe('stale and impossible events', () => {
  test('events for an older requestId leave the state unchanged', () => {
    const newer = run(
      [{ type: 'FILE', requestId: ID, form, startedAt: 1 }],
      run([{ type: 'FILE', requestId: OLD, form, startedAt: 0 }]),
    );
    const stale: SessionEvent[] = [
      { type: 'PARTIAL', requestId: OLD, partial: { title: 'Old' } },
      {
        type: 'LINE',
        requestId: OLD,
        line: {
          id: 'l1',
          beat: 'intake',
          mood: 'slow',
          text: 'Old.',
          source: 'table',
          at: { attempt: 1, step: 0 },
        },
      },
      { type: 'ATTEMPT', requestId: OLD, attempt: pressed(1) },
      { type: 'DONE', requestId: OLD, header: header([pressed(1)]) },
      { type: 'FAIL', requestId: OLD, error: appError('UNKNOWN', OLD) },
      { type: 'CANCEL', requestId: OLD },
    ];
    for (const event of stale) expect(reduce(newer, event)).toBe(newer);
  });

  test('a partial replaces the drawing while designing and is ignored once an attempt exists', () => {
    const drawn = run(
      [{ type: 'PARTIAL', requestId: ID, partial: { title: 'Draft', parts: [{ kind: 'ramp' }] } }],
      filed,
    );
    expect(drawn).toMatchObject({
      status: 'designing',
      partial: { title: 'Draft', parts: [{ kind: 'ramp' }] },
    });
    const running = reduce(drawn, { type: 'ATTEMPT', requestId: ID, attempt: lost(1) });
    expect(reduce(running, { type: 'PARTIAL', requestId: ID, partial: { title: 'Late' } })).toBe(running);
  });

  test('an attempt out of order is ignored', () => {
    expect(reduce(filed, { type: 'ATTEMPT', requestId: ID, attempt: lost(2) })).toBe(filed);
  });
});

describe('cancel and failure', () => {
  test('cancel returns to idle with the form kept, from designing and from running', () => {
    expect(reduce(filed, { type: 'CANCEL', requestId: ID })).toEqual({ status: 'idle', form });
    const running = reduce(filed, { type: 'ATTEMPT', requestId: ID, attempt: lost(1) });
    expect(reduce(running, { type: 'CANCEL', requestId: ID })).toEqual({ status: 'idle', form });
  });

  test('a failure keeps the finished attempts and the form', () => {
    const failed = run(
      [
        { type: 'ATTEMPT', requestId: ID, attempt: lost(1) },
        { type: 'FAIL', requestId: ID, error: appError('INTERRUPTED', ID) },
      ],
      filed,
    );
    expect(failed).toMatchObject({
      status: 'error',
      form,
      attempts: [lost(1)],
      error: { code: 'INTERRUPTED' },
    });
    expect(reduce(failed, { type: 'RESET', requestId: ID })).toEqual({ status: 'idle', form });
  });
});

describe('server completion is not playback completion', () => {
  const cases: [Speed, Motion][] = [
    [0.5, 'full'],
    [1, 'full'],
    [3, 'full'],
    [1, 'reduced'],
  ];

  test.each(cases)(
    'done before playback at speed %s (%s motion) only stores final; the last tick ends it',
    (speed, motion) => {
      const attempt = pressed(1);
      const done = run(
        [
          { type: 'ATTEMPT', requestId: ID, attempt },
          { type: 'SPEED', requestId: ID, speed },
          { type: 'DONE', requestId: ID, header: header([attempt]) },
        ],
        filed,
      );
      expect(done).toMatchObject({ status: 'running', step: 0, speed, final: header([attempt]) });

      const { ticks, state } = playUntilChange(done, motion);
      expect(ticks).toBe(motion === 'reduced' ? 1 : lastStep(attempt));
      expect(state.status).toBe('pressed');
      if (state.status !== 'pressed') return;
      expect(state.build.attempts).toEqual([attempt]);
      expect(state.build.report).toEqual(header([attempt]).report);
    },
  );

  test('a failed attempt played to its end waits as repairing; the next attempt resumes at its own start', () => {
    const playing = reduce(filed, { type: 'ATTEMPT', requestId: ID, attempt: lost(1) });
    const end = playUntilChange(playing, 'full');
    expect(end.state.status).toBe('repairing');
    expect(end.ticks).toBe(lastStep(lost(1)) + 1);

    const resumed = reduce(end.state, { type: 'ATTEMPT', requestId: ID, attempt: lost(2) });
    expect(resumed).toMatchObject({ status: 'running', step: lastStep(lost(1)) + 1 });
  });

  test('done while repairing ends the session as exhausted on the next tick, never on done itself', () => {
    const repairing = playUntilChange(
      reduce(filed, { type: 'ATTEMPT', requestId: ID, attempt: lost(1) }),
      'full',
    ).state;
    const done = reduce(repairing, { type: 'DONE', requestId: ID, header: header([lost(1)]) });
    expect(done.status).toBe('running');
    const ended = reduce(done, tick());
    expect(ended).toMatchObject({ status: 'exhausted', build: { report: { pressed: false, attempts: 1 } } });
  });

  test('a pressed attempt without done keeps waiting at its last step', () => {
    const playing = reduce(filed, { type: 'ATTEMPT', requestId: ID, attempt: pressed(1) });
    let state = playing;
    for (let i = 0; i <= lastStep(pressed(1)) + 3; i += 1) state = reduce(state, tick());
    expect(state).toMatchObject({ status: 'running', step: lastStep(pressed(1)) });
  });
});
