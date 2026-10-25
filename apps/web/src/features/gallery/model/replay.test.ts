import { Build } from '@pending/contract';
import { RULES_VERSION } from '@pending/machine';
import { expect, test } from 'vitest';
import { SLUGS, gallery } from './records';
import { replay } from './replay';

// The committed gallery, read as raw JSON: the same files the static site serves.
const files = import.meta.glob<unknown>('../../../../public/gallery/*.json', {
  eager: true,
  import: 'default',
});
const raw = (slug: string) => files[`../../../../public/gallery/${slug}.json`];
const record = (slug: string) => Build.parse(raw(slug));

test('the list of gallery slugs is exactly the files in public/gallery', () => {
  expect(Object.keys(files).toSorted()).toEqual(SLUGS.map((s) => `../../../../public/gallery/${s}.json`));
});

test('every gallery record passes the schema and current rules, replays byte for byte and was recorded through Ollama', () => {
  for (const slug of SLUGS) {
    const replayed = gallery(raw(slug));
    if (!replayed.ok) throw new Error(`${slug}: ${replayed.reason}`);
    expect(replayed.build.rulesVersion).toBe(RULES_VERSION);
    expect(replayed.build.model.host).toBe('ollama');
    expect(replayed.corrected).toBe(false);
    expect(JSON.stringify(replayed.build)).toBe(JSON.stringify(raw(slug)));
  }
});

test('a record from another host is not a gallery record', () => {
  const hosted = record('scenic');
  hosted.model.host = 'openrouter';
  expect(gallery(hosted)).toEqual({ ok: false, reason: 'This record was not recorded through Ollama.' });
});

test('a forged outcome in an opened record is corrected: the simulator and the recomputed report are what is shown', () => {
  const honest = record('scenic');
  const first = honest.attempts[0];
  if (first === undefined || first.outcome === 'pressed')
    throw new Error('scenic needs a failed first trial');
  const forged = structuredClone(honest);
  const forgedFirst = forged.attempts[0];
  if (forgedFirst === undefined) throw new Error('unreachable');
  forgedFirst.outcome = 'pressed';
  forged.attempts = [forgedFirst];
  forged.report = {
    attempts: 1,
    parts: forgedFirst.blueprint.parts.length,
    pressed: true,
    verdict: 'Approved.',
  };

  const replayed = replay(forged);
  if (!replayed.ok) throw new Error(replayed.reason);
  expect(replayed.corrected).toBe(true);
  expect(replayed.build.attempts[0]?.outcome).toBe(first.outcome);
  expect(replayed.build.report).toMatchObject({ attempts: 1, pressed: false, failedAt: first.failedAt });
  expect(replayed.build.report.verdict).toBe('Your request is pending. Naturally.');
});

test('an opened record under another rulesVersion is refused with a plain message', () => {
  const other = { ...record('scenic'), rulesVersion: 'r1' };
  expect(replay(other)).toEqual({
    ok: false,
    reason: `This build was filed under rules r1; the Department now works to rules ${RULES_VERSION} and cannot replay it.`,
  });
});

test('a correction that does not produce the blueprint it records is refused', () => {
  const tampered = record('scenic');
  const part = tampered.attempts[1]?.blueprint.parts[0];
  if (part === undefined) throw new Error('scenic needs a repaired trial');
  part.cell = part.cell === 'A1' ? 'A2' : 'A1';
  expect(replay(tampered)).toEqual({
    ok: false,
    reason: 'The correction for trial 2 does not produce the machine it records.',
  });
});
