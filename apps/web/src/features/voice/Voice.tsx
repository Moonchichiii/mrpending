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
      <p className={styles.bubble} data-mood={caption?.mood} aria-live="polite">
        {status === 'speaking' && <span className={styles.speaking} data-speaking="" aria-hidden="true" />}
        {caption?.source === 'model' && <span className={styles.memo}>Memo: </span>}
        {caption?.text ?? idle}
      </p>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          aria-pressed={muted}
          onClick={() => setMuted(!muted)}
        >
          Mute
        </button>
        <button type="button" className={styles.control} onClick={skip} aria-keyshortcuts="Escape">
          Skip voice
        </button>
        <p className={styles.disclosure}>{voice === 'none' ? CAPTIONS_ONLY : ON_DEVICE}</p>
      </div>
    </section>
  );
}
