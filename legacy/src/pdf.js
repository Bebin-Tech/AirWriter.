import { PAGE_SIZES } from './notebook.js';

const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.es.min.js';

export async function exportPdf(notebook, { filename = 'air-notebook.pdf', ruled = false } = {}) {
  const { jsPDF } = await import(JSPDF);
  const size = PAGE_SIZES[notebook.sizeKey];
  const doc = new jsPDF({ unit: 'mm', format: size.fmt, orientation: size.orient });
  doc.setLineCap('round'); doc.setLineJoin('round');

  notebook.pages.forEach((page, i) => {
    if (i > 0) doc.addPage(size.fmt, size.orient);
    if (ruled) drawRuled(doc, size);
    for (const st of page) {
      if (st.pts.length < 2) continue;
      const { r, g, b } = hexRgb(st.color);
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(st.width);
      doc.lines(
        st.pts.slice(1).map((p, k) => [p.x - st.pts[k].x, p.y - st.pts[k].y]),
        st.pts[0].x, st.pts[0].y,
      );
    }
  });

  doc.save(filename);
}

function drawRuled(doc, { w, h }) {
  doc.setLineWidth(0.15); doc.setDrawColor(207, 216, 234);
  for (let y = 20; y < h - 10; y += 8) doc.line(15, y, w - 10, y);
  doc.setDrawColor(240, 184, 184);
  doc.line(20, 10, 20, h - 10);
}

function hexRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
