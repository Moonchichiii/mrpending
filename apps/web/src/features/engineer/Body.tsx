import styles from './Engineer.module.css';

// The body below the head, drawn on the desk only; it takes no props, so the fallback can draw it too.
export function Body() {
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
