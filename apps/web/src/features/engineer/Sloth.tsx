import { useReducedMotion } from './useReducedMotion';
import styles from './Engineer.module.css';

// The face both variants share; its one motion is a single slow blink.
function Face({ blink }: { blink: boolean }) {
  return (
    <>
      <ellipse className={styles.paper} cx="40" cy="52" rx="17" ry="13" />
      <circle className={styles.pupil} cx="34" cy="50" r="3" />
      <circle className={styles.pupil} cx="46" cy="50" r="3" />
      <rect
        className={blink ? `${styles.slothLid} ${styles.blink}` : styles.slothLid}
        x="29"
        y="45"
        width="22"
        height="9"
      />
      <ellipse className={styles.pupil} cx="40" cy="56" rx="3" ry="2" />
      <path className={styles.slothMouth} d="M36 60q4 3 8 0" />
    </>
  );
}

// The Sloth Incident (character sheet sections 3 and 4): decorative, hung from the line card, and it takes no props,
// so it can read nothing from the board or the session and write nothing back.
export function Sloth() {
  const blink = !useReducedMotion();
  return (
    <div className={styles.sloth} data-sloth="">
      <svg className={`${styles.slothFigure} ${styles.desk}`} viewBox="0 0 80 100" aria-hidden="true">
        <rect className={styles.copper} x="17" y="2" width="12" height="44" rx="6" />
        <rect className={styles.copper} x="51" y="2" width="12" height="44" rx="6" />
        <ellipse className={styles.copper} cx="40" cy="64" rx="26" ry="30" />
        <Face blink={blink} />
      </svg>
      <svg className={`${styles.slothFigure} ${styles.phone}`} viewBox="20 36 40 32" aria-hidden="true">
        <ellipse className={styles.copper} cx="40" cy="52" rx="20" ry="16" />
        <Face blink={blink} />
      </svg>
    </div>
  );
}
