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
function Rig({ status, line, cameo }: { status: Phase; line: Line | undefined; cameo: boolean }) {
  const reduced = useReducedMotion();
  const current = mood(status, line);
  const looks = cameo && !reduced;
  // The press clock shows a pressed deadpan line only at its 1.60 s beat, which is one hard cut, never a transition.
  const cut = line?.beat === 'pressed' && current === 'deadpan';
  return (
    <>
      <Figure variant="desk" mood={current} cameo={looks} cut={cut} />
      <Figure variant="phone" mood={current} cameo={looks} cut={cut} />
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
// hero draws the full rig large under the line on every width, for the front door before anything is filed.
export function Engineer({
  status,
  line,
  failed,
  hero = false,
  children,
}: {
  status: Phase;
  line: Line | undefined;
  failed: boolean;
  hero?: boolean;
  children: ReactNode;
}) {
  const cameo = line?.beat === 'cameo' && failed;
  const classes = [styles.card, cameo && styles.withSloth, hero && styles.hero].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      {cameo && (
        <Boundary fallback={null}>
          <Sloth />
        </Boundary>
      )}
      <div className={styles.portrait}>
        <Boundary fallback={<Still />}>
          <Rig status={status} line={line} cameo={cameo} />
        </Boundary>
      </div>
      <div className={styles.text}>{children}</div>
    </div>
  );
}
