import type { Build } from '@pending/contract';
import { useId, useState } from 'react';
import { dueLabel, exportJson, importFile, kept } from './model/department';
import type { Kept } from './model/department';
import styles from './Gallery.module.css';
import stamp from './GalleryShelf.module.css';

// The file is handed to the browser's download and the object URL revoked at once; no address is ever shown.
function download(due: number, build: Build) {
  const url = URL.createObjectURL(new Blob([exportJson(build)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${dueLabel(due)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// What this browser holds, read afresh whenever a build is kept or a file imported; the list and the records share it.
export function useDepartment() {
  const [builds, setBuilds] = useState<Kept[]>(kept);
  return { builds, refresh: () => setBuilds(kept()) };
}

// This browser's last 20 builds, always in view.
export function MyDepartment({ builds }: { builds: Kept[] }) {
  if (builds.length === 0) return <p className={styles.note}>No builds filed in this browser yet.</p>;
  return (
    <ul className={stamp.shelf}>
      {builds.map((entry) => (
        <li key={entry.due} className={stamp.card}>
          <p className={styles.due}>{dueLabel(entry.due)}</p>
          <h3 className={stamp.title}>{entry.build.title}</h3>
          {entry.ok ? (
            <>
              <p className={entry.build.report.pressed ? stamp.approved : stamp.pending}>
                {entry.build.report.pressed ? 'APPROVED' : 'PENDING'}
              </p>
              <p>
                {entry.build.report.attempts} {entry.build.report.attempts === 1 ? 'trial' : 'trials'} ·{' '}
                {entry.build.report.parts} {entry.build.report.parts === 1 ? 'part' : 'parts'}
              </p>
              <p>{entry.build.report.verdict}</p>
            </>
          ) : (
            <p className={styles.note}>{entry.reason}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

// Import and export, closed by default: each build leaves only as a JSON file, and an imported file is replayed
// before it is kept.
export function YourRecords({ builds, onChange }: { builds: Kept[]; onChange: () => void }) {
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const inputId = useId();

  const onImport = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    const replayed = await importFile(file);
    setRefusal(replayed.ok ? undefined : replayed.reason);
    onChange();
  };

  return (
    <details className={styles.records}>
      <summary className={styles.summary}>Advanced: your records</summary>
      <div className={styles.department}>
        <label htmlFor={inputId} className={styles.import}>
          Import a build (JSON, up to 512 KB)
        </label>
        <input
          id={inputId}
          className={styles.file}
          type="file"
          accept="application/json,.json"
          onChange={(e) => void onImport(e.currentTarget)}
        />
        {refusal !== undefined && (
          <p role="alert" className={styles.note}>
            {refusal}
          </p>
        )}
        {builds.length > 0 && (
          <ul className={styles.exports}>
            {builds.map((entry) => (
              <li key={entry.due}>
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => download(entry.due, entry.build)}
                >
                  Export {dueLabel(entry.due)} as JSON
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
