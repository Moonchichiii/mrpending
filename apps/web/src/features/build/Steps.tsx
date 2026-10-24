import styles from './BuildDesk.module.css';

const STEPS = [
  { title: 'Describe what the button needs.', text: 'One sentence in item 1 of the form is enough.' },
  { title: 'File Form 27B/6.', text: 'Set the parts and the equipment, then file it.' },
  {
    title: 'Watch him design, fail and repair.',
    text: 'The simulator runs his machine; he corrects what broke.',
  },
] as const;

// What a visitor does, in order, before the form; the Department's guidance, never a line of Mr. Pending's.
export function Steps() {
  return (
    <ol className={styles.steps} aria-label="How to file">
      {STEPS.map(({ title, text }) => (
        <li key={title} className={styles.step}>
          <strong className={styles.stepTitle}>{title}</strong> {text}
        </li>
      ))}
    </ol>
  );
}
