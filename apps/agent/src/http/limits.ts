import type { IncomingMessage } from 'node:http';
import { LOCAL_CALL_TIMEOUT_MS } from '../models/ollama';

// SECURITY-AND-FAILURE-CONTRACT section 4; in-memory, so valid for a single instance only (section 5).
export const LIMITS = {
  bodyBytes: 4 * 1024,
  buildsPerWindow: 10,
  windowMs: 10 * 60_000,
  pingMs: 10_000,
  // A concurrency rejection is not queued (v1); the client retries after this many seconds.
  busyRetrySeconds: 30,
  // Local first output shares the call placeholder until the laptop measurement replaces both.
  firstTokenMs: { local: LOCAL_CALL_TIMEOUT_MS, hosted: 15_000 },
  callMs: { local: LOCAL_CALL_TIMEOUT_MS, hosted: 45_000 },
  buildMs: { local: 6 * 60_000, hosted: 3 * 60_000 },
} as const;

// Until the identity probe has run, identity is the socket address (section 5); IDENTITY_HEADER is set only after it.
export function identity(req: IncomingMessage, header: string | undefined): string {
  const named = header === undefined ? undefined : req.headers[header];
  const value = typeof named === 'string' ? named.trim().slice(0, 64) : '';
  return value === '' ? (req.socket.remoteAddress ?? 'unknown') : value;
}

export type Admission = { ok: true; release: () => void } | { ok: false; retryAfterSeconds: number };

// One build per identity, `maxConcurrent` in all, and a sliding window of builds per identity.
// Every admit drops the identities whose newest start left the window, so old callers are not kept.
export function limiter(maxConcurrent: number, perWindow: number, windowMs: number) {
  const started = new Map<string, number[]>();
  const active = new Set<string>();
  const admit = (who: string, now: number): Admission => {
    for (const [key, times] of started) {
      const newest = times.at(-1);
      if (newest === undefined || now - newest >= windowMs) started.delete(key);
    }
    const recent = (started.get(who) ?? []).filter((t) => now - t < windowMs);
    if (active.has(who) || active.size >= maxConcurrent)
      return { ok: false, retryAfterSeconds: LIMITS.busyRetrySeconds };
    const oldest = recent[0];
    if (recent.length >= perWindow && oldest !== undefined)
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
    started.set(who, [...recent, now]);
    active.add(who);
    return { ok: true, release: () => active.delete(who) };
  };
  return Object.assign(admit, { tracked: () => started.size });
}
