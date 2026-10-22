import * as z from 'zod';

const secret = z.string().min(1).max(512);

// SECURITY-AND-FAILURE-CONTRACT section 6: every setting is parsed here; an invalid environment stops the boot.
export const Env = z
  .object({
    INFERENCE_MODE: z.enum(['local', 'hosted']),
    OLLAMA_URL: z
      .url({ protocol: /^https?$/ })
      .max(200)
      .default('http://127.0.0.1:11434'),
    WEB_ORIGIN: z.url({ protocol: /^https?$/ }).max(200),
    // Until the identity probe has run, identity is the socket address (section 5).
    IDENTITY_HEADER: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(64)
      .optional(),
    // One model on a laptop whose GPU memory is shared system RAM (section 4).
    MAX_CONCURRENT_BUILDS: z.coerce.number().int().min(1).max(10).default(1),
    OPENROUTER_API_KEY: secret.optional(),
    ELEVENLABS_API_KEY: secret.optional(),
    ELEVENLABS_VOICE_ID: secret.optional(),
    SENTRY_DSN: z.url().max(300).optional(),
  })
  .refine((env) => env.INFERENCE_MODE === 'local' || env.OPENROUTER_API_KEY !== undefined, {
    message: 'hosted mode needs a key',
    path: ['OPENROUTER_API_KEY'],
  });

export type Env = z.infer<typeof Env>;

// Throws with the names of the bad keys only, never their values, so a secret cannot reach a boot log.
export function parseEnv(raw: unknown): Env {
  const parsed = Env.safeParse(raw);
  if (parsed.success) return parsed.data;
  const keys = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'environment')))];
  throw new Error(`invalid environment: ${keys.join(', ')}`);
}
