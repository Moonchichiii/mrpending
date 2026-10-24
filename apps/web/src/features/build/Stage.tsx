import type { ReactNode } from 'react';
import { useId } from 'react';
import { Desk } from './Desk';
import styles from './Stage.module.css';

// The one call to action: a blue dome on a hazard-striped base, lettered "Press the button", which files the form
// named by `form` or runs `onPress`. It stays in place in every phase, disabled while a build is on the board; `note`
// says why it waits when no build is the reason.
export function Hero({
  form,
  onPress,
  disabled,
  note,
}: {
  form?: string | undefined;
  onPress?: (() => void) | undefined;
  disabled: boolean;
  note?: string | undefined;
}) {
  const id = useId();
  return (
    <>
      <button
        type={onPress === undefined ? 'submit' : 'button'}
        form={form}
        className={styles.hero}
        disabled={disabled}
        onClick={onPress}
        aria-describedby={note === undefined ? undefined : `${id}-note`}
      >
        <span className={styles.lettering}>Press the button</span>
        <svg className={styles.arrow} viewBox="0 0 80 60" aria-hidden="true">
          <path d="M74 6C52 8 30 22 14 48" />
          <path d="M8 34l6 15 15-6" />
        </svg>
        <Dome id={id} />
      </button>
      {note !== undefined && (
        <p id={`${id}-note`} className={styles.note}>
          {note}
        </p>
      )}
    </>
  );
}

// The physical button: a dome in its collar on a hazard-striped plinth; the dome sinks while it is held down.
function Dome({ id }: { id: string }) {
  return (
    <svg className={styles.dome} viewBox="0 0 260 196" aria-hidden="true">
      <defs>
        <pattern
          id={`${id}-hazard`}
          width="26"
          height="26"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-40)"
        >
          <rect className={styles.hazardLight} width="26" height="26" />
          <rect className={styles.hazardDark} width="13" height="26" />
        </pattern>
      </defs>
      <g className={styles.sparks}>
        <path d="M44 34l10 12M24 62l14 6M74 16l4 14" />
      </g>
      <path className={styles.plinthSide} fill={`url(#${id}-hazard)`} d="M10 134v28a120 30 0 0 0 240 0v-28" />
      <ellipse className={styles.plinthTop} cx="130" cy="134" rx="120" ry="30" />
      <path className={styles.collarSide} d="M38 116v22a92 24 0 0 0 184 0v-22" />
      <ellipse className={styles.collarTop} cx="130" cy="116" rx="92" ry="24" />
      <g className={styles.cap}>
        <path className={styles.capBody} d="M52 112C52 26 208 26 208 112A78 22 0 0 1 52 112Z" />
        <path className={styles.capShade} d="M58 104A72 18 0 0 0 202 104L208 112A78 22 0 0 1 52 112Z" />
        <ellipse
          className={styles.capShine}
          cx="100"
          cy="64"
          rx="24"
          ry="10"
          transform="rotate(-22 100 64)"
        />
      </g>
    </svg>
  );
}

// The one persistent stage: on the yellow band the name over the Department's paperwork, Mr. Pending with his bubble,
// and the button with `notice` under it; then the one board, then the closed sections. Every phase fills the same
// places, so the page never grows with a build; on a desktop screen the stage fills the viewport and the board takes
// the height left. `heading`, when given, is the page's one h1.
export function Stage({
  heading,
  notice,
  engineer,
  action,
  board,
  folds,
}: {
  heading?: string | undefined;
  notice?: ReactNode;
  engineer: ReactNode;
  action: ReactNode;
  board: ReactNode;
  folds?: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <div className={heading === undefined ? `${styles.stage} ${styles.embedded}` : styles.stage}>
        {heading !== undefined && (
          <hgroup className={styles.top}>
            <h1 className={styles.name}>{heading}</h1>
            <p className={styles.department}>The Department of Unnecessary Engineering</p>
          </hgroup>
        )}
        <div className={styles.desk}>
          <Desk />
        </div>
        <div className={styles.engineer}>{engineer}</div>
        <div className={styles.action}>
          {action}
          {notice}
        </div>
        <div className={styles.board}>{board}</div>
      </div>
      {folds}
    </div>
  );
}
