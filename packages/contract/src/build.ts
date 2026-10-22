import * as z from 'zod';
import { Blueprint, Cell, Form, MAX_PARTS, Patch, range } from './blueprint';
import { MAX_STEPS, SimEvent } from './events';

export const MAX_ATTEMPTS = 6;
export const MAX_EVENTS = 400;
export const MAX_LINES = 60; // six attempts with asides reach 51; 40 was already at the edge

// Ids and versions: ASCII, bounded.
export const short = (max: number) =>
  z
    .string()
    .regex(/^[\w.:+-]+$/)
    .max(max);
export const Version = short(16);

export const Beat = z.enum([
  'intake',
  'designing',
  'designed',
  'running',
  'handoff',
  'failed',
  'repaired',
  'pressed',
  'exhausted',
  'rejected',
  'cameo',
]);

// A model memo is a Line with source 'model': shown under a memo label, spoken like any line.
export const Line = z.object({
  id: short(16),
  beat: Beat,
  mood: z.enum(['slow', 'excited', 'deadpan']),
  text: z.string().max(160),
  source: z.enum(['table', 'model']),
  at: z.object({ attempt: range(1, MAX_ATTEMPTS), step: range(0, MAX_STEPS) }),
});

export const Attempt = z.object({
  n: range(1, MAX_ATTEMPTS),
  blueprint: Blueprint,
  violations: z.array(z.string().max(120)).max(8),
  events: z.array(SimEvent).max(MAX_EVENTS),
  outcome: z.enum(['pressed', 'lost', 'stalled', 'invalid']),
  failedAt: Cell.optional(),
  patch: Patch.optional(), // the patch that produced THIS blueprint from the previous attempt's; absent on attempt 1
});

// attempts = attempts.length; parts = the LAST attempt's blueprint part count, never a sum over repairs.
export const Report = z.object({
  attempts: range(1, MAX_ATTEMPTS),
  parts: range(0, MAX_PARTS),
  pressed: z.boolean(),
  failedAt: Cell.optional(),
  verdict: z.string().max(120),
});

export const Model = z.object({
  mode: z.enum(['local', 'hosted']),
  id: z
    .string()
    .regex(/^[\w.:+/-]+$/)
    .max(64), // like short(), plus '/' for provider-qualified OpenRouter ids
  host: z.enum(['ollama', 'openrouter']),
  digest: short(80).optional(),
  runtime: short(32).optional(),
});

export const BuildHeader = z.object({
  id: short(32),
  contractVersion: Version,
  rulesVersion: Version,
  promptVersion: Version,
  form: Form,
  model: Model,
  title: z.string().max(40),
  report: Report,
  createdAt: z.iso.datetime({ precision: 3 }), // without a precision the fraction is unbounded
});

export const Build = BuildHeader.extend({
  attempts: z.array(Attempt).min(1).max(MAX_ATTEMPTS),
  lines: z.array(Line).max(MAX_LINES),
});

export type Beat = z.infer<typeof Beat>;
export type Line = z.infer<typeof Line>;
export type Attempt = z.infer<typeof Attempt>;
export type Report = z.infer<typeof Report>;
export type Model = z.infer<typeof Model>;
export type BuildHeader = z.infer<typeof BuildHeader>;
export type Build = z.infer<typeof Build>;
