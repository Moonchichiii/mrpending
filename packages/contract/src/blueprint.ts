import * as z from 'zod';

export const Cell = z.string().regex(/^[A-L][1-7]$/); // 12 × 7; A1 is the hopper, L7 the button
export const PartKind = z.enum(['ramp', 'dominoes', 'seesaw', 'catapult', 'conveyor', 'fan']);
export const PartId = z.string().regex(/^p\d{1,2}$/); // shared by Part, Patch and SimEvent

export const MAX_PARTS = 14;
export const range = (lo: number, hi: number) => z.number().int().min(lo).max(hi);
const base = { id: PartId, cell: Cell, dir: z.enum(['east', 'west']) };
const title = z.string().max(40);
const memo = z.string().max(160);

// Each kind requires exactly its own parameter: a generic optional field let the model omit lengths (measured 21 Oct).
export const Part = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('conveyor'), length: range(2, 6) }),
  z.object({ ...base, kind: z.literal('ramp'), length: range(2, 4) }),
  z.object({ ...base, kind: z.literal('dominoes'), length: range(2, 5) }),
  z.object({ ...base, kind: z.literal('seesaw') }),
  z.object({ ...base, kind: z.literal('catapult'), power: range(2, 5) }),
  z.object({ ...base, kind: z.literal('fan'), power: range(1, 4) }),
]);

export const Blueprint = z.object({ title, parts: z.array(Part).max(MAX_PARTS) }); // title first: it streams first
export const Patch = z
  .array(
    z.discriminatedUnion('op', [
      z.object({ op: z.literal('add'), part: Part }), // the id must be new to the whole build, so diffs stay unambiguous
      z.object({ op: z.literal('move'), id: PartId, cell: Cell }),
      z.object({ op: z.literal('remove'), id: PartId }),
    ]),
  )
  .min(1)
  .max(4);

// Form 27B/6; the user's text is data, never instructions.
export const Form = z
  .object({
    nature: z.string().max(180),
    minParts: range(2, 8),
    maxParts: range(4, MAX_PARTS),
    required: PartKind.optional(),
    forbidden: PartKind.optional(),
  })
  .refine((f) => f.minParts <= f.maxParts, { message: 'minParts exceeds maxParts', path: ['minParts'] })
  .refine((f) => f.required === undefined || f.required !== f.forbidden, {
    message: 'the same kind is required and forbidden',
    path: ['forbidden'],
  });

export const DesignReply = z.object({ blueprint: Blueprint, memo });
export const RepairReply = z.object({ patch: Patch, memo });

// Explicit, not deepPartial: a half-streamed part must still parse so the board can draw it.
export const BlueprintPartial = z.object({
  title: title.optional(),
  parts: z
    .array(z.object({ kind: PartKind.optional(), cell: Cell.optional() }))
    .max(MAX_PARTS)
    .optional(),
});

// The structured-output constraint handed to the model; derived, never maintained by hand.
export const designReplyJsonSchema = z.toJSONSchema(DesignReply);
export const repairReplyJsonSchema = z.toJSONSchema(RepairReply);

export type Cell = z.infer<typeof Cell>;
export type PartKind = z.infer<typeof PartKind>;
export type PartId = z.infer<typeof PartId>;
export type Part = z.infer<typeof Part>;
export type Blueprint = z.infer<typeof Blueprint>;
export type Patch = z.infer<typeof Patch>;
export type Form = z.infer<typeof Form>;
export type DesignReply = z.infer<typeof DesignReply>;
export type RepairReply = z.infer<typeof RepairReply>;
export type BlueprintPartial = z.infer<typeof BlueprintPartial>;
