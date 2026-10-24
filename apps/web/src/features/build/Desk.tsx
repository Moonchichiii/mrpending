import styles from './Stage.module.css';

const TABS = [
  { label: 'IDEAS', y: 46, x: 58, tilt: -2 },
  { label: 'FAILED', y: 98, x: 74, tilt: 1.5 },
  { label: 'REPAIRS', y: 134, x: 66, tilt: -1 },
  { label: 'APPROVED', y: 172, x: 44, tilt: 2 },
] as const;

// The Department's paperwork beside Mr. Pending: a pile of labelled files and a mug. Decoration only; it reads nothing
// from the build, and it is hidden from assistive technology.
export function Desk() {
  return (
    <svg className={styles.paperwork} viewBox="0 0 250 236" aria-hidden="true">
      <g className={styles.loose}>
        <rect x="4" y="198" width="70" height="26" transform="rotate(-8 39 211)" />
        <rect x="150" y="206" width="76" height="22" transform="rotate(6 188 217)" />
        <rect x="60" y="210" width="90" height="20" transform="rotate(-3 105 220)" />
      </g>
      <g className={styles.pile}>
        {Array.from({ length: 13 }, (_, i) => (
          <rect
            key={i}
            x={30 + ((i * 7) % 11)}
            y={20 + i * 14}
            width={130}
            height={16}
            transform={`rotate(${((i * 5) % 7) - 3} ${95 + ((i * 7) % 11)} ${28 + i * 14})`}
          />
        ))}
      </g>
      {TABS.map(({ label, x, y, tilt }) => (
        <g key={label} transform={`rotate(${tilt} ${x + 45} ${y + 12})`}>
          <rect className={styles.tab} x={x} y={y} width={label.length * 11 + 18} height={24} rx={3} />
          <text className={styles.tabText} x={x + 9} y={y + 17}>
            {label}
          </text>
        </g>
      ))}
      <g className={styles.mug}>
        <path className={styles.handle} d="M232 168c14 0 14 34 0 34" />
        <path className={styles.cup} d="M168 152h66v66a10 10 0 0 1-10 10h-46a10 10 0 0 1-10-10z" />
        <ellipse className={styles.coffee} cx="201" cy="153" rx="33" ry="5" />
        <text className={styles.mugText} x="201" y="176">
          SNAIL
        </text>
        <text className={styles.mugText} x="201" y="194">
          SPEED
        </text>
        <text className={styles.mugSmall} x="201" y="210">
          PROGRESS
        </text>
      </g>
      <g className={styles.pencil} transform="rotate(-24 130 226)">
        <rect x="100" y="222" width="56" height="8" />
        <path d="M156 222l10 4-10 4z" />
      </g>
    </svg>
  );
}
