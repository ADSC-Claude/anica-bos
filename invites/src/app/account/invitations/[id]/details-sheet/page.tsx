import { notFound } from 'next/navigation';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { detailsSheet, type SheetItem } from '@/lib/details-sheet';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * The details sheet on screen: the same document the Word file carries,
 * readable here before it is downloaded, and printable from the browser for
 * whoever would rather have it on paper.
 */
export default async function DetailsSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  const sheet = detailsSheet({ occasion: inv.occasion, tier: inv.tier, addOns: inv.addOns, layout: inv.template.layout });

  return (
    <>
      <PageHeader
        title="Details sheet"
        subtitle={`Everything your ${sheet.packageLabel} package asks for on a ${sheet.occasionLabel.toLowerCase()}, part by part, in the same order as the Invitation tab. Fill it in offline and send it back over Messenger, or use it as a list of what to gather.`}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        <a href={`/account/invitations/${inv.id}/details-sheet.docx`} className="btn btn-primary" download>Download as Word</a>
        <span className="text-xs text-[color:var(--color-ink-500)]">Opens in Word, Google Docs or your phone. Or print this page from your browser.</span>
      </div>

      <article className="card mx-auto max-w-3xl p-6 sm:p-8" data-testid="details-sheet">
        <p className="eyebrow">{sheet.occasionLabel} · {sheet.packageLabel} package</p>
        <h2 className="display mt-1 text-2xl">What we need from you</h2>
        <p className="mt-2 text-sm text-[color:var(--color-ink-700)]">A box marked * is needed before we can publish. The rest are yours to leave blank — a part left empty simply does not appear on your invitation.</p>
        <ol className="mt-4 columns-2 gap-6 text-sm sm:columns-3">
          {sheet.parts.map((p) => (
            <li key={p.key} className="break-inside-avoid">{p.n}. {p.label}{p.optional ? <span className="text-[color:var(--color-ink-500)]"> (optional)</span> : null}</li>
          ))}
        </ol>
        {sheet.files.length > 0 && (
          <div className="mt-5 rounded-xl bg-[color:var(--color-sand-100)] p-4 text-sm">
            <p className="font-semibold">Files to send</p>
            <p className="text-xs text-[color:var(--color-ink-500)]">Each as its own file in the same chat, named like this, so we know where each one goes.</p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {sheet.files.map((f) => (
                <li key={f.name} className="text-xs"><b>{f.name}</b> <span className="text-[color:var(--color-ink-500)]">— {f.what}</span></li>
              ))}
            </ul>
          </div>
        )}

        {sheet.parts.map((p) => (
          <section key={p.key} className="mt-8 break-inside-avoid border-t border-[color:var(--color-sand-200)] pt-5">
            <h3 className="display text-xl">{p.n}. {p.label}</h3>
            <p className="mt-1 text-sm text-[color:var(--color-ink-500)]">{p.description}{p.optional ? ' Optional.' : ''}</p>
            <div className="mt-3 space-y-4">
              {p.items.map((i) => <Item key={i.label} item={i} />)}
            </div>
          </section>
        ))}
      </article>
    </>
  );
}

function Item({ item }: { item: SheetItem }) {
  const head = (
    <>
      <p className="text-sm font-semibold">{item.label}</p>
      {item.hint && <p className="text-xs text-[color:var(--color-ink-500)]">{item.hint}</p>}
    </>
  );
  const blank = (n: number) => Array.from({ length: n }, (_, k) => <div key={k} className="mt-3 h-6 border-b border-[color:var(--color-sand-300)]" />);
  switch (item.kind) {
    case 'line':
    case 'colors':
      return <div>{head}{blank(1)}</div>;
    case 'lines':
      return <div>{head}{blank(3)}</div>;
    case 'choice':
      return (
        <div>
          {head}
          <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">{item.many ? 'Tick any that apply.' : 'Tick one.'}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">{item.options.map((o) => <span key={o}>☐ {o}</span>)}</p>
        </div>
      );
    case 'yesno':
      return <div>{head}<p className="mt-1 text-sm">☐ Yes &nbsp;&nbsp; ☐ No</p></div>;
    case 'file':
      return <div>{head}<p className="mt-1 text-sm">Send the {item.what === 'song' ? 'song' : 'photo'} as a file named <b>{item.name}</b></p></div>;
    case 'table':
      return (
        <div>
          {head}
          {item.photos && <p className="text-xs text-[color:var(--color-ink-500)]">{item.photos}</p>}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr>{item.columns.map((c) => <th key={c} className="border border-[color:var(--color-sand-300)] bg-[color:var(--color-sand-100)] px-2 py-1 text-left font-semibold">{c}</th>)}</tr></thead>
              <tbody>{Array.from({ length: Math.min(item.rows, 5) }, (_, r) => <tr key={r}>{item.columns.map((c) => <td key={c} className="h-8 border border-[color:var(--color-sand-300)] px-2" />)}</tr>)}</tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">Add rows if you need more.</p>
        </div>
      );
  }
}
