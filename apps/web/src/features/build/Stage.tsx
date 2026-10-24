import type { Config, Model } from '@pending/contract';
import type { ReactNode } from 'react';
import { useId } from 'react';
import { BlueButton } from '../board';
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

// The one call to action beside Mr. Pending: the board's own button at hero size, which files the form named by
// `form` or runs `onPress`. It stays in place in every phase, disabled while a build is on the board; the slot under it
// holds its note or `children` (Withdraw) at a size reserved in every phase.
export function Hero({
  form,
  onPress,
  disabled,
  note,
  children,
}: {
  form?: string | undefined;
  onPress?: (() => void) | undefined;
  disabled: boolean;
  note?: string | undefined;
  children?: ReactNode;
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
        <span className={styles.label}>Ask him to press it</span>
      </button>
      <div className={styles.slot}>
        {note !== undefined && (
          <p id={`${id}-note`} className={styles.note}>
            {note}
          </p>
        )}
        {children}
      </div>
    </>
  );
}

// The one persistent stage: the name and the inference notice, Mr. Pending large with his bubble and the button beside
// him, the board under them. Every phase fills the same places, so the page never grows with a build; on a desktop
// screen the stage fills the viewport and the board takes the height left.
export function Stage({
  heading,
  notice,
  engineer,
  action,
  board,
}: {
  heading?: ReactNode;
  notice?: ReactNode;
  engineer: ReactNode;
  action: ReactNode;
  board: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <div className={styles.stage}>
        {(heading !== undefined || notice !== undefined) && (
          <div className={styles.top}>
            {heading}
            {notice}
          </div>
        )}
        <div className={styles.engineer}>{engineer}</div>
        <div className={styles.action}>{action}</div>
        <div className={styles.board}>{board}</div>
      </div>
    </div>
  );
}
