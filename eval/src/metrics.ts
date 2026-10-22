import { BuildInterrupted } from '@pending/agent';
import type { BuildRun, CallKind, CallRecord } from '@pending/agent';
import type { Attempt } from '@pending/contract';
import { handovers, simulate } from '@pending/machine';
import * as z from 'zod';

// Kinds follow the order of validate(): placement, then wind, then the Form, then the schema-level part fields.
export const ViolationKind = z.enum(['overlap', 'footprint', 'constraint', 'patch', 'parameter']);
export type ViolationKind = z.infer<typeof ViolationKind>;
export function violationKind(violation: string): ViolationKind {
  if (violation.startsWith('the patch ')) return 'patch';
  if (/ overlaps /.test(violation)) return 'overlap';
  if (/ runs off the | covers the (hopper|button) /.test(violation)) return 'footprint';
  if (/the form (asks|allows|requires|forbids)/.test(violation)) return 'constraint';
  return 'parameter';
}

const terminalStep = (attempt: Attempt): number => attempt.events.at(-1)?.step ?? 0;
const ran = (attempt: Attempt): boolean => attempt.outcome !== 'invalid';
// ARCHITECTURE section 7: one step animates in 120 ms at normal speed; a repair hides behind the attempt before it.
export const STEP_MS = 120;

// The loop stops at the first press, so a press on attempt 1 is the model's own design and any later one a repair.
export type PressOrigin = { by: 'design' | 'repair'; attempt: number };
export function pressOrigin(attempts: readonly Attempt[]): PressOrigin | undefined {
  const pressed = attempts.find((a) => a.outcome === 'pressed');
  return pressed === undefined
    ? undefined
    : { by: pressed.n === 1 ? 'design' : 'repair', attempt: pressed.n };
}

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
    loadMs: latency(tries.flatMap((t) => (t.timing.loadMs === undefined ? [] : [t.timing.loadMs]))),
    promptMs: latency(tries.flatMap((t) => (t.timing.promptMs === undefined ? [] : [t.timing.promptMs]))),
    evalMs: latency(tries.flatMap((t) => (t.timing.evalMs === undefined ? [] : [t.timing.evalMs]))),
    promptTokens: latency(
      tries.flatMap((t) => (t.timing.promptTokens === undefined ? [] : [t.timing.promptTokens])),
    ),
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
export const attemptsOf = (run: ScenarioRun['run']): Attempt[] =>
  run.end === 'done' ? run.build.attempts : run.attempts;
const share = (hits: number, n: number) => ({ hits, n });

type FailureKind = 'ball.lost' | 'ball.stopped' | 'impulse.lost';
function failureKinds(attempts: readonly Attempt[]): Record<FailureKind, number> {
  const kinds: Record<FailureKind, number> = { 'ball.lost': 0, 'ball.stopped': 0, 'impulse.lost': 0 };
  for (const a of attempts) {
    const end = a.events.at(-1)?.type;
    if (end === 'ball.lost' || end === 'ball.stopped' || end === 'impulse.lost') kinds[end] += 1;
  }
  return kinds;
}

// Per repair call that got a reply: whether it parsed and applied without violations, and whether its wall time
// stayed under the animation of the attempt it repaired. A call cut off during its re-ask has no full wall time,
// so it counts for validity but not for timing.
function repairs(run: ScenarioRun['run']) {
  const attempts = attemptsOf(run);
  return run.calls
    .filter((c) => c.kind === 'repair' && c.tries.length > 0)
    .map((c) => {
      const made = attempts.find((a) => a.n === c.attempt);
      const before = attempts.find((a) => a.n === c.attempt - 1);
      const wallMs = c.tries.reduce((sum, t) => sum + t.timing.wallMs, 0);
      const animationMs = before === undefined ? 0 : terminalStep(before) * STEP_MS;
      return {
        valid: made !== undefined && made.violations.length === 0,
        complete: c.parsed || c.tries.length === 2,
        wallMs,
        animationMs,
        underAnimation: wallMs < animationMs,
      };
    });
}

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
  const repairCalls = runs.flatMap(({ run }) => repairs(run));
  const origins = runs.flatMap(({ run }) => pressOrigin(attemptsOf(run)) ?? []);
  const timed = repairCalls.filter((r) => r.complete);
  const repairWall = percentile(
    timed.map((r) => r.wallMs),
    50,
  );
  const animation = percentile(
    timed.map((r) => r.animationMs),
    50,
  );
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
      pressedRate: share(origins.length, attempted),
      pressedBy: {
        design: origins.filter((o) => o.by === 'design').length,
        repair: origins.filter((o) => o.by === 'repair').length,
      },
      attemptsToPress: origins.map((o) => o.attempt),
      failureKinds: failureKinds(runs.flatMap(({ run }) => attemptsOf(run))),
      // (C) simulator-guided repair: a RepairReply that parses and applies without violations.
      repairValidity: share(repairCalls.filter((r) => r.valid).length, repairCalls.length),
    },
    latency: {
      coldLoadMs: loadMs[0],
      design: latencies(calls, 'design'),
      repair: latencies(calls, 'repair'),
      repairUnderAnimation: {
        calls: share(timed.filter((r) => r.underAnimation).length, timed.length),
        // The architecture's test: the repair hides behind the animation when its p50 is shorter.
        p50: repairWall === undefined || animation === undefined ? undefined : repairWall < animation,
      },
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

// Experiment D runs the better of A and B on E4B: more presses, then more catalogue-valid designs within the
// repair budget, then more valid first time; a tie keeps the frozen version. It reads only those three counts,
// so a summary parsed back from a results file ranks like the in-memory one.
type Ranked = {
  simulator: Pick<Summary['simulator'], 'pressed'>;
  catalogue: Pick<Summary['catalogue'], 'firstTime' | 'withinBudget'>;
};
export function better<V extends string>(
  a: { version: V; summary: Ranked },
  b: { version: V; summary: Ranked },
  frozen: V,
): V {
  const key = (s: Ranked) => [s.simulator.pressed, s.catalogue.withinBudget.hits, s.catalogue.firstTime.hits];
  const [ka, kb] = [key(a.summary), key(b.summary)];
  for (let i = 0; i < ka.length; i += 1) {
    const d = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (d !== 0) return d > 0 ? a.version : b.version;
  }
  return frozen;
}
