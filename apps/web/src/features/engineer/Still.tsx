import { Body } from './Body';
import { VIEW_BOX } from './Figure';
import type { Variant } from './Figure';
import styles from './Engineer.module.css';

// Character sheet section 4: the static slow-mood rig the boundary shows when the rig throws. It never renders
// Figure, so a fault in the drawing cannot reach it; the lids are drawn at half-mast, not moved there.
function Drawing({ variant }: { variant: Variant }) {
  return (
    <svg
      className={`${styles.rig} ${styles.slow} ${styles[variant]}`}
      viewBox={VIEW_BOX[variant]}
      aria-hidden="true"
      data-fallback={variant}
    >
      {variant === 'desk' && <Body />}
      <ellipse className={styles.mint} cx="195" cy="104" rx="42" ry="30" />
      <g transform="rotate(-25.94 186 80)">
        <line className={styles.stalkOutline} x1="186" y1="80" x2="186" y2="38.85" />
        <line className={styles.stalk} x1="186" y1="80" x2="186" y2="38.85" />
      </g>
      <line className={styles.stalkOutline} x1="204" y1="80" x2="204" y2="43" />
      <line className={styles.stalk} x1="204" y1="80" x2="204" y2="43" />
      <circle className={styles.paper} cx="168" cy="30" r="13" />
      <circle className={styles.pupil} cx="168" cy="30" r="5" />
      <circle className={styles.paper} cx="204" cy="30" r="13" />
      <circle className={styles.pupil} cx="204" cy="30" r="5" />
      <path className={styles.lid} d="M158.2 35A11 11 0 1 1 177.8 35Z" />
      <path className={styles.lidLine} d="M158.2 35H177.8" />
      <path className={styles.lid} d="M193.05 31A11 11 0 1 1 214.95 31Z" />
      <path className={styles.lidLine} d="M193.05 31H214.95" />
      <g transform="rotate(-8 186 30)">
        <circle className={styles.lens} cx="168" cy="30" r="17" />
        <circle className={styles.lens} cx="204" cy="30" r="17" />
        <path d="M185 30h2" />
      </g>
      <g transform="rotate(32 218 62)">
        <rect className={styles.amber} x="213" y="42" width="10" height="36" />
        <path className={styles.paper} d="M213 42l5-10 5 10z" />
      </g>
      <path d="M186 112q9 7 18 0" />
    </svg>
  );
}

// Like the live rig, both variants are drawn and the stylesheet shows one: the full rig on a desk, the head on a phone.
export function Still() {
  return (
    <>
      <Drawing variant="desk" />
      <Drawing variant="phone" />
    </>
  );
}
