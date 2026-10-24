import type { Build } from '@pending/contract';
import { BOARD } from '../board';
import { Thumbnail } from '../report';
import styles from './GalleryShelf.module.css';

const HOST = { ollama: 'Ollama', openrouter: 'OpenRouter' } as const;

// Recorded builds, each led by the final frame of its final attempt, then the stamp, the verdict and every number from
// the report; the title is small text under them (a link when the record has an address), provenance in the footer.
export function GalleryShelf({
  records,
  hrefOf,
}: {
  records: Build[];
  hrefOf?: ((record: Build) => string) | undefined;
}) {
  if (records.length === 0)
    return <p className={styles.empty}>The archive is being filed. Recorded machines will appear here.</p>;
  return (
    <ul className={styles.shelf}>
      {records.map((record) => {
        const final = record.attempts.at(-1);
        return (
          <li key={record.id} className={styles.card}>
            {/* The picture repeats what the stamp and numbers say, so it is hidden from assistive technology. */}
            {final && (
              <svg className={styles.thumb} viewBox={`0 0 ${BOARD.width} ${BOARD.height}`} aria-hidden="true">
                <Thumbnail
                  blueprint={final.blueprint}
                  events={final.events}
                  x={0}
                  y={0}
                  width={BOARD.width}
                />
              </svg>
            )}
            <p className={record.report.pressed ? styles.approved : styles.pending}>
              {record.report.pressed ? 'APPROVED' : 'PENDING'}
            </p>
            <p>{record.report.verdict}</p>
            <p className={styles.facts}>
              {record.report.attempts} {record.report.attempts === 1 ? 'trial' : 'trials'} ·{' '}
              {record.report.parts} {record.report.parts === 1 ? 'part' : 'parts'}
            </p>
            <h3 className={styles.name}>
              {hrefOf === undefined ? record.title : <a href={hrefOf(record)}>{record.title}</a>}
            </h3>
            <p className={styles.footer}>
              Recorded {record.model.mode} inference · {record.model.id} via {HOST[record.model.host]}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
