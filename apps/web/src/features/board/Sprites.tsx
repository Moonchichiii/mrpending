import type { Part } from '@pending/contract';
import type { ReactNode } from 'react';
import type { PartView, Point } from './model/frame';
import { BOARD } from './model/frame';
import styles from './Board.module.css';

const CELL = BOARD.cell;
const translate = ({ x, y }: Point) => `translate(${x} ${y})`;

// The same shapes twice: a paper copy 2 px wider on each side under the ink outline, so every graphic clears 3:1 on navy.
function Haloed({ children }: { children: ReactNode }) {
  return (
    <>
      <g className={styles.halo} aria-hidden="true">
        {children}
      </g>
      <g>{children}</g>
    </>
  );
}

// Sprites are drawn facing east around the anchor cell's centre; west mirrors them.
function Shape({ part, fallen }: { part: Part; fallen: number[] }) {
  switch (part.kind) {
    case 'conveyor': {
      const end = CELL * (part.length - 1);
      return (
        <>
          <rect className={styles.belt} x={-26} y={10} width={end + 52} height={14} rx={7} />
          {Array.from({ length: part.length }, (_, i) => (
            <circle key={i} className={styles.roller} cx={CELL * i} cy={17} r={4} />
          ))}
        </>
      );
    }
    case 'ramp': {
      const end = CELL * (part.length - 1) + 26;
      return (
        <polygon className={styles.ramp} points={`-26,-14 ${end},${end + 12} ${end},${end + 22} -26,-4`} />
      );
    }
    case 'dominoes':
      return (
        <>
          {Array.from({ length: part.length }, (_, i) => (
            <rect
              key={i}
              className={styles.domino}
              data-fallen={fallen.includes(i)}
              x={CELL * i - 5}
              y={-24}
              width={10}
              height={48}
              transform={fallen.includes(i) ? `rotate(90 ${CELL * i + 5} 24)` : undefined}
            />
          ))}
        </>
      );
    case 'seesaw':
      return (
        <>
          <polygon className={styles.pivot} points="0,8 -12,26 12,26" />
          <rect
            className={styles.plank}
            x={-80}
            y={-2}
            width={160}
            height={10}
            rx={3}
            transform="rotate(-10)"
          />
        </>
      );
    case 'catapult':
      return (
        <>
          <polygon className={styles.arm} points="-3,16 15,-20 21,-17 3,18" />
          <circle className={styles.arm} cx={18} cy={-20} r={7} />
          <rect className={styles.frame} x={-20} y={12} width={40} height={14} rx={3} />
        </>
      );
    case 'fan':
      return (
        <>
          <rect className={styles.frame} x={-5} y={10} width={10} height={16} />
          <circle className={styles.fan} r={18} />
          <ellipse className={styles.blade} rx={4} ry={14} />
          <ellipse className={styles.blade} rx={14} ry={4} />
        </>
      );
  }
}

export function PartSprite({ view }: { view: PartView }) {
  const { part, at, fallen } = view;
  const wind = part.kind === 'fan' ? CELL * part.power : 0;
  return (
    <g className={styles.part} data-part={part.id} data-kind={part.kind} transform={translate(at)}>
      <g transform={part.dir === 'west' ? 'scale(-1 1)' : undefined}>
        {wind > 0 && (
          <g className={styles.wind}>
            {[-10, 0, 10].map((y) => (
              <line key={y} x1={30} y1={y} x2={CELL / 2 + wind} y2={y} />
            ))}
          </g>
        )}
        <Haloed>
          <Shape part={part} fallen={fallen} />
        </Haloed>
      </g>
    </g>
  );
}

export function Hopper({ at }: { at: Point }) {
  return (
    <g className={styles.part} data-hopper transform={translate(at)}>
      <Haloed>
        <polygon className={styles.hopper} points="-22,-22 22,-22 8,14 -8,14" />
      </Haloed>
    </g>
  );
}

export function Ball({ at }: { at: Point }) {
  return (
    <g className={styles.part} data-ball transform={translate(at)}>
      <Haloed>
        <circle className={styles.ball} r={9} />
      </Haloed>
    </g>
  );
}

// The button sinks 6 px and darkens only on button.pressed (character sheet section 6).
export function Button({ at, pressed }: { at: Point; pressed: boolean }) {
  return (
    <g className={styles.part} data-button data-pressed={pressed} transform={translate(at)}>
      <Haloed>
        <path
          className={pressed ? styles.domePressed : styles.dome}
          d="M -18 14 A 18 18 0 0 1 18 14 Z"
          transform={pressed ? 'translate(0 6)' : undefined}
        />
        <rect className={styles.base} x={-24} y={14} width={48} height={10} rx={2} />
      </Haloed>
    </g>
  );
}
