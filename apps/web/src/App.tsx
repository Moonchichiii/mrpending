import type { BuildHeader } from '@pending/contract';
import { Suspense, lazy } from 'react';
import { StaticFrontDoor } from './StaticFrontDoor';

// The mode is a build-time constant, so the static bundle drops this branch and the whole local chunk with it.
const LocalFrontDoor =
  import.meta.env.VITE_SITE_MODE === 'local'
    ? lazy(() => import('./LocalFrontDoor').then((m) => ({ default: m.LocalFrontDoor })))
    : undefined;

// Gallery records arrive with the gallery feature (issue #18); until then the shelf says it is being filed.
const RECORDS: BuildHeader[] = [];

export function App() {
  if (LocalFrontDoor === undefined) return <StaticFrontDoor records={RECORDS} />;
  return (
    <Suspense fallback={null}>
      <LocalFrontDoor records={RECORDS} />
    </Suspense>
  );
}
