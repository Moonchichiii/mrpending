import { Attempt } from '@pending/contract';
import type { Blueprint, Build, Patch } from '@pending/contract';
import { RULES_VERSION, applyPatch, report, simulate, validate } from '@pending/machine';
import type { Matrix, Results } from './results';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// The trial the build loop records, rebuilt from the rules alone; violations are cut to the contract's bounds.
function trial(n: number, blueprint: Blueprint, violations: string[], patch?: Patch): Attempt | undefined {
  const base = {
    n,
    blueprint,
    violations: violations.slice(0, 8).map((v) => v.slice(0, 120)),
    ...(patch === undefined ? {} : { patch }),
  };
  if (violations.length > 0) return Attempt.parse({ ...base, events: [], outcome: 'invalid' });
  const events = simulate(blueprint);
  const end = events.at(-1);
  switch (end?.type) {
    case 'button.pressed':
      return Attempt.parse({ ...base, events, outcome: 'pressed' });
    case 'ball.lost':
      return Attempt.parse({ ...base, events, outcome: 'lost', failedAt: end.cell });
    case 'ball.stopped':
    case 'impulse.lost':
      return Attempt.parse({ ...base, events, outcome: 'stalled', failedAt: end.cell });
    case undefined:
    case 'ball.released':
    case 'ball.moved':
    case 'ball.launched':
    case 'domino.fell':
      return undefined;
  }
}

// A build the gallery may show: current rules, Ollama provenance, every attempt rebuilt from the first blueprint
// and the recorded patches (blueprint, violations, events, outcome), no attempt after a press, and the report
// recomputed from those attempts equal to the stored one.
export function verified(build: Build): boolean {
  if (
    build.rulesVersion !== RULES_VERSION ||
    build.model.host !== 'ollama' ||
    build.model.digest === undefined ||
    build.model.runtime === undefined
  )
    return false;
  const used = new Set<string>();
  let previous: Attempt | undefined;
  for (const [i, attempt] of build.attempts.entries()) {
    if (previous?.outcome === 'pressed') return false;
    let next: { blueprint: Blueprint; violations: string[] };
    if (previous === undefined) {
      if (attempt.patch !== undefined) return false;
      next = { blueprint: attempt.blueprint, violations: validate(attempt.blueprint, build.form) };
      for (const p of attempt.blueprint.parts) used.add(p.id);
    } else {
      if (attempt.patch === undefined) return false;
      next = applyPatch(previous.blueprint, attempt.patch, used, build.form);
      for (const op of attempt.patch) if (op.op === 'add') used.add(op.part.id);
    }
    const expected = trial(i + 1, next.blueprint, next.violations, attempt.patch);
    if (expected === undefined || !same(expected, attempt)) return false;
    previous = expected;
  }
  return same(report(build.attempts), build.report);
}

export type Shipped = { model: Results['model']['id']; promptVersion: Results['promptVersion'] };
export type GalleryPlan = { picks: { form: string; build: Build }[]; missing: string[] };

// The gallery reads a complete matrix, or one stopped at the deadline once the shipped configuration had run every
// planned build; any other matrix is refused. Per headline form it takes a verified build, the shipped
// configuration first, a pressed build before an unpressed one; a form with none is missing.
export function galleryPlan(
  m: Matrix,
  configs: readonly Results[],
  forms: readonly string[],
  shipped: Shipped,
): GalleryPlan {
  if (m.status !== 'complete' && m.status !== 'stopped-at-deadline')
    throw new Error(`the matrix is ${m.status}; the gallery needs complete or stopped-at-deadline`);
  const isShipped = (r: Results) => r.model.id === shipped.model && r.promptVersion === shipped.promptVersion;
  const ship = configs.find(isShipped);
  const planned = (r: Results) => r.k.headline * forms.length + r.k.heldOut + r.k.trap + r.k.optionalTrap;
  if (ship === undefined || ship.stoppedAtDeadline || ship.runs.length !== planned(ship))
    throw new Error(
      `the shipped configuration (${shipped.model} ${shipped.promptVersion}) did not finish all its builds`,
    );
  const ordered = [ship, ...configs.filter((r) => r !== ship)];
  const candidates = ordered.flatMap((r) =>
    r.runs.flatMap((x) =>
      x.run.end === 'done' && verified(x.run.build)
        ? [{ form: x.scenario.split('#')[0], build: x.run.build }]
        : [],
    ),
  );
  const picks = forms.flatMap((form) => {
    const builds = candidates.filter((c) => c.form === form).map((c) => c.build);
    const build = builds.find((b) => b.report.pressed) ?? builds[0];
    return build === undefined ? [] : [{ form, build }];
  });
  return { picks, missing: forms.filter((form) => !picks.some((p) => p.form === form)) };
}
