import { EVAL_REPAIRS, LOCAL_CALL_TIMEOUT_MS, PROMPT_VERSIONS, SETTINGS } from '@pending/agent';
import type { PromptVersion as AgentPromptVersion, loaded, provenance } from '@pending/agent';
import { Attempt, Build, MAX_ATTEMPTS } from '@pending/contract';
import * as z from 'zod';
import { HEADLINE_K } from './budget';
import type { HeadlineK } from './budget';
import type { desktop, hardware } from './host';
import { attemptsOf, pressOrigin, replaysIdentically, summarize } from './metrics';
import type { ScenarioRun } from './metrics';
import { Role } from './scenarios';
import type { Scenario } from './scenarios';

// The results files are evidence: this schema is what a committed file must satisfy (issue #10, Tests).
const int = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const ms = z.number().min(0).max(Number.MAX_SAFE_INTEGER);
const Share = z.object({ hits: int, n: int }).refine((s) => s.hits <= s.n);
const Spread = z.object({ n: int, p50: ms.optional(), p95: ms.optional() });
const CallLatency = z.object({
  wallMs: Spread,
  warmMs: Spread,
  loadMs: Spread,
  promptMs: Spread,
  evalMs: Spread,
  promptTokens: Spread,
  evalTokens: Spread,
});
const Experiment = z.enum(['A', 'B', 'D']);
const ModelId = z.enum(['gemma4:e2b', 'gemma4:e4b']);
const PromptVersion = z.enum(PROMPT_VERSIONS);
const Iso = z.iso.datetime();

// The four groups the issue keeps apart: schema, catalogue, simulator-derived, latency.
export const Group = z.object({
  schema: z.object({ designReplies: Share, repairReplies: Share, scenariosDesigned: Share }),
  catalogue: z.object({ firstTime: Share, withinBudget: Share, violationKinds: z.record(z.string(), int) }),
  simulator: z.object({
    simulatedFailures: int,
    outcomeChangingRepairs: int,
    pressed: int,
    pressedRate: Share,
    pressedBy: z.object({ design: int, repair: int }),
    attemptsToPress: z.array(z.number().int().min(1).max(MAX_ATTEMPTS)),
    failureKinds: z.object({ 'ball.lost': int, 'ball.stopped': int, 'impulse.lost': int }),
    repairValidity: Share,
  }),
  latency: z.object({
    coldLoadMs: ms.optional(),
    design: CallLatency,
    repair: CallLatency,
    repairUnderAnimation: z.object({ calls: Share, p50: z.boolean().optional() }),
  }),
});

const Timing = z.object({
  wallMs: ms,
  firstChunkMs: ms.optional(),
  loadMs: ms.optional(),
  promptMs: ms.optional(),
  evalMs: ms.optional(),
  promptTokens: int.optional(),
  evalTokens: int.optional(),
  thinkingChars: int.optional(),
});
const CallRecord = z.object({
  kind: z.enum(['design', 'repair']),
  attempt: z.number().int().min(1).max(MAX_ATTEMPTS),
  tries: z.array(z.object({ timing: Timing, issues: z.array(z.string().max(300)).max(8) })).max(2),
  parsed: z.boolean(),
});
const Calls = z.array(CallRecord).max(MAX_ATTEMPTS);
const Attempts = z.array(Attempt).max(MAX_ATTEMPTS);
export const Run = z.discriminatedUnion('end', [
  z.object({ end: z.literal('done'), build: Build, calls: Calls }),
  z.object({ end: z.literal('MODEL_INVALID'), attempts: Attempts, calls: Calls }),
  z.object({ end: z.literal('ERROR'), error: z.string().max(300), attempts: Attempts, calls: Calls }),
]);
const RunRecord = z.object({ scenario: z.string().max(40), run: Run });
const Digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const Runtime = z.string().regex(/^ollama-[\w.+-]+$/);

// One row per build: the record issue #23 reads before it calls a gallery record approved.
export const Row = z.object({
  scenario: z.string().regex(/^[a-z]{1,16}$/),
  role: Role,
  rep: z.number().int().min(1).max(3),
  end: z.enum(['done', 'MODEL_INVALID', 'ERROR']),
  attempts: z.number().int().min(0).max(MAX_ATTEMPTS),
  lastOutcome: z.enum(['pressed', 'lost', 'stalled', 'invalid', 'none']),
  pressedBy: z.enum(['design', 'repair', 'not pressed']),
  pressedAttempt: z.number().int().min(1).max(MAX_ATTEMPTS).optional(),
  modelCalls: z.number().int().min(0).max(12),
  wallMs: ms,
  heldOutSeen: z.boolean().optional(),
  replayIdentical: z.boolean(),
});

export const K = z.object({
  headline: z.union(HEADLINE_K.map((k) => z.literal(k))),
  heldOut: z.literal(1),
  trap: z.literal(1),
  optionalTrap: z.union([z.literal(0), z.literal(1)]),
});

export const Results = z.object({
  experiment: Experiment,
  matrix: z.string().regex(/^[\w.-]+\.json$/),
  model: z.object({
    id: ModelId,
    digest: Digest,
    runtime: Runtime,
    sizeBytes: int,
  }),
  promptVersion: PromptVersion,
  settings: z.object({
    temperature: z.number(),
    numCtx: int,
    numPredict: int,
    think: z.literal(false),
    repairs: z.literal(5),
    callTimeoutMs: int,
  }),
  k: K,
  hardware: z.object({ cpu: z.string().max(100), threads: int, totalMiB: int }),
  desktop: z.object({ vscode: z.boolean(), browser: z.boolean() }),
  startedAt: Iso,
  finishedAt: Iso,
  memory: z.object({ minFreeMiB: int }),
  resident: z.array(z.object({ name: z.string().max(100), sizeBytes: int, vramBytes: int })).max(1),
  unloaded: z.boolean(),
  stoppedAtDeadline: z.boolean(),
  headline: Group,
  heldOut: Group,
  trap: Group,
  optionalTrap: Group.optional(),
  rows: z.array(Row).max(20),
  runs: z.array(RunRecord).max(20),
});
export type Results = z.infer<typeof Results>;

const PilotBuild = z.object({
  scenario: z.string().regex(/^[a-z]{1,16}$/),
  cold: z.boolean(),
  wallMs: ms,
  modelCalls: z.number().int().min(0).max(12),
});

const Configuration = z.object({
  experiment: Experiment,
  model: ModelId,
  promptVersion: PromptVersion,
  file: z.string().regex(/^[\w.-]+\.json$/),
});

// The pilot keeps every build's full run beside its timings, so a pilot that ends the evaluation can be diagnosed.
const PilotRun = z.object({
  model: ModelId,
  digest: Digest,
  runtime: Runtime,
  promptVersion: PromptVersion,
  builds: z.array(PilotBuild).max(8),
  runs: z.array(RunRecord).max(8),
  elapsedMs: ms,
  switchMs: ms,
});
export type PilotRun = z.infer<typeof PilotRun>;
const Started = z.object({ budgetMs: int, startedAt: Iso, finishedAt: Iso, elapsedMs: ms });
const MatrixBase = Started.extend({
  pilot: PilotRun.extend({
    builds: z.array(PilotBuild).min(2).max(8),
    stats: z.object({
      coldBuildMs: ms,
      warmBuildMs: z.object({ p50: ms, p95: ms }),
      coldStartOverheadMs: ms,
      modelCalls: z.object({ p50: int.optional(), p95: int.optional(), max: int }),
    }),
  }),
  factors: z.object({ e2b: z.literal(1), e4b: z.number().min(1), source: z.string().max(200) }),
  forecastMs: z.object({ 3: ms, 2: ms }),
});
export type MatrixBase = z.infer<typeof MatrixBase>;

// A pilot the deadline cut has no warm sample to forecast from; a matrix over budget ran no headline build;
// a complete one ran all three configurations, D on the better version.
export const Matrix = z.discriminatedUnion('status', [
  Started.extend({
    status: z.literal('stopped-in-pilot'),
    pilot: PilotRun,
    configurations: z.array(Configuration).length(0),
  }),
  MatrixBase.extend({
    status: z.literal('stopped-over-budget'),
    shortfallMs: ms.positive(),
    configurations: z.array(Configuration).length(0),
  }),
  MatrixBase.extend({
    status: z.literal('stopped-at-deadline'),
    plannedMs: ms,
    k: K,
    bestVersion: PromptVersion.optional(),
    configurations: z.array(Configuration).max(3),
  }),
  MatrixBase.extend({
    status: z.literal('complete'),
    plannedMs: ms,
    k: K,
    bestVersion: PromptVersion,
    configurations: z.array(Configuration).length(3),
  }),
]);
export type Matrix = z.infer<typeof Matrix>;

export type Item = { scenario: Scenario; rep: number };
export type Done = { item: Item; entry: ScenarioRun; wallMs: number };
// What one configuration's batch hands to its results file.
export type BatchOutcome = {
  prov: Awaited<ReturnType<typeof provenance>>;
  mem: { minFreeMiB: number };
  startedAt: string;
  finishedAt: string;
  done: Done[];
  resident: Awaited<ReturnType<typeof loaded>>;
  unloaded: boolean;
  stoppedAtDeadline: boolean;
};
export type Host = { hardware: ReturnType<typeof hardware>; desktop: Awaited<ReturnType<typeof desktop>> };

export const modelCalls = (entry: ScenarioRun): number =>
  entry.run.calls.reduce((n, c) => n + c.tries.length, 0);

export const runRecords = (done: readonly Done[]) =>
  done.map((d) => ({ scenario: `${d.item.scenario.id}#${d.item.rep}`, run: d.entry.run }));

function row(d: Done, version: AgentPromptVersion) {
  const attempts = attemptsOf(d.entry.run);
  const origin = pressOrigin(attempts);
  const { scenario } = d.item;
  return {
    scenario: scenario.id,
    role: scenario.role,
    rep: d.item.rep,
    end: d.entry.run.end,
    attempts: attempts.length,
    lastOutcome: attempts.at(-1)?.outcome ?? 'none',
    pressedBy: origin?.by ?? 'not pressed',
    ...(origin === undefined ? {} : { pressedAttempt: origin.attempt }),
    modelCalls: modelCalls(d.entry),
    wallMs: Math.round(d.wallMs),
    ...(scenario.unseenBy === undefined ? {} : { heldOutSeen: !scenario.unseenBy.includes(version) }),
    replayIdentical: attempts.every(replaysIdentically),
  };
}

// Each role is summarised on its own, so the held-out form and the traps never enter a headline rate.
export function resultsRecord(
  config: { experiment: Results['experiment']; model: Results['model']['id']; version: AgentPromptVersion },
  plan: { k: HeadlineK; optionalTrap: boolean; matrix: string },
  b: BatchOutcome,
  host: Host,
) {
  const group = (role: Role) => {
    const runs = b.done.filter((d) => d.item.scenario.role === role).map((d) => d.entry);
    return summarize(runs, runs.length);
  };
  return {
    experiment: config.experiment,
    matrix: plan.matrix,
    model: { id: config.model, ...b.prov },
    promptVersion: config.version,
    settings: { ...SETTINGS, think: false, repairs: EVAL_REPAIRS, callTimeoutMs: LOCAL_CALL_TIMEOUT_MS },
    k: { headline: plan.k, heldOut: 1, trap: 1, optionalTrap: plan.optionalTrap ? 1 : 0 },
    ...host,
    startedAt: b.startedAt,
    finishedAt: b.finishedAt,
    memory: b.mem,
    resident: b.resident,
    unloaded: b.unloaded,
    stoppedAtDeadline: b.stoppedAtDeadline,
    headline: group('headline'),
    heldOut: group('held-out'),
    trap: group('trap'),
    ...(plan.optionalTrap ? { optionalTrap: group('optional-trap') } : {}),
    rows: b.done.map((d) => row(d, config.version)),
    runs: runRecords(b.done),
  };
}

const share = (s: { hits: number; n: number }) => `${s.hits}/${s.n}`;
const num = (v: number | undefined) => (v === undefined ? '-' : (v / 1000).toFixed(1));

export function resultsMarkdown(r: Results, stem: string): string {
  const group = (name: string, g: z.infer<typeof Group>) =>
    [
      `## ${name}`,
      '',
      `Schema: design replies ${share(g.schema.designReplies)}, repair replies ${share(g.schema.repairReplies)}, builds designed ${share(g.schema.scenariosDesigned)}.`,
      `Catalogue: valid first time ${share(g.catalogue.firstTime)}, within the repair budget ${share(g.catalogue.withinBudget)}; violation kinds ${JSON.stringify(g.catalogue.violationKinds)}.`,
      `Simulator: pressed ${share(g.simulator.pressedRate)} (by design ${g.simulator.pressedBy.design}, by repair ${g.simulator.pressedBy.repair}; attempts to press ${JSON.stringify(g.simulator.attemptsToPress)}); failure kinds ${JSON.stringify(g.simulator.failureKinds)}; repair validity ${share(g.simulator.repairValidity)}; outcome-changing repairs ${g.simulator.outcomeChangingRepairs}.`,
      `Latency (s): design wall p50 ${num(g.latency.design.wallMs.p50)} p95 ${num(g.latency.design.wallMs.p95)}, warm p95 ${num(g.latency.design.warmMs.p95)}; repair wall p50 ${num(g.latency.repair.wallMs.p50)} p95 ${num(g.latency.repair.wallMs.p95)}; cold load ${num(g.latency.coldLoadMs)}; repairs under the animation ${share(g.latency.repairUnderAnimation.calls)}, p50 under it: ${String(g.latency.repairUnderAnimation.p50 ?? '-')}.`,
      `Tokens p50: design prompt ${g.latency.design.promptTokens.p50 ?? '-'} / eval ${g.latency.design.evalTokens.p50 ?? '-'}, repair prompt ${g.latency.repair.promptTokens.p50 ?? '-'} / eval ${g.latency.repair.evalTokens.p50 ?? '-'}.`,
      '',
    ].join('\n');
  return [
    `# ${stem}`,
    '',
    `Experiment ${r.experiment}: ${r.model.id} (${r.model.digest}, ${r.model.runtime}), PROMPT_VERSION ${r.promptVersion}, k = ${r.k.headline} per headline form, 1 for the held-out form and the trap; ${r.settings.repairs} repairs; think off, temperature ${r.settings.temperature}, num_ctx ${r.settings.numCtx}, num_predict ${r.settings.numPredict}. RAM headroom ${r.memory.minFreeMiB} MiB free at the lowest. Matrix: ${r.matrix}.${r.stoppedAtDeadline ? ' **Stopped at the budget deadline.**' : ''}`,
    '',
    group(`Headline (${r.k.headline} × 5 builds)`, r.headline),
    group('Held-out (1 build, own row, not in the headline rates)', r.heldOut),
    group('Trap: just say it worked (1 build, own row)', r.trap),
    ...(r.optionalTrap === undefined
      ? []
      : [group('Optional trap: the sloth (1 build, own row)', r.optionalTrap)]),
    '## Builds',
    '',
    '| scenario | role | rep | end | attempts | last outcome | pressed by | model calls | wall s | replay |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...r.rows.map(
      (w) =>
        `| ${w.scenario} | ${w.role}${w.heldOutSeen === undefined ? '' : w.heldOutSeen ? ' (seen)' : ' (unseen)'} | ${w.rep} | ${w.end} | ${w.attempts} | ${w.lastOutcome} | ${w.pressedBy}${w.pressedAttempt === undefined ? '' : ` @${w.pressedAttempt}`} | ${w.modelCalls} | ${num(w.wallMs)} | ${w.replayIdentical ? 'identical' : 'DIFFERS'} |`,
    ),
    '',
  ].join('\n');
}

// The E2B-versus-E4B table: the only source the README and the write-up quote. Every cell carries its n.
export function matrixMarkdown(m: Matrix, configs: readonly Results[], stem: string): string {
  const cols = configs.map((c) => `${c.experiment}: ${c.model.id} ${c.promptVersion}`);
  const row = (name: string, cell: (r: Results) => string) =>
    `| ${name} | ${configs.map(cell).join(' | ')} |`;
  const h = (r: Results) => r.headline;
  const lat = (s: z.infer<typeof Spread>) => `${num(s.p50)} / ${num(s.p95)} (n ${s.n})`;
  const status = `Status: **${m.status}**. Budget ${num(m.budgetMs)} s of machine time; elapsed ${num(m.elapsedMs)} s.`;
  if (m.status === 'stopped-in-pilot')
    return [
      `# ${stem}`,
      '',
      status,
      `The pilot reached the budget deadline after ${m.pilot.builds.length} builds on ${m.pilot.model} ${m.pilot.promptVersion} (${m.pilot.builds.map((b) => `${b.scenario} ${num(b.wallMs)} s`).join(', ')}); no forecast, no headline runs; the maintainer decides.`,
      '',
    ].join('\n');
  return [
    `# ${stem}`,
    '',
    status,
    `Pilot: ${m.pilot.builds.length} builds on ${m.pilot.model} ${m.pilot.promptVersion} in ${num(m.pilot.elapsedMs)} s; cold build ${num(m.pilot.stats.coldBuildMs)} s, warm build p50 ${num(m.pilot.stats.warmBuildMs.p50)} s, p95 ${num(m.pilot.stats.warmBuildMs.p95)} s, cold-start overhead ${num(m.pilot.stats.coldStartOverheadMs)} s; model calls per build p50 ${m.pilot.stats.modelCalls.p50 ?? '-'}, max ${m.pilot.stats.modelCalls.max}; model switch ${num(m.pilot.switchMs)} s.`,
    `Speed factor E4B/E2B ${m.factors.e4b.toFixed(2)} (${m.factors.source}).`,
    `Forecast for the whole matrix, pilot included: k = 3 ${num(m.forecastMs[3])} s, k = 2 ${num(m.forecastMs[2])} s${m.status === 'stopped-over-budget' ? `; **shortfall ${num(m.shortfallMs)} s**` : `; planned ${num(m.plannedMs)} s`}.`,
    m.status === 'stopped-over-budget'
      ? 'No headline runs: the minimum matrix does not fit the budget; the maintainer decides.'
      : `Chosen k = ${m.k.headline} per headline form; held-out and trap k = 1; optional trap ${m.k.optionalTrap === 1 ? 'run' : 'not run'}. D used ${m.bestVersion ?? '-'}.`,
    '',
    ...(configs.length === 0
      ? []
      : [
          `## E2B versus E4B (headline: ${configs.map((c) => `${c.experiment} ${c.k.headline} builds per form × 5`).join(', ')})`,
          '',
          `| measure | ${cols.join(' | ')} |`,
          `|---|${cols.map(() => '---').join('|')}|`,
          row('schema-valid builds', (r) => share(h(r).schema.scenariosDesigned)),
          row('catalogue-valid first time', (r) => share(h(r).catalogue.firstTime)),
          row('catalogue-valid within repairs', (r) => share(h(r).catalogue.withinBudget)),
          row('repair validity (C)', (r) => share(h(r).simulator.repairValidity)),
          row(
            'outcome-changing repairs / repair calls',
            (r) => `${h(r).simulator.outcomeChangingRepairs}/${h(r).simulator.repairValidity.n}`,
          ),
          row(
            'presses (design + repair)',
            (r) =>
              `${share(h(r).simulator.pressedRate)} (${h(r).simulator.pressedBy.design} + ${h(r).simulator.pressedBy.repair})`,
          ),
          row('design wall p50 / p95 s', (r) => lat(h(r).latency.design.wallMs)),
          row('design warm p50 / p95 s', (r) => lat(h(r).latency.design.warmMs)),
          row('repair wall p50 / p95 s', (r) => lat(h(r).latency.repair.wallMs)),
          row('repairs under the animation', (r) => share(h(r).latency.repairUnderAnimation.calls)),
          row('cold load s', (r) => num(h(r).latency.coldLoadMs)),
          row('RAM headroom (min free MiB)', (r) => String(r.memory.minFreeMiB)),
          '',
          '| row | ' + cols.join(' | ') + ' |',
          `|---|${cols.map(() => '---').join('|')}|`,
          ...(['heldOut', 'trap', 'optionalTrap'] as const).map((g) =>
            row(g, (r) => {
              const s = r[g];
              return s === undefined
                ? '-'
                : `pressed ${share(s.simulator.pressedRate)}, valid within repairs ${share(s.catalogue.withinBudget)}`;
            }),
          ),
          '',
        ]),
  ].join('\n');
}
