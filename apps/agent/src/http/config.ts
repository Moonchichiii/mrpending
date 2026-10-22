import { CONTRACT_VERSION, Config } from '@pending/contract';
import type { Model } from '@pending/contract';
import { RULES_VERSION } from '@pending/machine';
import { isIPv4 } from 'node:net';
import { APP_REPAIRS } from '../build/loop';
import type { Env } from '../env';

// An address, not a name prefix: a hostname such as 127.example.com may resolve anywhere.
function loopback(host: string): boolean {
  const bare = host.replace(/^\[(.*)\]$/, '$1').replace(/^::ffff:/i, '');
  return bare === 'localhost' || bare === '::1' || (isIPv4(bare) && bare.startsWith('127.'));
}

// Only the server knows where the model is: this-machine needs a local mode, a loopback Ollama and a loopback caller.
export function inference(env: Env, remote: string | undefined): Config['inference'] {
  if (env.INFERENCE_MODE === 'hosted') return 'hosted';
  const here = loopback(new URL(env.OLLAMA_URL).hostname) && remote !== undefined && loopback(remote);
  return here ? 'this-machine' : 'server';
}

export const config = (env: Env, model: Model, remote: string | undefined): Config =>
  Config.parse({
    inference: inference(env, remote),
    model,
    voice: { elevenlabs: env.ELEVENLABS_API_KEY !== undefined && env.ELEVENLABS_VOICE_ID !== undefined },
    telemetry: env.SENTRY_DSN !== undefined,
    repairs: APP_REPAIRS,
    contractVersion: CONTRACT_VERSION,
    rulesVersion: RULES_VERSION,
  });
