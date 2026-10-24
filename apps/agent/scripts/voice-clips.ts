// Renders Mr. Pending's fixed table lines once as ElevenLabs clips for the web voice: `bun apps/agent/scripts/voice-clips.ts`.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Line, MAX_LINES, short } from '@pending/contract';
import type * as z from 'zod';
import { ASIDES, opening } from '../src/build/beats';

const VOICE_ID = 'l30f87tf05uxyknGdDw6';
const MODEL = 'eleven_turbo_v2_5';
const FORMAT = 'mp3_44100_64';
// The maintainer's budget for one run; above it nothing is sent.
export const MAX_CHARS = 6000;
const OUT = new URL('../../web/public/voice/', import.meta.url);

// The manifest the web voice reads: which clip says which text. Its schema mirrors apps/web/src/features/voice/clips.ts.
export const Manifest = Line.pick({ id: true, text: true })
  .extend({ sha256: short(64).regex(/^[0-9a-f]{64}$/) })
  .array()
  .max(MAX_LINES);
export type Manifest = z.infer<typeof Manifest>;

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// Every line beats.ts speaks with no slot; a line whose text holds a number, a cell or a title is not here.
export const FIXED: readonly { id: string; text: string }[] = [
  ...opening().map(({ beat, text }) => ({ id: beat, text })),
  { id: 'handoff-1', text: 'A successful descent! Alert the committee!' },
  { id: 'handoff-2', text: 'A handover! The parts are cooperating!' },
  { id: 'handoff-3', text: 'Contact! Enter it in the minutes at once!' },
  ...Object.entries(ASIDES).map(([key, text]) => ({ id: kebab(key), text })),
  { id: 'correction-due', text: 'A correction will be issued.' },
  { id: 'cameo', text: 'This is why we employ snails.' },
  { id: 'repair-sent', text: 'A repair has been submitted. Optimism remains strictly provisional.' },
  { id: 'we-did-it', text: 'WE DID IT! Please inform the entire Department.' },
  { id: 'acknowledged', text: 'The Department acknowledges this development.' },
  { id: 'verdict-pressed', text: 'One button. An extraordinary amount of paperwork.' },
];

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

// The lines to render: those whose manifest text changed, or whose clip is missing.
export function stale(previous: Manifest, has: (id: string) => boolean): { id: string; text: string }[] {
  return FIXED.filter(
    ({ id, text }) => !previous.some((e) => e.id === id && e.sha256 === sha256(text)) || !has(id),
  );
}

function readManifest(): Manifest {
  const file = new URL('manifest.json', OUT);
  if (!existsSync(file)) return [];
  const parsed = Manifest.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  return parsed.success ? parsed.data : [];
}

async function render(key: string, text: string): Promise<Uint8Array> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${FORMAT}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL }),
    },
  );
  // Only the status is reported: neither the key nor the response body is printed.
  if (!response.ok) throw new Error(`ElevenLabs answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function main() {
  const key = process.env['ELEVENLABS_API_KEY'];
  if (key === undefined || key === '') {
    console.error('voice-clips: ELEVENLABS_API_KEY is not set; nothing was sent.');
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const todo = stale(readManifest(), (id) => existsSync(new URL(`${id}.mp3`, OUT)));
  const chars = todo.reduce((sum, l) => sum + l.text.length, 0);
  console.warn(`voice-clips: ${todo.length} of ${FIXED.length} lines to render, ${chars} characters.`);
  if (chars > MAX_CHARS) {
    console.error(`voice-clips: ${chars} characters exceed the budget of ${MAX_CHARS}; nothing was sent.`);
    process.exit(1);
  }
  const done = new Set(FIXED.filter((l) => !todo.includes(l)).map((l) => l.id));
  let failure: unknown;
  for (const { id, text } of todo) {
    try {
      writeFileSync(new URL(`${id}.mp3`, OUT), await render(key, text));
      done.add(id);
      console.warn(`voice-clips: ${id}.mp3`);
    } catch (error) {
      failure = error;
      break;
    }
  }
  // The manifest names only clips that exist, so a run cut short leaves the rest to the browser voice.
  const manifest = Manifest.parse(
    FIXED.filter((l) => done.has(l.id)).map(({ id, text }) => ({ id, text, sha256: sha256(text) })),
  );
  writeFileSync(new URL('manifest.json', OUT), `${JSON.stringify(manifest, null, 2)}\n`);
  if (failure !== undefined) throw failure;
}

if (import.meta.main) await main();
