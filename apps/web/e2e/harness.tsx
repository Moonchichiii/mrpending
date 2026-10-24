import { Build } from '@pending/contract';
import { createRoot } from 'react-dom/client';
import { StaticFrontDoor } from '../src/StaticFrontDoor';
import '../src/styles/tokens.css';
import '../src/styles/global.css';

// Dev-server only (never in the production build): the front door with gallery records at every schema maximum,
// each drawn from a recorded build so its card has a final attempt to show.
const files = import.meta.glob<unknown>('../public/gallery/scenic.json', { eager: true, import: 'default' });
const recorded = Build.parse(files['../public/gallery/scenic.json']);
const longest = (n: number) =>
  Build.parse({
    ...recorded,
    id: `longest-${n}`,
    form: { nature: 'W'.repeat(180), minParts: 2, maxParts: 14 },
    model: { mode: 'local', id: 'W'.repeat(64), host: 'ollama' },
    title: 'W'.repeat(40),
    report: { attempts: 6, parts: 14, pressed: n % 2 === 0, failedAt: 'K7', verdict: 'W'.repeat(120) },
  });

const root = document.getElementById('root');
if (root === null) throw new Error('harness.html has no #root');
createRoot(root).render(<StaticFrontDoor records={[1, 2, 3, 4].map(longest)} />);
