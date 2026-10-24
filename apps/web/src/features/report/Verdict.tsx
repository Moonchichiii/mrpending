import type { Build } from '@pending/contract';
import type { ReactNode } from 'react';
import { useId, useRef, useState } from 'react';
import { reportView } from './model/view';
import { ReportCard, SHAPES } from './ReportCard';
import { saveImage } from './save';
import styles from './Report.module.css';

// The stylesheet's phone width, where the portrait card replaces the landscape one.
const PHONE = '(max-width: 40rem)';

// The verdict over the board of a finished build: the stamp, the title and the simulator's verdict, then Try again,
// Save the report and the Engineering Report itself, which opens on demand in a dialog. Try again submits the form
// named by `form`, or runs `onTryAgain`.
export function Verdict({
  build,
  form,
  onTryAgain,
  children,
}: {
  build: Build;
  form?: string | undefined;
  onTryAgain?: (() => void) | undefined;
  children?: ReactNode;
}) {
  const id = useId();
  const view = reportView(build);
  const dialog = useRef<HTMLDialogElement>(null);
  const landscape = useRef<SVGSVGElement>(null);
  const portrait = useRef<SVGSVGElement>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'failed'>('idle');
  const save = async () => {
    setSaving('saving');
    try {
      // The card saved is the one this screen width shows; both are drawn in the dialog, open or not.
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
    <section className={styles.verdict} aria-label="Verdict">
      <p className={view.stamp === 'APPROVED' ? styles.approved : styles.pending}>{view.stamp}</p>
      <h2 className={styles.title}>{build.title}</h2>
      <p className={styles.text}>{build.report.verdict}</p>
      {children}
      <div className={styles.actions}>
        <button
          type={form === undefined ? 'button' : 'submit'}
          form={form}
          className={styles.primary}
          onClick={onTryAgain}
        >
          Try again
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => void save()}
          disabled={saving === 'saving'}
        >
          Save the report
        </button>
        <button type="button" className={styles.secondary} onClick={() => dialog.current?.showModal()}>
          Open the report
        </button>
      </div>
      {/* An alert, not a status: the stage keeps the page's one status region. */}
      {saving === 'failed' && (
        <p role="alert" className={styles.failed}>
          This browser could not make the image; the Engineering Report is the record.
        </p>
      )}
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-report`}>
        <h2 id={`${id}-report`} className={styles.heading}>
          Engineering Report
        </h2>
        <div className={styles.landscape}>
          <ReportCard ref={landscape} view={view} shape="landscape" />
        </div>
        <div className={styles.portrait}>
          <ReportCard ref={portrait} view={view} shape="portrait" />
        </div>
        <form method="dialog">
          <button type="submit" className={styles.secondary}>
            Close
          </button>
        </form>
      </dialog>
    </section>
  );
}
