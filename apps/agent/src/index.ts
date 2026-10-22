import { RULES_VERSION } from '@pending/machine';

// The loop, the routes and the beats arrive in issues #8 and #9; this is the workspace edge, nothing more.
export function healthz(): { ok: true; rulesVersion: typeof RULES_VERSION } {
  return { ok: true, rulesVersion: RULES_VERSION };
}
