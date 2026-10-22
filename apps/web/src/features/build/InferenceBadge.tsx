import { Config } from '@pending/contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './InferenceBadge.module.css';

// ARCHITECTURE section 4: the copy follows /api/config.inference and nothing else.
const COPY: Record<Config['inference'], string> = {
  'this-machine': 'Gemma runs on this machine. Your prompts stay here.',
  server: 'Gemma runs on the Mr. Pending server. Your prompts go to that server, not to a model provider.',
  hosted: 'Gemma runs hosted via OpenRouter. Your request is sent to OpenRouter.',
};

// A config that has not answered by then counts as unconfirmed; the visitor may ask again.
export const CONFIG_TIMEOUT_MS = 5000;

export type Inference =
  | { status: 'asking' }
  | { status: 'confirmed'; inference: Config['inference'] }
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
              ? { status: 'confirmed', inference: parsed.data.inference }
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
