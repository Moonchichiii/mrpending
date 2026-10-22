import { Attempt } from '@pending/contract';
import type { Blueprint, Build, Patch } from '@pending/contract';
import { RULES_VERSION, applyPatch, report, simulate, validate } from '@pending/machine';
import type { Matrix, Results } from './results';
import type { Scenario } from './scenarios';

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
export type GalleryPlan = {
  picks: { form: string; build: Build }[];
  missing: string[];
  mismatches: string[];
};

// The gallery reads a complete matrix, or one stopped at the deadline once the shipped configuration had run every
// planned build; any other matrix is refused. The labels in a results file are not trusted: a build counts for a
// headline form only if its form is that form in scenarios.json, and for a configuration only if its model id and
// prompt version are the ones the matrix declares for it; a build that fails either is no candidate and is named in
// mismatches. Per headline form it takes a verified build, the shipped configuration first, a pressed build before
// an unpressed one; a form with none is missing.
export function galleryPlan(
  m: Matrix,
  configs: readonly Results[],
  headline: readonly Pick<Scenario, 'id' | 'form'>[],
  shipped: Shipped,
): GalleryPlan {
  if (m.status !== 'complete' && m.status !== 'stopped-at-deadline')
    throw new Error(`the matrix is ${m.status}; the gallery needs complete or stopped-at-deadline`);
  if (configs.length !== m.configurations.length)
    throw new Error(
      `the matrix declares ${m.configurations.length} configurations, ${configs.length} were read`,
    );
  const declared = m.configurations.flatMap((c, i) => {
    const results = configs[i];
    return results === undefined ? [] : [{ ...c, results }];
  });
  const isShipped = (c: (typeof declared)[number]) =>
    c.model === shipped.model &&
    c.promptVersion === shipped.promptVersion &&
    c.results.model.id === shipped.model &&
    c.results.promptVersion === shipped.promptVersion;
  const ship = declared.find(isShipped);
  const planned = (r: Results) => r.k.headline * headline.length + r.k.heldOut + r.k.trap + r.k.optionalTrap;
  if (
    ship === undefined ||
    ship.results.stoppedAtDeadline ||
    ship.results.runs.length !== planned(ship.results)
  )
    throw new Error(
      `the shipped configuration (${shipped.model} ${shipped.promptVersion}) did not finish all its builds`,
    );
  const mismatches: string[] = [];
  const ordered = [ship, ...declared.filter((c) => c !== ship)];
  const candidates = ordered.flatMap((c) =>
    c.results.runs.flatMap((x) => {
      const scenario = headline.find((s) => s.id === x.scenario.split('#')[0]);
      if (scenario === undefined || x.run.end !== 'done') return [];
      const { build } = x.run;
      const where = `${c.file} ${x.scenario} (${build.id})`;
      let bound = true;
      if (!same(build.form, scenario.form)) {
        mismatches.push(`${where}: its form is not ${scenario.id}'s form in scenarios.json`);
        bound = false;
      }
      if (build.model.id !== c.model || build.promptVersion !== c.promptVersion) {
        mismatches.push(
          `${where}: built by ${build.model.id} ${build.promptVersion}, the matrix declares ${c.experiment} as ${c.model} ${c.promptVersion}`,
        );
        bound = false;
      }
      return bound && verified(build) ? [{ form: scenario.id, build }] : [];
    }),
  );
  const forms = headline.map((s) => s.id);
  const picks = forms.flatMap((form) => {
    const builds = candidates.filter((c) => c.form === form).map((c) => c.build);
    const build = builds.find((b) => b.report.pressed) ?? builds[0];
    return build === undefined ? [] : [{ form, build }];
  });
  return { picks, missing: forms.filter((form) => !picks.some((p) => p.form === form)), mismatches };
}
