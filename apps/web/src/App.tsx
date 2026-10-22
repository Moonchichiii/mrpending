import { VERSIONS } from '@pending/machine';

// The front door, the board and everything else arrive from issue #11 on.
export function App() {
  return (
    <main>
      <h1>Mr. Pending</h1>
      <p>The Department of Unnecessary Engineering. Status: pre-alpha.</p>
      <p>
        Contract {VERSIONS.contract}, rules {VERSIONS.rules}.
      </p>
    </main>
  );
}
