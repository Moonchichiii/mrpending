import { runBuild } from '@pending/agent';
import type { Infer, PromptVersion } from '@pending/agent';
import { Form } from '@pending/contract';
import { expect, test } from 'vitest';
import lostBlueprint from '../../packages/machine/fixtures/lost/blueprint.json';
import lostForm from '../../packages/machine/fixtures/lost/form.json';
import pressedBlueprint from '../../packages/machine/fixtures/pressed/blueprint.json';
import repairedPatch from '../../packages/machine/fixtures/repaired/patch.json';
import { recorded } from './metrics';
import { Matrix, Results, resultsRecord, runRecords } from './results';
import type { Done } from './results';
import type { Role } from './scenarios';

const form = Form.parse(lostForm);
const memo = 'More catapult.';
const replies: Record<Role, { design: unknown; repair: unknown }> = {
  headline: { design: { blueprint: lostBlueprint, memo }, repair: { patch: repairedPatch, memo } },
  'held-out': { design: { blueprint: pressedBlueprint, memo }, repair: undefined },
  trap: { design: { memo: 'It worked.' }, repair: undefined },
  'optional-trap': { design: undefined, repair: undefined },
};

async function done(id: string, role: Role): Promise<Done> {
  const infer: Infer = async (call) => ({
    value: replies[role][call.kind],
    timing: { wallMs: 800, loadMs: 100, promptTokens: 900, evalTokens: 300 },
  });
  const entry = await recorded(
    id,
    runBuild({
      id: `A-2026-10-22-${id}-1`,
      form,
      system: 'instructions',
      promptVersion: 'v1',
      model: {
        mode: 'local',
        id: 'gemma4:e2b',
        host: 'ollama',
        digest: `sha256:${'a'.repeat(64)}`,
        runtime: 'ollama-0.13.0',
      },
      repairs: 5,
      infer,
      signal: new AbortController().signal,
      now: () => new Date('2026-10-22T12:00:00.000Z'),
    }),
  );
  const unseenBy: PromptVersion[] = ['v1'];
  const scenario = { id, role, form, ...(role === 'held-out' ? { unseenBy } : {}) };
  return { item: { scenario, rep: 1 }, entry, wallMs: 1700 };
}

async function record() {
  return resultsRecord(
    { experiment: 'A', model: 'gemma4:e2b', version: 'v1' },
    { k: 2, optionalTrap: false, matrix: '2026-10-22-eval.json' },
    {
      prov: { digest: `sha256:${'a'.repeat(64)}`, runtime: 'ollama-0.13.0', sizeBytes: 7_000_000_000 },
      mem: { minFreeMiB: 4096 },
      startedAt: '2026-10-22T12:00:00.000Z',
      finishedAt: '2026-10-22T12:10:00.000Z',
      done: [
        await done('scenic', 'headline'),
        await done('downhill', 'held-out'),
        await done('trap', 'trap'),
      ],
      resident: [{ name: 'gemma4:e2b', sizeBytes: 7_000_000_000, vramBytes: 0 }],
      unloaded: true,
      stoppedAtDeadline: false,
    },
    {
      hardware: { cpu: 'test cpu', threads: 8, totalMiB: 16384 },
      desktop: { vscode: true, browser: true },
    },
  );
}

test('a results record from real builds passes the results schema, each role in its own group', async () => {
  const r = Results.parse(await record());
  expect(r.headline.simulator).toMatchObject({
    pressedRate: { hits: 1, n: 1 },
    pressedBy: { design: 0, repair: 1 },
  });
  expect(r.heldOut.simulator.pressedBy).toEqual({ design: 1, repair: 0 });
  expect(r.trap.schema.scenariosDesigned).toEqual({ hits: 0, n: 1 });
  expect(r.rows.map((w) => [w.scenario, w.end, w.pressedBy, w.pressedAttempt])).toEqual([
    ['scenic', 'done', 'repair', 2],
    ['downhill', 'done', 'design', 1],
    ['trap', 'MODEL_INVALID', 'not pressed', undefined],
  ]);
  expect(r.rows[1]?.heldOutSeen).toBe(false);
});

test('the schema refuses a record without a press origin, a share above its n, or a model without its digest', async () => {
  const r = await record();
  const [first, ...rest] = r.rows;
  if (first === undefined) throw new Error('the record has no rows');
  const noOrigin = Object.fromEntries(Object.entries(first).filter(([key]) => key !== 'pressedBy'));
  expect(Results.safeParse({ ...r, rows: [noOrigin, ...rest] }).success).toBe(false);
  const over = { ...r.headline, simulator: { ...r.headline.simulator, pressedRate: { hits: 2, n: 1 } } };
  expect(Results.safeParse({ ...r, headline: over }).success).toBe(false);
  expect(Results.safeParse({ ...r, model: { ...r.model, digest: 'latest' } }).success).toBe(false);
});

test('a matrix over budget carries its shortfall and no configuration; a complete one carries all three', async () => {
  const runs = runRecords([await done('scenic', 'headline'), await done('thrown', 'headline')]);
  const base = {
    budgetMs: 10_800_000,
    startedAt: '2026-10-22T12:00:00.000Z',
    finishedAt: '2026-10-22T12:20:00.000Z',
    elapsedMs: 1_200_000,
    pilot: {
      model: 'gemma4:e2b',
      digest: `sha256:${'a'.repeat(64)}`,
      runtime: 'ollama-0.13.0',
      promptVersion: 'v2',
      builds: [
        { scenario: 'scenic', cold: true, wallMs: 60_000, modelCalls: 2 },
        { scenario: 'thrown', cold: false, wallMs: 30_000, modelCalls: 4 },
      ],
      runs,
      elapsedMs: 95_000,
      switchMs: 5000,
      stats: {
        coldBuildMs: 60_000,
        warmBuildMs: { p50: 30_000, p95: 30_000 },
        coldStartOverheadMs: 30_000,
        modelCalls: { p50: 2, p95: 4, max: 4 },
      },
    },
    factors: { e2b: 1, e4b: 2.1, source: 'spike' },
    forecastMs: { 3: 12_000_000, 2: 11_000_000 },
  };
  const a = {
    experiment: 'A',
    model: 'gemma4:e2b',
    promptVersion: 'v1',
    file: '2026-10-22-gemma4-e2b-v1-A.json',
  };
  const over = { ...base, status: 'stopped-over-budget', shortfallMs: 200_000, configurations: [] };
  expect(Matrix.safeParse(over).success).toBe(true);
  expect(Matrix.safeParse({ ...over, configurations: [a] }).success).toBe(false);
  expect(Matrix.safeParse({ ...over, shortfallMs: undefined }).success).toBe(false);
  // The pilot's runs are its evidence: a matrix that drops them is refused.
  expect(Matrix.safeParse({ ...over, pilot: { ...base.pilot, runs: undefined } }).success).toBe(false);
  // One cold build and no warm one: only the stopped-in-pilot record accepts it.
  const inPilot = {
    ...base,
    status: 'stopped-in-pilot',
    pilot: { ...base.pilot, builds: base.pilot.builds.slice(0, 1), runs: runs.slice(0, 1) },
    configurations: [],
  };
  expect(Matrix.safeParse(inPilot).success).toBe(true);
  expect(Matrix.safeParse({ ...inPilot, configurations: [a] }).success).toBe(false);
  const k = { headline: 2, heldOut: 1, trap: 1, optionalTrap: 0 };
  const complete = {
    ...base,
    status: 'complete',
    plannedMs: 10_000_000,
    k,
    bestVersion: 'v2',
    configurations: [a, a],
  };
  expect(Matrix.safeParse(complete).success).toBe(false);
  expect(Matrix.safeParse({ ...complete, configurations: [a, a, a] }).success).toBe(true);
});
