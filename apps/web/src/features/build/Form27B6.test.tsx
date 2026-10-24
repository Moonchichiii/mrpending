import type { Form } from '@pending/contract';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Form27B6 } from './Form27B6';

afterEach(cleanup);

const setup = (initial?: Form) => {
  const onFile = vi.fn<(form: Form) => void>();
  render(<Form27B6 initial={initial} onFile={onFile} />);
  return { onFile, user: userEvent.setup() };
};

const DEFAULT = { nature: 'Press the blue button. Scenic route, please.', minParts: 3, maxParts: 8 };
const fileButton = () => screen.getByRole('button', { name: 'Ask Mr. Pending to press it' });
const sheet = () => screen.getByText('Adjust the form').closest('details');
// The visitor opens the folded form, as they must before any item can be changed.
const adjust = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByText('Adjust the form'));

describe('Form 27B/6', () => {
  test('files the pre-filled default request in one click, with the five items folded away', async () => {
    const { onFile, user } = setup();
    expect(sheet()?.open).toBe(false);
    expect(screen.getByText(/^File it as it stands or adjust it first/)).toBeDefined();
    await user.click(fileButton());
    expect(onFile).toHaveBeenCalledWith(DEFAULT);
    expect(sheet()?.open).toBe(false);
  });

  test('can be completed with the keyboard alone, the button first and then the items in reading order', async () => {
    const { onFile, user } = setup();
    await user.tab();
    expect(document.activeElement).toBe(fileButton());
    await user.tab();
    expect(document.activeElement).toBe(screen.getByText('Adjust the form'));
    // jsdom does not open a summary by keyboard; the Playwright form spec presses Enter on it in a real browser.
    await adjust(user);
    expect(sheet()?.open).toBe(true);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('1. Nature of the request'));
    await user.keyboard('{Control>}a{/Control}A scenic route, please.');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('2. Fewest parts'));
    await user.keyboard('{Control>}a{/Control}4');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('3. Most parts'));
    await user.keyboard('{Control>}a{/Control}9');
    await user.tab();
    // jsdom does not change a select by keyboard; the Playwright form spec covers that in a real browser.
    expect(document.activeElement).toBe(screen.getByLabelText('4. Required equipment'));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('5. Forbidden equipment'));
    // Back past the five items and the fold to the button above them.
    for (let i = 0; i < 6; i += 1) await user.tab({ shift: true });
    expect(document.activeElement).toBe(fileButton());
    await user.keyboard('{Enter}');
    expect(onFile).toHaveBeenCalledWith({ nature: 'A scenic route, please.', minParts: 4, maxParts: 9 });
  });

  test('item 1 comes filled with the default request, and the counter counts it', async () => {
    const { user } = setup();
    await adjust(user);
    const nature = screen.getByLabelText<HTMLTextAreaElement>('1. Nature of the request');
    expect(nature.value).toBe(DEFAULT.nature);
    expect(screen.getByText('44 of 180 characters')).toBeDefined();
    await user.clear(nature);
    await user.type(nature, 'Ramp.');
    expect(screen.getByText('5 of 180 characters')).toBeDefined();
  });

  test('a field left invalid behind a closed fold opens it again and receives focus', async () => {
    const { onFile, user } = setup();
    await adjust(user);
    await user.clear(screen.getByLabelText('3. Most parts'));
    await adjust(user);
    expect(sheet()?.open).toBe(false);
    await user.click(fileButton());
    expect(sheet()?.open).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText('3. Most parts'));
    expect(onFile).not.toHaveBeenCalled();
  });

  test('the same equipment required and forbidden is rejected in character, and nothing is filed', async () => {
    const { onFile, user } = setup();
    await adjust(user);
    await user.selectOptions(screen.getByLabelText('4. Required equipment'), 'fan');
    await user.selectOptions(screen.getByLabelText('5. Forbidden equipment'), 'fan');
    await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'Form 27B/6 rejected: items 4 and 5 name the same equipment. The Department does not do paradoxes before lunch.',
    );
    expect(document.activeElement).toBe(screen.getByLabelText('5. Forbidden equipment'));
    expect(onFile).not.toHaveBeenCalled();
  });

  test('more parts asked for than allowed is rejected in character', async () => {
    const { onFile, user } = setup({ nature: '', minParts: 8, maxParts: 4 });
    await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
    expect(screen.getByRole('alert').textContent).toMatch(
      /^Form 27B\/6 rejected: item 2 asks for more parts than item 3/,
    );
    expect(onFile).not.toHaveBeenCalled();
  });

  test('an out-of-range or empty count is named on its own field and receives focus', async () => {
    const { onFile, user } = setup();
    await adjust(user);
    await user.clear(screen.getByLabelText('2. Fewest parts'));
    await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
    const field = screen.getByLabelText('2. Fewest parts');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Item 2 must be a whole number from 2 to 8.').id).toBe(
      field.getAttribute('aria-describedby'),
    );
    expect(document.activeElement).toBe(field);
    expect(onFile).not.toHaveBeenCalled();
  });

  test('a contradiction beside a field error is still rejected in character', async () => {
    const { onFile, user } = setup();
    await adjust(user);
    await user.clear(screen.getByLabelText('2. Fewest parts'));
    await user.selectOptions(screen.getByLabelText('4. Required equipment'), 'fan');
    await user.selectOptions(screen.getByLabelText('5. Forbidden equipment'), 'fan');
    await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
    expect(screen.getByRole('alert').textContent).toMatch(/^Form 27B\/6 rejected: items 4 and 5/);
    expect(screen.getByText('Item 2 must be a whole number from 2 to 8.')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText('2. Fewest parts'));
    expect(onFile).not.toHaveBeenCalled();
  });

  test('a kept form comes back filled in', () => {
    setup({ nature: 'Kept.', minParts: 3, maxParts: 6, forbidden: 'ramp' });
    expect(screen.getByLabelText<HTMLTextAreaElement>('1. Nature of the request').value).toBe('Kept.');
    expect(screen.getByLabelText<HTMLSelectElement>('5. Forbidden equipment').value).toBe('ramp');
  });
});
