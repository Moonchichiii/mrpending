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
import { Matrix, Results, resultsRecord } from './results';
import type { Done } from './results';
import type { Role } from './scenarios';

const form = Form.parse(lostForm);
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
      form,
      system: 'instructions',
      promptVersion: 'v2',
      model: { mode: 'local', id: 'gemma4:e2b', host: 'ollama', digest, runtime: 'ollama-0.13.0' },
      repairs: 5,
      infer,
      signal: new AbortController().signal,
      now: () => new Date('2026-10-22T12:00:00.000Z'),
    }),
  );
  return { item: { scenario: { id, role, form }, rep }, entry, wallMs: 1700 };
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

const forms = ['scenic', 'thrown'];
const stats = {
  coldBuildMs: 60_000,
  warmBuildMs: { p50: 30_000, p95: 30_000 },
  coldStartOverheadMs: 30_000,
  modelCalls: { p50: 2, p95: 2, max: 2 },
};
const matrix = (status: string, configurations: number) =>
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
    configurations: Array.from({ length: configurations }, () => ({
      experiment: 'B',
      model: 'gemma4:e2b',
      promptVersion: 'v2',
      file: '2026-10-22-gemma4-e2b-v2-B.json',
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
    expect(galleryPlan(matrix('complete', 3), [r, r, r], forms, shipped)).toEqual({
      picks: [],
      missing: ['scenic', 'thrown'],
    });
  }
  const clean = Results.parse(JSON.parse(file));
  const plan = galleryPlan(matrix('complete', 3), [clean, clean, clean], forms, shipped);
  expect(plan.picks.map((p) => [p.form, p.build.id, p.build.report.pressed])).toEqual([
    ['scenic', 'B-2026-10-22-scenic-1', true],
  ]);
  expect(plan.missing).toEqual(['thrown']);
});

test('the gallery reads a matrix stopped at the deadline once the shipped configuration finished, and refuses the rest', async () => {
  const finished = await results();
  const plan = galleryPlan(matrix('stopped-at-deadline', 1), [finished], forms, shipped);
  expect(plan.picks.map((p) => p.form)).toEqual(['scenic']);
  // The shipped configuration was cut, or lost a build, or never ran.
  const cut = await results(true);
  expect(() => galleryPlan(matrix('stopped-at-deadline', 1), [cut], forms, shipped)).toThrow(
    /did not finish all its builds/,
  );
  const short = { ...finished, runs: finished.runs.slice(1) };
  expect(() => galleryPlan(matrix('stopped-at-deadline', 1), [short], forms, shipped)).toThrow(
    /did not finish all its builds/,
  );
  const v1 = { ...finished, promptVersion: 'v1' as const };
  expect(() => galleryPlan(matrix('stopped-at-deadline', 1), [v1], forms, shipped)).toThrow(
    /did not finish all its builds/,
  );
  for (const status of ['stopped-in-pilot', 'stopped-over-budget'])
    expect(() => galleryPlan(matrix(status, 0), [], forms, shipped)).toThrow(new RegExp(status));
});
