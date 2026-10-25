import styles from './FrontDoor.module.css';

const REPO = 'https://github.com/Moonchichiii/mrpending';
// The build info: which commit the host built, so a preview can be matched to its source.
const COMMIT = import.meta.env.VITE_COMMIT;
export const MOTTO = 'Even small things can do great things.';

// One slim line under either front door: the motto, then the board's model badge in words, the commit and the source.
export function Footer({ model }: { model: string }) {
  return (
    <footer className={styles.footer}>
      <p>{MOTTO}</p>
      <p className={styles.build}>
        <span>{model}</span>
        {COMMIT !== '' && <a href={`${REPO}/commit/${COMMIT}`}>{COMMIT.slice(0, 12)}</a>}
        <a href={REPO}>Source</a>
      </p>
    </footer>
  );
}
