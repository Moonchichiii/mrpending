import { healthz } from '@pending/agent';

// The scenarios and the runner arrive in issues #8 and #10.
export const agentReady = (): boolean => healthz().ok;
