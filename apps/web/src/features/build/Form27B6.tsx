import { Form, PartKind } from '@pending/contract';
import type { SyntheticEvent } from 'react';
import { useId, useRef, useState } from 'react';
import styles from './Form27B6.module.css';

type Field = 'nature' | 'minParts' | 'maxParts' | 'required' | 'forbidden';
type Draft = Record<Field, string>;

// Bounds are read from the contract, so the form cannot drift from what the server accepts.
const NATURE_MAX = Form.shape.nature.maxLength ?? 0;
const MIN = { lo: Form.shape.minParts.minValue ?? 0, hi: Form.shape.minParts.maxValue ?? 0 };
const MAX = { lo: Form.shape.maxParts.minValue ?? 0, hi: Form.shape.maxParts.maxValue ?? 0 };

const FIELD_ERROR: Record<Field, string> = {
  nature: `Item 1 runs to ${NATURE_MAX} characters at most.`,
  minParts: `Item 2 must be a whole number from ${MIN.lo} to ${MIN.hi}.`,
  maxParts: `Item 3 must be a whole number from ${MAX.lo} to ${MAX.hi}.`,
  required: 'Item 4 must name catalogue equipment or none.',
  forbidden: 'Item 5 must name catalogue equipment or none.',
};

// The rejected beat (character sheet section 3); the second contradiction gets the same deadpan in its own words.
const REJECTED = {
  forbidden:
    'Form 27B/6 rejected: items 4 and 5 name the same equipment. The Department does not do paradoxes before lunch.',
  minParts:
    'Form 27B/6 rejected: item 2 asks for more parts than item 3 allows. The Department does not do paradoxes before lunch.',
} as const;

const isField = (key: PropertyKey | undefined): key is Field =>
  key === 'nature' || key === 'minParts' || key === 'maxParts' || key === 'required' || key === 'forbidden';

const toDraft = (form: Form | undefined): Draft => ({
  nature: form?.nature ?? '',
  minParts: String(form?.minParts ?? 3),
  maxParts: String(form?.maxParts ?? 8),
  required: form?.required ?? '',
  forbidden: form?.forbidden ?? '',
});

// Empty number boxes stay invalid instead of becoming zero; empty selects mean "none".
const candidate = (draft: Draft) => ({
  nature: draft.nature,
  minParts: draft.minParts.trim() === '' ? Number.NaN : Number(draft.minParts),
  maxParts: draft.maxParts.trim() === '' ? Number.NaN : Number(draft.maxParts),
  ...(draft.required !== '' && { required: draft.required }),
  ...(draft.forbidden !== '' && { forbidden: draft.forbidden }),
});

// The schema runs its two refines only once every field is valid, so a contradiction beside a field error is
// found here as well; the wording and the field it lands on are the same either way.
const contradiction = (c: ReturnType<typeof candidate>): 'forbidden' | 'minParts' | undefined => {
  if (c.required !== undefined && c.required === c.forbidden) return 'forbidden';
  if (c.minParts > c.maxParts) return 'minParts';
  return undefined;
};

// canFile is false until the inference badge is shown: the fields stay editable, nothing leaves the browser.
export function Form27B6({
  initial,
  onFile,
  canFile = true,
}: {
  initial?: Form | undefined;
  onFile: (form: Form) => void;
  canFile?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [rejection, setRejection] = useState<string>();
  const fields = useRef<
    Partial<Record<Field, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>
  >({});

  const set = (field: Field) => (event: { currentTarget: { value: string } }) => {
    const value = event.currentTarget.value;
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canFile) return;
    const filed = candidate(draft);
    const parsed = Form.safeParse(filed);
    if (parsed.success) {
      setErrors({});
      setRejection(undefined);
      onFile(parsed.data);
      return;
    }
    const found: Partial<Record<Field, string>> = {};
    let paradox: 'forbidden' | 'minParts' | undefined;
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (!isField(field)) continue;
      // The two refines are the contradictions; anything else is a field out of range.
      if (issue.code === 'custom' && (field === 'forbidden' || field === 'minParts')) paradox ??= field;
      else found[field] ??= FIELD_ERROR[field];
    }
    paradox ??= contradiction(filed);
    setErrors(found);
    setRejection(paradox && REJECTED[paradox]);
    // Focus goes to the first field to correct; the rejection is announced by its alert role.
    const first = (['nature', 'minParts', 'maxParts', 'required', 'forbidden'] as const).find(
      (f) => found[f],
    );
    fields.current[first ?? paradox ?? 'nature']?.focus();
  };

  const describedBy = (field: Field, ...extra: string[]) =>
    [...extra, errors[field] && `${id}-${field}-error`].filter(Boolean).join(' ') || undefined;
  const error = (field: Field) =>
    errors[field] && (
      <p id={`${id}-${field}-error`} className={styles.error}>
        {errors[field]}
      </p>
    );
  const kinds = (field: 'required' | 'forbidden', label: string) => (
    <div className={styles.field}>
      <label htmlFor={`${id}-${field}`}>{label}</label>
      <select
        id={`${id}-${field}`}
        ref={(el) => {
          fields.current[field] = el;
        }}
        value={draft[field]}
        onChange={set(field)}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={describedBy(field)}
      >
        <option value="">None</option>
        {PartKind.options.map((kind) => (
          <option key={kind} value={kind}>
            {kind}
          </option>
        ))}
      </select>
      {error(field)}
    </div>
  );

  return (
    <form className={styles.form} noValidate onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.title}>
        Form 27B/6
      </h2>
      <p className={styles.lede}>Application for the pressing of one blue button.</p>
      {rejection && (
        <p role="alert" className={styles.rejection}>
          {rejection}
        </p>
      )}
      <div className={styles.field}>
        <label htmlFor={`${id}-nature`}>1. Nature of the request</label>
        <textarea
          id={`${id}-nature`}
          ref={(el) => {
            fields.current.nature = el;
          }}
          value={draft.nature}
          onChange={set('nature')}
          maxLength={NATURE_MAX}
          placeholder="Press the blue button. Scenic route, please."
          rows={3}
          aria-invalid={errors.nature ? true : undefined}
          aria-describedby={describedBy('nature', `${id}-nature-count`)}
        />
        <p id={`${id}-nature-count`} className={styles.hint}>
          {draft.nature.length} of {NATURE_MAX} characters
        </p>
        {error('nature')}
      </div>
      <div className={styles.pair}>
        <div className={styles.field}>
          <label htmlFor={`${id}-minParts`}>2. Fewest parts</label>
          <input
            id={`${id}-minParts`}
            ref={(el) => {
              fields.current.minParts = el;
            }}
            type="number"
            inputMode="numeric"
            min={MIN.lo}
            max={MIN.hi}
            value={draft.minParts}
            onChange={set('minParts')}
            aria-invalid={errors.minParts ? true : undefined}
            aria-describedby={describedBy('minParts')}
          />
          {error('minParts')}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-maxParts`}>3. Most parts</label>
          <input
            id={`${id}-maxParts`}
            ref={(el) => {
              fields.current.maxParts = el;
            }}
            type="number"
            inputMode="numeric"
            min={MAX.lo}
            max={MAX.hi}
            value={draft.maxParts}
            onChange={set('maxParts')}
            aria-invalid={errors.maxParts ? true : undefined}
            aria-describedby={describedBy('maxParts')}
          />
          {error('maxParts')}
        </div>
      </div>
      <div className={styles.pair}>
        {kinds('required', '4. Required equipment')}
        {kinds('forbidden', '5. Forbidden equipment')}
      </div>
      <button
        type="submit"
        className={styles.submit}
        disabled={!canFile}
        aria-describedby={canFile ? undefined : `${id}-waiting`}
      >
        File Form 27B/6
      </button>
      {!canFile && (
        <p id={`${id}-waiting`} className={styles.hint}>
          Filing opens once the Department confirms where drafting happens.
        </p>
      )}
    </form>
  );
}
