import type { Build } from '@pending/contract';
import { BuildDesk, InferenceBadge, useInference } from './features/build';
import { Gallery, MyDepartment, YourRecords, keep, useDepartment } from './features/gallery';
import styles from './FrontDoor.module.css';

// The local installation: Mr. Pending and the blue button first, then this browser's department and the gallery, with
// import and export folded away below. No prompt leaves the browser before the badge says where it goes.
export function LocalFrontDoor() {
  const { inference, retry } = useInference();
  const department = useDepartment();
  const finished = (build: Build) => {
    if (keep(build) === undefined) return false;
    department.refresh();
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
        <MyDepartment builds={department.builds} />
      </section>
      <section className={styles.section} aria-labelledby="gallery-title">
        <h2 id="gallery-title">The gallery</h2>
        <Gallery />
      </section>
      <YourRecords builds={department.builds} onChange={department.refresh} />
    </main>
  );
}
