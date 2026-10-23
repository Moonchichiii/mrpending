import { Build, range } from '@pending/contract';
import { MAX_RECORD_BYTES } from './records';
import { replay } from './replay';
import type { Replayed } from './replay';

// My department: this browser's own builds. Never a URL; it leaves only as a JSON export.
const BUILDS = 'mrpending.department.builds';
const COUNTER = 'mrpending.department.counter';
export const KEPT = 20;
const MAX_DUE = 9999;

const Due = range(1, MAX_DUE);
const Kept = Build.extend({ due: Due }).array().max(KEPT);
export type Kept = { due: number; build: Build };

// The cosmetic DUE-nnnn number is a per-browser counter, never an address.
export const dueLabel = (due: number) => `DUE-${String(due).padStart(4, '0')}`;

// Storage is untrusted and may be switched off: anything unreadable reads as nothing.
function stored(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    if (text === null) return undefined;
    const raw: unknown = JSON.parse(text);
    return raw;
  } catch {
    return undefined;
  }
}

function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Every kept build is replayed again on the way out; one the current rules refuse is dropped.
export function kept(): Kept[] {
  const parsed = Kept.safeParse(stored(BUILDS));
  if (!parsed.success) return [];
  return parsed.data.flatMap(({ due, ...build }) => {
    const replayed = replay(build);
    return replayed.ok ? [{ due, build: replayed.build }] : [];
  });
}

// A full storage drops the oldest builds until the rest fit; false when not even the newest fits.
function write(builds: Kept[]): boolean {
  const rows = builds.map(({ due, build }) => ({ ...build, due }));
  for (let n = rows.length; n >= 1; n -= 1) if (save(BUILDS, rows.slice(0, n))) return true;
  return false;
}

// Newest first, the last 20 only; the counter wraps after DUE-9999. Undefined when the browser keeps nothing.
export function keep(build: Build): Kept | undefined {
  const last = Due.safeParse(stored(COUNTER));
  const due = last.success ? (last.data % MAX_DUE) + 1 : 1;
  if (!save(COUNTER, due) || !write([{ due, build }, ...kept()].slice(0, KEPT))) return undefined;
  return { due, build };
}

// An imported file is refused over 512 KB, then replayed; only the rules' account of it is kept.
export async function importFile(file: File): Promise<Replayed> {
  if (file.size > MAX_RECORD_BYTES)
    return { ok: false, reason: 'This file is over 512 KB; the Department does not accept it.' };
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { ok: false, reason: 'This file is not JSON.' };
  }
  const replayed = replay(raw);
  if (replayed.ok && keep(replayed.build) === undefined)
    return {
      ok: false,
      reason: 'This browser would not keep the build; its storage is full or switched off.',
    };
  return replayed;
}

export const exportJson = (build: Build) => JSON.stringify(build, null, 2);
