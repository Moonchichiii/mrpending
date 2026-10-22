import { MAX_LINE_BYTES, MAX_STREAM_BYTES } from '@pending/contract';
import type { StreamEvent } from '@pending/contract';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { streamBuild } from './client';
import { IDLE, reduce } from './session';
import type { SessionEvent } from './session';
import { form, header, lost, pressed } from './testBuild';

const ID = '00000000-0000-4000-8000-000000000001';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const bytes = (text: string) => new TextEncoder().encode(text);
const ndjson = (events: StreamEvent[]) => events.map((e) => `${JSON.stringify(e)}\n`).join('');

// Serves the given byte chunks as the NDJSON body, each chunk delivered separately.
function serve(chunks: Uint8Array[]) {
  server.use(
    http.post('*/api/build', () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      });
      return new HttpResponse(body, { headers: { 'content-type': 'application/x-ndjson' } });
    }),
  );
}

async function build(signal = new AbortController().signal) {
  const events: SessionEvent[] = [];
  await streamBuild(form, ID, signal, (event) => events.push(event));
  return events;
}

const types = (events: SessionEvent[]) => events.map((e) => e.type);
const failure = (events: SessionEvent[]) => {
  const last = events.at(-1);
  return last?.type === 'FAIL' ? last.error.code : undefined;
};

describe('decoding', () => {
  test('a multibyte character split across chunks is decoded intact', async () => {
    const text = 'Proportionate. 🐌 Naturally. ü';
    const line = bytes(
      ndjson([
        {
          type: 'line',
          requestId: ID,
          line: {
            id: 'l1',
            beat: 'intake',
            mood: 'slow',
            text,
            source: 'table',
            at: { attempt: 1, step: 0 },
          },
        },
      ]),
    );
    const snail = line.indexOf(0xf0);
    serve([line.subarray(0, snail + 2), line.subarray(snail + 2)]);
    const [event] = await build();
    expect(event).toMatchObject({ type: 'LINE', line: { text } });
  });

  test('malformed and foreign lines are dropped; what parses still arrives', async () => {
    const other = '00000000-0000-4000-8000-000000000009';
    serve([
      bytes('{"type":"partial","requestId":"' + ID + '","blueprint":{"parts":[{"cell":"Z9"}]}}\n'),
      bytes('not json\n'),
      bytes(ndjson([{ type: 'partial', requestId: other, blueprint: { title: 'Someone else' } }])),
      bytes(
        ndjson([{ type: 'partial', requestId: ID, blueprint: { title: 'Ours', parts: [{ kind: 'fan' }] } }]),
      ),
    ]);
    const events = await build();
    expect(events[0]).toEqual({
      type: 'PARTIAL',
      requestId: ID,
      partial: { title: 'Ours', parts: [{ kind: 'fan' }] },
    });
    expect(failure(events)).toBe('INTERRUPTED');
  });
});

describe('limits', () => {
  test('a line over 64 KB is MODEL_INVALID, counted in bytes', async () => {
    // Under the limit in characters, over it in bytes: four-byte characters.
    const text = '🐌'.repeat(MAX_LINE_BYTES / 4 + 1);
    expect(text.length).toBeLessThan(MAX_LINE_BYTES);
    serve([bytes(`{"type":"ping","requestId":"${ID}","pad":"${text}"}\n`)]);
    expect(failure(await build())).toBe('MODEL_INVALID');
  });

  test('a stream over 512 KB is MODEL_INVALID even when every line is small', async () => {
    const ping = bytes(ndjson([{ type: 'ping', requestId: ID }]));
    serve(Array.from({ length: Math.ceil(MAX_STREAM_BYTES / ping.byteLength) + 1 }, () => ping));
    expect(failure(await build())).toBe('MODEL_INVALID');
  });
});

describe('endings', () => {
  test('a stream that ends without a terminal event is INTERRUPTED, after the attempts it delivered', async () => {
    serve([bytes(ndjson([{ type: 'attempt', requestId: ID, attempt: lost(1) }]))]);
    const events = await build();
    expect(types(events)).toEqual(['ATTEMPT', 'FAIL']);
    expect(failure(events)).toBe('INTERRUPTED');
  });

  test('done arrives as DONE when its report matches the attempts received', async () => {
    const attempts = [lost(1), pressed(2)];
    serve([
      bytes(
        ndjson([
          ...attempts.map((attempt): StreamEvent => ({ type: 'attempt', requestId: ID, attempt })),
          { type: 'done', requestId: ID, header: header(attempts) },
        ]),
      ),
    ]);
    expect(types(await build())).toEqual(['ATTEMPT', 'ATTEMPT', 'DONE']);
  });

  test.each([
    ['skipped', [lost(2)]],
    ['repeated', [lost(1), lost(1)]],
  ])('a %s attempt number fails the build instead of leaving the session stuck', async (_, attempts) => {
    serve([
      bytes(
        ndjson([
          ...attempts.map((attempt): StreamEvent => ({ type: 'attempt', requestId: ID, attempt })),
          { type: 'done', requestId: ID, header: header(attempts) },
        ]),
      ),
    ]);
    const events = await build();
    expect(failure(events)).toBe('UNKNOWN');
    // Fed through the reducer, the stream ends in error with only the attempts it accepted.
    const session = events.reduce(reduce, reduce(IDLE, { type: 'FILE', requestId: ID, form, startedAt: 0 }));
    expect(session).toMatchObject({
      status: 'error',
      attempts: attempts.slice(0, attempts[0]?.n === 1 ? 1 : 0),
    });
  });

  test('a done header whose report disagrees with the attempts is UNKNOWN', async () => {
    serve([
      bytes(
        ndjson([
          { type: 'attempt', requestId: ID, attempt: lost(1) },
          { type: 'done', requestId: ID, header: header([pressed(1)]) },
        ]),
      ),
    ]);
    expect(failure(await build())).toBe('UNKNOWN');
  });

  test('an error event becomes FAIL with its code', async () => {
    serve([
      bytes(
        ndjson([
          { type: 'error', requestId: ID, code: 'MODEL_INVALID', message: 'Invalid twice.', retryable: true },
        ]),
      ),
    ]);
    expect(failure(await build())).toBe('MODEL_INVALID');
  });

  test('a user abort mid-stream is CANCEL, not an error', async () => {
    // A stub, because MSW's socket emulation trips an undici assertion on abort; like fetch, abort errors the body.
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(
            bytes(
              ndjson([
                {
                  type: 'line',
                  requestId: ID,
                  line: {
                    id: 'l1',
                    beat: 'intake',
                    mood: 'slow',
                    text: 'Filed.',
                    source: 'table',
                    at: { attempt: 1, step: 0 },
                  },
                },
              ]),
            ),
          );
          init.signal?.addEventListener('abort', () =>
            stream.error(new DOMException('aborted', 'AbortError')),
          );
        },
      });
      return Promise.resolve(new Response(body));
    });
    const controller = new AbortController();
    const events: SessionEvent[] = [];
    await streamBuild(form, ID, controller.signal, (event) => {
      events.push(event);
      if (event.type === 'LINE') controller.abort();
    });
    vi.unstubAllGlobals();
    expect(types(events)).toEqual(['LINE', 'CANCEL']);
  });

  test('an unreachable server is NETWORK', async () => {
    server.use(http.post('*/api/build', () => HttpResponse.error()));
    expect(failure(await build())).toBe('NETWORK');
  });

  test('an HTTP error before the stream carries the server code', async () => {
    server.use(
      http.post('*/api/build', () =>
        HttpResponse.json(
          {
            code: 'RATE_LIMITED',
            message: 'Too many.',
            requestId: ID,
            retryable: true,
            retryAfterSeconds: 30,
          },
          { status: 429 },
        ),
      ),
    );
    const events = await build();
    expect(events.at(-1)).toMatchObject({
      type: 'FAIL',
      error: { code: 'RATE_LIMITED', retryAfterSeconds: 30 },
    });
  });
});
