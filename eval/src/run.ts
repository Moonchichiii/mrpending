// The evaluation (issue #10): a pilot, a budgeted k, then experiments A, B (with C on B's runs) and D, one model
// loaded at a time. Run from the repository root; both commands exit non-zero on a budget shortfall or a schema failure.
//   bun eval/src/run.ts                                         pilot, plan, matrix; writes eval/results/
//   bun eval/src/run.ts --gallery eval/results/<date>-eval.json   Build records into apps/web/public/gallery/
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  EVAL_REPAIRS,
  PROMPT_VERSION,
  instructions,
  loaded,
  ollamaInfer,
  parseEnv,
  provenance,
  runBuild,
} from '@pending/agent';
import type { PromptVersion } from '@pending/agent';
import { RULES_VERSION } from '@pending/machine';
import * as z from 'zod';
import { BUDGET_MS, pilotStats, plan } from './budget';
import type { Pilot } from './budget';
import { desktop, freeMiB, hardware, sampled, unloadAndConfirm } from './host';
import { better, recorded, replaysIdentically } from './metrics';
import {
  Matrix,
  Results,
  matrixMarkdown,
  modelCalls,
  resultsMarkdown,
  resultsRecord,
  runRecords,
} from './results';
import type { BatchOutcome, Done, Host, Item, MatrixBase, PilotRun } from './results';
import { loadScenarios } from './scenarios';

const E2B = 'gemma4:e2b';
const E4B = 'gemma4:e4b';
type ModelId = typeof E2B | typeof E4B;
type Experiment = Results['experiment'];
const RESULTS = new URL('../results/', import.meta.url);
const GALLERY = new URL('../../apps/web/public/gallery/', import.meta.url);
// The spike's runs of the same version on both models give the speed ratio the forecast applies to E4B.
const SPIKE = { e2b: '2026-10-22-gemma4-e2b-v2.json', e4b: '2026-10-22-gemma4-e4b-v2.json' } as const;

const say = (line: string) => process.stdout.write(`${line}\n`);
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;
const readJson = async (url: URL): Promise<unknown> => {
  const raw: unknown = JSON.parse(await readFile(url, 'utf8'));
  return raw;
};

type Context = { url: string; deadline: number; date: string };

// One configuration, one model loaded: every build gets what is left of the budget as its signal, so the matrix
// can never run past the deadline; a build cut there is recorded like any other unfinished one.
async function batch(
  ctx: Context,
  tag: string,
  model: ModelId,
  version: PromptVersion,
  items: readonly Item[],
): Promise<BatchOutcome & { unloadMs: number }> {
  if ((await loaded(ctx.url)).length > 0) throw new Error('a model is still loaded; ollama stop it first');
  const prov = await provenance(ctx.url, model);
  const mem = { minFreeMiB: freeMiB() };
  const infer = sampled(ollamaInfer(ctx.url, model), mem);
  const startedAt = new Date().toISOString();
  const done: Done[] = [];
  let resident: Awaited<ReturnType<typeof loaded>> = [];
  let stoppedAtDeadline = false;
  let unloaded = false;
  let unloadMs = 0;
  try {
    for (const [i, item] of items.entries()) {
      const left = ctx.deadline - performance.now();
      if (left <= 0) {
        stoppedAtDeadline = true;
        break;
      }
      const t0 = performance.now();
      const entry = await recorded(
        item.scenario.id,
        runBuild({
          id: `${tag}-${ctx.date}-${item.scenario.id}-${item.rep}`,
          form: item.scenario.form,
          system: instructions(version),
          promptVersion: version,
          model: { mode: 'local', id: model, host: 'ollama', digest: prov.digest, runtime: prov.runtime },
          repairs: EVAL_REPAIRS,
          infer,
          // AbortSignal.timeout takes whole milliseconds; flooring keeps the build inside the budget.
          signal: AbortSignal.timeout(Math.floor(left)),
          now: () => new Date(),
        }),
      );
      const wallMs = performance.now() - t0;
      done.push({ item, entry, wallMs });
      say(
        `${tag} [${i + 1}/${items.length}] ${item.scenario.id}#${item.rep}: ${entry.run.end}, ${modelCalls(entry)} calls, ${seconds(wallMs)}; ${seconds(Math.max(0, ctx.deadline - performance.now()))} of budget left`,
      );
      if (resident.length === 0) resident = await loaded(ctx.url);
      if (performance.now() >= ctx.deadline) {
        stoppedAtDeadline = true;
        break;
      }
    }
  } finally {
    const t0 = performance.now();
    unloaded = await unloadAndConfirm(ctx.url, model);
    unloadMs = performance.now() - t0;
  }
  return {
    prov,
    mem,
    startedAt,
    finishedAt: new Date().toISOString(),
    done,
    resident,
    unloaded,
    unloadMs,
    stoppedAtDeadline,
  };
}

const SpikeRuns = z.object({
  runs: z
    .array(
      z.object({
        run: z.object({
          calls: z.array(
            z.object({ tries: z.array(z.object({ timing: z.object({ wallMs: z.number() }) })) }),
          ),
        }),
      }),
    )
    .min(1),
});
async function e4bFactor() {
  const mean = async (file: string) => {
    const walls = SpikeRuns.parse(await readJson(new URL(file, RESULTS))).runs.flatMap((r) =>
      r.run.calls.flatMap((c) => c.tries.map((t) => t.timing.wallMs)),
    );
    return walls.reduce((a, b) => a + b, 0) / walls.length;
  };
  const ratio = (await mean(SPIKE.e4b)) / (await mean(SPIKE.e2b));
  return {
    e2b: 1 as const,
    e4b: Math.max(1, ratio),
    source: `mean wall per model call, ${SPIKE.e4b} over ${SPIKE.e2b}`,
  };
}

async function evaluate() {
  // The eval measures local inference only and serves no page, so those two settings are fixed here.
  const env = parseEnv({ ...process.env, INFERENCE_MODE: 'local', WEB_ORIGIN: 'http://127.0.0.1:5173' });
  const all = await loadScenarios();
  const core = all.filter((s) => s.role !== 'optional-trap');
  const startedAt = new Date().toISOString();
  const date = startedAt.slice(0, 10);
  const started = performance.now();
  const ctx: Context = { url: env.OLLAMA_URL, deadline: started + BUDGET_MS, date };
  // Both models must be pulled before anything runs; the eval never downloads one.
  await provenance(ctx.url, E2B);
  await provenance(ctx.url, E4B);
  const host: Host = { hardware: hardware(), desktop: await desktop() };
  const matrixStem = `${date}-eval`;
  await mkdir(RESULTS, { recursive: true });
  const ended = () => ({ finishedAt: new Date().toISOString(), elapsedMs: performance.now() - started });
  const write = async (m: Matrix, configs: Results[]) => {
    const matrix = Matrix.parse(m);
    await writeFile(new URL(`${matrixStem}.json`, RESULTS), json(matrix));
    await writeFile(new URL(`${matrixStem}.md`, RESULTS), matrixMarkdown(matrix, configs, matrixStem));
    say(`wrote eval/results/${matrixStem}.json and .md: ${matrix.status}`);
  };

  say(`budget ${seconds(BUDGET_MS)} of machine time, pilot included`);
  say(`pilot: one build per form (${core.length}) on ${E2B} ${PROMPT_VERSION}`);
  const pilotRun = await batch(
    ctx,
    'P',
    E2B,
    PROMPT_VERSION,
    core.map((scenario) => ({ scenario, rep: 1 })),
  );
  const pilot: Pilot = {
    builds: pilotRun.done.map((d, i) => ({
      scenario: d.item.scenario.id,
      cold: i === 0,
      wallMs: Math.round(d.wallMs),
      modelCalls: modelCalls(d.entry),
    })),
    elapsedMs: performance.now() - started,
    switchMs: pilotRun.unloadMs,
  };
  const pilotRecord: PilotRun = {
    model: E2B,
    digest: pilotRun.prov.digest,
    runtime: pilotRun.prov.runtime,
    promptVersion: PROMPT_VERSION,
    ...pilot,
    runs: runRecords(pilotRun.done),
  };
  // A pilot cut by the deadline used the whole budget and has no warm sample to plan from; its builds are the record.
  if (pilotRun.stoppedAtDeadline) {
    await write(
      {
        budgetMs: BUDGET_MS,
        startedAt,
        ...ended(),
        status: 'stopped-in-pilot',
        pilot: pilotRecord,
        configurations: [],
      },
      [],
    );
    say(
      `stopped: the pilot reached the budget deadline after ${pilot.builds.length} builds; the maintainer decides`,
    );
    process.exitCode = 1;
    return;
  }
  const factors = await e4bFactor();
  const forms = { headline: 5, single: 2, optional: all.length - core.length };
  const decided = plan(pilot, [factors.e2b, factors.e2b, factors.e4b], forms);
  const stats = pilotStats(pilot);
  const base: Omit<MatrixBase, 'finishedAt' | 'elapsedMs'> = {
    budgetMs: BUDGET_MS,
    startedAt,
    pilot: { ...pilotRecord, stats },
    factors,
    forecastMs: decided.forecastMs,
  };
  say(
    `pilot: ${seconds(pilot.elapsedMs)}; cold build ${seconds(stats.coldBuildMs)}, warm p95 ${seconds(stats.warmBuildMs.p95)}, model switch ${seconds(pilot.switchMs)}, E4B factor ${factors.e4b.toFixed(2)}`,
  );
  say(
    `forecast, pilot included: k = 3 ${seconds(decided.forecastMs[3])}, k = 2 ${seconds(decided.forecastMs[2])}`,
  );
  if (!decided.go) {
    await write(
      {
        ...base,
        ...ended(),
        status: 'stopped-over-budget',
        shortfallMs: decided.shortfallMs,
        configurations: [],
      },
      [],
    );
    say(
      `stopped: the minimum matrix (k = 2) is forecast ${seconds(decided.shortfallMs)} over budget; the maintainer decides`,
    );
    process.exitCode = 1;
    return;
  }

  const { k, optionalTrap } = decided;
  say(
    `plan: A ${E2B} v1, B ${E2B} v2 (C on B's runs), D ${E4B} on the better; k = ${k} per headline form, held-out and trap 1, optional trap ${optionalTrap ? 'in' : 'out'}; planned ${seconds(decided.plannedMs)}`,
  );
  const items = all.flatMap((scenario): Item[] => {
    if (scenario.role === 'headline') return Array.from({ length: k }, (_, i) => ({ scenario, rep: i + 1 }));
    if (scenario.role === 'optional-trap') return optionalTrap ? [{ scenario, rep: 1 }] : [];
    return [{ scenario, rep: 1 }];
  });
  // The optional trap runs after the headline, held-out and trap builds of each batch.
  const ordered = [
    ...items.filter((i) => i.scenario.role !== 'optional-trap'),
    ...items.filter((i) => i.scenario.role === 'optional-trap'),
  ];
  const configs: Results[] = [];
  const configurations: Matrix['configurations'] = [];
  const run = async (experiment: Experiment, model: ModelId, version: PromptVersion) => {
    say(`experiment ${experiment}: ${model} ${version}, ${ordered.length} builds`);
    const b = await batch(ctx, experiment, model, version, ordered);
    const record = resultsRecord(
      { experiment, model, version },
      { k, optionalTrap, matrix: `${matrixStem}.json` },
      b,
      host,
    );
    const stem = `${date}-${model.replace(':', '-')}-${version}-${experiment}`;
    // Written before it is checked, so a record the schema refuses is still kept as evidence of the run.
    await writeFile(new URL(`${stem}.json`, RESULTS), json(record));
    const r = Results.parse(record);
    await writeFile(new URL(`${stem}.md`, RESULTS), resultsMarkdown(r, stem));
    configs.push(r);
    configurations.push({ experiment, model, promptVersion: version, file: `${stem}.json` });
    say(`wrote eval/results/${stem}.json and .md`);
    return r;
  };
  const stopped = () => configs.some((c) => c.stoppedAtDeadline);
  const a = await run('A', E2B, 'v1');
  const b = stopped() ? undefined : await run('B', E2B, 'v2');
  const best =
    b === undefined
      ? undefined
      : better(
          { version: a.promptVersion, summary: a.headline },
          { version: b.promptVersion, summary: b.headline },
          PROMPT_VERSION,
        );
  if (best !== undefined && !stopped()) await run('D', E4B, best);
  const kRecord: Results['k'] = { headline: k, heldOut: 1, trap: 1, optionalTrap: optionalTrap ? 1 : 0 };
  const planned = { ...base, ...ended(), plannedMs: decided.plannedMs, k: kRecord, configurations };
  await write(
    best !== undefined && !stopped() && configs.length === 3
      ? { ...planned, status: 'complete', bestVersion: best }
      : { ...planned, status: 'stopped-at-deadline', ...(best === undefined ? {} : { bestVersion: best }) },
    configs,
  );
  if (stopped()) {
    say('stopped at the budget deadline; the matrix is incomplete');
    process.exitCode = 1;
  }
}

// One record per headline form, from a complete matrix: the shipped configuration (E2B, PROMPT_VERSION) first,
// its first pressed build, else the first pressed or finished one elsewhere; each is checked as the gallery will
// check it (current rules, Ollama provenance, byte-identical replay) before it is written.
async function gallery(file: string) {
  const matrixUrl = pathToFileURL(file);
  const m = Matrix.parse(await readJson(matrixUrl));
  if (m.status !== 'complete') throw new Error(`${file} is ${m.status}; the gallery needs a complete matrix`);
  const shipped = (c: Matrix['configurations'][number]) =>
    c.model === E2B && c.promptVersion === PROMPT_VERSION;
  const order = [...m.configurations.filter(shipped), ...m.configurations.filter((c) => !shipped(c))];
  const configs = await Promise.all(
    order.map(async (c) => Results.parse(await readJson(new URL(c.file, matrixUrl)))),
  );
  const finished = configs.flatMap((r) =>
    r.runs.flatMap((x) =>
      x.run.end === 'done' ? [{ scenario: x.scenario.split('#')[0], build: x.run.build }] : [],
    ),
  );
  const headline = new Set(
    configs.flatMap((r) => r.rows.filter((w) => w.role === 'headline').map((w) => w.scenario)),
  );
  // Every form is picked and checked before anything is written, so the gallery never mixes two matrices.
  const picks = [...headline].map((scenario) => {
    const builds = finished.filter((f) => f.scenario === scenario).map((f) => f.build);
    return { scenario, build: builds.find((x) => x.report.pressed) ?? builds[0] };
  });
  const chosen = picks.flatMap(({ scenario, build }) => (build === undefined ? [] : [{ scenario, build }]));
  const missing = picks.filter((p) => p.build === undefined).map((p) => p.scenario);
  if (missing.length > 0) throw new Error(`${file} has no finished build for ${missing.join(', ')}`);
  for (const { build } of chosen) {
    const ok =
      build.rulesVersion === RULES_VERSION &&
      build.model.host === 'ollama' &&
      build.model.digest !== undefined &&
      build.model.runtime !== undefined &&
      build.attempts.every(replaysIdentically);
    if (!ok) throw new Error(`${build.id} fails the gallery checks`);
  }
  await mkdir(GALLERY, { recursive: true });
  for (const { scenario, build } of chosen) {
    await writeFile(new URL(`${scenario}.json`, GALLERY), json(build));
    say(
      `wrote apps/web/public/gallery/${scenario}.json from ${build.id} (${build.model.id}, ${build.promptVersion}, ${build.report.pressed ? 'pressed' : 'not pressed'})`,
    );
  }
}

const { values } = parseArgs({ options: { gallery: { type: 'string' } } });
await (values.gallery === undefined ? evaluate() : gallery(values.gallery));
