import {
  DesignReply,
  MAX_LINE_BYTES,
  RepairReply,
  designReplyJsonSchema,
  repairReplyJsonSchema,
} from '@pending/contract';
import type { Agent } from '@mastra/core/agent';
import * as z from 'zod';

// SECURITY-AND-FAILURE-CONTRACT section 4: 1,024 output tokens per call; the local call limit is a placeholder until
// the laptop measurement replaces it.
export const MAX_OUTPUT_TOKENS = 1024;
export const LOCAL_CALL_TIMEOUT_MS = 90_000;
// ARCHITECTURE section 4, model runtime: initial settings, measured in the eval rather than fixed.
export const SETTINGS = { temperature: 0.2, numCtx: 4096, numPredict: MAX_OUTPUT_TOKENS } as const;

export type CallKind = 'design' | 'repair';
export type Call = { kind: CallKind; system: string; prompt: string };
// Durations in ms; the server-side split exists only on the native API, which reports loading apart from inference.
export type Timing = {
  wallMs: number;
  firstChunkMs?: number;
  loadMs?: number;
  promptMs?: number;
  evalMs?: number;
  promptTokens?: number;
  evalTokens?: number;
  thinkingChars?: number; // present only if Ollama streamed thinking despite think off
};
// The value is unknown until the loop's zod parse: constrained decoding is not validation.
export type Reply = { value: unknown; timing: Timing };
export type Infer = (call: Call, signal: AbortSignal) => Promise<Reply>;

const nanos = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional();
const count = z.number().int().min(0).max(1_000_000).optional();
const Chunk = z.object({
  message: z
    .object({ content: z.string().max(MAX_LINE_BYTES), thinking: z.string().max(MAX_LINE_BYTES).optional() })
    .optional(),
  done: z.boolean(),
  error: z.string().max(500).optional(),
  load_duration: nanos,
  prompt_eval_duration: nanos,
  eval_duration: nanos,
  prompt_eval_count: count,
  eval_count: count,
});
type Chunk = z.infer<typeof Chunk>;

const ms = (ns: number | undefined): number | undefined => (ns === undefined ? undefined : ns / 1e6);
// A missing figure stays absent rather than becoming zero, so no unmeasured number enters a result.
const measured = (started: number, split: { [K in keyof Timing]?: number | undefined }): Timing => ({
  ...Object.fromEntries(Object.entries(split).filter(([, value]) => value !== undefined)),
  wallMs: performance.now() - started,
});
const jsonSchema = (kind: CallKind) => (kind === 'design' ? designReplyJsonSchema : repairReplyJsonSchema);

async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  let bytes = 0;
  for await (const piece of body) {
    bytes += piece.byteLength;
    if (bytes > MAX_LINE_BYTES * 8) throw new Error('the model reply exceeded the stream limit');
    buffer += decoder.decode(piece, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    yield* parts.filter((line) => line.trim() !== '');
  }
  if (buffer.trim() !== '') yield buffer;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text; // the loop's schema parse reports it like any other invalid reply
  }
}

// Ollama's native chat API: the only route that takes think, num_ctx and num_predict and reports load time apart.
export const ollamaInfer =
  (url: string, model: string): Infer =>
  async (call, signal) => {
    const started = performance.now();
    const res = await fetch(new URL('/api/chat', url), {
      method: 'POST',
      signal: AbortSignal.any([signal, AbortSignal.timeout(LOCAL_CALL_TIMEOUT_MS)]),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        think: false,
        format: jsonSchema(call.kind),
        options: {
          temperature: SETTINGS.temperature,
          num_ctx: SETTINGS.numCtx,
          num_predict: SETTINGS.numPredict,
        },
        messages: [
          { role: 'system', content: call.system },
          { role: 'user', content: call.prompt },
        ],
      }),
    });
    if (!res.ok || res.body === null) throw new Error(`ollama answered ${res.status}`);
    let content = '';
    let thinking = 0;
    let firstChunkMs: number | undefined;
    let last: Chunk | undefined;
    // Leaving this loop on a throw cancels the body, which closes the request; a timeout aborts it through the signal.
    for await (const line of lines(res.body)) {
      const chunk = Chunk.parse(JSON.parse(line));
      if (chunk.error !== undefined) throw new Error('ollama reported an error');
      firstChunkMs ??= performance.now() - started;
      content += chunk.message?.content ?? '';
      thinking += chunk.message?.thinking?.length ?? 0;
      if (content.length > MAX_LINE_BYTES) throw new Error('the model reply exceeded the line limit');
      last = chunk;
    }
    if (last?.done !== true) throw new Error('the ollama stream ended before done');
    const timing = measured(started, {
      firstChunkMs,
      loadMs: ms(last.load_duration),
      promptMs: ms(last.prompt_eval_duration),
      evalMs: ms(last.eval_duration),
      promptTokens: last.prompt_eval_count,
      evalTokens: last.eval_count,
      thinkingChars: thinking > 0 ? thinking : undefined,
    });
    return { value: parseJson(content), timing };
  };

const CompatRequest = z.object({
  reasoning_effort: z.string().max(20).optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().int().optional(),
  response_format: z
    .object({
      type: z.string().max(20),
      json_schema: z.object({ schema: z.unknown() }).optional(),
    })
    .optional(),
});

// Key order and the $schema dialect tag do not change what a schema constrains, so neither counts as a difference.
function canonical(value: unknown): string {
  return JSON.stringify(value, (key, v: unknown) =>
    key === '$schema'
      ? undefined
      : typeof v === 'object' && v !== null && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
        : v,
  );
}

// What Mastra put on the wire to Ollama's OpenAI-compatible route: think off, the derived schema, the settings.
export function inspectCompatRequest(raw: string, kind: CallKind) {
  const body = CompatRequest.parse(JSON.parse(raw));
  const schema = body.response_format?.json_schema?.schema;
  return {
    reasoningEffort: body.reasoning_effort ?? null,
    temperature: body.temperature ?? null,
    maxTokens: body.max_tokens ?? null,
    responseFormat: body.response_format?.type ?? null,
    schemaSent: schema !== undefined,
    schemaEqualsDerived: canonical(schema) === canonical(jsonSchema(kind)),
    schema: schema ?? null,
  };
}

// The documented Mastra loop (ARCHITECTURE section 4), behind the same interface, so the spike can compare the two.
export const mastraInfer =
  (agent: Agent, onPartial: (partial: unknown) => void): Infer =>
  async (call, signal) => {
    const started = performance.now();
    const abortSignal = AbortSignal.any([signal, AbortSignal.timeout(LOCAL_CALL_TIMEOUT_MS)]);
    const options = {
      instructions: call.system,
      abortSignal,
      tracingOptions: { hideInput: true, hideOutput: true },
      modelSettings: { temperature: SETTINGS.temperature, maxOutputTokens: SETTINGS.numPredict },
      // Ollama's OpenAI-compatible route maps reasoning_effort none to think off; the spike checks that it arrives.
      providerOptions: { ollama: { reasoningEffort: 'none' } },
    } as const;
    const stream =
      call.kind === 'design'
        ? await agent.stream(call.prompt, {
            ...options,
            structuredOutput: { schema: DesignReply, errorStrategy: 'strict' },
          })
        : await agent.stream(call.prompt, {
            ...options,
            structuredOutput: { schema: RepairReply, errorStrategy: 'strict' },
          });
    let firstChunkMs: number | undefined;
    try {
      for await (const partial of stream.objectStream) {
        firstChunkMs ??= performance.now() - started;
        onPartial(partial);
      }
      const value: unknown = await stream.object;
      return { value, timing: measured(started, { firstChunkMs }) };
    } catch (error) {
      // Strict mode throws on an invalid object; the loop needs that reply to re-ask, so the raw text goes back to it.
      // A cancelled, timed-out or empty call stays an error and is never re-asked.
      const text = abortSignal.aborted ? '' : await stream.text.catch(() => '');
      if (text.trim() === '') throw error;
      return { value: parseJson(text), timing: measured(started, { firstChunkMs }) };
    }
  };
