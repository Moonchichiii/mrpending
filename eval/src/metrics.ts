import { BuildInterrupted } from '@pending/agent';
import type { BuildRun, CallKind, CallRecord } from '@pending/agent';
import type { Attempt } from '@pending/contract';
import { handovers, simulate } from '@pending/machine';

// Kinds follow the order of validate(): placement, then wind, then the Form, then the schema-level part fields.
export type ViolationKind = 'overlap' | 'footprint' | 'constraint' | 'patch' | 'parameter';
export function violationKind(violation: string): ViolationKind {
  if (violation.startsWith('the patch ')) return 'patch';
  if (/ overlaps /.test(violation)) return 'overlap';
  if (/ runs off the | covers the (hopper|button) /.test(violation)) return 'footprint';
  if (/the form (asks|allows|requires|forbids)/.test(violation)) return 'constraint';
  return 'parameter';
}

const terminalStep = (attempt: Attempt): number => attempt.events.at(-1)?.step ?? 0;
const ran = (attempt: Attempt): boolean => attempt.outcome !== 'invalid';

// A repair counts only when both trials ran and the later one pressed or failed at another cell at a later step;
// a detour that fails at the same cell is not a changed outcome.
export type RepairEffect = {
  attempt: number;
  before: { outcome: Attempt['outcome']; failedAt?: string; step: number };
  after: { outcome: Attempt['outcome']; failedAt?: string; step: number };
  changedOutcome: boolean;
};
const side = (a: Attempt) => ({
  outcome: a.outcome,
  ...(a.failedAt === undefined ? {} : { failedAt: a.failedAt }),
  step: terminalStep(a),
});
export function repairEffects(attempts: readonly Attempt[]): RepairEffect[] {
  return attempts.slice(1).flatMap((after, i) => {
    const before = attempts[i];
    if (before === undefined) return [];
    const changedOutcome =
      ran(before) &&
      ran(after) &&
      before.outcome !== 'pressed' &&
      (after.outcome === 'pressed' ||
        (after.failedAt !== before.failedAt && terminalStep(after) > terminalStep(before)));
    return [{ attempt: after.n, before: side(before), after: side(after), changedOutcome }];
  });
}

// Replay rule: simulate(blueprint) must equal the recorded events byte for byte.
export const replaysIdentically = (attempt: Attempt): boolean =>
  !ran(attempt) || JSON.stringify(simulate(attempt.blueprint)) === JSON.stringify(attempt.events);

// Nearest rank on the sorted sample; undefined for an empty sample, never zero.
export function percentile(values: readonly number[], p: number): number | undefined {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

const latency = (values: number[]) => ({
  n: values.length,
  p50: percentile(values, 50),
  p95: percentile(values, 95),
});

function latencies(calls: CallRecord[], kind: CallKind) {
  const tries = calls.filter((c) => c.kind === kind).flatMap((c) => c.tries);
  return {
    wallMs: latency(tries.map((t) => t.timing.wallMs)),
    // Warm inference: the wall time less the model loading Ollama reports for the same call.
    warmMs: latency(tries.map((t) => t.timing.wallMs - (t.timing.loadMs ?? 0))),
    promptMs: latency(tries.flatMap((t) => (t.timing.promptMs === undefined ? [] : [t.timing.promptMs]))),
    evalMs: latency(tries.flatMap((t) => (t.timing.evalMs === undefined ? [] : [t.timing.evalMs]))),
    evalTokens: latency(
      tries.flatMap((t) => (t.timing.evalTokens === undefined ? [] : [t.timing.evalTokens])),
    ),
  };
}

// A scenario whose call threw keeps the attempts and timings finished before it, with the error beside them.
type Interrupted = { end: 'ERROR'; error: string; attempts: Attempt[]; calls: CallRecord[] };
export type ScenarioRun = { scenario: string; run: BuildRun | Interrupted };
export async function recorded(scenario: string, build: Promise<BuildRun>): Promise<ScenarioRun> {
  try {
    return { scenario, run: await build };
  } catch (error) {
    if (!(error instanceof BuildInterrupted)) throw error;
    const { attempts, calls } = error;
    return { scenario, run: { end: 'ERROR', error: String(error.cause).slice(0, 300), attempts, calls } };
  }
}
const attemptsOf = (run: ScenarioRun['run']): Attempt[] =>
  run.end === 'done' ? run.build.attempts : run.attempts;
const share = (hits: number, n: number) => ({ hits, n });

// attempted counts every scenario tried, so one that failed in transport still lowers the share.
export function summarize(runs: readonly ScenarioRun[], attempted = runs.length) {
  const calls = runs.flatMap(({ run }) => run.calls);
  const designTries = calls.filter((c) => c.kind === 'design').flatMap((c) => c.tries);
  const repairTries = calls.filter((c) => c.kind === 'repair').flatMap((c) => c.tries);
  const designed = runs.filter(({ run }) => attemptsOf(run).length > 0);
  const firstTime = designed.filter(({ run }) => attemptsOf(run)[0]?.violations.length === 0);
  const withinBudget = designed.filter(({ run }) => attemptsOf(run).some((a) => a.violations.length === 0));
  const kinds: Record<ViolationKind, number> = {
    overlap: 0,
    footprint: 0,
    constraint: 0,
    patch: 0,
    parameter: 0,
  };
  for (const { run } of runs)
    for (const a of attemptsOf(run)) for (const v of a.violations) kinds[violationKind(v)] += 1;
  const scenarios = runs.map(({ scenario, run }) => {
    const attempts = attemptsOf(run);
    return {
      scenario,
      end: run.end,
      attempts: attempts.map((a) => ({
        n: a.n,
        outcome: a.outcome,
        ...(a.failedAt === undefined ? {} : { failedAt: a.failedAt }),
        handovers: ran(a) ? handovers(a.blueprint, a.events).length : 0,
        violations: a.violations.map(violationKind),
      })),
      repairs: repairEffects(attempts),
      replayIdentical: attempts.every(replaysIdentically),
    };
  });
  const loadMs = calls.flatMap((c) => c.tries).map((t) => t.timing.loadMs);
  return {
    // (1) schema validity: replies, and scenarios whose design parsed within the one re-ask.
    schema: {
      designReplies: share(designTries.filter((t) => t.issues.length === 0).length, designTries.length),
      repairReplies: share(repairTries.filter((t) => t.issues.length === 0).length, repairTries.length),
      scenariosDesigned: share(designed.length, attempted),
      issues: calls.flatMap((c) => c.tries).flatMap((t) => t.issues),
    },
    // (2) catalogue validity of the schema-valid blueprints.
    catalogue: {
      firstTime: share(firstTime.length, designed.length),
      withinBudget: share(withinBudget.length, designed.length),
      violationKinds: kinds,
    },
    // (3) simulator-derived, per attempt.
    simulator: {
      scenarios,
      simulatedFailures: scenarios
        .flatMap((s) => s.attempts)
        .filter((a) => a.outcome === 'lost' || a.outcome === 'stalled').length,
      outcomeChangingRepairs: scenarios.flatMap((s) => s.repairs).filter((r) => r.changedOutcome).length,
      pressed: scenarios.filter((s) => s.attempts.at(-1)?.outcome === 'pressed').length,
    },
    latency: {
      coldLoadMs: loadMs[0],
      design: latencies(calls, 'design'),
      repair: latencies(calls, 'repair'),
    },
  };
}
export type Summary = ReturnType<typeof summarize>;

// The GO gate of issue #8, evaluated from the summary alone.
export function gate(summary: Summary) {
  const { schema, catalogue, simulator, latency: l } = summary;
  const checks = {
    schemaValid4of5: schema.scenariosDesigned.hits >= 4,
    catalogueValid4of5: catalogue.withinBudget.hits >= 4,
    failsInSimulator: simulator.simulatedFailures >= 1,
    outcomeChangingRepair: simulator.scenarios.some(
      (s) => s.replayIdentical && s.repairs.some((r) => r.changedOutcome),
    ),
    latencyMeasured: l.design.wallMs.p95 !== undefined && l.repair.wallMs.p95 !== undefined,
  };
  return { ...checks, go: Object.values(checks).every(Boolean) };
}
