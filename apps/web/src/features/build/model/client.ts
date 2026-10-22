import { ApiError, MAX_LINE_BYTES, MAX_STREAM_BYTES, StreamEvent } from '@pending/contract';
import type { Attempt, Form, Report } from '@pending/contract';
import { report } from '@pending/machine';
import { assertNever } from '../../../shared/assertNever';
import { appError } from './errors';
import type { SessionEvent } from './session';

const NEWLINE = 0x0a;

class Oversized extends Error {}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const sameReport = (a: Report, b: Report) =>
  a.attempts === b.attempts &&
  a.parts === b.parts &&
  a.pressed === b.pressed &&
  a.failedAt === b.failedAt &&
  a.verdict === b.verdict;

// Splits on the newline byte and counts raw bytes, never characters; a byte 0x0A never sits inside a UTF-8 sequence,
// and the streaming decoder carries a character split across chunks into the next line segment.
async function readLines(
  body: ReadableStream<Uint8Array>,
  onLine: (text: string) => boolean,
): Promise<boolean> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let streamed = 0;
  let lineBytes = 0;
  let text = '';
  const take = (bytes: Uint8Array) => {
    lineBytes += bytes.byteLength;
    if (lineBytes > MAX_LINE_BYTES) throw new Oversized();
    text += decoder.decode(bytes, { stream: true });
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      streamed += value.byteLength;
      if (streamed > MAX_STREAM_BYTES) throw new Oversized();
      let start = 0;
      for (let nl = value.indexOf(NEWLINE); nl !== -1; nl = value.indexOf(NEWLINE, start)) {
        take(value.subarray(start, nl));
        if (onLine(text)) return true;
        text = '';
        lineBytes = 0;
        start = nl + 1;
      }
      take(value.subarray(start));
    }
    text += decoder.decode();
    return text.trim() !== '' && onLine(text);
  } finally {
    // Closing the body on every exit aborts an oversized or already-ended response.
    void reader.cancel().catch(() => {});
  }
}

// POST /api/build. Dispatches exactly one ending: DONE, FAIL or CANCEL (SECURITY-AND-FAILURE-CONTRACT section 3).
export async function streamBuild(
  form: Form,
  requestId: string,
  signal: AbortSignal,
  dispatch: (event: SessionEvent) => void,
): Promise<void> {
  const fail = (code: Parameters<typeof appError>[0]) =>
    dispatch({ type: 'FAIL', requestId, error: appError(code, requestId) });
  const attempts: Attempt[] = [];

  // Returns true once a terminal event has been dispatched; malformed and foreign lines are dropped.
  const onEvent = (text: string): boolean => {
    const parsed = StreamEvent.safeParse(parseJson(text));
    if (!parsed.success || parsed.data.requestId !== requestId) return false;
    const event = parsed.data;
    switch (event.type) {
      case 'partial':
        dispatch({ type: 'PARTIAL', requestId, partial: event.blueprint });
        return false;
      case 'line':
        dispatch({ type: 'LINE', requestId, line: event.line });
        return false;
      case 'attempt':
        // Attempts arrive numbered 1, 2, 3...; a skipped or repeated number would let the report check and the
        // reducer's record diverge, so the stream is refused instead.
        if (event.attempt.n !== attempts.length + 1) {
          fail('UNKNOWN');
          return true;
        }
        attempts.push(event.attempt);
        dispatch({ type: 'ATTEMPT', requestId, attempt: event.attempt });
        return false;
      case 'patch':
        dispatch({ type: 'PATCH', requestId, n: event.n, patch: event.patch });
        return false;
      case 'ping':
        return false;
      case 'done':
        // The report is recomputed from the attempts received; a header that disagrees is not trusted.
        if (attempts.length === 0 || !sameReport(report(attempts), event.header.report)) fail('UNKNOWN');
        else dispatch({ type: 'DONE', requestId, header: event.header });
        return true;
      case 'error':
        // Re-parsing the already valid event strips its type tag.
        dispatch({ type: 'FAIL', requestId, error: ApiError.parse(event) });
        return true;
      default:
        return assertNever(event);
    }
  };

  let response: Response;
  try {
    response = await fetch('/api/build', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': requestId },
      body: JSON.stringify(form),
      signal,
    });
  } catch {
    return signal.aborted ? dispatch({ type: 'CANCEL', requestId }) : fail('NETWORK');
  }
  if (response.body === null) return fail('UNKNOWN');
  try {
    if (!response.ok) {
      let error = appError('UNKNOWN', requestId);
      await readLines(response.body, (text) => {
        const parsed = ApiError.safeParse(parseJson(text));
        if (parsed.success) error = { ...parsed.data, requestId };
        return true;
      });
      return dispatch({ type: 'FAIL', requestId, error });
    }
    if (!(await readLines(response.body, onEvent))) fail('INTERRUPTED');
  } catch (error) {
    if (signal.aborted) dispatch({ type: 'CANCEL', requestId });
    else fail(error instanceof Oversized ? 'MODEL_INVALID' : 'INTERRUPTED');
  }
}
