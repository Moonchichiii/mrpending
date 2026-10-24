import type { Config, Model } from '@pending/contract';
import type { ReactNode } from 'react';
import { useId } from 'react';
import { BlueButton, Board } from '../board';
import styles from './Stage.module.css';

const HOST: Record<Model['host'], string> = { ollama: 'Ollama', openrouter: 'OpenRouter' };
const WHERE: Record<Config['inference'] | 'recorded', string> = {
  'this-machine': 'this machine',
  server: 'the Mr. Pending server',
  hosted: 'hosted',
  recorded: 'recorded',
};

// The board's header, from the config or the build header only: an Ollama tag such as gemma4:e2b reads "Gemma 4 E2B",
// any other id is shown as it is.
export function source(model: Model, where: Config['inference'] | 'recorded'): string {
  const name = model.id.replace(
    /^gemma(\d+):([a-z0-9]+)$/i,
    (_, major: string, size: string) => `Gemma ${major} ${size.toUpperCase()}`,
  );
  return `${name} · ${HOST[model.host]} · ${WHERE[where]}`;
}

const CAPTION = 'The ridiculous machinery appears here.';
const EMPTY = { title: 'The empty board', parts: [] };

// The board before any blueprint: the cobalt sheet with the hopper and the button, one caption across its middle.
export function IdleBoard({ caption = CAPTION }: { caption?: string | undefined }) {
  return (
    <figure className={styles.figure}>
      <Board blueprint={EMPTY} events={[]} />
      <figcaption className={styles.caption}>{caption}</figcaption>
    </figure>
  );
}

// The one call to action: the board's own button, which files the form named by `form` or runs `onPress`.
export function Hero({
  form,
  onPress,
  disabled,
  note,
}: {
  form?: string | undefined;
  onPress?: (() => void) | undefined;
  disabled: boolean;
  note?: string | undefined;
}) {
  const id = useId();
  return (
    <>
      <button
        type={onPress === undefined ? 'submit' : 'button'}
        form={form}
        className={styles.hero}
        disabled={disabled}
        onClick={onPress}
        aria-describedby={note === undefined ? undefined : `${id}-note`}
      >
        <BlueButton />
        <span className={styles.label}>Ask Mr. Pending to press it</span>
      </button>
      {note !== undefined && (
        <p id={`${id}-note`} className={styles.note}>
          {note}
        </p>
      )}
    </>
  );
}

// One screen: Mr. Pending and his voice on the left, the action on the right, the board underneath at full width
// with its header and the level line, and whatever follows folded away below.
export function Stage({
  heading,
  card,
  voice,
  action,
  header,
  board,
  children,
}: {
  heading?: ReactNode;
  card: ReactNode;
  voice: ReactNode;
  action: ReactNode;
  header: string | undefined;
  board: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <div className={styles.stage}>
        {heading !== undefined && <div className={styles.heading}>{heading}</div>}
        <div className={styles.card}>{card}</div>
        <div className={styles.voice}>{voice}</div>
        <div className={styles.action}>{action}</div>
        <section className={styles.board} aria-label="The board">
          {header !== undefined && <p className={styles.header}>{header}</p>}
          {board}
          <p className={styles.level}>Gemma designs → Simulator tests → Gemma repairs</p>
        </section>
        {children !== undefined && <div className={styles.after}>{children}</div>}
      </div>
    </div>
  );
}
