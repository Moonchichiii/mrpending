import { createServer } from 'node:http';

// A pass-through to Ollama that keeps each request body Mastra sends, so the record shows what reached the server.
// A client that goes away (a timed-out call) or an upstream stream that fails aborts the upstream request, so no
// generation outlives its call and the next scenario's latency is its own.
export async function capturingProxy(target: string) {
  const bodies: string[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    const upstream = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) upstream.abort();
    });
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (req.url?.endsWith('/chat/completions') === true) bodies.push(body);
      void (async () => {
        try {
          const reply = await fetch(new URL(req.url ?? '/', target), {
            method: req.method ?? 'POST',
            headers: { 'content-type': 'application/json' },
            signal: upstream.signal,
            ...(req.method === 'GET' ? {} : { body }),
          });
          res.writeHead(reply.status, { 'content-type': reply.headers.get('content-type') ?? '' });
          if (reply.body !== null) for await (const piece of reply.body) res.write(piece);
          res.end();
        } catch {
          upstream.abort();
          if (res.headersSent) res.destroy();
          else res.writeHead(502).end();
        }
      })();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the proxy has no TCP port');
  return { url: `http://127.0.0.1:${address.port}/v1`, bodies, close: () => server.close() };
}
