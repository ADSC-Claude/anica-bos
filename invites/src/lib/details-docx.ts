import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, Footer, PageNumber, AlignmentType } from 'docx';
import type { Sheet, SheetItem } from './details-sheet';

/**
 * The details sheet as a Word file: what a family opens on the laptop, fills
 * in over a week, and sends back over Messenger. Word rather than PDF because
 * a form is for writing in, and everybody has something that opens a .docx —
 * Word, Google Docs, the phone's own viewer.
 *
 * Every box the form has is here in the same order, as a labelled blank: a
 * ruled line for a short answer, three for a paragraph, tick boxes for a
 * choice, a table for a list with room to add rows, and for every photograph
 * the name to send the file under, so twenty JPEGs in a chat still tell us
 * which is the cover.
 */
export type SheetMeta = {
  business: string;
  /** the invitation's title, "Juan & Maria" */
  title: string;
  /** the order's reference, or blank where staff made the invitation */
  reference: string;
  customer: string;
  dashboardUrl: string;
  messengerUrl: string;
};

const INK = '2A2622';
const MUTED = '7A726B';
const RULE = 'C9C1B8';
const ACCENT = '7A2E4A';

const text = (t: string, o: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) => new TextRun({ text: t, bold: o.bold, italics: o.italics, size: o.size, color: o.color, font: 'Calibri' });
const para = (children: TextRun[], o: { after?: number; before?: number; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; keepNext?: boolean } = {}) =>
  new Paragraph({ children, heading: o.heading, keepNext: o.keepNext, spacing: { before: o.before ?? 0, after: o.after ?? 80 } });
const hint = (t?: string) => (t ? [para([text(t, { size: 18, color: MUTED, italics: true })], { after: 60, keepNext: true })] : []);
/** A ruled blank to write on. */
const rule = (n = 1) =>
  Array.from({ length: n }, () => new Paragraph({ children: [text(' ')], spacing: { before: 120, after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 1 } } }));
const label = (t: string) => para([text(t, { bold: true, size: 22, color: INK })], { before: 140, after: 40, keepNext: true });
const boxes = (options: string[]) => para([text(options.map((o) => `☐ ${o}`).join('    '), { size: 21 })], { after: 60 });

const cell = (t: string, o: { header?: boolean; width: number }) =>
  new TableCell({
    width: { size: o.width, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    shading: o.header ? { fill: 'F3EEE8' } : undefined,
    children: [para([text(t, { bold: o.header, size: 20 })], { after: 0 })],
  });

function table(columns: string[], rows: number): Table {
  const width = Math.floor(100 / columns.length);
  const border = { style: BorderStyle.SINGLE, size: 4, color: RULE };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: columns.map((c) => cell(c, { header: true, width })) }),
      ...Array.from({ length: rows }, () => new TableRow({ children: columns.map(() => cell(' ', { width })) })),
    ],
  });
}

function item(i: SheetItem): (Paragraph | Table)[] {
  switch (i.kind) {
    case 'line':
      return [label(i.label), ...hint(i.hint), ...rule(1)];
    case 'lines':
      return [label(i.label), ...hint(i.hint), ...rule(3)];
    case 'choice':
      return [label(i.label), ...hint([i.many ? 'Tick any that apply.' : 'Tick one.', i.hint].filter(Boolean).join(' ')), boxes(i.options)];
    case 'yesno':
      return [label(i.label), ...hint(i.hint), boxes(['Yes', 'No'])];
    case 'colors':
      return [label(i.label), ...hint(i.hint), ...rule(1)];
    case 'file':
      return [label(i.label), ...hint(i.hint), para([text(i.what === 'song' ? 'Send the song as a file named ' : 'Send the photo as a file named ', { size: 21 }), text(i.name, { bold: true, size: 21 })], { after: 60 })];
    case 'table':
      return [
        label(i.label),
        ...hint([i.hint, i.photos].filter(Boolean).join(' · ')),
        table(i.columns, i.rows),
        para([text('Add rows if you need more.', { size: 18, color: MUTED, italics: true })], { before: 40, after: 120 }),
      ];
  }
}

export async function detailsDocx(sheet: Sheet, meta: SheetMeta): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    para([text(meta.business.toUpperCase(), { size: 18, color: ACCENT, bold: true })], { after: 60 }),
    new Paragraph({ children: [text('Details sheet', { size: 44, bold: true, color: INK })], spacing: { after: 60 } }),
    para([text(`${sheet.occasionLabel} · ${sheet.packageLabel} package`, { size: 26, color: INK })], { after: 40 }),
    para([text([meta.title, meta.reference ? `Order ${meta.reference}` : '', meta.customer].filter(Boolean).join(' · '), { size: 20, color: MUTED })], { after: 200 }),
    para([text('Everything your invitation asks for is on this sheet, part by part, in the same order as your dashboard. ', { size: 21 }), text('Fill it in and send it back over Messenger with your order number, and your photos as separate files named as written beside each one. ', { size: 21 }), text('Or type it straight into your dashboard, where it saves as you go: ', { size: 21 }), text(meta.dashboardUrl, { size: 21, color: ACCENT })], { after: 100 }),
    para([text('A box marked * is needed before we can publish. The rest are yours to leave blank — a part left empty simply does not appear on your invitation.', { size: 21 })], { after: 200 }),
    new Paragraph({ children: [text('What is on this sheet', { size: 24, bold: true, color: INK })], spacing: { before: 120, after: 80 } }),
    ...sheet.parts.map((p) => para([text(`${p.n}. ${p.label}${p.optional ? ' (optional)' : ''}`, { size: 20 })], { after: 20 })),
  ];
  if (sheet.files.length) {
    children.push(new Paragraph({ children: [text('Files to send', { size: 24, bold: true, color: INK })], spacing: { before: 200, after: 80 } }));
    children.push(para([text('Send each as its own file in the same chat, named like this, so we know where each one goes:', { size: 20, color: MUTED })], { after: 60 }));
    for (const f of sheet.files) children.push(para([text(f.name, { bold: true, size: 20 }), text(`  —  ${f.what}`, { size: 20, color: MUTED })], { after: 20 }));
  }
  for (const p of sheet.parts) {
    children.push(new Paragraph({ children: [text(`${p.n}. ${p.label}`, { size: 30, bold: true, color: ACCENT })], heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { after: 60 } }));
    children.push(para([text(p.description + (p.optional ? ' Optional.' : ''), { size: 20, color: MUTED, italics: true })], { after: 160 }));
    for (const i of p.items) children.push(...item(i));
  }
  const doc = new Document({
    creator: meta.business,
    title: `Details sheet — ${meta.title}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 22, color: INK } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1200, right: 1200 } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [text(`${meta.business} · Details sheet · page `, { size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED, font: 'Calibri' })] })],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
