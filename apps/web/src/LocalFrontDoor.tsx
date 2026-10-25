import { BuildDesk, InferenceBadge, useInference } from './features/build';
import { Gallery } from './features/gallery';
import { MOTTO } from './StaticFrontDoor';
import styles from './FrontDoor.module.css';

// The local installation on one screen: Mr. Pending, the button and the board; the Minutes, the form and the gallery
// are folded away below. No prompt leaves the browser before the badge says where it goes.
export function LocalFrontDoor() {
  const { inference, retry } = useInference();
  return (
    <>
      <main className={styles.page}>
        <BuildDesk
          canFile={inference.status === 'confirmed'}
          connecting={inference.status === 'asking'}
          config={inference.status === 'confirmed' ? inference : undefined}
          notice={<InferenceBadge inference={inference} onRetry={retry} />}
          heading="Mr. Pending"
        />
        {/* Open when the address names a record, which the gallery then shows. */}
        <details className={styles.fold} open={window.location.pathname !== import.meta.env.BASE_URL}>
          <summary className={styles.summary}>
            <h2 id="gallery-title">The gallery</h2>
          </summary>
          <section className={styles.section} aria-labelledby="gallery-title">
            <Gallery />
          </section>
        </details>
      </main>
      <footer className={styles.footer}>
        <p className={styles.motto}>{MOTTO}</p>
      </footer>
    </>
  );
}
