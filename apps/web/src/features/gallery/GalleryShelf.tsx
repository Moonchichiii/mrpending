import type { BuildHeader } from '@pending/contract';
import styles from './GalleryShelf.module.css';

const HOST = { ollama: 'Ollama', openrouter: 'OpenRouter' } as const;

// Recorded builds by their headers: every number from the report, the title as text, provenance in the footer.
export function GalleryShelf({ records }: { records: BuildHeader[] }) {
  if (records.length === 0)
    return <p className={styles.empty}>The archive is being filed. Recorded machines will appear here.</p>;
  return (
    <ul className={styles.shelf}>
      {records.map((record) => (
        <li key={record.id} className={styles.card}>
          <div className={styles.head}>
            <h3 className={styles.title}>{record.title}</h3>
            <p className={record.report.pressed ? styles.approved : styles.pending}>
              {record.report.pressed ? 'APPROVED' : 'PENDING'}
            </p>
          </div>
          <p className={styles.facts}>
            {record.report.attempts} {record.report.attempts === 1 ? 'trial' : 'trials'} ·{' '}
            {record.report.parts} {record.report.parts === 1 ? 'part' : 'parts'}
          </p>
          <p>{record.report.verdict}</p>
          <p className={styles.footer}>
            Recorded {record.model.mode} inference · {record.model.id} via {HOST[record.model.host]}
          </p>
        </li>
      ))}
    </ul>
  );
}
