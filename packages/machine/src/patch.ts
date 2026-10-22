import { type Blueprint, type Form, MAX_PARTS, type Part, type Patch } from '@pending/contract';
import { validate } from './validate';

export type Repair = { blueprint: Blueprint; violations: string[] };

// Ops apply in order (MACHINE-RULES section 6); an op naming an unknown or reused id, or an add past MAX_PARTS, is skipped and reported.
export function applyPatch(
  blueprint: Blueprint,
  patch: Patch,
  usedIds: ReadonlySet<string>,
  form: Form,
): Repair {
  // A removed id stays used, so a later add cannot bring it back under the same name.
  const used = new Set([...usedIds, ...blueprint.parts.map((p) => p.id)]);
  const violations: string[] = [];
  let parts: Part[] = blueprint.parts;
  for (const op of patch) {
    switch (op.op) {
      case 'add':
        if (used.has(op.part.id)) {
          violations.push(`the patch adds ${op.part.id}, an id already used in this build`);
        } else if (parts.length >= MAX_PARTS) {
          violations.push(
            `the patch adds ${op.part.id}, which would leave ${parts.length + 1} parts on the board; the limit is ${MAX_PARTS}`,
          );
        } else {
          used.add(op.part.id);
          parts = [...parts, op.part];
        }
        break;
      case 'move':
      case 'remove': {
        const { id } = op;
        if (!parts.some((p) => p.id === id)) {
          violations.push(`the patch ${op.op}s ${id}, which is not on the board`);
        } else if (op.op === 'move') {
          const { cell } = op;
          parts = parts.map((p) => (p.id === id ? { ...p, cell } : p));
        } else {
          parts = parts.filter((p) => p.id !== id);
        }
        break;
      }
    }
  }
  const next = { title: blueprint.title, parts };
  return { blueprint: next, violations: [...violations, ...validate(next, form)] };
}
