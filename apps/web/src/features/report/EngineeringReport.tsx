import type { Build } from '@pending/contract';
import { useId, useRef, useState } from 'react';
import { reportView } from './model/view';
import { ReportCard, SHAPES } from './ReportCard';
import { saveImage } from './save';
import styles from './Report.module.css';

// The stylesheet's phone width, where the portrait card replaces the landscape one.
const PHONE = '(max-width: 40rem)';

// The Engineering Report of a finished build, kept in the Minutes: the card this screen width shows, and Save as
// image, which saves that card as a PNG.
export function EngineeringReport({ build }: { build: Build }) {
  const id = useId();
  const view = reportView(build);
  const landscape = useRef<SVGSVGElement>(null);
  const portrait = useRef<SVGSVGElement>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'failed'>('idle');
  const save = async () => {
    setSaving('saving');
    try {
      const shape = window.matchMedia(PHONE).matches ? 'portrait' : 'landscape';
      const card = (shape === 'portrait' ? portrait : landscape).current;
      if (card === null) throw new Error('the report card is not drawn');
      const { width, height } = SHAPES[shape];
      await saveImage(card, width, height, `mr-pending-${build.id.replace(/[^\w-]/g, '-')}`);
      setSaving('idle');
    } catch {
      setSaving('failed');
    }
  };
  return (
    <section className={styles.report} aria-labelledby={id}>
      <h3 id={id} className={styles.heading}>
        Engineering Report
      </h3>
      <div className={styles.landscape}>
        <ReportCard ref={landscape} view={view} shape="landscape" />
      </div>
      <div className={styles.portrait}>
        <ReportCard ref={portrait} view={view} shape="portrait" />
      </div>
      <button
        type="button"
        className={styles.save}
        onClick={() => void save()}
        disabled={saving === 'saving'}
      >
        Save as image
      </button>
      {/* An alert, not a status: the stage keeps the page's one status region. */}
      {saving === 'failed' && (
        <p role="alert" className={styles.failed}>
          This browser could not make the image; the Engineering Report is the record.
        </p>
      )}
    </section>
  );
}
