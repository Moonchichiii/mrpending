import type { BuildHeader } from '@pending/contract';
import { useEffect, useState } from 'react';
import { Playback } from './features/build';
import { Gallery, GalleryShelf, fetchRecord, slugOf } from './features/gallery';
import type { Replayed } from './features/gallery';
import styles from './FrontDoor.module.css';

const REPO = 'https://github.com/Moonchichiii/mrpending';
const GUIDE = `${REPO}#readme`;
// The build info: which commit the host built, so a preview can be matched to its source.
const COMMIT = import.meta.env.VITE_COMMIT;
// The record the button plays: a failure, a correction and a press, re-run through the simulator before it is shown.
const DEMO = 'scenic';
export const CLOSED =
  'The Department is closed to new applications. The button plays a recorded build, which this browser checks again with the simulator before it is shown.';

// The public site on the same stage as the local one: no form, no build client, no API. The button plays a recorded
// build on the stage's one board; the gallery is folded away below, and opened when the address names a record.
// Headers handed in are shelved as they are, so the layout harness can show records at every schema maximum.
export function StaticFrontDoor({ records }: { records?: BuildHeader[] | undefined }) {
  const [demo, setDemo] = useState<Replayed>();
  useEffect(() => {
    const controller = new AbortController();
    const settle = (replayed: Replayed) => {
      if (!controller.signal.aborted) setDemo(replayed);
    };
    fetchRecord(DEMO, controller.signal).then(settle, () =>
      settle({ ok: false, reason: `The archive did not return ${DEMO}.` }),
    );
    return () => controller.abort();
  }, []);
  // One playback at a time: an address that names a record plays it in the gallery, so the button waits for the front door.
  const [record] = useState(() => slugOf(window.location.pathname) !== undefined);
  const heading = <h1 className={styles.name}>Mr. Pending</h1>;
  const note = record
    ? 'A recorded build is already playing in the gallery below.'
    : demo === undefined
      ? 'The recording is being fetched.'
      : demo.ok
        ? undefined
        : demo.reason;

  return (
    <>
      <main className={styles.page}>
        <Playback
          build={demo?.ok ? demo.build : undefined}
          heading={heading}
          intro={CLOSED}
          note={note}
          blocked={record}
          autoplay={false}
        />
        <details className={styles.fold} open={window.location.pathname !== import.meta.env.BASE_URL}>
          <summary className={styles.summary}>
            <h2 id="gallery-title">The gallery</h2>
          </summary>
          <section id="gallery" className={styles.section} aria-labelledby="gallery-title">
            {records === undefined ? <Gallery /> : <GalleryShelf records={records} />}
          </section>
        </details>
      </main>
      <footer className={styles.footer}>
        <p>
          <a href={GUIDE}>Run it on your machine</a>
        </p>
        <p>
          Build{' '}
          {COMMIT === '' ? (
            'not from a recorded commit'
          ) : (
            <a href={`${REPO}/commit/${COMMIT}`}>{COMMIT.slice(0, 12)}</a>
          )}
        </p>
      </footer>
    </>
  );
}
