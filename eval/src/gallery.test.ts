import { runBuild } from '@pending/agent';
import type { Infer } from '@pending/agent';
import { Form } from '@pending/contract';
import type { Build } from '@pending/contract';
import { expect, test } from 'vitest';
import lostBlueprint from '../../packages/machine/fixtures/lost/blueprint.json';
import lostForm from '../../packages/machine/fixtures/lost/form.json';
import pressedBlueprint from '../../packages/machine/fixtures/pressed/blueprint.json';
import repairedPatch from '../../packages/machine/fixtures/repaired/patch.json';
import { galleryPlan, verified } from './gallery';
import { recorded } from './metrics';
import scenariosFile from '../scenarios.json';
import { Matrix, Results, resultsRecord } from './results';
import type { Done } from './results';
import { parseScenarios } from './scenarios';
import type { Role } from './scenarios';

const form = Form.parse(lostForm);
// Two headline forms and every other role as scenarios.json declares them; scenic is the form the fixtures were
// built for.
const scenarios = parseScenarios(scenariosFile).filter(
  (s) => s.role !== 'headline' || s.id === 'scenic' || s.id === 'thrown',
);
const headline = scenarios.filter((s) => s.role === 'headline');
const formOf = (id: string) => headline.find((s) => s.id === id)?.form ?? form;
const memo = 'More catapult.';
const digest = `sha256:${'a'.repeat(64)}`;
const repaired = { design: { blueprint: lostBlueprint, memo }, repair: { patch: repairedPatch, memo } };
const shipped = { model: 'gemma4:e2b', promptVersion: 'v2' } as const;

async function done(
  id: string,
  role: Role,
  rep: number,
  replies: { design: unknown; repair?: unknown },
): Promise<Done> {
  const infer: Infer = async (call) => ({ value: replies[call.kind], timing: { wallMs: 800 } });
  const entry = await recorded(
    id,
    runBuild({
      id: `B-2026-10-22-${id}-${rep}`,
      form: formOf(id),
      system: 'instructions',
      promptVersion: 'v2',
      model: { mode: 'local', id: 'gemma4:e2b', host: 'ollama', digest, runtime: 'ollama-0.13.0' },
      repairs: 5,
      infer,
      signal: new AbortController().signal,
      now: () => new Date('2026-10-22T12:00:00.000Z'),
    }),
  );
  return { item: { scenario: { id, role, form: formOf(id) }, rep }, entry, wallMs: 1700 };
}

// Shipped configuration B, k = 2 over two headline forms: scenic presses on its repair, thrown never designs.
async function results(stoppedAtDeadline = false) {
  return Results.parse(
    resultsRecord(
      { experiment: 'B', model: 'gemma4:e2b', version: 'v2' },
      { k: 2, optionalTrap: false, matrix: '2026-10-22-eval.json' },
      {
        prov: { digest, runtime: 'ollama-0.13.0', sizeBytes: 7_000_000_000 },
        mem: { minFreeMiB: 4096 },
        startedAt: '2026-10-22T12:00:00.000Z',
        finishedAt: '2026-10-22T12:10:00.000Z',
        done: [
          await done('scenic', 'headline', 1, repaired),
          await done('scenic', 'headline', 2, repaired),
          await done('thrown', 'headline', 1, { design: { memo: 'It worked.' } }),
          await done('thrown', 'headline', 2, { design: { memo: 'It worked.' } }),
          await done('downhill', 'held-out', 1, { design: { blueprint: pressedBlueprint, memo } }),
          await done('trap', 'trap', 1, { design: { memo: 'It worked.' } }),
        ],
        resident: [],
        unloaded: true,
        stoppedAtDeadline,
      },
      {
        hardware: { cpu: 'test cpu', threads: 8, totalMiB: 16384 },
        desktop: { vscode: true, browser: true },
      },
    ),
  );
}

const stats = {
  coldBuildMs: 60_000,
  warmBuildMs: { p50: 30_000, p95: 30_000 },
  coldStartOverheadMs: 30_000,
  modelCalls: { p50: 2, p95: 2, max: 2 },
};
type Declared = { experiment: string; model: string; promptVersion: string };
const B: Declared = { experiment: 'B', model: 'gemma4:e2b', promptVersion: 'v2' };
const matrix = (status: string, configurations: number, declared: readonly Declared[] = []) =>
  Matrix.parse({
    budgetMs: 10_800_000,
    startedAt: '2026-10-22T12:00:00.000Z',
    finishedAt: '2026-10-22T14:00:00.000Z',
    elapsedMs: 7_200_000,
    pilot: {
      model: 'gemma4:e2b',
      digest,
      runtime: 'ollama-0.13.0',
      promptVersion: 'v2',
      builds: [
        { scenario: 'scenic', cold: true, wallMs: 60_000, modelCalls: 2 },
        { scenario: 'thrown', cold: false, wallMs: 30_000, modelCalls: 2 },
      ],
      runs: [],
      elapsedMs: 95_000,
      switchMs: 5000,
      ...(status === 'stopped-in-pilot' ? {} : { stats }),
    },
    factors: { e2b: 1, e4b: 2.1, source: 'spike' },
    forecastMs: { 3: 9_000_000, 2: 7_000_000 },
    ...(status === 'stopped-over-budget' ? { shortfallMs: 1000 } : {}),
    plannedMs: 7_000_000,
    k: { headline: 2, heldOut: 1, trap: 1, optionalTrap: 0 },
    bestVersion: 'v2',
    status,
    configurations: Array.from({ length: configurations }, (_, i) => ({
      ...(declared[i] ?? B),
      file: `2026-10-22-config-${i + 1}.json`,
    })),
  });

test('a build whose patches, trials and report the rules reproduce is verified', async () => {
  const r = await results();
  const scenic = r.runs[0]?.run;
  if (scenic?.end !== 'done') throw new Error('scenic did not finish');
  expect(scenic.build.attempts.map((a) => a.outcome)).toEqual(['lost', 'pressed']);
  expect(verified(scenic.build)).toBe(true);
});

test('a corrupted results file loses its gallery record: a patch, a blueprint, an outcome or a report that the rules do not reproduce', async () => {
  const file = JSON.stringify(await results());
  const corrupt = (edit: (build: Build) => void) => {
    const r = Results.parse(JSON.parse(file));
    for (const x of r.runs) if (x.scenario.startsWith('scenic#') && x.run.end === 'done') edit(x.run.build);
    return Results.parse(JSON.parse(JSON.stringify(r)));
  };
  const second = (b: Build) => {
    const a = b.attempts[1];
    if (a === undefined) throw new Error('the build has no repair');
    return a;
  };
  const corrupted = [
    // The patch no longer gives the next blueprint.
    corrupt((b) => {
      second(b).patch = [{ op: 'remove', id: 'p3' }];
    }),
    corrupt((b) => {
      const part = second(b).blueprint.parts[0];
      if (part !== undefined) part.cell = part.cell === 'A1' ? 'A2' : 'A1';
    }),
    // A failure dressed up as a press: the report agrees with the attempt, the simulator does not.
    corrupt((b) => {
      const first = b.attempts[0];
      if (first !== undefined) first.outcome = 'pressed';
    }),
    // The stored report claims what the attempts do not say.
    corrupt((b) => {
      b.report.attempts = 1;
    }),
    corrupt((b) => {
      b.report.parts += 1;
    }),
  ];
  for (const r of corrupted) {
    expect(r.runs[0]?.run.end).toBe('done');
    expect(galleryPlan(matrix('complete', 3), [r, r, r], scenarios, shipped)).toEqual({
      picks: [],
      missing: ['scenic', 'thrown'],
      mismatches: [],
    });
  }
  const clean = Results.parse(JSON.parse(file));
  const plan = galleryPlan(matrix('complete', 3), [clean, clean, clean], scenarios, shipped);
  expect(plan.picks.map((p) => [p.form, p.build.id, p.build.report.pressed])).toEqual([
    ['scenic', 'B-2026-10-22-scenic-1', true],
  ]);
  expect(plan.missing).toEqual(['thrown']);
});

test('the gallery reads a matrix stopped at the deadline once the shipped configuration finished, and refuses the rest', async () => {
  const finished = await results();
  const plan = galleryPlan(matrix('stopped-at-deadline', 1), [finished], scenarios, shipped);
  expect(plan.picks.map((p) => p.form)).toEqual(['scenic']);
  // The shipped configuration was cut, or lost a build, or never ran.
  const cut = await results(true);
  expect(() => galleryPlan(matrix('stopped-at-deadline', 1), [cut], scenarios, shipped)).toThrow(
    /did not finish all its builds/,
  );
  const short = { ...finished, runs: finished.runs.slice(1) };
  expect(() => galleryPlan(matrix('stopped-at-deadline', 1), [short], scenarios, shipped)).toThrow(
    /did not finish all its builds/,
  );
  // The results file declares its own k, or repeats one build in place of another.
  const trap = finished.runs.find((x) => x.scenario === 'trap#1');
  if (trap === undefined) throw new Error('the trap did not run');
  const ownK = {
    ...finished,
    k: { ...finished.k, optionalTrap: 1 as const },
    runs: [...finished.runs, { ...trap, scenario: 'sloth#1' }],
  };
  expect(() => galleryPlan(matrix('stopped-at-deadline', 1), [ownK], scenarios, shipped)).toThrow(
    /did not finish all its builds/,
  );
  const repeated = {
    ...finished,
    runs: finished.runs.map((x) => (x.scenario === 'thrown#2' ? { ...x, scenario: 'scenic#1' } : x)),
  };
  expect(() => galleryPlan(matrix('stopped-at-deadline', 1), [repeated], scenarios, shipped)).toThrow(
    /did not finish all its builds/,
  );
  // The held-out form and the trap never ran: two other unique labels stand in their place.
  const renamed = {
    ...finished,
    runs: finished.runs.map((x) =>
      x.scenario === 'downhill#1'
        ? { ...x, scenario: 'scenic#3' }
        : x.scenario === 'trap#1'
          ? { ...x, scenario: 'thrown#3' }
          : x,
    ),
  };
  expect(() => galleryPlan(matrix('stopped-at-deadline', 1), [renamed], scenarios, shipped)).toThrow(
    /did not finish all its builds/,
  );
  const v1 = { ...finished, promptVersion: 'v1' as const };
  expect(() => galleryPlan(matrix('stopped-at-deadline', 1), [v1], scenarios, shipped)).toThrow(
    /did not finish all its builds/,
  );
  for (const status of ['stopped-in-pilot', 'stopped-over-budget'])
    expect(() => galleryPlan(matrix(status, 0), [], scenarios, shipped)).toThrow(new RegExp(status));
});

test('a build listed under the wrong scenario is no candidate for that form, and the mismatch is reported', async () => {
  // The pressed scenic builds are filed as thrown, the thrown runs as scenic; the labels are swapped, the builds not.
  const r = await results();
  const relabel = (scenario: string) =>
    scenario.startsWith('scenic#')
      ? scenario.replace('scenic#', 'thrown#')
      : scenario.replace('thrown#', 'scenic#');
  const swapped = { ...r, runs: r.runs.map((x) => ({ ...x, scenario: relabel(x.scenario) })) };
  const plan = galleryPlan(matrix('stopped-at-deadline', 1), [swapped], scenarios, shipped);
  expect(plan.picks).toEqual([]);
  expect(plan.missing).toEqual(['scenic', 'thrown']);
  expect(plan.mismatches).toEqual([
    "2026-10-22-config-1.json thrown#1 (B-2026-10-22-scenic-1): its form is not thrown's form in scenarios.json",
    "2026-10-22-config-1.json thrown#2 (B-2026-10-22-scenic-2): its form is not thrown's form in scenarios.json",
  ]);
});

test('a build listed under the wrong configuration is no candidate for it, and the mismatch is reported', async () => {
  const file = JSON.stringify(await results());
  const read = () => Results.parse(JSON.parse(file));
  const e4b = { experiment: 'D', model: 'gemma4:e4b', promptVersion: 'v2' };
  // The results file claims E4B for configuration D, but its builds were made by E2B.
  const claimed = read();
  claimed.experiment = 'D';
  claimed.model.id = 'gemma4:e4b';
  const plan = galleryPlan(matrix('stopped-at-deadline', 2, [B, e4b]), [read(), claimed], scenarios, shipped);
  expect(plan.picks.map((p) => p.build.id)).toEqual(['B-2026-10-22-scenic-1']);
  expect(plan.mismatches).toEqual([
    '2026-10-22-config-2.json scenic#1 (B-2026-10-22-scenic-1): built by gemma4:e2b v2, the matrix declares D as gemma4:e4b v2',
    '2026-10-22-config-2.json scenic#2 (B-2026-10-22-scenic-2): built by gemma4:e2b v2, the matrix declares D as gemma4:e4b v2',
  ]);
  // The shipped slot holds builds another model made: none of them stands in for the shipped configuration.
  const foreign = read();
  for (const x of foreign.runs) if (x.run.end === 'done') x.run.build.model.id = 'gemma4:e4b';
  const misfiled = galleryPlan(matrix('stopped-at-deadline', 1), [foreign], scenarios, shipped);
  expect(misfiled.picks).toEqual([]);
  expect(misfiled.missing).toEqual(['scenic', 'thrown']);
  expect(misfiled.mismatches).toEqual([
    '2026-10-22-config-1.json scenic#1 (B-2026-10-22-scenic-1): built by gemma4:e4b v2, the matrix declares B as gemma4:e2b v2',
    '2026-10-22-config-1.json scenic#2 (B-2026-10-22-scenic-2): built by gemma4:e4b v2, the matrix declares B as gemma4:e2b v2',
  ]);
});
