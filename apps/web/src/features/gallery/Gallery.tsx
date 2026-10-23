import type { Build } from '@pending/contract';
import { useEffect, useState } from 'react';
import { GalleryShelf } from './GalleryShelf';
import { RecordPage } from './RecordPage';
import { SLUGS, fetchRecord, recordHref, slugOf } from './model/records';
import type { Slug } from './model/records';
import styles from './Gallery.module.css';

type Shelf =
  | { status: 'loading' }
  | { status: 'ready'; records: { slug: Slug; build: Build; corrected: boolean }[]; refused: string[] };

// The public site's whole content: static records, replayed in the browser, no agent and no inference involved.
export function Gallery() {
  // The path is read once on mount; there is no router.
  const [slug] = useState(() => slugOf(window.location.pathname));
  const [shelf, setShelf] = useState<Shelf>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const wanted = slug === undefined ? SLUGS : [slug];
    // Each fetch settles to a result of its own, so the whole never rejects.
    void Promise.all(
      wanted.map((s) =>
        fetchRecord(s, controller.signal).then(
          (replayed) => ({ slug: s, replayed }),
          () => ({ slug: s, replayed: { ok: false as const, reason: `The archive did not return ${s}.` } }),
        ),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      setShelf({
        status: 'ready',
        records: results.flatMap((r) =>
          r.replayed.ok ? [{ slug: r.slug, build: r.replayed.build, corrected: r.replayed.corrected }] : [],
        ),
        refused: results.flatMap((r) => (r.replayed.ok ? [] : [r.replayed.reason])),
      });
    });
    return () => controller.abort();
  }, [slug]);

  if (shelf.status === 'loading') return <p className={styles.note}>The archive is being fetched.</p>;
  const refused = shelf.refused.length > 0 && (
    <ul className={styles.refused} aria-label="Records the Department refused">
      {shelf.refused.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  );
  const opened = shelf.records[0];
  if (slug !== undefined)
    return opened === undefined ? (
      <>
        {refused}
        <a className={styles.link} href={import.meta.env.BASE_URL}>
          Back to the gallery
        </a>
      </>
    ) : (
      <RecordPage build={opened.build} corrected={opened.corrected} />
    );
  const slugById = new Map(shelf.records.map((r) => [r.build.id, r.slug]));
  return (
    <>
      <GalleryShelf
        records={shelf.records.map((r) => r.build)}
        hrefOf={(record) => {
          const s = slugById.get(record.id);
          return s === undefined ? import.meta.env.BASE_URL : recordHref(s);
        }}
      />
      {refused}
    </>
  );
}
