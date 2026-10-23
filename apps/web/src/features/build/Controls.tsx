import { useEffect } from 'react';
import type { Speed } from './model/session';
import styles from './BuildDesk.module.css';

// Elements that act on Space themselves, so the page-wide shortcut leaves them alone.
const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [contenteditable]';

const SPEEDS: { speed: Speed; label: string }[] = [
  { speed: 0.5, label: '0.5×' },
  { speed: 1, label: '1×' },
  { speed: 3, label: 'Impatient' },
];

// Playback controls: native buttons, so every one is reachable and operable from the keyboard; toggles say their state.
export function Controls({
  speed,
  paused,
  onPause,
  onReplay,
  onSpeed,
}: {
  speed: Speed;
  paused: boolean | undefined;
  onPause: (paused: boolean) => void;
  onReplay: () => void;
  onSpeed: (speed: Speed) => void;
}) {
  // ARCHITECTURE: Space pauses the machine from anywhere on the page; Esc and Skip voice belong to the voice control.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== ' ' || paused === undefined) return;
      if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return;
      event.preventDefault();
      // A held key auto-repeats; only the first press toggles, so holding Space cannot flicker playback.
      if (!event.repeat) onPause(!paused);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [paused, onPause]);

  return (
    <fieldset className={styles.controls}>
      <legend className={styles.legend}>Playback</legend>
      <button
        type="button"
        className={styles.control}
        aria-pressed={paused ?? false}
        disabled={paused === undefined}
        onClick={() => onPause(!paused)}
      >
        Pause
      </button>
      <button type="button" className={styles.control} onClick={onReplay}>
        Replay
      </button>
      {SPEEDS.map((option) => (
        <button
          key={option.speed}
          type="button"
          className={styles.control}
          aria-pressed={speed === option.speed}
          onClick={() => onSpeed(option.speed)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
