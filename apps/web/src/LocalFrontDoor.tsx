import type { Build } from '@pending/contract';
import { useState } from 'react';
import { BuildDesk, InferenceBadge, useInference } from './features/build';
import { Gallery, MyDepartment, keep } from './features/gallery';
import { MOTTO } from './StaticFrontDoor';
import styles from './FrontDoor.module.css';

// The local installation on one screen: Mr. Pending, the button and the board; the Minutes, the form, this browser's
// department and the gallery are folded away below. No prompt leaves the browser before the badge says where it goes.
export function LocalFrontDoor() {
  const { inference, retry } = useInference();
  // Each build that ends is kept here; a kept one remounts the department, which reads what this browser holds afresh.
  const [filed, setFiled] = useState(0);
  const finished = (build: Build) => {
    if (keep(build) === undefined) return false;
    setFiled((n) => n + 1);
    return true;
  };
  return (
    <>
      <main className={styles.page}>
        <BuildDesk
          canFile={inference.status === 'confirmed'}
          connecting={inference.status === 'asking'}
          onFinished={finished}
          config={inference.status === 'confirmed' ? inference : undefined}
          notice={<InferenceBadge inference={inference} onRetry={retry} />}
          heading="Mr. Pending"
        />
        <details className={styles.fold}>
          <summary className={styles.summary}>
            <h2 id="department-title">My department</h2>
          </summary>
          <section className={styles.section} aria-labelledby="department-title">
            <MyDepartment key={filed} />
          </section>
        </details>
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
