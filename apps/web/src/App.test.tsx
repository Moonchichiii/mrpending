import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from './App';

test('the front door states the status', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Mr. Pending' })).toBeDefined();
  expect(screen.getByText(/Status: pre-alpha/)).toBeDefined();
});
