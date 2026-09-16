/**
 * What the canvas draws while she is typing in the studio's own copy of the
 * form.
 *
 * The form saves seven hundred milliseconds after her hand stops, and the
 * invitation's content — the demo's, or a real customer's — is folded in
 * only once that save has landed. Between the keystroke and the save the
 * page under her hand would be a version behind, which on a canvas is the
 * difference between a heading that fits and one she cannot tell about
 * yet. So the form hands over every change as it is made, and the canvas
 * lays the part being typed over the content it already has.
 *
 * It is one part laid over the whole: the form holds one part at a time
 * and `valueAt` reads by part, so replacing `content[section]` is all a
 * live draft needs. A draft belonging to some other invitation is not laid
 * over this one — the form may still be saving what she typed on the demo
 * while the canvas has moved to a customer's page — and nothing here is
 * ever saved: what is drawn is the draft, what is kept is the save.
 */
export type StudioDraft = { id: string; section: string; data: Record<string, unknown> };

export function withDraft(base: Record<string, unknown>, draft: StudioDraft | null, shownId: string): Record<string, unknown> {
  if (!draft || draft.id !== shownId) return base;
  return { ...base, [draft.section]: draft.data };
}
