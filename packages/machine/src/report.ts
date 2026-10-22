import { Report } from '@pending/contract';
import type { Attempt } from '@pending/contract';

// The two-entry verdict table keyed by pressed (character sheet section 3); never a memo.
const VERDICT = {
  pressed: 'One button. An extraordinary amount of paperwork.',
  pending: 'Your request is pending. Naturally.',
} as const;

// Computed from the attempts alone, so no narration can feed a number into the card.
export function report(attempts: readonly Attempt[]): Report {
  const last = attempts.at(-1);
  if (last === undefined) throw new Error('a report needs at least one attempt');
  const pressed = last.outcome === 'pressed';
  return Report.parse({
    attempts: attempts.length,
    parts: last.blueprint.parts.length,
    pressed,
    failedAt: last.failedAt,
    verdict: pressed ? VERDICT.pressed : VERDICT.pending,
  });
}
