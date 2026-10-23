import { useId } from 'react';
import type { Mood } from './model/mood';
import styles from './Engineer.module.css';

export type Variant = 'desk' | 'phone';

// Character sheet section 4 on the full rig; section 8 crops a phone to the head, stalks and spectacles.
const VIEW_BOX: Record<Variant, string> = { desk: '0 0 360 320', phone: '125 -5 140 140' };

// The body below the head: drawn on the desk only.
function Body() {
  return (
    <>
      <g className={styles.shadow}>
        <ellipse cx="232" cy="300" rx="118" ry="10" />
      </g>
      <g className={styles.shell}>
        <circle className={styles.amber} cx="258" cy="186" r="86" />
        <path
          className={styles.spiral}
          d="M258 186a8 8 0 0 1 16 0a16 16 0 0 1-32 0a24 24 0 0 1 48 0a32 32 0 0 1-64 0a40 40 0 0 1 80 0a48 48 0 0 1-96 0"
        />
        <rect className={styles.ink} x="292" y="146" width="34" height="27" />
        <g className={styles.hatch}>
          <rect className={styles.amber} x="292" y="146" width="34" height="27" rx="3" />
          <circle className={styles.ink} cx="319" cy="160" r="2" />
        </g>
        <g className={styles.burst}>
          <circle className={styles.gear} cx="330" cy="108" r="11" />
          <circle className={styles.copper} cx="352" cy="140" r="6" />
          <rect
            className={styles.paper}
            x="304"
            y="88"
            width="18"
            height="22"
            transform="rotate(-15 313 99)"
          />
          <rect
            className={styles.paper}
            x="336"
            y="160"
            width="16"
            height="20"
            transform="rotate(20 344 170)"
          />
          <path
            className={styles.lines}
            d="M314 128l12-8M150 12l-10-6M226 10l10-6M140 26l-12-2M236 22l12-4"
          />
        </g>
      </g>
      <g className={styles.legs}>
        <rect className={styles.mint} x="170" y="240" width="16" height="46" />
        <rect className={styles.mint} x="204" y="240" width="16" height="46" />
      </g>
      <g className={styles.sneakers}>
        <ellipse className={styles.coral} cx="176" cy="290" rx="18" ry="10" />
        <ellipse className={styles.coral} cx="214" cy="290" rx="18" ry="10" />
        <rect className={styles.paper} x="156" y="295" width="38" height="7" rx="3" />
        <rect className={styles.paper} x="196" y="295" width="38" height="7" rx="3" />
      </g>
      <g className={styles.torso}>
        <rect className={styles.mint} x="152" y="112" width="86" height="136" rx="34" />
      </g>
      <g className={styles.shirt}>
        <rect className={styles.paper} x="162" y="132" width="66" height="84" rx="10" />
      </g>
      <g className={styles.tie}>
        <path className={styles.coral} d="M189 134h12l4 54-10 12-10-12z" />
      </g>
      <g className={styles.shorts}>
        <rect className={styles.teal} x="152" y="206" width="86" height="40" rx="8" />
      </g>
      <g className={styles.blueprint} transform="rotate(-6 132 182)">
        <rect className={styles.navy} x="96" y="156" width="74" height="54" />
        <path className={styles.grid} d="M114 156v54M132 156v54M150 156v54M96 174h74M96 192h74" />
        <circle className={styles.dot} cx="141" cy="183" r="4" />
      </g>
      <g className={styles.arms}>
        <path
          className={styles.armOutline}
          d="M160 142C140 160 124 178 112 192M228 146C236 182 200 204 168 202"
        />
        <path className={styles.arm} d="M160 142C140 160 124 178 112 192M228 146C236 182 200 204 168 202" />
        <circle className={styles.mint} cx="112" cy="194" r="8" />
        <circle className={styles.mint} cx="166" cy="202" r="8" />
      </g>
    </>
  );
}

// One inline SVG; the mood is a class on it and every move is a CSS transform, so nothing here can change state.
export function Figure({ mood, variant, cameo }: { mood: Mood; variant: Variant; cameo: boolean }) {
  const id = useId();
  const classes = [styles.rig, styles[mood], styles[variant], cameo && styles.cameo]
    .filter(Boolean)
    .join(' ');
  return (
    <svg className={classes} viewBox={VIEW_BOX[variant]} aria-hidden="true" data-variant={variant}>
      <defs>
        <clipPath id={`${id}l`}>
          <circle cx="168" cy="30" r="11" />
        </clipPath>
        <clipPath id={`${id}r`}>
          <circle cx="204" cy="30" r="11" />
        </clipPath>
      </defs>
      {variant === 'desk' && <Body />}
      <g className={styles.head}>
        <ellipse className={styles.mint} cx="195" cy="104" rx="42" ry="30" />
        <g className={styles.stalks}>
          <g className={styles.stalkL}>
            <line className={styles.stalkOutline} x1="186" y1="80" x2="186" y2="38.85" />
            <line className={styles.stalk} x1="186" y1="80" x2="186" y2="38.85" />
          </g>
          <g className={styles.stalkR}>
            <line className={styles.stalkOutline} x1="204" y1="80" x2="204" y2="43" />
            <line className={styles.stalk} x1="204" y1="80" x2="204" y2="43" />
          </g>
        </g>
        <g className={styles.eyes}>
          <g className={styles.eyeL}>
            <circle className={styles.paper} cx="168" cy="30" r="13" />
            <circle className={styles.pupil} cx="168" cy="30" r="5" />
          </g>
          <g className={styles.eyeR}>
            <circle className={styles.paper} cx="204" cy="30" r="13" />
            <circle className={styles.pupil} cx="204" cy="30" r="5" />
          </g>
        </g>
        <g className={styles.lids}>
          <g className={styles.eyeL}>
            <g clipPath={`url(#${id}l)`}>
              <g className={styles.lidL}>
                <rect className={styles.lid} x="155" y="-9" width="26" height="26" />
                <line className={styles.lidLine} x1="155" y1="17" x2="181" y2="17" />
              </g>
            </g>
          </g>
          <g className={styles.eyeR}>
            <g clipPath={`url(#${id}r)`}>
              <g className={styles.lidR}>
                <rect className={styles.lid} x="191" y="-9" width="26" height="26" />
                <line className={styles.lidLine} x1="191" y1="17" x2="217" y2="17" />
              </g>
            </g>
          </g>
        </g>
        <g className={styles.spectacles} transform="rotate(-8 186 30)">
          <circle className={styles.lens} cx="168" cy="30" r="17" />
          <circle className={styles.lens} cx="204" cy="30" r="17" />
          <path d="M185 30h2" />
        </g>
        <g className={styles.pencil} transform="rotate(32 218 62)">
          <rect className={styles.amber} x="213" y="42" width="10" height="36" />
          <path className={styles.paper} d="M213 42l5-10 5 10z" />
        </g>
        <g className={styles.mouth}>
          <path className={styles.mouthSlow} d="M186 112q9 7 18 0" />
          <ellipse className={styles.mouthOpen} cx="195" cy="114" rx="8" ry="7" />
          <path className={styles.mouthFlat} d="M185 114h20" />
        </g>
      </g>
    </svg>
  );
}
