import type { BuildHeader } from '@pending/contract';
import { Gallery, GalleryShelf } from './features/gallery';
import styles from './FrontDoor.module.css';

const GUIDE = 'https://github.com/Moonchichiii/mrpending#readme';

// The public site: no form, no build client, no API; it opens on the gallery replayed from the static archive.
// Headers handed in are shelved as they are, so the layout harness can show records at every schema maximum.
export function StaticFrontDoor({ records }: { records?: BuildHeader[] | undefined }) {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.name}>Mr. Pending</h1>
        <p className={styles.lede}>
          Chief Engineer of the Department of Unnecessary Engineering. One job: press one blue button.
          Recorded local inference.
        </p>
        <nav className={styles.actions} aria-label="Start">
          <a className={styles.primary} href="#gallery">
            Watch Mr. Pending at work
          </a>
          <a className={styles.secondary} href={GUIDE}>
            Run it on your machine
          </a>
        </nav>
      </header>
      <section id="gallery" className={styles.section} aria-labelledby="gallery-title">
        <h2 id="gallery-title">The gallery</h2>
        {records === undefined ? <Gallery /> : <GalleryShelf records={records} />}
      </section>
    </main>
  );
}
