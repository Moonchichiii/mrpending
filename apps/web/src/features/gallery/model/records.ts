import type { Build } from '@pending/contract';
import { replay } from './replay';
import type { Replayed } from './replay';

// The files in public/gallery; a static host cannot list a directory, and a test keeps this list equal to it.
export const SLUGS = ['budget', 'bureaucracy', 'scenic', 'thrown', 'windless'] as const;
export type Slug = (typeof SLUGS)[number];

const BASE = import.meta.env.BASE_URL;
export const GUIDE = 'https://github.com/Moonchichiii/mrpending#how-the-gallery-was-produced';
export const MAX_RECORD_BYTES = 512 * 1024;

const isSlug = (value: string): value is Slug => SLUGS.some((s) => s === value);

export const recordHref = (slug: Slug) => `${BASE}r/${slug}`;

// The one route: /r/<slug> opens a gallery record; any other path is the gallery itself.
export function slugOf(pathname: string): Slug | undefined {
  if (!pathname.startsWith(BASE)) return undefined;
  const match = pathname.slice(BASE.length).match(/^r\/([a-z]{1,32})\/?$/);
  const slug = match?.[1];
  return slug !== undefined && isSlug(slug) ? slug : undefined;
}

// A record is fetched as text so its size is checked before it is parsed, then replayed like any import.
export async function fetchRecord(slug: Slug, signal: AbortSignal): Promise<Replayed> {
  const response = await fetch(`${BASE}gallery/${slug}.json`, { signal });
  if (!response.ok) return { ok: false, reason: `The archive did not return ${slug}.` };
  const text = await response.text();
  if (new TextEncoder().encode(text).length > MAX_RECORD_BYTES)
    return { ok: false, reason: `The record ${slug} is over 512 KB.` };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: `The record ${slug} is not JSON.` };
  }
  return gallery(raw);
}

// A gallery record is a replayable build recorded through Ollama; the public site shows no other kind.
export function gallery(raw: unknown): Replayed {
  const replayed = replay(raw);
  if (replayed.ok && replayed.build.model.host !== 'ollama')
    return { ok: false, reason: 'This record was not recorded through Ollama.' };
  return replayed;
}

// Provenance documents the recording, it does not prove it; the README states the procedure.
export function provenance(build: Build): string[] {
  const { model } = build;
  return [
    'Recorded local inference',
    model.id,
    ...(model.digest === undefined ? [] : [`digest ${model.digest.replace(/^sha256:/, '').slice(0, 12)}`]),
    ...(model.runtime === undefined ? [] : [`Ollama ${model.runtime.replace(/^ollama-/, '')}`]),
    `prompt ${build.promptVersion}`,
    `rules ${build.rulesVersion}`,
    `recorded ${build.createdAt.slice(0, 10)}`,
  ];
}
