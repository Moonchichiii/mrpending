import * as z from 'zod';
import { describe, expect, test } from 'vitest';
import {
  BlueprintPartial,
  DesignReply,
  Form,
  Model,
  Part,
  RepairReply,
  StreamEvent,
  designReplyJsonSchema,
  repairReplyJsonSchema,
} from './index';

const nature = 'Press the blue button. Scenic route, please.';

// The blueprints and patches of MACHINE-RULES section 7, which the machine package records as fixtures.
const designs = [
  {
    blueprint: {
      title: 'pressed',
      parts: [
        { id: 'p1', kind: 'conveyor', cell: 'A2', dir: 'east', length: 4 },
        { id: 'p2', kind: 'ramp', cell: 'E2', dir: 'east', length: 4 },
        { id: 'p3', kind: 'dominoes', cell: 'I7', dir: 'east', length: 3 },
      ],
    },
    memo: 'A conveyor, a ramp and dominoes.',
  },
  {
    blueprint: {
      title: 'seesaw',
      parts: [
        { id: 'p1', kind: 'ramp', cell: 'A2', dir: 'east', length: 3 },
        { id: 'p2', kind: 'seesaw', cell: 'E6', dir: 'east' },
        { id: 'p3', kind: 'fan', cell: 'G4', dir: 'east', power: 2 },
        { id: 'p4', kind: 'dominoes', cell: 'J7', dir: 'east', length: 2 },
      ],
    },
    memo: 'The seesaw is load-bearing.',
  },
  {
    blueprint: {
      title: 'catapult',
      parts: [
        { id: 'p1', kind: 'conveyor', cell: 'A2', dir: 'east', length: 2 },
        { id: 'p2', kind: 'ramp', cell: 'C2', dir: 'east', length: 3 },
        { id: 'p3', kind: 'catapult', cell: 'F6', dir: 'east', power: 2 },
        { id: 'p4', kind: 'fan', cell: 'H4', dir: 'east', power: 2 },
        { id: 'p5', kind: 'dominoes', cell: 'I7', dir: 'east', length: 2 },
      ],
    },
    memo: 'A catapult was required.',
  },
];
const repairs = [
  { patch: [{ op: 'remove', id: 'p4' }], memo: 'Fewer catapults.' },
  {
    patch: [
      { op: 'remove', id: 'p3' },
      { op: 'add', part: { id: 'p6', kind: 'catapult', cell: 'F6', dir: 'east', power: 4 } },
      { op: 'move', id: 'p5', cell: 'J7' },
    ],
    memo: 'More catapult.',
  },
];

describe('Form', () => {
  test('rejects minParts above maxParts', () => {
    expect(Form.safeParse({ nature, minParts: 8, maxParts: 4 }).success).toBe(false);
  });

  test('rejects a kind both required and forbidden', () => {
    expect(
      Form.safeParse({ nature, minParts: 2, maxParts: 6, required: 'fan', forbidden: 'fan' }).success,
    ).toBe(false);
  });

  test('accepts equal bounds and distinct required and forbidden kinds', () => {
    expect(
      Form.safeParse({ nature, minParts: 6, maxParts: 6, required: 'fan', forbidden: 'ramp' }).success,
    ).toBe(true);
  });
});

describe('Part', () => {
  test('requires the parameter of its kind, in its range', () => {
    expect(Part.safeParse({ id: 'p1', kind: 'ramp', cell: 'A2', dir: 'east' }).success).toBe(false);
    expect(Part.safeParse({ id: 'p1', kind: 'ramp', cell: 'A2', dir: 'east', length: 5 }).success).toBe(
      false,
    );
    expect(Part.safeParse({ id: 'p1', kind: 'ramp', cell: 'A2', dir: 'east', power: 3 }).success).toBe(false);
    expect(Part.safeParse({ id: 'p1', kind: 'fan', cell: 'A2', dir: 'east', power: 4 }).success).toBe(true);
  });

  test('carries no parameter for a seesaw', () => {
    expect(Part.parse({ id: 'p1', kind: 'seesaw', cell: 'E6', dir: 'east', length: 3 })).toEqual({
      id: 'p1',
      kind: 'seesaw',
      cell: 'E6',
      dir: 'east',
    });
  });
});

describe('Model', () => {
  test('accepts an Ollama id and a provider-qualified OpenRouter id', () => {
    expect(Model.safeParse({ mode: 'local', id: 'gemma4:e2b', host: 'ollama' }).success).toBe(true);
    expect(Model.safeParse({ mode: 'hosted', id: 'google/gemma-3-4b-it', host: 'openrouter' }).success).toBe(
      true,
    );
  });

  test('rejects a 65-character id and one with spaces', () => {
    expect(Model.safeParse({ mode: 'hosted', id: 'a'.repeat(65), host: 'openrouter' }).success).toBe(false);
    expect(Model.safeParse({ mode: 'local', id: 'gemma 4', host: 'ollama' }).success).toBe(false);
  });
});

describe('BlueprintPartial', () => {
  test('strips unknown keys from the partial and its parts', () => {
    expect(
      BlueprintPartial.parse({ title: 'T', extra: 1, parts: [{ kind: 'fan', cell: 'B2', note: 'x' }] }),
    ).toEqual({ title: 'T', parts: [{ kind: 'fan', cell: 'B2' }] });
  });

  test('rejects a 41-character title', () => {
    expect(BlueprintPartial.safeParse({ title: 'a'.repeat(41) }).success).toBe(false);
  });

  test('rejects 15 parts', () => {
    expect(BlueprintPartial.safeParse({ parts: Array.from({ length: 15 }, () => ({})) }).success).toBe(false);
  });
});

test('a stream event strips unknown keys at every level', () => {
  const event = StreamEvent.parse({
    type: 'patch',
    requestId: '123e4567-e89b-42d3-a456-426614174000',
    n: 2,
    injected: '<script>',
    patch: [{ op: 'add', part: { ...designs[0]?.blueprint.parts[0], id: 'p9', extra: true }, why: 'x' }],
  });
  expect(event).toEqual({
    type: 'patch',
    requestId: '123e4567-e89b-42d3-a456-426614174000',
    n: 2,
    patch: [{ op: 'add', part: { id: 'p9', kind: 'conveyor', cell: 'A2', dir: 'east', length: 4 } }],
  });
});

// The model-facing schema, read back into zod, must judge the fixtures exactly as the contract does.
function modelFacing(
  name: string,
  jsonSchema: Parameters<typeof z.fromJSONSchema>[0],
  contract: z.ZodType,
  fixtures: unknown[],
  breaches: unknown[],
) {
  describe(`model-facing ${name} schema`, () => {
    const derived = z.fromJSONSchema(jsonSchema);

    test.each(fixtures)('round-trips fixture %#', (fixture) => {
      expect(derived.parse(fixture)).toEqual(contract.parse(fixture));
    });

    test.each(breaches)('rejects breach %# as the contract does', (breach) => {
      expect(contract.safeParse(breach).success).toBe(false);
      expect(derived.safeParse(breach).success).toBe(false);
    });
  });
}

modelFacing('DesignReply', designReplyJsonSchema, DesignReply, designs, [
  { blueprint: { title: 'a'.repeat(41), parts: [] }, memo: '' },
  { blueprint: { title: 't', parts: [{ id: 'p1', kind: 'ramp', cell: 'A2', dir: 'east' }] }, memo: '' },
  {
    blueprint: { title: 't', parts: [{ id: 'p1', kind: 'fan', cell: 'M2', dir: 'east', power: 1 }] },
    memo: '',
  },
]);
modelFacing('RepairReply', repairReplyJsonSchema, RepairReply, repairs, [
  { patch: [], memo: '' },
  { patch: [{ op: 'remove', id: 'q1' }], memo: '' },
  { patch: [{ op: 'remove', id: 'p1' }], memo: 'a'.repeat(161) },
]);
