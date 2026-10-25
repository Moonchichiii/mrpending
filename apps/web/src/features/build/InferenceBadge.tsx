import { Config } from '@pending/contract';
import type { Model } from '@pending/contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './InferenceBadge.module.css';

// ARCHITECTURE section 4: the copy follows /api/config.inference and nothing else.
const COPY: Record<Config['inference'], string> = {
  'this-machine': 'Gemma runs on this machine. Your prompts stay here.',
  server: 'Gemma runs on the Mr. Pending server. Your prompts go to that server, not to a model provider.',
  hosted: 'Gemma runs hosted via OpenRouter. Your request is sent to OpenRouter.',
};

const HOST: Record<Model['host'], string> = { ollama: 'Ollama', openrouter: 'OpenRouter' };
const WHERE: Record<Config['inference'] | 'recorded', string> = {
  'this-machine': 'Running locally',
  server: 'On the Mr. Pending server',
  hosted: 'Hosted',
  recorded: 'Recorded',
};

// The board's badge, from the config or the build header only: an Ollama tag such as gemma4:e2b reads "Gemma 4 E2B",
// any other id is shown as it is.
export function source(model: Model, where: Config['inference'] | 'recorded'): string {
  const name = model.id.replace(
    /^gemma(\d+):([a-z0-9]+)$/i,
    (_, major: string, size: string) => `Gemma ${major} ${size.toUpperCase()}`,
  );
  return `${name} · ${HOST[model.host]} · ${WHERE[where]}`;
}

// The badge's words, which the front doors' footers repeat.
export function badgeText(model?: Model, where?: Config['inference'] | 'recorded'): string {
  return model !== undefined && where !== undefined ? source(model, where) : 'Model not confirmed';
}

// The model badge on the board: a green dot while the config confirms a model, an amber one on a recording, and a
// grey one while no model is confirmed; the dot only repeats what the words say.
export function ModelBadge({
  model,
  where,
}: {
  model?: Model | undefined;
  where?: Config['inference'] | 'recorded' | undefined;
}) {
  const known = model !== undefined && where !== undefined;
  return (
    <p className={styles.model} data-state={!known ? 'off' : where === 'recorded' ? 'recorded' : 'on'}>
      <span className={styles.dot} aria-hidden="true" />
      {badgeText(model, where)}
    </p>
  );
}

// A config that has not answered by then counts as unconfirmed; the visitor may ask again.
export const CONFIG_TIMEOUT_MS = 5000;

export type Inference =
  | { status: 'asking' }
  | { status: 'confirmed'; inference: Config['inference']; model: Config['model'] }
  | { status: 'unconfirmed' };

// One fetch on mount and one per retry; a failed, invalid or late answer is unconfirmed, never a guess.
export function useInference(): { inference: Inference; retry: () => void } {
  const [inference, setInference] = useState<Inference>({ status: 'asking' });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
    fetch('/api/config', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((body: unknown) => {
        const parsed = Config.safeParse(body);
        if (live)
          setInference(
            parsed.success
              ? { status: 'confirmed', inference: parsed.data.inference, model: parsed.data.model }
              : { status: 'unconfirmed' },
          );
      })
      .catch(() => {
        if (live) setInference({ status: 'unconfirmed' });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [round]);
  const retry = useCallback(() => setRound((n) => n + 1), []);
  return { inference, retry };
}

export function InferenceBadge({ inference, onRetry }: { inference: Inference; onRetry: () => void }) {
  const badge = useRef<HTMLParagraphElement>(null);
  const retried = useRef(false);
  // The retry button disappears once the answer arrives, so its focus moves to the badge that replaces it.
  useEffect(() => {
    if (inference.status === 'confirmed' && retried.current) badge.current?.focus();
  }, [inference.status]);

  switch (inference.status) {
    case 'asking':
      return null;
    case 'confirmed':
      return (
        <p ref={badge} tabIndex={-1} className={styles.badge}>
          {COPY[inference.inference]}
        </p>
      );
    case 'unconfirmed':
      return (
        <div className={styles.unconfirmed}>
          <p>
            The Department has not confirmed where drafting happens. Form 27B/6 will not be filed until it
            does.
          </p>
          <button
            type="button"
            className={styles.retry}
            onClick={() => {
              retried.current = true;
              onRetry();
            }}
          >
            Ask the Department again
          </button>
        </div>
      );
  }
}
