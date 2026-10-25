import type { Line } from '@pending/contract';
import { useEffect } from 'react';
import { useSpeaker } from './useSpeaker';
import type { Mute } from './useSpeaker';
import styles from './Voice.module.css';

// The voice control discloses its provider in one sentence (ARCHITECTURE section 3).
// The two sentences wrap alike, since one replaces the other once the voices are listed.
const ON_DEVICE = 'Mr. Pending speaks from recordings or on-device voice; no line leaves this device.';
const CAPTIONS_ONLY = "This device has no voice, so only Mr. Pending's recorded lines are spoken aloud.";

// Mr. Pending's one speech bubble: the line being spoken, which the next one replaces, with Mute and Skip under it.
// The bubble is the live announcement of his lines; the full list stays folded away with the minutes.
// `lines` are the lines said so far; `playback` changes on a replay or a new build; `idle` is what the bubble says
// before any line; `mute`, when given, is a Mute setting held above, so it carries over to a voice that replaces this one.
export function Voice({
  lines,
  playback,
  idle,
  mute,
}: {
  lines: readonly Line[];
  playback: number | string;
  idle?: string | undefined;
  mute?: Mute | undefined;
}) {
  const { status, caption, voice, muted, setMuted, skip } = useSpeaker(lines, playback, mute);
  const busy = status === 'loading' || status === 'speaking';

  // ARCHITECTURE: Esc skips voice from anywhere on the page. Only a voice with a line in flight takes the press, and
  // marks it handled so no other listener skips again; a silent one leaves it to a voice that is speaking.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !busy) return;
      event.preventDefault();
      skip();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [skip, busy]);

  return (
    <section className={styles.voice} aria-label="Voice">
      <div className={styles.bubble} data-mood={caption?.mood}>
        <p className={styles.line} aria-live="polite">
          {caption?.source === 'model' && <span className={styles.memo}>Memo: </span>}
          {caption?.text ?? idle}
        </p>
        {/* Decoration only: the bubble's text is the line, and the toggle under it says whether he speaks. */}
        <svg className={styles.speaking} data-speaking={busy} viewBox="0 0 64 20" aria-hidden="true">
          <path className={styles.speaker} d="M2 7h4l5-4v14l-5-4H2z" />
          {[20, 27, 34, 41, 48].map((x, i) => (
            <line key={x} className={styles.bar} x1={x} x2={x} y1={5 + (i % 2) * 3} y2={15 - (i % 2) * 3} />
          ))}
          <circle className={styles.dot} cx={56} cy={10} r={1.6} />
          <circle className={styles.dot} cx={61} cy={10} r={1.6} />
        </svg>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          aria-pressed={!muted}
          onClick={() => setMuted(!muted)}
        >
          <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true">
            <path className={styles.fill} d="M2 7h4l5-4v14l-5-4H2z" />
            {muted ? (
              <path d="M14 7l5 6M19 7l-5 6" />
            ) : (
              <path d="M14 6.5a5 5 0 0 1 0 7M16.5 4a8.5 8.5 0 0 1 0 12" />
            )}
          </svg>
          Voice on
        </button>
        <button type="button" className={styles.control} onClick={skip} aria-keyshortcuts="Escape">
          <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true">
            <path className={styles.fill} d="M2 4l8 6-8 6zM10 4l8 6-8 6z" />
          </svg>
          Skip voice
        </button>
      </div>
      <p className={styles.disclosure}>{voice === 'none' ? CAPTIONS_ONLY : ON_DEVICE}</p>
    </section>
  );
}
