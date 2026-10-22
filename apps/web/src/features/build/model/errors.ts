import type { ApiError } from '@pending/contract';

// The server's codes plus the two only the client can observe (SECURITY-AND-FAILURE-CONTRACT section 2).
export type AppError = Omit<ApiError, 'code'> & { code: ApiError['code'] | 'INTERRUPTED' | 'NETWORK' };

type Action = 'edit' | 'retry';

// The one copy table: every code's message and the next step offered.
const COPY: Record<AppError['code'], { message: string; action: Action }> = {
  INPUT_INVALID: {
    message: 'The Department could not accept this form. Check the entries and file it again.',
    action: 'edit',
  },
  RATE_LIMITED: {
    message: 'The Department is processing too many forms. Try again shortly.',
    action: 'retry',
  },
  MODEL_UNAVAILABLE: {
    message: 'Gemma is not answering. Check that Ollama is running, then try again.',
    action: 'retry',
  },
  TIMEOUT: { message: 'Gemma took too long to answer. Try again.', action: 'retry' },
  MODEL_INVALID: { message: 'Gemma sent a reply that does not fit the Form. Build again.', action: 'retry' },
  INTERRUPTED: {
    message: 'The build stopped before it finished. Finished trials stay on screen; build again.',
    action: 'retry',
  },
  NETWORK: {
    message: 'The Department cannot be reached. Try again; the gallery still works.',
    action: 'retry',
  },
  VOICE_UNAVAILABLE: { message: 'The voice is unavailable. Captions continue.', action: 'retry' },
  UNKNOWN: { message: 'Something went wrong. Try again.', action: 'retry' },
};

export const appError = (code: AppError['code'], requestId: string): AppError => ({
  code,
  message: COPY[code].message,
  requestId,
  retryable: code !== 'INPUT_INVALID',
});

export function errorCopy(error: AppError): { message: string; action: Action } {
  const { message, action } = COPY[error.code];
  if (error.code === 'RATE_LIMITED' && error.retryAfterSeconds !== undefined)
    return { message: `${message} Wait ${error.retryAfterSeconds} s.`, action };
  if (error.code === 'UNKNOWN') return { message: `${message} Reference ${error.requestId}.`, action };
  return { message, action };
}
