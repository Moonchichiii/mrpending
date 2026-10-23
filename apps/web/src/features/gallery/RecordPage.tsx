import type { Build } from '@pending/contract';
import { Playback } from '../build';
import { GUIDE, provenance } from './model/records';
import styles from './Gallery.module.css';
import stamp from './GalleryShelf.module.css';

// One gallery record played back trial by trial as the simulator ran it, the report recomputed, provenance first.
export function RecordPage({ build, corrected }: { build: Build; corrected: boolean }) {
  return (
    <article className={styles.record} aria-labelledby="record-title">
      <h3 id="record-title" className={stamp.title}>
        {build.title}
      </h3>
      <p className={styles.provenance}>
        {provenance(build).join(' · ')} · <a href={GUIDE}>How the gallery was produced</a>
      </p>
      {corrected && (
        <p className={styles.note}>
          The stored record disagreed with the rules; this is the rules' account of it.
        </p>
      )}
      <p className={styles.note}>Form 27B/6: {build.form.nature}</p>
      <Playback build={build} />
      <p className={build.report.pressed ? stamp.approved : stamp.pending}>
        {build.report.pressed ? 'APPROVED' : 'PENDING'}
      </p>
      <p>
        {build.report.attempts} {build.report.attempts === 1 ? 'trial' : 'trials'} · {build.report.parts}{' '}
        {build.report.parts === 1 ? 'part' : 'parts'}
        {build.report.failedAt === undefined ? '' : ` · stopped at ${build.report.failedAt}`}
      </p>
      <p>{build.report.verdict}</p>
      <a href={import.meta.env.BASE_URL}>Back to the gallery</a>
    </article>
  );
}
