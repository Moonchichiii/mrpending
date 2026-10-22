import * as z from 'zod';

const bytes = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const name = z.string().max(100);
const Version = z.object({
  version: z
    .string()
    .regex(/^[\w.+-]+$/)
    .max(24),
});
const Tags = z.object({
  models: z.array(z.object({ name, digest: z.string().regex(/^[0-9a-f]{64}$/), size: bytes })).max(500),
});
const Ps = z.object({ models: z.array(z.object({ name, size: bytes, size_vram: bytes })).max(50) });

async function get(url: string, path: string): Promise<unknown> {
  const res = await fetch(new URL(path, url), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`ollama answered ${res.status} on ${path}`);
  return res.json();
}

// model.digest and model.runtime document where a Build came from (ARCHITECTURE section 2); they do not prove it.
export async function provenance(url: string, model: string) {
  const { version } = Version.parse(await get(url, '/api/version'));
  const tag = Tags.parse(await get(url, '/api/tags')).models.find((m) => m.name === model);
  if (tag === undefined) throw new Error(`${model} is not pulled; the spike never downloads a model`);
  return { digest: `sha256:${tag.digest}`, runtime: `ollama-${version}`, sizeBytes: tag.size };
}

export const loaded = async (url: string) =>
  Ps.parse(await get(url, '/api/ps')).models.map((m) => ({
    name: m.name,
    sizeBytes: m.size,
    vramBytes: m.size_vram,
  }));

// The API form of `ollama stop <model>`: a keep_alive of zero unloads it at once.
export async function unload(url: string, model: string): Promise<void> {
  const res = await fetch(new URL('/api/generate', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, keep_alive: 0 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ollama answered ${res.status} on unload`);
  await res.body?.cancel();
}
