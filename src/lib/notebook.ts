import { clamp, type Point } from './geometry';

export const PAGE_SIZES = {
  a4: { label: 'A4 portrait', w: 210, h: 297, fmt: 'a4', orient: 'portrait' },
  a4l: { label: 'A4 landscape', w: 297, h: 210, fmt: 'a4', orient: 'landscape' },
  letter: { label: 'Letter portrait', w: 215.9, h: 279.4, fmt: 'letter', orient: 'portrait' },
  letterl: { label: 'Letter landscape', w: 279.4, h: 215.9, fmt: 'letter', orient: 'landscape' },
} as const;

export type PageSizeKey = keyof typeof PAGE_SIZES;
export type Stroke = { color: string; width: number; pts: Point[] };
export type Paper = 'ruled' | 'grid' | 'blank';

const PX_PER_MM = 4; // preview resolution

/**
 * Pages of vector strokes held in millimetres of page space, so the on-screen
 * preview and the exported PDF render from the same arrays.
 *
 * Painting is two-layer: `base` carries the paper plus every committed stroke
 * and is only rebuilt when the page changes; each animation frame blits it and
 * draws just the in-progress stroke, so cost stays flat as the page fills.
 */
export class Notebook {
  pages: Stroke[][] = [[]];
  index = 0;
  paper: Paper = 'ruled';
  sizeKey: PageSizeKey = 'a4';

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private base = typeof document === 'undefined' ? null : document.createElement('canvas');
  private current: Stroke | null = null;
  onChange?: () => void;

  get size() { return PAGE_SIZES[this.sizeKey]; }
  get page() { return this.pages[this.index]; }
  get strokeCount() { return this.pages.reduce((n, p) => n + p.length, 0); }
  get isDrawing() { return this.current !== null; }

  /**
   * A clean white-background PNG of one page — strokes only, no ruling, no
   * cursor — for handwriting transcription. Rendered at ~1150px on the long
   * edge, which is roughly what the vision API downsamples to anyway.
   */
  pageImage(index = this.index): string | null {
    return pageImage(this.pages[index] ?? [], this.sizeKey);
  }

  /** Indices of pages that actually have ink on them. */
  inkedPages(): number[] {
    return this.pages.map((p, i) => (p.length ? i : -1)).filter((i) => i >= 0);
  }

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
  }

  setSize(key: PageSizeKey) { this.sizeKey = key; this.resize(); }
  setPaper(paper: Paper) { this.paper = paper; this.invalidate(); }

  private resize() {
    const { w, h } = this.size;
    for (const c of [this.canvas, this.base]) {
      if (!c) continue;
      c.width = Math.round(w * PX_PER_MM);
      c.height = Math.round(h * PX_PER_MM);
    }
    this.invalidate();
  }

  addPage() { this.pages.push([]); this.index = this.pages.length - 1; this.current = null; this.invalidate(); }
  goTo(i: number) {
    const next = clamp(i, 0, this.pages.length - 1);
    if (next === this.index) return;
    this.index = next; this.current = null; this.invalidate();
  }
  clearPage() { this.pages[this.index] = []; this.current = null; this.invalidate(); }
  undo() { this.page.pop(); this.current = null; this.invalidate(); }
  reset() { this.pages = [[]]; this.index = 0; this.current = null; this.invalidate(); }

  /** Deep copy of every page, safe to hand to storage. */
  snapshot(): Stroke[][] {
    return this.pages.map((page) => page.map((st) => ({ ...st, pts: st.pts.map((p) => ({ ...p })) })));
  }

  /** Replace the notebook's contents — used when reopening a saved doc. */
  load(pages: Stroke[][]) {
    this.pages = pages.length
      ? pages.map((page) => page.map((st) => ({ ...st, pts: st.pts.map((p) => ({ ...p })) })))
      : [[]];
    this.index = 0;
    this.current = null;
    this.invalidate();
  }

  /** Begin a stroke at a page-normalized point (0..1, 0..1). */
  begin(p: Point, style: { color: string; width: number }) {
    this.current = { ...style, pts: [this.toMm(p)] };
    this.page.push(this.current);
    this.render();
    this.onChange?.();
  }

  extend(p: Point) {
    if (!this.current) return;
    const q = this.toMm(p);
    const pts = this.current.pts;
    const last = pts[pts.length - 1];
    if (Math.hypot(q.x - last.x, q.y - last.y) < 0.15) return; // 0.15 mm dedupe
    pts.push(q);
    this.render();
  }

  end() {
    if (this.current && this.current.pts.length < 2) this.page.pop(); // drop dot-only noise
    this.current = null;
    this.invalidate();
    this.onChange?.();
  }

  private toMm(p: Point): Point {
    const { w, h } = this.size;
    return { x: clamp(p.x) * w, y: clamp(p.y) * h };
  }

  /** Rebuild the committed layer, then repaint. */
  invalidate() {
    const ctx = this.base?.getContext('2d');
    if (!ctx || !this.base) return;
    const { w, h } = this.size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fdfdfb';
    ctx.fillRect(0, 0, this.base.width, this.base.height);
    ctx.scale(PX_PER_MM, PX_PER_MM);
    drawPaper(ctx, this.paper, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of this.page) if (st !== this.current) strokePath(ctx, st);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.render();
    this.onChange?.();
  }

  render(cursor: Point | null = null) {
    const { ctx, base } = this;
    if (!ctx || !base) return;
    const { w, h } = this.size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    ctx.save();
    ctx.scale(PX_PER_MM, PX_PER_MM);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (this.current) strokePath(ctx, this.current);
    if (cursor) {
      const x = clamp(cursor.x) * w;
      const y = clamp(cursor.y) * h;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(99,102,241,.55)';
      ctx.lineWidth = 0.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 0.9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(99,102,241,.9)';
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawPaper(ctx: CanvasRenderingContext2D, paper: Paper, w: number, h: number) {
  if (paper === 'blank') return;
  ctx.lineWidth = 0.14;
  ctx.strokeStyle = '#d3dcec';
  if (paper === 'ruled') {
    for (let y = 20; y < h - 10; y += 8) {
      ctx.beginPath(); ctx.moveTo(15, y); ctx.lineTo(w - 12, y); ctx.stroke();
    }
    ctx.strokeStyle = '#efc0c0';
    ctx.beginPath(); ctx.moveTo(20, 10); ctx.lineTo(20, h - 10); ctx.stroke();
    return;
  }
  for (let y = 10; y < h - 8; y += 5) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(w - 10, y); ctx.stroke(); }
  for (let x = 10; x < w - 8; x += 5) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, h - 10); ctx.stroke(); }
}

function strokePath(ctx: CanvasRenderingContext2D, st: Stroke) {
  const p = st.pts;
  if (p.length < 2) return;
  ctx.strokeStyle = st.color;
  ctx.lineWidth = st.width;
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  // quadratics through the midpoints => smooth ink without extra samples
  for (let i = 1; i < p.length - 1; i++) {
    ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
  }
  ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
  ctx.stroke();
}

/**
 * A standalone PNG of one saved page — paper plus strokes, no notebook
 * instance needed. Used for the document thumbnails in the library.
 */
export function pageThumbnail(
  page: Stroke[],
  sizeKey: PageSizeKey,
  paper: Paper,
  longEdge = 420,
): string | null {
  if (typeof document === 'undefined') return null;
  const { w, h } = PAGE_SIZES[sizeKey];
  const scale = longEdge / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fdfdfb';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(scale, scale);
  drawPaper(ctx, paper, w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const st of page) strokePath(ctx, st);
  return c.toDataURL('image/png');
}

/**
 * The transcription image for one page — strokes only on white, no ruling and
 * no cursor, at ~1150px on the long edge, which is roughly what the vision API
 * downsamples to anyway. Works on a saved doc's pages, with no Notebook around.
 */
export function pageImage(page: Stroke[], sizeKey: PageSizeKey): string | null {
  if (!page.length || typeof document === 'undefined') return null;
  const { w, h } = PAGE_SIZES[sizeKey];
  const scale = 1150 / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const st of page) {
    // force dark ink and a legible weight whatever pen was used
    strokePath(ctx, { ...st, color: '#101010', width: Math.max(st.width, 1.2) });
  }
  return c.toDataURL('image/png');
}
