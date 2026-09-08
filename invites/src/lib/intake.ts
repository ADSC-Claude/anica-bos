import type { Field, SectionData } from './sections';

/**
 * A client's answer, as words. What the intake page and the encoder's
 * workspace show beside the form: the label the client picked rather than the
 * key it is stored under ("The Seal", not "seal"), a person with their title,
 * a list one row per line.
 */
export function renderValue(field: Field, v: unknown): string {
  if (v == null || v === '') return '';
  if (field.type === 'toggle') return v ? 'Yes' : 'No';
  if (field.type === 'person') {
    const p = v as { title: string; name: string; deceased: boolean };
    return p.name ? `${p.title} ${p.name}${p.deceased ? ' †' : ''}`.trim() : '';
  }
  if (field.type === 'colors' || field.type === 'swatches' || field.type === 'checks') return (v as string[]).join(', ');
  if (field.type === 'select') return field.options?.find((o) => o.value === v)?.label ?? String(v);
  if (field.type === 'list') return (v as Record<string, unknown>[]).map((row) => (field.item ?? []).map((f) => renderValue(f, row[f.key])).filter(Boolean).join(' · ')).join('\n');
  if (field.type === 'offset') return typeof v === 'number' ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : '';
  return String(v);
}

/** The rows a section's answers make: label and words, blanks left out. */
export function intakeRows(fields: Field[], data: SectionData | undefined): { label: string; value: string }[] {
  if (!data) return [];
  return fields.map((f) => ({ label: f.label, value: renderValue(f, data[f.key]) })).filter((r) => r.value);
}

/** Whether the client wrote anything at all in a section. */
export function intakeFilled(fields: Field[], data: SectionData | undefined): boolean {
  return intakeRows(fields, data).length > 0;
}

/**
 * The client's answers laid over what the invitation holds: every blank they
 * left keeps the current value, so "use what the client sent" never wipes a
 * fixed writing or a photo the encoder placed.
 */
export function overlayIntake(current: SectionData, intake: SectionData | undefined): SectionData {
  if (!intake) return current;
  const filled = Object.fromEntries(Object.entries(intake).filter(([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)));
  return { ...current, ...filled };
}
