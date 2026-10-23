import { useId } from 'react';
import { Body } from './Body';
import type { Mood } from './model/mood';
import styles from './Engineer.module.css';

export type Variant = 'desk' | 'phone';

// Character sheet section 4 on the full rig; section 8 crops a phone to the head, stalks and spectacles.
export const VIEW_BOX: Record<Variant, string> = { desk: '0 0 360 320', phone: '125 -5 140 140' };

// One inline SVG; the mood is a class on it and every move is a CSS transform, so nothing here can change state.
export function Figure({
  mood,
  variant,
  cameo,
  press,
}: {
  mood: Mood;
  variant: Variant;
  cameo: boolean;
  press: boolean;
}) {
  const id = useId();
  const classes = [styles.rig, styles[mood], styles[variant], cameo && styles.cameo, press && styles.press]
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
