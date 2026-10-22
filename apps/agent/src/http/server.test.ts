import {
  ApiError,
  Blueprint,
  CONTRACT_VERSION,
  Config,
  MAX_STREAM_BYTES,
  Patch,
  StreamEvent,
} from '@pending/contract';
import type { Line } from '@pending/contract';
import { RULES_VERSION } from '@pending/machine';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { expect, onTestFinished, test, vi } from 'vitest';
import lostBlueprint from '../../../../packages/machine/fixtures/lost/blueprint.json';
import lostForm from '../../../../packages/machine/fixtures/lost/form.json';
import pressedBlueprint from '../../../../packages/machine/fixtures/pressed/blueprint.json';
import repairedPatch from '../../../../packages/machine/fixtures/repaired/patch.json';
import { REJECTED, cloudEligible } from '../build/beats';
import { parseEnv } from '../env';
import type { Call, Infer } from '../models/ollama';
import { inference } from './config';
import { LIMITS, limiter } from './limits';
import { agentServer, healthz } from './server';
import type { AgentDeps } from './server';

type Model = AgentDeps['infer'];

const LOCAL = { INFERENCE_MODE: 'local', WEB_ORIGIN: 'http://localhost:5173' };
const title = 'Scenic Route Deluxe';
const designMemo = 'More catapult.';
const repairMemo = 'Less catapult.';

async function start(infer: Model, env: Record<string, string> = {}, limits: AgentDeps['limits'] = {}) {
  const server = agentServer({
    env: parseEnv({ ...LOCAL, ...env }),
    model: { mode: 'local', id: 'gemma4:e2b', host: 'ollama' },
    system: 'instructions',
    promptVersion: 'v2',
    infer,
    limits,
    now: () => new Date('2026-10-22T12:00:00.000Z'),
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  onTestFinished(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the server has no port');
  return `http://127.0.0.1:${address.port}`;
}

const post = (
  url: string,
  body: unknown,
  init: { id?: string; headers?: Record<string, string>; signal?: AbortSignal } = {},
) =>
  fetch(`${url}/api/build`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': init.id ?? randomUUID(), ...init.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...(init.signal === undefined ? {} : { signal: init.signal }),
  });

const read = async (res: Response) =>
  (await res.text())
    .split('\n')
    .filter((l) => l !== '')
    .map((l): StreamEvent => StreamEvent.parse(JSON.parse(l)));

// Answers in order, offering the partials before the design reply, and keeps every call and its signal.
function scripted(replies: unknown[], partials: unknown[] = []) {
  const calls: Call[] = [];
  const model: Model = (onPartial) => async (call) => {
    calls.push(call);
    if (call.kind === 'design') partials.forEach(onPartial);
    const value = replies.shift();
    if (value === undefined) throw new Error('no scripted reply left');
    return { value, timing: { wallMs: 1 } };
  };
  return { model, calls };
}

const pressing: Model = () => async () => ({
  value: { blueprint: Blueprint.parse(pressedBlueprint), memo: designMemo },
  timing: { wallMs: 1 },
});

// Never answers; it reports the signal it was given and rejects only when that signal aborts.
function hanging() {
  let report: (signal: AbortSignal) => void = () => undefined;
  const called = new Promise<AbortSignal>((resolve) => {
    report = resolve;
  });
  const infer: Infer = (_, signal) => {
    report(signal);
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  };
  return { model: (() => infer) satisfies Model, called };
}

const said = (line: Line) =>
  `${line.at.attempt}.${line.at.step} ${line.beat} ${line.mood} ${line.source}: ${line.text}`;
const transcript = (events: StreamEvent[]) =>
  events.map((e) => {
    switch (e.type) {
      case 'line':
        return `line ${said(e.line)}`;
      case 'attempt':
        return `attempt ${e.attempt.n} ${e.attempt.outcome}`;
      case 'patch':
        return `patch ${e.n}`;
      case 'partial':
        return `partial ${JSON.stringify(e.blueprint)}`;
      case 'done':
        return `done pressed=${e.header.report.pressed} attempts=${e.header.report.attempts}`;
      case 'error':
        return `error ${e.code}`;
      case 'ping':
        return 'ping';
    }
  });

test('golden stream: a lost design, one repair, pressed', async () => {
  const lost = { ...Blueprint.parse(lostBlueprint), title };
  const { model } = scripted(
    [
      { blueprint: lost, memo: designMemo },
      { patch: Patch.parse(repairedPatch), memo: repairMemo },
    ],
    [
      { blueprint: { title: 'Scenic' } },
      { blueprint: { title, parts: [{ kind: 'conveyor', cell: 'A2', colour: 'red' }] }, memo: 'Mo' },
      { blueprint: { title, parts: [{ kind: 'conveyor', cell: 'A2' }] }, memo: 'More' },
      { blueprint: { title: 'x'.repeat(41) } },
    ],
  );
  const url = await start(model);
  const id = randomUUID();
  const res = await post(url, lostForm, { id });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('application/x-ndjson');
  expect(res.headers.get('x-request-id')).toBe(id);
  const events = await read(res);

  expect(transcript(events)).toEqual([
    'line 1.0 intake slow table: Form 27B/6 received. Stamped, filed, placed on top of the other forms. This will take some time.',
    'line 1.0 designing slow table: Drafting. Please do not rush the Department.',
    'partial {"title":"Scenic"}',
    'partial {"title":"Scenic Route Deluxe","parts":[{"kind":"conveyor","cell":"A2"}]}',
    'line 1.0 designed slow model: More catapult.',
    'line 1.0 designed slow table: Blueprint 1: “Scenic Route Deluxe”. 4 components for one button. Proportionate.',
    'attempt 1 lost',
    'line 1.0 running slow table: Commencing trial 1.',
    'line 1.5 handoff excited table: Contact! Enter it in the minutes at once!',
    'line 1.11 failed deadpan table: Finding: the ball left the premises at L3.',
    'line 1.11 failed deadpan table: The catapult has demonstrated considerable enthusiasm. Unfortunately, very little accuracy.',
    'line 1.11 failed deadpan table: A correction will be issued.',
    'line 1.11 cameo deadpan table: This is why we employ snails.',
    'patch 2',
    'line 2.0 repaired slow model: Less catapult.',
    'line 2.0 repaired slow table: Correction 1: removed catapult at I5.',
    'line 2.0 repaired slow table: A repair has been submitted. Optimism remains strictly provisional.',
    'attempt 2 pressed',
    'line 2.0 running slow table: Commencing trial 2.',
    'line 2.5 handoff excited table: Contact! Enter it in the minutes at once!',
    'line 2.15 pressed excited table: WE DID IT! Please inform the entire Department.',
    'line 2.15 pressed deadpan table: The Department acknowledges this development.',
    'line 2.15 pressed deadpan table: One button. An extraordinary amount of paperwork.',
    'done pressed=true attempts=2',
  ]);
  expect(events.every((e) => e.requestId === id)).toBe(true);
  expect(events.filter((e) => e.type === 'done' || e.type === 'error')).toHaveLength(1);
  const lines = events.flatMap((e) => (e.type === 'line' ? [e.line] : []));
  expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  for (const line of lines.filter(cloudEligible)) {
    for (const modelText of [title, designMemo, repairMemo]) expect(line.text).not.toContain(modelText);
  }
});

test('a client abort cancels the model call and frees the build slot', async () => {
  const { model: hang, called } = hanging();
  let builds = 0;
  const url = await start((onPartial) => (builds++ === 0 ? hang() : pressing(onPartial)));
  const client = new AbortController();
  const first = post(url, lostForm, { signal: client.signal }).catch((error: unknown) => error);
  const signal = await called;
  expect(signal.aborted).toBe(false);
  client.abort();
  expect(await first).toBeInstanceOf(Error);
  if (!signal.aborted) await once(signal, 'abort');
  expect(signal.aborted).toBe(true);
  await vi.waitFor(async () => expect((await post(url, lostForm)).status).toBe(200));
});

test('a reply that fails the schema is re-asked once, then the stream ends in MODEL_INVALID', async () => {
  const { model, calls } = scripted(['not json at all', { memo: designMemo }]);
  const url = await start(model);
  const events = await read(await post(url, lostForm));
  expect(transcript(events).slice(2)).toEqual(['error MODEL_INVALID']);
  expect(calls).toHaveLength(2);
  expect(calls[1]?.prompt).toContain('did not match the required shape');
});

test('limits before the stream: 413 for a large body, 400 in character for a paradox', async () => {
  const url = await start(pressing);
  const large = await post(url, { ...lostForm, padding: 'x'.repeat(5000) });
  expect(large.status).toBe(413);
  expect(ApiError.parse(await large.json())).toMatchObject({ code: 'INPUT_INVALID', retryable: false });
  const paradox = await post(url, { ...lostForm, required: 'fan', forbidden: 'fan' });
  expect(paradox.status).toBe(400);
  expect(ApiError.parse(await paradox.json()).message).toBe(REJECTED);
});

test('a model that never answers is 504, one that fails is 503, and no stream starts', async () => {
  const { model } = hanging();
  const slow = await post(await start(model, {}, { callMs: 50 }), lostForm);
  expect(slow.status).toBe(504);
  expect(ApiError.parse(await slow.json())).toMatchObject({ code: 'TIMEOUT', retryable: true });
  const down = await post(
    await start(() => async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
    }),
    lostForm,
  );
  expect(down.status).toBe(503);
  expect(ApiError.parse(await down.json())).toMatchObject({ code: 'MODEL_UNAVAILABLE', retryable: true });
});

test('a model silent past the first-output limit is 504; one that speaks in time may finish later', async () => {
  const { model } = hanging();
  const silent = await post(await start(model, {}, { firstTokenMs: 50 }), lostForm);
  expect(silent.status).toBe(504);
  expect(ApiError.parse(await silent.json())).toMatchObject({ code: 'TIMEOUT', retryable: true });
  const speaking: Model = (onPartial) => async (call, signal) => {
    onPartial({ memo: 'M' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return pressing(onPartial)(call, signal);
  };
  const res = await post(await start(speaking, {}, { firstTokenMs: 50 }), lostForm);
  expect(res.status).toBe(200);
  expect(transcript(await read(res)).at(-1)).toBe('done pressed=true attempts=1');
});

test('a cumulative partial stream sends each blueprint once and stays within the stream limit', async () => {
  const partial = { title, parts: [{ kind: 'conveyor', cell: 'A2' }] };
  const snapshots = Array.from({ length: 1024 }, (_, n) => ({
    blueprint: partial,
    memo: 'M'.repeat(n % 160),
  }));
  const { model } = scripted([{ blueprint: Blueprint.parse(pressedBlueprint), memo: designMemo }], snapshots);
  const text = await (await post(await start(model), lostForm)).text();
  expect(Buffer.byteLength(text)).toBeLessThan(MAX_STREAM_BYTES);
  const events = text
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => StreamEvent.parse(JSON.parse(l)));
  expect(events.filter((e) => e.type === 'partial')).toHaveLength(1);
});

test('a stream that would pass the byte limit ends in MODEL_INVALID within it', async () => {
  const parts = Array.from({ length: 14 }, () => ({ kind: 'conveyor', cell: 'A2' }));
  const snapshots = Array.from({ length: 4000 }, (_, n) => ({
    blueprint: { title: String(n).padStart(40, 'x'), parts },
  }));
  const { model } = scripted([{ blueprint: Blueprint.parse(pressedBlueprint), memo: designMemo }], snapshots);
  const text = await (await post(await start(model), lostForm)).text();
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(MAX_STREAM_BYTES);
  const events = text
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => StreamEvent.parse(JSON.parse(l)));
  expect(events.filter((e) => e.type === 'done' || e.type === 'error').map((e) => e.type)).toEqual(['error']);
  expect(transcript(events).at(-1)).toBe('error MODEL_INVALID');
});

test('the eleventh build in ten minutes is 429 with Retry-After', async () => {
  const url = await start(pressing);
  for (let n = 0; n < 10; n += 1) expect((await post(url, lostForm)).status).toBe(200);
  const limited = await post(url, lostForm);
  expect(limited.status).toBe(429);
  const error = ApiError.parse(await limited.json());
  expect(error).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
  expect(Number(limited.headers.get('retry-after'))).toBe(error.retryAfterSeconds);
  expect(error.retryAfterSeconds).toBeGreaterThan(0);
  expect(error.retryAfterSeconds).toBeLessThanOrEqual(600);
});

test('one build per identity, and MAX_CONCURRENT_BUILDS in all; a busy rejection is 429 with Retry-After 30', async () => {
  const { model, called } = hanging();
  const url = await start(model, { IDENTITY_HEADER: 'x-test-identity', MAX_CONCURRENT_BUILDS: '1' });
  const client = new AbortController();
  const as = (who: string) => ({ headers: { 'x-test-identity': who } });
  const first = post(url, lostForm, { ...as('a'), signal: client.signal }).catch((error: unknown) => error);
  await called;
  const same = await post(url, lostForm, as('a'));
  const other = await post(url, lostForm, as('b'));
  for (const busy of [same, other]) {
    expect(busy.status).toBe(429);
    expect(busy.headers.get('retry-after')).toBe('30');
    expect(ApiError.parse(await busy.json())).toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
      retryAfterSeconds: 30,
    });
  }
  client.abort();
  await first;
});

test('an admit drops every identity whose newest start left the window', () => {
  const admit = limiter(2, LIMITS.buildsPerWindow, LIMITS.windowMs);
  expect(admit('a', 0).ok).toBe(true);
  expect(admit('b', 0).ok).toBe(true);
  expect(admit.tracked()).toBe(2);
  // Both builds still hold their slots, so this admit is refused and records nothing of its own.
  expect(admit('c', LIMITS.windowMs + 1).ok).toBe(false);
  expect(admit.tracked()).toBe(0);
});

test('GET /api/config answers from the server, and /healthz is up', async () => {
  const url = await start(pressing);
  const config = Config.parse(await (await fetch(`${url}/api/config`)).json());
  expect(config).toEqual({
    inference: 'this-machine',
    model: { mode: 'local', id: 'gemma4:e2b', host: 'ollama' },
    voice: { elevenlabs: false },
    telemetry: false,
    repairs: 2,
    contractVersion: CONTRACT_VERSION,
    rulesVersion: RULES_VERSION,
  });
  const health = await fetch(`${url}/healthz`);
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual(healthz());
});

test('CORS answers WEB_ORIGIN only, never a wildcard or credentials', async () => {
  const url = await start(pressing);
  const preflight = (origin: string) =>
    fetch(`${url}/api/build`, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, x-request-id',
      },
    });
  const allowed = await preflight(LOCAL.WEB_ORIGIN);
  expect(allowed.status).toBe(204);
  expect(allowed.headers.get('access-control-allow-origin')).toBe(LOCAL.WEB_ORIGIN);
  expect(allowed.headers.get('access-control-allow-headers')).toContain('x-request-id');
  expect(allowed.headers.get('access-control-allow-credentials')).toBeNull();
  const refused = await preflight('https://elsewhere.example');
  expect(refused.status).toBe(403);
  expect(refused.headers.get('access-control-allow-origin')).toBeNull();

  const config = await fetch(`${url}/api/config`, { headers: { origin: LOCAL.WEB_ORIGIN } });
  expect(config.headers.get('access-control-allow-origin')).toBe(LOCAL.WEB_ORIGIN);
  const other = await fetch(`${url}/api/config`, { headers: { origin: 'https://elsewhere.example' } });
  expect(other.headers.get('access-control-allow-origin')).toBeNull();
  const build = await post(url, lostForm, { headers: { origin: LOCAL.WEB_ORIGIN } });
  expect(build.headers.get('access-control-expose-headers')).toContain('x-request-id');
  await build.text();
});

test('inference is this-machine only for a loopback Ollama asked from a loopback caller', () => {
  const local = parseEnv(LOCAL);
  const remoteOllama = parseEnv({ ...LOCAL, OLLAMA_URL: 'http://gpu-box:11434' });
  const hosted = parseEnv({ ...LOCAL, INFERENCE_MODE: 'hosted', OPENROUTER_API_KEY: 'k' });
  expect(inference(local, '127.0.0.1')).toBe('this-machine');
  expect(inference(local, '::ffff:127.0.0.1')).toBe('this-machine');
  expect(inference(local, '192.168.1.20')).toBe('server');
  expect(inference(remoteOllama, '127.0.0.1')).toBe('server');
  expect(inference(parseEnv({ ...LOCAL, OLLAMA_URL: 'http://127.example.com:11434' }), '127.0.0.1')).toBe(
    'server',
  );
  expect(inference(parseEnv({ ...LOCAL, OLLAMA_URL: 'http://[::1]:11434' }), '::1')).toBe('this-machine');
  expect(inference(hosted, '127.0.0.1')).toBe('hosted');
});
