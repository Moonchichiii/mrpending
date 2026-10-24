import type { Part } from '@pending/contract';
import type { CSSProperties, ReactNode } from 'react';
import type { Failure, PartView, Point } from './model/frame';
import { BOARD, BUTTON, centre } from './model/frame';
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

// A small ink chevron pointing east at (x, y), so direction never rests on shape alone.
const chevron = (x: number, y: number) => `M ${x - 4} ${y - 5} L ${x + 3} ${y} L ${x - 4} ${y + 5}`;

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
          {Array.from({ length: part.length - 1 }, (_, i) => (
            <path key={i} className={styles.arrow} data-direction d={chevron(CELL * i + CELL / 2, 17)} />
          ))}
        </>
      );
    }
    case 'ramp': {
      const end = CELL * (part.length - 1) + 26;
      return (
        <>
          <polygon className={styles.ramp} points={`-26,-14 ${end},${end + 12} ${end},${end + 22} -26,-4`} />
          {Array.from({ length: part.length }, (_, i) => (
            <path
              key={i}
              className={styles.arrow}
              data-direction
              d={chevron(CELL * i, CELL * i + 3)}
              transform={`rotate(45 ${CELL * i} ${CELL * i + 3})`}
            />
          ))}
        </>
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
            />
          ))}
        </>
      );
    // The pivot is the anchor; the load end lies opposite dir (a weight arrow down), the launch end toward dir (up).
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
          <path className={styles.end} data-end="load" d="M -64 -12 L -48 -12 L -56 -2 Z" />
          <path className={styles.end} data-end="launch" d="M 48 -26 L 64 -26 L 56 -36 Z" />
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

// A fan's wind is drawn in each cell it covers, one arrow per cell of power, pointing the way it blows.
function Wind({ view, className }: { view: PartView; className: string }) {
  const sign = view.part.dir === 'east' ? 1 : -1;
  return (
    <g className={className} data-wind={view.part.id}>
      {view.wind.map(({ x, y }) => (
        <path
          key={x}
          d={`M ${x - 18 * sign} ${y} L ${x + 14 * sign} ${y} M ${x + 6 * sign} ${y - 8} L ${x + 14 * sign} ${y} L ${x + 6 * sign} ${y + 8}`}
        />
      ))}
    </g>
  );
}

// A correction's styling (dashed, faded) marks the fan's wind as well as the fan.
export function PartSprite({ view, className }: { view: PartView; className?: string | undefined }) {
  const { part, at, fallen } = view;
  const marked = (base: string | undefined) => [base, className].filter(Boolean).join(' ');
  return (
    <>
      {view.wind.length > 0 && <Wind view={view} className={marked(styles.wind)} />}
      <g
        className={marked(styles.part)}
        data-part={part.id}
        data-kind={part.kind}
        data-dir={part.dir}
        data-active={view.active}
        transform={translate(at)}
      >
        <g transform={part.dir === 'west' ? 'scale(-1 1)' : undefined}>
          <Haloed>
            <Shape part={part} fallen={fallen} />
          </Haloed>
        </g>
      </g>
    </>
  );
}

// Only the active part keeps its label on a phone (ARCHITECTURE section 3); on wider boards every part is named.
export function PartLabel({ view }: { view: PartView }) {
  return (
    <text
      className={styles.partLabel}
      data-label={view.part.id}
      data-active={view.active}
      x={view.at.x}
      y={view.at.y - 32}
    >
      {view.part.kind}
    </text>
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

// The ball moves by a CSS transform, so the board's step duration animates it from cell to cell.
export function Ball({ at }: { at: Point }) {
  const style: CSSProperties = { transform: `translate(${at.x}px, ${at.y}px)` };
  return (
    <g className={`${styles.part} ${styles.moving}`} data-ball style={style}>
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
      {/* The base shadow, which collapses into the base when the button is pressed (character sheet section 6). */}
      <rect className={styles.baseShadow} x={-26} y={22} width={52} height={8} rx={4} />
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

// The same button off the board, for the front door; it sinks while the control around it is held down.
export function BlueButton() {
  return (
    <svg className={styles.blueButton} viewBox="-30 -10 60 42" aria-hidden="true" data-blue-button>
      <Button at={{ x: 0, y: 0 }} pressed={false} />
    </svg>
  );
}

const SPARKS = [-150, -110, -70, -30, 10] as const;

// The press at rest (character sheet section 6): cracks across the sunk dome, sparks, PRESSED beside the button and
// APPROVED on the board; the sheet's data-press decides whether its beats play in sequence.
export function Press() {
  const button = centre(BUTTON);
  return (
    <g data-press-layer>
      <g className={styles.cracks} transform={translate({ x: button.x, y: button.y + 6 })}>
        <path pathLength={1} d="M -11 12 L -6 5 L -9 0" />
        <path pathLength={1} d="M 1 13 L 3 4 L -1 -3" />
        <path pathLength={1} d="M 9 12 L 12 6 L 8 2" />
      </g>
      {/* The animated scale replaces an element's own transform, so the position sits on the group around it. */}
      <g transform={translate(button)}>
        <g className={styles.sparks}>
          {SPARKS.map((angle) => (
            <path key={angle} d="M 30 0 L 42 0" transform={`rotate(${angle})`} />
          ))}
        </g>
      </g>
      <g className={styles.pressedLabel} transform={translate({ x: button.x - 94, y: button.y - 40 })}>
        <rect className={styles.chip} x={-46} y={-16} width={92} height={32} rx={6} />
        <text className={styles.chipText} y={6}>
          PRESSED
        </text>
      </g>
      <g transform={`${translate({ x: BOARD.width / 2, y: BOARD.height / 2 })} rotate(-6)`}>
        <g className={styles.stamp} data-stamp>
          <rect className={styles.stampRuling} x={-150} y={-46} width={300} height={92} rx={16} />
          <rect className={styles.stampRuling} x={-140} y={-36} width={280} height={72} rx={10} />
          <text className={styles.stampText} y={16}>
            APPROVED
          </text>
        </g>
      </g>
    </g>
  );
}

// The terminal event rings its cell and names itself in a paper chip, placed on the side with room.
export function FailureRing({ failure }: { failure: Failure }) {
  const width = 116;
  const left = failure.at.x > BOARD.width / 2;
  const chipX = left ? -30 - width : 30;
  const chipY = failure.at.y < BOARD.y + CELL ? 4 : -40;
  return (
    <g
      className={styles.failure}
      data-failure={failure.event}
      data-cell={failure.cell}
      transform={translate(failure.at)}
    >
      <circle className={styles.ringHalo} r={27} />
      <circle className={styles.ring} r={27} />
      {/* On a phone the chip grows from the corner nearest the ring, so it never covers the ring. */}
      <g
        className={styles.chipBox}
        style={{ transformOrigin: `${left ? '100%' : '0%'} ${chipY > 0 ? '0%' : '100%'}` }}
      >
        <rect className={styles.chip} x={chipX} y={chipY} width={width} height={30} rx={6} />
        <text className={styles.chipText} x={chipX + width / 2} y={chipY + 21}>
          {failure.event}
        </text>
      </g>
    </g>
  );
}

// A diff badge: a paper disc with the op's sign, never colour alone.
export function Badge({ at, sign, dx }: { at: Point; sign: '+' | '−'; dx: number }) {
  return (
    <g className={styles.badge} data-badge={sign} transform={translate({ x: at.x + dx, y: at.y - 24 })}>
      <circle r={12} />
      <text y={6}>{sign}</text>
    </g>
  );
}
