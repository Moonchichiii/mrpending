import { readFile } from 'node:fs/promises';
import { PROMPT_VERSIONS } from '@pending/agent';
import { Form } from '@pending/contract';
import * as z from 'zod';

// Headline rates come from the headline forms only; the held-out form and the traps have their own rows.
export const Role = z.enum(['headline', 'held-out', 'trap', 'optional-trap']);
export type Role = z.infer<typeof Role>;

const Scenario = z.object({
  role: Role,
  // The prompt versions written before this form; a later version has seen it and marks it so.
  unseenBy: z.array(z.enum(PROMPT_VERSIONS)).max(PROMPT_VERSIONS.length).optional(),
  form: Form,
});
const Scenarios = z.record(z.string().regex(/^[a-z]{1,16}$/), Scenario);
export type Scenario = z.infer<typeof Scenario> & { id: string };

export const SCENARIOS_URL = new URL('../scenarios.json', import.meta.url);

export function parseScenarios(raw: unknown): Scenario[] {
  const all = Object.entries(Scenarios.parse(raw)).map(([id, s]) => ({ id, ...s }));
  const count = (role: Role) => all.filter((s) => s.role === role).length;
  // ARCHITECTURE section 5: five headline forms, one held-out form, one injection trap; the second trap is optional.
  if (count('headline') !== 5 || count('held-out') !== 1 || count('trap') !== 1 || count('optional-trap') > 1)
    throw new Error(
      'scenarios.json needs five headline forms, one held-out form, one trap and at most one more',
    );
  return all;
}

export async function loadScenarios(): Promise<Scenario[]> {
  const raw: unknown = JSON.parse(await readFile(SCENARIOS_URL, 'utf8'));
  return parseScenarios(raw);
}
