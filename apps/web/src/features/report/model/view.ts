import type { Attempt, Build, Report } from '@pending/contract';

const HOST = { ollama: 'Ollama', openrouter: 'OpenRouter' } as const;

export type ReportView = {
  title: string;
  report: Report;
  stamp: 'APPROVED' | 'PENDING';
  footer: string;
  final: Pick<Attempt, 'blueprint' | 'events'>;
};

// ARCHITECTURE section 3: every number and the verdict from Report, the title and footer from the header, and the
// final attempt for the thumbnail only; the lines are never read, so no narration reaches the card.
export function reportView({ title, report, model, attempts }: Build): ReportView {
  const final = attempts.at(-1);
  if (final === undefined) throw new Error('a report card needs the final attempt');
  return {
    title,
    report,
    stamp: report.pressed ? 'APPROVED' : 'PENDING',
    footer: `Recorded ${model.mode} inference · ${model.id} via ${HOST[model.host]}`,
    final: { blueprint: final.blueprint, events: final.events },
  };
}

// Greedy word wrap for SVG text, which never wraps itself: a word longer than the line is cut, and lines past `max`
// join the last one, which the card then condenses to fit. Lengths and cuts count code points, so a character outside
// the BMP is never split into lone surrogates.
export function wrap(text: string, width: number, max: number): string[] {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      const chars = Array.from(word);
      return Array.from({ length: Math.ceil(chars.length / width) }, (_, i) =>
        chars.slice(i * width, (i + 1) * width).join(''),
      );
    });
  const length = (s: string) => Array.from(s).length;
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last !== undefined && length(last) + 1 + length(word) <= width)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.length > max ? [...lines.slice(0, max - 1), lines.slice(max - 1).join(' ')] : lines;
}

// Advance widths in em, erring wide (wide letters count nearly a full em), so a long line is caught before it overflows.
const advance = (c: string) =>
  /[MWmw@]/.test(c) ? 0.95 : /[A-Z0-9]/.test(c) ? 0.7 : /[\s.,:;'|!ijlt]/.test(c) ? 0.32 : 0.58;

export function estimate(text: string, size: number): number {
  let ems = 0;
  for (let i = 0; i < text.length; i += 1) ems += advance(text.charAt(i));
  return ems * size;
}
