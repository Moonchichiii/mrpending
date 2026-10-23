import type { Line } from '@pending/contract';
import { Component } from 'react';
import type { ReactNode } from 'react';
import { Figure } from './Figure';
import { mood } from './model/mood';
import type { Phase } from './model/mood';
import { Sloth } from './Sloth';
import { useReducedMotion } from './useReducedMotion';
import styles from './Engineer.module.css';

// Both variants are drawn and the stylesheet shows one, so a phone needs no script to pick it.
function Rig({ status, line }: { status: Phase; line: Line | undefined }) {
  const reduced = useReducedMotion();
  const current = mood(status, line);
  const cameo = line?.beat === 'cameo' && !reduced;
  return (
    <>
      <Figure variant="desk" mood={current} cameo={cameo} />
      <Figure variant="phone" mood={current} cameo={cameo} />
    </>
  );
}

// A drawing that throws is replaced by its fallback and the rest of the page carries on.
class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// Character sheet section 4: if the rig throws, a static slow-mood rig takes its box.
const still = (
  <div data-fallback="">
    <Figure variant="desk" mood="slow" cameo={false} />
    <Figure variant="phone" mood="slow" cameo={false} />
  </div>
);

// Mr. Pending's line card: the rig in the corner, the line beside it, and on the cameo line the sloth on its top edge.
export function Engineer({
  status,
  line,
  children,
}: {
  status: Phase;
  line: Line | undefined;
  children: ReactNode;
}) {
  const cameo = line?.beat === 'cameo';
  return (
    <div className={cameo ? `${styles.card} ${styles.withSloth}` : styles.card}>
      {cameo && (
        <Boundary fallback={null}>
          <Sloth />
        </Boundary>
      )}
      <div className={styles.portrait}>
        <Boundary fallback={still}>
          <Rig status={status} line={line} />
        </Boundary>
      </div>
      <div className={styles.text}>{children}</div>
    </div>
  );
}
