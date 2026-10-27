import { PAGE_SIZES, type Notebook, type Paper, type PageSizeKey } from './notebook';
import type { PageTranscript } from './transcribe';

export type TypedFont = 'times' | 'helvetica' | 'courier';

/** True vector export — the same millimetre stroke arrays the preview draws. */
export async function exportPdf(
  notebook: Pick<Notebook, 'pages' | 'sizeKey'>,
  { filename = 'airwrite.pdf', paper = 'blank' as Paper } = {},
) {
  const doc = await createHandwritingPdf(notebook, { paper });
  doc.save(filename);
}

/** Build separately from downloading so the actual PDF can be verified. */
export async function createHandwritingPdf(
  notebook: Pick<Notebook, 'pages' | 'sizeKey'>,
  { paper = 'blank' as Paper } = {},
) {
  const { jsPDF } = await import('jspdf');
  const size = PAGE_SIZES[notebook.sizeKey];
  const doc = new jsPDF({ unit: 'mm', format: size.fmt, orientation: size.orient });
  doc.setLineCap('round');
  doc.setLineJoin('round');

  notebook.pages.forEach((page, i) => {
    if (i > 0) doc.addPage(size.fmt, size.orient);
    if (paper !== 'blank') drawPaper(doc, paper, size.w, size.h);
    for (const st of page) {
      if (st.pts.length < 2) continue;
      const [r, g, b] = hexRgb(st.color);
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(st.width);
      // Match the canvas preview's quadratic midpoint smoothing exactly.
      doc.moveTo(st.pts[0].x, st.pts[0].y);
      let from = st.pts[0];
      for (let k = 1; k < st.pts.length - 1; k++) {
        const control = st.pts[k];
        const next = st.pts[k + 1];
        const to = { x: (control.x + next.x) / 2, y: (control.y + next.y) / 2 };
        doc.curveTo(
          from.x + (control.x - from.x) * 2 / 3,
          from.y + (control.y - from.y) * 2 / 3,
          to.x + (control.x - to.x) * 2 / 3,
          to.y + (control.y - to.y) * 2 / 3,
          to.x, to.y,
        );
        from = to;
      }
      const last = st.pts[st.pts.length - 1];
      doc.lineTo(last.x, last.y);
      doc.stroke();
    }
  });

  return doc;
}

function drawPaper(doc: import('jspdf').jsPDF, paper: Paper, w: number, h: number) {
  doc.setLineWidth(0.14);
  doc.setDrawColor(211, 220, 236);
  if (paper === 'ruled') {
    for (let y = 20; y < h - 10; y += 8) doc.line(15, y, w - 12, y);
    doc.setDrawColor(239, 192, 192);
    doc.line(20, 10, 20, h - 10);
    return;
  }
  for (let y = 10; y < h - 8; y += 5) doc.line(10, y, w - 10, y);
  for (let x = 10; x < w - 8; x += 5) doc.line(x, 10, x, h - 10);
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Typed export: real, selectable, searchable PDF text laid out from the
 * transcription. A transcribed page can run longer than one sheet, so text
 * flows onto continuation pages rather than being clipped.
 */
export async function exportTextPdf(
  transcripts: PageTranscript[],
  {
    sizeKey,
    filename = 'airwrite.pdf',
    font = 'times' as TypedFont,
    fontSize = 12,
  }: { sizeKey: PageSizeKey; filename?: string; font?: TypedFont; fontSize?: number },
) {
  const doc = await createTextPdf(transcripts, { sizeKey, font, fontSize });
  doc.save(filename);
}

export async function createTextPdf(
  transcripts: PageTranscript[],
  { sizeKey, font = 'times' as TypedFont, fontSize = 12 }: { sizeKey: PageSizeKey; font?: TypedFont; fontSize?: number },
) {
  const { jsPDF } = await import('jspdf');
  const size = PAGE_SIZES[sizeKey];
  const doc = new jsPDF({ unit: 'mm', format: size.fmt, orientation: size.orient });

  const margin = 20;
  const lineHeight = fontSize * 0.3527 * 1.45; // pt -> mm, 1.45 leading
  const maxWidth = size.w - margin * 2;
  const bottom = size.h - margin;

  doc.setFont(font, 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(20, 22, 28);

  transcripts.forEach((t, i) => {
    if (i > 0) doc.addPage(size.fmt, size.orient);
    let y = margin + lineHeight;

    // Blank lines are paragraph breaks; every other line wraps to the margin.
    for (const source of t.text.split(/\r?\n/)) {
      if (!source.trim()) {
        y += lineHeight * 0.6;
        continue;
      }
      for (const line of doc.splitTextToSize(source, maxWidth) as string[]) {
        if (y > bottom) {
          doc.addPage(size.fmt, size.orient);
          y = margin + lineHeight;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      }
    }
  });

  return doc;
}
