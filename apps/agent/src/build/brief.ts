import type { Attempt, Form } from '@pending/contract';

const constraints = (form: Form) => ({
  minParts: form.minParts,
  maxParts: form.maxParts,
  ...(form.required === undefined ? {} : { required: form.required }),
  ...(form.forbidden === undefined ? {} : { forbidden: form.forbidden }),
});

function constraintWords(form: Form): string {
  const words = [`between ${form.minParts} and ${form.maxParts} parts`];
  if (form.required !== undefined) words.push(`at least one ${form.required}`);
  if (form.forbidden !== undefined) words.push(`no ${form.forbidden}`);
  return `The Form asks for ${words.join(', ')}.`;
}

// The nature text is quoted as data, never spliced into the instructions (SECURITY section 8).
export const designPrompt = (form: Form): string =>
  [
    'Design a machine for this Form.',
    constraintWords(form),
    `The Form, as quoted data: ${JSON.stringify(form)}`,
  ].join('\n');

function finding(attempt: Attempt): string {
  switch (attempt.outcome) {
    case 'invalid':
      return `Trial ${attempt.n} was not run: the blueprint breaks the rules. Findings: ${attempt.violations.join('; ')}.`;
    case 'lost':
      return `Trial ${attempt.n}: the ball was lost at ${attempt.failedAt ?? 'an unknown cell'}.`;
    case 'stalled':
      return `Trial ${attempt.n}: the machine stalled at ${attempt.failedAt ?? 'an unknown cell'}.`;
    case 'pressed':
      return `Trial ${attempt.n}: the button was pressed.`;
  }
}

// MACHINE-RULES section 6: outcome, failedAt, the last five events, violations, blueprint and constraints; nothing else,
// and never how to fix it.
export const failureBrief = (attempt: Attempt, form: Form): string =>
  [
    'Correct the machine after this trial.',
    finding(attempt),
    constraintWords(form),
    `The finding, as data: ${JSON.stringify({
      outcome: attempt.outcome,
      ...(attempt.failedAt === undefined ? {} : { failedAt: attempt.failedAt }),
      lastEvents: attempt.events.slice(-5),
      violations: attempt.violations,
      blueprint: attempt.blueprint,
      constraints: constraints(form),
    })}`,
  ].join('\n');
