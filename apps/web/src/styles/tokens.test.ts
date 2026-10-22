import { expect, test } from 'vitest';
import css from './tokens.css?raw';

const tokens = new Map(
  [...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name, hex]) => [name, hex]),
);

const hex = (name: string) => {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`tokens.css has no colour --${name}`);
  return value;
};

// WCAG 2.2 relative luminance and contrast ratio.
const luminance = (colour: string) => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(colour.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

// The pairs and ratios stated in the character sheet, section 5.
const pairs = [
  ['ink', 'paper', 15.8],
  ['coral-text', 'paper', 8.7],
  ['teal-text', 'paper', 9.1],
  ['copper-text', 'paper', 8.8],
  ['blue-text', 'paper', 10.0],
  ['ink', 'page', 12.1],
  ['paper', 'blueprint', 7.5],
] as const;

test.each(pairs)('%s on %s reaches the stated ratio and AAA', (text, surface, stated) => {
  const ratio = contrast(text, surface);
  expect(ratio).toBeGreaterThanOrEqual(7);
  expect(Math.round(ratio * 10) / 10).toBe(stated);
});
