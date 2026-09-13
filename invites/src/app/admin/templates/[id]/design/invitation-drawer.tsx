'use client';

import { useEffect, useRef, useState } from 'react';
import type { SectionData, SectionKey } from '@/lib/sections';
import { Builder, type SavedResult } from '@/components/builder/builder';
import { builderPropsAction } from '@/app/account/actions';

/** What the action answers with when it can: the form's props, and whether the order behind them is paid. */
type Form = Extract<Awaited<ReturnType<typeof builderPropsAction>>, { ok: true }>['data'];

/**
 * The Invitation tab's form, in the studio's left column.
 *
 * What it edits is an invitation — the demo, or a customer's — and it
 * saves to that invitation exactly as the tab does: the same form, the same
 * action, the same seven hundred milliseconds after her hand stops. The
 * studio is not told to save anything; it is told what was typed, so the
 * canvas can draw it at once, and what was saved, so the whole-invitation
 * view can be drawn again with it.
 *
 * The props are asked for from here rather than handed down from the page,
 * because they change with every part she steps to and with every
 * invitation she puts on the canvas, and the page was drawn once. The form
 * is remounted for each part, as the tab remounts it for each address, and
 * its own save on the way out carries anything still unsaved across.
 */
export function InvitationDrawer({ invitationId, title, onDraft, onSaved, onError }: {
  invitationId: string;
  /** what the header names: the demo, or the customer's title and package */
  title: string;
  onDraft: (id: string, section: SectionKey, data: SectionData) => void;
  onSaved: (id: string, section: SectionKey, data: SectionData, result: SavedResult) => void;
  onError: (message: string) => void;
}) {
  /** the part she asked for; the action answers with the first open one when it cannot open that */
  const [asked, setAsked] = useState<string | undefined>(undefined);
  const [form, setForm] = useState<{ id: string; props: Form } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  /** bumped to ask for the same part again, when its marks may have fallen behind a save */
  const [again, setAgain] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    // the newest ask is the one that counts: two quick steps must not land
    // in the other order and leave her on the part she stepped away from
    const n = ++seq.current;
    setBusy(true);
    setError('');
    builderPropsAction(invitationId, asked)
      .then((r) => {
        if (n !== seq.current) return;
        setBusy(false);
        if (!r.ok) { setError(r.error); return; }
        setForm({ id: invitationId, props: r.data });
      })
      .catch(() => {
        if (n !== seq.current) return;
        setBusy(false);
        setError('The form could not be loaded.');
      });
  }, [invitationId, asked, again]);

  // A form for some other invitation is not shown for this one, not even
  // for the moment its own is on the way: the canvas has already moved.
  const shown = form && form.id === invitationId ? form : null;
  const current = shown?.props.current;
  const currentRef = useRef(current);
  currentRef.current = current;
  // said while the part she asked for is on its way, and not while a part
  // already on screen is only having its marks refreshed
  const loading = busy && !(shown && (asked === undefined || current === asked));

  /**
   * A save that landed. The one on the way out of a part carries across the
   * remount and lands after the next part's props have been asked for, so
   * the marks along the top — filled, done — can be a save behind; when the
   * part saved is not the part on screen they are asked for once more.
   */
  const saved = (id: string) => (section: SectionKey, data: SectionData, result: SavedResult) => {
    onSaved(id, section, data, result);
    if (id === invitationId && section !== currentRef.current) setAgain((k) => k + 1);
  };

  return (
    <div className="px-1">
      <p className="label">{title}</p>
      <p className="hint mb-2">Saves to the invitation itself, the same as the Invitation tab.</p>
      {loading && <p className="hint mb-2">Loading the form…</p>}
      {error && <p className="hint mb-2 text-[color:var(--bad)]">{error}</p>}
      {shown && (shown.props.paid ? (
        // the props are the tab's, plus `paid`, which the form has no use for and does not name
        <Builder
          key={`${shown.id}:${shown.props.current}`}
          invitationId={shown.id}
          {...shown.props}
          embed
          canEditClosed
          onStep={setAsked}
          onDraft={(section, data) => onDraft(shown.id, section, data)}
          onSaved={saved(shown.id)}
          onError={onError}
        />
      ) : (
        <p className="hint">The order behind this invitation is not paid, so nothing can be saved to it yet.</p>
      ))}
    </div>
  );
}
