import { ApiError } from '@pending/contract';
import type { ServerResponse } from 'node:http';

type Code = ApiError['code'];

// Plain sentences, no internals (SECURITY-AND-FAILURE-CONTRACT section 2); the web copy table words them for people.
const MESSAGES: Record<Code, string> = {
  INPUT_INVALID: 'The form is not valid.',
  RATE_LIMITED: 'Too many builds. Try again later.',
  MODEL_UNAVAILABLE: 'The model is not responding. Try again.',
  TIMEOUT: 'The model took too long. Try again.',
  MODEL_INVALID: 'The model replied in the wrong shape twice. Build again.',
  VOICE_UNAVAILABLE: 'The voice service is unavailable.',
  UNKNOWN: 'Something went wrong. Try again.',
};

const STATUS: Record<Code, number> = {
  INPUT_INVALID: 400,
  RATE_LIMITED: 429,
  MODEL_UNAVAILABLE: 503,
  TIMEOUT: 504,
  MODEL_INVALID: 502,
  VOICE_UNAVAILABLE: 502,
  UNKNOWN: 500,
};

export const apiError = (
  code: Code,
  requestId: string,
  extra: { message?: string; retryAfterSeconds?: number } = {},
): ApiError =>
  ApiError.parse({
    code,
    message: extra.message ?? MESSAGES[code],
    requestId,
    retryable: code !== 'INPUT_INVALID',
    ...(extra.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: extra.retryAfterSeconds }),
  });

export const BASE_HEADERS = { 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' } as const;

export function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { ...BASE_HEADERS, 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

// An error before the stream starts is an HTTP status with the ApiError as its body.
export function fail(res: ServerResponse, error: ApiError, status = STATUS[error.code]) {
  const retry =
    error.retryAfterSeconds === undefined ? {} : { 'retry-after': String(error.retryAfterSeconds) };
  json(res, status, error, { 'x-request-id': error.requestId, ...retry });
}
