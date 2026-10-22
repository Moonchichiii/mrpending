import { createServer } from 'node:http';
import { expect, test } from 'vitest';
import { ollamaInfer } from './ollama';

test('a stream that fails aborts the request, so Ollama stops generating before the next call', async () => {
  let closed: () => void = () => {};
  const upstreamClosed = new Promise<void>((resolve) => {
    closed = resolve;
  });
  // An Ollama that reports an error mid-stream and keeps the connection open.
  const ollama = createServer((req, res) => {
    req.resume();
    res.on('close', closed);
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(`${JSON.stringify({ done: false, error: 'out of memory' })}\n`);
  });
  await new Promise<void>((resolve) => ollama.listen(0, '127.0.0.1', resolve));
  const address = ollama.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  try {
    const infer = ollamaInfer(`http://127.0.0.1:${address.port}`, 'gemma4:e2b');
    await expect(
      infer({ kind: 'design', system: 's', prompt: 'p' }, new AbortController().signal),
    ).rejects.toThrow('ollama reported an error');
    await upstreamClosed;
  } finally {
    ollama.close();
  }
});
