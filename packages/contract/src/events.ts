import * as z from 'zod';
import { Cell, PartId, range } from './blueprint';

export const MAX_STEPS = 200;
export const step = range(0, MAX_STEPS);

export const SimEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ball.released'), step, cell: Cell }),
  z.object({
    type: z.literal('ball.moved'),
    step,
    from: Cell,
    to: Cell,
    by: z.enum(['gravity', 'conveyor', 'ramp', 'fan']),
  }),
  z.object({
    type: z.literal('ball.launched'),
    step,
    from: Cell,
    to: Cell,
    by: z.enum(['seesaw', 'catapult']),
    part: PartId,
  }),
  z.object({ type: z.literal('domino.fell'), step, part: PartId, index: range(0, 4), cell: Cell }),
  z.object({ type: z.literal('impulse.lost'), step, cell: Cell }),
  z.object({
    type: z.literal('ball.lost'),
    step,
    cell: Cell,
    edge: z.enum(['top', 'bottom', 'west', 'east']),
  }),
  z.object({ type: z.literal('ball.stopped'), step, cell: Cell }),
  z.object({ type: z.literal('button.pressed'), step, by: z.enum(['ball', 'domino']) }),
]);

export type SimEvent = z.infer<typeof SimEvent>;
