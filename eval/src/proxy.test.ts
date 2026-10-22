import { createServer } from 'node:http';
import { expect, test } from 'vitest';
import { capturingProxy } from './proxy';

test('a call that goes away aborts the upstream request, so no generation outlives it', async () => {
  let closed: () => void = () => {};
  const upstreamClosed = new Promise<void>((resolve) => {
    closed = resolve;
  });
  // An Ollama that starts a reply and never finishes it.
  const ollama = createServer((req, res) => {
    req.resume();
    res.on('close', closed);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {}\n\n');
  });
  await new Promise<void>((resolve) => ollama.listen(0, '127.0.0.1', resolve));
  const address = ollama.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const proxy = await capturingProxy(`http://127.0.0.1:${address.port}`);
  try {
    const call = new AbortController();
    const reply = await fetch(`${proxy.url}/chat/completions`, {
      method: 'POST',
      body: '{}',
      signal: call.signal,
    });
    await reply.body?.getReader().read();
    call.abort();
    await upstreamClosed;
    expect(proxy.bodies).toEqual(['{}']);
  } finally {
    proxy.close();
    ollama.close();
  }
});
