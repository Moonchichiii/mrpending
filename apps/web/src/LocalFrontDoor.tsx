import { BuildDesk, InferenceBadge, badgeText, useInference } from './features/build';
import { Footer } from './Footer';
import styles from './FrontDoor.module.css';

// The local installation on one screen: Mr. Pending, the button and the board, with the form and the Minutes folded
// away below. No prompt leaves the browser before the badge says where it goes.
export function LocalFrontDoor() {
  const { inference, retry } = useInference();
  const confirmed = inference.status === 'confirmed' ? inference : undefined;
  return (
    <>
      <main className={styles.page}>
        <BuildDesk
          canFile={confirmed !== undefined}
          connecting={inference.status === 'asking'}
          config={confirmed}
          notice={<InferenceBadge inference={inference} onRetry={retry} />}
          heading="Mr. Pending"
        />
      </main>
      <Footer model={badgeText(confirmed?.model, confirmed?.inference)} />
    </>
  );
}
