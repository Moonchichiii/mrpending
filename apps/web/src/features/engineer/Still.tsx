import { VIEW_BOX } from './Figure';
import type { Variant } from './Figure';
import styles from './Engineer.module.css';

// The body as the slow mood leaves it: hatch shut, no burst. Drawn here rather than through Body, because a boundary
// does not catch its own fallback, so the fallback shares no renderer with the rig it replaces.
function StillBody() {
  return (
    <>
      <ellipse className={styles.shadow} cx="232" cy="300" rx="118" ry="10" />
      <g className={styles.shell}>
        <circle className={styles.amber} cx="258" cy="186" r="86" />
        <path
          className={styles.spiral}
          d="M258 186a8 8 0 0 1 16 0a16 16 0 0 1-32 0a24 24 0 0 1 48 0a32 32 0 0 1-64 0a40 40 0 0 1 80 0a48 48 0 0 1-96 0"
        />
        <rect className={styles.amber} x="292" y="146" width="34" height="27" rx="3" />
        <circle className={styles.ink} cx="319" cy="160" r="2" />
      </g>
      <rect className={styles.mint} x="170" y="240" width="16" height="46" />
      <rect className={styles.mint} x="204" y="240" width="16" height="46" />
      <ellipse className={styles.coral} cx="176" cy="290" rx="18" ry="10" />
      <ellipse className={styles.coral} cx="214" cy="290" rx="18" ry="10" />
      <rect className={styles.paper} x="156" y="295" width="38" height="7" rx="3" />
      <rect className={styles.paper} x="196" y="295" width="38" height="7" rx="3" />
      <rect className={styles.mint} x="152" y="112" width="86" height="136" rx="34" />
      <rect className={styles.paper} x="162" y="132" width="66" height="84" rx="10" />
      <path className={styles.coral} d="M189 134h12l4 54-10 12-10-12z" />
      <rect className={styles.teal} x="152" y="206" width="86" height="40" rx="8" />
      <g transform="rotate(-6 132 182)">
        <rect className={styles.navy} x="96" y="156" width="74" height="54" />
        <path className={styles.grid} d="M114 156v54M132 156v54M150 156v54M96 174h74M96 192h74" />
        <circle className={styles.dot} cx="141" cy="183" r="4" />
      </g>
      <path
        className={styles.armOutline}
        d="M160 142C140 160 124 178 112 192M228 146C236 182 200 204 168 202"
      />
      <path className={styles.arm} d="M160 142C140 160 124 178 112 192M228 146C236 182 200 204 168 202" />
      <circle className={styles.mint} cx="112" cy="194" r="8" />
      <circle className={styles.mint} cx="166" cy="202" r="8" />
    </>
  );
}

// Character sheet section 4: the static slow-mood rig the boundary shows when the rig throws. It renders neither
// Figure nor Body, so a fault in the drawing cannot reach it; the lids are drawn at half-mast, not moved there.
function Drawing({ variant }: { variant: Variant }) {
  return (
    <svg
      className={`${styles.rig} ${styles.slow} ${styles[variant]}`}
      viewBox={VIEW_BOX[variant]}
      aria-hidden="true"
      data-fallback={variant}
    >
      {variant === 'desk' && <StillBody />}
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
