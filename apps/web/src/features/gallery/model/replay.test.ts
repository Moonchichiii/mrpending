import { Build, range } from '@pending/contract';
import { RULES_VERSION } from '@pending/machine';
import { beforeEach, expect, test, vi } from 'vitest';
import { KEPT, importFile, keep, kept } from './department';
import { SLUGS, gallery } from './records';
import { replay } from './replay';

// The committed gallery, read as raw JSON: the same files the static site serves.
const files = import.meta.glob<unknown>('../../../../public/gallery/*.json', {
  eager: true,
  import: 'default',
});
const raw = (slug: string) => files[`../../../../public/gallery/${slug}.json`];
const record = (slug: string) => Build.parse(raw(slug));
const file = (value: unknown) =>
  new File([JSON.stringify(value)], 'build.json', { type: 'application/json' });

beforeEach(() => localStorage.clear());

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

test('a forged outcome in an imported record is corrected: the simulator and the recomputed report are what is kept', async () => {
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

  const replayed = await importFile(file(forged));
  if (!replayed.ok) throw new Error(replayed.reason);
  expect(replayed.corrected).toBe(true);
  expect(replayed.build.attempts[0]?.outcome).toBe(first.outcome);
  expect(replayed.build.report).toMatchObject({ attempts: 1, pressed: false, failedAt: first.failedAt });
  expect(replayed.build.report.verdict).toBe('Your request is pending. Naturally.');
  expect(kept().map((k) => k.build.report.pressed)).toEqual([false]);
});

test('an imported record under another rulesVersion is refused with a plain message and not kept', async () => {
  const other = { ...record('scenic'), rulesVersion: 'r1' };
  expect(await importFile(file(other))).toEqual({
    ok: false,
    reason: `This build was filed under rules r1; the Department now works to rules ${RULES_VERSION} and cannot replay it.`,
  });
  expect(kept()).toEqual([]);
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

test('a file over 512 KB is refused before it is read', async () => {
  const big = new File(['x'.repeat(512 * 1024 + 1)], 'big.json');
  expect(await importFile(big)).toEqual({
    ok: false,
    reason: 'This file is over 512 KB; the Department does not accept it.',
  });
});

test('My department keeps the last 20 builds, newest first, each with the next DUE number', () => {
  const build = record('budget');
  for (let i = 0; i < KEPT + 1; i += 1) keep(build);
  expect(kept().map((k) => k.due)).toEqual(Array.from({ length: KEPT }, (_, i) => KEPT + 1 - i));
});

test('storage that refuses every write turns an import into a visible refusal, not a rejection', async () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  try {
    expect(await importFile(file(record('scenic')))).toEqual({
      ok: false,
      reason: 'This browser would not keep the build; its storage is full or switched off.',
    });
    expect(kept()).toEqual([]);
  } finally {
    setItem.mockRestore();
  }
});

test('storage that refuses to be read reads as an empty department', () => {
  const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('off', 'SecurityError');
  });
  try {
    expect(kept()).toEqual([]);
  } finally {
    getItem.mockRestore();
  }
});

test('a kept build tampered with in storage is replayed again and the rules account is shown', () => {
  keep(record('scenic'));
  const stored: unknown = JSON.parse(localStorage.getItem('mrpending.department.builds') ?? '[]');
  const tampered = Build.extend({ due: range(1, 9999) })
    .array()
    .parse(stored);
  const entry = tampered[0];
  if (entry === undefined) throw new Error('nothing was kept');
  entry.report.pressed = !entry.report.pressed;
  localStorage.setItem('mrpending.department.builds', JSON.stringify(tampered));
  expect(kept()[0]?.build.report).toEqual(record('scenic').report);
});
