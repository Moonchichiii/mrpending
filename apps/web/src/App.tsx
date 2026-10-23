import { Suspense, lazy } from 'react';
import { StaticFrontDoor } from './StaticFrontDoor';

// The mode is a build-time constant, so the static bundle drops this branch and the whole local chunk with it.
const LocalFrontDoor =
  import.meta.env.VITE_SITE_MODE === 'local'
    ? lazy(() => import('./LocalFrontDoor').then((m) => ({ default: m.LocalFrontDoor })))
    : undefined;

export function App() {
  if (LocalFrontDoor === undefined) return <StaticFrontDoor />;
  return (
    <Suspense fallback={null}>
      <LocalFrontDoor />
    </Suspense>
  );
}
