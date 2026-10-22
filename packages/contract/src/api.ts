import * as z from 'zod';
import { BlueprintPartial, Patch, range } from './blueprint';
import { Attempt, BuildHeader, Line, MAX_ATTEMPTS, Model, Version } from './build';

// Raw bytes, not characters; exceeding either is MODEL_INVALID (SECURITY-AND-FAILURE-CONTRACT section 3).
export const MAX_LINE_BYTES = 64 * 1024;
export const MAX_STREAM_BYTES = 512 * 1024;
export const MAX_IMPORT_BYTES = 512 * 1024;

export const ApiError = z.object({
  code: z.enum([
    'INPUT_INVALID',
    'RATE_LIMITED',
    'MODEL_UNAVAILABLE',
    'TIMEOUT',
    'MODEL_INVALID',
    'VOICE_UNAVAILABLE',
    'UNKNOWN',
  ]),
  message: z.string().max(300), // plain, no internals
  requestId: z.uuid(),
  retryable: z.boolean(),
  retryAfterSeconds: range(1, 3600).optional(),
});

const requestId = z.uuid();

export const StreamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('partial'), requestId, blueprint: BlueprintPartial }),
  z.object({ type: z.literal('line'), requestId, line: Line }),
  z.object({ type: z.literal('attempt'), requestId, attempt: Attempt }),
  z.object({ type: z.literal('patch'), requestId, n: range(2, MAX_ATTEMPTS), patch: Patch }),
  z.object({ type: z.literal('done'), requestId, header: BuildHeader }),
  ApiError.extend({ type: z.literal('error') }),
  z.object({ type: z.literal('ping'), requestId }),
]);

// GET /api/config; the client renders the inference copy from this field and nothing else.
export const Config = z.object({
  inference: z.enum(['this-machine', 'server', 'hosted']),
  model: Model,
  voice: z.object({ elevenlabs: z.boolean() }),
  telemetry: z.boolean(),
  repairs: range(0, MAX_ATTEMPTS - 1),
  contractVersion: Version,
  rulesVersion: Version,
});

export type ApiError = z.infer<typeof ApiError>;
export type StreamEvent = z.infer<typeof StreamEvent>;
export type Config = z.infer<typeof Config>;
