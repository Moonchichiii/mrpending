import { Build, CONTRACT_VERSION, DesignReply, Line, MAX_ATTEMPTS, RepairReply } from '@pending/contract';
import type { Attempt, Blueprint, Form, Model, Patch, StreamEvent } from '@pending/contract';
import { RULES_VERSION, applyPatch, report, simulate, validate } from '@pending/machine';
import type * as z from 'zod';
import type { Call, CallKind, Infer, Timing } from '../models/ollama';
import * as beats from './beats';
import type { Draft } from './beats';
import { designPrompt, failureBrief } from './brief';

// SECURITY-AND-FAILURE-CONTRACT section 4 and MACHINE-RULES section 6.
export const APP_REPAIRS = 5;
export const EVAL_REPAIRS = 5;
const MAX_VIOLATIONS = 8;
const MAX_VIOLATION_CHARS = 120;
const MAX_ISSUES = 8;

// One model reply as the loop saw it: issues are the zod paths and messages of a reply that failed the schema.
export type Try = { timing: Timing; issues: string[] };
export type CallRecord = { kind: CallKind; attempt: number; tries: Try[]; parsed: boolean };
export type BuildRun =
  | { end: 'done'; build: Build; calls: CallRecord[] }
  | { end: 'MODEL_INVALID'; attempts: Attempt[]; calls: CallRecord[] };

// A call that throws (timeout, transport) ends the build; the attempts and calls finished before it travel with it.
export class BuildInterrupted extends Error {
  constructor(
    readonly attempts: Attempt[],
    readonly calls: CallRecord[],
    cause: unknown,
  ) {
    super(`the build was interrupted: ${String(cause)}`, { cause });
  }
}

// What the loop streams as it goes; the route adds the requestId, and done or error, around it.
type Unstamped<E> = E extends unknown ? Omit<E, 'requestId'> : never;
export type Emitted = Unstamped<Extract<StreamEvent, { type: 'line' | 'attempt' | 'patch' }>>;

export type BuildInput = {
  id: string;
  form: Form;
  system: string;
  promptVersion: string;
  model: Model;
  repairs: number;
  infer: Infer;
  signal: AbortSignal;
  now: () => Date;
  emit?: (event: Emitted) => void;
};

const issuesOf = (error: z.ZodError): string[] =>
  error.issues.slice(0, MAX_ISSUES).map((i) => `${i.path.map(String).join('.') || 'reply'}: ${i.message}`);

// A reply that fails the schema is re-asked once with its issues; a second failure is MODEL_INVALID.
async function ask<S extends z.ZodType>(
  schema: S,
  call: Call,
  record: CallRecord,
  input: BuildInput,
): Promise<z.output<S> | undefined> {
  let prompt = call.prompt;
  for (let n = 0; n < 2; n += 1) {
    const reply = await input.infer({ ...call, prompt }, input.signal);
    const parsed = schema.safeParse(reply.value);
    if (parsed.success) {
      record.tries.push({ timing: reply.timing, issues: [] });
      record.parsed = true;
      return parsed.data;
    }
    const issues = issuesOf(parsed.error);
    record.tries.push({ timing: reply.timing, issues });
    prompt = `${call.prompt}\n\nYour previous reply did not match the required shape: ${issues.join('; ')}. Answer again.`;
  }
  return undefined;
}

// Only the simulator decides the outcome; an invalid blueprint is an attempt that is never run (MACHINE-RULES section 5).
export function trial(n: number, blueprint: Blueprint, violations: string[], patch?: Patch): Attempt {
  const base = {
    n,
    blueprint,
    violations: violations.slice(0, MAX_VIOLATIONS).map((v) => v.slice(0, MAX_VIOLATION_CHARS)),
    ...(patch === undefined ? {} : { patch }),
  };
  if (violations.length > 0) return { ...base, events: [], outcome: 'invalid' };
  const events = simulate(blueprint);
  const end = events.at(-1);
  if (end === undefined) throw new Error('a simulation produced no events');
  switch (end.type) {
    case 'button.pressed':
      return { ...base, events, outcome: 'pressed' };
    case 'ball.lost':
      return { ...base, events, outcome: 'lost', failedAt: end.cell };
    case 'ball.stopped':
    case 'impulse.lost':
      return { ...base, events, outcome: 'stalled', failedAt: end.cell };
    case 'ball.released':
    case 'ball.moved':
    case 'ball.launched':
    case 'domino.fell':
      throw new Error(`a simulation ended on ${end.type}, which is not a terminal event`);
  }
}

export async function runBuild(input: BuildInput): Promise<BuildRun> {
  const calls: CallRecord[] = [];
  const attempts: Attempt[] = [];
  try {
    return await loop(input, calls, attempts);
  } catch (error) {
    throw new BuildInterrupted(attempts, calls, error);
  }
}

async function loop(input: BuildInput, calls: CallRecord[], attempts: Attempt[]): Promise<BuildRun> {
  const { form, system } = input;
  const emit = input.emit ?? (() => undefined);
  const lines: Line[] = [];
  const say = (drafts: Draft[]) => {
    for (const draft of drafts) {
      const line = Line.parse({ id: `l${lines.length + 1}`, ...draft });
      lines.push(line);
      emit({ type: 'line', line });
    }
  };
  const limit = Math.min(1 + input.repairs, MAX_ATTEMPTS);
  const ran = (attempt: Attempt) => {
    emit({ type: 'attempt', attempt });
    const repairFollows = attempt.outcome !== 'pressed' && attempt.n < limit;
    say(beats.trial(attempt, attempts, repairFollows));
    attempts.push(attempt);
  };

  say(beats.opening());
  const design: CallRecord = { kind: 'design', attempt: 1, tries: [], parsed: false };
  calls.push(design);
  const designed = await ask(
    DesignReply,
    { kind: 'design', system, prompt: designPrompt(form) },
    design,
    input,
  );
  if (designed === undefined) return { end: 'MODEL_INVALID', attempts: [], calls };

  let last = trial(1, designed.blueprint, validate(designed.blueprint, form));
  say(beats.designed(designed.memo, last));
  ran(last);
  // Every id ever added in this build, including one added and removed within a single patch, stays used.
  const used = new Set(designed.blueprint.parts.map((p) => p.id));
  while (last.outcome !== 'pressed' && attempts.length < limit) {
    const n = attempts.length + 1;
    const record: CallRecord = { kind: 'repair', attempt: n, tries: [], parsed: false };
    calls.push(record);
    const repaired = await ask(
      RepairReply,
      { kind: 'repair', system, prompt: failureBrief(last, form) },
      record,
      input,
    );
    if (repaired === undefined) return { end: 'MODEL_INVALID', attempts, calls };
    // The model's patch is applied as given: nothing here selects, ranks or rewrites it.
    const next = applyPatch(last.blueprint, repaired.patch, used, form);
    for (const op of repaired.patch) if (op.op === 'add') used.add(op.part.id);
    const previous = last;
    last = trial(n, next.blueprint, next.violations, repaired.patch);
    emit({ type: 'patch', n, patch: repaired.patch });
    say(beats.repaired(repaired.memo, previous, last));
    ran(last);
  }

  const build = Build.parse({
    id: input.id,
    contractVersion: CONTRACT_VERSION,
    rulesVersion: RULES_VERSION,
    promptVersion: input.promptVersion,
    form,
    model: input.model,
    title: designed.blueprint.title,
    report: report(attempts),
    createdAt: input.now().toISOString(),
    attempts,
    lines,
  });
  return { end: 'done', build, calls };
}
