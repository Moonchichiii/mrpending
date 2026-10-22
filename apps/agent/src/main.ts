import { PROMPT_VERSION, instructions, pendingAgent } from './agents/pending';
import { parseEnv } from './env';
import { agentServer } from './http/server';
import { mastraInfer } from './models/ollama';

// The spike's GO configuration (eval/results/2026-10-22-spike-decision.md).
const LOCAL_MODEL = 'gemma4:e2b';

const env = parseEnv(process.env);
if (env.INFERENCE_MODE === 'hosted') throw new Error('hosted inference has no model wired in this release');

const agent = pendingAgent(PROMPT_VERSION, {
  providerId: 'ollama',
  modelId: LOCAL_MODEL,
  url: new URL('/v1', env.OLLAMA_URL).href,
  apiKey: 'ollama',
});

// Loopback only: the local installation serves the browser on the same machine.
agentServer({
  env,
  model: { mode: 'local', id: LOCAL_MODEL, host: 'ollama' },
  system: instructions(PROMPT_VERSION),
  promptVersion: PROMPT_VERSION,
  infer: (onPartial) => mastraInfer(agent, onPartial),
}).listen(env.PORT, '127.0.0.1', () => console.warn(`agent listening on 127.0.0.1:${env.PORT}`));
