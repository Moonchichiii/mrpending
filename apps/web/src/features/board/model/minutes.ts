import type { SimEvent } from '@pending/contract';
import { assertNever } from '../../../shared/assertNever';

const MOVED_BY = {
  gravity: 'falls',
  conveyor: 'rides the conveyor',
  ramp: 'rolls down the ramp',
  fan: 'is blown',
};

// The text equivalent of one event: every fact it carries, nothing it does not.
export function minute(event: SimEvent): string {
  const at = `Step ${event.step}:`;
  switch (event.type) {
    case 'ball.released':
      return `${at} the ball is released into ${event.cell}.`;
    case 'ball.moved':
      return `${at} the ball ${MOVED_BY[event.by]} from ${event.from} to ${event.to}.`;
    case 'ball.launched':
      return `${at} the ${event.by} ${event.part} launches the ball from ${event.from} to ${event.to}.`;
    case 'domino.fell':
      return `${at} domino ${event.index + 1} of ${event.part} falls at ${event.cell}.`;
    case 'impulse.lost':
      return `${at} the impulse is lost at ${event.cell}.`;
    case 'ball.lost':
      return `${at} the ball leaves the board over the ${event.edge} edge at ${event.cell}.`;
    case 'ball.stopped':
      return `${at} the ball comes to rest at ${event.cell}.`;
    case 'button.pressed':
      return `${at} the button is pressed by the ${event.by}.`;
    default:
      return assertNever(event);
  }
}
