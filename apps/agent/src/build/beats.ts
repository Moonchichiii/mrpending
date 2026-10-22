import { Line, MAX_STEPS } from '@pending/contract';
import type { Attempt, Beat, Blueprint, Cell, Part } from '@pending/contract';
import { handovers, report } from '@pending/machine';

// The narration table (character sheet section 3). Slots come from Attempt, Patch and Report, never from model text.
export type Draft = Omit<Line, 'id'>;
type Mood = Line['mood'];

const HANDOFFS = [
  'A successful descent! Alert the committee!',
  'A handover! The parts are cooperating!',
  'Contact! Enter it in the minutes at once!',
] as const;

// Keyed by the terminal event and the event before it; a key with no row means no aside.
export const ASIDES = {
  catapultLost: 'The catapult has demonstrated considerable enthusiasm. Unfortunately, very little accuracy.',
  seesawLost: 'The seesaw has launched the ball with great conviction and no destination.',
  otherLost: 'A minor setback. The ball has chosen an alternative career.',
  floorStop: 'The Department regrets to inform you that gravity has once again failed to cooperate.',
  fanStop: 'The fan appears committed to the process. The ball remains unconvinced.',
  seesawStop: 'The seesaw has received the ball and declined to act.',
  impulseLost: 'The dominoes fell with great ceremony and no consequence.',
  stepCap: 'The ball is still in transit. The Department has stopped counting.',
  invalid: 'Engineering has identified a problem. Engineering would prefer not to discuss it.',
} as const;
export type AsideKey = keyof typeof ASIDES;

// Shown as the INPUT_INVALID message instead of a line, since no stream starts.
export const REJECTED =
  'Form 27B/6 rejected: items 4 and 5 name the same equipment. The Department does not do paradoxes before lunch.';

const line = (beat: Beat, mood: Mood, text: string, attempt: number, step = 0): Draft => ({
  beat,
  mood,
  text,
  source: 'table',
  at: { attempt, step },
});

// A memo is validated text, never a fact: its own line, under the beat that asked for it.
const memoLine = (beat: Beat, memo: string, attempt: number): Draft => ({
  beat,
  mood: 'slow',
  text: memo,
  source: 'model',
  at: { attempt, step: 0 },
});

// ElevenLabs gets server-authored lines whose slots are facts; the designed line quotes the model's title.
export const cloudEligible = (l: Line): boolean => l.source === 'table' && l.beat !== 'designed';

// The only parts a ball can come to rest on: a fan's cell and a seesaw's plank (MACHINE-RULES section 2).
function restsOn(part: Part, cell: Cell): boolean {
  if (part.kind === 'fan') return part.cell === cell;
  if (part.kind !== 'seesaw' || part.cell.slice(1) !== cell.slice(1)) return false;
  return Math.abs(part.cell.charCodeAt(0) - cell.charCodeAt(0)) <= 1;
}

export function asideKey(attempt: Attempt): AsideKey | undefined {
  if (attempt.outcome === 'invalid') return 'invalid';
  const end = attempt.events.at(-1);
  const before = attempt.events.at(-2);
  switch (end?.type) {
    case 'ball.lost':
      if (before?.type === 'ball.launched') return before.by === 'catapult' ? 'catapultLost' : 'seesawLost';
      // A loss after a fan push is ambiguous between the fan and the edge, so it gets the finding only.
      return before?.type === 'ball.moved' && before.by !== 'fan' ? 'otherLost' : undefined;
    case 'ball.stopped': {
      // The cap writes ball.stopped at step 200; a natural stop on exactly that step reads the same in the log.
      if (end.step === MAX_STEPS) return 'stepCap';
      const holder = attempt.blueprint.parts.find((p) => restsOn(p, end.cell));
      if (holder?.kind === 'fan') return 'fanStop';
      if (holder?.kind === 'seesaw') return 'seesawStop';
      return before?.type === 'ball.moved' && before.by === 'gravity' ? 'floorStop' : undefined;
    }
    case 'impulse.lost':
      return 'impulseLost';
    case 'button.pressed':
    case 'ball.released':
    case 'ball.moved':
    case 'ball.launched':
    case 'domino.fell':
    case undefined:
      return undefined;
  }
}

// The same aside is not repeated within one build; a second occurrence gets the plain finding.
export function aside(attempt: Attempt, earlier: readonly Attempt[]): string | undefined {
  const key = asideKey(attempt);
  if (key === undefined || earlier.some((a) => asideKey(a) === key)) return undefined;
  return ASIDES[key];
}

function finding(attempt: Attempt): string {
  const cell = attempt.failedAt ?? 'an unrecorded cell';
  switch (attempt.outcome) {
    case 'lost':
      return `Finding: the ball left the premises at ${cell}.`;
    case 'stalled':
      return `Finding: the ball came to rest at ${cell}.`;
    case 'invalid':
      return `Finding: the blueprint breaches ${attempt.violations[0] ?? 'the rules'}.`;
    case 'pressed':
      throw new Error('a pressed attempt has no finding');
  }
}

// "Correction 1: removed catapult at K6, added seesaw at K6 and fan at L5": read from the boards, so an op applyPatch
// skipped is never announced. Parts pair by position, not id: applyPatch keeps the order on move and remove, removes
// every part of an id, and appends adds under unused ids. Repeated ids can make one move many changes, so the text is
// split at the Line bound.
export function corrections(n: number, previous: Blueprint, next: Blueprint): string[] {
  const after = new Set(next.parts.map((p) => p.id));
  const kept = previous.parts.filter((p) => after.has(p.id));
  const removed = previous.parts.filter((p) => !after.has(p.id)).map((p) => `${p.kind} at ${p.cell}`);
  const added = next.parts.slice(kept.length).map((p) => `${p.kind} at ${p.cell}`);
  const moved = kept.flatMap((was, i) => {
    const p = next.parts[i];
    return p === undefined || was.cell === p.cell ? [] : [`${p.kind} from ${was.cell} to ${p.cell}`];
  });
  const groups: [string, string[]][] = [
    ['removed', removed],
    ['added', added],
    ['moved', moved],
  ];
  const head = `Correction ${n}: `;
  const max = Line.shape.text.maxLength ?? 0;
  const texts: string[] = [];
  let said = '';
  for (const [verb, whats] of groups) {
    whats.forEach((what, i) => {
      const joined = said === '' ? `${verb} ${what}` : `${said}${i === 0 ? `, ${verb}` : ' and'} ${what}`;
      if (`${head}${joined}.`.length <= max) {
        said = joined;
        return;
      }
      texts.push(`${head}${said}.`);
      said = `${verb} ${what}`;
    });
  }
  return said === '' ? texts : [...texts, `${head}${said}.`];
}

export const opening = (): Draft[] => [
  line(
    'intake',
    'slow',
    'Form 27B/6 received. Stamped, filed, placed on top of the other forms. This will take some time.',
    1,
  ),
  line('designing', 'slow', 'Drafting. Please do not rush the Department.', 1),
];

export const designed = (memo: string, attempt: Attempt): Draft[] => [
  memoLine('designed', memo, attempt.n),
  line(
    'designed',
    'slow',
    `Blueprint ${attempt.n}: “${attempt.blueprint.title}”. ${attempt.blueprint.parts.length} components for one button. Proportionate.`,
    attempt.n,
  ),
];

// `next` holds what applyPatch returned; a patch that changed nothing gets no correction line.
export function repaired(memo: string, previous: Attempt, next: Attempt): Draft[] {
  return [
    memoLine('repaired', memo, next.n),
    ...corrections(next.n - 1, previous.blueprint, next.blueprint).map((text) =>
      line('repaired', 'slow', text, next.n),
    ),
    line('repaired', 'slow', 'A repair has been submitted. Optimism remains strictly provisional.', next.n),
  ];
}

// The lines of one trial, from its start to its outcome; `repairFollows` says whether a correction is coming.
export function trial(attempt: Attempt, earlier: readonly Attempt[], repairFollows: boolean): Draft[] {
  const { n } = attempt;
  const end = attempt.events.at(-1)?.step ?? 0;
  const out: Draft[] = [];
  if (attempt.outcome !== 'invalid') out.push(line('running', 'slow', `Commencing trial ${n}.`, n));
  const first = handovers(attempt.blueprint, attempt.events)[0];
  if (first !== undefined) {
    const text = HANDOFFS[first.step % HANDOFFS.length] ?? HANDOFFS[0];
    out.push(line('handoff', 'excited', text, n, first.step));
  }

  if (attempt.outcome === 'pressed') {
    const { verdict } = report([...earlier, attempt]);
    return [
      ...out,
      line('pressed', 'excited', 'WE DID IT! Please inform the entire Department.', n, end),
      line('pressed', 'deadpan', 'The Department acknowledges this development.', n, end),
      line('pressed', 'deadpan', verdict, n, end),
    ];
  }

  out.push(line('failed', 'deadpan', finding(attempt), n, end));
  const said = aside(attempt, earlier);
  if (said !== undefined) out.push(line('failed', 'deadpan', said, n, end));
  if (!repairFollows) {
    const text = `After ${n} trials the button remains unpressed. The paperwork is immaculate. Your request is pending. Naturally.`;
    return [...out, line('exhausted', 'deadpan', text, n, end)];
  }
  out.push(line('failed', 'deadpan', 'A correction will be issued.', n, end));
  // The Sloth Incident: once per build, after the first failure, while the repair is awaited.
  if (earlier.length === 0) out.push(line('cameo', 'deadpan', 'This is why we employ snails.', n, end));
  return out;
}
