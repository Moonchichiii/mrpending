import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from './App';

test('the static front door opens on the gallery with the two actions and no form', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: 'Mr. Pending' })).toBeDefined();
  expect(screen.getByRole('link', { name: 'Watch Mr. Pending at work' }).getAttribute('href')).toBe(
    '#gallery',
  );
  expect(screen.getByRole('link', { name: 'Run it on your machine' }).getAttribute('href')).toMatch(
    /README|#readme/i,
  );
  expect(screen.getByRole('region', { name: 'The gallery' }).id).toBe('gallery');
  expect(screen.queryByRole('form')).toBeNull();
});
