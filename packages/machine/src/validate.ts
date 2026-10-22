import { Blueprint, MAX_PARTS, PartId, PartKind } from '@pending/contract';
import type { Form, Part } from '@pending/contract';
import { BUTTON, COLUMNS, HOPPER, ROWS, footprint, onBoard, toCell, wind } from './catalogue';
import type { Point } from './catalogue';

type Issue = NonNullable<ReturnType<typeof Blueprint.safeParse>['error']>['issues'][number];

const list = (items: string[], last = 'and'): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${last} ${items.at(-1)}`;

const rawPart = (raw: unknown, index: number): unknown =>
  typeof raw === 'object' && raw !== null && 'parts' in raw && Array.isArray(raw.parts)
    ? raw.parts[index]
    : undefined;

// Names a part by its id when the id itself parses, so a malformed id never reaches the message.
function label(part: unknown, index: number): string {
  const id =
    typeof part === 'object' && part !== null && 'id' in part ? PartId.safeParse(part.id) : undefined;
  return id?.success === true ? id.data : `part ${index + 1}`;
}

function describeField(issue: Issue, who: string, field: string, part: unknown): string {
  switch (issue.code) {
    case 'invalid_union':
      return `${who}: ${field} must be one of ${list([...PartKind.options], 'or')}`;
    case 'invalid_value':
      return `${who}: ${field} must be ${list(issue.values.map(String), 'or')}`;
    case 'too_big':
      return `${who}: ${field} must be at most ${issue.maximum}`;
    case 'too_small':
      return `${who}: ${field} must be at least ${issue.minimum}`;
    case 'invalid_type':
      return typeof part === 'object' && part !== null && !(field in part)
        ? `${who} has no ${field}`
        : `${who}: ${field} has the wrong type`;
    case 'invalid_format':
    case 'invalid_element':
    case 'invalid_key':
    case 'not_multiple_of':
    case 'unrecognized_keys':
    case 'custom':
      return `${who} has an invalid ${field}`;
  }
}

function describe(issue: Issue, raw: unknown): string {
  const [head, index, field] = issue.path;
  if (head === 'parts' && typeof index === 'number') {
    const part = rawPart(raw, index);
    const who = label(part, index);
    return field === undefined ? `${who} is not a part` : describeField(issue, who, String(field), part);
  }
  if (head === 'parts') {
    return issue.code === 'too_big'
      ? `the blueprint has more than ${MAX_PARTS} parts`
      : 'the blueprint has no list of parts';
  }
  if (head === 'title') {
    return issue.code === 'too_big'
      ? `the title is longer than ${issue.maximum} characters`
      : 'the title is not text';
  }
  return 'the blueprint is not an object with a title and parts';
}

function edge(p: Point): string {
  if (p.col < 0) return 'west';
  if (p.col >= COLUMNS.length) return 'east';
  return p.row > ROWS ? 'bottom' : 'top';
}

function duplicates(parts: Part[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { id } of parts) {
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated].map((id) => `id ${id} is used by more than one part`);
}

function placement(parts: Part[]): string[] {
  const out: string[] = [];
  const owner = new Map<string, string>();
  for (const part of parts) {
    const cells = footprint(part);
    const off = cells.find((p) => !onBoard(p));
    if (off !== undefined) out.push(`${part.id} at ${part.cell} runs off the ${edge(off)} edge of the board`);
    const clashes = new Map<string, string[]>();
    for (const cell of cells.filter(onBoard).map(toCell)) {
      if (cell === HOPPER) out.push(`${part.id} covers the hopper at ${HOPPER}`);
      if (cell === BUTTON) out.push(`${part.id} covers the button at ${BUTTON}`);
      const other = owner.get(cell);
      if (other === undefined) owner.set(cell, part.id);
      else clashes.set(other, [...(clashes.get(other) ?? []), cell]);
    }
    for (const [other, at] of clashes) out.push(`${part.id} overlaps ${other} at ${list(at)}`);
  }
  return out;
}

function crosswinds(parts: Part[]): string[] {
  const fans = parts
    .filter((p) => p.kind === 'fan')
    .map((p) => ({ id: p.id, cells: wind(p).filter(onBoard).map(toCell) }));
  return fans.flatMap((a, i) =>
    fans.slice(i + 1).flatMap((b) => {
      const shared = a.cells.filter((c) => b.cells.includes(c));
      return shared.length > 0 ? [`the wind of ${a.id} and ${b.id} overlaps at ${list(shared)}`] : [];
    }),
  );
}

function constraints(parts: Part[], form: Form): string[] {
  const out: string[] = [];
  const n = parts.length;
  const count = `${n} part${n === 1 ? '' : 's'}`;
  if (n < form.minParts) out.push(`the blueprint has ${count}; the form asks for at least ${form.minParts}`);
  if (n > form.maxParts) out.push(`the blueprint has ${count}; the form allows at most ${form.maxParts}`);
  const { required, forbidden } = form;
  if (required !== undefined && !parts.some((p) => p.kind === required)) {
    out.push(`the form requires a ${required} part; there is none`);
  }
  const banned = parts.filter((p) => p.kind === forbidden).map((p) => p.id);
  if (banned.length > 0) out.push(`the form forbids ${forbidden} parts: ${list(banned)}`);
  return out;
}

// What is wrong, in plain words, never how to fix it (MACHINE-RULES section 5); empty when the blueprint is sound.
export function validate(blueprint: unknown, form: Form): string[] {
  const parsed = Blueprint.safeParse(blueprint);
  if (!parsed.success) return [...new Set(parsed.error.issues.map((issue) => describe(issue, blueprint)))];
  const { parts } = parsed.data;
  return [...duplicates(parts), ...placement(parts), ...crosswinds(parts), ...constraints(parts, form)];
}
