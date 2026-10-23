import type { Line } from '@pending/contract';
import { Component } from 'react';
import type { ReactNode } from 'react';
import { Figure } from './Figure';
import { mood } from './model/mood';
import type { Phase } from './model/mood';
import { Sloth } from './Sloth';
import { Still } from './Still';
import { useReducedMotion } from './useReducedMotion';
import styles from './Engineer.module.css';

// Both variants are drawn and the stylesheet shows one, so a phone needs no script to pick it.
function Rig({
  status,
  line,
  cameo,
  pressed,
}: {
  status: Phase;
  line: Line | undefined;
  cameo: boolean;
  pressed: boolean;
}) {
  const reduced = useReducedMotion();
  const current = mood(status, line);
  const looks = cameo && !reduced;
  // The board's button event starts the press, never a line; the stylesheet times excited and the cut to deadpan.
  const press = pressed && !reduced;
  return (
    <>
      <Figure variant="desk" mood={current} cameo={looks} press={press} />
      <Figure variant="phone" mood={current} cameo={looks} press={press} />
    </>
  );
}

// A drawing that throws is replaced by its fallback and the rest of the page carries on; character sheet
// section 4 puts a static slow-mood rig in the portrait's box.
class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// Mr. Pending's line card: the rig in the corner, the line beside it, and on the cameo line the sloth on its top edge.
// failed is the simulator's word that the line's attempt failed; a forged cameo line alone never brings the sloth.
export function Engineer({
  status,
  line,
  failed,
  pressed,
  children,
}: {
  status: Phase;
  line: Line | undefined;
  failed: boolean;
  pressed: boolean;
  children: ReactNode;
}) {
  const cameo = line?.beat === 'cameo' && failed;
  return (
    <div className={cameo ? `${styles.card} ${styles.withSloth}` : styles.card}>
      {cameo && (
        <Boundary fallback={null}>
          <Sloth />
        </Boundary>
      )}
      <div className={styles.portrait}>
        <Boundary fallback={<Still />}>
          <Rig status={status} line={line} cameo={cameo} pressed={pressed} />
        </Boundary>
      </div>
      <div className={styles.text}>{children}</div>
    </div>
  );
}
