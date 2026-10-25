import { Attempt, Build } from '@pending/contract';
import type { Blueprint, Patch } from '@pending/contract';
import { RULES_VERSION, applyPatch, report, simulate, validate } from '@pending/machine';
import { assertNever } from '../../../shared/assertNever';

export type Replayed = { ok: true; build: Build; corrected: boolean } | { ok: false; reason: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// The trial the build loop records, rebuilt from the rules alone; the stored outcome is never consulted.
function trial(n: number, blueprint: Blueprint, violations: string[], patch?: Patch): Attempt {
  const base = {
    n,
    blueprint,
    violations: violations.slice(0, 8).map((v) => v.slice(0, 120)),
    ...(patch === undefined ? {} : { patch }),
  };
  if (violations.length > 0) return Attempt.parse({ ...base, events: [], outcome: 'invalid' });
  const events = simulate(blueprint);
  const end = events.at(-1);
  if (end === undefined) throw new Error('a simulation produced no events');
  switch (end.type) {
    case 'button.pressed':
      return Attempt.parse({ ...base, events, outcome: 'pressed' });
    case 'ball.lost':
      return Attempt.parse({ ...base, events, outcome: 'lost', failedAt: end.cell });
    case 'ball.stopped':
    case 'impulse.lost':
      return Attempt.parse({ ...base, events, outcome: 'stalled', failedAt: end.cell });
    case 'ball.released':
    case 'ball.moved':
    case 'ball.launched':
    case 'domino.fell':
      throw new Error(`a simulation ended on ${end.type}`);
    default:
      return assertNever(end);
  }
}

// Every opened record is untrusted: schema, current rules, each patch checked against the blueprint it
// claims to produce, every attempt re-simulated and the report recomputed; what is shown is the rules' account.
export function replay(raw: unknown): Replayed {
  const parsed = Build.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'This file is not a build the Department can read.' };
  const record = parsed.data;
  if (record.rulesVersion !== RULES_VERSION)
    return {
      ok: false,
      reason: `This build was filed under rules ${record.rulesVersion}; the Department now works to rules ${RULES_VERSION} and cannot replay it.`,
    };
  const used = new Set<string>();
  const attempts: Attempt[] = [];
  for (const stored of record.attempts) {
    const previous = attempts.at(-1);
    if (previous?.outcome === 'pressed')
      return { ok: false, reason: 'This build carries trials after the button was pressed.' };
    let next: { blueprint: Blueprint; violations: string[] };
    if (previous === undefined) {
      if (stored.patch !== undefined)
        return { ok: false, reason: 'This build opens with a correction to nothing.' };
      next = { blueprint: stored.blueprint, violations: validate(stored.blueprint, record.form) };
      for (const p of stored.blueprint.parts) used.add(p.id);
    } else {
      if (stored.patch === undefined)
        return { ok: false, reason: `Trial ${attempts.length + 1} of this build has no correction.` };
      next = applyPatch(previous.blueprint, stored.patch, used, record.form);
      if (!same(next.blueprint, stored.blueprint))
        return {
          ok: false,
          reason: `The correction for trial ${attempts.length + 1} does not produce the machine it records.`,
        };
      for (const op of stored.patch) if (op.op === 'add') used.add(op.part.id);
    }
    attempts.push(trial(attempts.length + 1, next.blueprint, next.violations, stored.patch));
  }
  const build = Build.parse({ ...record, attempts, report: report(attempts) });
  return { ok: true, build, corrected: !same(build, record) };
}
