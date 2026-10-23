import type { Blueprint, Cell, Part } from '@pending/contract';
import { assertNever } from '../../../shared/assertNever';

export type Change =
  | { kind: 'unchanged'; part: Part }
  | { kind: 'removed'; part: Part }
  | { kind: 'added'; part: Part }
  | { kind: 'moved'; part: Part; from: Cell }
  | { kind: 'replaced'; removed: Part; added: Part };

// What the correction changed between the previous board and the board it produced. The trial's own blueprint is the
// fact: an op the machine skipped (a reused id, a part past the limit) changed nothing, so it is not drawn. Each part is
// matched by id; a part removed and another added on the same anchor cell is a replacement.
export function diff(previous: Blueprint, current: Blueprint): Change[] {
  const now = new Map(current.parts.map((part) => [part.id, part]));
  const before = new Set(previous.parts.map((part) => part.id));
  const added = current.parts.filter((part) => !before.has(part.id));
  const paired = new Set<Part>();
  const changes = previous.parts.map((part): Change => {
    const after = now.get(part.id);
    if (after)
      return after.cell === part.cell
        ? { kind: 'unchanged', part }
        : { kind: 'moved', part: after, from: part.cell };
    const twin = added.find((a) => !paired.has(a) && a.cell === part.cell);
    if (!twin) return { kind: 'removed', part };
    paired.add(twin);
    return { kind: 'replaced', removed: part, added: twin };
  });
  return [
    ...changes,
    ...added.filter((part) => !paired.has(part)).map((part): Change => ({ kind: 'added', part })),
  ];
}

const parameter = (part: Part): string => {
  switch (part.kind) {
    case 'conveyor':
    case 'ramp':
    case 'dominoes':
      return `, length ${part.length}`;
    case 'catapult':
    case 'fan':
      return `, power ${part.power}`;
    case 'seesaw':
      return '';
    default:
      return assertNever(part);
  }
};
const named = (part: Part) => `${part.kind} ${part.id}`;
const described = (part: Part) => `${named(part)} at ${part.cell} facing ${part.dir}${parameter(part)}`;

// The written change list beside the diff: one sentence per change, unchanged parts omitted.
export function changeText(change: Change): string | undefined {
  switch (change.kind) {
    case 'unchanged':
      return undefined;
    case 'removed':
      return `Removed ${named(change.part)} at ${change.part.cell}.`;
    case 'added':
      return `Added ${described(change.part)}.`;
    case 'moved':
      return `Moved ${named(change.part)} from ${change.from} to ${change.part.cell}.`;
    case 'replaced':
      return `Replaced ${named(change.removed)} at ${change.removed.cell} with ${described(change.added)}.`;
    default:
      return assertNever(change);
  }
}
