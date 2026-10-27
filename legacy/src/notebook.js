// Pages of vector strokes stored in millimetres of page space, so the canvas
// preview and the exported PDF come from exactly the same data.
//
// Rendering is two-layer: `base` holds the background plus every committed
// stroke and is only rebuilt when the page changes; each frame just blits it
// and draws the in-progress stroke on top. That keeps cost flat as the page
// fills up.

export const PAGE_SIZES = {
  a4:      { w: 210,   h: 297,   fmt: 'a4',     orient: 'portrait'  },
  a4l:     { w: 297,   h: 210,   fmt: 'a4',     orient: 'landscape' },
  letter:  { w: 215.9, h: 279.4, fmt: 'letter', orient: 'portrait'  },
  letterl: { w: 279.4, h: 215.9, fmt: 'letter', orient: 'landscape' },
};

const PX_PER_MM = 4; // preview resolution

export class Notebook {
  constructor(canvas, { sizeKey = 'a4' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.baseCtx = this.base.getContext('2d');
    this.pages = [[]];
    this.index = 0;
    this.ruled = true;
    this.current = null;
    this.setSize(sizeKey);
  }

  get size() { return PAGE_SIZES[this.sizeKey]; }
  get page() { return this.pages[this.index]; }

  setSize(key) {
    this.sizeKey = key;
    const { w, h } = this.size;
    for (const c of [this.canvas, this.base]) {
      c.width = Math.round(w * PX_PER_MM);
      c.height = Math.round(h * PX_PER_MM);
    }
    this.invalidate();
  }

  addPage() { this.pages.push([]); this.index = this.pages.length - 1; this.current = null; this.invalidate(); }
  go(delta) {
    const i = Math.min(this.pages.length - 1, Math.max(0, this.index + delta));
    if (i === this.index) return;
    this.index = i; this.current = null; this.invalidate();
  }
  clearPage() { this.pages[this.index] = []; this.current = null; this.invalidate(); }
  undo() { this.page.pop(); this.current = null; this.invalidate(); }

  /** Start a stroke. p is page-normalized (0..1, 0..1). */
  begin(p, { color, width }) {
    this.current = { color, width, pts: [this.toMm(p)] };
    this.page.push(this.current);
    this.render();
  }

  extend(p) {
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
  }

  toMm(p) {
    const { w, h } = this.size;
    return { x: clamp(p.x, 0, 1) * w, y: clamp(p.y, 0, 1) * h };
  }

  /** Rebuild the committed layer, then repaint. */
  invalidate() {
    const ctx = this.baseCtx;
    const { w, h } = this.size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.base.width, this.base.height);
    ctx.scale(PX_PER_MM, PX_PER_MM);

    if (this.ruled) {
      ctx.lineWidth = 0.15; ctx.strokeStyle = '#cfd8ea';
      for (let y = 20; y < h - 10; y += 8) {
        ctx.beginPath(); ctx.moveTo(15, y); ctx.lineTo(w - 10, y); ctx.stroke();
      }
      ctx.strokeStyle = '#f0b8b8';
      ctx.beginPath(); ctx.moveTo(20, 10); ctx.lineTo(20, h - 10); ctx.stroke();
    }

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const st of this.page) if (st !== this.current) strokePath(ctx, st);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.render();
  }

  render(cursor = null) {
    const { ctx } = this;
    const { w, h } = this.size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.save();
    ctx.scale(PX_PER_MM, PX_PER_MM);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (this.current) strokePath(ctx, this.current);
    if (cursor) {
      ctx.beginPath();
      ctx.arc(clamp(cursor.x, 0, 1) * w, clamp(cursor.y, 0, 1) * h, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(91,140,255,.75)'; ctx.fill();
    }
    ctx.restore();
  }

  stats() {
    return { pages: this.pages.length, strokes: this.pages.reduce((n, p) => n + p.length, 0) };
  }
}

function strokePath(ctx, st) {
  const p = st.pts;
  if (p.length < 2) return;
  ctx.strokeStyle = st.color;
  ctx.lineWidth = st.width;
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  // quadratic through midpoints => smooth ink without extra samples
  for (let i = 1; i < p.length - 1; i++) {
    const m = { x: (p[i].x + p[i + 1].x) / 2, y: (p[i].y + p[i + 1].y) / 2 };
    ctx.quadraticCurveTo(p[i].x, p[i].y, m.x, m.y);
  }
  ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
  ctx.stroke();
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
