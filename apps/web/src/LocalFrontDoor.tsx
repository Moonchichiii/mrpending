import type { BuildHeader } from '@pending/contract';
import { BuildDesk, InferenceBadge, useInference } from './features/build';
import { GalleryShelf } from './features/gallery';
import styles from './FrontDoor.module.css';

// The local installation: Form 27B/6 is the primary action, the gallery follows.
// No prompt leaves the browser before the badge says where it goes.
export function LocalFrontDoor({ records }: { records: BuildHeader[] }) {
  const { inference, retry } = useInference();
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.name}>Mr. Pending</h1>
        <p className={styles.lede}>
          Chief Engineer of the Department of Unnecessary Engineering. File the form; he will design something
          magnificent that almost works.
        </p>
        <InferenceBadge inference={inference} onRetry={retry} />
      </header>
      <section className={styles.section} aria-label="Form 27B/6">
        <BuildDesk canFile={inference.status === 'confirmed'} />
      </section>
      <section className={styles.section} aria-labelledby="gallery-title">
        <h2 id="gallery-title">The gallery</h2>
        <GalleryShelf records={records} />
      </section>
    </main>
  );
}
