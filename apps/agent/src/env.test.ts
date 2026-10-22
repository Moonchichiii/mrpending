import { expect, test } from 'vitest';
import { parseEnv } from './env';

const local = { INFERENCE_MODE: 'local', WEB_ORIGIN: 'http://localhost:5173' };

test('a local environment gets the loopback Ollama and one build at a time', () => {
  expect(parseEnv(local)).toEqual({
    ...local,
    OLLAMA_URL: 'http://127.0.0.1:11434',
    PORT: 4111,
    MAX_CONCURRENT_BUILDS: 1,
  });
});

test('an invalid environment stops the boot and names the keys, never the values', () => {
  const bad = {
    ...local,
    INFERENCE_MODE: 'cloud',
    OLLAMA_URL: 'file:///secret-token',
    MAX_CONCURRENT_BUILDS: '0',
  };
  expect(() => parseEnv(bad)).toThrow(
    'invalid environment: INFERENCE_MODE, OLLAMA_URL, MAX_CONCURRENT_BUILDS',
  );
  expect(() => parseEnv(bad)).not.toThrow(/secret-token/);
});

test('hosted mode without its key does not boot', () => {
  expect(() => parseEnv({ ...local, INFERENCE_MODE: 'hosted' })).toThrow('OPENROUTER_API_KEY');
});
