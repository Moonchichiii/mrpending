import type { Speed } from './model/session';
import styles from './BuildDesk.module.css';

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
  onSkipVoice,
  onSpeed,
}: {
  speed: Speed;
  paused: boolean | undefined;
  onPause: (paused: boolean) => void;
  onReplay: () => void;
  onSkipVoice: () => void;
  onSpeed: (speed: Speed) => void;
}) {
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
      <button type="button" className={styles.control} onClick={onSkipVoice}>
        Skip voice
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
