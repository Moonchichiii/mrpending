import type { Ref } from 'react';
import { useId } from 'react';
import type { ReportView } from './model/view';
import { estimate, wrap } from './model/view';
import { Thumbnail } from './Thumbnail';

// Character sheet section 5, as presentation attributes so the saved image needs none of the page's styles.
const INK = '#1f1b2e';
const PAPER = '#fff8e6';
const DISPLAY = "Fredoka, 'Trebuchet MS', sans-serif";
const BODY = "Nunito, 'Segoe UI', system-ui, sans-serif";
const STAMP = {
  APPROVED: { ruling: '#1fb5a3', text: '#0a4e45' },
  PENDING: { ruling: '#ff5a4e', text: '#8a1f15' },
} as const;

// The 1200 x 630 card and its portrait 3:4 variant for phones: the same view, laid out in one column or two. `text` is
// the width the words may take; title and verdict wrap at a character count and are capped at a number of lines.
export const SHAPES = {
  landscape: {
    width: 1200,
    height: 630,
    text: 536,
    title: { width: 22, lines: 2 },
    verdict: { width: 34, lines: 4 },
    column: 134,
    thumb: { x: 652, width: 452 },
  },
  portrait: {
    width: 900,
    height: 1200,
    text: 708,
    title: { width: 30, lines: 2 },
    verdict: { width: 46, lines: 5 },
    column: 177,
    thumb: { x: 96, width: 708 },
  },
} as const;
export type Shape = keyof typeof SHAPES;

// A line that would run past its box is condensed into it, so no schema-valid text leaves the card or meets another.
const fit = (text: string, size: number, box: number) =>
  estimate(text, size) > box ? { textLength: box, lengthAdjust: 'spacingAndGlyphs' } : {};

// A paper outline with the wonky uneven radii 18 6 22 8 (top left, top right, bottom right, bottom left).
const paper = (x: number, y: number, w: number, h: number) =>
  `M ${x + 18} ${y} H ${x + w - 6} Q ${x + w} ${y} ${x + w} ${y + 6} V ${y + h - 22} Q ${x + w} ${y + h} ${x + w - 22} ${y + h} H ${x + 8} Q ${x} ${y + h} ${x} ${y + h - 8} V ${y + 18} Q ${x} ${y} ${x + 18} ${y} Z`;

// The Engineering Report as one SVG; its description carries every number as text for assistive technology.
export function ReportCard({
  view,
  shape,
  ref,
}: {
  view: ReportView;
  shape: Shape;
  ref?: Ref<SVGSVGElement>;
}) {
  const id = useId();
  const { width, height, text, column, thumb, ...wrapAt } = SHAPES[shape];
  const { report } = view;
  const numbers = [
    { key: 'attempts', label: 'Attempts', value: String(report.attempts) },
    { key: 'parts', label: 'Parts', value: String(report.parts) },
    { key: 'pressed', label: 'Pressed', value: report.pressed ? 'Yes' : 'No' },
    ...(report.failedAt === undefined
      ? []
      : [{ key: 'failedAt', label: 'Failed at', value: report.failedAt }]),
  ];
  const title = wrap(view.title, wrapAt.title.width, wrapAt.title.lines);
  const verdict = wrap(report.verdict, wrapAt.verdict.width, wrapAt.verdict.lines);
  const titleEnd = 164 + 52 * (title.length - 1);
  const thumbHeight = (thumb.width * 440) / 720;
  // Landscape puts the thumbnail beside the text; portrait stacks it under the title. The numbers share one row.
  const thumbY = shape === 'landscape' ? 112 : titleEnd + 40;
  const numbersY = shape === 'landscape' ? titleEnd + 66 : thumbY + thumbHeight + 76;
  const verdictY = numbersY + 102;
  const described = [
    `${view.stamp}.`,
    ...numbers.map(({ label, value }) => `${label}: ${value}.`),
    report.verdict,
    view.footer,
  ].join(' ');
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline SVG cannot be an <img>; role img names it
      role="img"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      data-shape={shape}
    >
      <title id={`${id}-title`}>{`Engineering Report: ${view.title}`}</title>
      <desc id={`${id}-desc`}>{described}</desc>
      <rect width={width} height={height} fill="#ffd84a" />
      <g transform={`rotate(-0.8 ${width / 2} ${height / 2})`}>
        <path d={paper(54, 46, width - 96, height - 88)} fill={INK} />
        <path d={paper(48, 40, width - 96, height - 88)} fill={PAPER} stroke={INK} strokeWidth={4} />
      </g>
      <text
        x={96}
        y={108}
        fill="#6b3a17"
        fontFamily={DISPLAY}
        fontSize={22}
        fontWeight={700}
        letterSpacing={3}
      >
        ENGINEERING REPORT · FORM 27B/6
      </text>
      <text fill={INK} fontFamily={DISPLAY} fontSize={44} fontWeight={700} data-title>
        {title.map((line, i) => (
          <tspan key={i} x={96} y={164 + 52 * i} {...fit(line, 44, text)}>
            {line}
          </tspan>
        ))}
      </text>
      <Thumbnail
        blueprint={view.final.blueprint}
        events={view.final.events}
        x={thumb.x}
        y={thumbY}
        width={thumb.width}
      />
      {numbers.map(({ key, label, value }, i) => (
        <g key={key} transform={`translate(${96 + column * i} ${numbersY})`}>
          <text fill={INK} fontFamily={BODY} fontSize={22}>
            {label}
          </text>
          <text y={44} fill={INK} fontFamily={DISPLAY} fontSize={40} fontWeight={700} data-number={key}>
            {value}
          </text>
        </g>
      ))}
      <text fill={INK} fontFamily={BODY} fontSize={28} fontStyle="italic" data-verdict>
        {verdict.map((line, i) => (
          <tspan key={i} x={96} y={verdictY + 36 * i} {...fit(line, 28, text)}>
            {line}
          </tspan>
        ))}
      </text>
      <g
        transform={`translate(${thumb.x + thumb.width - 150} ${thumbY + thumbHeight - 10}) rotate(-6)`}
        data-stamp={view.stamp}
      >
        <rect
          x={-130}
          y={-42}
          width={260}
          height={84}
          rx={16}
          fill={PAPER}
          stroke={STAMP[view.stamp].ruling}
          strokeWidth={5}
        />
        <rect
          x={-120}
          y={-32}
          width={240}
          height={64}
          rx={10}
          fill="none"
          stroke={STAMP[view.stamp].ruling}
          strokeWidth={3}
        />
        <text
          y={15}
          textAnchor="middle"
          fill={STAMP[view.stamp].text}
          fontFamily={DISPLAY}
          fontSize={42}
          fontWeight={700}
          letterSpacing={3}
        >
          {view.stamp}
        </text>
      </g>
      <text
        x={96}
        y={height - 82}
        fill={INK}
        fontFamily={BODY}
        fontSize={20}
        data-footer
        {...fit(view.footer, 20, width - 192)}
      >
        {view.footer}
      </text>
    </svg>
  );
}
