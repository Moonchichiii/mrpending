import type { Line } from '@pending/contract';
import { useEffect } from 'react';
import { useSpeaker } from './useSpeaker';
import type { Mute } from './useSpeaker';
import styles from './Voice.module.css';

// The voice control discloses its provider in one sentence (ARCHITECTURE section 3).
const ON_DEVICE = "Mr. Pending speaks with your browser's on-device voice; no line leaves this device.";
const CAPTIONS_ONLY = 'This device has no voice for Mr. Pending, so his lines are captioned only.';

// The caption of the line being spoken, Mute and Skip; the lines list owns the live announcement, so the caption is not live.
// `lines` are the lines said so far; `playback` changes on a replay or a new build; `mute`, when given, is a Mute
// setting held above, so it carries over to the voice that replaces this one.
export function Voice({
  lines,
  playback,
  mute,
}: {
  lines: readonly Line[];
  playback: number | string;
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
      <p className={styles.caption} data-mood={caption?.mood}>
        {caption?.source === 'model' && <span className={styles.memo}>Memo: </span>}
        {caption?.text}
      </p>
      <p className={styles.disclosure}>{voice === 'none' ? CAPTIONS_ONLY : ON_DEVICE}</p>
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
      </div>
    </section>
  );
}
