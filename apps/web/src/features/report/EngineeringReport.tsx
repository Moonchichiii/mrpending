import type { Build } from '@pending/contract';
import { useRef, useState } from 'react';
import { reportView } from './model/view';
import { ReportCard, SHAPES } from './ReportCard';
import type { Shape } from './ReportCard';
import { saveImage } from './save';
import styles from './Report.module.css';

// The Engineering Report of a finished build: the landscape card, the portrait card on phones, and Save as image.
export function EngineeringReport({ build }: { build: Build }) {
  const view = reportView(build);
  const landscape = useRef<SVGSVGElement>(null);
  const portrait = useRef<SVGSVGElement>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'failed'>('idle');
  const save = async () => {
    // CSS shows one card per screen width; the one with a box on the page is the one saved.
    const shown = (shape: Shape, card: SVGSVGElement | null) =>
      card !== null && card.getClientRects().length > 0 ? { shape, card } : undefined;
    const saved = shown('landscape', landscape.current) ?? shown('portrait', portrait.current);
    if (saved === undefined) return setSaving('failed');
    const { shape, card } = saved;
    setSaving('saving');
    try {
      const { width, height } = SHAPES[shape];
      await saveImage(card, width, height, `mr-pending-${build.id.replace(/[^\w-]/g, '-')}`);
      setSaving('idle');
    } catch {
      setSaving('failed');
    }
  };
  return (
    <section className={styles.report} aria-label="Engineering Report">
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
      {/* An alert, not a status: the desk around the card keeps the page's one status region. */}
      {saving === 'failed' && (
        <p role="alert">This browser could not make the image; the report above is the record.</p>
      )}
    </section>
  );
}
