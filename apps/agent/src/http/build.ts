import { BlueprintPartial, BuildHeader, Form, MAX_STREAM_BYTES, StreamEvent } from '@pending/contract';
import type { ApiError, Model } from '@pending/contract';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as z from 'zod';
import { REJECTED } from '../build/beats';
import { APP_REPAIRS, BuildInterrupted, runBuild } from '../build/loop';
import type { Infer } from '../models/ollama';
import type { Admission } from './limits';
import { BASE_HEADERS, apiError, fail } from './reply';

export type RouteLimits = {
  bodyBytes: number;
  pingMs: number;
  firstTokenMs: number;
  callMs: number;
  buildMs: number;
};

export type BuildRoute = {
  model: Model;
  system: string;
  promptVersion: string;
  // A model client per build, so its partials reach this build's stream and no other.
  infer: (onPartial: (partial: unknown) => void) => Infer;
  admit: (who: string, now: number) => Admission;
  limits: RouteLimits;
  now: () => Date;
};

class ModelFailure extends Error {
  constructor(
    readonly code: 'TIMEOUT' | 'MODEL_UNAVAILABLE',
    cause: unknown,
  ) {
    super(code, { cause });
  }
}

// Every model call gets a first-output limit and a whole-call limit; a call that throws for any other reason means the
// model is not responding.
function timed(open: BuildRoute['infer'], limits: RouteLimits, onPartial: (partial: unknown) => void): Infer {
  let heard = () => {};
  const infer = open((partial) => {
    heard();
    onPartial(partial);
  });
  return async (call, signal) => {
    const timeout = AbortSignal.timeout(limits.callMs);
    const silent = new AbortController();
    const first = setTimeout(() => silent.abort(), limits.firstTokenMs);
    heard = () => clearTimeout(first);
    try {
      return await infer(call, AbortSignal.any([signal, timeout, silent.signal]));
    } catch (error) {
      throw new ModelFailure(
        timeout.aborted || silent.signal.aborted ? 'TIMEOUT' : 'MODEL_UNAVAILABLE',
        error,
      );
    } finally {
      clearTimeout(first);
    }
  };
}

// Stops collecting at the limit, so an oversized body costs at most one chunk beyond it.
function readBody(req: IncomingMessage, max: number): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size <= max) return void chunks.push(chunk);
      req.off('data', onData);
      resolve(undefined);
    };
    req.on('data', onData);
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function invalidForm(error: z.ZodError, requestId: string): ApiError {
  const paradox = error.issues.some((i) => i.code === 'custom' && i.path[0] === 'forbidden');
  return apiError('INPUT_INVALID', requestId, paradox ? { message: REJECTED } : {});
}

// Only the blueprint of a design partial is forwarded, and only once it passes the bounded partial schema.
function partialOf(value: unknown): BlueprintPartial | undefined {
  if (typeof value !== 'object' || value === null || !('blueprint' in value)) return undefined;
  const parsed = BlueprintPartial.safeParse(value.blueprint);
  return parsed.success ? parsed.data : undefined;
}

// Lines said before the model has answered are held, so a model that never answers is still an HTTP 503 or 504.
const opening = (e: StreamEvent) =>
  e.type === 'line' && (e.line.beat === 'intake' || e.line.beat === 'designing');

export async function buildRoute(req: IncomingMessage, res: ServerResponse, who: string, route: BuildRoute) {
  const claimed = z.uuid().safeParse(req.headers['x-request-id']);
  if (!claimed.success)
    return fail(res, apiError('INPUT_INVALID', randomUUID(), { message: 'The request needs a request id.' }));
  const requestId = claimed.data;
  const body = await readBody(req, route.limits.bodyBytes);
  if (body === undefined)
    return fail(res, apiError('INPUT_INVALID', requestId, { message: 'The form is too large.' }), 413);
  const form = Form.safeParse(parseJson(body));
  if (!form.success) return fail(res, invalidForm(form.error, requestId));
  const admission = route.admit(who, Date.now());
  if (!admission.ok)
    return fail(res, apiError('RATE_LIMITED', requestId, { retryAfterSeconds: admission.retryAfterSeconds }));
  try {
    await stream(res, route, requestId, form.data);
  } finally {
    admission.release();
  }
}

async function stream(res: ServerResponse, route: BuildRoute, requestId: string, form: Form) {
  const client = new AbortController();
  // A cancel closes the socket; the build's signal reaches every model call.
  res.on('close', () => {
    if (!res.writableFinished) client.abort();
  });
  const deadline = AbortSignal.timeout(route.limits.buildMs);
  const held: StreamEvent[] = [];
  let ping: NodeJS.Timeout | undefined;
  let shown = '';
  const line = (event: StreamEvent) => `${JSON.stringify(event)}\n`;
  const ending = (code: 'MODEL_INVALID' | 'TIMEOUT' | 'MODEL_UNAVAILABLE' | 'UNKNOWN') =>
    ({ type: 'error', ...apiError(code, requestId) }) as const;
  // The client aborts a stream over MAX_STREAM_BYTES as MODEL_INVALID; the server stops first and keeps room to say so.
  const room =
    MAX_STREAM_BYTES -
    Math.max(
      ...(['MODEL_INVALID', 'TIMEOUT', 'MODEL_UNAVAILABLE', 'UNKNOWN'] as const).map((code) =>
        Buffer.byteLength(line(ending(code))),
      ),
    );
  const full = new AbortController();
  let written = 0;
  const write = (event: StreamEvent) => {
    const text = line(event);
    const size = Buffer.byteLength(text);
    if (event.type !== 'error' && (full.signal.aborted || written + size > room)) {
      full.abort();
      return;
    }
    written += size;
    res.write(text);
  };
  const send = (event: StreamEvent) => {
    if (client.signal.aborted) return; // cancelled: no event is written
    const parsed = StreamEvent.parse(event);
    // The contract maps a first-token timeout and an unavailable model to route statuses, which only exist before headers, so the stream and its pings start with the first model output.
    if (ping === undefined && opening(parsed)) return void held.push(parsed);
    if (ping === undefined) {
      res.writeHead(200, {
        ...BASE_HEADERS,
        'content-type': 'application/x-ndjson',
        'x-request-id': requestId,
      });
      held.splice(0).forEach(write);
      ping = setInterval(() => send({ type: 'ping', requestId }), route.limits.pingMs);
    }
    write(parsed);
  };

  try {
    const run = await runBuild({
      id: requestId.replaceAll('-', ''),
      form,
      system: route.system,
      promptVersion: route.promptVersion,
      model: route.model,
      repairs: APP_REPAIRS,
      // A cumulative stream repeats the blueprint while the memo grows; only a changed one is sent.
      infer: timed(route.infer, route.limits, (value) => {
        const blueprint = partialOf(value);
        if (blueprint === undefined || JSON.stringify(blueprint) === shown) return;
        shown = JSON.stringify(blueprint);
        send({ type: 'partial', requestId, blueprint });
      }),
      signal: AbortSignal.any([client.signal, deadline, full.signal]),
      now: route.now,
      emit: (event) => send({ ...event, requestId }),
    });
    if (run.end !== 'MODEL_INVALID') send({ type: 'done', requestId, header: BuildHeader.parse(run.build) });
    if (run.end === 'MODEL_INVALID' || full.signal.aborted) send(ending('MODEL_INVALID'));
  } catch (error) {
    if (client.signal.aborted) return;
    const cause = error instanceof BuildInterrupted ? error.cause : error;
    const code = full.signal.aborted
      ? 'MODEL_INVALID'
      : deadline.aborted
        ? 'TIMEOUT'
        : cause instanceof ModelFailure
          ? cause.code
          : 'UNKNOWN';
    // Codes and request ids only: an error may quote the form or a memo.
    if (code === 'UNKNOWN') console.error(`build ${requestId}: UNKNOWN`);
    if (ping === undefined) fail(res, apiError(code, requestId));
    else send(ending(code));
  } finally {
    clearInterval(ping);
    if (!res.writableEnded) res.end();
  }
}
