import type { Build } from '@pending/contract';
import { useState } from 'react';
import { BuildDesk, InferenceBadge, useInference } from './features/build';
import { Gallery, MyDepartment, keep } from './features/gallery';
import styles from './FrontDoor.module.css';

// The local installation: Form 27B/6 is the primary action, this browser's department and the gallery follow.
// No prompt leaves the browser before the badge says where it goes.
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
        <BuildDesk canFile={inference.status === 'confirmed'} onFinished={finished} />
      </section>
      <section className={styles.section} aria-labelledby="department-title">
        <h2 id="department-title">My department</h2>
        <MyDepartment key={filed} />
      </section>
      <section className={styles.section} aria-labelledby="gallery-title">
        <h2 id="gallery-title">The gallery</h2>
        <Gallery />
      </section>
    </main>
  );
}
