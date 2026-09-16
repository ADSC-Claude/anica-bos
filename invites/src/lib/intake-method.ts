/**
 * How a Done-For-You customer says they are sending their details: typed
 * into the form, over Messenger, as an Excel file, or on the details sheet
 * (the Word file of everything their package asks for), filled in. Pure, so
 * the customer's card, the intake save and the staff pages read one list.
 */
export const INTAKE_METHODS = ['FORM', 'MESSENGER', 'EXCEL', 'SHEET'] as const;
export type IntakeMethod = (typeof INTAKE_METHODS)[number];

/** A stored or posted value, held to the list; anything else is the form. */
export function intakeMethod(value: unknown): IntakeMethod {
  return (INTAKE_METHODS as readonly string[]).includes(value as string) ? (value as IntakeMethod) : 'FORM';
}

const LABEL: Record<IntakeMethod, string> = { FORM: 'the form', MESSENGER: 'Messenger', EXCEL: 'an Excel file', SHEET: 'the details sheet' };

/** For "details via …" on the staff side. */
export function intakeMethodLabel(value: unknown): string {
  return LABEL[intakeMethod(value)];
}
