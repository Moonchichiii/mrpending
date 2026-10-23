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

// This browser's last 20 builds; each leaves only as a JSON file, and an imported file is replayed before it is kept.
export function MyDepartment() {
  const [builds, setBuilds] = useState<Kept[]>(kept);
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const inputId = useId();

  const onImport = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    const replayed = await importFile(file);
    setRefusal(replayed.ok ? undefined : replayed.reason);
    setBuilds(kept());
  };

  return (
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
      {builds.length === 0 ? (
        <p className={styles.note}>No builds filed in this browser yet.</p>
      ) : (
        <ul className={stamp.shelf}>
          {builds.map(({ due, build }) => (
            <li key={due} className={stamp.card}>
              <p className={styles.due}>{dueLabel(due)}</p>
              <h3 className={stamp.title}>{build.title}</h3>
              <p className={build.report.pressed ? stamp.approved : stamp.pending}>
                {build.report.pressed ? 'APPROVED' : 'PENDING'}
              </p>
              <p>
                {build.report.attempts} {build.report.attempts === 1 ? 'trial' : 'trials'} ·{' '}
                {build.report.parts} {build.report.parts === 1 ? 'part' : 'parts'}
              </p>
              <p>{build.report.verdict}</p>
              <button type="button" className={styles.action} onClick={() => download(due, build)}>
                Export {dueLabel(due)} as JSON
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
